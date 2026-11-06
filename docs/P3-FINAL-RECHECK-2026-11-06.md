# Project 3 final: second audit, 6 November 2026

Owner request: recheck the published six-year final for remaining issues and worthwhile improvements. Source repair commit: `872d518`. Source/data, the official final rubric and browser paths were reviewed independently. No portal action or NOAA refetch was performed.

| Item | Status |
|---|---|
| Published baseline | Live HTML, metadata, default compressed counts and vendor scripts match the checkout byte for byte. Prior live CI on `6740313` passed. |
| Numerical review and downloader recovery | 17/17 offline tests pass; all six real legacy yearly grids migrate correctly. |
| Final rubric and content review | No additional missing required deliverable found; two unsupported wording claims removed. |
| Browser regression and additional data checks | 75/75 checks pass against the repaired local page, including deliberately broken renderer and Pause controls. |
| Responsive render | Desktop and phone screenshots inspected; no overflow at 320, 390, 768 or 1440. Original six-width label checks also pass. |
| Release verification | The existing post-Pages workflow runs the expanded 75-check suite against the deployed URL. Its source identity and final result are recorded in the linked workflow history. |

## Findings repaired

1. **Downloader crash/resume can double-count a day.** The old downloader saved the accumulated NPZ before its progress JSON. An injected failure between those writes followed by resume produced two flashes in the grid but one in its daily/file record. Counts and `completed_days` now commit together in a flushed, fsynced temporary NPZ followed by atomic replacement. JSON is a recoverable report, not the authority for completed days. Legacy daily/file records migrate; inconsistent totals and orphan reports fail closed. This affects future runs. Existing published data was not changed.
2. **Annual curves were described as identical.** The lower caption said only totals change across years. At 2 PM, land share ranges from 7.57% to 8.88% and ocean share from 3.87% to 5.09%. The unsupported last sentence was deleted; the source-supported peak-hour observations remain.
3. **A field aggregate ratio was described as a universal per-cell ratio.** The write-up said Whole year contains three to five times each seasonal cell's flashes. Florida's annual/season ratio ranges from 1.45 to 72.3. The annual/season maximum-density ratio is 1.84. The inaccurate clause was removed, retaining the separate annual-scale explanation.

## Improvements implemented

- The hour slider now exposes the existing human-readable hour and clock through `aria-valuetext`, rather than presenting only a number such as 16 to assistive technology.
- Independent expected hourly counts for Florida and Plains now verify actual map fill in all 50 season/clock/hour combinations. The selected Florida curve's bound normalized values also match all 24 expected hours. Expected data comes from the exact exported sums, whose equality to source aggregates is checked independently by the numerical suite.
- Pause must leave the hour unchanged for 450 ms, longer than the 350 ms animation interval. The suite deliberately injects a stale map, a stale curve and a fake Pause that changes only the button text; all three detectors reject those controls before verifying the repaired flow.

## Verification and reproducible limits

- `PYTHONDONTWRITEBYTECODE=1 projects/project3-lightning-year/.venv/bin/python projects/project3-lightning-climatology/tests/test_p3_final_data.py`: 17 tests, all pass. The new double-counting regression failed against the original function (`2 != 1`). Recovery checks include missing/corrupt reports, empty days, legacy mismatches and failed atomic replacement preserving old bytes and removing its temporary file.
- `auditP3Final(browser, localURL, {renderFixture})`: 75 checks, 75 pass, no failures. The same committed module and fixture are used by the CLI and CI. Existing checks retain gzip/raw fallback, failed/truncated data, missing write-up, metadata stalls, stale view requests, jumps, keyboard navigation and six responsive widths.
- Source syntax and `git diff --check` pass. No package, data-export or infrastructure changes were needed.
- Evidence: `docs/evidence/p3-final-recheck-20261106/browser-results.json`, `render-390.png` and `render-1440.png`. Both renders were inspected.
- The monolithic live MCP run exceeded its 25-second tool-call deadline. This is not recorded as a successful live rerun. The bounded live asset comparisons completed; the existing Linux post-deploy runner performs the full live suite. [Live regression workflow history](https://github.com/ArnavGoel03/dsc106-portfolio/actions/workflows/p3-final-check.yml).
- Historical failed-download coverage remains unrecoverable. A legacy zero-file day's completion cannot be inferred if both its completion marker and JSON report are absent; requerying that empty day is safe. Already-inconsistent legacy snapshots are rejected rather than guessed.
- The final rubric, team/work split and approximately 20 people-hours remain present. No grade guarantee or claim of universal scientific completeness is made.

## Remaining optional polish

No additional required-rubric blocker was found within this review. Useful optional improvements are individual year labels/tooltips in the annual chart and clickable NOAA product/source references. Asynchronous view-loading announcements could further improve assistive-technology feedback. These are presentation improvements, not unresolved data or interaction defects, and no new user-facing wording or larger feature was added for them.

The detailed second-pass findings, source commit, verification and remaining limits are handed to Claude through coord. The original submission URL and Gradescope record are unchanged.
