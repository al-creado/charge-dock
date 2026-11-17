// The app's setup page (web/setup.html): the styled replacement for the plain Android screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'setup.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
test.after(async () => { await browser.close(); });

const host = () => {
  window.__calls = [];
  window.SetupHost = {
    openDock() { window.__calls.push('openDock'); },
    openScreenSaverSettings() { window.__calls.push('openScreenSaverSettings'); },
    openNotificationAccess() { window.__calls.push('openNotificationAccess'); },
  };
};

async function open({ width = 412, height = 915, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(2000);
  const problems = [], external = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) external.push(u); });
  if (init) await context.addInitScript(init);
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  return { page, context, problems, external };
}

test('loads offline with no errors and the dot-matrix title', async () => {
  const { page, context, problems, external } = await open();
  assert.deepEqual(external, []);
  assert.deepEqual(problems, []);
  assert.equal(await page.textContent('#title'), 'Charge Dock');
  const doto = await page.evaluate(() => document.fonts.load('700 20px Doto').then(f => f.length));
  assert.ok(doto > 0, 'Doto is bundled');
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('title')).fontFamily), /Doto/);
  await context.close();
});

test('the buttons ask the app to open the dock and the two system settings pages', async () => {
  const { page, context } = await open({ init: host });
  await page.click('#openDock');
  await page.click('#screenSaver');
  await page.click('#notifAccess');
  assert.deepEqual(await page.evaluate(() => window.__calls), ['openDock', 'openScreenSaverSettings', 'openNotificationAccess']);
  await context.close();
});

test('buttons do nothing and raise no error when there is no app around', async () => {
  const { page, context, problems } = await open();
  await page.click('#openDock'); await page.click('#screenSaver'); await page.click('#notifAccess');
  assert.deepEqual(problems, []);
  await context.close();
});

test('the notification status follows what the app reports', async () => {
  const { page, context } = await open({ init: host });
  const status = () => page.evaluate(() => ({ text: document.getElementById('notifStatus').textContent, state: document.getElementById('notifStatus').dataset.state }));
  assert.equal((await status()).state, 'unknown');
  await page.evaluate(() => window.setNotificationAccess(true));
  assert.deepEqual(await status(), { text: 'On', state: 'on' });
  await page.evaluate(() => window.setNotificationAccess(false));
  assert.deepEqual(await status(), { text: 'Off', state: 'off' });
  await context.close();
});

test('it says plainly that only app names and counts are shown', async () => {
  const { page, context } = await open();
  assert.match(await page.textContent('body'), /app names and counts only/i);
  assert.match(await page.textContent('body'), /never message text/i);
  await context.close();
});

for (const [w, h] of [[360, 640], [412, 915], [915, 412], [800, 360]]) {
  test(`fits ${w}x${h}: no sideways overflow, big touch targets`, async () => {
    const { page, context } = await open({ width: w, height: h });
    const r = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: innerWidth,
      heights: ['openDock', 'screenSaver', 'notifAccess'].map(id => document.getElementById(id).getBoundingClientRect().height),
    }));
    assert.ok(r.sw <= r.iw, `no sideways overflow (${r.sw} > ${r.iw})`);
    for (const hgt of r.heights) assert.ok(hgt >= 48, `touch target ${hgt}px`);
    await context.close();
  });
}

test('the Open dock button is visible without scrolling on a small phone', async () => {
  const { page, context } = await open({ width: 360, height: 640 });
  const box = await page.locator('#openDock').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 640, `button at ${Math.round(box.y)}..${Math.round(box.y + box.height)}`);
  await context.close();
});

test('cards are evenly spaced', async () => {
  const { page, context } = await open({ width: 412, height: 915 });
  const gaps = await page.evaluate(() => {
    const r = sel => document.querySelector(sel).getBoundingClientRect();
    const a = r('#openDock'), b = r('#startCard'), c = r('#notifCard');
    return [b.top - a.bottom, c.top - b.bottom];
  });
  assert.ok(Math.abs(gaps[0] - gaps[1]) <= 1, `gaps differ: ${gaps}`);
  await context.close();
});
