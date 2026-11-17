const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
test.after(async () => { await browser.close(); });

// Opens the page in a fresh context; collects errors and any non-file network requests.
async function open({ width = 915, height = 412, time, settings, rawStorage } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(2000);
  const problems = [], external = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) external.push(u); });
  if (settings !== undefined || rawStorage !== undefined) {
    const value = rawStorage !== undefined ? rawStorage : JSON.stringify(settings);
    await context.addInitScript(v => { try { localStorage.setItem('charge-dock-settings', v); } catch (e) {} }, value);
  }
  if (time) await page.clock.install({ time });
  await page.goto(URL);
  await page.waitForLoadState('load');
  return { page, context, problems, external };
}

test('loads offline with local fonts', async () => {
  const { page, context, problems, external } = await open();
  const doto = await page.evaluate(() => document.fonts.load('700 20px Doto').then(f => f.length));
  const mono = await page.evaluate(() => document.fonts.load('400 14px "Space Mono"').then(f => f.length));
  assert.deepEqual(external, []);
  assert.deepEqual(problems, []);
  assert.ok(doto > 0, 'Doto loaded from local file');
  assert.ok(mono > 0, 'Space Mono loaded from local file');
  await context.close();
});

test('renders battery from setBattery', async () => {
  const { page, context } = await open();
  const read = () => page.evaluate(() => ({
    pct: document.getElementById('pct').textContent,
    big: document.getElementById('battBig').textContent,
    sub: document.getElementById('battSub').textContent,
  }));
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  assert.deepEqual(await read(), { pct: '82%', big: 'Charging', sub: 'Full in about 38 min' });
  await page.evaluate(() => window.setBattery(-1, true, -1));
  const unknown = await read();
  assert.equal(unknown.pct, '--%');
  assert.equal(unknown.sub, 'Level unknown');
  await context.close();
});

for (const [w, h] of [[915, 412], [412, 915], [800, 360], [360, 800]]) {
  test(`fits ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const t = document.querySelector('.time').getBoundingClientRect();
      const c = document.querySelector('.tile.clock').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, t, c };
    });
    assert.ok(r.sw <= r.iw, `no horizontal overflow (${r.sw} > ${r.iw})`);
    assert.ok(r.t.left >= r.c.left && r.t.right <= r.c.right, 'clock digits inside the clock tile');
    await context.close();
  });
}

test('auto-dim follows the clock', async () => {
  let o = await open({ time: new Date(2026, 10, 17, 23, 15) });
  assert.equal(await o.page.evaluate(() => document.getElementById('dock').classList.contains('dim')), true);
  await o.page.click('#settingsBtn');
  await o.page.click('#setAuto');
  await o.page.click('#settingsClose');
  assert.equal(await o.page.evaluate(() => document.getElementById('dock').classList.contains('dim')), false);
  await o.context.close();
  o = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.equal(await o.page.evaluate(() => document.getElementById('dock').classList.contains('dim')), false);
  await o.context.close();
});

test('night mode toggles from the clock tile', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  const red = () => page.evaluate(() => document.body.classList.contains('red'));
  const pressed = () => page.getAttribute('#redBtn', 'aria-pressed');
  assert.equal(await red(), false);
  await page.click('.tile.clock');
  assert.equal(await red(), true);
  assert.equal(await pressed(), 'true');
  await page.click('.tile.clock');
  assert.equal(await red(), false);
  assert.equal(await pressed(), 'false');
  await context.close();
});

test('this week tile lives on the second page', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.equal(await page.isVisible('#battBig'), true);
  assert.equal(await page.isVisible('#week'), false);
  await page.click('.dots [data-page="1"]');
  assert.equal(await page.isVisible('#week'), true);
  assert.equal(await page.isVisible('#battBig'), false);
  assert.equal(await page.locator('#week > div').count(), 7);
  assert.equal(await page.locator('#week .today').count(), 1);
  await context.close();
});

test('dots mark the current page', async () => {
  const { page, context } = await open();
  const current = () => page.evaluate(() =>
    [...document.querySelectorAll('.dots button')].map(b => b.getAttribute('aria-current')));
  assert.deepEqual(await current(), ['true', 'false']);
  await page.click('.dots [data-page="1"]');
  assert.deepEqual(await current(), ['false', 'true']);
  await context.close();
});

test('arrow keys and swiping change pages', async () => {
  const { page, context } = await open();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.isVisible('#week'), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.isVisible('#week'), false);
  const box = await page.locator('#tiles').boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, y, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.isVisible('#week'), true, 'swipe left shows page 2');
  await page.mouse.move(box.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 40, y, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.isVisible('#week'), false, 'swipe right shows page 1');
  await context.close();
});

for (const [w, h] of [[915, 412], [412, 915]]) {
  test(`week page fits ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h });
    await page.click('.dots [data-page="1"]');
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const wk = document.getElementById('week');
      const tile = wk.closest('.tile').getBoundingClientRect();
      const box = wk.getBoundingClientRect();
      return { overflow: wk.scrollWidth > wk.clientWidth, inside: box.left >= tile.left && box.right <= tile.right && box.top >= tile.top && box.bottom <= tile.bottom };
    });
    assert.equal(r.overflow, false, 'week strip does not overflow sideways');
    assert.equal(r.inside, true, 'week strip stays inside its tile');
    await context.close();
  });
}

