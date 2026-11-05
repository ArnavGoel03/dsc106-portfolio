"""data/glm_grid.npz -> web/data/glm.json for the D3 prototype, plus a land mask for the cells.
Layout: flat arrays, index (i * NLON + j) * 24 + hour, i from LAT0 northward, j from LON0 eastward."""
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
    """glm_grid.npz with the cells in config.ARTIFACT_CELLS zeroed in both clocks. Returns (npz dict, cells removed)."""
    g = dict(np.load(C.GRID_NPZ))
    removed = 0
    for lat, lon in C.ARTIFACT_CELLS:
        i, j = int((lat - C.LAT0) // C.CELL_DEG), int((lon - C.LON0) // C.CELL_DEG)
        hours = g["utc"][i, j]
        if hours.sum() == 0:
            continue
        assert hours.min() >= C.ARTIFACT_MIN_FLAT * hours.mean(), f"artifact cell {lat},{lon} is no longer flat: {hours.tolist()}"
        g["utc"][i, j] = 0; g["local"][i, j] = 0; removed += 1
    return g, removed


def main():
    g, removed = load_grid()
    days_done = int((g["files"] > 0).sum())
    out = {
        "meta": {
            "title": C.TEAM["title"],
            "source": "GOES-16 GLM L2 LCFA flashes, NOAA Open Data on AWS (s3://noaa-goes16/GLM-L2-LCFA/)",
            "year": C.YEAR, "period": "1 June to 31 August 2024", "days_sampled": days_done,
            "sample": f"one 20 s file every {C.FILE_STRIDE * 20 // 60} minutes (1 in {C.FILE_STRIDE})",
            "files": int(g["files"].sum()), "flashes": int(g["utc"].sum()),
            "lat0": C.LAT0, "lon0": C.LON0, "cell": C.CELL_DEG, "nlat": C.NLAT, "nlon": C.NLON, "hours": C.HOURS,
            "local_time": "local solar hour = UTC hour + longitude / 15",
            "artifact_cells_removed": removed,
        },
        "utc": g["utc"].ravel().tolist(),
        "local": g["local"].ravel().tolist(),
        "land": land_mask().tolist(),
    }
    (C.WEB / "data").mkdir(parents=True, exist_ok=True)
    p = C.WEB / "data" / "glm.json"
    p.write_text(json.dumps(out, separators=(",", ":")))
    print(p, f"{p.stat().st_size / 1e6:.2f} MB", "days", days_done, "flashes", out["meta"]["flashes"])


if __name__ == "__main__":
    main()
