"use strict";
// Single source of truth for tunable values in the prototype.
const CONFIG = {
  dataUrl: "web/data/glm.json",
  seasonLabels: { DJF: "DJF", MAM: "MAM", JJA: "JJA", SON: "SON", YEAR: "Whole year" },
  landUrl: "vendor/land-110m.json",
  teamUrl: "team.json",
  writeupUrl: "writeup.md",  // the team's own write-up; the section stays hidden until this file exists
  teamPlaceholder: "[TEAM NAME]",
  hourStart: 16,
  playMs: 350,
  maxSelected: 2,
  // Jump-to presets: a point inside the cell (lat, lon). The hour is not fixed here: a jump moves the slider to that
  // cell's own busiest local solar hour in the season on screen, so the preset never lands on a dim hour.
  jumps: [
    { id: "florida", label: "Central Florida", lat: 28.5, lon: -81.5 },
    { id: "plains", label: "Great Plains", lat: 41.5, lon: -98.5 },
    { id: "maracaibo", label: "Lake Maracaibo", lat: 9.5, lon: -71.5 },
  ],
  map: { w: 960, h: 880 },  // 120 x 110 degree field of view at equal degrees
  line: { w: 640, h: 400, m: { t: 18, r: 26, b: 42, l: 46 } },  // plot height h - t - b; title and legend band are added above
  years: { w: 640, h: 270, m: { t: 34, r: 52, b: 36, l: 46 } },  // top holds a two-line title, right the Land/Ocean labels
  legendPx: 10,       // smallest on-screen size, in CSS px, for SVG legend and axis text on narrow screens
  narrowPx: 520,      // below this chart width the hour axes show fewer ticks
  colorFloor: 0.08,   // start of the YlOrRd ramp, so the faintest non-zero cells still read against the ocean grey
  noneText: "fewer than 1 flash per year in the sample",  // counts are six-year means rounded to whole flashes
  loadingText: "Loading the lightning counts...",
  stallMs: 12000,     // no new bytes for this long = a stalled connection: abort and start the download again
  fetchTries: 3,      // attempts per file before giving up and showing failText
  failText: "The lightning data did not load. Reload the page to try again.",
  selColors: ["var(--sel-a)", "var(--sel-b)"],
};

// tip: the cell under the tooltip and where it was opened, so Play and the keyboard can refresh it in place.
const state = { hour: CONFIG.hourStart, clock: "local", season: "JJA", sel: [], selAge: [], timer: null, cursor: null, tip: null };
let D, M, path, cellsSel, legendG, legendAt, cursorRect, cellBox, colorScale, landMask, RAW, DOMAINS;
// SVG text is sized in viewBox units, so it shrinks with the chart. This returns the font size, in viewBox units,
// that keeps text at least CONFIG.legendPx CSS px tall (and never below the desktop size `base`).
function fontFor(svgSel, viewW, base) {
  const px = svgSel.node().getBoundingClientRect().width || viewW;
  return Math.max(base, (CONFIG.legendPx * viewW) / px);
}
const isNarrow = (svgSel) => (svgSel.node().getBoundingClientRect().width || Infinity) < CONFIG.narrowPx;
const gridCache = new Map();  // "season|clock" -> Float64Array of mean flashes per cell/hour
const pairData = new Map();  // season|clock -> exact six-year integer counts
const pairRequests = new Map();  // share an in-flight foreground/background download
let viewSerial = 0;
const $ = (s) => document.querySelector(s);
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
const clockLabel = () => (state.clock === "local" ? "local solar time" : "UTC");
const idx = (i, j, h) => (i * M.nlon + j) * M.hours + h;
const cellId = (i, j) => i * M.nlon + j;
function grid(season, clock) {
  // Counts for one season and clock, summed across seasons for the whole year. Cached after first use.
  const key = season + "|" + clock;
  if (gridCache.has(key)) return gridCache.get(key);
  const n = M.nlat * M.nlon * M.hours, ci = M.clocks.indexOf(clock);
  const out = new Float64Array(n);
  const seasons = season === "YEAR" ? M.seasons : [season];
  for (const s of seasons) {
    const base = (M.seasons.indexOf(s) * M.clocks.length + ci) * n;
    const part = pairData.get(s + "|" + clock);
    if (!part && !RAW) throw new Error(`counts are not loaded for ${s}/${clock}`);
    for (let k = 0; k < n; k++) out[k] += part ? part[k] : RAW[base + k];
  }
  // Divide after adding seasons, preserving fractions and every source cell's annual peak hour.
  const divisor = M.counts_divisor || 1;
  for (let k = 0; k < n; k++) out[k] /= divisor;
  gridCache.set(key, out);
  return out;
}
const counts = () => grid(state.season, state.clock);
const seasonFlashes = () => (state.season === "YEAR" ? M.flashes : M.flashes_by_season[state.season]);
// Counts are six-year means, so they carry fractions: whole numbers from 100 up, one decimal below that.
const fmtCount = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString();
const fmtDeg = (v, p, n) => Math.abs(v).toFixed(1) + "°" + (v < 0 ? n : p);
// A 1 degree cell is about 12,364 km2 at the equator and shrinks with cos(latitude), so the map colours flash
// density (flashes per 10,000 km2) rather than raw counts; the tooltip shows both.
const KM2_PER_DEG2_EQUATOR = 111.2 * 111.2;
let rowDensityFactor = [];  // per latitude row: 10,000 / cell area in km2
const density = (c, v) => v * rowDensityFactor[Math.floor(c / M.nlon)];

