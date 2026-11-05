"""Load the reduced 10 degree annual fields and derive anomalies. Shared by EDA and web export."""
import numpy as np
import xarray as xr
from config import *

HIST_YEARS = np.arange(HIST_START, HIST_END + 1)
SSP_YEARS = np.arange(SSP_START, SSP_END + 1)
ALL_YEARS = np.concatenate([HIST_YEARS, SSP_YEARS])


def load():
    """Return lat, lon, abs_hist[m] (yr,lat,lon) in K, abs_ssp[s][m] in K."""
    hist, ssp = {}, {s: {} for s in SCENARIOS}
    lat = lon = None
    for m in MODELS:
        d = xr.open_dataarray(DATA / f"grid{CELL_DEG}_{m}_{HIST}.nc")
        lat, lon = d.lat.values, d.lon.values
        hist[m] = d.values
        for s in SCENARIOS:
            ssp[s][m] = xr.open_dataarray(DATA / f"grid{CELL_DEG}_{m}_{s}.nc").values
    return lat, lon, hist, ssp


def base(hist):
    """1995-2014 mean per model, per cell (K)."""
    i0, i1 = BASE_START - HIST_START, BASE_END - HIST_START + 1
    return {m: hist[m][i0:i1].mean(0) for m in hist}


def anomalies(hist, ssp):
    """Full-period anomaly series vs each model's own 1995-2014 mean. -> anom[s][m] (151,lat,lon)."""
    b = base(hist)
    return {s: {m: np.concatenate([hist[m], ssp[s][m]]) - b[m] for m in MODELS} for s in SCENARIOS}


def wmean(field, lat):
    """Area-weighted (cos latitude) mean over the last two axes."""
    w = np.cos(np.deg2rad(lat))[:, None] * np.ones(field.shape[-1])
    return (field * w).sum((-2, -1)) / w.sum()


def window(arr, y0, y1):
    return arr[(y0 - HIST_START):(y1 - HIST_START + 1)].mean(0)
