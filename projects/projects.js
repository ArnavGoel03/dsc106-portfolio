import { fetchJSON, renderProjects } from '../global.js';
// Lab 5, Step 1.3: D3 as an ES module from a pinned CDN URL
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Lab 4, Step 1.3: fetch the data, then render it into the page
const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

// Lab 4, Step 1.6: the count comes from the data, so it updates when the data changes
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && projects) projectsTitle.textContent = `${projects.length} Projects`;

// Lab 5, Step 1.3: one arc generator, one color scale shared by wedges and legend
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

// Lab 5, Step 4.1 + 5.2: the two pieces of state. The selection is a year label, not an index,
// so it survives the wedges being reordered or removed by a search.
let query = '';
let selectedYear = null;

// Lab 5, Step 4.3: case-insensitive match against every value of the project
function matchesQuery(project) {
  const values = Object.values(project).join('\n').toLowerCase();
  return values.includes(query.toLowerCase());
}

// Enter or Space activates a focused wedge or legend item like a click
function onActivate(handler) {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

// Lab 5, Step 2.2 + 3.1 + 4.4 + 5.2: draw the pie and legend for the given projects
function renderPieChart(projectsGiven) {
  const data = d3
    .rollups(projectsGiven, (v) => v.length, (d) => d.year)
    .map(([year, count]) => ({ value: count, label: year }));
  const arcData = d3.pie().value((d) => d.value)(data);

  const svg = d3.select('#projects-pie-plot');
  const legend = d3.select('.legend');
  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  arcData.forEach((arc, idx) => {
    const { label, value } = data[idx];
    const selected = label === selectedYear;
    const choose = () => selectYear(label);

    svg
      .append('path')
      .attr('d', arcGenerator(arc))
      .attr('fill', colors(idx))
      .attr('class', selected ? 'selected' : null)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', label)
      .attr('aria-pressed', selected)
      .on('click', choose)
      .on('keydown', onActivate(choose));

    legend
      .append('li')
      .attr('style', `--color:${colors(idx)}`)
      .attr('class', selected ? 'legend-item selected' : 'legend-item')
      .attr('tabindex', 0)
      .html(`<span class="swatch"></span> ${label} <em>(${value})</em>`)
      .on('click', choose)
      .on('keydown', onActivate(choose));
  });
}

// Lab 5, Step 5.4: the single place that applies BOTH filters, called from both handlers
function update() {
  const searched = projects.filter(matchesQuery);
  // A search can remove the selected year from the pie; drop the stale selection
  if (!searched.some((p) => p.year === selectedYear)) selectedYear = null;
  // The pie always shows the search results, so the other years stay clickable
  renderPieChart(searched);
  const visible = selectedYear === null ? searched : searched.filter((p) => p.year === selectedYear);
  renderProjects(visible, projectsContainer, 'h2');
}

// Lab 5, Step 5.2: clicking the selected year again deselects it
function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  update();
}

// Lab 5, Step 4.2: search as you type
document.querySelector('.searchBar').addEventListener('input', (event) => {
  query = event.target.value;
  update();
});

update();
