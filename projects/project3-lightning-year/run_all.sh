#!/bin/bash
# Reproduce everything from scratch: venv, GLM sample (about 6 GB streamed from S3, several hours from a slow link,
# resumable), EDA graphs, web data, cards, narration, silent video. Screenshots/clip need chrome-headless-shell on :9333
# and a static server on :8766 (see scripts/shots.sh).
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv; .venv/bin/pip install -r requirements.txt; }
node -e "const t=require('./vendor/topojson-client.min.js');const w=require('./vendor/land-110m.json');require('fs').writeFileSync('./data/land.geojson',JSON.stringify(t.feature(w,w.objects.land)))"
cd scripts
[ "${SKIP_FETCH:-}" ] || ../.venv/bin/python fetch_glm.py   # data/glm_grid.npz (gitignored), resumes from data/fetch_progress.json
../.venv/bin/python export_web.py           # web/data/glm.json
../.venv/bin/python eda.py > /dev/null      # eda/*.png + eda/facts.json
../.venv/bin/python make_cards.py           # cards/*.png
../.venv/bin/python build_narration.py      # narration/*.md + timing.json
cd ..
if curl -s --max-time 1 http://127.0.0.1:9333/json/version >/dev/null; then
  (python3 -m http.server 8766 >/dev/null 2>&1 &) ; sleep 1
  bash scripts/shots.sh && bash scripts/capture_clip.sh
  pkill -f "http.server 8766" || true
fi
./make_video.sh                             # video/*_SILENT_DRAFT.mp4
