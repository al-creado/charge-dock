const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
test.after(async () => { await browser.close(); });

// Opens the page in a fresh context; collects errors and any non-file network requests.
const WEATHER_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'get.geojs.io'];
async function open({ width = 915, height = 412, time, settings, rawStorage, init, net, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: touch });
  const page = await context.newPage();
  page.setDefaultTimeout(2000);
  const problems = [], external = [], weatherRequests = [];
  const network = { ...(net || {}) };   // ip / forecast / geocode answers; leave one out (or the whole thing) to simulate no connection
  await context.route(u => WEATHER_HOSTS.includes(new URL(u).hostname), route => {
    const url = route.request().url(), host = new URL(url).hostname;
    weatherRequests.push(url);
    const answer = host === 'get.geojs.io' ? network.ip : host === 'geocoding-api.open-meteo.com' ? network.geocode : network.forecast;
    return answer ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) }) : route.abort('internetdisconnected');
  });
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) problems.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !WEATHER_HOSTS.includes(new URL(u).hostname)) external.push(u); });
  if (settings !== undefined || rawStorage !== undefined) {
    const value = rawStorage !== undefined ? rawStorage : JSON.stringify(settings);
    await context.addInitScript(v => { try { localStorage.setItem('charge-dock-settings', v); } catch (e) {} }, value);
  }
  if (init) await context.addInitScript(init);
  if (time) await page.clock.install({ time });
  await page.goto(PAGE_URL);
  await page.waitForLoadState('load');
  return { page, context, problems, external, weatherRequests, network };
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

test('page one has Battery and Notifications, page two Next alarm and Battery details, page three This week', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  const labels = async () => page.evaluate(() => [...document.querySelectorAll('.tiles .page:not([hidden]) .tile .label')].map(l => l.textContent.trim().replace(/ · sample$/, '')));
  assert.deepEqual(await labels(), ['Battery', 'Notifications']);
  assert.equal(await page.isVisible('#week'), false);
  await page.click('.dots [data-page="1"]');
  assert.deepEqual(await labels(), ['Next alarm', 'Battery details']);
  assert.equal(await page.isVisible('#battBig'), false);
  await page.click('.dots [data-page="2"]');
  assert.deepEqual(await labels(), ['This week']);
  assert.equal(await page.isVisible('#week'), true);
  assert.equal(await page.locator('#week > div').count(), 7);
  assert.equal(await page.locator('#week .today').count(), 1);
  await context.close();
});

test('dots mark the current page', async () => {
  const { page, context } = await open();
  const current = () => page.evaluate(() =>
    [...document.querySelectorAll('.dots button')].map(b => b.getAttribute('aria-current')));
  assert.deepEqual(await current(), ['true', 'false', 'false']);
  await page.click('.dots [data-page="1"]');
  assert.deepEqual(await current(), ['false', 'true', 'false']);
  await page.click('.dots [data-page="2"]');
  assert.deepEqual(await current(), ['false', 'false', 'true']);
  await context.close();
});

test('arrow keys and swiping change pages', async () => {
  const { page, context } = await open();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.isVisible('#alarmTile'), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.isVisible('#week'), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.isVisible('#week'), true, 'stops at the last page');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.isVisible('#battTile'), true);
  const box = await page.locator('#tiles').boundingBox();
  const y = box.y + box.height / 2;
  const swipe = async (from, to) => { await page.mouse.move(from, y); await page.mouse.down(); await page.mouse.move(to, y, { steps: 5 }); await page.mouse.up(); };
  await swipe(box.x + box.width - 20, box.x + 20);
  assert.equal(await page.isVisible('#alarmTile'), true, 'swipe left shows page 2');
  await swipe(box.x + box.width - 20, box.x + 20);
  assert.equal(await page.isVisible('#week'), true, 'swipe left again shows page 3');
  await swipe(box.x + 20, box.x + box.width - 20);
  await swipe(box.x + 20, box.x + box.width - 20);
  assert.equal(await page.isVisible('#battTile'), true, 'swipe right twice is back on page 1');
  await context.close();
});

