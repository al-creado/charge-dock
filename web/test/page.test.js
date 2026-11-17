const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
test.after(async () => { await browser.close(); });

// Opens the page in a fresh context; collects errors and any non-file network requests.
async function open({ width = 915, height = 412, time, settings, rawStorage, init } = {}) {
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
  if (init) await context.addInitScript(init);
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

// Sets a range input the way a finger drag would.
const slide = (page, sel, value) => page.locator(sel).evaluate((el, v) => {
  el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
const accentVar = page => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim());

test('custom colour picker sets the accent from sliders', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  assert.equal(await page.isVisible('#customRow'), false);
  await page.click('#customSwatch');
  assert.equal(await page.isVisible('#customRow'), true);
  await slide(page, '#hue', 210); await slide(page, '#sat', 100); await slide(page, '#lig', 60);
  assert.equal(await accentVar(page), '#3399ff');
  assert.equal(await page.inputValue('#customHex'), '#3399ff');
  assert.equal(await page.getAttribute('#customSwatch', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-accent="#d71921"]', 'aria-pressed'), 'false');
  await context.close();
});

test('custom colour survives a reload and opens with its sliders in place', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await slide(page, '#hue', 210); await slide(page, '#sat', 100); await slide(page, '#lig', 60);
  await page.reload();
  assert.equal(await accentVar(page), '#3399ff');
  await page.click('#settingsBtn');
  assert.equal(await page.isVisible('#customRow'), true, 'custom row is open for a custom accent');
  assert.equal(await page.inputValue('#hue'), '210');
  await context.close();
});

test('a too-dark custom colour is lifted so the accent stays visible', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await slide(page, '#lig', 0);
  const shown = await accentVar(page);
  assert.notEqual(shown, '#000000');
  assert.notEqual(shown, '#000');
  await context.close();
});

test('selected buttons stay readable on a light accent', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('[data-accent="#f4f3f0"]');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--on-accent').trim()), '#000000');
  await page.click('[data-accent="#d71921"]');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--on-accent').trim()), '#ffffff');
  await context.close();
});

test('reset also clears a custom colour', async () => {
  const { page, context } = await open({ settings: { accent: '#3399ff' } });
  await page.click('#settingsBtn');
  await page.click('#resetSettings');
  assert.equal(await accentVar(page), '#d71921');
  assert.equal(await page.isVisible('#customRow'), false);
  await context.close();
});

test('the colour picker fits on small landscape screens', async () => {
  const { page, context } = await open({ width: 800, height: 360 });
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await page.locator('#lig').scrollIntoViewIfNeeded();
  const box = await page.locator('#lig').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 800 && box.y >= 0 && box.y + box.height <= 360, 'lightness slider on screen');
  const closeBox = await page.locator('#settingsClose').boundingBox();
  assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= 360, 'close stays reachable');
  await context.close();
});

// How much of its tile each right-hand tile's content uses, and whether anything is clipped.
const measureTiles = page => page.evaluate(() => [...document.querySelectorAll('.tiles .page:not([hidden]) .tile')].map(tile => {
  const t = tile.getBoundingClientRect();
  const label = tile.querySelector('.label').getBoundingClientRect();
  const content = tile.lastElementChild.getBoundingClientRect();
  return {
    name: tile.querySelector('.label').textContent.trim(),
    fill: content.height / (t.height - label.height),
    clipped: tile.scrollHeight > tile.clientHeight + 1 || tile.scrollWidth > tile.clientWidth + 1,
    inside: content.bottom <= t.bottom + 1 && content.right <= t.right + 1,
  };
}));

