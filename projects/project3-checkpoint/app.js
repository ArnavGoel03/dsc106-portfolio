"use strict";
// Single source of truth for tunable values in the prototype.
const CONFIG = {
  dataUrl: "web/data/cmip6.json",
  landUrl: "vendor/land-110m.json",
  windowYears: 20,            // trailing mean length, matches the 1995 to 2014 baseline length
  yearMin: 2030, yearMax: 2100, yearStart: 2100,
  defaultScenario: "ssp245",
  defaultCell: { lat: 35, lon: 245 }, // 30N-40N, 120W-110W cell covering San Diego
  smoothHalf: 5,             // line chart shows an 11-year centered running mean (2 x 5 + 1)
  playMs: 220,
  map: { w: 960, h: 490, pad: 6 },
  line: { w: 640, h: 490, m: { t: 16, r: 14, b: 40, l: 50 } },
};

const state = { scenario: CONFIG.defaultScenario, year: CONFIG.yearStart, model: "all", hatch: true, cell: null, timer: null };
let D, ids = {};
const $ = (s) => document.querySelector(s);
const fmt = (v) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(1) + " °C";
const lonPM = (l) => (l > 180 ? l - 360 : l);

Promise.all([d3.json(CONFIG.dataUrl), d3.json(CONFIG.landUrl)]).then(([data, land]) => { D = data; init(land); });

function series(scn, model, cell) {
  // Full 1950 to 2100 anomaly series in degrees C for one cell.
  return D.hist[model][cell].concat(D.ssp[scn][model][cell]).map((v) => v / 10);
}
function smooth(a) {
  const k = CONFIG.smoothHalf;
  return a.map((_, i) => d3.mean(a.slice(Math.max(0, i - k), i + k + 1)));
}
function allYears() { const out = []; for (let y = D.histYears[0]; y <= D.sspYears[1]; y++) out.push(y); return out; }
function windowMean(s, endYear) {
  const i1 = endYear - D.histYears[0], i0 = i1 - CONFIG.windowYears + 1;
  return d3.mean(s.slice(i0, i1 + 1));
}
function cellStats(cell) {
  const per = D.models.map((m) => windowMean(series(state.scenario, m, cell), state.year));
  return { per, mean: d3.mean(per), min: d3.min(per), max: d3.max(per) };
}
// Hatching rule (IPCC-style, not magnitude): the six models disagree in sign (some warm, some cool),
// or their spread (highest minus lowest) exceeds the size of the multi-model mean change.
function disagree(st) { return (st.min < 0 && st.max > 0) || st.max - st.min > Math.abs(st.mean); }
function cellValue(cell) {
  const st = cellStats(cell);
  return state.model === "all" ? st.mean : st.per[D.models.indexOf(state.model)];
}
function cellName(cell) {
  const la = D.lat[Math.floor(cell / D.lon.length)], lo = D.lon[cell % D.lon.length], h = D.cellDeg / 2;
  const f = (v, p, n) => Math.abs(v) + "°" + (v < 0 ? n : p);
  const l1 = lonPM(lo - h), l2 = lonPM(lo + h);
  return `${f(la - h, "N", "S")} to ${f(la + h, "N", "S")}, ${f(l1, "E", "W")} to ${f(l2, "E", "W")}`;
}

