"""data/glm_grid.npz (per month) -> web/data/glm.json (meta + land mask) and web/data/glm_counts.bin for the D3 page.

glm_counts.bin: little-endian uint16, layout [season][clock][cell][hour] with seasons in config.SEASONS order
(DJF, MAM, JJA, SON), clocks (utc, local), cell = i * NLON + j (i from LAT0 northward, j from LON0 eastward), 24 hours.
A season's cell-hour never reaches 65,535 in a 1-in-15 sample (summer max is about 4,000); the exporter asserts it.
The page sums seasons for the whole-year view, so no year grid is stored."""
import json
import numpy as np
from matplotlib.path import Path as MPath
import config as C


def land_mask():
    """1 for cells whose centre lies on land (Natural Earth 110m, vendor/land-110m.json via data/land.geojson)."""
    gj = json.loads((C.DATA / "land.geojson").read_text())
    lat = C.LAT0 + (np.arange(C.NLAT) + 0.5) * C.CELL_DEG
    lon = C.LON0 + (np.arange(C.NLON) + 0.5) * C.CELL_DEG
    LON, LAT = np.meshgrid(lon, lat)
    pts = np.column_stack([LON.ravel(), LAT.ravel()])
    mask = np.zeros(len(pts), bool)
    for feat in gj["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            inside = MPath(np.array(poly[0])).contains_points(pts)
            for hole in poly[1:]:
                inside &= ~MPath(np.array(hole)).contains_points(pts)
            mask |= inside
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
    stack = np.stack([np.stack([seasons[s]["utc"], seasons[s]["local"]]) for s in C.SEASONS])  # [season, clock, lat, lon, hour]
    stack = np.rint(stack)  # mean flashes per year in the sample, rounded to whole flashes for the uint16 file
    assert stack.max() < 65535, f"cell-hour count {stack.max()} overflows uint16"
    (C.WEB / "data").mkdir(parents=True, exist_ok=True)
    (C.WEB / "data" / "glm_counts.bin").write_bytes(stack.astype("<u2").tobytes())
    meta = {
        "title": C.TEAM["title"],
        "source": "GOES-16 GLM L2 LCFA flashes, NOAA Open Data on AWS (s3://noaa-goes16/GLM-L2-LCFA/)",
        "years": C.YEARS, "period": f"{C.YEARS[0]} to {C.YEARS[-1]}, six complete years", "days_sampled": days_done, "days_by_season": days_by_season,
        "counts_are": "mean flashes per year in the sample (six-year average)",
        "year_flashes": {str(y): int(f) for y, f in zip(g["years"].tolist(), g["year_flashes"].tolist())},
        "year_curves": year_curves(),
        "sample": f"one 20 s file every {C.FILE_STRIDE * 20 // 60} minutes (1 in {C.FILE_STRIDE})",
        "files": int(g["files"].sum()), "flashes": int(round(g["utc"].sum())),
        "flashes_by_season": {s: int(round(seasons[s]["utc"].sum())) for s in C.SEASONS},
        "seasons": list(C.SEASONS), "season_months": {s: list(m) for s, m in C.SEASONS.items()}, "default_season": C.DEFAULT_SEASON,
        "clocks": ["utc", "local"], "counts_file": "web/data/glm_counts.bin", "counts_dtype": "uint16 little-endian",
        "lat0": C.LAT0, "lon0": C.LON0, "cell": C.CELL_DEG, "nlat": C.NLAT, "nlon": C.NLON, "hours": C.HOURS,
        "local_time": "local solar hour = UTC hour + longitude / 15",
        "artifact_cells_removed": removed,
    }
    p = C.WEB / "data" / "glm.json"
    p.write_text(json.dumps({"meta": meta, "land": land_mask().tolist()}, separators=(",", ":")))
    b = (C.WEB / "data" / "glm_counts.bin").stat().st_size / 1e6
    print(p, f"{p.stat().st_size / 1e6:.2f} MB json, {b:.2f} MB bin, days {days_done}, flashes {meta['flashes']}, by season {meta['flashes_by_season']}")


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