for (const [w, h] of [[412, 915], [360, 800], [915, 412], [800, 360]]) {
  test(`tiles use their space at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15) });
    await page.evaluate(() => window.setBattery(0.82, true, 2280));
    await page.evaluate(() => document.fonts.ready);
    for (const tile of await measureTiles(page)) {
      assert.equal(tile.clipped, false, `${tile.name} is not clipped`);
      assert.equal(tile.inside, true, `${tile.name} content stays inside`);
      const need = tile.name.startsWith('Battery') ? 0.5 : 0.35;
      assert.ok(tile.fill >= need, `${tile.name} content fills ${Math.round(tile.fill * 100)}% (needs ${need * 100}%)`);
    }
    await page.click('.dots [data-page="1"]');
    for (const tile of await measureTiles(page)) {
      assert.equal(tile.clipped, false, `${tile.name} is not clipped`);
      assert.ok(tile.fill >= 0.6, `${tile.name} content fills ${Math.round(tile.fill * 100)}% (needs 60%)`);
    }
    await context.close();
  });
}

test('date tile shows the weekday and the month', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.equal(await page.textContent('#dayNum'), '17');
  assert.equal(await page.textContent('#dayName'), 'Tuesday');
  assert.equal(await page.textContent('#dayMonth'), 'November 2026');
  await context.close();
});

for (const [w, h] of [[412, 915], [360, 800], [915, 412], [800, 360]]) {
  test(`clock tile is tall enough for its digits at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15) });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const c = document.querySelector('.tile.clock').getBoundingClientRect();
      const t = document.querySelector('.time').getBoundingClientRect();
      const d = document.querySelector('.date').getBoundingClientRect();
      return { tileH: c.height, inside: t.top >= c.top - 1 && d.bottom <= c.bottom + 1 };
    });
    assert.ok(r.tileH > 100, `clock tile has height (${Math.round(r.tileH)}px)`);
    assert.equal(r.inside, true, 'digits and date are inside the clock tile');
    await context.close();
  });
}

test('custom colour button shows an edit icon, not a rainbow', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  assert.equal(await page.locator('#customSwatch svg').count(), 1, 'has an icon');
  assert.doesNotMatch(await page.evaluate(() => getComputedStyle(document.getElementById('customSwatch')).backgroundImage), /conic|gradient/);
  await context.close();
});

test('custom colour button takes on the chosen colour and keeps a readable icon', async () => {
  const { page, context } = await open({ settings: { accent: '#3399ff' } });
  await page.click('#settingsBtn');
  const look = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('customSwatch'));
    return { bg: s.backgroundColor, icon: s.color };
  });
  assert.equal(look.bg, 'rgb(51, 153, 255)');
  assert.equal(look.icon, 'rgb(0, 0, 0)', 'black icon on a light blue');
  await context.close();
});

