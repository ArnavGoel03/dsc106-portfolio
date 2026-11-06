// These checks use plain JSON values so the same assertions can run inside the headless tool's VM as well as Node.
function assert(value, message = 'assertion failed') { if (!value) throw new Error(message); }
assert.equal = (actual, expected) => assert(Object.is(actual, expected), `expected ${expected}, received ${actual}`);
assert.deepEqual = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);

// Accept the browser as an adapter so the same checks run in the CLI, CI and the configured headless MCP browser.
export async function auditP3Final(browser, baseURL, { adversarial = true } = {}) {
  const checks = [], errors = [], resources = [];
  const check = (name, fn) => {
    try { fn(); checks.push({ name, ok: true }); }
    catch (error) { checks.push({ name, ok: false, error: error.message }); }
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (/glm_counts.*\.bin/.test(response.url())) resources.push({ url: response.url(), bytes: Number(response.headers()['content-length'] || 0) });
  });
  const ready = async p => {
    await p.waitForSelector('#map .cell', { timeout: 20000 });
    await p.waitForFunction(() => !document.querySelector('#hour').disabled);
  };
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await ready(page);
    const startup = await page.evaluate(() => ({
      cells: document.querySelectorAll('#map .cell').length,
      curves: document.querySelectorAll('#years .year-line').length,
      requests: performance.getEntriesByType('resource').filter(r => /glm_counts.*\.bin/.test(r.name)).map(r => ({ url: r.name, bytes: r.encodedBodySize })),
    }));
    check('main page renders the full grid and all six yearly curves', () => { assert.equal(startup.cells, 13200); assert.equal(startup.curves, 12); });
    check('initial counts request uses the default part', () => { assert(startup.requests.some(r => /jja.*local/i.test(r.url))); assert(!startup.requests.some(r => /glm_counts_sums\.bin/.test(r.url))); });
    await page.waitForSelector('#writeup:not([hidden])', { timeout: 10000 });
    const headings = await page.locator('#writeup h3').allTextContents();
    check('required write-up sections are visible', () => assert.deepEqual(headings, ['Why we asked this question', 'Data and how we transformed it', 'Design rationale', 'Development process']));

    for (const season of ['DJF', 'MAM', 'JJA', 'SON', 'YEAR']) {
      await page.locator(`input[name=season][value=${season}]`).check();
      for (const clock of ['local', 'utc']) {
        await page.locator(`input[name=clock][value=${clock}]`).check();
        await page.waitForFunction(({ season, clock }) => document.querySelector('#line-caption').textContent.startsWith(season === 'YEAR' ? 'Whole year' : ({ DJF: 'Dec-Feb', MAM: 'Mar-May', JJA: 'Jun-Aug', SON: 'Sep-Nov' })[season]) && document.querySelector('#hour-out').textContent.includes(clock === 'local' ? 'local solar time' : 'UTC') && !document.querySelector('#hour').disabled, { season, clock }, { timeout: 5000 });
        for (const hour of [0, 3, 9, 16, 23]) {
          await page.locator('#hour').fill(String(hour));
          const result = await page.evaluate(() => ({
            badNumber: [...document.querySelectorAll('svg [d], svg [x], svg [y]')].some(e => [...e.attributes].some(a => /NaN|Infinity/.test(a.value))),
            hour: document.querySelector('#hour-out').textContent,
            caption: document.querySelector('#map-caption').textContent,
          }));
          check(`hour ${season}/${clock}/${hour}`, () => { assert(!result.badNumber); assert(result.caption.includes(result.hour)); });
        }
      }
    }
    await page.locator('input[name=season][value=YEAR]').check();
    await page.waitForFunction(() => document.querySelector('#line-caption').textContent.startsWith('Whole year') && !document.querySelector('#hour').disabled);
    for (const [id, hour] of [['plains', '23'], ['maracaibo', '2'], ['florida', '16']]) {
      await page.locator(`#jumps [data-id=${id}]`).click();
      await page.waitForFunction(() => !document.querySelector('#hour').disabled);
      const value = await page.locator('#hour').inputValue();
      const local = await page.locator('input[name=clock][value=local]').isChecked();
      check(`jump ${id} lands at source peak`, () => { assert.equal(value, hour); assert(local); });
    }
    await page.locator('#map').focus();
    await page.keyboard.press('ArrowRight');
    const details = await page.locator('#tip').innerText();
    await page.keyboard.press('Enter');
    const selected = await page.locator('#map .cell.sel').count();
    check('keyboard navigation opens details and selects a cell', () => { assert(details.includes('flashes')); assert.equal(selected, 2); });
    await page.keyboard.press('Escape');
    const hidden = await page.locator('#tip').isHidden();
    check('Escape dismisses details', () => assert(hidden));
    await page.locator('#play').click();
    const old = await page.locator('#hour').inputValue();
    await page.waitForFunction(old => document.querySelector('#hour').value !== old, old, { timeout: 2000 });
    await page.locator('#play').click();
    const paused = await page.locator('#play').innerText();
    check('Play advances the hour and Pause stops it', () => assert.equal(paused, 'Play'));

    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200); // let the existing resize debounce redraw SVG labels
      const layout = await page.evaluate(() => {
        const clipped = [], sizes = [];
        for (const text of document.querySelectorAll('svg text')) {
          if (!text.textContent.trim()) continue; // grid ticks contain empty text nodes
          const box = text.getBoundingClientRect(), svg = text.ownerSVGElement.getBoundingClientRect(), matrix = text.getScreenCTM();
          if (box.left < svg.left - 1 || box.right > svg.right + 1 || box.top < svg.top - 1 || box.bottom > svg.bottom + 1) clipped.push(text.textContent);
          sizes.push(parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b));
        }
        return { overflow: document.documentElement.scrollWidth > innerWidth, clipped, minFont: Math.min(...sizes) };
      });
      check(`layout ${width}`, () => { assert(!layout.overflow); assert.deepEqual(layout.clipped, []); assert(layout.minFont >= 9.9); });
    }
    check('successful core flow has no browser errors', () => assert.deepEqual(errors, []));
  } catch (error) {
    checks.push({ name: 'core flow completes', ok: false, error: error.message });
  } finally {
    await context.close();
  }

  if (adversarial) for (const mode of ['gzip-fallback', 'counts-fail', 'counts-truncated', 'writeup-fail', 'metadata-stall', 'stale-view']) {
    const isolated = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await isolated.newPage();
    p.on('pageerror', () => {}); // expected errors are asserted through the visible failure state
    try {
      // Keep real retry/abort behavior, but accelerate long page timers so outage tests take milliseconds.
      await p.addInitScript(() => {
        const native = window.setTimeout.bind(window);
        window.setTimeout = (fn, delay, ...args) => native(fn, delay >= 10000 ? 100 : delay, ...args);
      });
      if (mode === 'gzip-fallback') await p.route(/glm_counts.*\.gz$/, r => r.fulfill({ status: 404, body: '' }));
      if (mode === 'counts-fail') await p.route(/glm_counts.*\.bin(?:\.gz)?$/, r => r.fulfill({ status: 404, body: '' }));
      if (mode === 'counts-truncated') await p.route(/glm_counts.*\.bin(?:\.gz)?$/, r => r.fulfill({ status: 200, body: Buffer.alloc(8) }));
      if (mode === 'writeup-fail') await p.route('**/writeup.md', r => r.fulfill({ status: 404, body: '' }));
      if (mode === 'metadata-stall') await p.route('**/glm.json', () => new Promise(() => {}));
      if (mode === 'stale-view') await p.route(/glm_counts.*djf.*\.bin(?:\.gz)?$/i, () => new Promise(() => {}));
      await p.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (['counts-fail', 'counts-truncated', 'metadata-stall'].includes(mode)) {
        await p.waitForFunction(() => document.querySelector('#subtitle').textContent.includes('did not load'), undefined, { timeout: 5000 });
        const result = await p.evaluate(() => ({ cells: document.querySelectorAll('#map .cell').length, disabled: document.querySelector('#hour').disabled }));
        check(mode, () => { assert.equal(result.cells, 0); assert(result.disabled); });
      } else {
        await ready(p);
        if (mode === 'writeup-fail') {
          const link = p.locator('a[href="writeup.md"]');
          const visible = await link.isVisible();
          check('missing inline write-up retains a visible static link', () => assert(visible));
        } else if (mode === 'stale-view') {
          await p.locator('input[name=season][value=DJF]').check();
          await p.locator('input[name=clock][value=utc]').check();
          await p.locator('input[name=season][value=MAM]').check();
          await p.waitForFunction(() => document.querySelector('#line-caption').textContent.startsWith('Mar-May') && document.querySelector('#hour-out').textContent.includes('UTC') && !document.querySelector('#hour').disabled, undefined, { timeout: 5000 });
          await p.waitForTimeout(800); // let the older request fail before checking the accepted view
          const caption = await p.locator('#line-caption').innerText();
          check('late failed requests cannot replace the latest season and clock', () => { assert(caption.startsWith('Mar-May')); assert(caption.includes('UTC')); });
        } else {
          await p.locator('#map .cell').nth(8300).tap();
          const tip = await p.locator('#tip').innerText();
          check('raw fallback and touch details', () => assert(tip.includes('flashes')));
        }
      }
    } catch (error) {
      checks.push({ name: mode, ok: false, error: error.message });
    } finally {
      await isolated.close();
    }
  }
  return { checks: checks.length, passed: checks.filter(c => c.ok).length, failures: checks.filter(c => !c.ok), resources };
}