test('no status bar at the top', async () => {
  const { page, context } = await open();
  assert.equal(await page.locator('.status').count(), 0);
  assert.equal(await page.evaluate(() => document.body.textContent.includes('Bedroom')), false);
  assert.equal(await page.evaluate(() => !!document.getElementById('chg')), false);
  await context.close();
});

for (const font of ['dot', 'mono', 'sans']) {
  for (const [w, h] of [[915, 412], [412, 915], [360, 800]]) {
    test(`clock fits with ${font} font, 12-hour, ${w}x${h}`, async () => {
      const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 55), settings: { font, hour12: true } });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const t = document.querySelector('.time').getBoundingClientRect();
        const c = document.querySelector('.tile.clock').getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, inside: t.left >= c.left && t.right <= c.right };
      });
      assert.ok(r.sw <= r.iw, 'no horizontal overflow');
      assert.equal(r.inside, true, 'clock inside its tile');
      await context.close();
    });
  }
}

test('settings opens and closes', async () => {
  const { page, context } = await open();
  assert.equal(await page.isVisible('#settings'), false);
  await page.click('#settingsBtn');
  assert.equal(await page.isVisible('#settings'), true);
  await page.click('#settingsClose');
  assert.equal(await page.isVisible('#settings'), false);
  await page.click('#settingsBtn');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#settings'), false);
  await context.close();
});

test('settings fit on small landscape screens', async () => {
  for (const [w, h] of [[915, 412], [800, 360]]) {
    const { page, context } = await open({ width: w, height: h });
    await page.click('#settingsBtn');
    const box = await page.locator('#settingsClose').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h, `close button on screen at ${w}x${h}`);
    await page.locator('#resetSettings').scrollIntoViewIfNeeded();
    assert.equal(await page.isVisible('#resetSettings'), true);
    await context.close();
  }
});

test('font setting changes the clock font and survives a reload', async () => {
  const { page, context } = await open();
  const family = () => page.evaluate(() => getComputedStyle(document.querySelector('.time')).fontFamily);
  assert.match(await family(), /Doto/);
  await page.click('#settingsBtn');
  await page.click('[data-font="mono"]');
  assert.match(await family(), /Space Mono/);
  await page.click('[data-font="sans"]');
  assert.doesNotMatch(await family(), /Doto|Space Mono/);
  await page.reload();
  assert.doesNotMatch(await family(), /Doto|Space Mono/);
  await context.close();
});

test('accent colour setting', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('[data-accent="#4aa3ff"]');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim()), '#4aa3ff');
  await context.close();
});

test('12-hour clock setting', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 13, 5) });
  assert.match(await page.textContent('#time'), /^13:05$/);
  await page.click('#settingsBtn');
  await page.click('[data-hour12="true"]');
  assert.match(await page.textContent('#time'), /^1:05\s*PM$/);
  await context.close();
});

test('week can start on Sunday', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 0) });
  await page.click('#settingsBtn');
  await page.click('[data-weekstart="0"]');
  await page.click('#settingsClose');
  await page.click('.dots [data-page="1"]');
  assert.equal(await page.textContent('#week > div:first-child span'), 'S');
  assert.equal(await page.textContent('#week > div:first-child b'), '15');
  await context.close();
});

test('dim hours and level are adjustable', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 22, 30) });
  const dim = () => page.evaluate(() => document.getElementById('dock').classList.contains('dim'));
  assert.equal(await dim(), true);
  await page.click('#settingsBtn');
  await page.click('#startPlus');
  assert.equal(await page.textContent('#startValue'), '23:00');
  await page.click('#settingsClose');
  assert.equal(await dim(), false, 'dimming now starts at 23:00');
  await page.click('#settingsBtn');
  await page.click('#levelPlus');
  assert.equal(await page.textContent('#levelValue'), '40%');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--dim-opacity').trim()), '0.4');
  await context.close();
});

test('reset restores the defaults', async () => {
  const { page, context } = await open({ settings: { font: 'mono', accent: '#4aa3ff', hour12: true } });
  await page.click('#settingsBtn');
  await page.click('#resetSettings');
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.time')).fontFamily), /Doto/);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim()), '#d71921');
  await context.close();
});

test('corrupt stored settings fall back to defaults without errors', async () => {
  for (const rawStorage of ['{not json', 'null', '"text"', '{"font":"comic","dimLevel":"x"}']) {
    const { page, context, problems } = await open({ rawStorage });
    assert.deepEqual(problems, [], `no errors for ${rawStorage}`);
    assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.time')).fontFamily), /Doto/);
    assert.match(await page.textContent('#time'), /^\d\d:\d\d$/);
    await context.close();
  }
});
