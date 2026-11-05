# Narration script (two voices)

Counted at 140 words per minute (259 words, digits counted as one word) this is about 1:54. Spoken digits add a few seconds, so read briskly; the limit is 2:00 and make_video.sh speeds the audio up to 1.15x if needed.
Numbers are generated from eda/facts.json; the team name and title come from team.json. Read it at your natural pace; do not rush to hit the clock.
Record in script order. Two-voice version: 3 clips (Yash, Chau, Yash), or 10 clips (one per block) for exact slide sync.

## Yash
**0:00 to 0:04** (Team name and members, 10 words)

We are Group 19: Chau Nguyen and me, Yash Goel.

**0:04 to 0:19** (Dataset and the aspects used, 33 words)

Our dataset is GOES-16's lightning mapper. One file every 5 minutes through all of 2024, 22.1 million sampled flashes, on a 1 degree grid by hour and season, UTC and local solar time.

**0:19 to 0:27** (Exploratory graph 1, 18 words)

First, where. Land dominates: 80 percent of flashes, hotspots: Lake Maracaibo, northern Colombia, the Amazon, the Gulf coast.

**0:27 to 0:34** (Exploratory graph 2, 17 words)

Second, when. Lightning peaks at 4 PM; 1 to 6 PM holds 45 percent of all flashes.

## Chau
**0:34 to 0:44** (Exploratory graph 3, 22 words)

Third, land against ocean. Land peaks at 4 PM, ocean at 3 AM, and 41 percent of ocean flashes happen at night.

**0:44 to 0:57** (Exploratory graph 4, 31 words)

Fourth, each cell's peak hour. 74 percent of land cells peak in the afternoon, 46 percent of ocean cells at night. The Great Plains are the evening patch inside a continent.

**0:57 to 1:09** (Exploratory graph 5, 26 words)

Fifth, three regions. The Southeast peaks at 4 PM, the Amazon at 4 PM, but the Plains at 7 PM, 44 percent of it at night.

**1:09 to 1:23** (Exploratory graph 6, 32 words)

Sixth, the seasons. Autumn is busiest with 31 percent of the year's flashes, winter quietest at 19. In winter the north goes dark and South America takes over, hence our season switch.

## Yash
**1:23 to 1:36** (Title of the graph and the question, 31 words)

Our title: When Does Lightning Strike? Day and Night over the Americas. Our question: at what hour does lightning peak over land and ocean, and where does it strike at night?

**1:37 to 1:54** (Current progress on the final dynamic graph, 39 words)

Our D3 prototype: play the hour and watch land light up by afternoon, the sea by night. Switch season or clock, click two cells to compare, or jump to Florida, the Plains and Maracaibo. Left: polish and the write-up.