for (const [w, h] of [[915, 412], [412, 915]]) {
  test(`week page fits ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h });
    await page.click('.dots [data-page="2"]');
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
  await page.click('.dots [data-page="2"]');
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
      const need = tile.name === 'Battery' ? 0.4 : 0.35;
      assert.ok(tile.fill >= need, `${tile.name} content fills ${Math.round(tile.fill * 100)}% (needs ${need * 100}%)`);
    }
    await page.click('.dots [data-page="1"]');
    for (const tile of await measureTiles(page)) {
      assert.equal(tile.clipped, false, `${tile.name} is not clipped`);
      assert.equal(tile.inside, true, `${tile.name} content stays inside`);
      assert.ok(tile.fill >= 0.35, `${tile.name} content fills ${Math.round(tile.fill * 100)}% (needs 35%)`);
    }
    await page.click('.dots [data-page="2"]');
    for (const tile of await measureTiles(page)) {
      assert.equal(tile.clipped, false, `${tile.name} is not clipped`);
      assert.ok(tile.fill >= 0.6, `${tile.name} content fills ${Math.round(tile.fill * 100)}% (needs 60%)`);
    }
    await context.close();
  });
}

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
const HOLD = 2000, CHARGE = 1800;   // hold for 2 s, then the ring charges up for 1.8 s (while you keep holding)
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

test('holding the battery tile for two seconds charges the ring to 100%, an orb flies in, the screen flashes, then it returns to normal', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile');
  await page.clock.runFor(HOLD - 100);
  assert.equal(await pct(page), '82%', 'nothing happens before two seconds');
  assert.equal(await orbShown(page), false);
  await page.clock.runFor(1100);                       // 1.0 s into the charge-up
  const mid = parseInt(await pct(page), 10);
  assert.ok(mid > 82 && mid < 100, `the percentage is climbing (${mid}%)`);
  assert.notEqual(await page.textContent('#battBig'), 'Fully flashed', 'not full yet');
  assert.equal(await orbShown(page), false, 'no orb until the ring is full');
  assert.equal(await flashStyle(page), '0');
  await page.clock.runFor(CHARGE - 1000 + 100);         // just past full
  assert.equal(await pct(page), '100%', 'the ring reaches 100%');
  assert.equal(await page.textContent('#battBig'), 'Fully flashed', 'the heading says it');
  assert.equal(await page.isHidden('#battSub'), true, 'and the line underneath is gone');
  assert.equal(await agent(page), 'phoenix');
  assert.equal(await orbShown(page), true, 'the orb is in flight');
  assert.equal(await flashStyle(page), '0', 'the flash is still winding up');
  await page.clock.runFor(800);                         // Phoenix: 700 ms windup
  assert.equal(await flashStyle(page), '1', 'full white');
  assert.equal(await orbShown(page), false, 'the orb has popped');
  assert.equal(await page.evaluate(() => document.getElementById('flash').style.getPropertyValue('--tint')), '#ff7a1a');
  await page.clock.runFor(400);                         // hold
  // Fade and recovery. Step the clock until the effect has cleared (bounded), so a slow CI machine can't make this flaky.
  for (let i = 0; i < 8 && (await agent(page)) !== ''; i++) await page.clock.runFor(500);
  assert.equal(await flashStyle(page), '0', 'back to normal');
  assert.equal(await pct(page), '82%', 'the real battery level returns');
  assert.equal(await page.isVisible('#battSub'), true, 'the line under the heading is back');
  assert.equal(await page.textContent('#battBig'), 'Charging');
  assert.equal(await page.textContent('#battSub'), 'Full in about 38 min', 'and its text');
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
    await page.clock.runFor(HOLD + CHARGE + windup + 50);   // just after this agent's windup, while the screen is white
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
  // each check is made 2.5 s after pressing, when the charge-up would be under way
  await press(page, '#battTile'); await page.clock.runFor(1000); await page.mouse.up(); await page.clock.runFor(1500);
  assert.equal(await pct(page), '82%', 'released early');
  await page.clock.runFor(5000);
  const { x, y } = await press(page, '#battTile');
  await page.clock.runFor(500); await page.mouse.move(x + 60, y + 40); await page.clock.runFor(2000);
  assert.equal(await pct(page), '82%', 'moved away');
  await page.mouse.up(); await page.clock.runFor(5000);
  await press(page, '#page0 .tile:nth-child(2)'); await page.clock.runFor(2500);
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
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 300); await page.mouse.up();
  assert.equal(await agent(page), 'phoenix', 'the first agent');
  await page.clock.runFor(6000);
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 400); await page.mouse.up();
  assert.equal(await agent(page), 'breach', 'a different agent the second time');
  await context.close();
});

test('with visual effects turned down, holding does nothing', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero, settings: { reduceEffects: true } });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(HOLD + 300);
  assert.equal(await pct(page), '82%', 'the ring does not charge up');
  await page.clock.runFor(CHARGE + 800);   // where the white flash would be
  assert.equal(await flashStyle(page), '0');
  assert.equal(await orbShown(page), false);
  await page.mouse.up();
  await context.close();
});

test('with reduce-motion on, the ring still fills but the screen never goes white', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 200);
  assert.equal(await pct(page), '100%');
  await page.clock.runFor(700);   // where the Phoenix flash would be at full white
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
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 200);
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
  if (tiles.length > 1) { if (landscape) out.tileRow = tiles[1].top - tiles[0].bottom; else out.tileColumn = tiles[1].left - tiles[0].right; }
  return out;
}); };

for (const [w, h] of [[915, 412], [412, 915], [800, 360], [360, 800]]) {
  test(`spacing is even on page one at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15) });
    await page.evaluate(() => document.fonts.ready);
    const sp = await spacing(page);
    const portrait = w < h;
    if (portrait) { assert.ok(sp.top >= 28, `portrait leaves room at the top (${sp.top.toFixed(1)}px)`); delete sp.top; }
    const values = Object.values(sp);
    const spread = Math.max(...values) - Math.min(...values);
    assert.ok(spread <= 1, `spacing differs by ${spread.toFixed(1)}px: ${JSON.stringify(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, +v.toFixed(1)])))}`);
    assert.ok(Math.min(...values) >= 8, 'spacing is not cramped');
    for (const n of [1, 2]) {
      await page.click(`.dots [data-page="${n}"]`);
      const sp2 = await spacing(page);
      if (portrait) delete sp2.top;
      const v2 = Object.values(sp2);
      assert.ok(Math.max(...v2) - Math.min(...v2) <= 1, `page ${n + 1} spacing differs: ${JSON.stringify(sp2)}`);
    }
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

