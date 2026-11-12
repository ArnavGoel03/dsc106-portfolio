# DSC 106 portfolio: state and coursework queue

Live: https://arnavgoel03.github.io/dsc106-portfolio/ (GitHub Pages, deploys on push to main).

## Labs
- Lab 1, Lab 2: done (earlier sessions).
- Lab 3 (Introduction to JS): code done 2026-10-15. All steps 1 to 5 (incl. optional Step 5) graded PASS
  by an adversarial review against https://dsc106.com/labs/lab03/ and checked on localhost in Chrome
  (nav links, current page, target=_blank on GitHub, dark mode persisted across reload, switcher top right).
  Hardening after review: index.html path matching, invalid saved theme ignored, blocked storage tolerated,
  nav margin so the switcher does not cover the GitHub link.
  ~~OWNER ACTION: record the 1 minute mp4 (present site, switch Automatic/Light/Dark and refresh, say the most
  interesting thing learned) and submit repo link + site link + video on Gradescope. Must be your own voice.~~
  SUBMITTED 2026-10-17 (IST, before the Oct 16 11:59 PM PDT deadline): Gradescope submission 438088147, status
  Submitted. Q1 repo link, Q2 site link, Q3 DSC106-Lab3-ArnavGoel-FINAL-v2.mp4 (59.2 s, h264+aac, cut from a
  6:18 Zoom recording: silences, a Mail setup detour and false starts removed, 1.156x uniform speed, loudnorm).
  Pre-submit checks the same day: red-team workflow (5 agents, no findings) and a step-by-step spec grader,
  every Lab 3 requirement PASS, live files byte-identical to HEAD. Fallback cut from a parallel session stays
  on the Desktop as DSC106-Lab3-ArnavGoel-FINAL.mp4.
- Lab 4 (JavaScript II): code done 2026-10-22, spec https://dsc106.com/labs/lab04/ (now live). Done: lib/projects.json
  (12 projects, year field, 2025 and 2026), fetchJSON/renderProjects/fetchGitHubData in global.js, projects/projects.js
  (count in .projects-title), index.js (first 3 projects + GitHub stats for ArnavGoel03 in #profile-stats), CSS grid
  for the stats. Verified on localhost in Chrome: 12 cards and "12 Projects" on /projects/, 3 cards + live GitHub
  numbers on home, all images load, no console errors; item-by-item spec grading in the session report.
  Years are my guesses from project context, edit lib/projects.json if wrong.
  ~~OWNER ACTION: record a 1 minute mp4 in your own voice (present the site, show the projects page count, the home
  page latest projects and GitHub stats, say the most interesting thing learned AND answer one "Think about it"
  question from the lab), then submit repo link + site link + video on Gradescope. Due Fri Oct 23 11:59 PM PDT.~~
  SUBMITTED 2026-10-25 ~12:24 IST (Sat Oct 24 23:54 PDT) using 1 lab slip day (labs allow max 1): Gradescope
  submission 441082661, shows "23 Hours, 55 Minutes Late". Q1 repo + site links, Q2 DSC106-Lab4-ArnavGoel-FINAL.mp4
  (57.4 s, h264+aac, cut from a 144 s Zoom take: dead air, false starts and the optional projects.json beat removed,
  1.15x, loudnorm). Verified on Gradescope by a Chrome-enabled helper session, and the cut checked by re-transcribing
  it plus a 3 s frame sheet: home 3 projects, GitHub stats, Projects page with "12 Projects", learned point, and the
  "why clear the container" Think About It answer are all present. Slip days used: 1 of 6.

- Lab 6 (D3 quantitative viz): code done 2026-10-31, spec https://dsc106.com/labs/lab06/. meta/index.html + meta/main.js
  (summary stats, commit scatterplot, tooltip, sqrt dot size, brushing with count and language breakdown), Meta nav link,
  meta/loc.csv from elocuent (re-run `npx elocuent -d . -o meta/loc.csv --spaces 2` after new commits). Live files
  fetched from Pages. 2026-11-07 requirements/rubric audit: every required webpage feature is present; stale CSV refreshed
  to 4,333 lines / 33 tracked web files / 52 represented commits, summary/language stats wrap on phones and tooltips
  stay inside the viewport. All 20 browser checks pass on the live Meta page (source `7bb149c`), with desktop/phone/dark renders inspected;
  served JavaScript/CSS/CSV match the checkout. Post-Pages CI run 42350080137 passed both Lab 6 and existing P3 checks.
  Checks are calibrated on the old defects and wired into the existing post-Pages live workflow. Full checklist and
  validation scope: `docs/LAB6-AUDIT-2026-11-07.md`.
  OWNER ACTION: record the 1 minute mp4 (script: Coursework/DSC106/DSC106-Lab6-Video-Script.md), submit repo + site + video
  on Gradescope. Due Fri Nov 6 11:59 PM PDT. Owner's 2026-11-07 screenshot shows Q1 repo + Meta-page links saved,
  but Q2 says "No files uploaded". This audit did not submit or resubmit.
- Lab 5 (D3 pie chart): code done and live 2026-10-25, commit c38f1e4. All steps plus the Step 5.4 extra-credit fix
  (search and pie selection combine both ways via update() in projects/projects.js). Verified headless (12 cards, 2 wedges,
  search+wedge both orders, stale selection cleared) and live file cmp. OWNER ACTION: record the 1 minute video from
  the script page and submit on Gradescope by Fri Oct 30 11:59 PM PDT.
  Course-wide dates and slip days: ~/Documents/Coursework/FALL-2026-COURSES.md (private, not in this repo).

- Lab 7 (Mapbox geospatial, Bikewatching): built 2026-11-07 in its own repo, https://github.com/ArnavGoel03/bikewatching,
  live at https://arnavgoel03.github.io/bikewatching/ (deploys by GitHub Actions, which injects the Mapbox token from the
  MAPBOX_TOKEN repo secret; the token is never committed). Steps 0 to 6 there; Step 7 here: Bikewatching card in
  lib/projects.json (url field, screenshot images/projects/bikewatching.jpg) and renderProjects links titles that have an
  http(s) url. Verified: 7 logic tests against an independent Python count of the real data, 27 browser checks passing
  on the live site, live files byte-identical to HEAD, Projects page shows 13 cards with the link and no console errors.
  Later the same night: 3 red-team rounds plus an independent audit; fixes through bikewatching a75f1bf
  (39 live browser checks). Gradescope Q1 links saved (submission 445954462); the video (Q2) is the owner's.
  Video script kept with the private course notes, not in this repo. Due Fri Nov 13 11:59 PM PT.

