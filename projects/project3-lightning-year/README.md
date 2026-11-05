# Project 3 (one-year lightning version): When Does Lightning Strike? Day and Night over the Americas

Same question and page as `../project3-lightning/` (92 summer days), but on the whole of 2024 with the counts kept
per calendar month, so the page adds a Season toggle (DJF, MAM, JJA, SON, whole year; opens on summer). Third
sibling next to the CMIP6 and 92-day versions; the owner compares them before choosing what to submit.

- Counts ship as `web/data/glm_counts.bin` (uint16, [season][clock][cell][hour], about 5 MB) plus `web/data/glm.json` (meta + land).
- Fetch: `scripts/fetch_glm.py` locally (resumable, slow from India), or the `glm-year-fetch` GitHub Actions workflow
  (one job per month on US runners), then download the twelve artifacts to `data/parts/<name>/glm_grid.npz` and run
  `scripts/merge_grids.py`.
- `GLM_GRID=<file>` points the build at another grid (used with `data/glm_grid.npz.fixture`, the 92-day summer grid, for page tests).
- Seven EDA graphs: the six from the 92-day version on the full year, plus `g7_four_seasons.png` (4 PM in each season).