// Counts: fetch the gzipped file and inflate it with DecompressionStream; fall back to the raw file where that API
// is missing. Either way the subtitle says what is loading, because the file is the slowest part of first paint.
// Download one file, reporting progress in the subtitle. A connection that stops sending bytes for CONFIG.stallMs is
// aborted and retried (up to CONFIG.fetchTries times), because a stalled transfer otherwise leaves a blank page forever.
async function fetchBytes(url, label) {
  let lastErr;
  for (let attempt = 1; attempt <= CONFIG.fetchTries; attempt++) {
    const ctl = new AbortController();
    let timer = setTimeout(() => ctl.abort(), CONFIG.stallMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: attempt > 1 ? "reload" : "default" });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      const total = +r.headers.get("content-length") || 0, reader = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        clearTimeout(timer); timer = setTimeout(() => ctl.abort(), CONFIG.stallMs);
        const progressLabel = typeof label === "function" ? label() : label;
        if (total && progressLabel) $("#subtitle").textContent = `${progressLabel} ${Math.min(99, Math.round((100 * got) / total))}%`;
      }
      clearTimeout(timer);
      return new Blob(parts);
    } catch (e) {
      clearTimeout(timer); lastErr = e;
      if (e.message && e.message.includes("HTTP 404")) break;  // missing file: retrying will not help
    }
  }
  throw lastErr;
}
async function loadCounts(payload, label) {
  const checked = (buf) => {
    if (buf.byteLength !== payload.bytes) throw new Error(`counts file is ${buf.byteLength} bytes, expected ${payload.bytes}`);
    return new Uint16Array(buf);
  };
  if (typeof DecompressionStream === "function" && payload.gzip) {
    try {
      const gz = await fetchBytes(payload.gzip, label);
      return checked(await new Response(gz.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    } catch (e) { /* fall through to the raw file */ }
  }
  return checked(await (await fetchBytes(payload.file, label)).arrayBuffer());
}
async function loadJSON(url) {
  return JSON.parse(await (await fetchBytes(url, null)).text());
}
function loadPair(season, clock, label = null) {
  const key = season + "|" + clock;
  if (pairData.has(key)) return Promise.resolve();
  if (pairRequests.has(key)) return pairRequests.get(key);
  const payload = M.counts_parts[season][clock];
  const expected = M.nlat * M.nlon * M.hours * Uint16Array.BYTES_PER_ELEMENT;
  if (payload.bytes !== expected) return Promise.reject(new Error(`invalid part size for ${key}`));
  const request = loadCounts(payload, label).then((counts) => { pairData.set(key, counts); }).finally(() => { pairRequests.delete(key); });
  pairRequests.set(key, request);
  return request;
}
function ensureView(season, clock, label = null) {
  if (!M.counts_parts) return Promise.resolve();  // older metadata remains compatible with the full-file format
  return Promise.all((season === "YEAR" ? M.seasons : [season]).map((s) => loadPair(s, clock, label)));
}
async function prefetchRest() {
  for (const season of M.seasons) for (const clock of M.clocks) {
    // Background failure leaves the current view usable; selecting that view retries through loadPair().
    try { await loadPair(season, clock); } catch (e) { /* retry on demand */ }
  }
}
function syncViewControls() {
  document.querySelectorAll("input[name=season]").forEach((r) => { r.checked = r.value === state.season; });
  document.querySelectorAll("input[name=clock]").forEach((r) => { r.checked = r.value === state.clock; });
}
async function setView(season, clock) {
  const serial = ++viewSerial;
  stopPlay(); hideTip();
  $("#subtitle").textContent = `${CONFIG.loadingText} ${CONFIG.seasonLabels[season]}, ${clock === "local" ? "local solar time" : "UTC"}`;
  const dependentControls = document.querySelectorAll(".timebar input, .timebar button, #jumps button");
  dependentControls.forEach((e) => { e.disabled = true; });
  try {
    await ensureView(season, clock, () => serial === viewSerial ? CONFIG.loadingText : null);
    if (serial !== viewSerial) return false;
    state.season = season; state.clock = clock;
    syncViewControls(); setColorScale(); setSubtitle(); render(); drawLine();
    return true;
  } catch (e) {
    if (serial === viewSerial) { syncViewControls(); $("#subtitle").textContent = CONFIG.failText; }
    return false;
  } finally {
    if (serial === viewSerial) dependentControls.forEach((e) => { e.disabled = false; });
  }
}
// Write-up: plain text with "## " headings, "- " list items and blank-line paragraphs, rendered as text nodes only
// (no innerHTML), so nothing in the file can inject markup. Loaded on its own so a missing file never blocks the chart.
function renderWriteup(md) {
  const root = $("#writeup");
  let list = null;
  for (const block of md.replace(/\r/g, "").split(/\n\s*\n/)) {
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("- ")) {
        if (!list) list = root.appendChild(document.createElement("ul"));
        list.appendChild(document.createElement("li")).textContent = line.slice(2);
        continue;
      }
      list = null;
      const m = line.match(/^(#{1,3}) (.*)$/);
      const el = document.createElement(m ? `h${m[1].length}` : "p");
      el.textContent = m ? m[2] : line;
      root.appendChild(el);
    }
    list = null;
  }
  root.hidden = !root.childElementCount;
}
(async () => renderWriteup(await (await fetchBytes(CONFIG.writeupUrl, null)).text()))().catch(() => {
  // The static link remains usable when the inline copy cannot be fetched.
  $("#writeup-link").hidden = false;
});
$("#subtitle").textContent = CONFIG.loadingText;
// Controls do nothing until the counts arrive, so they stay disabled until init() (and stay so if loading fails).
const setControls = (on) => document.querySelectorAll(".controls input, .controls button").forEach((e) => { e.disabled = !on; });
setControls(false);
Promise.all([loadJSON(CONFIG.dataUrl), loadJSON(CONFIG.landUrl), loadJSON(CONFIG.teamUrl)]).then(async ([data, land, team]) => {
  D = data; M = data.meta; landMask = data.land;
  state.season = M.default_season;
  const monthName = (month) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));
  for (const season of M.seasons) {
    const months = M.season_months[season];
    CONFIG.seasonLabels[season] = `${monthName(months[0])}-${monthName(months[months.length - 1])} (${season})`;
  }
  if (M.counts_parts) await ensureView(state.season, state.clock, CONFIG.loadingText);
  else {
    const bytes = M.seasons.length * M.clocks.length * M.nlat * M.nlon * M.hours * Uint16Array.BYTES_PER_ELEMENT;
    RAW = await loadCounts({ file: M.counts_file, gzip: M.counts_gzip, bytes }, CONFIG.loadingText);
  }
  rowDensityFactor = d3.range(M.nlat).map((i) => 1e4 / ((M.km2_per_deg2_equator || KM2_PER_DEG2_EQUATOR) * M.cell * M.cell * Math.cos(((M.lat0 + (i + 0.5) * M.cell) * Math.PI) / 180)));
  init(land, team);
  // Two frames allow the initial map to paint before background traffic starts.
  if (M.counts_parts) requestAnimationFrame(() => requestAnimationFrame(() => { void prefetchRest(); }));
}).catch((err) => {
  console.error(err);
  $("#subtitle").textContent = CONFIG.failText;
});

