"""Sum per-month glm_grid.npz files (one per Actions job, downloaded to data/parts/<name>/glm_grid.npz) into
data/glm_grid.npz. Every array in the npz is additive except the histogram edges, which must match."""
import sys
from pathlib import Path
import numpy as np
import config as C

parts = sorted((C.DATA / "parts").glob("*/glm_grid.npz"))
if not parts:
    sys.exit("no parts under data/parts/*/glm_grid.npz")
acc = None
for p in parts:
    g = dict(np.load(p))
    if acc is None:
        acc = g
        continue
    for k in ("utc", "local", "daily", "files", "energy_hist", "area_hist"):
        acc[k] = acc[k] + g[k]
    assert np.allclose(acc["energy_edges"], g["energy_edges"]) and np.allclose(acc["area_edges"], g["area_edges"])
np.savez_compressed(C.GRID_NPZ, **acc)
print(len(parts), "parts merged:", int((acc["files"] > 0).sum()), "days,", int(acc["utc"].sum()), "flashes ->", C.GRID_NPZ)
