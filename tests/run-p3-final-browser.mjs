import { chromium } from 'playwright';
import { auditP3Final } from './p3-final-browser.mjs';

const baseURL = process.env.P3_FINAL_URL || 'https://arnavgoel03.github.io/dsc106-portfolio/projects/project3-lightning-climatology/';
const browser = await chromium.launch({ headless: true, ...(process.env.P3_HEADLESS_PATH ? { executablePath: process.env.P3_HEADLESS_PATH } : {}) });
try {
  const result = await auditP3Final(browser, baseURL);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.failures.length ? 1 : 0;
} finally {
  await browser.close();
}
