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
- DSC 102 Canvas scores: one-time pull + tracker file. BLOCKED on owner allowing canvas.ucsd.edu in the Claude
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