test('tapping never shows the browser tap-highlight overlay (the blue layer on Android)', async () => {
  const { page, context } = await open();
  const colours = await page.evaluate(() => ['.tile.clock', '#battTile', '#redBtn', '#dimBtn', '#settingsBtn', '.dots button', '#page0 .tile'].map(sel =>
    getComputedStyle(document.querySelector(sel)).webkitTapHighlightColor));
  for (const c of colours) assert.equal(c, 'rgba(0, 0, 0, 0)');
  await page.click('#settingsBtn');
  const inside = await page.evaluate(() => ['[data-font="dot"]', '#setAuto', '#customSwatch', '#startPlus'].map(sel =>
    getComputedStyle(document.querySelector(sel)).webkitTapHighlightColor));
  for (const c of inside) assert.equal(c, 'rgba(0, 0, 0, 0)');
  await context.close();
});

test('the exit hint shows inside the app and stays hidden in a plain browser', async () => {
  let o = await open({ init: hostStub });
  assert.equal(await o.page.isVisible('#exitHint'), true);
  assert.match(await o.page.textContent('#exitHint'), /Hold the clock to exit/);
  await o.context.close();
  o = await open();
  assert.equal(await o.page.isVisible('#exitHint'), false);
  await o.context.close();
});

for (const [w, h] of [[412, 915], [360, 800], [915, 412]]) {
  test(`the exit hint fits beside the dots and buttons at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, init: hostStub });
    const r = await page.evaluate(() => {
      const hint = document.getElementById('exitHint'), dots = document.querySelector('.dots').getBoundingClientRect();
      const b = hint.getBoundingClientRect();
      return { overlapsDots: b.right > dots.left + 1, clipped: hint.scrollWidth > hint.clientWidth + 1, height: b.height, left: b.left };
    });
    assert.equal(r.overlapsDots, false, 'does not run into the page dots');
    assert.equal(r.clipped, false);
    assert.ok(r.height < 40, `at most two short lines (${r.height}px)`);
    await context.close();
  });
}

// ---- the week cards: text must sit exactly in the middle ----
for (const [w, h] of [[915, 412], [800, 360], [412, 915], [360, 800], [700, 1000]]) {
  test(`this week text is centred in its cards at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15) });
    await page.click('.dots [data-page="2"]');
    await page.evaluate(() => document.fonts.ready);
    await settled(page);
    const cells = await page.evaluate(() => [...document.querySelectorAll('#week > div')].map(cell => {
      const c = cell.getBoundingClientRect();
      const label = getComputedStyle(cell.querySelector('.wl')).display !== 'none' ? cell.querySelector('.wl') : cell.querySelector('.wn');
      const num = cell.querySelector('b');
      const l = label.getBoundingClientRect(), n = num.getBoundingClientRect();
      return {
        cx: c.left + c.width / 2, labelCx: l.left + l.width / 2, numCx: n.left + n.width / 2,
        padLeft: l.left - c.left, padRight: c.right - n.right, numLeft: n.left - c.left, numRight: c.right - n.right,
        spacing: [getComputedStyle(label).letterSpacing, getComputedStyle(num).letterSpacing],
      };
    }));
    const cards = await page.evaluate(() => getComputedStyle(document.querySelector('#week > div')).flexDirection === 'column');   // wide tile: centred day cards; squarish or tall tile: a list of rows
    const landscape = cards;
    for (const c of cells) {
      assert.ok(c.spacing.every(v => v === '0px' || v === 'normal'), `no letter-spacing (it shifts text off-centre): ${c.spacing}`);
      if (landscape) {
        assert.ok(Math.abs(c.labelCx - c.cx) <= 1, `day letter centred (off by ${(c.labelCx - c.cx).toFixed(1)}px)`);
        assert.ok(Math.abs(c.numCx - c.cx) <= 2.5, `date number box is within the card (off by ${(c.numCx - c.cx).toFixed(1)}px; the drawn dots are checked separately)`);
        assert.ok(c.numLeft >= 4 && c.numRight >= 4, `number keeps room at the edges (${c.numLeft.toFixed(1)} / ${c.numRight.toFixed(1)}px)`);
      } else {
        assert.ok(Math.abs(c.padLeft - c.padRight) <= 1, `row text has equal padding left and right (${c.padLeft.toFixed(1)} vs ${c.padRight.toFixed(1)})`);
      }
    }
    await context.close();
  });
}

// ---- right side: Battery + Notifications; temperature lives on the clock tile ----
test('page one holds Battery and Notifications; the alarm and battery details are on page two', async () => {
  const { page, context } = await open();
  const labelsOf = id => page.evaluate(id => [...document.querySelectorAll(`#${id} .tile .label`)].map(l => l.textContent.trim()), id);
  assert.deepEqual(await labelsOf('page0'), ['Battery', 'Notifications · sample']);
  assert.deepEqual(await labelsOf('page1'), ['Next alarm · sample', 'Battery details · sample']);
  assert.equal(await page.evaluate(() => !!document.getElementById('dayNum') || document.body.textContent.includes('H 22')), false);
  await context.close();
});

