const test = require('node:test');
const assert = require('node:assert/strict');
const { isNight, weekStrip, batteryText } = require('../dock-logic.js');

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
    { status: 'Charging · 82%', pct: '82%', big: 'Charging', sub: 'Full in about 38 min' });
});

test('batteryText unknown level never shows NaN or negatives', () => {
  const unknown = { status: 'Charging · --%', pct: '--%', big: 'Charging', sub: 'Level unknown' };
  assert.deepEqual(batteryText(-1, true, -1), unknown);
  assert.deepEqual(batteryText(NaN, true, NaN), unknown);
});

test('batteryText full while plugged in', () => {
  assert.deepEqual(batteryText(1, true, -1),
    { status: 'Charging · 100%', pct: '100%', big: 'Full', sub: 'Fully charged' });
});

test('batteryText charging with unknown time to full', () => {
  assert.deepEqual(batteryText(0.2, true, -1),
    { status: 'Charging · 20%', pct: '20%', big: 'Charging', sub: 'Time to full unknown' });
});

test('batteryText on battery', () => {
  assert.deepEqual(batteryText(0.5, false, -1),
    { status: 'On battery · 50%', pct: '50%', big: 'Not charging', sub: 'Plug in to charge' });
});
