"""Build the narration files and the slide timing from narration/script.json and eda/facts.json.
Outputs: narration/NARRATION_solo.md, narration/NARRATION_split.md, narration/timing.json.
Numbers in the text come from facts.json, so the script cannot drift from the graphs."""
import json, re
from config import ROOT, TEAM

N = ROOT / "narration"
S = json.loads((N / "script.json").read_text())
F = json.loads((ROOT / "eda" / "facts.json").read_text())
R = F["g5_regions"]
vals = dict(
    team_name=TEAM["teamName"], title=TEAM["title"], others=", ".join(m for m in TEAM["members"] if m != "Yash Goel"),
    flashes_m=f"{F['flashes'] / 1e6:.1f}", land_share=F["g1_land_share_pct"],
    all_peak=F["g2_all_peak_label"], all_afternoon=F["g2_all_afternoon_share_pct"],
    land_peak=F["g3_land_peak_label"], ocean_peak=F["g3_ocean_peak_label"], ocean_night=F["g3_ocean_night_share_pct"],
    land_aft=F["g4_land_afternoon_peak_pct"], ocean_night_cells=F["g4_ocean_night_peak_pct"],
    se_peak=R["Southeastern US"]["peak_label"], amazon_peak=R["Amazon basin"]["peak_label"], plains_peak=R["Great Plains"]["peak_label"], plains_night=R["Great Plains"]["night_share_pct"],
)
# a scenario name like SSP5-8.5 is spoken as about 5 words
wc = lambda t: len(re.findall(r"[A-Za-z0-9\[\]'.\-]+", t))
t, segs = 0.0, []
for s in S["segments"]:
    text = s["text"].format(**vals)
    dur = wc(text) / S["wpm"] * 60 + S["pad_seconds"]
    segs.append({**s, "text": text, "words": wc(text), "start": round(t, 1), "dur": round(dur, 2)})
    t += dur
total = round(t, 1)
assert total <= S["max_seconds"], f"script runs {total}s, over the {S['max_seconds']}s limit"
(N / "timing.json").write_text(json.dumps({"total": total, "segments": [{k: s[k] for k in ("id", "start", "dur", "visual")} for s in segs]}, indent=1))
mm = lambda x: f"{int(x // 60)}:{int(x % 60):02d}"


def render(split):
    out = [f"# Narration script ({'two voices' if split else 'owner reads everything'})", "",
           f"Counted at {S['wpm']} words per minute ({sum(s['words'] for s in segs)} words, digits counted as one word) this is about {mm(total)}. Spoken digits add a few seconds, so read briskly; the limit is 2:00 and make_video.sh speeds the audio up to 1.15x if needed.",
           "Numbers are generated from eda/facts.json; the team name and title come from team.json. Read it at your natural pace; do not rush to hit the clock.",
           "Record in script order. Two-voice version: 3 clips (Yash, Chau, Yash), or 10 clips (one per block) for exact slide sync.", ""]
    last = None
    for s in segs:
        who = S["speakers"][s["split"]] if split else S["speakers"]["yash"]
        if who != last and split:
            out.append(f"## {who}"); last = who
        out += [f"**{mm(s['start'])} to {mm(s['start'] + s['dur'])}** ({s['item']}, {s['words']} words)", "", s["text"], ""]
    return "\n".join(out)


(N / "NARRATION_solo.md").write_text(render(False))
(N / "NARRATION_split.md").write_text(render(True))
print("total", total, "words", sum(s["words"] for s in segs))