const notif = page => page.evaluate(() => ({
  total: document.getElementById('notifTotal').textContent,
  rows: [...document.querySelectorAll('#notifRows li')].map(li => li.children.length ? [...li.children].map(c => c.textContent).join(' ') : li.textContent.trim()),
  state: document.getElementById('notifTile').dataset.state,
  message: document.getElementById('notifMessage').hidden ? '' : document.getElementById('notifMessage').textContent,
}));

test('notifications show sample counts in a plain browser', async () => {
  const { page, context } = await open();
  const n = await notif(page);
  assert.equal(n.state, 'sample');
  assert.equal(n.total, '5');
  assert.deepEqual(n.rows, ['Mail 2', 'Messages 2', 'Calendar 1']);
  await context.close();
});

test('setNotifications shows counts per app, never message text', async () => {
  const { page, context } = await open({ init: hostStub });
  await page.evaluate(() => window.setNotifications([{ app: 'Messages', count: 3 }, { app: 'Mail', count: 1 }, { app: 'Maps', count: 1 }, { app: 'Zed', count: 1 }]));
  const n = await notif(page);
  assert.equal(n.state, 'ready');
  assert.equal(n.total, '6');
  assert.deepEqual(n.rows, ['Messages 3', 'Mail 1', 'Maps 1', '+1 more']);
  await page.evaluate(() => window.setNotifications([]));
  assert.equal((await notif(page)).message, 'Nothing new');
  await context.close();
});

test('inside the app, the tile asks for notification access until the app reports', async () => {
  const { page, context } = await open({ init: hostStub });
  const n = await notif(page);
  assert.equal(n.state, 'needs-access');
  assert.match(n.message, /notification access/i);
  await page.evaluate(() => window.setNotifications([{ app: 'Mail', count: 2 }]));
  assert.equal((await notif(page)).state, 'ready');
  await page.evaluate(() => window.setNotificationAccess(false));
  assert.equal((await notif(page)).state, 'needs-access');
  await context.close();
});

// ---- what is actually drawn must be centred, not just the boxes ----
test('the dates in the week cards are centred by their drawn dots', async () => {
  const { page, context } = await open({ width: 700, height: 1000, time: new Date(2026, 10, 17, 12, 15) });
  await page.click('.dots [data-page="2"]');
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  const offs = await page.evaluate(() => [...document.querySelectorAll('#week > div')].map(cell => {
    const c = cell.getBoundingClientRect(), b = cell.querySelector('b'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(b.textContent);
    const shift = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform).m41;
    const inkCx = r.left - shift + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    return inkCx + shift - (c.left + c.width / 2);
  }));
  for (const o of offs) assert.ok(Math.abs(o) <= 0.6, `ink off centre by ${o.toFixed(2)}px`);
  await context.close();
});

test('by default the dock follows the phone: dark on a dark phone, light on a light phone', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  assert.equal(await theme(page), 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.click('#settingsBtn');
  assert.equal(await page.getAttribute('[data-themeopt="system"]', 'aria-pressed'), 'true', 'Device is the selected option');
  await context.close();
});

// ---- the charge-up only continues while you keep holding ----
const ringOffset = page => page.evaluate(() => document.getElementById('ringFill').style.strokeDashoffset);

test('letting go before 100% puts everything back and nothing flashes', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  const before = await ringOffset(page);
  await press(page, '#battTile');
  await page.clock.runFor(HOLD + 900);                       // half way through the charge-up
  assert.ok(parseInt(await pct(page), 10) > 82, 'it was charging');
  await page.mouse.up();                                     // ...and you let go
  assert.equal(await pct(page), '82%', 'the real level is back straight away');
  assert.equal(await page.textContent('#battBig'), 'Charging');
  assert.equal(await page.isVisible('#battSub'), true);
  assert.equal(await ringOffset(page), before, 'the ring is back where it was');
  await page.clock.runFor(10000);
  assert.equal(await pct(page), '82%', 'it never goes on to 100%');
  assert.equal(await orbShown(page), false);
  assert.equal(await flashStyle(page), '0');
  assert.equal(await agent(page), '');
  await context.close();
});

test('sliding away mid-charge also puts everything back', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  const { x, y } = await press(page, '#battTile');
  await page.clock.runFor(HOLD + 900);
  await page.mouse.move(x + 80, y + 40);
  assert.equal(await pct(page), '82%');
  await page.clock.runFor(10000);
  assert.equal(await flashStyle(page), '0');
  await page.mouse.up();
  await context.close();
});

test('after a cancelled attempt you can start again and it completes', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(HOLD + 500); await page.mouse.up();
  assert.equal(await pct(page), '82%');
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 100);
  assert.equal(await pct(page), '100%');
  assert.equal(await orbShown(page), true);
  await page.mouse.up();
  await context.close();
});

test('once it has reached 100%, letting go does not stop the flash', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 100);
  await page.mouse.up();
  assert.equal(await orbShown(page), true, 'the orb is still in flight');
  await page.clock.runFor(800);
  assert.equal(await flashStyle(page), '1', 'and the screen still flashes');
  await context.close();
});

