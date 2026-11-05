Title
When Does Lightning Strike? Day and Night over the Americas

Why this question
Most people expect thunderstorms in the late afternoon. We want to check that against a satellite that watches the whole hemisphere, and see if it is also true over the ocean. GLM records where and when every flash happens, so we can ask "what hour?" for every 1 by 1 degree cell from Canada to Argentina. A single map of total lightning cannot show timing, so the reader needs to move through the hours.

What we pull right now
- GLM-L2-LCFA files from s3://noaa-goes16/GLM-L2-LCFA/ (NOAA Open Data on AWS). One file every 20 seconds, about 250 KB each, about 50 MB per hour.
- Sample: every 15th file (one per 5 minutes), 1 June to 31 August 2024. That is 92 days, 26,496 files, about 6 GB streamed and never stored. We keep only the counts.
- Open question: the table above says one week in July. The pipeline can do either; one week takes about 20 minutes, the summer takes about 5 hours. We decide after seeing whether one week is enough for the ocean cells, which get few flashes.
- Variables: flash_lat, flash_lon, flash_quality_flag (keep 0 = good), and the hour from the file name. flash_energy and flash_area are read for exploration only.

How we transform it (in addition to the list above)
- Local solar hour = UTC hour + longitude / 15, rounded down.
- Counts per 1 degree cell per hour, once in UTC and once in local solar time. 110 rows by 120 columns by 24 hours, about 1.3 MB of JSON. The page loads it once; there is no server.
- A cell near 50 degrees is only about 64 percent of the area of a cell at the equator, so the map colours flashes per 10,000 km2, not raw counts. The tooltip shows both.
- Land or ocean per cell from the Natural Earth 110m land polygons.
- When comparing cells, each 24 hour curve is divided by its own busiest hour. GLM misses more flashes in daylight and near the edge of its view, so shapes compare fairly and raw totals do not.
- The subtitle says the sampling, period and flash count. The footnote says the normalisation and the detection caveat.

Design choices
- Marks: one square per cell on an equirectangular map. Position = where, colour = flash density in the chosen hour.
- Colour: single hue, light yellow to dark red (YlOrRd), on a square root scale. Densities run from 0 to the thousands, so linear leaves the map empty and log makes 3 flashes look like 300. The legend shows real values. Empty cells are transparent so the coast shows through. The scale is fixed across all 24 hours; otherwise the night map would look as bright as the afternoon one.
- Not dots: millions of flashes as points is a solid blob over Florida and Colombia (overplotting). Not bubbles: area is read worse than colour on a dense grid and circles overlap in the hotspots.
- Hour slider with Play: the core of the design. Play shows the continents light up through the afternoon, go dark around midnight, and the lightning move out over the Gulf, the Caribbean and the Pacific before dawn. Only visible across hours.
- Local solar time / UTC toggle: in UTC the afternoon peak marches west with the sun; in local time it happens everywhere at once. That is why we converted.
- Click a cell: its 24 hour curve appears below the map, scaled to its own peak, next to grey reference curves for all land and all ocean. A second click adds a second cell. A third replaces the oldest.
- Jump buttons: Central Florida (afternoon), Great Plains (night storms), Lake Maracaibo (small hours). Hover shows the count, the density and the share of the cell's day.
- Alternatives we dropped: 24 small static maps (cannot follow one place through the day, no room for curves). Animation with no slider (cannot stop at 3 AM over Nebraska). Land vs ocean lines only (answers the headline but hides where the night lightning is). We kept those lines as the grey reference.

Caveats on the page
GLM counts in-cloud plus cloud-to-ground flashes, so we say flashes, not strikes. Detection is weaker by day and at the edge of the view. One summer of one year is a sample, not a climatology.

Development process
Work split: [Yash: data pipeline, D3 map and interactions, checkpoint video. Chau: ...]
People-hours: [about N in total: N data, N D3, N EDA and video, N write-up]
What took longest: getting the data out of S3. Files are small but our link gave about 0.5 MB per second no matter how many downloads ran at once, so one day took about 3 minutes and the summer about 5 hours. Opening NetCDF files from several threads crashed (HDF5 is not thread safe); fixed by downloading in parallel and parsing in one thread. In D3, fitting the map to the GLM view took longer than expected: d3 reads polygon winding on the sphere, and a rectangle wound the wrong way selects the rest of the globe.
