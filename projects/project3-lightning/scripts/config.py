"""Single source of truth for the lightning checkpoint pipeline (data, EDA, web export)."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
TEAM = json.loads((ROOT / "team.json").read_text())  # teamName, title, members: the only place they live
TEAM_PLACEHOLDER = "[TEAM NAME]"  # make_video.sh refuses a final build while team.json still holds this
DATA = ROOT / "data"
EDA = ROOT / "eda"
WEB = ROOT / "web"

# GOES-16 Geostationary Lightning Mapper, Level 2 flashes (LCFA = Lightning Cluster-Filter Algorithm), public S3 bucket.
BUCKET = "noaa-goes16"
PRODUCT = "GLM-L2-LCFA"
YEAR = 2024
DAY_START, DAY_END = 153, 244  # day of year 153 = 1 June 2024, 244 = 31 Aug 2024 (leap year): the northern summer storm season
FILE_STRIDE = 15  # GLM writes one 20 s file every 20 s (180 per hour); keep every 15th = one file per 5 min, a 1-in-15 sample
# Grid over the GLM field of view, 1 degree cells. Edges beyond about 54 deg latitude or far from nadir (75.2 W) see little.
LAT0, LAT1 = -55, 55
LON0, LON1 = -135, -15
CELL_DEG = 1
NLAT = (LAT1 - LAT0) // CELL_DEG
NLON = (LON1 - LON0) // CELL_DEG
HOURS = 24

GRID_NPZ = DATA / "glm_grid.npz"      # binned counts, written by fetch_glm.py, read by eda.py and export_web.py
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
# A cell is land when at least this fraction of a 4x4 grid of sample points inside it falls on a Natural Earth land
# polygon. A single centre test called the Maracaibo gulf cell (10.5N 71.5W) and coastal Cuba (20.5N 77.5W) sea.
LAND_FRACTION_MIN = 0.5
LAND_SUBSAMPLE = 4
# Hour windows used by every graph and fact, so "afternoon" and "night" mean one thing everywhere.
AFTERNOON_HOURS = list(range(13, 19))                    # 1 PM to 6:59 PM
NIGHT_HOURS = list(range(0, 6)) + list(range(21, 24))    # 9 PM to 5:59 AM