test('Fully flashed fits in the battery tile at every size', async () => {
  for (const [w, h] of [[915, 412], [800, 360], [412, 915], [360, 800]]) {
    const { page, context } = await open({ width: w, height: h, time: new Date(2026, 10, 17, 12, 15), init: randomZero });
    await page.evaluate(() => window.setBattery(0.82, true, 2280));
    await press(page, '#battTile'); await page.clock.runFor(HOLD + CHARGE + 100);
    const r = await page.evaluate(() => { const t = document.getElementById('battTile'); const b = document.getElementById('battBig').getBoundingClientRect(), c = t.getBoundingClientRect(); return { clipped: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1, inside: b.right <= c.right && b.left >= c.left }; });
    assert.equal(r.clipped, false, `not clipped at ${w}x${h}`);
    assert.equal(r.inside, true, `heading inside its tile at ${w}x${h}`);
    await page.mouse.up();
    await context.close();
  }
});

// ---- weather: shown when the internet answers, nothing at all otherwise ----
const NET = {
  ip: { latitude: '28.6139', longitude: '77.2090', city: 'Delhi' },
  forecast: { current: { temperature_2m: 18.4, weather_code: 1 } },
  geocode: { results: [{ name: 'Pune', latitude: 18.52, longitude: 73.85, country: 'India' }] },
};
const DAY = new Date(2026, 10, 17, 12, 15);
const tempShown = page => page.evaluate(() => !document.getElementById('temp').hidden);
const tempText = page => page.evaluate(() => (document.getElementById('temp').hidden ? '' : document.getElementById('temp').textContent));
const waitForTemp = (page, text) => page.waitForFunction(t => { const e = document.getElementById('temp'); return !e.hidden && (!t || e.textContent === t); }, text);

test('with no internet the temperature line is not there at all', async () => {
  const { page, context, problems } = await open({ time: DAY });
  await page.waitForTimeout(400);
  assert.equal(await tempShown(page), false);
  assert.equal(await page.evaluate(() => document.querySelector('.tile.clock').textContent.includes('sample')), false, 'and the clock tile says nothing about a sample');
  assert.deepEqual(problems, []);
  await context.close();
});

test('with internet it shows the temperature for the rough location', async () => {
  const { page, context, weatherRequests } = await open({ time: DAY, net: NET });
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  assert.ok(weatherRequests.some(u => u.startsWith('https://get.geojs.io/')), 'asked for a rough location');
  assert.ok(weatherRequests.includes('https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.209&current=temperature_2m,weather_code&timezone=auto'));
  assert.equal(await page.evaluate(() => !!document.getElementById('temp').closest('.tile.clock')), true, 'on the clock tile');
  await context.close();
});

test('Fahrenheit shows the converted temperature, and switching in settings is immediate', async () => {
  let o = await open({ time: DAY, net: NET, settings: { unit: 'F' } });
  await waitForTemp(o.page, '65° · Mostly clear · Delhi');
  await o.context.close();
  o = await open({ time: DAY, net: NET });
  await waitForTemp(o.page, '18° · Mostly clear · Delhi');
  await o.page.click('#settingsBtn');
  await o.page.click('[data-unit="F"]');
  assert.equal(await tempText(o.page), '65° · Mostly clear · Delhi');
  await o.context.close();
});

test('a city saved in settings is used and the rough location lookup is skipped', async () => {
  const { page, context, weatherRequests } = await open({ time: DAY, net: NET, settings: { weatherCity: { name: 'Mumbai', lat: 19.07, lon: 72.88 } } });
  await waitForTemp(page, '18° · Mostly clear · Mumbai');
  assert.equal(weatherRequests.some(u => u.includes('geojs.io')), false);
  assert.ok(weatherRequests.some(u => u.includes('latitude=19.07&longitude=72.88')));
  await context.close();
});

test('typing a city in settings looks it up, saves it and shows its weather', async () => {
  const { page, context, weatherRequests } = await open({ time: DAY, net: NET });
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  await page.click('#settingsBtn');
  await page.fill('#cityInput', 'Pune');
  await page.press('#cityInput', 'Enter');
  await waitForTemp(page, '18° · Mostly clear · Pune');
  assert.ok(weatherRequests.some(u => u.includes('geocoding-api.open-meteo.com') && u.includes('name=Pune')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('charge-dock-settings')).weatherCity);
  assert.deepEqual(saved, { name: 'Pune', lat: 18.52, lon: 73.85 });
  assert.equal(await page.getAttribute('#cityInput', 'aria-invalid'), 'false');
  await context.close();
});

test('a city that cannot be found is rejected and the weather is left alone', async () => {
  const { page, context, network } = await open({ time: DAY, net: NET });
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  network.geocode = { results: [] };
  await page.click('#settingsBtn');
  await page.fill('#cityInput', 'Nowhereville');
  await page.press('#cityInput', 'Enter');
  await page.waitForFunction(() => document.getElementById('cityInput').getAttribute('aria-invalid') === 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('charge-dock-settings') || '{}').weatherCity || null), null);
  assert.equal(await tempText(page), '18° · Mostly clear · Delhi');
  await context.close();
});

