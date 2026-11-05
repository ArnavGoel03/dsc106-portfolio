#!/bin/bash
# One command, no arguments: ./record_voiceover.sh
# Shows the solo script, counts down 3 s, records the default macOS microphone (audio only) to voiceover.m4a,
# stops on Enter or at 2:00, then runs ./make_video.sh voiceover.m4a. Records a real voice; never generates one.
# Test hooks (not for normal use): RECORD_INPUT=<audio file> records that file instead of the microphone,
# RECORD_MAX_SECONDS=<n> lowers the cap, RECORD_COUNTDOWN=<n> shortens the countdown.
set -euo pipefail
cd "$(dirname "$0")"
[ $# -eq 0 ] || { echo "usage: ./record_voiceover.sh   (no arguments)"; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
MAX="${RECORD_MAX_SECONDS:-120}"      # Gradescope limit for the checkpoint video
COUNT="${RECORD_COUNTDOWN:-3}"
OUT=voiceover.m4a
# The team name is spoken in the first sentence, so settle it before a take, not after.
if grep -q '\[TEAM NAME\]' team.json; then
  echo 'team.json still has the [TEAM NAME] placeholder. Set "teamName" there (one line), then run this again.'; exit 1
fi
.venv/bin/python scripts/build_narration.py >/dev/null   # script text follows team.json
# Show the spoken text only (drop headings and meta lines), bold, wrapped. Zoom the terminal (Cmd +) to enlarge.
clear 2>/dev/null || true
printf '\033[1m'
grep -vE '^(#|Counted|Numbers are|Record in)' narration/NARRATION_solo.md | sed -E 's/^\*\*([^*]*)\*\*.*/\n--- \1 ---/' | cat -s | fold -s -w 72
printf '\033[0m\n\nRead the above aloud. Press Enter when done (auto-stops at %ss).\n' "$MAX"
for ((i = COUNT; i >= 1; i--)); do printf '\rRecording starts in %s ...' "$i"; sleep 1; done
printf '\rRECORDING: read now, press Enter to stop.   \n'
[ ! -f "$OUT" ] || mv "$OUT" "voiceover_previous_$(date +%H%M%S).m4a"   # never overwrite a take
if [ -n "${RECORD_INPUT:-}" ]; then SRC=(-re -i "$RECORD_INPUT"); else SRC=(-f avfoundation -i ":default"); fi
ffmpeg -nostdin -hide_banner -loglevel error -y "${SRC[@]}" -t "$MAX" -vn -ac 1 -c:a aac -b:a 128k "$OUT" &
PID=$!
# Wait for Enter, the cap, or ffmpeg ending by itself (cap reached, or the microphone failed to open).
SECS=0
while kill -0 "$PID" 2>/dev/null; do
  rc=0; IFS= read -r -t 1 _ 2>/dev/null || rc=$?
  [ "$rc" -ne 0 ] || break                  # Enter pressed
  [ "$rc" -gt 128 ] || sleep 1              # stdin closed (not a terminal): do not spin
  SECS=$((SECS + 1)); [ "$SECS" -lt "$((MAX + 3))" ] || break
done
if kill -0 "$PID" 2>/dev/null; then kill -INT "$PID" 2>/dev/null || true; fi
wait "$PID" 2>/dev/null || true
[ -s "$OUT" ] || { echo "No audio recorded. Allow Terminal under System Settings > Privacy & Security > Microphone, then try again."; exit 1; }
echo "Saved $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -c1-5) s). Building the video ..."
exec ./make_video.sh "$OUT"
