import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

// Lab 4, Step 2.1: the first three projects on the home page
const projects = await fetchJSON('./lib/projects.json');
const latestProjects = projects?.slice(0, 3);
const projectsContainer = document.querySelector('.projects');
renderProjects(latestProjects, projectsContainer, 'h2');

// Lab 4, Step 3: GitHub profile stats
const githubData = await fetchGitHubData('ArnavGoel03');
const profileStats = document.querySelector('#profile-stats');

if (profileStats && githubData) {
  profileStats.innerHTML = `
        <dl>
          <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
          <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
          <dt>Followers:</dt><dd>${githubData.followers}</dd>
          <dt>Following:</dt><dd>${githubData.following}</dd>
        </dl>
    `;
}