test('clearing the city goes back to the automatic location', async () => {
  const { page, context } = await open({ time: DAY, net: NET, settings: { weatherCity: { name: 'Mumbai', lat: 19.07, lon: 72.88 } } });
  await waitForTemp(page, '18° · Mostly clear · Mumbai');
  await page.click('#settingsBtn');
  await page.fill('#cityInput', '');
  await page.press('#cityInput', 'Enter');
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  await context.close();
});

test('losing the connection hides the line, and it returns when the connection does', async () => {
  const { page, context, network } = await open({ time: DAY, net: NET });
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  const forecast = network.forecast;
  network.forecast = null;                                   // the connection drops
  await page.clock.runFor(31 * 60 * 1000);                   // the next half-hourly refresh fails
  await page.waitForFunction(() => document.getElementById('temp').hidden);
  network.forecast = forecast;                               // and comes back
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitForTemp(page, '18° · Mostly clear · Delhi');
  await context.close();
});

test('an odd or empty answer shows nothing rather than a broken line', async () => {
  for (const forecast of [{ current: {} }, { error: true }, { current: { temperature_2m: 'hot', weather_code: 1 } }]) {
    const { page, context, problems } = await open({ time: DAY, net: { ...NET, forecast } });
    await page.waitForTimeout(400);
    assert.equal(await tempShown(page), false, JSON.stringify(forecast));
    assert.deepEqual(problems, []);
    await context.close();
  }
});

for (const [w, h] of [[360, 800], [915, 412]]) {
  test(`a long city name stays inside the clock tile at ${w}x${h}`, async () => {
    const long = 'Thiruvananthapuram-on-the-Long-River-Delta';
    const { page, context } = await open({ width: w, height: h, time: DAY, net: NET, settings: { weatherCity: { name: long, lat: 8.5, lon: 76.9 } } });
    await waitForTemp(page);
    const r = await page.evaluate(() => { const t = document.getElementById('temp').getBoundingClientRect(), c = document.querySelector('.tile.clock').getBoundingClientRect(); return { inside: t.left >= c.left - 1 && t.right <= c.right + 1 && t.bottom <= c.bottom + 1, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    assert.equal(r.inside, true);
    assert.ok(r.sw <= r.iw);
    await context.close();
  });
}

test('the dock says Paused when the phone is plugged in but holding at its charge limit', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15) });
  const read = () => page.evaluate(() => ({ pct: document.getElementById('pct').textContent, big: document.getElementById('battBig').textContent, sub: document.getElementById('battSub').textContent }));
  await page.evaluate(() => window.setBattery(0.8, false, -1, true));
  assert.deepEqual(await read(), { pct: '80%', big: 'Paused', sub: 'Holding at 80%' });
  await page.evaluate(() => window.setBattery(0.8, true, 1800, true));
  assert.equal((await read()).big, 'Charging', 'and back to Charging when charging resumes');
  await page.evaluate(() => window.setBattery(0.8, false, -1, false));
  assert.equal((await read()).big, 'Not charging', 'unplugged is not paused');
  await context.close();
});

// ---- Next alarm and Battery details tiles ----
const alarmText = page => page.evaluate(() => ({
  time: document.getElementById('alarmTime').textContent,
  when: document.getElementById('alarmWhen').textContent,
  state: document.getElementById('alarmTile').dataset.state,
  label: document.getElementById('alarmLabel').textContent,
}));
const localMs = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();

test('the clock takes 60% and the tiles 40%: stacked beside it in landscape, side by side below it in portrait', async () => {
  for (const [w, h] of [[915, 412], [412, 915]]) {
    const { page, context } = await open({ width: w, height: h, time: DAY });
    for (const n of [0, 1]) {
      await page.click(`.dots [data-page="${n}"]`);
      const g = await page.evaluate(() => {
        const r = e => e.getBoundingClientRect();
        const clock = r(document.querySelector('.tile.clock')), tiles = [...document.querySelectorAll('.tiles .page:not([hidden]) .tile')].map(r);
        return { clock, tiles: tiles.map(t => ({ l: t.left, t: t.top, w: t.width, h: t.height })), cw: clock.width, ch: clock.height, gap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) };
      });
      assert.equal(g.tiles.length, 2);
      if (w > h) {
        const total = g.cw + g.tiles[0].w;
        assert.ok(Math.abs(g.cw / total - 0.6) < 0.01, `clock is ${(g.cw / total * 100).toFixed(1)}% of the width`);
        assert.ok(Math.abs(g.tiles[0].l - g.tiles[1].l) <= 1 && g.tiles[1].t > g.tiles[0].t, 'tiles are stacked');
        assert.ok(Math.abs(g.tiles[0].h - g.tiles[1].h) <= 1, 'equal heights');
      } else {
        const total = g.ch + g.tiles[0].h;
        assert.ok(Math.abs(g.ch / total - 0.6) < 0.01, `clock is ${(g.ch / total * 100).toFixed(1)}% of the height`);
        assert.ok(Math.abs(g.tiles[0].t - g.tiles[1].t) <= 1 && g.tiles[1].l > g.tiles[0].l, 'tiles are side by side');
        assert.ok(Math.abs(g.tiles[0].w - g.tiles[1].w) <= 1, 'equal widths');
      }
    }
    await context.close();
  }
});

