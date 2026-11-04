"""Write web/data/cmip6.json: per-cell annual anomalies (tenths of a degree C, vs each model's own
1995 to 2014 mean) on the 10 degree grid, for six models and three scenarios. Cell index = ilat*nlon + ilon."""
import json
import numpy as np
from config import *
from common import *

WEB.joinpath("data").mkdir(parents=True, exist_ok=True)
lat, lon, hist, ssp = load()
b = base(hist)
nlat, nlon = len(lat), len(lon)


def cells(a):  # (yr, lat, lon) K anomaly -> [cell][yr] ints in tenths of a degree C
    t = np.rint(a * 10).astype(int).reshape(a.shape[0], -1).T
    return t.tolist()


out = {
    "baseline": [BASE_START, BASE_END],
    "histYears": [HIST_START, HIST_END], "sspYears": [SSP_START, SSP_END],
    "lat": lat.tolist(), "lon": lon.tolist(), "cellDeg": CELL_DEG, "unit": "tenths of a degree C",
    "models": MODELS, "scenarios": [{"id": s, "label": SCENARIO_LABEL[s]} for s in SCENARIOS],
    "hist": {m: cells(hist[m] - b[m]) for m in MODELS},
    "ssp": {s: {m: cells(ssp[s][m] - b[m]) for m in MODELS} for s in SCENARIOS},
}
max_change = max(float(np.mean([ssp["ssp585"][m][-20:].mean(0) - b[m] for m in MODELS], axis=0).max()), 0)
out["colorMaxC"] = int(np.ceil(max_change))
p = WEB / "data" / "cmip6.json"
p.write_text(json.dumps(out, separators=(",", ":")))
print(p, p.stat().st_size // 1024, "KB; colorMaxC", out["colorMaxC"])