function init(landTopo) {
  const nlon = D.lon.length;
  const sc = $("#scenario-radios");
  D.scenarios.forEach((s) => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="radio" name="scn" value="${s.id}" ${s.id === state.scenario ? "checked" : ""}/> ${s.label}`;
    sc.appendChild(l);
  });
  const sel = $("#model");
  [["all", "All six (mean)"]].concat(D.models.map((m) => [m, m])).forEach(([v, t]) => sel.add(new Option(t, v)));
  $("#model-list").textContent = D.models.join(", ");
  const yr = $("#year");
  yr.min = CONFIG.yearMin; yr.max = CONFIG.yearMax; yr.value = state.year;
  const li = D.lat.indexOf(CONFIG.defaultCell.lat), lj = D.lon.indexOf(CONFIG.defaultCell.lon);
  state.cell = li * nlon + lj;

  const { w, h, pad } = CONFIG.map;
  const proj = d3.geoEquirectangular().fitExtent([[pad, pad], [w - pad, h - pad]], { type: "Sphere" });
  const svg = d3.select("#map").attr("viewBox", `0 0 ${w} ${h}`);
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatchPat").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)").append("rect").attr("width", 2).attr("height", 6).attr("fill", "rgba(20,25,35,0.75)");
  const cells = d3.range(D.lat.length * nlon).map((c) => {
    const la = D.lat[Math.floor(c / nlon)], lo = lonPM(D.lon[c % nlon]), hh = D.cellDeg / 2;
    const [x0, y0] = proj([lo - hh, la + hh]), [x1, y1] = proj([lo + hh, la - hh]);
    return { c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
  ids.color = d3.scaleSequential([0, D.colorMaxC], d3.interpolateYlOrRd);
  ids.cellSel = svg.append("g").selectAll("rect").data(cells).join("rect").attr("class", "cell")
    .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w).attr("height", (d) => d.h)
    .on("click", (e, d) => { state.cell = d.c; update(); })
    .on("mousemove", (e, d) => showTip(e, d.c)).on("mouseleave", () => ($("#tip").hidden = true));
  ids.hatchSel = svg.append("g").attr("pointer-events", "none").selectAll("rect").data(cells).join("rect")
    .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w).attr("height", (d) => d.h).attr("fill", "url(#hatchPat)");
  svg.append("path").attr("class", "land").attr("d", d3.geoPath(proj)(topojson.feature(landTopo, landTopo.objects.land)));
  drawLegend(svg);
  initLine();

  d3.selectAll("input[name=scn]").on("change", (e) => { state.scenario = e.target.value; update(); });
  yr.addEventListener("input", () => { state.year = +yr.value; update(); });
  sel.addEventListener("change", () => { state.model = sel.value; update(); });
  $("#hatch").addEventListener("change", (e) => { state.hatch = e.target.checked; update(); });
  $("#play").addEventListener("click", togglePlay);
  update();
}

function drawLegend(svg) {
  const { w, h } = CONFIG.map, lw = 220, lh = 10, x = 20, y = h - 78;
  const g = svg.append("g").attr("transform", `translate(${x},${y})`);
  const id = "lg", grad = svg.select("defs").append("linearGradient").attr("id", id);
  d3.range(0, 1.01, 0.1).forEach((t) => grad.append("stop").attr("offset", t * 100 + "%").attr("stop-color", ids.color(t * D.colorMaxC)));
  g.append("rect").attr("x", -6).attr("y", -20).attr("width", lw + 36).attr("height", 66).attr("rx", 6).attr("fill", "rgba(255,255,255,0.88)");
  g.append("rect").attr("width", lw).attr("height", lh).attr("fill", `url(#${id})`);
  const ax = d3.axisBottom(d3.scaleLinear([0, D.colorMaxC], [0, lw])).ticks(5).tickSize(4);
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${lh})`).call(ax);
  g.append("text").attr("class", "lbl").attr("y", -6).text("Warming vs 1995 to 2014 (°C)");
}

function initLine() {
  const { w, h, m } = CONFIG.line, svg = d3.select("#line").attr("viewBox", `0 0 ${w} ${h}`);
  ids.x = d3.scaleLinear([D.histYears[0], D.sspYears[1]], [m.l, w - m.r]);
  ids.y = d3.scaleLinear([-1, 1], [h - m.b, m.t]);
  ids.lg = svg.append("g").attr("class", "grid");
  ids.xa = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(ids.x).tickFormat(d3.format("d")).ticks(7));
  ids.ya = svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`);
  svg.append("text").attr("class", "lbl").attr("x", 12).attr("y", m.t + 2).attr("transform", `rotate(-90 12 ${m.t + 2})`).attr("text-anchor", "end").text("Warming vs 1995 to 2014 (°C)");
  svg.append("text").attr("class", "lbl").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").text("Year (11-year running means)");
  ids.band = svg.append("rect").attr("y", m.t).attr("height", h - m.b - m.t).attr("fill", "hsl(18 80% 42% / 0.12)");
  ids.lineG = svg.append("g");
  ids.vline = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "hsl(18 80% 42%)").attr("stroke-width", 1.5);
  ids.legend = svg.append("g").attr("transform", `translate(${m.l + 8},${m.t + 4})`);
}

