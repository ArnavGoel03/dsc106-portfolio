import { chromium } from 'playwright';
import { auditLab6 } from './lab6-browser.mjs';

const browser = await chromium.launch({ headless: true });
try {
  // LAB6_TZ runs the page in another time zone (the author's commits are +05:30)
  const page = await browser.newPage({ timezoneId: process.env.LAB6_TZ });
  const result = await auditLab6(page, { baseURL: process.env.LAB6_BASE_URL });
  console.log(JSON.stringify({ checks: result.checks.length, failures: result.failures }, null, 2));
  process.exitCode = result.failures.length ? 1 : 0;
} finally {
  await browser.close();
}
