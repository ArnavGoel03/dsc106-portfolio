"""Six exploratory graphs plus eda/facts.json from data/glm_grid.npz. Every number spoken in the narration
or shown on a card is read from facts.json, so text cannot drift from the graphs."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import PowerNorm
from config import *
from export_web import land_mask, load_grid

INK, MUTED, ACCENT, BLUE = "#1d2733", "#5a6675", "#b8431a", "#2a6f9e"
plt.rcParams.update({"font.family": "sans-serif", "font.size": 13, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                     "xtick.color": INK, "ytick.color": INK, "axes.spines.top": False, "axes.spines.right": False})
EDA.mkdir(exist_ok=True)
G, removed = load_grid()
utc, loc = G["utc"], G["local"]
days = int((G["files"] > 0).sum())
land = land_mask().reshape(NLAT, NLON).astype(bool)
lat = LAT0 + (np.arange(NLAT) + 0.5) * CELL_DEG
lon = LON0 + (np.arange(NLON) + 0.5) * CELL_DEG
HOURS12 = ["midnight", "3 AM", "6 AM", "9 AM", "noon", "3 PM", "6 PM", "9 PM"]
land_gj = json.loads((DATA / "land.geojson").read_text())
F = {"days_sampled": days, "files": int(G["files"].sum()), "flashes": int(utc.sum()), "sample_stride": FILE_STRIDE, "artifact_cells_removed": removed}


def coast(ax):
    for feat in land_gj["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            xy = np.array(poly[0], dtype=float)
            jump = np.where(np.abs(np.diff(xy[:, 0])) > 180)[0]  # rings that cross the antimeridian: break the line there
            xy = np.insert(xy, jump + 1, np.nan, axis=0)
            ax.plot(xy[:, 0], xy[:, 1], color=INK, lw=0.5)
    ax.set_xlim(LON0, LON1); ax.set_ylim(LAT0, LAT1); ax.set_aspect("equal")
    ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude")


def fig(title, sub, size=(16, 9)):
    f = plt.figure(figsize=size, dpi=120, facecolor="white")
    f.text(0.05, 0.955, title, fontsize=22, fontweight="bold", color=INK, va="top")
    f.text(0.05, 0.905, sub, fontsize=13, color=MUTED, va="top")
    return f


def save(f, name):
    f.savefig(EDA / name, bbox_inches="tight"); plt.close(f)


def hour_label(h):
    return f"{(h + 11) % 12 + 1} {'AM' if h < 12 else 'PM'}"


# g1: total flash density map (per 10,000 km2: a 1 degree cell shrinks with cos latitude)
tot = utc.sum(2)
cell_km2 = (111.2 * CELL_DEG) ** 2 * np.cos(np.deg2rad(lat))[:, None]
dens = tot / cell_km2 * 1e4
f = fig("Where lightning happens: flash density, summer 2024",
        f"GOES-16 GLM, {days} days sampled at one 20 s file per 5 min, {F['flashes']:,} flashes. Flashes per 10,000 km2 per 1 degree cell, square-root colour scale.")
ax = f.add_axes([0.07, 0.08, 0.86, 0.78])
im = ax.pcolormesh(lon - 0.5, lat - 0.5, np.where(tot > 0, dens, np.nan), cmap="YlOrRd", norm=PowerNorm(0.5), shading="auto")
coast(ax); f.colorbar(im, ax=ax, shrink=0.7, label="Flashes per 10,000 km2 in the sample")
top = np.unravel_index(np.argmax(tot), tot.shape)
F["g1_top_cell"] = {"lat": float(lat[top[0]]), "lon": float(lon[top[1]]), "flashes": int(tot.max()), "land": bool(land[top])}
F["g1_land_share_pct"] = round(100 * tot[land].sum() / tot.sum(), 1)
save(f, "g1_map_total.png")

# g2: all of the Americas by local solar hour
allh = loc.sum((0, 1))
f = fig("Lightning across the Americas by local solar hour", "Share of all sampled flashes in each local solar hour (UTC + longitude / 15). One summer, all cells.")
ax = f.add_axes([0.08, 0.12, 0.86, 0.72])
ax.bar(range(24), 100 * allh / allh.sum(), color=ACCENT)
ax.set_xticks(range(0, 24, 3)); ax.set_xticklabels(HOURS12); ax.set_ylabel("Share of all flashes (%)")
F["g2_all_peak_hour"] = int(allh.argmax()); F["g2_all_peak_label"] = hour_label(int(allh.argmax()))
F["g2_all_peak_share_pct"] = round(100 * allh.max() / allh.sum(), 1)
F["g2_all_afternoon_share_pct"] = round(100 * allh[AFTERNOON_HOURS].sum() / allh.sum(), 1)  # 1 PM to 6 PM
save(f, "g2_all_by_hour.png")

# g3: land vs ocean by local solar hour
lc, oc = loc[land].sum(0), loc[~land].sum(0)
f = fig(f"Land lightning peaks at {hour_label(int(lc.argmax()))}, ocean lightning at {hour_label(int(oc.argmax()))}",
        "Flashes by local solar hour, all land cells versus all ocean cells, each as a share of its own total.")
ax = f.add_axes([0.08, 0.12, 0.86, 0.72])
ax.plot(range(24), 100 * lc / lc.sum(), color=ACCENT, lw=3, label="Land")
ax.plot(range(24), 100 * oc / oc.sum(), color=BLUE, lw=3, ls="--", label="Ocean")
ax.set_xticks(range(0, 24, 3)); ax.set_xticklabels(HOURS12); ax.set_ylabel("Share of the area's flashes (%)"); ax.legend(frameon=False)
F["g3_land_peak_hour"] = int(lc.argmax()); F["g3_ocean_peak_hour"] = int(oc.argmax())
F["g3_land_peak_label"] = hour_label(int(lc.argmax())); F["g3_ocean_peak_label"] = hour_label(int(oc.argmax()))
F["g3_land_peak_share_pct"] = round(100 * lc.max() / lc.sum(), 1); F["g3_ocean_peak_share_pct"] = round(100 * oc.max() / oc.sum(), 1)
night = np.array(NIGHT_HOURS)
F["g3_land_night_share_pct"] = round(100 * lc[night].sum() / lc.sum(), 1)
F["g3_ocean_night_share_pct"] = round(100 * oc[night].sum() / oc.sum(), 1)
save(f, "g3_land_vs_ocean.png")

# g4: peak-hour map on a circular colour scale
MIN_FLASHES = 50  # cells with fewer sampled flashes have no reliable peak hour
peak = loc.argmax(2).astype(float)
peak[tot < MIN_FLASHES] = np.nan
f = fig("The hour each place's lightning peaks", f"Local solar hour of each cell's busiest hour; cells with under {MIN_FLASHES} flashes are blank. Circular colour scale, midnight meets midnight.")
ax = f.add_axes([0.07, 0.08, 0.86, 0.78])
im = ax.pcolormesh(lon - 0.5, lat - 0.5, peak, cmap="twilight_shifted", vmin=0, vmax=24, shading="auto")
coast(ax); cb = f.colorbar(im, ax=ax, shrink=0.7, ticks=[0, 6, 12, 18, 24]); cb.set_ticklabels(["midnight", "6 AM", "noon", "6 PM", "midnight"])
ok = ~np.isnan(peak)
aft = np.isin(peak, AFTERNOON_HOURS)
F["g4_land_afternoon_peak_pct"] = round(100 * (aft & land & ok).sum() / (land & ok).sum(), 1)
F["g4_ocean_night_peak_pct"] = round(100 * (np.isin(peak, NIGHT_HOURS) & ~land & ok).sum() / (~land & ok).sum(), 1)
save(f, "g4_peak_hour_map.png")

# g5: regions by local hour, each as a share of its own daily total
REGIONS = {"Great Plains": (35, 48, -104, -94), "Southeastern US": (25, 35, -92, -78), "Amazon basin": (-12, 2, -72, -50)}
F["g5_regions"] = {}
curves = {}
for name, (a, b, c, d) in REGIONS.items():
    sel = (lat[:, None] >= a) & (lat[:, None] < b) & (lon[None, :] >= c) & (lon[None, :] < d) & land
    cur = loc[sel].sum(0); curves[name] = cur
    F["g5_regions"][name] = {"peak_hour": int(cur.argmax()), "peak_label": hour_label(int(cur.argmax())), "night_share_pct": round(100 * cur[night].sum() / max(cur.sum(), 1), 1), "flashes": int(cur.sum())}
R = F["g5_regions"]
f = fig(f"Great Plains peak at {R['Great Plains']['peak_label']}; Southeast at {R['Southeastern US']['peak_label']}; Amazon at {R['Amazon basin']['peak_label']}",
        f"Land flashes by local solar hour, each region as a share of its own daily total.\nNight share (9 PM to 6 AM): Plains {R['Great Plains']['night_share_pct']:.0f}%, Southeast {R['Southeastern US']['night_share_pct']:.0f}%, Amazon {R['Amazon basin']['night_share_pct']:.0f}%.")
ax = f.add_axes([0.08, 0.12, 0.86, 0.72])
for (name, cur), col in zip(curves.items(), [BLUE, ACCENT, "#3b8f5a"]):
    ax.plot(range(24), 100 * cur / max(cur.sum(), 1), color=col, lw=3, label=f"{name} (peak {hour_label(int(cur.argmax()))})")
ax.set_xticks(range(0, 24, 3)); ax.set_xticklabels(HOURS12); ax.set_ylabel("Share of the region's flashes (%)"); ax.legend(frameon=False)
save(f, "g5_regions.png")

# g6: small multiples at four local solar hours
hours = [3, 9, 15, 21]
f = fig("The same map at four local solar hours", "Flashes per cell at 3 AM, 9 AM, 3 PM and 9 PM local solar time. One colour scale for all four panels.")
vmax = loc[:, :, hours].max()
for k, h in enumerate(hours):
    ax = f.add_axes([0.06 + (k % 2) * 0.46, 0.46 - (k // 2) * 0.41, 0.40, 0.34])
    v = loc[:, :, h]
    im = ax.pcolormesh(lon - 0.5, lat - 0.5, np.where(v > 0, v, np.nan), cmap="YlOrRd", norm=PowerNorm(0.5, vmax=vmax), shading="auto")
    coast(ax); ax.set_title(f"{hour_label(h)} local solar time, {v.sum():,} flashes", fontsize=13, color=INK)
    ax.set_xlabel(""); ax.set_ylabel(""); ax.set_xticks([]); ax.set_yticks([])
F["g6_hour_totals"] = {hour_label(h): int(loc[:, :, h].sum()) for h in hours}
save(f, "g6_four_hours.png")

# Reference places for the prototype's jump buttons (not a graph)
F["places"] = {}
for key, (la, lo, label) in PLACES.items():
    i, j = int((la - LAT0) // CELL_DEG), int((lo - LON0) // CELL_DEG)
    cur = loc[i, j]
    F["places"][key] = {"label": label, "peak_hour": int(cur.argmax()), "peak_label": hour_label(int(cur.argmax())), "flashes": int(cur.sum())}

(EDA / "facts.json").write_text(json.dumps(F, indent=1))
print(json.dumps(F, indent=1))
