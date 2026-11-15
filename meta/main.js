import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Lab 6, Step 1.1: read the CSV and convert strings to numbers and dates
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
    // Author wall clock (parsed without the offset), so every viewer sees commits at the hour they were made
    wallClock: new Date(row.date + 'T' + row.time),
  }));
  return data;
}

// Lab 6, Step 1.2: one object per commit, original lines kept as a hidden property
// Lab 8, Step 3.3: sorted by datetime so the story and the slider walk forward in time
function processCommits(data) {
  const grouped = d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime, wallClock } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/ArnavGoel03/dsc106-portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        wallClock,
        hourFrac: wallClock.getHours() + wallClock.getMinutes() / 60,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });
      return ret;
    });
  return d3.sort(grouped, (d) => d.datetime);
}

// Lab 6, Step 1.3: summary stats
// Lab 8, Step 1.2 (optional): re-rendered from the filtered commits, so #stats is emptied first
function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').html('').append('dl').attr('class', 'stats');
  const addStat = (label, value) => {
    const group = dl.append('div');
    group.append('dt').html(label);
    group.append('dd').text(value);
  };

  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);

  addStat('Total commits', commits.length);

  // Distinct values: number of files
  addStat('Number of files', d3.group(data, (d) => d.file).size);

  // Aggregate over the whole dataset: maximum depth
  addStat('Maximum depth', d3.max(data, (d) => d.depth));

  // Grouped aggregate: average file length in lines
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  addStat('Average file length', d3.format('.1f')(d3.mean(fileLengths, (d) => d[1])));

  // Min/max value: time of day with the most work
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.wallClock.toLocaleString('en', { dayPeriod: 'short' }),
  );
  addStat('Most work done', d3.greatest(workByPeriod, (d) => d[1])?.[0]);
}

// Lab 6, Step 3: tooltip
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-hour');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.wallClock?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.wallClock?.toLocaleTimeString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const inset = Number.parseFloat(
    getComputedStyle(tooltip).getPropertyValue('--tooltip-viewport-inset'),
  );
  // Measure at the origin so an edge position does not squeeze the tooltip.
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  const { width, height } = tooltip.getBoundingClientRect();
  // Flip to the other side of the cursor near an edge instead of clamping, so the
  // tooltip never lands under the pointer (that would fire mouseleave and hide it).
  const place = (pointer, size, limit) => {
    const after = pointer + inset;
    const start = after + size <= limit - inset ? after : pointer - inset - size;
    return Math.max(inset, start);
  };
  tooltip.style.left = `${place(event.clientX, width, innerWidth)}px`;
  tooltip.style.top = `${place(event.clientY, height, innerHeight)}px`;
}

// Lab 6, Step 5.4: scales are shared with the brush handlers
let xScale;
let yScale;
let commits;
let filteredCommits;
let brush;
let rScale;
// Tick label size: BASE_TICK_FONT viewBox units suits a laptop-width chart (about 10.6 px on screen);
// below MIN_TICK_FONT_PX on screen the labels grow instead
const BASE_TICK_FONT = 16;
const MIN_TICK_FONT_PX = 10.5;
let tickFont = BASE_TICK_FONT;
let maxXTicks = Infinity;
// Scrollama's trigger line, as a fraction of the viewport height. On a phone the chart pins across the
// top, so the line moves below it and the active paragraph is always visible
const STORY_TRIGGER = matchMedia('(max-width: 40em)').matches ? 0.75 : 0.5;

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [x0, x1] = selection.map((d) => d[0]);
  const [y0, y1] = selection.map((d) => d[1]);
  const x = xScale(commit.wallClock);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Lab 6, Step 5.5
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  const n = selectedCommits.length;
  countElement.textContent = `${n || 'No'} ${n === 1 ? 'commit' : 'commits'} selected`;

  return selectedCommits;
}

// Lab 6, Step 5.6
function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `
        <div>
            <dt>${language}</dt>
            <dd>${count} lines (${formatted})</dd>
        </div>
        `;
  }
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// Lab 6, Step 5.1 + 5.2
function createBrushSelector(svg) {
  brush = d3.brush().on('start brush end', brushed);
  svg.call(brush);
  // The brush overlay catches mouse events, so lift the dots above it
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// Lab 6, Step 4 + Lab 8, Steps 1.2 and 1.3: dot area proportional to lines edited, biggest dots
// drawn first, keyed by commit id so a dot keeps its element (and animates) as the filter changes
function drawDots(svg, commits) {
  // A dot removed by the filter never fires mouseleave, so its tooltip would stay open
  updateTooltipVisibility(false);
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.wallClock))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    // Lab 8, Step 1.4: radius as a variable so the CSS grow transition runs at constant speed
    .style('--r', (d) => rScale(d.totalLines))
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
  // Bigger dots first means smaller ones sit on top and stay hoverable
  svg.select('g.dots').selectAll('circle').order();
}

