# Project 3 (six-year climatology version): When Does Lightning Strike? Day and Night over the Americas

Fourth sibling beside the CMIP6, 92-day and one-year versions. Same question and page as `../project3-lightning-year/`,
on all complete GOES-16 GLM years (2019 to 2024). The map shows the six-year average of flashes per year, the season
switch stays, and a new chart under the hour chart draws land and ocean curves once per year ("six years, one shape").

- Fetch: the `glm-climatology-fetch` GitHub Actions workflow, one job per (year, month), 72 jobs; download the
  artifacts to `data/parts/` and run `scripts/merge_grids.py` (per-year grids in `data/years/`, mean in
  `data/glm_climatology.npz`). `GLM_YEAR=<year>` selects the year for a local `fetch_glm.py` run.
- Exports: `web/data/glm_counts_sums.bin` contains exact uint16 six-year sums, [season][clock][cell][hour]; divide by
  `meta.counts_divisor` for mean flashes per year. Eight `glm_counts_sums_<season>_<clock>.bin` parts let the page
  render JJA/local first, then load other views. Every binary has a gzip copy and a checked raw fallback.
  `web/data/glm.json` holds the part URLs, byte lengths, colour domains, land mask and annual curves.
- Eight EDA graphs: the seven from the one-year version on the six-year mean, plus `g8_six_years.png`.
