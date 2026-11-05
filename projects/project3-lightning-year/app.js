"use strict";
// Single source of truth for tunable values in the prototype.
const CONFIG = {
  dataUrl: "web/data/glm.json",
  countsUrl: "web/data/glm_counts.bin",     // uint16 LE [season][clock][cell][hour], see scripts/export_web.py
  countsGzUrl: "web/data/glm_counts.bin.gz", // same bytes gzipped (about 1 MB instead of 5); inflated in the browser
  seasonLabels: { DJF: "Winter (DJF)", MAM: "Spring (MAM)", JJA: "Summer (JJA)", SON: "Autumn (SON)", YEAR: "Whole year" },
  landUrl: "vendor/land-110m.json",
  teamUrl: "team.json",
  teamPlaceholder: "[TEAM NAME]",
  hourStart: 16,
  playMs: 350,
  maxSelected: 2,
  // Jump-to presets: cell centre (lat, lon) and the local solar hour that shows the pattern.
  jumps: [
    { id: "florida", label: "Central Florida", lat: 28.0, lon: -81.5, hour: 16 },
    { id: "plains", label: "Great Plains", lat: 41.0, lon: -98.5, hour: 22 },
    { id: "maracaibo", label: "Lake Maracaibo", lat: 9.5, lon: -71.5, hour: 2 },
  ],
  map: { w: 960, h: 880 },  // 120 x 110 degree field of view at equal degrees
  line: { w: 640, h: 420, m: { t: 18, r: 14, b: 42, l: 46 } },
  selColors: ["var(--sel-a)", "var(--sel-b)"],
};

const state = { hour: CONFIG.hourStart, clock: "local", season: "JJA", sel: [], timer: null };
let D, M, path, cellsSel, legendG, colorScale, landMask, RAW;
const gridCache = new Map();  // "season|clock" -> Uint32Array of nlat*nlon*24 counts
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
  const out = new Uint32Array(n);
  const seasons = season === "YEAR" ? M.seasons : [season];
  for (const s of seasons) {
    const base = (M.seasons.indexOf(s) * M.clocks.length + ci) * n;
    for (let k = 0; k < n; k++) out[k] += RAW[base + k];
  }
  gridCache.set(key, out);
  return out;
}
const counts = () => grid(state.season, state.clock);
const seasonFlashes = () => (state.season === "YEAR" ? M.flashes : M.flashes_by_season[state.season]);
const seasonDays = () => (state.season === "YEAR" ? M.days_sampled : M.days_by_season[state.season]);
const fmtDeg = (v, p, n) => Math.abs(v).toFixed(1) + "°" + (v < 0 ? n : p);
// A 1 degree cell is about 12,364 km2 at the equator and shrinks with cos(latitude), so the map colours flash
// density (flashes per 10,000 km2) rather than raw counts; the tooltip shows both.
const KM2_PER_DEG2_EQUATOR = 111.2 * 111.2;
let rowDensityFactor = [];  // per latitude row: 10,000 / cell area in km2
const density = (c, v) => v * rowDensityFactor[Math.floor(c / M.nlon)];

