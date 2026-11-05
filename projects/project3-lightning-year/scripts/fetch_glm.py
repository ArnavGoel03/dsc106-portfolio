"""Stream a 1-in-15 sample of GOES-16 GLM flash files for the all of 2024 and bin every flash into a
1 degree x hour-of-day grid, twice: by UTC hour and by local solar hour (UTC + longitude/15).
Nothing is kept on disk but the counts (data/glm_grid.npz) and a per-day progress log for resume.

Per-day outputs stacked in the npz, kept per calendar month so seasons can be split later:
  utc   int32 [12, NLAT, NLON, 24]   flashes by UTC hour, month index 0 = January
  local int32 [12, NLAT, NLON, 24]   flashes by local solar hour
  daily int32 [ndays]            flashes per sampled day (coverage check)
  files int32 [ndays]            files read per day (180*24/15 = 288 when complete)
Only flashes with flash_quality_flag == 0 (good) are counted.
  energy_hist int64 [40]         log10(flash_energy J) histogram, bins -15.5..-11.5 by 0.1
  area_hist int64 [40]           log10(flash_area m2) histogram, bins 7..11 by 0.1
"""
import io, json, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3
import netCDF4
import numpy as np
from botocore import UNSIGNED
from botocore.config import Config

import config as C

s3 = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED, max_pool_connections=32))
E_EDGES = np.arange(-15.5, -11.49, 0.1)
A_EDGES = np.arange(7.0, 11.01, 0.1)


def list_hour(doy, hour):
    prefix = f"{C.PRODUCT}/{C.YEAR}/{doy:03d}/{hour:02d}/"
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=C.BUCKET, Prefix=prefix):
        keys += [o["Key"] for o in page.get("Contents", [])]
    keys.sort()
    return keys[::C.FILE_STRIDE]


def download(key):
    """Bytes of one 20 s file, or None after three failed attempts. Runs in threads; parsing does not (HDF5 is not thread safe)."""
    for attempt in range(3):
        try:
            return key, s3.get_object(Bucket=C.BUCKET, Key=key)["Body"].read()
        except Exception as e:  # noqa: BLE001  (network hiccup: retry, then skip the file)
            if attempt == 2:
                print("skip", key, e, file=sys.stderr)
                return key, None
            time.sleep(1 + attempt)


def parse(key, body):
    """Return (lat, lon, utc_hour_float, energy, area) arrays for one file. Main thread only."""
    with netCDF4.Dataset("mem", memory=body) as ds:
        good = np.asarray(ds["flash_quality_flag"][:]) == 0  # 0 = good flash; drop degraded or out-of-range flashes
        lat = ds["flash_lat"][:].astype(np.float64)[good]
        lon = ds["flash_lon"][:].astype(np.float64)[good]
        # Hour from the file start stamp (sYYYYDDDHHMMSSs in the key); 20 s resolution is far below the 1 h bin.
        stamp = key.split("_s")[1][:13]  # YYYYDDDHHMMSS
        t = datetime.strptime(stamp, "%Y%j%H%M%S")
        utc_h = t.hour + t.minute / 60 + t.second / 3600
        energy = np.asarray(ds["flash_energy"][:], dtype=np.float64)[good]
        area = np.asarray(ds["flash_area"][:], dtype=np.float64)[good]
    return lat, lon, utc_h, energy, area


def bin_day(doy, workers=48):
    utc = np.zeros((C.NLAT, C.NLON, C.HOURS), np.int32)
    loc = np.zeros_like(utc)
    e_hist = np.zeros(len(E_EDGES) - 1, np.int64)
    a_hist = np.zeros(len(A_EDGES) - 1, np.int64)
    with ThreadPoolExecutor(workers) as ex:
        keys = [k for ks in ex.map(lambda h: list_hour(doy, h), range(24)) for k in ks]
        for key, body in ex.map(download, keys):
            if body is None:
                continue
            lat, lon, utc_h, energy, area = parse(key, body)
            if lat.size == 0:
                continue
            i = np.floor((lat - C.LAT0) / C.CELL_DEG).astype(int)
            j = np.floor((lon - C.LON0) / C.CELL_DEG).astype(int)
            ok = (i >= 0) & (i < C.NLAT) & (j >= 0) & (j < C.NLON)
            i, j, lon = i[ok], j[ok], lon[ok]
            hu = np.full(i.shape, int(utc_h) % 24)
            hl = np.floor((utc_h + lon / 15.0) % 24).astype(int)
            np.add.at(utc, (i, j, hu), 1)
            np.add.at(loc, (i, j, hl), 1)
            with np.errstate(divide="ignore"):
                e_hist += np.histogram(np.log10(energy[ok][energy[ok] > 0]), E_EDGES)[0]
                a_hist += np.histogram(np.log10(area[ok][area[ok] > 0]), A_EDGES)[0]
    return utc, loc, len(keys), e_hist, a_hist


def main():
    C.DATA.mkdir(exist_ok=True)
    # Interleaved order (every third day first) so an interrupted run still covers the whole season evenly.
    all_days = list(range(C.DAY_START, C.DAY_END + 1))
    days = all_days[0::3] + all_days[1::3] + all_days[2::3]
    if len(sys.argv) > 1:  # smoke test: python fetch_glm.py 170
        days = [int(a) for a in sys.argv[1:]]
    prog = json.loads(C.PROGRESS.read_text()) if C.PROGRESS.exists() else {}
    acc = dict(np.load(C.GRID_NPZ)) if C.GRID_NPZ.exists() else None
    if acc is None:
        acc = {"utc": np.zeros((12, C.NLAT, C.NLON, C.HOURS), np.int32), "local": np.zeros((12, C.NLAT, C.NLON, C.HOURS), np.int32),
               "daily": np.zeros(len(range(C.DAY_START, C.DAY_END + 1)), np.int32), "files": np.zeros_like(np.zeros(len(range(C.DAY_START, C.DAY_END + 1)), np.int32)),
               "energy_hist": np.zeros(len(E_EDGES) - 1, np.int64), "area_hist": np.zeros(len(A_EDGES) - 1, np.int64),
               "energy_edges": E_EDGES, "area_edges": A_EDGES}
    for doy in days:
        if str(doy) in prog:
            continue
        t0 = time.time()
        utc, loc, nfiles, eh, ah = bin_day(doy)
        k = doy - C.DAY_START
        month = (datetime(C.YEAR, 1, 1) + timedelta(days=doy - 1)).month - 1
        acc["utc"][month] += utc; acc["local"][month] += loc; acc["energy_hist"] += eh; acc["area_hist"] += ah
        acc["daily"][k] = utc.sum(); acc["files"][k] = nfiles
        np.savez_compressed(C.GRID_NPZ, **acc)
        prog[str(doy)] = {"flashes": int(utc.sum()), "files": nfiles, "seconds": round(time.time() - t0, 1)}
        C.PROGRESS.write_text(json.dumps(prog, indent=1))
        date = (datetime(C.YEAR, 1, 1) + timedelta(days=doy - 1)).date()
        print(f"{date} doy {doy}: {nfiles} files, {utc.sum():,} flashes, {time.time() - t0:.0f} s", flush=True)
    print("total flashes", int(acc["utc"].sum()), "days done", len(prog))


if __name__ == "__main__":
    main()
