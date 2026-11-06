"""Six-year climatology -> metadata and exact summed-count binaries for the D3 page.

glm_counts_sums.bin: little-endian uint16, layout [season][clock][cell][hour] with seasons in config.SEASONS order
(DJF, MAM, JJA, SON), clocks (utc, local), cell = i * NLON + j (i from LAT0 northward, j from LON0 eastward), 24 hours.
Counts are six-year sums; divide by metadata.counts_divisor for the mean per year.
One part per season and clock allows the initial view to load independently."""
import gzip
import json
import numpy as np
from matplotlib.path import Path as MPath
import config as C


def land_mask():
    """1 for cells where at least config.LAND_FRACTION_MIN of a LAND_SUBSAMPLE x LAND_SUBSAMPLE point grid lies on land
    (Natural Earth 110m, vendor/land-110m.json via data/land.geojson), plus the LAKE_CELLS overrides."""
    gj = json.loads((C.DATA / "land.geojson").read_text())
    polys = []
    for feat in gj["features"]:
        geom = feat["geometry"]
        polys += geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    k = C.LAND_SUBSAMPLE
    offsets = (np.arange(k) + 0.5) / k * C.CELL_DEG
    lat_edge = C.LAT0 + np.arange(C.NLAT) * C.CELL_DEG
    lon_edge = C.LON0 + np.arange(C.NLON) * C.CELL_DEG
    hits = np.zeros(C.NLAT * C.NLON)
    for da in offsets:
        for dl in offsets:
            LON, LAT = np.meshgrid(lon_edge + dl, lat_edge + da)
            pts = np.column_stack([LON.ravel(), LAT.ravel()])
            inside = np.zeros(len(pts), bool)
            for poly in polys:
                hit = MPath(np.array(poly[0])).contains_points(pts)
                for hole in poly[1:]:
                    hit &= ~MPath(np.array(hole)).contains_points(pts)
                inside |= hit
            hits += inside
    mask = hits / (k * k) >= C.LAND_FRACTION_MIN
    for la, lo in C.LAKE_CELLS:
        mask[int((la - C.LAT0) // C.CELL_DEG) * C.NLON + int((lo - C.LON0) // C.CELL_DEG)] = True
    return mask.astype(int)


def drop_artifacts(g):
    """Zero the cells in config.ARTIFACT_CELLS in both clocks (arrays [12, NLAT, NLON, 24]). Returns cells removed."""
    removed = 0
    for lat, lon in C.ARTIFACT_CELLS:
        i, j = int((lat - C.LAT0) // C.CELL_DEG), int((lon - C.LON0) // C.CELL_DEG)
        hours = g["utc"][:, i, j].sum(0)
        if hours.sum() < C.ARTIFACT_MIN_TOTAL:  # the false-event source was not active that year: ordinary weather, keep
            continue
        assert hours.min() >= C.ARTIFACT_MIN_FLAT * hours.mean(), f"artifact cell {lat},{lon} is no longer flat: {hours.tolist()}"
        g["utc"][:, i, j] = 0; g["local"][:, i, j] = 0; removed += 1
    return removed


def load_year(year):
    """One year's per-month grid with artifacts dropped."""
    g = dict(np.load(C.YEARS_DIR / f"glm_grid_{year}.npz"))
    drop_artifacts(g)
    return g


def load_grid():
    """The six-year climatology (mean per-month counts). Artifact cells were dropped per year in merge_grids.py before
    averaging; the count of affected cells travels in the npz. Returns (npz dict, cells removed)."""
    g = dict(np.load(C.CLIMO_NPZ))
    return g, int(g["artifact_cells_removed"])


def year_curves():
    """Per-year land and ocean shares by local solar hour (percent of that year's total), for the stability chart."""
    land = land_mask().reshape(C.NLAT, C.NLON).astype(bool)
    out = {}
    for y in C.YEARS:
        g = load_year(y)
        loc = g["local"].sum(0)
        l, o = loc[land].sum(0), loc[~land].sum(0)
        out[str(y)] = {"land": (100 * l / l.sum()).round(2).tolist(), "ocean": (100 * o / o.sum()).round(2).tolist(),
                       "flashes": int(g["utc"].sum()), "days": int((g["files"] > 0).sum()),
                       "land_peak": int(l.argmax()), "ocean_peak": int(o.argmax())}
    return out


def season_grids(g):
    """{season: {"utc": [NLAT,NLON,24], "local": [...]}} summed over that season's months."""
    out = {}
    for name, months in C.SEASONS.items():
        idx = [m - 1 for m in months]
        out[name] = {"utc": g["utc"][idx].sum(0), "local": g["local"][idx].sum(0)}
    return out


def main():
    g, removed = load_grid()
    days_done = int((g["files"] > 0).sum())
    days_by_season = {name: int(sum(g["files"][k] > 0 for k in range(len(g["files"])) if month_of_index(k) in months)) for name, months in C.SEASONS.items()}
    seasons = season_grids(g)
    stack = np.stack([np.stack([seasons[s][clock] for clock in C.COUNTS_CLOCKS]) for s in C.SEASONS])
    divisor = len(C.YEARS)
    stack *= divisor  # keep exact integer sums rather than rounding each season's mean
    assert np.allclose(stack, np.rint(stack), rtol=0, atol=1e-7), "six-year sums must be integral"
    stack = np.rint(stack)
    assert stack.min() >= 0 and stack.max() <= np.iinfo(np.uint16).max, "six-year cell-hour sums overflow uint16"
    stack = stack.astype("<u2")
    assert np.array_equal(stack[:, 0].sum(-1), stack[:, 1].sum(-1)), "UTC and local cell totals must agree"
    (C.WEB / "data").mkdir(parents=True, exist_ok=True)
    raw = stack.tobytes()
    (C.WEB / "data" / C.COUNTS_FILENAME).write_bytes(raw)
    (C.WEB / "data" / (C.COUNTS_FILENAME + ".gz")).write_bytes(gzip.compress(raw, 9, mtime=0))
    parts = {}
    for k, season in enumerate(C.SEASONS):
        parts[season] = {}
        for ci, clock in enumerate(C.COUNTS_CLOCKS):
            filename = f"{C.COUNTS_FILENAME.removesuffix('.bin')}_{season.lower()}_{clock}.bin"
            part = stack[k, ci].tobytes()
            (C.WEB / "data" / filename).write_bytes(part)
            (C.WEB / "data" / (filename + ".gz")).write_bytes(gzip.compress(part, 9, mtime=0))
            parts[season][clock] = {"file": "web/data/" + filename, "gzip": "web/data/" + filename + ".gz", "bytes": len(part)}
    lat = C.LAT0 + (np.arange(C.NLAT) + 0.5) * C.CELL_DEG
    area = C.KM2_PER_DEG2_EQUATOR * C.CELL_DEG ** 2 * np.cos(np.deg2rad(lat))
    density = stack.astype(float) / divisor * (1e4 / area)[None, None, :, None, None]
    density_domains = {"season": float(density.max()), "YEAR": float(density.sum(0).max())}
    meta = {
        "title": C.TEAM["title"],
        "source": "GOES-16 GLM L2 LCFA flashes, NOAA Open Data on AWS (s3://noaa-goes16/GLM-L2-LCFA/)",
        "years": C.YEARS, "period": f"{C.YEARS[0]} to {C.YEARS[-1]}", "days_sampled": days_done, "days_by_season": days_by_season,
        "counts_are": "mean flashes per year in the sample (six-year average)",
        "year_flashes": {str(y): int(f) for y, f in zip(g["years"].tolist(), g["year_flashes"].tolist())},
        "year_curves": year_curves(),
        "sample": f"1 in {C.FILE_STRIDE} available 20 s files",
        "files": int(g["files"].sum()), "flashes": float(stack[:, 0].sum(dtype=np.uint64) / divisor),
        "flashes_by_season": {s: float(stack[k, 0].sum(dtype=np.uint64) / divisor) for k, s in enumerate(C.SEASONS)},
        "seasons": list(C.SEASONS), "season_months": {s: list(m) for s, m in C.SEASONS.items()}, "default_season": C.DEFAULT_SEASON,
        "clocks": list(C.COUNTS_CLOCKS), "counts_file": "web/data/" + C.COUNTS_FILENAME, "counts_gzip": "web/data/" + C.COUNTS_FILENAME + ".gz", "counts_dtype": "uint16 little-endian",
        "counts_divisor": divisor, "counts_parts": parts, "density_domains": density_domains,
        "km2_per_deg2_equator": C.KM2_PER_DEG2_EQUATOR,
        "lat0": C.LAT0, "lon0": C.LON0, "cell": C.CELL_DEG, "nlat": C.NLAT, "nlon": C.NLON, "hours": C.HOURS,
        "local_time": "local solar hour = UTC hour + longitude / 15",
        "artifact_cells_removed": removed,
    }
    p = C.WEB / "data" / "glm.json"
    p.write_text(json.dumps({"meta": meta, "land": land_mask().tolist()}, separators=(",", ":")))
    b = (C.WEB / "data" / (C.COUNTS_FILENAME + ".gz")).stat().st_size / 1e6
    print(p, f"{p.stat().st_size / 1e6:.2f} MB json, {b:.2f} MB bin.gz, days {days_done}, flashes {meta['flashes']}, by season {meta['flashes_by_season']}")


def month_of_index(k):
    """Month of the k-th entry of the concatenated per-year day arrays (365 or 366 days per year, in C.YEARS order)."""
    from datetime import datetime, timedelta
    import calendar
    for y in C.YEARS:
        n = 366 if calendar.isleap(y) else 365
        if k < n:
            return (datetime(y, 1, 1) + timedelta(days=k)).month
        k -= n
    raise IndexError(k)


if __name__ == "__main__":
    main()
