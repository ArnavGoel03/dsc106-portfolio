# Project 3 (lightning version): When Does Lightning Strike? Day and Night over the Americas

GOES-16 GLM L2 flashes (summer 2024, 1-in-15 file sample) binned to a 1 degree grid by hour of day, in UTC and in
local solar time, shown as a D3 map with an hour scrubber, a local/UTC toggle and click-to-compare cells.
Sibling of `../project3-checkpoint/` (the CMIP6 version), which this folder was copied from and never edits.

- `run_all.sh` rebuilds everything (fetch is resumable; `SKIP_FETCH=1` reuses `data/glm_grid.npz`).
- `scripts/config.py` is the single source of truth (bucket, days, stride, grid, reference places).
- `scripts/fetch_glm.py` streams from S3 and keeps only counts; `export_web.py` writes `web/data/glm.json`.
- `scripts/eda.py` writes six graphs plus `eda/facts.json`, which feeds the cards and the narration.
- `team.json` holds team name, title and members; `make_video.sh` refuses a final build on the placeholder.
- `WRITEUP-DRAFT.md` mirrors the sections appended to the shared Google Doc "project 3 write up" on 2026-11-05.
