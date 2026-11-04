"""Stream CMIP6 monthly near-surface air temperature (tas) from the public Google Cloud
zarr store, reduce each store to an annual mean on a 10 degree grid, and save it to data/.
Mirrors the course example notebook: catalog CSV -> gcsfs mapper -> xr.open_zarr."""
import sys
import numpy as np
import pandas as pd
import xarray as xr
import gcsfs
from config import *

DATA.mkdir(exist_ok=True)
LAT_EDGES = np.arange(-90, 91, CELL_DEG)
LON_EDGES = np.arange(0, 361, CELL_DEG)


def catalog():
    if not CATALOG.exists():
        pd.read_csv(CATALOG_URL).to_csv(CATALOG, index=False)
    return pd.read_csv(CATALOG)


def reduce(ds, y0, y1):
    da = ds[VARIABLE]
    da = da.sortby("time")  # some stores ship a non-monotonic time index
    da = da.sel(time=slice(f"{y0}-01", f"{y1}-12"))
    da = da.assign_coords(lon=da.lon % 360).sortby("lon")
    ann = da.groupby("time.year").mean("time")
    # Longitude cells are equal-area at a given latitude, so a plain mean is right there. Latitude rows are not:
    # a row's area scales with cos(lat), so rows inside each 10 degree band are weighted by cos(lat).
    # (Right-closed bins drop only the lat = -90 row, which has weight 0.)
    w = np.cos(np.deg2rad(da.lat))
    ann = ann.groupby_bins("lon", LON_EDGES).mean("lon")
    ann = (ann * w).groupby_bins("lat", LAT_EDGES).sum("lat") / w.groupby_bins("lat", LAT_EDGES).sum("lat")
    ann = ann.rename(lat_bins="lat", lon_bins="lon")
    ann["lat"] = LAT_EDGES[:-1] + CELL_DEG / 2
    ann["lon"] = LON_EDGES[:-1] + CELL_DEG / 2
    return ann.astype("float32").load()


def main():
    df = catalog()
    gcs = gcsfs.GCSFileSystem(token="anon")
    only = sys.argv[1:]
    for model in MODELS:
        if only and model not in only:
            continue
        for exp, (y0, y1) in [(HIST, (HIST_START, HIST_END))] + [(s, (SSP_START, SSP_END)) for s in SCENARIOS]:
            out = DATA / f"grid{CELL_DEG}_{model}_{exp}.nc"
            if out.exists():
                continue
            q = df.query("source_id==@model & experiment_id==@exp & member_id==@MEMBER & table_id==@TABLE & variable_id==@VARIABLE")
            if q.empty:
                raise SystemExit(f"missing store: {model} {exp}")
            ds = xr.open_zarr(gcs.get_mapper(q.iloc[0].zstore), consolidated=True)
            red = reduce(ds, y0, y1)
            red.attrs.update(source_id=model, experiment_id=exp, zstore=q.iloc[0].zstore, units="K")
            red.to_netcdf(out)
            print("saved", out.name, red.shape, flush=True)


if __name__ == "__main__":
    main()