// Lab 6, Step 2: scatterplot of commit time vs. date
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  // Tick labels are sized in viewBox units, so a narrow (phone) chart shrinks them; grow them back to a
  // readable size there and widen the margins to fit. A laptop-width chart keeps the base size.
  const chartPx = document.querySelector('#chart').clientWidth || width;
  tickFont = Math.max(BASE_TICK_FONT, (MIN_TICK_FONT_PX * width) / chartPx);
  const grow = tickFont - BASE_TICK_FONT;
  // A laptop chart lets its hour labels overhang the left edge into the column gap; a phone chart has
  // only the page gutter there, so the labels get room inside the chart instead
  const margin = { top: 10, right: 10, bottom: 30 + grow * 1.4, left: grow > 0 ? tickFont * 3.4 + 10 : 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible')
    .style('--tick-font', `${tickFont}px`);
  // At most one label per this much axis, so bigger labels on a phone get fewer ticks instead of overlapping
  maxXTicks = Math.max(2, Math.floor(usableArea.width / (tickFont * 4.5)));
  const hourStep = [2, 3, 4, 6].find((step) => 24 / step + 1 <= usableArea.height / (tickFont * 1.6)) ?? 6;
  const hourTicks = d3.range(0, 25, hourStep);

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.wallClock))
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Step 2.3: gridlines before the axes and dots
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(d3.axisLeft(yScale).tickValues(hourTicks).tickFormat('').tickSize(-usableArea.width));

  // Step 2.2: axes
  const xAxis = makeXAxis();
  const yAxis = d3
    .axisLeft(yScale)
    .tickValues(hourTicks)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');
  // Lab 8, Step 1.2: classes so the x-axis can be cleared and redrawn
  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis)
    .call(keepEdgeLabelClear);
  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Radius scale from the full history, so a commit keeps its size whatever the filter shows
  rScale = d3
    .scaleSqrt()
    .domain(d3.extent(commits, (d) => d.totalLines))
    .range([2, 30]);
  svg.append('g').attr('class', 'dots');
  drawDots(svg, commits);

  createBrushSelector(svg);
}

// Weekly ticks: d3's default 2-day ticks restart at each month, so Oct 31 and November collided.
// A filtered domain shorter than two weeks has at most one Monday in it, so it falls back to days.
// When there are more ticks than fit (a phone), every nth one is kept, counted from the start rather
// than d3's every(), which restarts each month and would collide again.
const WEEKLY_TICKS_MIN_DAYS = 14;
function makeXAxis() {
  const [start, end] = xScale.domain();
  const interval = d3.timeDay.count(start, end) >= WEEKLY_TICKS_MIN_DAYS ? d3.timeWeek : d3.timeDay;
  const ticks = interval.range(start, d3.timeMillisecond.offset(end, 1));
  const step = Math.ceil(ticks.length / maxXTicks);
  return d3
    .axisBottom(xScale)
    .tickValues(ticks.filter((_, i) => i % step === 0))
    .tickFormat(d3.timeFormat('%b %d'));
}

// A date tick at the very left edge (the domain starts on whole days) would centre its label on the
// y-axis and collide with the 00:00 hour label, so that one label starts at the axis instead
function keepEdgeLabelClear(axisGroup) {
  const start = +xScale.domain()[0];
  axisGroup
    .selectAll('.tick')
    .filter((d) => +d === start)
    .select('text')
    .attr('text-anchor', 'start');
}

// Lab 8, Step 1.2: redraw the existing chart for the filtered commits instead of appending a new svg
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');
  // Rounded out to whole days: early in the story the domain is a single commit (zero width), which
  // plain nice() leaves at zero width, so the axis had no ticks at all
  xScale.domain(d3.extent(commits, (d) => d.wallClock)).nice(d3.timeDay);

  const xAxis = makeXAxis();
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis).call(keepEdgeLabelClear);

  drawDots(svg, commits);
  // The old brush rectangle no longer matches the rescaled dots, so clear it
  svg.call(brush.move, null);
}

// Lab 8, Step 2: one row per file, one dot per line, coloured by language, biggest file first
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    // Only the file rows: selectAll('div') also matched every nested .loc dot, so each update threw
    // away and rebuilt all of them
    .selectChildren('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        const dt = div.append('dt');
        dt.append('code');
        dt.append('small');
        div.append('dd');
      }),
    );

  // Break long paths after a slash rather than mid-word
  filesContainer.select('dt > code').each(function (d) {
    const parts = d.name.split('/');
    this.replaceChildren(
      ...parts.flatMap((part, i) => (i < parts.length - 1 ? [`${part}/`, document.createElement('wbr')] : [part])),
    );
  });
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// Lab 8, Step 1.1: the slider maps 0 to 100 onto the commit time range
let data = await loadData();
commits = processCommits(data);
filteredCommits = commits;