for (const [w, h] of [[915, 412], [412, 915]]) {
  test(`edit icon is centred in its button at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h });
    await page.click('#settingsBtn');
    const d = await page.evaluate(() => {
      const b = document.getElementById('customSwatch').getBoundingClientRect();
      const i = document.querySelector('#customSwatch svg').getBoundingClientRect();
      return { dx: Math.abs((b.left + b.width / 2) - (i.left + i.width / 2)), dy: Math.abs((b.top + b.height / 2) - (i.top + i.height / 2)) };
    });
    assert.ok(d.dx <= 0.5 && d.dy <= 0.5, `icon off centre by ${d.dx}px, ${d.dy}px`);
    await context.close();
  });
}

test('a pasted hex code sets the accent and moves the sliders', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await page.fill('#customHex', '#12AB34');
  assert.equal(await accentVar(page), '#12ab34');
  assert.equal(await page.getAttribute('#customHex', 'aria-invalid'), 'false');
  assert.equal(await page.inputValue('#hue'), '133');
  await page.fill('#customHex', '39f');
  assert.equal(await accentVar(page), '#3399ff');
  await context.close();
});

test('typing a real clipboard-style insert works too', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await page.focus('#customHex');
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('#aa00ff');
  assert.equal(await accentVar(page), '#aa00ff');
  await context.close();
});

test('an invalid hex code leaves the colour alone and is marked, then restores on blur', async () => {
  const { page, context } = await open({ settings: { accent: '#3399ff' } });
  await page.click('#settingsBtn');
  await page.fill('#customHex', 'nope');
  assert.equal(await accentVar(page), '#3399ff');
  assert.equal(await page.getAttribute('#customHex', 'aria-invalid'), 'true');
  await page.locator('#customHex').blur();
  assert.equal(await page.inputValue('#customHex'), '#3399ff');
  assert.equal(await page.getAttribute('#customHex', 'aria-invalid'), 'false');
  await context.close();
});

test('moving a slider updates the hex field', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await slide(page, '#hue', 210); await slide(page, '#sat', 100); await slide(page, '#lig', 60);
  assert.equal(await page.inputValue('#customHex'), '#3399ff');
  await context.close();
});

const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('theme setting switches the palette and survives a reload', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.equal(await theme(page), 'dark');
  await page.click('#settingsBtn');
  await page.click('[data-themeopt="light"]');
  assert.equal(await theme(page), 'light');
  assert.equal(await bodyBg(page), 'rgb(242, 242, 244)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('settings')).backgroundColor), 'rgb(242, 242, 244)', 'settings sheet is light too');
  await page.reload();
  assert.equal(await theme(page), 'light');
  await page.click('#settingsBtn');
  assert.equal(await page.getAttribute('[data-themeopt="light"]', 'aria-pressed'), 'true');
  await page.click('#resetSettings');
  assert.equal(await theme(page), 'dark');
  await context.close();
});

test('device default follows the phone, live', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), settings: { theme: 'system' } });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.evaluate(() => window.setSystemTheme(false));
  assert.equal(await theme(page), 'light', 'the app can report the system theme directly');
  await context.close();
});

test('a dimmed screen is dark even on the light theme, and returns to light after', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 23, 15), settings: { theme: 'light' } });
  assert.equal(await theme(page), 'dark');
  await page.click('#settingsBtn');
  await page.click('#setAuto');
  assert.equal(await theme(page), 'light');
  await context.close();
});

test('night mode stays dark red on the light theme', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), settings: { theme: 'light', red: true } });
  assert.equal(await bodyBg(page), 'rgb(6, 1, 2)');
  await context.close();
});

test('pale accents are darkened on the light theme', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), settings: { theme: 'light', accent: '#ffb25b' } });
  assert.notEqual(await accentVar(page), '#ffb25b');
  await context.close();
});

// ---- findings from the whole-branch review ----

test('the colon keeps blinking: its element survives the clock ticking', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15, 0) });
  await page.evaluate(() => { window.__colon = document.querySelector('.colon'); });
  await page.clock.runFor(3500);
  assert.equal(await page.evaluate(() => window.__colon === document.querySelector('.colon')), true, 'same colon element after ticks');
  await page.clock.runFor(60000);
  assert.equal(await page.evaluate(() => window.__colon === document.querySelector('.colon')), true, 'same colon element after the minute changes');
  assert.match(await page.textContent('#time'), /^12:16$/);
  await context.close();
});

test('burn-in drift moves the whole dock, bottom bar included', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15, 0) });
  assert.equal(await page.evaluate(() => document.getElementById('dock').style.transform), '');
  await page.clock.runFor(125000);
  assert.match(await page.evaluate(() => document.getElementById('dock').style.transform), /translate\(/);
  assert.equal(await page.evaluate(() => document.getElementById('stage').style.transform), '');
  await context.close();
});

const hostStub = () => { window.__exits = 0; window.DockHost = { exit() { window.__exits++; } }; };
const exits = page => page.evaluate(() => window.__exits);
const holdOn = async (page, selector, ms = 900) => {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(ms);
  await page.mouse.up();
};

test('a long press on the clock tile asks the app to leave, and does not toggle night mode', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: hostStub });
  await holdOn(page, '.tile.clock');
  assert.equal(await exits(page), 1);
  assert.equal(await page.evaluate(() => document.body.classList.contains('red')), false);
  await context.close();
});

test('a short tap on the clock tile toggles night mode and does not leave', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: hostStub });
  await holdOn(page, '.tile.clock', 100);
  assert.equal(await exits(page), 0);
  assert.equal(await page.evaluate(() => document.body.classList.contains('red')), true);
  await context.close();
});

test('holding a control in settings never leaves the dock', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: hostStub });
  await page.click('#settingsBtn');
  await page.click('#customSwatch');
  await holdOn(page, '#customHex');
  await holdOn(page, '#hue');
  await holdOn(page, '#startPlus');
  assert.equal(await exits(page), 0);
  await context.close();
});

test('a long press does nothing and raises no error when there is no app around', async () => {
  const { page, context, problems } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  await holdOn(page, '.tile.clock');
  assert.deepEqual(problems, []);
  await context.close();
});

test('once the app reports the theme, the browser media query is ignored', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), settings: { theme: 'system' } });
  await page.evaluate(() => window.setSystemTheme(false));
  assert.equal(await theme(page), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  assert.equal(await theme(page), 'light');
  await page.evaluate(() => window.setSystemTheme(true));
  assert.equal(await theme(page), 'dark');
  await context.close();
});

test('dim hours follow the 12-hour setting', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  const values = () => page.evaluate(() => [document.getElementById('startValue').textContent, document.getElementById('endValue').textContent]);
  await page.click('#settingsBtn');
  assert.deepEqual(await values(), ['22:00', '07:00']);
  await page.click('[data-hour12="true"]');
  assert.deepEqual(await values(), ['10:00 PM', '7:00 AM']);
  await page.click('#startPlus');
  assert.equal(await page.textContent('#startValue'), '11:00 PM');
  await page.click('#startPlus');
  assert.equal(await page.textContent('#startValue'), '12:00 AM');
  await page.click('[data-hour12="false"]');
  assert.equal(await page.textContent('#startValue'), '00:00');
  await context.close();
});

for (const hour12 of [false, true]) {
  test(`dim rows fit on a narrow phone (${hour12 ? '12' : '24'}-hour)`, async () => {
    const { page, context } = await open({ width: 360, height: 800, settings: { hour12 } });
    await page.click('#settingsBtn');
    const overflow = await page.evaluate(() => ['startValue', 'endValue'].map(id => {
      const row = document.getElementById(id).closest('.row');
      return row.scrollWidth > row.clientWidth;
    }));
    assert.deepEqual(overflow, [false, false]);
    await context.close();
  });
}

// ---- hidden: hold the battery tile for five seconds ----
const randomZero = () => { Math.random = () => 0; };
const flashStyle = page => page.evaluate(() => document.getElementById('flash').style.opacity);
const pct = page => page.textContent('#pct');
const press = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  return { x, y };
};

const agent = page => page.evaluate(() => document.getElementById('flash').dataset.agent || '');
const orbShown = page => page.evaluate(() => !document.getElementById('orb').hidden);

test('holding the battery tile for five seconds fills the ring, an orb flies in, the screen flashes, then it returns to normal', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile');
  await page.clock.runFor(4900);
  assert.equal(await pct(page), '82%', 'nothing happens before five seconds');
  assert.equal(await orbShown(page), false);
  assert.equal(await flashStyle(page), '0');
  await page.clock.runFor(200);
  assert.equal(await pct(page), '100%', 'ring jumps to full after five seconds');
  assert.equal(await agent(page), 'phoenix');
  assert.equal(await orbShown(page), true, 'the orb is in flight');
  assert.equal(await flashStyle(page), '0', 'the flash is still winding up');
  await page.clock.runFor(800);   // Phoenix: 700 ms windup
  assert.equal(await flashStyle(page), '1', 'full white');
  assert.equal(await orbShown(page), false, 'the orb has popped');
  assert.equal(await page.evaluate(() => document.getElementById('flash').style.getPropertyValue('--tint')), '#ff7a1a');
  await page.clock.runFor(400);   // hold
  await page.clock.runFor(2000);  // fade and recovery
  assert.equal(await flashStyle(page), '0', 'back to normal');
  assert.equal(await pct(page), '82%', 'the real battery level returns');
  assert.equal(await agent(page), '', 'the effect is cleared');
  await page.mouse.up();
  await context.close();
});

for (const [i, id, tint, windup] of [[0, 'phoenix', '#ff7a1a', 700], [1, 'breach', '#ffb21e', 350], [2, 'yoru', '#4a7dff', 900], [3, 'skye', '#4be08a', 550], [4, 'kayo', '#2fd0ff', 500]]) {
  test(`${id} flashes with its own colour`, async () => {
    const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: () => { Math.random = () => 0.1 + 0.2 * Number(window.name || 0); } });
    await page.evaluate(n => { window.name = String(n); }, i);
    await page.evaluate(() => window.setBattery(0.82, true, 2280));
    await press(page, '#battTile');
    await page.clock.runFor(5000 + windup + 50);   // just after this agent's windup, while the screen is white
    assert.equal(await agent(page), id);
    assert.equal(await flashStyle(page), '1');
    assert.equal(await page.evaluate(() => document.getElementById('flash').style.getPropertyValue('--tint')), tint);
    await page.mouse.up();
    await context.close();
  });
}

test('releasing early, moving away, or other tiles do nothing', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  // each check is made 5.3 s after pressing, when the effect would be on screen
  await press(page, '#battTile'); await page.clock.runFor(3000); await page.mouse.up(); await page.clock.runFor(2300);
  assert.equal(await pct(page), '82%', 'released early');
  await page.clock.runFor(5000);
  const { x, y } = await press(page, '#battTile');
  await page.clock.runFor(1000); await page.mouse.move(x + 60, y + 40); await page.clock.runFor(4300);
  assert.equal(await pct(page), '82%', 'moved away');
  await page.mouse.up(); await page.clock.runFor(5000);
  await press(page, '#page0 .tile:nth-child(2)'); await page.clock.runFor(5300);
  assert.equal(await pct(page), '82%', 'a different tile');
  assert.equal(await flashStyle(page), '0');
  await page.mouse.up();
  await context.close();
});

test('the flash overlay and the orb never block touches', async () => {
  const { page, context } = await open();
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('flash')).pointerEvents), 'none');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('orb')).pointerEvents), 'none');
  await context.close();
});

test('the same agent never flashes twice in a row', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(5000 + 300); await page.mouse.up();
  assert.equal(await agent(page), 'phoenix', 'the first agent');
  await page.clock.runFor(5000);
  await press(page, '#battTile'); await page.clock.runFor(5000 + 400); await page.mouse.up();
  assert.equal(await agent(page), 'breach', 'a different agent the second time');
  await context.close();
});

test('with visual effects turned down, holding does nothing', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero, settings: { reduceEffects: true } });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(5300);
  assert.equal(await pct(page), '82%', 'ring does not jump to full');
  await page.clock.runFor(600);   // where the white flash would be
  assert.equal(await flashStyle(page), '0');
  assert.equal(await orbShown(page), false);
  await page.mouse.up();
  await context.close();
});

test('with reduce-motion on, the ring still fills but the screen never goes white', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(5200);
  assert.equal(await pct(page), '100%');
  await page.clock.runFor(700);   // 5.9 s: where the Phoenix flash is at full white
  assert.equal(await flashStyle(page), '0', 'no white flash');
  assert.equal(await orbShown(page), false, 'and no flying orb');
  await page.mouse.up();
  await context.close();
});

test('the turn-down-effects switch is off by default, can be turned on, and is remembered', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  await page.click('#settingsBtn');
  assert.equal(await page.getAttribute('#setReduce', 'aria-checked'), 'false');
  await page.click('#setReduce');
  assert.equal(await page.getAttribute('#setReduce', 'aria-checked'), 'true');
  await page.reload();
  await page.click('#settingsBtn');
  assert.equal(await page.getAttribute('#setReduce', 'aria-checked'), 'true');
  await context.close();
});

test('a battery reading that arrives during the effect does not break it', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(5200);
  await page.evaluate(() => window.setBattery(0.83, true, 2200));
  assert.equal(await pct(page), '100%', 'the effect keeps the ring full');
  await page.clock.runFor(6000); await page.mouse.up();
  assert.equal(await pct(page), '83%', 'then the newest reading is shown');
  await context.close();
});

// ---- even spacing ----
// Every outer margin and every gap between tiles should be the same value.
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity).map(a => a.finished)));
const spacing = async page => { await settled(page); return page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  const q = s => document.querySelector(s);
  const clock = r(q('.tile.clock')), tiles = [...document.querySelectorAll('.tiles .page:not([hidden]) .tile')].map(r);
  const bottom = r(q('.bottom')), W = innerWidth, H = innerHeight;
  const rightmost = Math.max(...tiles.map(t => t.right)), lowest = Math.max(clock.bottom, ...tiles.map(t => t.bottom));
  const out = { left: clock.left, right: W - rightmost, top: Math.min(clock.top, ...tiles.map(t => t.top)), bottomBar: H - bottom.bottom, aboveBar: bottom.top - lowest };
  const landscape = clock.right < tiles[0].left;
  if (landscape) out.clockToTiles = tiles[0].left - clock.right; else out.clockToTiles = tiles[0].top - clock.bottom;
  if (tiles.length > 1) {
    out.tileRow = tiles[1].top - tiles[0].bottom;
    if (tiles.length > 2) out.tileColumn = tiles[2].left - tiles[1].right;
  }
  return out;
}); };

for (const [w, h] of [[915, 412], [412, 915], [800, 360], [360, 800]]) {
  test(`spacing is even on page one at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15) });
    await page.evaluate(() => document.fonts.ready);
    const sp = await spacing(page);
    const values = Object.values(sp);
    const spread = Math.max(...values) - Math.min(...values);
    assert.ok(spread <= 1, `spacing differs by ${spread.toFixed(1)}px: ${JSON.stringify(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, +v.toFixed(1)])))}`);
    assert.ok(Math.min(...values) >= 8, 'spacing is not cramped');
    await page.click('.dots [data-page="1"]');
    const sp2 = await spacing(page);
    const v2 = Object.values(sp2);
    assert.ok(Math.max(...v2) - Math.min(...v2) <= 1, `page two spacing differs: ${JSON.stringify(sp2)}`);
    await context.close();
  });
}

