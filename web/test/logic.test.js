const test = require('node:test');
const assert = require('node:assert/strict');
const { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS, hslToHex, hexToHsl, luminance, visibleAccent, onAccent, parseHexInput, resolveTheme } = require('../dock-logic.js');

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

test('isNight default window 22:00-07:00 including boundaries', () => {
  assert.equal(isNight(at(2026, 11, 17, 21, 59)), false);
  assert.equal(isNight(at(2026, 11, 17, 22, 0)), true);
  assert.equal(isNight(at(2026, 11, 17, 0, 0)), true);
  assert.equal(isNight(at(2026, 11, 17, 6, 59)), true);
  assert.equal(isNight(at(2026, 11, 17, 7, 0)), false);
});

test('isNight window that does not cross midnight', () => {
  assert.equal(isNight(at(2026, 11, 17, 3, 0), 1, 5), true);
  assert.equal(isNight(at(2026, 11, 17, 5, 0), 1, 5), false);
});

test('weekStrip Tuesday: Monday first, today marked', () => {
  const w = weekStrip(at(2026, 11, 17));
  assert.deepEqual(w.map(d => d.day), [16, 17, 18, 19, 20, 21, 22]);
  assert.equal(w.map(d => d.letter).join(''), 'MTWTFSS');
  assert.deepEqual(w.map(d => d.name), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(w.map(d => d.state), ['past', 'today', 'future', 'future', 'future', 'future', 'future']);
});

test('weekStrip across month and year boundary', () => {
  const w = weekStrip(at(2026, 12, 31));
  assert.deepEqual(w.map(d => d.day), [28, 29, 30, 31, 1, 2, 3]);
  assert.equal(w[3].state, 'today');
});

test('weekStrip Sunday is the last column', () => {
  const w = weekStrip(at(2027, 1, 3));
  assert.equal(w[6].state, 'today');
  assert.deepEqual(w.slice(0, 6).map(d => d.state), Array(6).fill('past'));
  assert.deepEqual(w.map(d => d.day), [28, 29, 30, 31, 1, 2, 3]);
});

test('batteryText normal charging reading', () => {
  assert.deepEqual(batteryText(0.82, true, 2280),
    { pct: '82%', big: 'Charging', sub: 'Full in about 38 min' });
});

test('batteryText unknown level never shows NaN or negatives', () => {
  const unknown = { pct: '--%', big: 'Charging', sub: 'Level unknown' };
  assert.deepEqual(batteryText(-1, true, -1), unknown);
  assert.deepEqual(batteryText(NaN, true, NaN), unknown);
});

test('batteryText full while plugged in', () => {
  assert.deepEqual(batteryText(1, true, -1),
    { pct: '100%', big: 'Full', sub: 'Fully charged' });
});

test('batteryText charging with unknown time to full', () => {
  assert.deepEqual(batteryText(0.2, true, -1),
    { pct: '20%', big: 'Charging', sub: 'Time to full unknown' });
});

test('batteryText on battery', () => {
  assert.deepEqual(batteryText(0.5, false, -1),
    { pct: '50%', big: 'Not charging', sub: 'Plug in to charge' });
});

test('weekStrip can start on Sunday', () => {
  const w = weekStrip(at(2026, 11, 17), 0);
  assert.equal(w.map(d => d.letter).join(''), 'SMTWTFS');
  assert.deepEqual(w.map(d => d.day), [15, 16, 17, 18, 19, 20, 21]);
  assert.equal(w[2].state, 'today');
  const sun = weekStrip(at(2027, 1, 3), 0);
  assert.equal(sun[0].state, 'today');
  assert.deepEqual(sun.map(d => d.day), [3, 4, 5, 6, 7, 8, 9]);
});

test('formatTime 24-hour pads the hour and has no suffix', () => {
  assert.deepEqual(formatTime(at(2026, 11, 17, 0, 5), false), { hh: '00', mm: '05', suffix: '' });
  assert.deepEqual(formatTime(at(2026, 11, 17, 13, 30), false), { hh: '13', mm: '30', suffix: '' });
});

test('formatTime 12-hour handles midnight, noon and afternoon', () => {
  assert.deepEqual(formatTime(at(2026, 11, 17, 0, 5), true), { hh: '12', mm: '05', suffix: 'AM' });
  assert.deepEqual(formatTime(at(2026, 11, 17, 12, 0), true), { hh: '12', mm: '00', suffix: 'PM' });
  assert.deepEqual(formatTime(at(2026, 11, 17, 13, 30), true), { hh: '1', mm: '30', suffix: 'PM' });
  assert.deepEqual(formatTime(at(2026, 11, 17, 9, 7), true), { hh: '9', mm: '07', suffix: 'AM' });
});

test('normalizeSettings returns defaults for missing or non-object input', () => {
  for (const bad of [undefined, null, 'x', 42, [], true]) {
    assert.deepEqual(normalizeSettings(bad), DEFAULT_SETTINGS);
  }
  assert.deepEqual(DEFAULT_SETTINGS, {
    font: 'dot', theme: 'dark', accent: '#d71921', hour12: false, autoDim: true,
    dimStart: 22, dimEnd: 7, dimLevel: 30, weekStart: 1, red: false,
  });
});

test('normalizeSettings keeps valid values and clamps the dim level', () => {
  const s = normalizeSettings({ font: 'mono', accent: '#4aa3ff', hour12: true, dimStart: 23, dimEnd: 6, dimLevel: 500, weekStart: 0, red: true });
  assert.equal(s.font, 'mono');
  assert.equal(s.accent, '#4aa3ff');
  assert.equal(s.hour12, true);
  assert.equal(s.dimStart, 23);
  assert.equal(s.dimEnd, 6);
  assert.equal(s.dimLevel, 80);
  assert.equal(s.weekStart, 0);
  assert.equal(s.red, true);
  assert.equal(normalizeSettings({ dimLevel: 1 }).dimLevel, 10);
});

test('normalizeSettings replaces invalid values with defaults', () => {
  const s = normalizeSettings({ font: 'comic', accent: '#12345', dimStart: 25, dimEnd: -1, weekStart: 3, autoDim: 'yes', dimLevel: 'bright', hour12: 1 });
  assert.deepEqual(s, DEFAULT_SETTINGS);
});

test('hslToHex converts known colours', () => {
  assert.equal(hslToHex(210, 100, 60), '#3399ff');
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(360, 100, 50), '#ff0000');
  assert.equal(hslToHex(0, 0, 0), '#000000');
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
});