// Fix the colour order once, so a language keeps its colour whichever file is biggest at the moment
colors.domain(d3.sort(new Set(data.map((d) => d.type))));
d3.select('#files-legend')
  .selectAll('li')
  .data(colors.domain())
  .join('li')
  .attr('style', (d) => `--color: ${colors(d)}`)
  .html((d) => `<span class="swatch"></span>${d}`);

// Slider, filter, label and story all use wallClock, the clock the dots and tooltip already show,
// so a viewer in another time zone sees one consistent time (every commit is +05:30)
const timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.wallClock))
  .range([0, 100]);
let commitProgress = 100;
let storyActive = false;
let commitMaxTime = timeScale.invert(commitProgress);

const slider = document.getElementById('commit-progress');
const timeLabel = document.getElementById('commit-time');

// Shared by the slider and the scroll story: filter to commits up to commitMaxTime, redraw everything
function showCommitsUntil(maxTime) {
  commitMaxTime = maxTime;
  timeLabel.dateTime = commitMaxTime.toISOString();
  timeLabel.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  slider.setAttribute('aria-valuetext', timeLabel.textContent);
  filteredCommits = commits.filter((d) => d.wallClock <= commitMaxTime);
  renderCommitInfo(filteredCommits.flatMap((d) => d.lines), filteredCommits);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  // A manual slider move takes over from the story, so scrolling above it later keeps this value
  storyActive = false;
  commitProgress = Number(slider.value);
  showCommitsUntil(timeScale.invert(commitProgress));
}

renderScatterPlot(data, commits);
slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

// Lab 8, Step 3.2: one story step per commit
const fileCount = (commit) => {
  const n = d3.rollups(commit.lines, (D) => D.length, (d) => d.file).length;
  return `${n} ${n === 1 ? 'file' : 'files'}`;
};
// Lab 8, Step 4: the same story is written twice, once beside the chart and once beside the files
const storyStepHtml = (d, i) => `
      <p>On ${d.wallClock.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
      }</a>.
      I edited ${d.totalLines} lines across ${fileCount(d)}.
      Then I looked over all I had made, and I saw that it was very good.</p>
    `;
for (const story of ['#scatter-story', '#files-story']) {
  d3.select(story).selectAll('.step').data(commits).join('div').attr('class', 'step').html(storyStepHtml);
}

// Lab 8, Step 3.3: scrolling a step into view moves the chart, the slider and the files to that commit
function onStepEnter(response) {
  const commit = response.element.__data__;
  storyActive = true;
  commitProgress = timeScale(commit.wallClock);
  slider.value = commitProgress;
  showCommitsUntil(commit.wallClock);
}

// Scrolling back above the first step returns to the full history the page opened with. Scrollama
// fires no exit on a fast jump (Home key, scrollbar drag), so a passive scroll listener checks where
// step one sits against scrollama's trigger line (STORY_TRIGGER).
const firstStep = document.querySelector('#scatter-story .step');
addEventListener(
  'scroll',
  () => {
    if (storyActive && firstStep.getBoundingClientRect().top > innerHeight * STORY_TRIGGER) {
      storyActive = false;
      commitProgress = 100;
      slider.value = commitProgress;
      showCommitsUntil(timeScale.invert(commitProgress));
    }
  },
  { passive: true },
);

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
    offset: STORY_TRIGGER,
  })
  .onStepEnter(onStepEnter);

// Lab 8, Step 4: the second story drives only the unit visualization, so the files race commit by commit
const filesScroller = scrollama();
filesScroller
  .setup({
    container: '#scrolly-2',
    step: '#scrolly-2 .step',
    offset: STORY_TRIGGER,
  })
  .onStepEnter((response) => {
    filesAtEnd = false;
    const commit = response.element.__data__;
    updateFileDisplay(commits.filter((d) => d.wallClock <= commit.wallClock));
  });

// Near the bottom of the page the last step cannot always reach scrollama's trigger line, and a fast
// jump (End key) skips it, so once the last step has passed the trigger line the files show
// the full history the story ends on.
let filesAtEnd = false;
const lastFilesStep = document.querySelector('#files-story .step:last-child');
addEventListener(
  'scroll',
  () => {
    if (!filesAtEnd && lastFilesStep.getBoundingClientRect().top < innerHeight * STORY_TRIGGER) {
      filesAtEnd = true;
      updateFileDisplay(commits);
    }
  },
  { passive: true },
);
