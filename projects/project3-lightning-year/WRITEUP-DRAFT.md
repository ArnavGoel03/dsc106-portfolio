One-year version (same question, all of 2024, season switch)

What changes from the 92-day version
- Data: every day of 2024 (366 days), same 1-in-15 sampling, same quality filter. 104,943 files in all (about 465 short of 288 a day, logged as skipped), 22.1 million good flashes after the same artifact cell is dropped.
- How we got it: our home link managed 170 KB/s to 4 MB/s, so a year would take 2 to 40 hours. We ran the same fetch script as a GitHub Actions workflow, one job per month on US runners next to the S3 bucket: 12 jobs, 3 minutes. We checked June to August against the home-link run: identical, cell by cell.
- Counts are kept per month, then summed into four seasons (DJF uses January, February and December 2024). The page loads one 5 MB binary file (uint16, [season][clock][cell][hour]) and sums seasons for the whole-year view. Still static, no server.

Design change: a season switch
- Why: the 92-day version answers "what hour" for the northern summer only. On a full year the honest answer depends on season and hemisphere, so the reader needs to move through seasons as well as hours.
- The switch has five positions: Winter, Spring, Summer, Autumn, Whole year. It opens on Summer so the first view matches the 92-day story.
- The colour scale is fixed across the four seasons as well as hours, so winter looks dimmer because it is. The whole-year view holds about four times the flashes per cell, so it gets its own scale and the legend redraws when you switch.

What the full year shows
- Land peaks at 4 PM, ocean at 3 AM; 41 percent of ocean flashes happen at night. 74 percent of land cells peak in the afternoon, 46 percent of ocean cells at night.
- The ocean peak moves with season: 6 AM in winter, 5 AM in spring, 3 AM in summer and autumn.
- Autumn, not summer, is the busiest season (6.8 million flashes to summer's 6.1 million). Winter is the quietest (4.1 million). We have not yet split the seasons by region, so why autumn leads is still an open question for the final.
- In winter the United States goes almost dark and the Amazon and northern Argentina carry the map. The Great Plains night storms are a summer and autumn feature in the season views; we only have season resolution, not month.
- Lake Maracaibo is the busiest single cell of the year (52,332 sampled flashes) and peaks at 3 AM.

Caveat added to the page
- One year is a sample, not a climatology.

Work split and people-hours: [same as above; the year version added about N hours: Actions workflow, binary export, season control, seven graphs]
