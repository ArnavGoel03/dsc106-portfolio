"""Single source of truth for the checkpoint pipeline (data, EDA, web export)."""
from pathlib import Path

import json

ROOT = Path(__file__).resolve().parent.parent
TEAM = json.loads((ROOT / "team.json").read_text())  # teamName (one-line change), title, members: the only place they live
TEAM_PLACEHOLDER = "[TEAM NAME]"  # make_video.sh refuses a final build while team.json still holds this
DATA = ROOT / "data"
EDA = ROOT / "eda"
WEB = ROOT / "web"

CATALOG_URL = "https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv"
CATALOG = DATA / "catalog.csv"

# Six CMIP6 models that publish monthly tas (Amon) for all four experiments, member r1i1p1f1.
# Chosen to span the model range (CanESM5 ends the historical run warmest globally; IPSL-CM6A-LR and INM-CM5-0 are among the coolest).
MODELS = ["CanESM5", "IPSL-CM6A-LR", "MPI-ESM1-2-LR", "MRI-ESM2-0", "GFDL-ESM4", "INM-CM5-0"]
MEMBER = "r1i1p1f1"
TABLE = "Amon"
VARIABLE = "tas"
HIST = "historical"
SCENARIOS = ["ssp126", "ssp245", "ssp585"]
SCENARIO_LABEL = {
    "ssp126": "SSP1-2.6 (low emissions)",
    "ssp245": "SSP2-4.5 (middle)",
    "ssp585": "SSP5-8.5 (very high emissions)",
}
HIST_START, HIST_END = 1950, 2014
SSP_START, SSP_END = 2015, 2100
BASE_START, BASE_END = 1995, 2014  # reference period for every anomaly
CELL_DEG = 10  # grid cell size of the processed fields
