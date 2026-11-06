# Project 3 final: full handoff to Claude

The owner asked for a thorough red-team, then explicitly asked that Claude receive everything in detail. This document records the inspected state, every repair, verification and remaining limit. Root sends the local commit hash separately through coord. Claude session `arnavgoel-53` owns review, publication and post-deploy verification; Codex does not push or resubmit.

## Scope and starting state

Selected final: `projects/project3-lightning-climatology/`, 2019 to 2024, Group 19 (Yash + Chau). The queue records Gradescope 445482031. The audited live HEAD was 8960508; Pages API reported built. Live HTML, JavaScript, CSS, write-up, team and metadata matched the checkout. The official local final rubric, not the checkpoint-only video rubric, was used. Two independent reviewers checked the mathematical/data pipeline and strict rubric; root tested actual browser paths.

The CMIP6, summer-only and one-year versions were outside repair scope. Their untracked files and the existing `.coord-freeze` are preserved. No Gradescope action, Drive update, email send, raw NOAA refetch, scheduled job or paid resource was started.

## Findings and exact repairs

1. **Seasonal rounding changed the data.** Previous `np.rint` rounded each seasonal mean before Whole year summed seasons. 975 nonempty annual cells vanished, and 426 cells with at least 50 mean flashes/year changed busiest hour, including 31 with at least 1,000 and three with at least 5,000. Source cell 25.5 S, 59.5 W had 14,552.833 flashes/year and a 23:00 peak; the prior export showed 00:00. The exporter now stores exact six-year integer sums and the browser divides by `counts_divisor`. Fractions survive; UTC/local seasonal cell totals conserve exactly. Metadata and `facts.json` both hold 22,516,755.166666668 mean flashes/year. The original rounded UTC total was 22,484,352.
2. **Failed downloads were permanently accepted.** `bin_day` returned listed-key count even when a body was missing, and `main` persisted the partial day and progress marker. It now counts successful parses, including valid zero-flash files, and raises with failed keys before the day reaches persistence. S3 bodies close in `finally`. Connection/read timeouts and retry/worker counts live in config. The test executes the real function AST with a one-success/one-failure fixture without initializing AWS or calling the network.
3. **Metadata could hang startup.** JSON, land and team now use the same `fetchBytes` watchdog/retry path as counts. Held metadata produces the existing visible failure message and disabled controls instead of an indefinite blank chart.
4. **Missing write-up silently removed a deliverable.** A static `writeup.md` link is present even if the independent inline fetch fails. Inline rendering remains text-node-only, so markup is not injected.
5. **Peak scaling overstated detection correction.** The line caption no longer claims comparison works despite daytime underdetection. The footer separates the instrument caveat from normalization. The write-up explicitly says scaling does not correct daylight or edge-of-view detection bias. Owner/team process facts and approximately 20 people-hours remain unchanged.
6. **Annual percentage denominator was ambiguous.** The lower-chart title says land and ocean each use their own total; the write-up specifies each year's separate land and ocean totals. Annual percentages/curves were independently recomputed and matched the source.
7. **Season names implied the northern hemisphere.** Radio labels now derive Dec-Feb (DJF), Mar-May (MAM), Jun-Aug (JJA) and Sep-Nov (SON) from metadata months. The winter-only rationale was removed. The map covers both hemispheres.
8. **Initial payload unnecessarily included all views.** Metadata now describes eight season/clock parts. Initial startup loads JJA/local only; two animation frames allow first paint before sequential background prefetch. On-demand season/clock/Whole year waits are visible. Shared in-flight requests prevent duplicate downloads. A failed background request is retryable on demand. A view serial prevents older results replacing newer choices; progress callbacks also reject stale updates. Rapid season+clock choices use the currently selected radio values, preserving both dimensions. Jump buttons await local data before selecting the local peak.

## Export contract and compatibility

- `meta.counts_divisor = 6`.
- `meta.counts_parts[season][clock] = {file, gzip, bytes}`.
- Each raw part is 633,600 bytes, uint16 little-endian `[cell][hour]`; filenames are `glm_counts_sums_<season>_<clock>.bin` and `.bin.gz`.
- The whole exact-sum fallback is `glm_counts_sums.bin` and `.bin.gz`, `[season][clock][cell][hour]`. New URLs prevent cached old rounded-mean bytes being interpreted as sums. Older metadata still loads its own full-file format.
- Every raw or inflated payload is checked against expected byte length; malformed gzip can fall back to raw, and truncated raw data fails visibly.
- `density_domains` is precomputed across both clocks, so first paint does not require every part and scales remain fixed. Season domain: 3738.4424209819317; Whole year: 6867.193520266386.
- `km2_per_deg2_equator` comes from the canonical Python config and is consumed by the browser; EDA uses the same constant.
- Old mean binaries were retained for cached old applications. Their data was not rewritten.