test('hexToHsl converts known colours', () => {
  assert.deepEqual(hexToHsl('#ff0000'), { h: 0, s: 100, l: 50 });
  assert.deepEqual(hexToHsl('#3399ff'), { h: 210, s: 100, l: 60 });
  assert.deepEqual(hexToHsl('#808080'), { h: 0, s: 0, l: 50 });
});

test('luminance of black and white', () => {
  assert.equal(luminance('#000000'), 0);
  assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9);
});

test('visibleAccent keeps readable colours and lifts dark ones', () => {
  assert.equal(visibleAccent('#d71921'), '#d71921');
  assert.equal(visibleAccent('#ffb25b'), '#ffb25b');
  assert.ok(luminance(visibleAccent('#000000')) >= 0.12);
  assert.ok(luminance(visibleAccent('#000033')) >= 0.12);
  assert.equal(visibleAccent('not-a-colour'), '#d71921');
});

test('onAccent picks black or white text for contrast', () => {
  assert.equal(onAccent('#f4f3f0'), '#000000');
  assert.equal(onAccent('#4aa3ff'), '#000000');
  assert.equal(onAccent('#d71921'), '#ffffff');
});

test('normalizeSettings accepts any six-digit hex accent and lowercases it', () => {
  assert.equal(normalizeSettings({ accent: '#12AB34' }).accent, '#12ab34');
  for (const bad of ['#12345', '#gggggg', 'red', '12ab34', 'javascript:1', '#1234567']) {
    assert.equal(normalizeSettings({ accent: bad }).accent, '#d71921', bad);
  }
});

test('parseHexInput accepts pasted hex codes in common shapes', () => {
  assert.equal(parseHexInput('#3399FF'), '#3399ff');
  assert.equal(parseHexInput('3399ff'), '#3399ff');
  assert.equal(parseHexInput('  #3399ff \n'), '#3399ff');
  assert.equal(parseHexInput('#39f'), '#3399ff');
  assert.equal(parseHexInput('F0A'), '#ff00aa');
});

test('parseHexInput rejects anything that is not a hex colour', () => {
  for (const bad of ['', '#', '#12', '#12345', 'zzzzzz', '#3399ffaa', 'rgb(1,2,3)', null, undefined, 42]) {
    assert.equal(parseHexInput(bad), null, String(bad));
  }
});

test('normalizeSettings theme: dark by default, light and system allowed, junk rejected', () => {
  assert.equal(normalizeSettings({}).theme, 'dark');
  assert.equal(normalizeSettings({ theme: 'light' }).theme, 'light');
  assert.equal(normalizeSettings({ theme: 'system' }).theme, 'system');
  for (const bad of ['blue', '', 7, null, 'DARK']) assert.equal(normalizeSettings({ theme: bad }).theme, 'dark', String(bad));
});

test('resolveTheme follows the setting, the device, and dimming', () => {
  assert.equal(resolveTheme('dark', false, false), 'dark');
  assert.equal(resolveTheme('light', true, false), 'light');
  assert.equal(resolveTheme('system', true, false), 'dark');
  assert.equal(resolveTheme('system', false, false), 'light');
  // A dimmed screen is always dark: a light screen would light up the room.
  assert.equal(resolveTheme('light', false, true), 'dark');
  assert.equal(resolveTheme('system', false, true), 'dark');
});

test('visibleAccent on the light theme darkens colours that would wash out', () => {
  assert.equal(visibleAccent('#d71921', 'light'), '#d71921');
  assert.equal(visibleAccent('#000000', 'light'), '#000000');
  for (const pale of ['#ffb25b', '#5be28c', '#f4f3f0', '#ffffff']) {
    assert.ok(luminance(visibleAccent(pale, 'light')) <= 0.27, pale);
  }
  assert.equal(visibleAccent('#ffb25b', 'dark'), '#ffb25b');
});