test('tile padding is the same on every side', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  const pads = await page.evaluate(() => [...document.querySelectorAll('.tiles .page:not([hidden]) .tile')].map(t => {
    const s = getComputedStyle(t); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
  }));
  for (const p of pads) assert.ok(Math.max(...p) - Math.min(...p) < 0.5, JSON.stringify(p));
  assert.ok(Math.max(...pads.flat()) - Math.min(...pads.flat()) < 0.5, 'all tiles share one padding');
  await context.close();
});

test('settings rows have the same gap across and down', async () => {
  const { page, context } = await open({ width: 915, height: 412 });
  await page.click('#settingsBtn');
  const g = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.rows')); return [parseFloat(s.rowGap), parseFloat(s.columnGap)]; });
  assert.equal(g[0], g[1]);
  await context.close();
});

const colonAnimation = page => page.evaluate(() => getComputedStyle(document.querySelector('.colon')).animationName);

test('the switch is called Turn down visual effects and gives nothing else away', async () => {
  const { page, context } = await open();
  await page.click('#settingsBtn');
  assert.equal(await page.getAttribute('#setReduce', 'aria-label'), 'Turn down visual effects');
  const labels = await page.evaluate(() => [...document.querySelectorAll('#settings .rl')].map(e => e.textContent));
  assert.ok(labels.includes('Turn down visual effects'));
  assert.equal(labels.some(l => /flash|surprise|egg/i.test(l)), false);
  await context.close();
});

test('the clock colon blinks by default and stops when visual effects are turned down', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.notEqual(await colonAnimation(page), 'none');
  await page.click('#settingsBtn');
  await page.click('#setReduce');
  assert.equal(await colonAnimation(page), 'none', 'colon is steady');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.colon')).opacity), '1');
  await page.click('#setReduce');
  assert.notEqual(await colonAnimation(page), 'none', 'and blinks again when turned back on');
  await context.close();
});

test('a steady colon stays steady after a reload', async () => {
  const { page, context } = await open({ settings: { reduceEffects: true } });
  assert.equal(await colonAnimation(page), 'none');
  await context.close();
});
