Six-year climatology version (2019 to 2024, same question, season switch, "six years, one shape")

What changes from the one-year version
- Data: every complete GOES-16 GLM year, 2019 to 2024 (2,192 days), same 1-in-15 sampling and quality filter. 72 GitHub Actions jobs (one per year and month), 9.5 minutes. 2024 from this run matches the earlier one-year pull exactly.
- The Pacific false-event cell is dropped only in the years it was active (2021 to 2024); in 2019 and 2020 it held ordinary weather (12 and 0 flashes) and is kept.
- The map shows the six-year average: flashes per year in the sample, so the colour scale reads the same as before. 22.5 million good flashes per typical year.
- Per-year land and ocean curves ship as a few kilobytes of JSON next to the 5 MB counts file.

Design change: a stability chart
- Under the hour chart, "six years, one shape": land (solid) and ocean (dashed) shares by local solar hour, one thin line per year. Twelve lines, two bundles. The reader sees that the rhythm is not one year's weather.
- Land peaked at 4 PM in all six years. The ocean peak stayed between 2 AM and 6 AM.

What six years show
- Land 4 PM, ocean 3 AM; 41 percent of ocean flashes at night; 86 percent of land cells peak in the afternoon, 59 percent of ocean cells at night (both sharper than in 2024 alone, because the noise averages out).
- Autumn is the busiest season (7.1 million per year), then summer (6.7), spring (4.5), winter (4.2).
- 2023 was the busiest year (26.2 million sampled flashes), 2020 the quietest (20.6 million); the hour of the peak did not move.
- Lake Maracaibo peaks at 2 AM; the Great Plains at 7 PM with 45 percent of their lightning at night.

Caveat on the page
- Six years of one satellite at one sampling rate: a climatology of the sample, with GLM's own detection limits built in.
