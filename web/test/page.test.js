const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
test.after(async () => { await browser.close(); });

// Opens the page in a fresh context; collects errors and any non-file network requests.
async function open({ width = 915, height = 412, time } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems = [], external = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) external.push(u); });
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
    chg: document.getElementById('chg').textContent,
  }));
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  assert.deepEqual(await read(), { pct: '82%', big: 'Charging', sub: 'Full in about 38 min', chg: 'Charging · 82%' });
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
  await o.page.click('#autoBtn');
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
