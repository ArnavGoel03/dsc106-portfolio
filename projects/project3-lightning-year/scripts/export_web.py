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


def load_grid():
    """glm_grid.npz with the cells in config.ARTIFACT_CELLS zeroed in both clocks. Returns (npz dict, cells removed).
    Arrays are per month: [12, NLAT, NLON, 24]."""
    g = dict(np.load(C.GRID_NPZ))
    removed = 0
    for lat, lon in C.ARTIFACT_CELLS:
        i, j = int((lat - C.LAT0) // C.CELL_DEG), int((lon - C.LON0) // C.CELL_DEG)
        hours = g["utc"][:, i, j].sum(0)
        if hours.sum() == 0:
            continue
        assert hours.min() >= C.ARTIFACT_MIN_FLAT * hours.mean(), f"artifact cell {lat},{lon} is no longer flat: {hours.tolist()}"
        g["utc"][:, i, j] = 0; g["local"][:, i, j] = 0; removed += 1
    return g, removed


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
    assert stack.max() < 65535, f"cell-hour count {stack.max()} overflows uint16"
    (C.WEB / "data").mkdir(parents=True, exist_ok=True)
    raw = stack.astype("<u2").tobytes()
    (C.WEB / "data" / "glm_counts.bin").write_bytes(raw)
    import gzip
    (C.WEB / "data" / "glm_counts.bin.gz").write_bytes(gzip.compress(raw, 9))  # the page fetches this and inflates it; .bin is the fallback
    meta = {
        "title": C.TEAM["title"],
        "source": "GOES-16 GLM L2 LCFA flashes, NOAA Open Data on AWS (s3://noaa-goes16/GLM-L2-LCFA/)",
        "year": C.YEAR, "period": "1 January to 31 December 2024", "days_sampled": days_done, "days_by_season": days_by_season,
        "sample": f"one 20 s file every {C.FILE_STRIDE * 20 // 60} minutes (1 in {C.FILE_STRIDE})",
        "files": int(g["files"].sum()), "flashes": int(g["utc"].sum()),
        "flashes_by_season": {s: int(seasons[s]["utc"].sum()) for s in C.SEASONS},
        "seasons": list(C.SEASONS), "season_months": {s: list(m) for s, m in C.SEASONS.items()}, "default_season": C.DEFAULT_SEASON,
        "clocks": ["utc", "local"], "counts_file": "web/data/glm_counts.bin", "counts_gzip": "web/data/glm_counts.bin.gz", "counts_dtype": "uint16 little-endian",
        "lat0": C.LAT0, "lon0": C.LON0, "cell": C.CELL_DEG, "nlat": C.NLAT, "nlon": C.NLON, "hours": C.HOURS,
        "local_time": "local solar hour = UTC hour + longitude / 15",
        "artifact_cells_removed": removed,
    }
    p = C.WEB / "data" / "glm.json"
    p.write_text(json.dumps({"meta": meta, "land": land_mask().tolist()}, separators=(",", ":")))
    b = (C.WEB / "data" / "glm_counts.bin.gz").stat().st_size / 1e6
    print(p, f"{p.stat().st_size / 1e6:.2f} MB json, {b:.2f} MB bin.gz, days {days_done}, flashes {meta['flashes']}, by season {meta['flashes_by_season']}")


def month_of_index(k):
    from datetime import datetime, timedelta
    return (datetime(C.YEAR, 1, 1) + timedelta(days=k + C.DAY_START - 1)).month


if __name__ == "__main__":
    main()
