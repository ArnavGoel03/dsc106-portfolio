#!/bin/bash
# Usage:
#   ./make_video.sh                      silent draft with an empty audio slot -> video/DSC106_P3_checkpoint_SILENT_DRAFT.mp4
#   ./make_video.sh voiceover.m4a        mux your recording, re-time slides to it, fit 2:00 -> video/DSC106_P3_checkpoint.mp4
#   ./make_video.sh yash.m4a alp.m4a bora.m4a   several recordings, joined in the order given
# A final build (any audio argument) fails while team.json still says [TEAM NAME]; the silent draft does not.
# Needs ffmpeg + ffprobe. Rebuilds the slides from narration/timing.json every time. Never creates a voice.
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
[ -f shots/clip.mp4 ] || [ -d shots/clip ] || { echo "missing shots/clip frames"; exit 1; }
if [ $# -gt 0 ]; then   # final build: block on the [TEAM NAME] placeholder, then rebuild cards + narration so they carry the current name
  python3 scripts/check_team.py --before-refresh
  [ -x .venv/bin/python ] && (cd scripts && ../.venv/bin/python make_cards.py >/dev/null && ../.venv/bin/python build_narration.py >/dev/null)
fi
exec python3 scripts/build_video.py "$@"