## Other coursework asked for in the same session
- ~~DSC 102 second assignment: BLOCKED on the course website URL.~~ Cleared 2026-10-15: it is PA1 (site
  https://aismithlab.com/DSC102FA26/assignments/), verified 80/80 against the TA answers on the real data and
  submitted on Canvas. Record lives in ~/dev/dsc102-pa1/NOTES.md.

## Queue opened 2026-10-22 (IST, session after midnight)
- Project 2 final (due Wed 10/21 11:59 PM PDT = Thu 12:29 PM IST; late until 10/23): IN FLIGHT. Owner asked for
  a final for BOTH teams that submitted the checkpoint with them on it:
  - Team A, Yuxuan Zhu + Andy Li + Yash (official per Team Formation): proposition "National wealth is a reliable
    predictor of better health". Build at projects/project2-wealth-health/.
  - Team B, Alpaslan Ozbas + Bora Vanli + Yash: proposition "Women's gains in education have not translated into
    gains in work". Build at projects/project2-women-work/.
  Gradescope keeps only the latest group submission per student, so only one team should add Yash to the final.
  2026-10-22 update: owner wants to stay with the stronger team. Checkpoint comparison favours Team A, so the
  Team B build was stopped (partial files, if any, in projects/project2-women-work/ are not to be shipped).
- Apology to Team B on Discord: DRAFTED in chat, owner sends. Read Team A Discord chat: BLOCKED, Discord is
  logged out in Chrome and desktop control is not available in this session.
- Checkpoint PDFs: Team B saved to ~/Downloads/DSC106-P2-Checkpoint-TeamOzbasVanli.pdf. Team A download blocked
  by Chrome's multiple-download guard; read in the viewer instead.
- DSC 102 Canvas scores: one-time pull + tracker file. BLOCKED on owner allowing canvas.ucsd.edu in the browser
  extension site permissions.
- ~~DSC 106 Lab 4: open, due 10/23 11:59 PM PDT.~~ Submitted 2026-10-25 with 1 slip day (see Labs). Lecture 8 check-in draft ready, owner submits.

- 2026-10-22 status, Project 2 finals (both live on GitHub Pages, checked over the network: page 200, both PNGs 200):
  - Team A (Zhu, Li, Goel): https://arnavgoel03.github.io/dsc106-portfolio/projects/project2-wealth-health/
  - Team B (Ozbas, Vanli, Goel): https://arnavgoel03.github.io/dsc106-portfolio/projects/project2-women-work/
  Each went through: build, independent strict rubric grade, two aggressive red-team agents (harsh TA grader +
  peer reviewer/fact checker re-running make_charts.py), fixes, re-score. Builder self-score after fixes: A ~13/14,
  B ~13.5/14; not independently re-graded after the last round. Charts viewed by eye after the final render.
  OWNER ACTION: each team submits its own URL plus the team feedback form on Gradescope (due 10/21 11:59 PM PDT,
  late until 10/23). Only ONE team may add Yash, since Gradescope keeps the latest group submission per student.

## Project 3 (interactive, CMIP6), 2026-11-05
- Prototype LIVE: https://arnavgoel03.github.io/dsc106-portfolio/projects/project3-checkpoint/ (commit 4ed2286). Pages build "built"; page and all 6 assets return 200.
- Verified locally in chrome-headless-shell before the push: 0 console errors; scenario radios, year slider, Play, model dropdown, hatch toggle, cell tooltip and click-for-lines all work at 1440 and 390 px. Phone width still renders about 470 px wide (scenario fieldset); not fixed yet.
- Published only page files plus data pipeline scripts. Kept local and unpublished: narration, team.json, README/REDTEAM, EDA, shots, video (they name the old team).
- Official group changed 2026-11-02 to Yash + Chau Nguyen (TA Ben Pham, Group 19). Still owed: write-up (rationale, transformations, work split, people-hours), Gradescope URL by Wed 11/11 11:59 PM PT (owner said do not submit yet).

## Project 3 final: selected six-year Lightning version, 2026-11-06

- The final selection supersedes the CMIP6 prototype above: https://arnavgoel03.github.io/dsc106-portfolio/projects/project3-lightning-climatology/.
- The shipping session records Gradescope submission 445482031, Group 19 (Yash + Chau), on 2026-11-06. This audit did not submit or resubmit and has not independently checked the receipt inbox.
- Thorough audit and local repairs are in `docs/P3-FINAL-REDTEAM-2026-11-06.md`.
- Verified locally: 72 browser checks, 10 offline data tests, JavaScript/Python syntax, clean dependency install, diff checks and inspected renders at 360/390/1024/1440. Exact six-year counts preserve source peak hours and sparse cells; default compressed counts bytes fall from 1,105,373 to 225,876.
- ~~Publication is pending arnavgoel-53's review/push and live verification.~~ 2026-11-06: published. Source commits 9b5d9a0 (audit repairs), 41aeb89 (whole-number counts, failure-only write-up link), 51d832e (Ocean label margin from measured width). Live CI "P3 final live regression" run 42201317304 on 51d832e: 72 of 72 checks passed against the deployed page (https://github.com/ArnavGoel03/dsc106-portfolio/actions/runs/42201317304). Gradescope 445482031 (Yash + Chau) was verified on its submission page on 2026-11-06; Gradescope sends the submitter no receipt email for link answers. The URL is unchanged, so no resubmission was needed.
- Historic successful-download coverage cannot be reconstructed from aggregate artifacts. The final write-up discloses this limit; no NOAA refetch or coverage weighting was performed.
- Second audit source `872d518`: downloader counts/completion markers commit atomically, two unsupported annual/per-cell claims removed, human-readable slider accessibility added. Verified 17/17 numerical tests and 75/75 local browser checks, including source-to-render expectations and deliberately broken renderer/Pause controls. Published with the expanded post-Pages live regression gate; its source identity/result is available in [workflow history](https://github.com/ArnavGoel03/dsc106-portfolio/actions/workflows/p3-final-check.yml). Detailed evidence and optional polish: `docs/P3-FINAL-RECHECK-2026-11-06.md`. Existing data and Gradescope submission are unchanged.
- The obsolete npm lockfile was removed after GitHub reported vulnerable minimatch in it. The canonical pnpm graph uses patched 11.0.5; frozen installation and dependency audit pass with zero advisories. Browser checks compare the visible selected SVG curve path as well as bound values.
