// These checks use plain JSON values so the same assertions can run inside the headless tool's VM as well as Node.
function assert(value, message = 'assertion failed') { if (!value) throw new Error(message); }
assert.equal = (actual, expected) => assert(Object.is(actual, expected), `expected ${expected}, received ${actual}`);
assert.deepEqual = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);

// Accept the browser as an adapter so the same checks run in the CLI, CI and the configured headless MCP browser.
export async function auditP3Final(browser, baseURL, { adversarial = true, renderFixture, calibrate = true } = {}) {
  assert(renderFixture && renderFixture.hours === 24 && renderFixture.cells.length === 2, 'the independent render fixture is required');
  const expectedCurve = (cell, season, clock) => season === 'YEAR'
    ? Array.from({ length: renderFixture.hours }, (_, hour) => ['DJF', 'MAM', 'JJA', 'SON'].reduce((total, s) => total + cell.curves[s + '|' + clock][hour], 0))
    : cell.curves[season + '|' + clock];
  const curveMatches = (actual, expected) => actual.length === expected.length && actual.every((value, hour) => Math.abs(value - expected[hour]) <= renderFixture.curveTolerance);
  // D3 rounds path coordinates to three decimals; allow one rounding step on either reconstructed path.
  const pathTolerance = 0.002;
  const pathMatches = (actual, expected) => {
    if (!actual || !expected) return false;
    const numbers = /[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi;
    const a = actual.match(numbers).map(Number), b = expected.match(numbers).map(Number);
    return actual.replace(numbers, '') === expected.replace(numbers, '') && a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= pathTolerance);
  };
  const readRender = (p, season, clock, hour) => p.evaluate(({ fixture, season, clock, hour, curves }) => {
    const domain = fixture.density_domains[season === 'YEAR' ? 'YEAR' : 'season'];
    const color = d3.scaleSequentialSqrt([0, domain], t => d3.interpolateYlOrRd(fixture.colorFloor + (1 - fixture.colorFloor) * t));
    const fills = fixture.cells.map((cell, i) => {
      const node = [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === cell.cell);
      const count = curves[i][hour];
      return { cell: cell.cell, actual: node?.getAttribute('fill'), expected: count > 0 ? color(count * cell.densityFactor) : 'none' };
    });
    const selected = document.querySelector('#line path.pick');
    const curve = [...(selected?.__data__ || [])];
    const axes = [...document.querySelectorAll('#line g.axis')];
    const ticks = axes.map(axis => [...axis.querySelectorAll('.tick')]);
    const offset = devicePixelRatio > 1 ? 0 : 0.5; // D3's axis pixel-centering offset is absent from line coordinates.
    const scale = (axisTicks, coordinate) => d3.scaleLinear(
      [axisTicks[0].__data__, axisTicks[axisTicks.length - 1].__data__],
      [axisTicks[0], axisTicks[axisTicks.length - 1]].map(tick => tick.transform.baseVal.consolidate().matrix[coordinate] - offset),
    );
    const x = scale(ticks[0], 'e'), y = scale(ticks[1], 'f'), peak = Math.max(...curves[0]) || 1;
    const expectedPath = d3.line().x((_, h) => x(h)).y(value => y(value / peak)).curve(d3.curveMonotoneX)(curves[0]);
    return { fills, curve, curvePath: selected?.getAttribute('d'), expectedPath };
  }, { fixture: renderFixture, season, clock, hour, curves: renderFixture.cells.map(cell => expectedCurve(cell, season, clock)) });
  const assertRender = (result, season, clock) => {
    for (const fill of result.fills) assert.equal(fill.actual, fill.expected);
    const curve = expectedCurve(renderFixture.cells[0], season, clock), peak = Math.max(...curve) || 1;
    assert(curveMatches(result.curve, curve.map(value => value / peak)), `selected Florida curve differs from the independent ${season}/${clock} counts`);
    assert(pathMatches(result.curvePath, result.expectedPath), `visible Florida path differs from the independent ${season}/${clock} counts`);
  };
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

    if (calibrate) {
      const previous = await readRender(page, 'JJA', 'local', 16);
      await page.locator('input[name=season][value=DJF]').check();
      await page.waitForFunction(() => document.querySelector('#line-caption').textContent.startsWith('Dec-Feb') && !document.querySelector('#hour').disabled);
      await page.locator('#hour').fill('0');
      const current = await readRender(page, 'DJF', 'local', 0);
      // Simulate a renderer that retained its previous season's map and curve while updating the labels.
      await page.evaluate(({ previous }) => {
        for (const fill of previous.fills) [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === fill.cell).setAttribute('fill', fill.actual);
        document.querySelector('#line path.pick').setAttribute('d', previous.curvePath);
      }, { previous });
      const frozen = await readRender(page, 'DJF', 'local', 0);
      check('render detector rejects a frozen map with current labels', () => assert(frozen.fills.some(fill => fill.actual !== fill.expected)));
      check('render detector rejects a frozen selected curve', () => assert(!pathMatches(frozen.curvePath, frozen.expectedPath)));
      await page.evaluate(({ current }) => {
        for (const fill of current.fills) [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === fill.cell).setAttribute('fill', fill.actual);
        document.querySelector('#line path.pick').setAttribute('d', current.curvePath);
      }, { current });
    }

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
            ariaHour: document.querySelector('#hour').getAttribute('aria-valuetext'),
            caption: document.querySelector('#map-caption').textContent,
          }));
          const rendered = await readRender(page, season, clock, hour);
          check(`hour ${season}/${clock}/${hour}`, () => { assert(!result.badNumber); assert(result.caption.includes(result.hour)); assert.equal(result.ariaHour, result.hour); assertRender(rendered, season, clock); });
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
    if (calibrate) {
      await page.locator('#play').click();
      const old = await page.locator('#hour').inputValue();
      await page.waitForFunction(old => document.querySelector('#hour').value !== old, old, { timeout: 2000 });
      await page.evaluate(() => {
        window.__p3FakePause = event => { event.stopImmediatePropagation(); document.querySelector('#play').textContent = 'Play'; };
        document.querySelector('#play').addEventListener('click', window.__p3FakePause, true);
      });
      await page.locator('#play').click();
      const fakePausedHour = await page.locator('#hour').inputValue();
      await page.waitForTimeout(renderFixture.pauseWaitMs); // exceed the real 350 ms interval, so text-only Pause cannot pass
      const stillPlayingHour = await page.locator('#hour').inputValue();
      check('pause detector rejects a text-only fake pause', () => assert(stillPlayingHour !== fakePausedHour));
      await page.evaluate(() => {
        document.querySelector('#play').removeEventListener('click', window.__p3FakePause, true);
        delete window.__p3FakePause;
      });
      await page.locator('#play').click();
    }
    await page.locator('#play').click();
    const old = await page.locator('#hour').inputValue();
    await page.waitForFunction(old => document.querySelector('#hour').value !== old, old, { timeout: 2000 });
    await page.locator('#play').click();
    const paused = await page.locator('#play').innerText();
    const pausedHour = await page.locator('#hour').inputValue();
    await page.waitForTimeout(renderFixture.pauseWaitMs); // verify the actual timer stops, not only the button text
    const laterHour = await page.locator('#hour').inputValue();
    check('Play advances the hour and Pause stops it', () => { assert.equal(paused, 'Play'); assert.equal(laterHour, pausedHour); });

    // Linked views: the line chart scrubs the hour, markers follow the picks, and hovering a cell previews its curve.
    const scrubBox = await page.locator('#line .scrub').boundingBox();
    await page.mouse.click(scrubBox.x + scrubBox.width * (6 / 23), scrubBox.y + scrubBox.height / 2);
    const scrubbed = await page.evaluate(() => ({
      hour: document.querySelector('#hour').value, label: document.querySelector('#hour-out').textContent,
      dots: document.querySelectorAll('#line .dots circle').length, pins: document.querySelectorAll('#map .pins circle.ring').length,
      picks: document.querySelectorAll('#line path.pick').length, selected: document.querySelectorAll('#map .cell.sel').length,
    }));
    check('pressing the line chart moves the hour, with one marker per drawn pick and one ring per picked cell', () => {
      assert.equal(scrubbed.hour, '6'); assert(scrubbed.label.startsWith('6 AM')); assert.equal(scrubbed.dots, scrubbed.picks); assert.equal(scrubbed.pins, scrubbed.selected); assert(scrubbed.pins > 0);
    });
    // Moving the slider by hand must pause Play, or the next tick pulls the thumb away.
    await page.locator('#play').click();
    await page.locator('#hour').focus();
    await page.keyboard.press('ArrowRight');
    const handPlay = await page.locator('#play').innerText();
    const handHour = await page.locator('#hour').inputValue();
    await page.waitForTimeout(renderFixture.pauseWaitMs);
    const handLater = await page.locator('#hour').inputValue();
    check('moving the slider by hand pauses Play', () => { assert.equal(handPlay, 'Play'); assert.equal(handLater, handHour); });
    // A finger swiping up or down over the line chart scrolls the page and must not move the hour; a sideways drag does.
    const touchScrub = await page.evaluate(() => {
      const el = document.querySelector('#line .scrub'), r = el.getBoundingClientRect(), hour = () => document.querySelector('#hour').value;
      const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
      const x0 = r.x + r.width * (18 / 23), y0 = r.y + r.height * 0.3, before = hour();
      fire('pointerdown', x0, y0); fire('pointermove', x0 + 2, y0 + 30); fire('pointermove', x0 + 3, y0 + 70); fire('pointercancel', x0 + 3, y0 + 70);
      const afterVertical = hour();
      fire('pointerdown', x0, y0); fire('pointermove', x0 - 20, y0 + 2); fire('pointermove', r.x + r.width * (12 / 23), y0 + 3); fire('pointerup', r.x + r.width * (12 / 23), y0 + 3);
      return { before, afterVertical, afterHorizontal: hour() };
    });
    check('a vertical touch swipe on the line chart leaves the hour alone and a sideways drag moves it', () => { assert.equal(touchScrub.afterVertical, touchScrub.before); assert.equal(touchScrub.afterHorizontal, '12'); });
    // Clicking a picked cell again removes it; its curve, ring and legend row go with it.
    const unpick = await page.evaluate(() => {
      const count = () => ({ sel: document.querySelectorAll('#map .cell.sel').length, picks: document.querySelectorAll('#line path.pick').length, pins: document.querySelectorAll('#map .pins circle.ring').length });
      const before = count(), node = document.querySelector('#map .cell.sel'), cell = node.__data__;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      const after = count();
      [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === cell).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      return { before, after, again: count() };
    });
    check('clicking a picked cell removes it and clicking it again brings it back', () => {
      assert.equal(unpick.after.sel, unpick.before.sel - 1); assert.equal(unpick.after.pins, unpick.after.sel); assert(unpick.after.picks <= unpick.after.sel); assert.equal(unpick.again.sel, unpick.before.sel);
    });
    const hoverBox = await page.evaluate(cell => { const r = [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === cell && !e.classList.contains('sel')).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, renderFixture.cells[1].cell);
    await page.mouse.move(hoverBox.x, hoverBox.y);
    const preview = await page.evaluate(cell => {
      const ghost = document.querySelector('#line path.ghost'), node = [...document.querySelectorAll('#map .cell')].find(e => e.__data__ === cell);
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));  // pick it: its real curve must match the preview
      const picked = [...document.querySelectorAll('#line path.pick')].map(e => e.getAttribute('d'));
      return { ghost: ghost.getAttribute('d'), picked, after: document.querySelector('#line path.ghost').getAttribute('d') };
    }, renderFixture.cells[1].cell);
    check('hovering a cell previews exactly the curve a click then draws, and the preview clears', () => { assert(preview.ghost && preview.ghost.length > 20); assert(preview.picked.includes(preview.ghost)); assert(!preview.after); });
    await page.mouse.move(2, 2);

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
