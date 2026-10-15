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

const nav = document.createElement('nav');
document.body.prepend(nav);

for (const p of pages) {
  const url = p.url.startsWith('http') ? p.url : BASE_PATH + p.url;

  const a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  // Lab 3, Step 3.2: highlight the current page, open external links in a new tab
  const isCurrent = a.host === location.host && a.pathname === location.pathname;
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

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', (event) => {
  console.log('color scheme changed to', event.target.value);
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;
});

// Lab 3, Step 5: build the mailto URL ourselves so spaces encode as %20, not +
const form = document.querySelector('form');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const params = [];
  for (const [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }
  location.href = `${form.action}?${params.join('&')}`;
});
