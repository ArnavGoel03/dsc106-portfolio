// Lab 3, Step 1
console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// Lab 3, Step 3.1: one list of pages drives the nav on every page
const pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'cv/', title: 'CV' },
  { url: 'https://github.com/ArnavGoel03', title: 'GitHub' },
];

// Local server serves from the root; GitHub Pages serves under the repo name
const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'
    : '/dsc106-portfolio/';

// Treat /cv/index.html as /cv/ so the current link still matches
const currentPath = location.pathname.replace(/index\.html$/, '');

const nav = document.createElement('nav');
document.body.prepend(nav);

for (const p of pages) {
  const url = p.url.startsWith('http') ? p.url : BASE_PATH + p.url;

  const a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  // Lab 3, Step 3.2: highlight the current page, open external links in a new tab
  const isCurrent = a.host === location.host && a.pathname === currentPath;
  a.classList.toggle('current', isCurrent);
  if (isCurrent) a.setAttribute('aria-current', 'page');
  if (a.host !== location.host) a.target = '_blank';

  nav.append(a);
}

// Lab 3, Step 4.2: theme switcher, created by JS because it needs JS to work
document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

const select = document.querySelector('.color-scheme select');

// Lab 3, Step 4.4 + 4.5: one function sets the scheme for both load and change
function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

// Storage can throw (blocked site data); the theme still works for this page view
const COLOR_SCHEMES = Array.from(select.options, (o) => o.value);

try {
  if ('colorScheme' in localStorage && COLOR_SCHEMES.includes(localStorage.colorScheme)) {
    setColorScheme(localStorage.colorScheme);
  }
} catch {}

select.addEventListener('input', (event) => {
  console.log('color scheme changed to', event.target.value);
  setColorScheme(event.target.value);
  try {
    localStorage.colorScheme = event.target.value;
  } catch {}
});

// Lab 3, Step 5: build the mailto URL ourselves so spaces encode as %20, not +
const form = document.querySelector('form');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const params = [];
  for (const [name, value] of data) {
    // toWellFormed() replaces a lone surrogate (half a pasted emoji), which encodeURIComponent rejects
    params.push(`${name}=${encodeURIComponent(value.toWellFormed?.() ?? value)}`);
  }
  location.href = `${form.action}?${params.join('&')}`;
});

// Lab 4, Step 1.2: fetch and parse a JSON file; returns undefined (and logs) on failure
export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

// Data goes into a template literal, so escape it (a description can contain < or &)
function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// Lab 4, Step 1.4 + Lab 5, Step 0.1: render projects (description and year share one div, one grid cell) into a container; reused by the Projects and Home pages
export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!(containerElement instanceof Element)) return;
  const level = HEADING_LEVELS.includes(headingLevel) ? headingLevel : 'h2';
  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects to show right now.</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    // Image paths in the JSON are relative to the site root, so they work from any page
    const image = project.image?.startsWith('http') ? project.image : BASE_PATH + (project.image ?? '');
    const title = escapeHTML(project.title ?? '');
    article.innerHTML = `
      <${level}>${title}</${level}>
      <img src="${escapeHTML(image)}" alt="${title}">
      <div>
        <p>${escapeHTML(project.description ?? '')}</p>
        <p class="year">${escapeHTML(project.year ?? '')}</p>
      </div>
    `;
    containerElement.appendChild(article);
  }
}

// Lab 4, Step 3.2: GitHub profile data
export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
