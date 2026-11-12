# Project 3 final: adversarial audit, 6 November 2026

Scope: the selected six-year Lightning final at `projects/project3-lightning-climatology/`, submitted as Gradescope 445482031 according to the shipping session's queue. The deployed page and its write-up, data export, ingestion pipeline, interaction paths and final rubric are under review. This audit does not submit or resubmit coursework.

## Work status

| Work | Status |
|---|---|
| Strict rubric and write-up review | Complete. Required sections are present; scientific wording concerns recorded below. |
| Local source/data invariants and exported-data review | Complete. All 72 monthly artifacts and six yearly merges tested. |
| Live season, clock, hour, selection and keyboard paths | Complete. 50 season/clock/hour combinations, jumps, keyboard selection and Play/Pause pass. |
| Responsive render | Complete. Inspected 390 px render; no horizontal overflow or clipped SVG text at 320, 360, 390, 768, 1024 or 1440 px. Visible SVG labels measure at least approximately 10 CSS px after SVG transforms. |
| Adversarial loading | Complete. Raw fallback, failed/truncated counts, touch details tested; metadata stall and missing write-up reproduced. |
| Corrected final and regression checks | Complete locally. 72 browser checks and 10 offline data tests pass; source syntax, dependency install and diff checks pass. |
| Release and post-deploy verification | Owned by arnavgoel-53 after its review. This audit does not push or resubmit. |

## Confirmed findings

1. **P2: rounding seasonal means changes cell peak hours.** Exporter rounds each seasonal mean to a whole flash before the browser sums seasons. 975 positive annual cells disappear; 426 cells with at least 50 mean flashes per year change peak hour, including 31 cells with at least 1,000 and three with at least 5,000. At 25.5 S, 59.5 W, 14,552.833 mean flashes per year peak at 23:00 in the source and at 00:00 in the exported page. Proposed repair: uint16 six-year sums, divided by six when displayed. Current source sums fit uint16.
2. **P2: failed downloads are counted as completed files.** A one-success/one-failure fixture returns two files from `bin_day`, and the day is recorded as complete on resume. Historic successful-download provenance cannot be reconstructed from existing aggregate artifacts. Future runs must fail before persisting an incomplete day and count successful parses, including valid zero-flash files.
3. **P2: required metadata can stall forever.** Only the large counts download has a watchdog. Holding `glm.json` leaves an empty map, disabled controls and a 99% loading subtitle. All required startup fetches need bounded retry behavior.
4. **P2: a failed write-up download silently removes a required deliverable.** With `writeup.md` returning 404, the chart works but the write-up section stays hidden and no fallback link exists.
5. **P2: peak normalization does not correct detection bias.** Scaling by each curve's peak removes differences in magnitude, but preserves hour-dependent detection efficiency. The chart caption currently implies more. The existing daytime/edge detection caveat should remain explicit.
6. **P2: lower-chart denominator is ambiguous.** Land and ocean percentages use separate annual group totals; the title can be read as a common total. Make the separate denominators explicit.
7. **P2: hemisphere-dependent season names.** Winter/DJF and Summer/JJA are unqualified on a map covering both hemispheres. Use month groups or explicitly qualify the northern-hemisphere convention.

## Verified data limits

- All 2,192 calendar days have some listed-file coverage. 628,930 listed files compare with 631,296 nominal five-minute samples. 161 days have fewer than 288 files; one day has 319. Sorting archive keys and taking every fifteenth key does not always produce an exact five-minute temporal sample. Failed-download accounting means these are listed-file counts, not independently verified successful-file counts.
- All yearly UTC/local cell totals conserve exactly in the source; daily totals match raw yearly grids. Per-year artifact removal, land-mask regeneration, annual curves and source peak hours reproduce exactly.
- Current binary/gzip contents match the exporter, but independent seasonal rounding removes 32,403 mean flashes per year and introduces a 232-flash difference between annual UTC/local totals. The corrected export must close both defects.
- Source-based 4 PM land peak, 9 AM trough, approximately 42% ocean night share, 26% land night share, 45% Plains night share and 11 PM Nebraska peak reproduce.
- Raw quality flags and successful download coverage cannot be independently rechecked from aggregates. No raw NOAA refetch or paid infrastructure was started.

## Assessment

All seven confirmed defects have local repairs. The downloader now rejects incomplete days, and the historic coverage limit is described in the final write-up. No historic data was refetched. The exact mean total is 22,516,755.166666668 in both `facts.json` and page metadata. Peak normalization is no longer presented as a correction for detection bias; the lower chart explicitly separates land/ocean denominators; month-group labels replace hemisphere-dependent season names.

The default counts payload is 225,876 compressed bytes, versus 1,105,373 before this repair (79.6% less). The initial map renders with all seven other parts held indefinitely. Exact summed counts compress to a larger 1.76 MB full fallback; that full file is outside the initial split-data path. Byte reduction is verified; no universal latency improvement is claimed.

The final browser suite passes 72/72 on the corrected local page. Against the saved pre-fix HEAD, it fails the initial-part check, month-label/core flow, missing write-up fallback, metadata stall and stale-view checks. The data reviewer calibrated three regressions on the broken export/downloader before the repaired 10/10 run. Successful browser paths have no console errors. The render artifacts in `docs/evidence/p3-final-audit-20261106/` were inspected at 360, 390, 1024 and 1440 px. The layout detector also checked 320 and 768 px.

The new workflow checks the live final after the observed GitHub Pages build workflow completes on main. It is configured, but its first production run is pending the publishing session's push.

D3-only static delivery, allowed GOES source, team details, rationale, alternatives, work split, people-hours and development challenges conform. The interactive design supports the question. No guaranteed grade or originality bonus is claimed. The final rubric penalizes a clearly AI-generated write-up; owner-supplied development facts and honest team review matter, and this audit does not rewrite personal process claims or invent teammates' work.

The local headless process was blocked by the filesystem sandbox's macOS bootstrap permission; browser tests used the configured isolated Playwright browser. The initial font detector mistakenly included empty grid tick labels and omitted SVG group transforms. It was corrected and recalibrated before reporting layout results.
