"""Merge the Actions artifacts into per-year grids and a six-year climatology.

Input:  data/parts/glm-grid-<year>-<month>/glm_grid_<year>.npz (one per Actions job; per-month arrays, only that
        month filled).
Output: data/years/glm_grid_<year>.npz  (months summed within the year, same layout as a single-year fetch)
        data/glm_climatology.npz        (utc/local: MEAN over years of the per-month counts, as float64, so the page
                                         shows "flashes per year in the sample"; daily/files summed; per-year totals kept)
"""
import re, sys
from collections import defaultdict
import numpy as np
import config as C
from export_web import drop_artifacts

parts = sorted((C.DATA / "parts").glob("glm-grid-*-*/glm_grid_*.npz"))
if not parts:
    sys.exit("no parts under data/parts/glm-grid-<year>-<month>/")
by_year = defaultdict(list)
for p in parts:
    by_year[int(re.search(r"glm_grid_(\d{4})", p.name).group(1))].append(p)

C.YEARS_DIR.mkdir(exist_ok=True)
years = {}
removed_by_year = {}
for y, files in sorted(by_year.items()):
    acc = None
    for p in files:
        g = dict(np.load(p))
        if acc is None:
            acc = g; continue
        for k in ("utc", "local", "daily", "files", "energy_hist", "area_hist"):
            acc[k] = acc[k] + g[k]
    np.savez_compressed(C.YEARS_DIR / f"glm_grid_{y}.npz", **acc)  # raw, artifacts kept; load_year() drops them
    removed_by_year[y] = drop_artifacts(acc)
    years[y] = acc
    print(y, f"{len(files)} months, {int((acc['files'] > 0).sum())} days, {int(acc['utc'].sum()):,} flashes")

missing = [y for y in C.YEARS if y not in years]
assert not missing, f"years missing from parts: {missing}"
n = len(C.YEARS)
climo = {
    "utc": sum(years[y]["utc"].astype(np.float64) for y in C.YEARS) / n,
    "local": sum(years[y]["local"].astype(np.float64) for y in C.YEARS) / n,
    "daily": np.concatenate([years[y]["daily"] for y in C.YEARS]),
    "files": np.concatenate([years[y]["files"] for y in C.YEARS]),
    "energy_hist": sum(years[y]["energy_hist"] for y in C.YEARS), "area_hist": sum(years[y]["area_hist"] for y in C.YEARS),
    "energy_edges": years[C.YEARS[0]]["energy_edges"], "area_edges": years[C.YEARS[0]]["area_edges"],
    "years": np.array(C.YEARS), "year_flashes": np.array([int(years[y]["utc"].sum()) for y in C.YEARS]),
    "year_days": np.array([int((years[y]["files"] > 0).sum()) for y in C.YEARS]),
    "artifact_cells_removed": max(removed_by_year.values()),
    "artifact_years": np.array([y for y in C.YEARS if removed_by_year[y]]),
}
np.savez_compressed(C.CLIMO_NPZ, **climo)
print(f"climatology: {n} years, mean {climo['utc'].sum():,.0f} good flashes per year; artifact cell active in {climo['artifact_years'].tolist()} -> {C.CLIMO_NPZ}")
