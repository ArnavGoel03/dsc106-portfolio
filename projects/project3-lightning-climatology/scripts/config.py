"""Single source of truth for the lightning climatology pipeline (data, EDA, web export)."""
from pathlib import Path
import json
import os

ROOT = Path(__file__).resolve().parent.parent
TEAM = json.loads((ROOT / "team.json").read_text())  # teamName, title, members: the only place they live
TEAM_PLACEHOLDER = "[TEAM NAME]"  # make_video.sh refuses a final build while team.json still holds this
DATA = ROOT / "data"
EDA = ROOT / "eda"
WEB = ROOT / "web"

# GOES-16 Geostationary Lightning Mapper, Level 2 flashes (LCFA = Lightning Cluster-Filter Algorithm), public S3 bucket.
BUCKET = "noaa-goes16"
PRODUCT = "GLM-L2-LCFA"
YEARS = [2019, 2020, 2021, 2022, 2023, 2024]  # every complete year of GOES-16 GLM after the 2018 calibration changes
YEAR = int(os.environ.get("GLM_YEAR", YEARS[-1]))  # the year fetch_glm.py works on; one Actions job per (year, month)
import calendar
DAY_START, DAY_END = 1, 366 if calendar.isleap(YEAR) else 365
SEASONS = {"DJF": (12, 1, 2), "MAM": (3, 4, 5), "JJA": (6, 7, 8), "SON": (9, 10, 11)}  # months per season; DJF = Jan, Feb and Dec of 2024
DEFAULT_SEASON = "JJA"  # the page opens on summer, the same window as the 92-day version
FILE_STRIDE = 15  # GLM writes one 20 s file every 20 s (180 per hour); keep every 15th = one file per 5 min, a 1-in-15 sample
# Grid over the GLM field of view, 1 degree cells. Edges beyond about 54 deg latitude or far from nadir (75.2 W) see little.
LAT0, LAT1 = -55, 55
LON0, LON1 = -135, -15
CELL_DEG = 1
NLAT = (LAT1 - LAT0) // CELL_DEG
NLON = (LON1 - LON0) // CELL_DEG
HOURS = 24

GRID_NPZ = Path(os.environ.get("GLM_GRID", DATA / f"glm_grid_{YEAR}.npz"))  # one year's counts per month; the climatology mean lives in CLIMO_NPZ
CLIMO_NPZ = DATA / "glm_climatology.npz"  # mean over YEARS, written by merge_grids.py, read by eda.py and export_web.py
YEARS_DIR = DATA / "years"  # per-year merged grids, glm_grid_<year>.npz
PROGRESS = DATA / "fetch_progress.json"  # per-day resume log so an interrupted run continues

# Reference places for the EDA and the prototype's jump-to buttons (lat, lon, label).
PLACES = {
    "florida": (28.0, -81.5, "Central Florida"),
    "plains": (41.0, -98.5, "Great Plains (Nebraska)"),
    "maracaibo": (9.5, -71.5, "Lake Maracaibo, Venezuela"),
    "gulf": (26.0, -90.0, "Gulf of Mexico (open water)"),
    "amazon": (-5.0, -62.0, "Amazon basin"),
}

# GLM artifact cells, dropped from every count. Evidence (5-day sample, 2026-11-05): the cell centred on 7.5S 96.5W in
# the open Pacific held 9,263 flashes, four times the next busiest cell, spread almost evenly over all 24 hours (147 to
# 556 per hour); no storm does that, and GLM is known to report false events at fixed spots. load_grid() checks the
# flatness still holds (quietest hour at least ARTIFACT_MIN_FLAT of the mean) so this list cannot silently hide weather.
ARTIFACT_CELLS = [(-7.5, -96.5)]  # (lat, lon) cell centres
ARTIFACT_MIN_FLAT = 0.25

# Inland water that Natural Earth 110m draws as sea. Lake Maracaibo (9.5N 71.5W) is the world's lightning hotspot and
# sits inside Venezuela, so its cell counts as land; left as "ocean" it would inflate the ocean night curve.
LAKE_CELLS = [(9.5, -71.5)]  # (lat, lon) cell centres