test('Next alarm shows the time and how long until it rings', async () => {
  const { page, context } = await open({ time: DAY, init: hostStub });
  await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 18, 7, 0));
  assert.deepEqual(await alarmText(page), { time: '07:00', when: 'in 18h 45m', state: 'ready', label: 'Next alarm' });
  await context.close();
});

test('Next alarm follows the 12-hour setting and counts down as time passes', async () => {
  const { page, context } = await open({ time: DAY, init: hostStub, settings: { hour12: true } });
  await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 18, 7, 0));
  assert.match((await alarmText(page)).time, /^7:00\s*AM$/);
  await page.clock.runFor(61000);
  assert.equal((await alarmText(page)).when, 'in 18h 44m', '18h 43m 59s rounds up');
  await context.close();
});

test('Next alarm names the weekday when the alarm is more than a day away', async () => {
  const { page, context } = await open({ time: DAY, init: hostStub });
  await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 20, 7, 0));
  assert.equal((await alarmText(page)).when, 'in 2d 18h \u00b7 Fri');
  await context.close();
});

test('with no alarm, or one already past, the tile says so quietly', async () => {
  const { page, context } = await open({ time: DAY, init: hostStub });
  assert.deepEqual(await alarmText(page), { time: '--:--', when: 'No alarm set', state: 'none', label: 'Next alarm' });
  await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 18, 7, 0));
  await page.evaluate(() => window.setNextAlarm(null));
  assert.equal((await alarmText(page)).when, 'No alarm set');
  await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 17, 6, 0));
  assert.equal((await alarmText(page)).when, 'No alarm set', 'an alarm in the past is not shown');
  await context.close();
});

test('in a plain browser the alarm is a labelled sample for tomorrow morning', async () => {
  const { page, context } = await open({ time: DAY });
  const a = await alarmText(page);
  assert.equal(a.state, 'sample');
  assert.equal(a.label, 'Next alarm \u00b7 sample');
  assert.equal(a.time, '07:00');
  assert.equal(a.when, 'in 18h 45m');
  await context.close();
});

const detailsText = page => page.evaluate(() => ({
  big: document.getElementById('detailsBig').textContent,
  sub: document.getElementById('detailsSub').textContent,
  state: document.getElementById('detailsTile').dataset.state,
  label: document.getElementById('detailsLabel').textContent,
}));

test('Battery details shows temperature, voltage and health, in the chosen unit', async () => {
  let o = await open({ time: DAY, init: hostStub });
  await o.page.evaluate(() => window.setBatteryDetails(31.2, 4210, 2));
  assert.deepEqual(await detailsText(o.page), { big: '31\u00b0', sub: '4.21 V \u00b7 Good', state: 'ready', label: 'Battery details' });
  await o.page.click('#settingsBtn');
  await o.page.click('[data-unit="F"]');
  assert.equal((await detailsText(o.page)).big, '88\u00b0', 'Fahrenheit');
  await o.context.close();
});

test('Battery details copes with missing readings', async () => {
  const { page, context } = await open({ time: DAY, init: hostStub });
  assert.deepEqual(await detailsText(page), { big: '\u2013', sub: 'Not available', state: 'waiting', label: 'Battery details' });
  await page.evaluate(() => window.setBatteryDetails(null, 4210, 0));
  assert.equal((await detailsText(page)).sub, '4.21 V');
  await context.close();
});

test('in a plain browser Battery details is a labelled sample', async () => {
  const { page, context } = await open({ time: DAY });
  const d = await detailsText(page);
  assert.equal(d.state, 'sample');
  assert.equal(d.label, 'Battery details \u00b7 sample');
  assert.equal(d.big, '31\u00b0');
  await context.close();
});

test('a very long app name in Notifications is cut short instead of pushing the tile apart', async () => {
  for (const [w, h] of [[360, 800], [915, 412]]) {
    const { page, context } = await open({ width: w, height: h, init: hostStub });
    await page.evaluate(() => window.setNotifications([{ app: 'Google Photos Backup and Sync Helper Service', count: 12 }, { app: 'Mail', count: 3 }]));
    const r = await page.evaluate(() => { const t = document.getElementById('notifTile'); return { clipped: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    assert.equal(r.clipped, false, `not clipped at ${w}x${h}`);
    assert.ok(r.sw <= r.iw);
    await context.close();
  }
});

// ---- a real finger on a phone: hold anywhere on the battery tile ----
async function finger(page, context) {
  const cdp = await context.newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  return { down: (x, y) => send('touchStart', [[x, y]]), move: (x, y) => send('touchMove', [[x, y]]), up: () => send('touchEnd', []) };
}
const tilePoint = (page, fx, fy) => page.locator('#battTile').boundingBox().then(b => [b.x + b.width * fx, b.y + b.height * fy]);
const elementCentre = (page, selector) => page.locator(selector).boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2]);

test('with a finger, holding anywhere on the battery tile starts the charge-up, not only on the ring', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero, touch: true });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  const f = await finger(page, context);
  const spots = {
    'the label': await elementCentre(page, '#battTile .label'),
    'the ring': await elementCentre(page, '#battTile .ring'),
    'the big text': await elementCentre(page, '#battBig'),
    'the small text': await elementCentre(page, '#battSub'),
    'an empty corner': await tilePoint(page, 0.93, 0.93),
    'the top-right corner': await tilePoint(page, 0.93, 0.08),
  };
  for (const [name, [x, y]] of Object.entries(spots)) {
    await f.down(x, y);
    await page.clock.runFor(HOLD + 400);
    assert.notEqual(await pct(page), '82%', `holding on ${name} charges the ring up`);
    await f.up();
    await page.clock.runFor(800);
    assert.equal(await pct(page), '82%', `and letting go after ${name} puts it back`);
  }
  await context.close();
});

