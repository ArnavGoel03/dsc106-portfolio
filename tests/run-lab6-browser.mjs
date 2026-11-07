import { chromium } from 'playwright';
import { auditLab6 } from './lab6-browser.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const result = await auditLab6(page, { baseURL: process.env.LAB6_BASE_URL });
  console.log(JSON.stringify({ checks: result.checks.length, failures: result.failures }, null, 2));
  process.exitCode = result.failures.length ? 1 : 0;
} finally {
  await browser.close();
}
