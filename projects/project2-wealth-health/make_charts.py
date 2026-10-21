"""Build the two Project 2 charts (FOR and AGAINST) from World Bank WDI data.

Run from this folder:
    uv run --with matplotlib --with pandas --with requests python make_charts.py

API responses are cached under data/ so reruns are offline and reproducible.
"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
API = "https://api.worldbank.org/v2"
TIMEOUT_S = 30

YEAR = 2023  # latest year with near-complete coverage for both indicators
RICH_THRESHOLD = 30_000  # US$, where the AGAINST chart starts
MIN_POP = 1_000_000  # AGAINST chart drops territories and microstates below this

INDICATORS = {
    "gdp": "NY.GDP.PCAP.CD",  # GDP per capita, current US$
    "lexp": "SP.DYN.LE00.IN",  # life expectancy at birth, years
    "pop": "SP.POP.TOTL",  # total population
}
SOURCE = (
    f"Source: World Bank, World Development Indicators ({INDICATORS['gdp']}, "
    f"{INDICATORS['lexp']}), {YEAR}. Regional and income aggregates excluded."
)

INK = "#222831"
MUTED = "#6b7280"
GRID = "#e5e7eb"
QUINTILE_COLORS = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"]
POINT = "#7a8699"
HIGHLIGHT = "#c0392b"
FIT = "#111827"

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)


def fetch(name: str, path: str) -> list:
    """Return the records of a cached WDI endpoint, downloading once."""
    cache = DATA / f"{name}.json"
    if not cache.exists():
        DATA.mkdir(exist_ok=True)
        sep = "&" if "?" in path else "?"
        r = requests.get(f"{API}/{path}{sep}format=json&per_page=20000", timeout=TIMEOUT_S)
        r.raise_for_status()
        cache.write_text(r.text)
    return json.loads(cache.read_text())[1]


def load() -> pd.DataFrame:
    countries = pd.DataFrame(
        {"iso": c["id"], "name": c["name"]}
        for c in fetch("countries", "country")
        if c["region"]["id"] != "NA"  # aggregates have no region
    )
    df = countries
    for col, code in INDICATORS.items():
        rows = fetch(col, f"country/all/indicator/{code}")
        ind = pd.DataFrame(
            {"iso": r["countryiso3code"], "year": int(r["date"]), col: r["value"]} for r in rows
        )
        df = df.merge(ind, on="iso") if col == "gdp" else df.merge(ind, on=["iso", "year"])
    return df[df.year == YEAR].dropna(subset=["gdp", "lexp"]).reset_index(drop=True)


def money(x: float) -> str:
    return f"${x / 1000:,.0f}K" if x >= 1000 else f"${x:,.0f}"


def chart_for(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["q"] = pd.qcut(df.gdp, 5, labels=False)
    groups = [df.loc[df.q == q, "lexp"].to_numpy() for q in range(5)]
    medians = [float(np.median(g)) for g in groups]
    names = ["Poorest\nfifth", "Second\nfifth", "Middle\nfifth", "Fourth\nfifth", "Richest\nfifth"]
    ranges = [f"{money(df.gdp[df.q == q].min())} to {money(df.gdp[df.q == q].max())}" for q in range(5)]
    labels = [f"{n}\n{r}".replace("$", r"\$") for n, r in zip(names, ranges)]  # escape mathtext

    fig, ax = plt.subplots(figsize=(10, 6.6), dpi=200)
    bp = ax.boxplot(
        groups,
        positions=range(5),
        widths=0.58,
        patch_artist=True,
        showfliers=False,
        medianprops={"color": "white", "linewidth": 2.2},
        whiskerprops={"color": MUTED, "linewidth": 1.2},
        capprops={"color": MUTED, "linewidth": 1.2},
        boxprops={"linewidth": 0},
    )
    for patch, color in zip(bp["boxes"], QUINTILE_COLORS):
        patch.set_facecolor(color)

    ax.plot(range(5), medians, color=INK, lw=1.4, ls=(0, (3, 2)), marker="o", ms=5, zorder=5)
    for i, m in enumerate(medians):
        ax.annotate(
            f"{m:.1f} yrs", (i + 0.31, m), xytext=(4, 0), textcoords="offset points",
            ha="left", va="center", fontsize=10.5, fontweight="bold", color=INK, zorder=6,
        )
    for i in range(1, 5):
        gain = medians[i] - medians[i - 1]
        ax.text(i - 0.5, 50.9, f"+{gain:.1f}", ha="center", fontsize=10, color=QUINTILE_COLORS[4])

    gap = medians[4] - medians[0]
    ax.annotate(
        "", xy=(4.75, medians[4]), xytext=(4.75, medians[0]),
        arrowprops={"arrowstyle": "<->", "color": HIGHLIGHT, "lw": 1.6},
    )
    ax.text(4.82, (medians[0] + medians[4]) / 2, f"+{gap:.1f}\nyears", color=HIGHLIGHT,
            fontsize=12, fontweight="bold", va="center")
    ax.text(0.12, 52.6, "Gain in median life expectancy from one fifth to the next:",
            fontsize=9.5, color=MUTED)

    ax.set_xticks(range(5), labels, fontsize=9.5)
    ax.set_xlim(-0.5, 5.3)
    ax.set_ylim(50, 90)
    ax.set_ylabel("Life expectancy at birth (years)")
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.set_xlabel("Countries grouped into five equal-sized groups by GDP per capita (current US$)",
                  labelpad=8)

    fig.suptitle("The richer the country, the longer its people live",
                 x=0.07, y=0.975, ha="left", fontsize=17, fontweight="bold", color=INK)
    fig.text(0.07, 0.905,
             f"Life expectancy at birth by GDP per capita quintile, {len(df)} countries, {YEAR}. "
             "Each step up the income ladder adds years of life.",
             fontsize=10.5, color=MUTED)
    fig.text(0.07, 0.015, SOURCE + "\nBoxes span the middle 50% of countries; whiskers 1.5 x IQR.",
             fontsize=8, color=MUTED)
    fig.subplots_adjust(left=0.07, right=0.97, top=0.86, bottom=0.19)
    fig.savefig(HERE / "for.png")
    plt.close(fig)
    return {"n": len(df), "medians": medians, "ranges": ranges, "gap": gap}


# Labels placed by hand so none collide: (dx, dy) offset in points and whether
# a thin leader line is needed because a neighbouring dot sits close by.
AGAINST_LABELS = {
    "United States": (8, -4, False),
    "Switzerland": (-4, 10, False),
    "Ireland": (6, -12, False),
    "Norway": (-10, 9, False),
    "Singapore": (-30, 11, False),
    "Japan": (2, 22, True),
    "Spain": (-30, 22, True),
    "Hong Kong SAR, China": (-30, 10, False),
    "Estonia": (-14, -24, True),
    "Saudi Arabia": (8, -16, True),
    "Qatar": (-6, -15, False),
    "Germany": (-6, -15, False),
}
RICH_GROUPS = 4  # equal-count GDP groups for the median step line (32 countries -> 8 each)
STEP = "#1f5f99"
STEP_LABEL_POS = {0: (31.3, 82.85, "bottom")}  # ($K, years, va): first label sits above its bar, clear of dots


def chart_against(df: pd.DataFrame) -> dict:
    rich = df[(df.gdp > RICH_THRESHOLD) & (df["pop"] >= MIN_POP)].copy()
    x, y = rich.gdp / 1000, rich.lexp
    slope, intercept = np.polyfit(x, y, 1)
    r = float(np.corrcoef(x, y)[0, 1])

    fig, ax = plt.subplots(figsize=(10, 6.6), dpi=200)
    is_us = rich.name == "United States"
    ax.scatter(x[~is_us], y[~is_us], s=46, color=POINT, alpha=0.85, edgecolor="white", lw=0.8, zorder=3)
    ax.scatter(x[is_us], y[is_us], s=60, color=HIGHLIGHT, edgecolor="white", lw=0.8, zorder=4)

    xs = np.linspace(x.min() - 2, x.max() + 2, 50)
    ax.plot(xs, slope * xs + intercept, color=MUTED, lw=1.2, ls=(0, (4, 3)), zorder=2)
    ax.text(108, 80.4,
            f"Dashed trend: +{slope * 10:.1f} years per extra $10,000 (r = {r:.2f})",
            ha="right", fontsize=9.5, color=MUTED)

    # Computed field: median life expectancy within equal-count GDP groups.
    rich["grp"] = pd.qcut(rich.gdp, RICH_GROUPS, labels=False)
    steps = rich.groupby("grp").agg(lo=("gdp", "min"), hi=("gdp", "max"), med=("lexp", "median"))
    for g, st in steps.iterrows():
        ax.plot([st.lo / 1000, st.hi / 1000], [st.med, st.med], color=STEP, lw=4,
                solid_capstyle="butt", alpha=0.9, zorder=2.5)
        lx, ly, va = STEP_LABEL_POS.get(g, ((st.lo + st.hi) / 2000, st.med - 0.55, "top"))
        ax.text(lx, ly, f"{st.med:.1f}", ha="center", va=va,
                fontsize=9.5, color=STEP, fontweight="bold", zorder=6)
    ax.text(108, 79.6,
            f"Solid bars: median of each quarter of these countries, "
            f"{steps.med.min():.1f} to {steps.med.max():.1f} years",
            ha="right", fontsize=9.5, color=STEP)

    for _, row in rich.iterrows():
        if row["name"] in AGAINST_LABELS:
            label = row["name"].replace(" SAR, China", "")
            dx, dy, leader = AGAINST_LABELS[row["name"]]
            ax.annotate(label, (row.gdp / 1000, row.lexp), xytext=(dx, dy), textcoords="offset points",
                        fontsize=9, color=HIGHLIGHT if row["name"] == "United States" else INK,
                        arrowprops={"arrowstyle": "-", "color": MUTED, "lw": 0.7, "shrinkA": 1, "shrinkB": 4}
                        if leader else None)

    us = rich[is_us].iloc[0]
    jp = rich[rich.name == "Japan"].iloc[0]
    ax.annotate(
        f"The US is {us.gdp / jp.gdp:.1f}x as rich as Japan,\n"
        f"yet can expect {jp.lexp - us.lexp:.1f} fewer years of life",
        xy=(us.gdp / 1000, us.lexp), xytext=(58, 73.2),
        fontsize=10, color=INK,
        arrowprops={"arrowstyle": "->", "color": MUTED, "lw": 1.1, "connectionstyle": "arc3,rad=-0.2"},
    )

    ax.set_xlim(25, 115)
    ax.set_ylim(70, 90)
    ax.set_yticks(range(70, 91, 5))
    ax.xaxis.set_major_formatter(lambda v, _: f"${v:.0f}K")
    ax.set_xlabel("GDP per capita (current US$)")
    ax.set_ylabel("Life expectancy at birth (years)")
    ax.grid(True, color=GRID)
    ax.set_axisbelow(True)

    fig.suptitle("Among wealthy nations, more money buys almost no more life",
                 x=0.07, y=0.975, ha="left", fontsize=17, fontweight="bold", color=INK)
    fig.text(0.07, 0.905,
             f"Life expectancy vs. GDP per capita for the {len(rich)} countries above "
             f"${RICH_THRESHOLD:,} with at least {MIN_POP / 1e6:.0f} million people, {YEAR}",
             fontsize=10.5, color=MUTED)
    fig.text(0.07, 0.015, SOURCE + f"\nDashed line: least-squares fit across the {len(rich)} countries shown. "
             f"Bars: median within {RICH_GROUPS} equal-sized GDP groups.",
             fontsize=8, color=MUTED)
    fig.subplots_adjust(left=0.07, right=0.97, top=0.86, bottom=0.15)
    fig.savefig(HERE / "against.png")
    plt.close(fig)
    dropped = df[(df.gdp > RICH_THRESHOLD) & (df["pop"] < MIN_POP)]
    full = df[df.gdp > RICH_THRESHOLD]
    return {
        "n": len(rich), "slope_per_10k": slope * 10, "r": r,
        "steps": steps.round(1).to_dict("records"),
        "dropped": sorted(dropped.name), "r_with_dropped": float(np.corrcoef(full.gdp, full.lexp)[0, 1]),
        "slope_with_dropped_per_10k": float(np.polyfit(full.gdp / 1000, full.lexp, 1)[0] * 10),
    }


if __name__ == "__main__":
    data = load()
    print("FOR:", chart_for(data))
    print("AGAINST:", chart_against(data))
    q = pd.qcut(data.gdp, 5, labels=False)
    for k in range(5):
        g = data[q == k]
        q1, q3 = g.lexp.quantile([0.25, 0.75])
        lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
        print("hidden fliers, quintile", k + 1, sorted(g[(g.lexp < lo) | (g.lexp > hi)].name))
    print("all-country r(log GDP, LE):", round(float(np.corrcoef(np.log(data.gdp), data.lexp)[0, 1]), 3))