## What was run and observed

- **10/10 offline data tests**: exact source equality, clock/cell conservation, known peak and sparse cell, all part contents and gzip equality, domain maxima, failed downloads, empty-file coverage, S3 cleanup, quality filtering and fractional local time. Three regressions were first run against the broken state and failed. Command: `projects/project3-lightning-year/.venv/bin/python projects/project3-lightning-climatology/tests/test_p3_final_data.py`. Source comparisons require the local ignored climatology NPZ; do not claim these run against unavailable CI source data.
- **72/72 browser checks**: every season and both clocks at hours 0/3/9/16/23; source-derived Florida/Plains/Maracaibo jumps; two-cell keyboard selection and Escape; Play/Pause; no bad SVG numbers; 320/360/390/768/1024/1440 layout; no console errors on the successful flow; gzip failure/raw fallback and touch details; all-counts failures; truncated bytes; write-up 404; metadata stall; stale view requests.
- Against a saved pre-fix HEAD, the same browser suite failed the initial-part, month-label/core, missing write-up fallback, metadata-stall and stale-view checks. This is recorded calibration, not a test suite which only saw the repaired state.
- The default map also rendered with all seven nondefault parts held indefinitely. Before: 1,105,373 compressed counts bytes. After: 225,876 bytes, **79.6% less**. The exact full gzip grows to about 1.76 MB; it is outside normal initial split loading. This is measured byte reduction, not a promised universal speedup.
- Four final rendered screenshots, inspected by root: `docs/evidence/p3-final-audit-20261106/render-{360,390,1024,1440}.png`. All visible SVG labels remain approximately 10 CSS px or larger, without horizontal overflow or clipped text. The first detector mistakenly included empty grid tick labels and omitted group transforms; it was corrected before any layout defect was claimed.
- JavaScript syntax, four Python module compilations, `git diff --check`, workflow YAML parsing and frozen dependency install pass. The static project has no separate production bundler/build gate.
- Local browser process startup is blocked by the sandbox's macOS bootstrap permission. Browser tests ran in the configured isolated MCP Playwright browser, using exactly the committed test function. The CLI driver imports/loads correctly; its Linux production invocation is pending CI.

## Files to review

Runtime: `app.js`, `index.html`, `writeup.md`, `README.md` in the selected folder. Pipeline: `scripts/config.py`, `scripts/export_web.py`, `scripts/fetch_glm.py`, `scripts/eda.py`. Outputs: `web/data/glm.json`, 18 new sum binary/gzip files, `eda/facts.json`, updated g1 graph. Tests: selected-folder `tests/test_p3_final_data.py`, root `tests/p3-final-browser.mjs` and `tests/run-p3-final-browser.mjs`. Root tooling: package scripts, pinned Playwright 1.65.0, lockfile/workspace, `.github/workflows/p3-final-check.yml`. Records: STATE, audit, this handoff and four render artifacts.

Adding the test dependency exposed an existing deprecated glob 10 dependency of elocuent. Its compatible globSync dependency is overridden to stable glob 14.0.4. pnpm 12 ignores the old package.json override field, so the override lives in pnpm-workspace.yaml. Clean frozen installation now has no deprecation warning. Versions and checkout/setup-node action releases were verified against the registry/provider. This is the reason for the tooling diff, not a suppressed warning.

## Remaining limits and Claude's next steps

Historic successful-download coverage is irrecoverable from aggregates. All 2,192 days have some listed-file coverage; listings total 628,930 versus 631,296 nominal slots. 161 days list fewer than 288, one lists 319. The exact five-minute claim was removed, and the final write-up explains listed-file provenance, missing coverage, lack of weighting and whole-cell land/ocean classification. No attempt was made to reconstruct missing raw data.

The write-up rubric explicitly penalizes clearly AI-generated writing. The existing owner-supplied process facts and candid AI-tool disclosure were preserved. No guaranteed grade or creativity bonus is claimed; the original strict review estimated 12-13/14 before these repairs. Team review remains appropriate.

Review the local commit, red-team the corrected page, then push the coordinated commit. The new workflow runs the live browser suite after the observed Pages build workflow completes on main. Verify that first CI run, live asset equality/new metadata, all part HTTP responses and the real live core flow. Update QUEUE/STATE and refresh Atlas owner briefing after publication. Separately confirm the original Gradescope receipt actually arrived in the appropriate inbox; root has not inspected that inbox and does not claim receipt verification.