function update() {
  const nlon = D.lon.length, yrs = allYears();
  $("#year-out").textContent = `${state.year - CONFIG.windowYears + 1} to ${state.year}`;
  const modelTxt = state.model === "all" ? "mean of six models" : state.model;
  const scn = D.scenarios.find((s) => s.id === state.scenario).label;
  $("#subtitle").textContent = `Map: change in annual mean near-surface air temperature, ${state.year - CONFIG.windowYears + 1} to ${state.year} average vs 1995 to 2014, ${scn}, ${modelTxt}, on a 10° grid. Click a cell to see its projection.`;
  $("#map-caption").textContent = "Each model is measured against its own 1995 to 2014 mean. Cells cooler than that baseline are drawn as 0." + (state.hatch ? " Hatched cells: the six models disagree in sign, or the spread between the highest and lowest model exceeds the multi-model mean change." : "");

  ids.cellSel.attr("fill", (d) => ids.color(Math.max(0, cellValue(d.c)))).classed("sel", (d) => d.c === state.cell);
  ids.cellSel.filter((d) => d.c === state.cell).raise();
  ids.hatchSel.attr("display", (d) => (state.hatch && disagree(cellStats(d.c)) ? null : "none"));

  // line chart
  const c = state.cell, stat = cellStats(c);
  const per = D.models.map((m) => ({ m, s: smooth(series(state.scenario, m, c)) }));
  const mean = yrs.map((_, i) => d3.mean(per, (p) => p.s[i]));
  const others = D.scenarios.filter((s) => s.id !== state.scenario).map((s) => ({
    id: s.id, v: smooth(yrs.map((_, i) => d3.mean(D.models, (m) => series(s.id, m, c)[i]))),
  }));
  const all = per.flatMap((p) => p.s).concat(others.flatMap((o) => o.v));
  ids.y.domain([Math.min(-1, Math.floor(d3.min(all))), Math.ceil(d3.max(all))]).nice();
  const { w, m: mg } = CONFIG.line;
  ids.ya.call(d3.axisLeft(ids.y).ticks(7));
  ids.lg.attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(ids.y).ticks(7).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
  const line = d3.line().x((_, i) => ids.x(yrs[i])).y((v) => ids.y(v));
  const colors = d3.scaleOrdinal(d3.schemeTableau10).domain(D.models);
  ids.lineG.selectAll("*").remove();
  others.forEach((o) => ids.lineG.append("path").attr("class", "other").attr("d", line(o.v)));
  per.forEach((p) => ids.lineG.append("path").attr("class", "mline" + (state.model === "all" ? "" : p.m === state.model ? " pick" : " dim"))
    .attr("stroke", colors(p.m)).attr("d", line(p.s)));
  ids.lineG.append("path").attr("class", "mean").attr("d", line(mean));
  ids.band.attr("x", ids.x(state.year - CONFIG.windowYears + 1)).attr("width", ids.x(state.year) - ids.x(state.year - CONFIG.windowYears + 1));
  ids.vline.attr("x1", ids.x(state.year)).attr("x2", ids.x(state.year));
  ids.legend.selectAll("*").remove();
  ids.legend.append("rect").attr("width", 170).attr("height", 18 * (D.models.length + 2) + 8).attr("rx", 6).attr("fill", "rgba(255,255,255,0.85)").attr("x", -6).attr("y", -6);
  [["Mean of six models", "var(--ink)"]].concat(D.models.map((m) => [m, colors(m)])).forEach(([t, col], i) => {
    ids.legend.append("rect").attr("y", i * 18 + 3).attr("width", 16).attr("height", 3).style("fill", col);
    ids.legend.append("text").attr("class", "lbl").attr("x", 22).attr("y", i * 18 + 8).text(t);
  });
  const oy = 18 * (D.models.length + 1) + 3;
  ids.legend.append("line").attr("x1", 0).attr("x2", 16).attr("y1", oy + 1).attr("y2", oy + 1).attr("stroke", "hsl(220 10% 40%)").attr("stroke-dasharray", "4 3");
  ids.legend.append("text").attr("class", "lbl").attr("x", 22).attr("y", oy + 5).text("Other scenarios (mean)");

  $("#line-caption").textContent = `Cell ${cellName(c)}. Lines are 11-year running means of annual values; shaded band = the ${CONFIG.windowYears}-year period on the map: ${fmt(stat.mean)} (models ${fmt(stat.min)} to ${fmt(stat.max)}).`;
}

function showTip(e, c) {
  const s = cellStats(c), t = $("#tip");
  t.hidden = false;
  t.style.left = Math.min(e.clientX + 14, window.innerWidth - 280) + "px"; t.style.top = e.clientY + 14 + "px";
  t.innerHTML = `${cellName(c)}<br>Mean ${fmt(s.mean)}<br>Models ${fmt(s.min)} to ${fmt(s.max)}`;
}

function togglePlay() {
  const b = $("#play");
  if (state.timer) { clearInterval(state.timer); state.timer = null; b.textContent = "Play"; return; }
  b.textContent = "Pause";
  if (state.year >= CONFIG.yearMax) { state.year = CONFIG.yearMin; $("#year").value = state.year; update(); }
  state.timer = setInterval(() => {
    state.year = state.year >= CONFIG.yearMax ? CONFIG.yearMin : state.year + 1;
    $("#year").value = state.year; update();
  }, CONFIG.playMs);
}
