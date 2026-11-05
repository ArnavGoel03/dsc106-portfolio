"""Final-build gate: fail if the team name is still the placeholder, or if the cards or narration were built before the
current team.json (stale name). The silent draft does not call this. stdlib only, so make_video.sh can run it anywhere."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACEHOLDER = "[TEAM NAME]"  # same value as config.TEAM_PLACEHOLDER (config needs no imports here, so it is repeated once on purpose)
FILES = ["cards/card_team.png", "narration/NARRATION_solo.md", "narration/NARRATION_split.md", "narration/timing.json"]


def check(fresh_only=False):
    """Return a list of problems; empty means the final build may proceed. fresh_only=True skips the staleness test."""
    tj = ROOT / "team.json"
    name = json.loads(tj.read_text()).get("teamName", "")
    bad = []
    if not name.strip() or PLACEHOLDER in name:
        bad.append(f'team.json teamName is still "{name}". Set the real team name (one line in team.json).')
    if not fresh_only:
        for rel in ("narration/NARRATION_solo.md", "narration/NARRATION_split.md", "narration/script.json"):
            if PLACEHOLDER in (ROOT / rel).read_text():
                bad.append(f"{rel} still contains {PLACEHOLDER}")
        bad += [f"{f} is older than team.json: rebuild with scripts/make_cards.py and scripts/build_narration.py"
                for f in FILES if (ROOT / f).stat().st_mtime < tj.stat().st_mtime]
    return bad


if __name__ == "__main__":
    problems = check(fresh_only="--before-refresh" in sys.argv)
    if problems:
        sys.exit("FINAL BUILD BLOCKED:\n  " + "\n  ".join(problems))