function cellOf(lat, lon) {
  return cellId(Math.floor((lat - M.lat0) / M.cell), Math.floor((lon - M.lon0) / M.cell));
}
function cellCentre(c) {
  const i = Math.floor(c / M.nlon), j = c % M.nlon;
  return { lat: M.lat0 + (i + 0.5) * M.cell, lon: M.lon0 + (j + 0.5) * M.cell };
}
function curve(c) {
  // 24 hourly counts for one cell under the current clock.
  const i = Math.floor(c / M.nlon), j = c % M.nlon, a = counts(), out = [];
  for (let h = 0; h < M.hours; h++) out.push(a[idx(i, j, h)]);
  return out;
}
function normalise(a) { const m = d3.max(a) || 1; return a.map((v) => v / m); }
function refCurves() {
  // Land and ocean totals by hour, scaled to their own peaks.
  const a = counts(), land = new Array(M.hours).fill(0), ocean = new Array(M.hours).fill(0);
  for (let c = 0; c < M.nlat * M.nlon; c++) {
    const base = c * M.hours, t = landMask[c] ? land : ocean;
    for (let h = 0; h < M.hours; h++) t[h] += a[base + h];
  }
  return { land: normalise(land), ocean: normalise(ocean) };
}
function cellLabel(c) {
  const { lat, lon } = cellCentre(c);
  const preset = CONFIG.jumps.find((p) => cellOf(p.lat, p.lon) === c);
  return `${preset ? preset.label : landMask[c] ? "Land" : "Ocean"}, ${fmtDeg(lat, "N", "S")} ${fmtDeg(lon, "E", "W")}`;
}

