"""Build the persuasive charts for DSC 106 Project 2 (alternative proposition).

Proposition: "Climate-related disasters are becoming more frequent."
Source: IMF Climate Change Indicators Dashboard, "Climate-related Disasters Frequency"
(EM-DAT counts, 1980-2022), https://climatedata.imf.org/

Run:  uv run --with matplotlib --with pandas --with requests --with openpyxl python make_charts.py
The CSV is cached under data/ so reruns are offline and reproducible.
"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).parent
DATA = HERE / "data"
# ArcGIS Hub item behind https://climatedata.imf.org/datasets/b13b69ee0dde43a99c811f592af4e821
DATASET_ID = "b13b69ee0dde43a99c811f592af4e821"
CSV_URL = f"https://hub.arcgis.com/api/v3/datasets/{DATASET_ID}_0/downloads/data?format=csv&spatialRefId=4326&where=1%3D1"
CSV = DATA / "climate_disasters_frequency.csv"

YEARS = (1980, 2022)
PERIODS = [(y, min(y + 4, YEARS[1])) for y in range(1980, 2021, 5)]  # 1980-84 ... 2020-22
TYPES = ["Flood", "Storm", "Drought", "Extreme temperature", "Landslide", "Wildfire"]

BLUE = "#2f6690"  # primary series colour, shared by both charts
SIENNA = "#a0522d"  # secondary colour (decline / contrast), not an alarm red
TYPE_COLOURS = ["#173f5f", "#2f6690", "#5689ad", "#81a9c5", "#a9c5d8", "#cfdde8"]
INK = "#222222"
MUTED = "#6b6b6b"
GRID = "#e6e6e6"
SOURCE = (
    "Source: IMF Climate Change Indicators Dashboard, Climate-related Disasters Frequency "
    "(EM-DAT, CRED / UCLouvain), 1980 to 2022."
)

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": "#999999",
        "axes.labelcolor": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.titleweight": "bold",
        "axes.titlesize": 12.5,
        "axes.titlelocation": "left",
    }
)


def fetch() -> Path:
    if not CSV.exists():
        DATA.mkdir(exist_ok=True)
        r = requests.get(CSV_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
        r.raise_for_status()
        CSV.write_bytes(r.content)
    return CSV


def load() -> pd.DataFrame:
    """Wide IMF table (one column per year) pivoted to long: one row per country, type, year."""
    wide = pd.read_csv(fetch(), encoding="utf-8-sig")
    year_cols = [c for c in wide.columns if c.startswith("F") and c[1:].isdigit()]
    long = wide.melt(
        id_vars=["ISO3", "Country", "Indicator"], value_vars=year_cols, var_name="year", value_name="count"
    )
    long["year"] = long["year"].str[1:].astype(int)
    long["type"] = long["Indicator"].str.split(": ").str[-1]
    # EM-DAT lists events; an empty cell means no recorded disaster, so blanks are zeros.
    long["count"] = long["count"].fillna(0).astype(int)
    return long[["ISO3", "Country", "type", "year", "count"]]


def period_label(a: int, b: int) -> str:
    return f"{a}-{str(b)[2:]}"


def summarise(long: pd.DataFrame) -> dict:
    """Every number used by the charts and the write-up."""
    tot = long[long.type == "TOTAL"]
    by_type = long[long.type != "TOTAL"]
    annual = tot.groupby("year")["count"].sum()
    per_country_year = tot.pivot(index="ISO3", columns="year", values="count")

    # Transformation 1 (FOR, left): mean recorded disasters per year within each five-year period, by type.
    type_year = by_type.pivot_table(index="year", columns="type", values="count", aggfunc="sum")
    period_means = {}
    for a, b in PERIODS:
        period_means[period_label(a, b)] = type_year.loc[a:b].mean()
    period_means = pd.DataFrame(period_means).T[TYPES]
    period_total = pd.Series({period_label(a, b): annual.loc[a:b].mean() for a, b in PERIODS})
    # Transformation 2 (FOR, right): the same period means restricted to a fixed panel, the countries with at
    # least one record in every five-year period, so newly reporting countries cannot drive the rise.
    hit_per_year = (per_country_year > 0).sum()
    period_sum = pd.DataFrame({period_label(a, b): per_country_year.loc[:, a:b].sum(axis=1) for a, b in PERIODS})
    panel = period_sum[(period_sum > 0).all(axis=1)].index
    period_panel = pd.Series({period_label(a, b): per_country_year.loc[panel, a:b].sum().mean() for a, b in PERIODS})

    # Transformation 3 (AGAINST, left): ordinary least squares trend over the annual totals since 2000.
    recent = annual.loc[2000:]
    slope, intercept = np.polyfit(recent.index, recent.values, 1)
    # Transformation 4 (AGAINST, right): per-country change between decade totals, 2010s minus 2000s.
    d2000 = per_country_year.loc[:, 2000:2009].sum(axis=1)
    d2010 = per_country_year.loc[:, 2010:2019].sum(axis=1)
    change = (d2010 - d2000).astype(int)
    names = tot.drop_duplicates("ISO3").set_index("ISO3")["Country"]

    decade_sum = {f"{a}s": int(annual.loc[a : a + 9].sum()) for a in (1980, 1990, 2000, 2010)}
    return {
        "annual": annual,
        "period_means": period_means,
        "period_total": period_total,
        "period_panel": period_panel,
        "hit_per_year": hit_per_year,
        "recent": recent,
        "slope": float(slope),
        "intercept": float(intercept),
        "change": change,
        "names": names,
        "stats": {
            "countries": int(per_country_year.shape[0]),
            "type_rows_sum_equals_total": bool(int(by_type["count"].sum()) == int(tot["count"].sum())),
            "total_events": int(tot["count"].sum()),
            "decade_sum": decade_sum,
            "period_total": period_total.round(1).to_dict(),
            "period_panel": period_panel.round(1).to_dict(),
            "panel_size": int(len(panel)),
            "panel_share_of_events": round(float(per_country_year.loc[panel].sum().sum() / per_country_year.sum().sum()), 3),
            "panel_ratio_last_first": round(float(period_panel.iloc[-1] / period_panel.iloc[0]), 2),
            "panel_members": sorted(names[k] for k in panel),
            "first_period_total": round(float(period_total.iloc[0]), 1),
            "last_period_total": round(float(period_total.iloc[-1]), 1),
            "ratio_last_first": round(float(period_total.iloc[-1] / period_total.iloc[0]), 2),
            "peak_period": period_total.idxmax(),
            "peak_year": int(annual.idxmax()),
            "peak_count": int(annual.max()),
            "mean_2000_22": round(float(recent.mean()), 1),
            "slope_2000_22": round(float(slope), 2),
            "slope_1980_22": round(float(np.polyfit(annual.index, annual.values, 1)[0]), 2),
            "mean_2000s": round(float(annual.loc[2000:2009].mean()), 1),
            "mean_2010s": round(float(annual.loc[2010:2019].mean()), 1),
            "mean_2020_22": round(float(annual.loc[2020:2022].mean()), 1),
            "n_down": int((change < 0).sum()),
            "n_up": int((change > 0).sum()),
            "n_same": int((change == 0).sum()),
            "change_bins": {},
            "n_both_zero": int(((d2000 == 0) & (d2010 == 0)).sum()),
            "biggest_falls": {names[k]: int(v) for k, v in change.sort_values().head(5).items()},
            "biggest_rises": {names[k]: int(v) for k, v in change.sort_values().tail(5)[::-1].items()},
            "hit_1980": int(hit_per_year.loc[1980]),
            "hit_2010": int(hit_per_year.loc[2010]),
            "hit_2022": int(hit_per_year.loc[2022]),
            "annual_2000_22": {int(k): int(v) for k, v in recent.items()},
            "zero_rows_1980s": int((per_country_year.loc[:, 1980:1989].sum(axis=1) == 0).sum()),
            "zero_rows_2010s": int((per_country_year.loc[:, 2010:2019].sum(axis=1) == 0).sum()),
            "type_share_2020_22": (period_means.iloc[-1] / period_means.iloc[-1].sum()).round(3).to_dict(),
            "flood_first_last": [round(float(period_means["Flood"].iloc[0]), 1), round(float(period_means["Flood"].iloc[-1]), 1)],
        },
    }


def footer(fig):
    fig.text(0.01, 0.012, SOURCE, fontsize=8.5, color=MUTED, ha="left")


def headline(fig, title: str, sub: str):
    fig.text(0.01, 0.965, title, fontsize=13.5, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(0.01, 0.915, sub, fontsize=10.5, color=MUTED, ha="left", va="top")


def chart_for(s: dict) -> None:
    pm, pt, pp = s["period_means"], s["period_total"], s["period_panel"]
    labels = list(pm.index)
    x = np.arange(len(labels))

    fig = plt.figure(figsize=(13, 6.6), dpi=200)
    headline(
        fig,
        "Recorded climate-related disasters are three times as frequent as in the early 1980s",
        "Recorded climate-related disasters worldwide, averaged within five-year periods, 1980 to 2022",
    )
    gs = fig.add_gridspec(1, 2, width_ratios=[1.35, 1], left=0.06, right=0.985, top=0.84, bottom=0.14, wspace=0.22)

    ax = fig.add_subplot(gs[0, 0])
    bottom = np.zeros(len(labels))
    for t, c in zip(TYPES, TYPE_COLOURS):
        ax.bar(x, pm[t].values, bottom=bottom, color=c, width=0.72, label=t, edgecolor="white", linewidth=0.6)
        bottom += pm[t].values
    for i, v in enumerate(pt.values):
        ax.text(i, v + 6, f"{v:.0f}", ha="center", va="bottom", fontsize=9.5, color=INK)
    ax.set_xticks(x, labels, rotation=0, fontsize=9)
    ax.set_ylim(0, 440)
    ax.set_ylabel("Recorded disasters per year")
    ax.set_title("Disasters recorded per year, by type")
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.legend(loc="upper left", frameon=False, fontsize=9, ncol=2, title=None)
    ax.annotate(
        f"{s['stats']['ratio_last_first']:.1f}x the 1980-84 rate",
        (len(labels) - 1.4, pt.iloc[-1] - 40),
        xytext=(-150, 60),
        textcoords="offset points",
        fontsize=10,
        color=INK,
        arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.8, shrinkB=4),
    )

    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(x, pp.values, color=BLUE, lw=2.4, marker="o", ms=5)
    ax2.fill_between(x, 0, pp.values, color=BLUE, alpha=0.08)
    ax2.set_xticks(x, labels, fontsize=8.5, rotation=30, ha="right")
    ax2.set_ylim(0, 440)
    ax2.set_ylabel("Recorded disasters per year")
    ax2.set_title(f"The {s['stats']['panel_size']} countries with at least one record in every period", fontsize=10.5)
    ax2.yaxis.grid(True, color=GRID)
    ax2.set_axisbelow(True)
    ax2.annotate(f"{pp.iloc[0]:.0f}", (0, pp.iloc[0]), xytext=(0, 9), textcoords="offset points", ha="center", fontsize=9.5, color=INK)
    ax2.annotate(
        f"{pp.iloc[-1]:.0f}, {s['stats']['panel_ratio_last_first']:.1f}x the 1980-84 rate",
        (len(labels) - 1, pp.iloc[-1]),
        xytext=(-150, 34),
        textcoords="offset points",
        fontsize=10,
        color=INK,
        arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.8, shrinkB=4),
    )
    footer(fig)
    fig.savefig(HERE / "for_more_frequent.png", facecolor="white")
    plt.close(fig)


def chart_against(s: dict) -> None:
    rec, slope, b0, change = s["recent"], s["slope"], s["intercept"], s["change"]

    fig = plt.figure(figsize=(13, 6.6), dpi=200)
    headline(
        fig,
        "Since 2000, the number of climate-related disasters recorded each year has held steady",
        "Recorded climate-related disasters worldwide, 2000 to 2022, and the change in each country between the 2000s and the 2010s",
    )
    gs = fig.add_gridspec(1, 2, width_ratios=[1.3, 1], left=0.06, right=0.985, top=0.84, bottom=0.14, wspace=0.22)

    ax = fig.add_subplot(gs[0, 0])
    yrs = rec.index.values
    ax.plot(yrs, rec.values, color=BLUE, lw=2, marker="o", ms=4.5)
    ax.plot(yrs, b0 + slope * yrs, color=SIENNA, lw=1.6, ls="--")
    ax.set_ylim(0, 500)
    ax.set_xlim(1999, 2023.5)
    ax.set_xticks(range(2000, 2023, 2))
    ax.tick_params(axis="x", labelsize=9)
    ax.set_ylabel("Recorded disasters per year")
    ax.set_title("Disasters recorded per year, with the linear trend")
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.annotate(f"{int(rec.loc[2000])} in 2000", (2000, rec.loc[2000]), xytext=(6, 14), textcoords="offset points", fontsize=9.5, color=INK)
    ax.annotate(f"{int(rec.loc[2022])} in 2022", (2022, rec.loc[2022]), xytext=(2, -26), textcoords="offset points", ha="right", fontsize=9.5, color=INK)
    ax.annotate(
        f"Trend: {slope:+.1f} per year",
        (2014, b0 + slope * 2014),
        xytext=(-30, -58),
        textcoords="offset points",
        fontsize=10,
        color=SIENNA,
        arrowprops=dict(arrowstyle="-", color=SIENNA, lw=0.8, shrinkB=3),
    )

    ax2 = fig.add_subplot(gs[0, 1])
    edges = [-100, -10, -5, -1, 0, 4, 9, 100]
    cats = ["10 or more\nfewer", "5 to 9\nfewer", "1 to 4\nfewer", "no\nchange", "1 to 4\nmore", "5 to 9\nmore", "10 or more\nmore"]
    counts = pd.cut(change, bins=[e + 0.5 for e in edges], labels=cats).value_counts().reindex(cats)
    colours = [SIENNA] * 3 + ["#bbbbbb"] + [BLUE] * 3
    xs = np.arange(len(cats))
    ax2.bar(xs, counts.values, color=colours, width=0.72)
    for i, v in enumerate(counts.values):
        label, colour = (str(int(v)), MUTED) if i == 3 else (str(int(v)), INK)
        ax2.text(i, v + 1.2, label, ha="center", va="bottom", fontsize=9.5, color=colour,
                 bbox=dict(fc="white", ec="none", pad=1.5))
    ax2.set_xticks(xs, cats, fontsize=8.5)
    ax2.set_xlabel("Change in a country's recorded disasters, 2010s minus 2000s")
    ax2.set_ylabel("Countries and territories")
    ax2.set_title("Change in each country's decade total")
    ax2.yaxis.grid(True, color=GRID)
    ax2.set_axisbelow(True)
    ax2.set_ylim(0, 70)
    down, up, same = int((change < 0).sum()), int((change > 0).sum()), int((change == 0).sum())
    ax2.text(0, 64, f"{down} recorded fewer", color=SIENNA, fontsize=10.5, fontweight="bold", ha="left")
    ax2.text(len(cats) - 1, 64, f"{up} recorded more", color=BLUE, fontsize=10.5, fontweight="bold", ha="right")
    footer(fig)
    fig.savefig(HERE / "against_held_steady.png", facecolor="white")
    plt.close(fig)


def chart_context(s: dict) -> None:
    """Honest reference figure for the reflection: the whole annual series and reporting coverage."""
    annual, hit = s["annual"], s["hit_per_year"]
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(13, 4.8), dpi=200)
    fig.subplots_adjust(left=0.06, right=0.985, top=0.86, bottom=0.17, wspace=0.22)
    fig.text(0.01, 0.965, "The whole series: annual counts and the number of countries with any record, 1980 to 2022", fontsize=14, fontweight="bold", color=INK, va="top")
    ax.plot(annual.index, annual.values, color=BLUE, lw=1.8)
    ax.axvspan(2000, 2022, color=GRID, alpha=0.6, lw=0)
    ax.set_ylim(0, 450)
    ax.set_title("Recorded disasters per year (shaded: 2000 to 2022)")
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax2.plot(hit.index, hit.values, color=SIENNA, lw=1.8)
    ax2.set_ylim(0, 160)
    ax2.set_title("Countries with at least one record in the year")
    ax2.yaxis.grid(True, color=GRID)
    ax2.set_axisbelow(True)
    footer(fig)
    fig.savefig(HERE / "context_full_series.png", facecolor="white")
    plt.close(fig)


DECISIONS = {
    "FOR": [
        ("Five-year period means instead of annual counts", -1.0),
        ("A final period of only three years (2020-22)", -1.0),
        ("Stacked bars, every type, axis from zero", 1.5),
        ("A fixed panel of consistent reporters", -1.0),
        ("Title: three times as frequent", -0.5),
    ],
    "AGAINST": [
        ("Window opens in 2000, not 1980", -1.5),
        ("A fitted trend line read as the story", -0.5),
        ("Axis from zero to 500 on the annual panel", 1.0),
        ("Every country weighted equally", -1.5),
        ("Title: held steady", -0.5),
    ],
}


def chart_scores() -> None:
    rows = [(side, t, v) for side, items in DECISIONS.items() for t, v in items]
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=200)
    fig.subplots_adjust(left=0.42, right=0.97, top=0.86, bottom=0.12)
    y = np.arange(len(rows))[::-1]
    for yi, (side, t, v) in zip(y, rows):
        ax.barh(yi, v, color=BLUE if v > 0 else SIENNA, height=0.62)
        ax.text(v + (0.06 if v > 0 else -0.06), yi, f"{v:+.1f}", va="center", ha="left" if v > 0 else "right", fontsize=9.5, color=INK)
    ax.set_yticks(y, [f"{side}: {t}" for side, t, v in rows], fontsize=9.5)
    ax.axvline(0, color=INK, lw=0.9)
    ax.set_xlim(-2.3, 2.3)
    ax.set_xticks([-2, -1, 0, 1, 2], ["-2 fully deceptive", "-1", "0", "+1", "+2 fully earnest"], fontsize=9)
    ax.xaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.set_title("Our ten design decisions on the assignment's scale")
    fig.savefig(HERE / "decision_scores.png", facecolor="white")
    plt.close(fig)


def main():
    long = load()
    s = summarise(long)
    chart_for(s)
    chart_against(s)
    chart_context(s)
    chart_scores()
    (HERE / "data" / "stats.json").write_text(json.dumps(s["stats"], indent=2))
    print(json.dumps(s["stats"], indent=2))


if __name__ == "__main__":
    main()
