import { fetchJSON, renderProjects } from '../global.js';

// Lab 4, Step 1.3: fetch the data, then render it into the page
const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

// Lab 4, Step 1.6: the count comes from the data, so it updates when the data changes
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && projects) projectsTitle.textContent = `${projects.length} Projects`;