// Counts: fetch the gzipped file and inflate it with DecompressionStream; fall back to the raw file where that API
// is missing. Either way the subtitle says what is loading, because the file is the slowest part of first paint.
async function loadCounts() {
  if (typeof DecompressionStream === "function") {
    try {
      const r = await fetch(CONFIG.countsGzUrl);
      if (r.ok) return await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    } catch (e) { /* fall through to the raw file */ }
  }
  return (await fetch(CONFIG.countsUrl)).arrayBuffer();
}
$("#subtitle").textContent = "Loading the lightning counts (about 1 MB)...";
Promise.all([d3.json(CONFIG.dataUrl), d3.json(CONFIG.landUrl), d3.json(CONFIG.teamUrl), loadCounts()]).then(([data, land, team, buf]) => {
  D = data; M = data.meta; landMask = data.land; RAW = new Uint16Array(buf);
  state.season = M.default_season;
  rowDensityFactor = d3.range(M.nlat).map((i) => 1e4 / (KM2_PER_DEG2_EQUATOR * M.cell * M.cell * Math.cos(((M.lat0 + (i + 0.5) * M.cell) * Math.PI) / 180)));
  init(land, team);
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
  $("#subtitle").textContent = `${M.source}. ${M.period}, ${M.days_sampled} days sampled at ${M.sample}: ${M.flashes.toLocaleString()} flashes on a ${M.cell} degree grid. Showing ${CONFIG.seasonLabels[state.season]}: ${seasonDays()} days, ${seasonFlashes().toLocaleString()} flashes. Drag the hour, press Play, switch season, and click up to two cells to compare their daily rhythm.`;
}

function init(landTopo, team) {
  setSubtitle();
  $("#source").textContent = `Data: ${M.source}. Local solar hour = UTC hour + longitude / 15, so "4 PM" means mid afternoon everywhere on the map. ${M.artifact_cells_removed} cell${M.artifact_cells_removed === 1 ? "" : "s"} with a flat round-the-clock signal (a GLM false-event source over the Pacific, not weather) removed.`;
  const name = team.teamName === CONFIG.teamPlaceholder ? "" : `${team.teamName}: `;
  $("#team").textContent = `${name}${team.members.join(", ")}.`;

  const hourIn = $("#hour");
  hourIn.value = state.hour;
  hourIn.addEventListener("input", () => { state.hour = +hourIn.value; render(); });
  $("#play").addEventListener("click", togglePlay);
  document.querySelectorAll("input[name=clock]").forEach((r) => r.addEventListener("change", () => {
    state.clock = r.value; render(); drawLine();
  }));
  const sr = $("#season-radios");
  [...M.seasons, "YEAR"].forEach((sn) => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="radio" name="season" value="${sn}" ${sn === state.season ? "checked" : ""}/> ${CONFIG.seasonLabels[sn]}`;
    l.querySelector("input").addEventListener("change", () => { state.season = sn; setSubtitle(); render(); drawLine(); });
    sr.appendChild(l);
  });
  const jumps = $("#jumps");
  CONFIG.jumps.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "jump"; b.textContent = p.label; b.dataset.id = p.id;
    b.addEventListener("click", () => {
      stopPlay();
      select(cellOf(p.lat, p.lon));
      state.hour = p.hour; hourIn.value = p.hour;
      if (state.clock !== "local") { state.clock = "local"; $("input[name=clock][value=local]").checked = true; }
      render(); drawLine();
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
    .on("mousemove", showTip).on("mouseleave", hideTip)
    .on("click", (_, c) => { stopPlay(); select(c); render(); drawLine(); });
  svg.append("path").datum(topojson.feature(landTopo, landTopo.objects.land)).attr("class", "land").attr("d", path);
  legendG = svg.append("g").attr("class", "legend").attr("transform", `translate(${x1 - 222}, ${y0 + 18})`);

  // Colour: sqrt scale on the per-hour flash density, domain fixed across hours AND seasons so the animation and the
  // season switch stay comparable (winter looks dimmer because it is).
  let maxCount = 1;
  for (const sn of M.seasons) {
    const a = grid(sn, "local");
    for (let c = 0; c < cells.length; c++) for (let h = 0; h < M.hours; h++) { const v = density(c, a[c * M.hours + h]); if (v > maxCount) maxCount = v; }
  }
  colorScale = d3.scaleSequentialSqrt([0, maxCount], d3.interpolateYlOrRd);
  drawLegend(maxCount);

  select(cellOf(CONFIG.jumps[0].lat, CONFIG.jumps[0].lon));
  render(); drawLine();
}

function select(c) {
  if (state.sel.includes(c)) return;
  state.sel.push(c);
  if (state.sel.length > CONFIG.maxSelected) state.sel.shift();
}

function render() {
  const a = counts(), h = state.hour;
  $("#hour-out").textContent = `${hourLabel(h)} ${clockLabel()}`;
  cellsSel
    .attr("fill", (c) => { const v = a[c * M.hours + h]; return v > 0 ? colorScale(density(c, v)) : "none"; })
    .attr("stroke", (c) => { const k = state.sel.indexOf(c); return k < 0 ? null : CONFIG.selColors[k]; })
    .classed("sel", (c) => state.sel.includes(c))
    .filter((c) => state.sel.includes(c)).raise();
  document.querySelectorAll(".jump").forEach((b) => {
    const p = CONFIG.jumps.find((j) => j.id === b.dataset.id);
    b.classList.toggle("on", state.sel.includes(cellOf(p.lat, p.lon)));
  });
  const total = d3.sum(d3.range(M.nlat * M.nlon), (c) => a[c * M.hours + h]);
  $("#map-caption").textContent = `${CONFIG.seasonLabels[state.season]}, flash density at ${hourLabel(h)} ${clockLabel()}: ${total.toLocaleString()} flashes in this hour across the field of view. Colour is flashes per 10,000 km2 in the sample (cells shrink toward the poles, so counts are divided by cell area), on a square-root scale shared by every hour.`;
  d3.select("#line .hour-mark").attr("x1", lineX(h)).attr("x2", lineX(h));
}

function drawLegend(maxCount) {
  const w = 200, hgt = 10, ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxCount * t * t));
  const id = "lg";
  const defs = legendG.append("defs").append("linearGradient").attr("id", id);
  d3.range(0, 1.001, 0.1).forEach((t) => defs.append("stop").attr("offset", t).attr("stop-color", colorScale(maxCount * t * t)));
  legendG.append("rect").attr("width", w).attr("height", hgt).attr("fill", `url(#${id})`).attr("stroke", "var(--rule)");
  legendG.selectAll("text.t").data(ticks).join("text").attr("class", "t")
    .attr("x", (_, i) => (i / (ticks.length - 1)) * w).attr("y", hgt + 12).attr("text-anchor", (_, i) => (i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"))
    .text((v) => v.toLocaleString());
  legendG.append("text").attr("y", -4).text("Flashes per 10,000 km2, sqrt scale");
}

function togglePlay() { state.timer ? stopPlay() : startPlay(); }
function startPlay() {
  $("#play").textContent = "Pause";
  state.timer = setInterval(() => { state.hour = (state.hour + 1) % M.hours; $("#hour").value = state.hour; render(); }, CONFIG.playMs);
}
function stopPlay() { if (state.timer) clearInterval(state.timer); state.timer = null; $("#play").textContent = "Play"; }

function showTip(ev, c) {
  const a = counts(), v = a[c * M.hours + state.hour], day = d3.sum(curve(c));
  const share = day ? ((100 * v) / day).toFixed(0) + "% of this cell's daily flashes" : "no flashes in the sample";
  const tip = $("#tip");
  tip.hidden = false;
  tip.innerHTML = `<b>${cellLabel(c)}</b><br>${hourLabel(state.hour)} ${clockLabel()}: ${v.toLocaleString()} flashes (${density(c, v).toFixed(1)} per 10,000 km2)<br>${share}`;
  const pad = 14;
  tip.style.left = Math.min(ev.clientX + pad, window.innerWidth - tip.offsetWidth - pad) + "px";
  tip.style.top = ev.clientY + pad + "px";
}
function hideTip() { $("#tip").hidden = true; }

// Line chart: hour of day on x, each series scaled to its own peak on y.
let lineX = () => 0;
function drawLine() {
  const { w, h, m } = CONFIG.line;
  const svg = d3.select("#line").attr("viewBox", `0 0 ${w} ${h}`);
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0, M.hours - 1], [m.l, w - m.r]);
  const y = d3.scaleLinear([0, 1], [h - m.b, m.t]);
  lineX = x;
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-(h - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).tickValues([0, 3, 6, 9, 12, 15, 18, 21, 23]).tickFormat((d) => (d === 0 ? "midnight" : d === 12 ? "noon" : hourLabel(d))));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
  svg.append("text").attr("class", "lbl").attr("x", m.l).attr("y", m.t - 6).text("Share of the series' own peak hour");
  svg.append("text").attr("class", "lbl").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").text(`Hour of day, ${clockLabel()}`);
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  const ref = refCurves();
  svg.append("path").datum(ref.land).attr("class", "ref land-ref").attr("d", line);
  svg.append("path").datum(ref.ocean).attr("class", "ref ocean").attr("d", line);
  state.sel.forEach((c, k) => {
    svg.append("path").datum(normalise(curve(c))).attr("class", "pick").attr("stroke", CONFIG.selColors[k]).attr("d", line);
  });
  svg.append("line").attr("class", "hour-mark").attr("y1", m.t).attr("y2", h - m.b).attr("x1", x(state.hour)).attr("x2", x(state.hour));
  // Legend as text rows under the title.
  const rows = [["All land cells (solid grey)", null], ["All ocean cells (dashed grey)", null]].concat(state.sel.map((c, k) => [cellLabel(c), CONFIG.selColors[k]]));
  // Backing panel so the legend stays readable where a curve runs under it.
  svg.append("rect").attr("class", "legend-bg").attr("x", w - m.r - 232).attr("y", m.t + 1).attr("width", 236).attr("height", rows.length * 14 + 6);
  svg.append("g").selectAll("text").data(rows).join("text").attr("class", "lbl")
    .attr("x", w - m.r).attr("y", (_, i) => m.t + 12 + i * 14).attr("text-anchor", "end")
    .attr("fill", (d) => d[1] || null).attr("font-weight", (d) => (d[1] ? 700 : null)).text((d) => d[0]);
  const peak = (a) => hourLabel(d3.maxIndex(a));
  const pick = state.sel.map((c) => `${cellLabel(c)} peaks at ${peak(curve(c))}`).join("; ");
  $("#line-caption").textContent = `${CONFIG.seasonLabels[state.season]}: land peaks at ${peak(ref.land)} and ocean at ${peak(ref.ocean)} (${clockLabel()}). ${pick}. Each curve is divided by its own busiest hour, so shapes compare even where GLM detects fewer daytime flashes.`;
}