test('a normal wobble of the finger does not cancel the hold', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero, touch: true });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  const f = await finger(page, context);
  const [x, y] = await tilePoint(page, 0.5, 0.5);
  await f.down(x, y);
  await page.clock.runFor(600);
  await f.move(x + 6, y + 14);                  // fingers are never perfectly still
  await page.clock.runFor(300);
  await f.move(x - 4, y - 12);
  await page.clock.runFor(HOLD - 900 + 400);
  assert.notEqual(await pct(page), '82%', 'still charging up after a wobble');
  await f.up();
  await context.close();
});

test('sliding the finger well away does cancel it', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: randomZero, touch: true });
  await page.evaluate(() => window.setBattery(0.82, true, 2280));
  const f = await finger(page, context);
  const [x, y] = await tilePoint(page, 0.3, 0.5);
  await f.down(x, y);
  await page.clock.runFor(HOLD + 600);
  assert.notEqual(await pct(page), '82%');
  await f.move(x + 90, y + 10);
  await page.clock.runFor(300);
  assert.equal(await pct(page), '82%', 'cancelled');
  await f.up();
  await context.close();
});

test('a normal wobble of the finger does not cancel holding the clock to leave', async () => {
  const { page, context } = await open({ time: new Date(2026, 10, 17, 12, 15), init: hostStub, touch: true });
  const f = await finger(page, context);
  const [x, y] = await elementCentre(page, '.tile.clock');
  await f.down(x, y);
  await page.clock.runFor(300);
  await f.move(x + 5, y + 14);
  await page.clock.runFor(600);
  assert.equal(await exits(page), 1, 'still asked the app to leave');
  await f.up();
  await context.close();
});

for (const hour12 of [false, true]) {
  test(`the alarm time fits its tile at every size (${hour12 ? '12' : '24'}-hour)`, async () => {
    for (const [w, h] of [[915, 412], [800, 360], [412, 915], [360, 800]]) {
      const { page, context } = await open({ width: w, height: h, time: DAY, init: hostStub, settings: { hour12 } });
      await page.evaluate(ms => window.setNextAlarm(ms), localMs(2026, 11, 18, 10, 55));
      await page.click('.dots [data-page="1"]');
      const r = await page.evaluate(() => { const t = document.getElementById('alarmTile'), b = document.getElementById('alarmTime').getBoundingClientRect(), c = t.getBoundingClientRect(), pad = parseFloat(getComputedStyle(t).paddingLeft); return { clipped: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1, inside: b.left >= c.left + pad - 1 && b.right <= c.right - pad + 1 }; });
      assert.equal(r.clipped, false, `not clipped at ${w}x${h}`);
      assert.equal(r.inside, true, `time inside the tile's padding at ${w}x${h}`);
      await context.close();
    }
  });
}

// ---- the % in the battery ring sits in the middle of the circle ----
for (const [w, h] of [[915, 412], [800, 360], [412, 915], [360, 800]]) {
  test(`the % is centred in the battery ring at ${w}x${h}`, async () => {
    const { page, context } = await open({ width: w, height: h, time: DAY });
    await page.evaluate(() => window.setBattery(0.82, true, 2280));
    await page.evaluate(() => document.fonts.ready);
    await settled(page);
    const r = await page.evaluate(() => {
      const ring = document.querySelector('.ring'), circle = ring.querySelector('.track').getBoundingClientRect(), b = document.getElementById('pct');
      const box = ring.getBoundingClientRect(), cs = getComputedStyle(b);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(b.textContent);
      const range = document.createRange(); range.selectNodeContents(b);
      const t = range.getBoundingClientRect();
      const inkCx = t.left + (m.actualBoundingBoxLeft * -1 + m.actualBoundingBoxRight) / 2;
      const inkCy = t.top + t.height / 2 + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 - (m.fontBoundingBoxDescent - m.fontBoundingBoxAscent) / 2;
      return { square: Math.abs(box.width - box.height) < 0.5, dx: inkCx - (circle.left + circle.width / 2), dy: inkCy - (circle.top + circle.height / 2) };
    });
    assert.equal(r.square, true, 'the ring box is square, so the circle is not off-centre inside it');
    assert.ok(Math.abs(r.dx) <= 1, `% is off the circle's centre sideways by ${r.dx.toFixed(2)}px`);
    assert.ok(Math.abs(r.dy) <= 1.5, `% is off the circle's centre vertically by ${r.dy.toFixed(2)}px`);
    await context.close();
  });
}
