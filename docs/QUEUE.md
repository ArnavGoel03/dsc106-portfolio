# Work queue

Open rows are live; closed rows are struck through with a date and what closed them.

| Item | Status (2026-11-05) |
|---|---|
| Lightning version (projects/project3-lightning): GLM fetch, 92 days at 1 file per 5 min, quality flag 0 | Running in background since 14:05 IST, about 3 min per day, done about 18:45 IST; resumable via data/fetch_progress.json |
| Lightning: D3 prototype (hour scrubber + play, local/UTC toggle, click two cells, jump buttons, tooltip) | Built, screenshot checked on 2-day data; recheck colours and captions on full data |
| Lightning: 6 EDA graphs + cards + narration, aligned with the Google Doc plan | Built and checked by eye on 6-day data (round 2 red-team: coastline antimeridian artifact fixed, titles made data-driven, small-multiple layout fixed, Pacific artifact cell 7.5S 96.5W dropped with evidence in config.py). Full build chained after the fetch exits (data/build_full.log); round 3 red-team on full data |
| Lightning: checkpoint video (max 2 min, real voiceover, one upload) | Silent draft builds in the chain; needs Yash + Chau recordings via record_voiceover.sh, then ./make_video.sh a.m4a b.m4a; team name Group 19 set |
| Lightning: write-up | Google Doc "project 3 write up" (UCSD) now holds: teammate's plan (untouched), Title, Why this question, What we pull, transforms, design choices, caveats, dev process, 6 graphs + 3 prototype shots (6-day data, files *_6day in Drive), narration. Owner fills Work split, People-hours. July-vs-summer left as an open question in the doc at owner's request. Tonight: replace the 9 images with full-data versions (upload as *_final, Replace image) |
| Lightning: Drive folder | Created 2026-11-05 13:32 IST: UCSD Drive > DSC 106 Project 3 (Yash, Chau) > Checkpoint > "GLM lightning - When Does Lightning Strike? Day and Night over the Americas" (https://drive.google.com/drive/folders/1rN9QtSe-Qqe8xAKux654qJGS9vg_iI3T), 18 files from the 6-day build (1-day set trashed) plus 9 *_6day images used by the doc; re-upload after the full build |
| Lightning: push to GitHub Pages | ~~Not pushed~~ 2026-11-05 14:20 IST: pushed 8f3aea2, live at https://arnavgoel03.github.io/dsc106-portfolio/projects/project3-lightning/ (all assets 200). Push again after the full build |
| CMIP6 version (projects/project3-checkpoint) | Owned by the parallel session; never edited from the lightning session |
