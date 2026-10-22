"""Build the two persuasive charts for DSC 106 Project 2.

Proposition: "Women's gains in education have not translated into gains in work."
Source: World Bank, World Development Indicators (api.worldbank.org/v2), 1990-2019.

Run:  uv run --with matplotlib --with pandas --with requests python make_charts.py
API responses are cached under data/ so reruns are offline and reproducible.
"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).parent
DATA = HERE / "data"
API = "https://api.worldbank.org/v2"
YEARS = (1990, 2019)
START_WINDOW = (1990, 2000)  # earliest observation a country may use as its "before"
END_WINDOW = (2014, 2019)  # latest observation a country may use as its "after"

IND = {
    "enroll_f": "SE.TER.ENRR.FE",  # tertiary gross enrollment, female (%)
    "lfp_f": "SL.TLF.CACT.FE.ZS",  # labor force participation, female 15+ (modeled ILO)
    "ratio_fm": "SL.TLF.CACT.FM.ZS",  # ratio of female to male participation RATES x 100
}

EDU = "#2f6690"  # education series colour, shared by both charts
WORK = "#a0522d"  # work series colour, shared by both charts (sienna, not an alarm red)
INK = "#222222"
MUTED = "#6b6b6b"
GRID = "#e6e6e6"
SOURCE = (
    "Source: World Bank, World Development Indicators (SE.TER.ENRR.FE, SL.TLF.CACT.FE.ZS, "
    "SL.TLF.CACT.FM.ZS); participation is the modeled ILO estimate."
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


def get_json(path: Path, url: str, params: dict) -> list:
    if not path.exists():
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        path.write_text(r.text)
    payload = json.loads(path.read_text())
    if len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"{url} returned no data: {payload}")
    return payload[1]


def fetch(code: str) -> list:
    params = {"format": "json", "per_page": 20000, "date": f"{YEARS[0]}:{YEARS[1]}"}
    return get_json(DATA / f"{code}.json", f"{API}/country/all/indicator/{code}", params)


def countries() -> set:
    meta = get_json(DATA / "countries.json", f"{API}/country", {"format": "json", "per_page": 400})
    return {c["id"] for c in meta if c["region"]["value"] != "Aggregates"}


def load() -> pd.DataFrame:
    frames = []
    for key, code in IND.items():
        rows = [
            {"iso3": r["countryiso3code"], "year": int(r["date"]), key: r["value"]}
            for r in fetch(code)
            if r["value"] is not None and r["countryiso3code"]
        ]
        frames.append(pd.DataFrame(rows).set_index(["iso3", "year"]))
    return pd.concat(frames, axis=1).reset_index()


def country_changes(df: pd.DataFrame) -> pd.DataFrame:
    """Per country: change between its earliest year in START_WINDOW and its latest year in
    END_WINDOW (years where all three indicators exist), for each indicator."""
    keep = countries()
    out = []
    full = df[df.iso3.isin(keep)].dropna(subset=list(IND))
    for iso, g in full.groupby("iso3"):
        g = g.set_index("year").sort_index()
        s = g.loc[START_WINDOW[0] : START_WINDOW[1]]
        t = g.loc[END_WINDOW[0] : END_WINDOW[1]]
        if s.empty or t.empty:
            continue
        a, b = s.iloc[0], t.iloc[-1]
        out.append(
            {
                "iso3": iso,
                "y0": s.index[0],
                "y1": t.index[-1],
                "d_enroll": b.enroll_f - a.enroll_f,
                "d_lfp": b.lfp_f - a.lfp_f,
                "d_ratio": b.ratio_fm - a.ratio_fm,
                "e0": a.enroll_f,
                "e1": b.enroll_f,
                "r0": a.ratio_fm,
                "r1": b.ratio_fm,
            }
        )
    return pd.DataFrame(out)


def footer(fig):
    # Only the source sits on the chart; sample, definitions and caveats live in the write-up.
    fig.text(0.012, 0.015, SOURCE, ha="left", va="bottom", fontsize=8.5, color=MUTED)


def headline(fig, title: str, sub: str):
    fig.suptitle(title, x=0.012, y=0.975, ha="left", fontsize=16.5, fontweight="bold", color=INK)
    fig.text(0.012, 0.895, sub, ha="left", fontsize=11.5, color=MUTED)


def pct_axis(ax, top: int):
    ax.set_ylim(0, top)
    ax.set_yticks(range(0, top + 1, 10))
    ax.set_yticklabels([f"{t}%" for t in range(0, top + 1, 10)])
    ax.grid(axis="y", color=GRID)


RATIO = "female-to-male participation ratio"  # SL.TLF.CACT.FM.ZS: female rate / male rate x 100


def chart_for(df: pd.DataFrame, ch: pd.DataFrame) -> dict:
    wld = df[df.iso3 == "WLD"].set_index("year").sort_index()
    n = len(ch)
    fig = plt.figure(figsize=(13, 6.6), dpi=200)
    gs = fig.add_gridspec(2, 2, width_ratios=[1, 1.05], wspace=0.2, hspace=0.55,
                          left=0.05, right=0.985, top=0.80, bottom=0.13)
    headline(fig, "Worldwide, women's university enrollment tripled while their labor force participation slipped",
             f"World totals, 1990 to 2019 (left), and the change in each of {n} countries and territories (right).")

    # Left: world trend, both series on one percent axis.
    ax = fig.add_subplot(gs[:, 0])
    ax.set_axisbelow(True)
    yrs = wld.index
    for col, color in [("enroll_f", EDU), ("lfp_f", WORK)]:
        v0, v1 = wld[col].iloc[0], wld[col].iloc[-1]
        ax.plot(yrs, wld[col], color=color, lw=3)
        ax.scatter([yrs[0], yrs[-1]], [v0, v1], color=color, s=36, zorder=3)
        ax.annotate(f"{v0:.0f}%", (yrs[0], v0), xytext=(-8, 0), textcoords="offset points",
                    ha="right", va="center", color=color, fontweight="bold")
        ax.annotate(f"{v1:.0f}%", (yrs[-1], v1), xytext=(8, 0), textcoords="offset points",
                    ha="left", va="center", color=color, fontweight="bold")
    ax.text(2004, wld.enroll_f.loc[2004] + 3.5, "Women enrolled in\nhigher education", color=EDU,
            fontweight="bold", ha="right", va="bottom")
    ax.text(1992, wld.lfp_f.loc[1992] + 2.5, "Women in the labor force", color=WORK, fontweight="bold",
            ha="left", va="bottom")
    drop = wld.lfp_f.iloc[0] - wld.lfp_f.iloc[-1]
    ax.annotate(f"Down {drop:.0f} points since 1990", (yrs[-1], wld.lfp_f.iloc[-1]), xytext=(-85, -20),
                textcoords="offset points", ha="center", va="top", color=WORK, fontsize=10.5,
                arrowprops=dict(arrowstyle="-", color=WORK, lw=0.8))
    ax.set_xlim(1986, 2023.5)
    pct_axis(ax, 60)
    ax.set_title("The world, 1990 to 2019")

    # Right: same places, distribution of each computed change on one shared points axis.
    lo = np.floor(min(ch.d_enroll.min(), ch.d_lfp.min()) / 5) * 5
    hi = np.ceil(max(ch.d_enroll.max(), ch.d_lfp.max()) / 5) * 5
    bins = np.arange(lo, hi + 5, 5)
    med_e, med_l = ch.d_enroll.median(), ch.d_lfp.median()
    n_e_up = int((ch.d_enroll > 0).sum())
    axes = [fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, 1])]
    specs = [
        (axes[0], ch.d_enroll, EDU, med_e, "Change in women's higher-education enrollment",
         f"Median country: +{med_e:.0f} points"),
        (axes[1], ch.d_lfp, WORK, med_l, "Change in women's labor force participation",
         f"Median country: +{med_l:.0f} point"),
    ]
    ymax = 0
    for a, series, color, med, title, label in specs:
        a.set_axisbelow(True)
        counts, _, _ = a.hist(series, bins=bins, color=color, edgecolor="white", linewidth=0.8)
        ymax = max(ymax, counts.max())
        a.axvline(0, color=INK, lw=1)
        a.axvline(med, color=INK, lw=1.2, ls=(0, (3, 2)))
        a.set_title(title, fontsize=11.2)
        a.text(0.98, 0.92, label, transform=a.transAxes, ha="right", va="top", color=color,
               fontsize=8.5)
        a.grid(axis="y", color=GRID)
        a.set_xlim(bins[0] - 3, bins[-1] + 3)
        a.set_ylabel("Count", color=MUTED, fontsize=9.5)
    for a in axes:
        a.set_ylim(0, ymax * 1.12)
    axes[1].set_xlabel("Change in percentage points (dashed line: median)")
    footer(fig)
    fig.savefig(HERE / "for_education_not_work.png", facecolor="white")
    plt.close(fig)
    return {"n": n, "n_e_up": n_e_up, "n_l_rose": int((ch.d_lfp > 0).sum()), "n_l_fell": int((ch.d_lfp < 0).sum()),
            "med_e": round(med_e, 1), "med_l": round(med_l, 1), "bins": (bins[0], bins[-1]),
            "world_enroll": (round(wld.enroll_f.iloc[0], 1), round(wld.enroll_f.iloc[-1], 1)),
            "world_lfp": (round(wld.lfp_f.iloc[0], 1), round(wld.lfp_f.iloc[-1], 1)),
            "world_ratio": (round(wld.ratio_fm.iloc[0], 1), round(wld.ratio_fm.iloc[-1], 1))}


def chart_against(df: pd.DataFrame, ch: pd.DataFrame) -> dict:
    ch = ch.copy()
    ch["q"] = pd.qcut(ch.d_enroll, 4, labels=False)
    grp = ch.groupby("q").agg(lo=("d_enroll", "min"), hi=("d_enroll", "max"), med=("d_ratio", "median"),
                              p25=("d_ratio", lambda s: s.quantile(0.25)),
                              p75=("d_ratio", lambda s: s.quantile(0.75)),
                              share=("d_ratio", lambda s: (s > 0).mean()), n=("d_ratio", "size"))
    top = ch[ch.q == ch.q.max()]
    med = top[["e0", "e1", "r0", "r1"]].median()
    pearson = ch.d_enroll.corr(ch.d_ratio)
    spearman = ch.d_enroll.rank().corr(ch.d_ratio.rank())

    fig = plt.figure(figsize=(13, 6.6), dpi=200)
    outer = fig.add_gridspec(1, 2, width_ratios=[0.8, 1.2], wspace=0.24,
                             left=0.04, right=0.985, top=0.70, bottom=0.2)
    headline(fig, "Where women's enrollment rose more, the gender gap in labor force participation narrowed more",
             f"The median change in the {RATIO} rises across four groups of countries and territories "
             "ordered by enrollment gain.")

    # Left: the largest-rise group, education and work in two small panels on one shared 0-80% scale.
    left = outer[0, 0].subgridspec(1, 2, wspace=0.12)
    axl = [fig.add_subplot(left[0, 0])]
    axl.append(fig.add_subplot(left[0, 1], sharey=axl[0]))
    for a, (c0, c1), color, name in [(axl[0], ("e0", "e1"), EDU, "Women's higher-\neducation enrollment"),
                                     (axl[1], ("r0", "r1"), WORK, "Female-to-male\nparticipation ratio")]:
        a.set_axisbelow(True)
        v0, v1 = med[c0], med[c1]
        a.plot([0, 1], [v0, v1], color=color, lw=3, marker="o", ms=7)
        # One decimal on the endpoints so the printed change is exactly their difference.
        a.annotate(f"{v0:.1f}%", (0, v0), xytext=(0, -16), textcoords="offset points", ha="center",
                   color=color, fontweight="bold")
        a.annotate(f"{v1:.1f}%", (1, v1), xytext=(0, 9), textcoords="offset points", ha="center",
                   color=color, fontweight="bold")
        # Change printed in the empty top-left corner, clear of the line and both endpoint labels.
        a.text(0.05, 0.97, f"{round(v1, 1) - round(v0, 1):+.1f} points", transform=a.transAxes, ha="left",
               va="top", color=color, fontsize=10.5, fontweight="bold")
        a.set_title(name, fontsize=10.5, color=color)
        a.set_xlim(-0.35, 1.35)
        a.set_xticks([0, 1])
        a.set_xticklabels(["Start\n(1990 to 2000)", "End\n(2014 to 2019)"], fontsize=9.5)
        a.tick_params(axis="x", length=0)
        a.grid(axis="y", color=GRID)
    pct_axis(axl[0], 80)
    axl[1].tick_params(axis="y", labelleft=False, length=0)
    fig.text(0.04, 0.815, f"Largest-rise group ({len(top)} countries and territories), medians at start and end",
             ha="left", fontsize=12.5, fontweight="bold", color=INK)

    # Right: quartiles of enrollment gain; dot = median change in the ratio, line = middle half.
    ax2 = fig.add_subplot(outer[0, 1])
    ax2.set_axisbelow(True)
    ax2.axhline(0, color=INK, lw=1)
    x = np.arange(len(grp))
    ytop = grp.p75.max() + 2
    for i, r in grp.iterrows():
        ax2.plot([i, i], [r.p25, r.p75], color=WORK, lw=7, alpha=0.28, solid_capstyle="butt")
        ax2.plot(i, r.med, "o", color=WORK, ms=13, zorder=3)
        ax2.annotate(f"{r.med:+.1f}", (i, r.med), xytext=(13, 0), textcoords="offset points", ha="left",
                     va="center", fontsize=12.5, fontweight="bold", color=WORK,
                     bbox=dict(boxstyle="square,pad=0.15", fc="white", ec="none"))
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{r.lo:+.1f} to {r.hi:+.1f}" for _, r in grp.iterrows()], color=EDU, fontsize=10)
    ax2.tick_params(axis="x", length=0)
    ax2.set_xlim(-0.5, len(grp) - 0.3)
    ax2.set_ylim(min(grp.p25.min() - 1.5, -1), ytop)
    ax2.set_yticks(np.arange(-5, ytop, 5))
    ax2.set_ylabel("Change in participation ratio, points\n(dot = median, band = middle half)")
    ax2.set_xlabel(f"Rise in women's higher-education enrollment, percentage points\n"
                   f"({len(ch)} countries and territories in four equal groups)", color=EDU, labelpad=8)
    ax2.grid(axis="y", color=GRID)
    ax2.set_title("Change in the participation ratio, by enrollment gain")
    footer(fig)
    fig.savefig(HERE / "against_education_did_pay.png", facecolor="white")
    plt.close(fig)
    return {"groups": grp.round(2).to_dict("index"), "top_medians": med.round(1).to_dict(),
            "pearson": round(pearson, 3), "spearman": round(spearman, 3)}


# Decision scores shown in the reflection figure; must match the scores written in index.html.
SCORES = {
    "FOR": [("One percentage axis for two measures", -1), ("Women's own rate, not the ratio", -1.5),
            ("Paired histograms on a shared axis", 1), ("Median callouts on the histograms", -1),
            ("Title framed on world totals", -0.5)],
    "AGAINST": [("Opening with the largest-rise group", -1), ("Two small panels on one 0 to 80% scale", 1.5),
                ("The ratio, not women's own rate", -1.5), ("Group medians with middle-half bands", -1.5),
                ("Title framed as an association", -0.5)],
}


def chart_scores() -> None:
    rows = [(side, label, s) for side, items in SCORES.items() for label, s in items]
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=200)
    fig.subplots_adjust(left=0.36, right=0.93, top=0.86, bottom=0.14)
    y = np.arange(len(rows))[::-1]
    for yi, (side, label, s) in zip(y, rows):
        ax.barh(yi, s, color=EDU if s > 0 else WORK, height=0.6)
        ax.text(s + (0.06 if s > 0 else -0.06), yi, f"{s:+g}", va="center", ha="left" if s > 0 else "right",
                fontsize=10, fontweight="bold", color=INK)
    ax.set_yticks(y)
    ax.set_yticklabels([f"{side}: {label}" for side, label, _ in rows], fontsize=10)
    ax.tick_params(axis="y", length=0)
    ax.axhline(y[len(SCORES["FOR"]) - 1] - 0.5, color=GRID, lw=1)
    ax.axvline(0, color=INK, lw=1)
    ax.set_xlim(-2, 2)
    ax.set_xticks([-2, -1, 0, 1, 2])
    ax.set_xticklabels(["-2\nfully deceptive", "-1", "0", "+1", "+2\nfully earnest"])
    ax.grid(axis="x", color=GRID)
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    fig.suptitle("Our design decisions, scored from deceptive to earnest", x=0.02, ha="left", fontsize=14,
                 fontweight="bold", color=INK)
    fig.savefig(HERE / "decision_scores.png", facecolor="white")
    plt.close(fig)


def main():
    DATA.mkdir(exist_ok=True)
    df = load()
    ch = country_changes(df)
    keep = countries()
    pool = df[df.iso3.isin(keep)].dropna(subset=["lfp_f"]).iso3.nunique()
    note = (f"Sample: {len(ch)} of the {pool} countries and territories with participation data; the other "
            f"{pool - len(ch)} lack enrollment data in one of the two windows.")
    print(note)  # quoted in the Sample paragraph of index.html
    print("for:", chart_for(df, ch))
    print("against:", chart_against(df, ch))
    chart_scores()


if __name__ == "__main__":
    main()
