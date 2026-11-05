"""Render the three text cards (team, dataset, question) as 1920x1080 PNGs in the EDA visual style."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from config import *

INK, MUTED, ACCENT = "#1d2733", "#5a6675", "#b8431a"
CARDS = ROOT / "cards"
CARDS.mkdir(exist_ok=True)
TITLE = TEAM["title"]
QUESTION = "At what hour of the day does lightning peak over land and over the ocean, and where does it strike at night?"
F = json.loads((EDA / "facts.json").read_text())


def card(name, lines):
    """lines: list of (text, size, weight, color, y)."""
    fig = plt.figure(figsize=(16, 9), dpi=120, facecolor="white")
    for text, size, weight, color, y in lines:
        fig.text(0.06, y, text, fontsize=size, fontweight=weight, color=color, va="top", wrap=True, linespacing=1.35)
    fig.savefig(CARDS / name); plt.close(fig)


card("card_team.png", [
    ("DSC 106 Project 3: Interactive Visualization, Checkpoint", 24, "normal", MUTED, 0.90),
    (f"Team: {TEAM['teamName']}", 46, "bold", INK, 0.78),
    ("     ".join(TEAM["members"]), 36, "normal", INK, 0.60),
    (f"Title: {TITLE}", 26, "normal", ACCENT, 0.42),
])
card("card_dataset.png", [
    ("Dataset: GOES-16 GLM", 44, "bold", INK, 0.90),
    ("Geostationary Lightning Mapper on NOAA's GOES-16 (GOES-East), Level 2 flash product, NOAA Open Data on AWS", 24, "normal", MUTED, 0.80),
    ("Aspects we use", 28, "bold", ACCENT, 0.70),
    ("- Variables: flash_lat, flash_lon, file time stamp, flash_energy, flash_area", 23, "normal", INK, 0.62),
    (f"- Period: 1 June to 31 August 2024, {F['days_sampled']} days, one 20 s file every 5 minutes (1 in {F['sample_stride']})", 23, "normal", INK, 0.52),
    (f"- Processing: {F['flashes']:,} flashes binned to a 1 degree grid by hour, in UTC and in local solar time", 23, "normal", INK, 0.42),
    ("- Local solar hour = UTC hour + longitude / 15, so 4 PM means mid afternoon everywhere", 23, "normal", INK, 0.32),
    ("Streamed from S3 with boto3 and netCDF4, nothing kept but the counts. About 1.3 MB of JSON feeds the D3 prototype.", 18, "normal", MUTED, 0.14),
])
card("card_question.png", [
    ("Our title", 24, "normal", MUTED, 0.92),
    (TITLE, 38, "bold", INK, 0.85),
    ("The question we are answering", 24, "bold", ACCENT, 0.52),
    (QUESTION, 30, "normal", INK, 0.44),
])
print("cards done")