function setSubtitle() {
  $("#subtitle").textContent = `${M.source}. ${M.period}, ${M.days_sampled} days sampled at ${M.sample}, averaged to one typical year: ${fmtCount(M.flashes)} flashes per year in the sample on a ${M.cell} degree grid. Showing ${CONFIG.seasonLabels[state.season]}: ${fmtCount(seasonFlashes())} flashes per year in the sample. Drag the hour, press Play, switch season, and click up to two cells to compare their daily rhythm.`;
}

function init(landTopo, team) {
  setControls(true);
  setSubtitle();
  $("#source").textContent = `Data: ${M.source}. Local solar hour = UTC hour + longitude / 15, so "4 PM" means mid afternoon everywhere on the map. ${M.artifact_cells_removed} cell${M.artifact_cells_removed === 1 ? "" : "s"} with a flat round-the-clock signal (a GLM false-event source over the Pacific, not weather) removed.`;
  const name = team.teamName === CONFIG.teamPlaceholder ? "" : `${team.teamName}: `;
  $("#team").textContent = `${name}${team.members.join(", ")}.`;

  const hourIn = $("#hour");
  hourIn.value = state.hour;
  hourIn.addEventListener("input", () => { state.hour = +hourIn.value; render(); });
  $("#play").addEventListener("click", togglePlay);
  document.querySelectorAll("input[name=clock]").forEach((r) => r.addEventListener("change", () => { void setView($("input[name=season]:checked").value, r.value); }));
  const sr = $("#season-radios");
  [...M.seasons, "YEAR"].forEach((sn) => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="radio" name="season" value="${sn}" ${sn === state.season ? "checked" : ""}/> ${CONFIG.seasonLabels[sn]}`;
    l.querySelector("input").addEventListener("change", () => { void setView(sn, $("input[name=clock]:checked").value); });
    sr.appendChild(l);
  });
  const jumps = $("#jumps");
  CONFIG.jumps.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "jump"; b.textContent = p.label; b.dataset.id = p.id;
    b.addEventListener("click", async () => {
      stopPlay();
      if (state.clock !== "local" && !(await setView(state.season, "local"))) return;
      const c = cellOf(p.lat, p.lon);
      select(c);
      const a = curve(c);
      if (d3.sum(a)) { state.hour = d3.maxIndex(a); hourIn.value = state.hour; }
      hideTip(); render(); drawLine();
    });
    jumps.appendChild(b);
  });

  // Map: equirectangular over the GLM field of view, 1 degree cells drawn as rects.
  const { w, h } = CONFIG.map;
  const svg = d3.select("#map").attr("viewBox", `0 0 ${w} ${h}`);
  // Fit the GLM field of view to the viewBox (corner points, not a polygon: d3 reads polygon winding on the sphere)
  // and clip the land outline to it.
  const lonEnd = M.lon0 + M.nlon * M.cell, latEnd = M.lat0 + M.nlat * M.cell;
  const proj = d3.geoEquirectangular().fitExtent([[0, 0], [w, h]], {
    type: "MultiPoint", coordinates: [[M.lon0, M.lat0], [lonEnd, M.lat0], [lonEnd, latEnd], [M.lon0, latEnd]],
  });
  const [x0, y1] = proj([M.lon0, M.lat0]), [x1, y0] = proj([lonEnd, latEnd]);
  proj.clipExtent([[x0, y0], [x1, y1]]);
  path = d3.geoPath(proj);
  svg.append("rect").attr("class", "ocean-bg").attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0);
  const cw = (x1 - x0) / M.nlon, ch = (y1 - y0) / M.nlat;
  const cells = d3.range(M.nlat * M.nlon);
  cellsSel = svg.append("g").selectAll("rect").data(cells).join("rect")
    .attr("class", "cell")
    .attr("x", (c) => x0 + (c % M.nlon) * cw)
    .attr("y", (c) => y1 - (Math.floor(c / M.nlon) + 1) * ch)
    .attr("width", cw + 0.3).attr("height", ch + 0.3)
    .on("pointermove", (ev, c) => { if (ev.pointerType === "mouse") showTip(ev, c); })
    .on("pointerleave", (ev) => { if (ev.pointerType === "mouse") hideTip(); })
    // A tap or click picks the cell and opens its tooltip, so touch screens get the details too.
    .on("click", (ev, c) => { stopPlay(); select(c); state.cursor = ev.detail === 0 ? c : null; render(); drawLine(); showTip(ev, c); });
  svg.append("path").datum(topojson.feature(landTopo, landTopo.objects.land)).attr("class", "land").attr("d", path);
  cursorRect = svg.append("rect").attr("class", "cursor").attr("width", cw).attr("height", ch).attr("visibility", "hidden");
  cellBox = (c) => ({ x: x0 + (c % M.nlon) * cw, y: y1 - (Math.floor(c / M.nlon) + 1) * ch, w: cw, h: ch });
  // Legend sits over the empty north-east Pacific corner, on its own backing panel.
  legendG = svg.append("g").attr("class", "legend");
  legendAt = [x0 + 10, y0 + 10];
  legendG.style("pointer-events", "none");
  cursorRect.raise();

  // Keyboard: the map takes focus; arrow keys move a cursor cell, Enter or Space picks it, Escape closes the tooltip.
  svg.attr("tabindex", 0).on("keydown", (ev) => {
    const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[ev.key];
    if (step) {
      ev.preventDefault();
      const c0 = state.cursor ?? state.sel[state.sel.length - 1] ?? cells[0];
      const i = Math.min(M.nlat - 1, Math.max(0, Math.floor(c0 / M.nlon) + step[0]));
      const j = Math.min(M.nlon - 1, Math.max(0, (c0 % M.nlon) + step[1]));
      state.cursor = cellId(i, j); render(); showTipAtCell(state.cursor);
    } else if ((ev.key === "Enter" || ev.key === " ") && state.cursor != null) {
      ev.preventDefault(); stopPlay(); select(state.cursor); render(); drawLine(); showTipAtCell(state.cursor);
    } else if (ev.key === "Escape") hideTip();
  }).on("blur", () => { state.cursor = null; render(); hideTip(); });
  // Tapping anywhere outside a map cell closes a tooltip that a tap opened.
  document.addEventListener("pointerdown", (ev) => { if (!ev.target.classList || !ev.target.classList.contains("cell")) hideTip(); });
  // SVG text scales with the chart, so on a narrow screen the legend and axes are redrawn at a readable size.
  let resizeT;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { hideTip(); setColorScale(); drawLine(); drawYears(); }, 150); });

  // Colour: sqrt scale on the per-hour flash density, domain fixed across hours AND seasons so the animation and the
  // season switch stay comparable (winter looks dimmer because it is).
  // Two domains: one shared by the four seasons (so switching season is comparable) and one for the whole-year
  // view, whose cells hold about four times the flashes; the legend is redrawn whenever the domain changes.
  const maxOf = (names) => { let m = 1; for (const sn of names) for (const clock of M.clocks) { const a = grid(sn, clock); for (let c = 0; c < cells.length; c++) for (let h = 0; h < M.hours; h++) { const v = density(c, a[c * M.hours + h]); if (v > m) m = v; } } return m; };
  DOMAINS = M.density_domains || { season: maxOf(M.seasons), YEAR: maxOf(["YEAR"]) };
  setColorScale();

  select(cellOf(CONFIG.jumps[0].lat, CONFIG.jumps[0].lon));
  render(); drawLine(); drawYears();
}

// "Six years, one shape": land and ocean shares by local solar hour, one thin line per year. Stability is the point.
function drawYears() {
  const { w, h, m } = CONFIG.years;
  const svg = d3.select("#years").attr("viewBox", `0 0 ${w} ${h}`);
  svg.selectAll("*").remove();
  const years = Object.keys(M.year_curves);
  const all = years.flatMap((y) => M.year_curves[y].land.concat(M.year_curves[y].ocean));
  const fs = fontFor(svg, w, 12), mt = fs * 2.6 + 6, ml = Math.max(m.l, fs * 3);  // two title lines; room for "10%"
  // Right margin from the measured width of the end labels: font widths differ by platform (Linux renders wider
  // than macOS), so a fixed multiple of the font size clipped "Ocean" in CI.
  const probe = svg.append("text").attr("class", "lbl").style("font-size", `${fs}px`).text("Ocean");
  const labelW = Math.max(probe.node().getComputedTextLength(), fs * 3.2);
  probe.remove();
  const x = d3.scaleLinear([0, M.hours - 1], [ml + fs, w - Math.max(m.r, labelW + 10)]);  // room for "Ocean" at any size
  const y = d3.scaleLinear([0, d3.max(all)], [h - m.b, mt]).nice();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).tickValues(isNarrow(svg) ? [0, 12, 23] : [0, 6, 12, 18, 23]).tickFormat((d) => (d === 0 ? "midnight" : d === 12 ? "noon" : hourLabel(d))))
    .call((g) => g.selectAll("text").style("font-size", `${fs}px`).attr("text-anchor", (d) => (d === 0 ? "start" : d === 23 ? "end" : "middle")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((d) => d + "%"))
    .call((g) => g.selectAll("text").style("font-size", `${fs}px`));
  // Two lines so the title fits the chart width at any screen size.
  const title = svg.append("text").attr("class", "lbl").attr("x", 4).attr("y", fs * 1.05).style("font-size", `${fs}px`);
  title.append("tspan").text("Land and ocean, each as a share of its own total,");
  title.append("tspan").attr("x", 4).attr("dy", "1.2em").text("one line per year (whole year, local solar time)");
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  years.forEach((yr) => {
    svg.append("path").datum(M.year_curves[yr].land).attr("class", "year-line land-year").attr("d", line);
    svg.append("path").datum(M.year_curves[yr].ocean).attr("class", "year-line ocean-year").attr("d", line);
  });
  // direct labels at the right end of each bundle, so the chart reads without the caption
  const last = (k) => d3.mean(years, (yr) => M.year_curves[yr][k][M.hours - 1]);
  // keep the two end labels at least one line apart when the bundles end close together
  let yl = y(last("land")), yo = y(last("ocean"));
  const gap = fs * 1.1;
  if (Math.abs(yl - yo) < gap) { const mid = (yl + yo) / 2, s = yl <= yo ? -1 : 1; yl = mid + (s * gap) / 2; yo = mid - (s * gap) / 2; }
  svg.append("text").attr("class", "lbl land-year-lbl").attr("x", x(M.hours - 1) + 4).attr("y", yl).style("font-size", `${fs}px`).attr("dominant-baseline", "middle").text("Land");
  svg.append("text").attr("class", "lbl ocean-year-lbl").attr("x", x(M.hours - 1) + 4).attr("y", yo).style("font-size", `${fs}px`).attr("dominant-baseline", "middle").text("Ocean");
  const peaks = (k) => years.map((yr) => M.year_curves[yr][k + "_peak"]);
  const span = (a) => { const lo = d3.min(a), hi = d3.max(a); return lo === hi ? hourLabel(lo) : `between ${hourLabel(lo)} and ${hourLabel(hi)}`; };
  $("#years-caption").textContent = `${years[0]} to ${years[years.length - 1]}, one line per year for land (solid) and ocean (dashed). Land peaked at ${span(peaks("land"))} in all ${years.length} years; the ocean curve is almost flat overnight, so its exact peak hour wanders ${span(peaks("ocean"))}. Whole year, local solar time.`;
}

function setColorScale() {
  const maxCount = state.season === "YEAR" ? DOMAINS.YEAR : DOMAINS.season;
  colorScale = d3.scaleSequentialSqrt([0, maxCount], (t) => d3.interpolateYlOrRd(CONFIG.colorFloor + (1 - CONFIG.colorFloor) * t));
  legendG.selectAll("*").remove();
  drawLegend(maxCount);
}

let selClock = 0;
function select(c) {
  // A third click replaces the oldest pick in place, so the other pick keeps its colour.
  if (state.sel.includes(c)) return;
  if (state.sel.length < CONFIG.maxSelected) { state.sel.push(c); state.selAge.push(++selClock); return; }
  const k = d3.minIndex(state.selAge);
  state.sel[k] = c; state.selAge[k] = ++selClock;
}

function render() {
  const a = counts(), h = state.hour;
  const hourText = `${hourLabel(h)} ${clockLabel()}`;
  $("#hour-out").textContent = hourText;
  $("#hour").setAttribute("aria-valuetext", hourText);
  cellsSel
    .attr("fill", (c) => { const v = a[c * M.hours + h]; return v > 0 ? colorScale(density(c, v)) : "none"; })
    // style(), not attr(): a presentation attribute loses to the .cell:hover rule, and the two picks must keep the
    // colours of their curves in the line chart
    .style("stroke", (c) => { const k = state.sel.indexOf(c); return k < 0 ? null : CONFIG.selColors[k]; })
    .classed("sel", (c) => state.sel.includes(c))
    .filter((c) => state.sel.includes(c)).raise();
  if (state.cursor != null) {
    const b = cellBox(state.cursor);
    cursorRect.attr("x", b.x).attr("y", b.y).attr("visibility", "visible").raise();
  } else cursorRect.attr("visibility", "hidden");
  if (state.tip) refreshTip();
  document.querySelectorAll(".jump").forEach((b) => {
    const p = CONFIG.jumps.find((j) => j.id === b.dataset.id);
    b.classList.toggle("on", state.sel.includes(cellOf(p.lat, p.lon)));
  });
  const total = d3.sum(d3.range(M.nlat * M.nlon), (c) => a[c * M.hours + h]);
  $("#map-caption").textContent = `${CONFIG.seasonLabels[state.season]}, flash density at ${hourLabel(h)} ${clockLabel()}: ${fmtCount(total)} flashes in this hour across the field of view. Colour is flashes per 10,000 km2 in the sample (cells shrink toward the poles, so counts are divided by cell area), on a square-root scale shared by every hour.`;
  d3.select("#line .hour-mark").attr("x1", lineX(h)).attr("x2", lineX(h));
}

function drawLegend(maxCount) {
  // Drawn at desktop size on its own backing panel, then scaled as a group so it stays readable on a narrow map.
  const k = fontFor(d3.select("#map"), CONFIG.map.w, 11) / 11;
  legendG.attr("transform", `translate(${legendAt[0]}, ${legendAt[1]}) scale(${k})`);
  const w = 200, hgt = 10, pad = 8, ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxCount * t * t));
  legendG.append("rect").attr("class", "legend-bg").attr("width", 292).attr("height", hgt + 44).attr("rx", 4);
  const g = legendG.append("g").attr("transform", `translate(${pad}, ${pad + 14})`);
  g.append("text").attr("y", -4).text(state.season === "YEAR" ? "Flashes per 10,000 km2 (whole year), sqrt scale" : "Flashes per 10,000 km2 (one season), sqrt scale");
  const id = "lg";
  const defs = g.append("defs").append("linearGradient").attr("id", id);
  d3.range(0, 1.001, 0.1).forEach((t) => defs.append("stop").attr("offset", t).attr("stop-color", colorScale(maxCount * t * t)));
  g.append("rect").attr("width", w).attr("height", hgt).attr("fill", `url(#${id})`).attr("stroke", "var(--rule)");
  g.selectAll("text.t").data(ticks).join("text").attr("class", "t")
    .attr("x", (_, i) => (i / (ticks.length - 1)) * w).attr("y", hgt + 12).attr("text-anchor", (_, i) => (i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"))
    .text((v) => v.toLocaleString());
}

function togglePlay() { state.timer ? stopPlay() : startPlay(); }
function startPlay() {
  $("#play").textContent = "Pause";
  state.timer = setInterval(() => { state.hour = (state.hour + 1) % M.hours; $("#hour").value = state.hour; render(); }, CONFIG.playMs);
}
function stopPlay() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null; $("#play").textContent = "Play";
}

// Tooltip. It remembers its cell and anchor point, so Play and the keyboard refresh it in place instead of leaving
// the previous hour on screen.
function showTip(ev, c) { state.tip = { c, x: ev.clientX, y: ev.clientY }; refreshTip(); }
function showTipAtCell(c) {
  const r = cellsSel.filter((d) => d === c).node().getBoundingClientRect();
  state.tip = { c, x: r.right, y: r.bottom }; refreshTip();
}
function refreshTip() {
  const { c, x, y } = state.tip, a = counts(), v = a[c * M.hours + state.hour], day = d3.sum(curve(c));
  const share = day ? ((100 * v) / day).toFixed(0) + "% of this cell's daily flashes" : CONFIG.noneText;
  const tip = $("#tip");
  tip.hidden = false;
  tip.replaceChildren();
  tip.appendChild(document.createElement("b")).textContent = cellLabel(c);
  [`${hourLabel(state.hour)} ${clockLabel()}: ${fmtCount(v)} flashes (${density(c, v).toFixed(1)} per 10,000 km2)`, share]
    .forEach((t) => { tip.appendChild(document.createElement("br")); tip.appendChild(document.createTextNode(t)); });
  // keep it on screen: flip left of / above the anchor when it would run off the right or bottom edge
  const pad = 14, tw = tip.offsetWidth, th = tip.offsetHeight;
  const left = x + pad + tw > window.innerWidth - pad ? x - pad - tw : x + pad;
  const top = y + pad + th > window.innerHeight - pad ? y - pad - th : y + pad;
  tip.style.left = Math.max(pad, left) + "px";
  tip.style.top = Math.max(pad, top) + "px";
}
function hideTip() { state.tip = null; $("#tip").hidden = true; }

// Line chart: hour of day on x, each series scaled to its own peak on y. The legend sits in a band above the plot,
// never over it, because the peaks it would cover are what the chart is for.
let lineX = () => 0;
function drawLine() {
  const { w, m } = CONFIG.line;
  const svg = d3.select("#line");
  svg.selectAll("*").remove();
  const fs = fontFor(svg, w, 12), rowH = fs * 1.35;
  const rows = [["All land cells", "ref", null], ["All ocean cells", "ref ocean", null]]
    .concat(state.sel.map((c, k) => [cellLabel(c), "pick", CONFIG.selColors[k]]));
  const titleH = fs * 1.4, band = (CONFIG.maxSelected + 2) * rowH + 8, top = titleH + band, bottom = Math.max(m.b, fs * 3.1), h = CONFIG.line.h + top - m.t + bottom - m.b;
  svg.attr("viewBox", `0 0 ${w} ${h}`);
  const x = d3.scaleLinear([0, M.hours - 1], [m.l + fs, w - m.r]);
  const y = d3.scaleLinear([0, 1], [h - bottom, top]);
  lineX = x;
  svg.append("text").attr("class", "lbl").attr("x", 4).attr("y", fs * 1.05).style("font-size", `${fs}px`).text("Share of the series' own peak hour");
  const leg = svg.append("g").attr("transform", `translate(${m.l}, ${titleH + 2})`);
  rows.forEach(([label, cls, color], i) => {
    const yy = i * rowH + rowH / 2;
    leg.append("line").attr("class", cls).attr("x1", 0).attr("x2", 28).attr("y1", yy).attr("y2", yy).style("stroke", color);
    leg.append("text").attr("class", "lbl").attr("x", 36).attr("y", yy).attr("dominant-baseline", "middle").style("font-size", `${fs}px`)
      .attr("fill", color).attr("font-weight", color ? 700 : null).text(label);
  });
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - bottom})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-(h - bottom - top)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - bottom})`)
    .call(d3.axisBottom(x).tickValues(isNarrow(svg) ? [0, 6, 12, 18] : [0, 3, 6, 9, 12, 15, 18, 21]).tickFormat((d) => (d === 0 ? "midnight" : d === 12 ? "noon" : hourLabel(d))))
    .call((g) => g.selectAll("text").style("font-size", `${fs}px`).attr("text-anchor", (d) => (d === 0 ? "start" : "middle")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l + fs},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")))
    .call((g) => g.selectAll("text").style("font-size", `${fs}px`));
  svg.append("text").attr("class", "lbl").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").style("font-size", `${fs}px`).text(`Hour of day, ${clockLabel()}`);
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  const ref = refCurves();
  svg.append("path").datum(ref.land).attr("class", "ref land-ref").attr("d", line);
  svg.append("path").datum(ref.ocean).attr("class", "ref ocean").attr("d", line);
  state.sel.forEach((c, k) => {
    const a = curve(c);
    if (d3.sum(a)) svg.append("path").datum(normalise(a)).attr("class", "pick").style("stroke", CONFIG.selColors[k]).attr("d", line);
  });
  svg.append("line").attr("class", "hour-mark").attr("y1", top).attr("y2", h - bottom).attr("x1", x(state.hour)).attr("x2", x(state.hour));
  const peak = (a) => hourLabel(d3.maxIndex(a));
  // an empty cell would otherwise report a peak at 12 AM (maxIndex of all zeros)
  const pick = state.sel.map((c) => { const a = curve(c); return d3.sum(a) ? `${cellLabel(c)} peaks at ${peak(a)}` : `${cellLabel(c)}: ${CONFIG.noneText}`; }).join("; ");
  $("#line-caption").textContent = `${CONFIG.seasonLabels[state.season]}: land peaks at ${peak(ref.land)} and ocean at ${peak(ref.ocean)} (${clockLabel()}). ${pick}. Each curve is divided by its own busiest hour.`;
}
