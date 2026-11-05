# Narration script (owner reads everything)

Counted at 140 words per minute (265 words, digits counted as one word) this is about 1:56. Spoken digits add a few seconds, so read briskly; the limit is 2:00 and make_video.sh speeds the audio up to 1.15x if needed.
Numbers are generated from eda/facts.json; the team name and title come from team.json. Read it at your natural pace; do not rush to hit the clock.
Record in script order. Two-voice version: 3 clips (Yash, Chau, Yash), or 10 clips (one per block) for exact slide sync.

**0:00 to 0:04** (Team name and members, 10 words)

We are Group 19: Chau Nguyen and me, Yash Goel.

**0:04 to 0:19** (Dataset and the aspects used, 35 words)

Our dataset is GOES-16's lightning mapper. We sampled one file every 5 minutes for summer 2024, 314 thousand flashes, binned to a 1 degree grid by hour of day, in UTC and local solar time.

**0:19 to 0:27** (Exploratory graph 1, 16 words)

First, where. Land dominates: 63 percent of flashes, with hotspots in Florida, Colombia and the Amazon.

**0:27 to 0:35** (Exploratory graph 2, 20 words)

Second, when. Across the hemisphere lightning peaks at 4 PM; 1 to 6 PM holds 39 percent of all flashes.

**0:35 to 0:45** (Exploratory graph 3, 22 words)

Third, land against ocean. Land peaks at 5 PM, ocean at 9 AM, and 38 percent of ocean flashes happen at night.

**0:45 to 0:59** (Exploratory graph 4, 31 words)

Fourth, each cell's peak hour. 57 percent of land cells peak in the afternoon, 44 percent of ocean cells at night. The Great Plains are a night patch inside a continent.

**0:59 to 1:11** (Exploratory graph 5, 28 words)

Fifth, three regions. The Southeast peaks at 4 PM, the Amazon at 5 PM, but the Plains at 6 PM, with 47 percent of their lightning at night.

**1:11 to 1:22** (Exploratory graph 6, 25 words)

Sixth, four hours on one scale. At 3 PM the continents light up. At 3 AM the lightning sits over the sea and the Plains.

**1:22 to 1:36** (Title of the graph and the question, 31 words)

Our title: When Does Lightning Strike? Day and Night over the Americas. Our question: at what hour does lightning peak over land and ocean, and where does it strike at night?

**1:36 to 1:56** (Current progress on the final dynamic graph, 47 words)

Our D3 prototype: drag or play the hour and watch land light up by afternoon and the sea by night. Toggle local solar time to UTC. Click two cells to compare their daily curves, or jump to Florida, the Plains and Maracaibo. Left: polish and the write-up.
