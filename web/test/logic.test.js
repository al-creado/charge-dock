const test = require('node:test');
const assert = require('node:assert/strict');
const { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS } = require('../dock-logic.js');

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
    font: 'dot', accent: '#d71921', hour12: false, autoDim: true,
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
  const s = normalizeSettings({ font: 'comic', accent: '#123456', dimStart: 25, dimEnd: -1, weekStart: 3, autoDim: 'yes', dimLevel: 'bright', hour12: 1 });
  assert.deepEqual(s, DEFAULT_SETTINGS);
});
