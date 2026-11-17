const test = require('node:test');
const assert = require('node:assert/strict');
const { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS, hslToHex, hexToHsl, luminance, visibleAccent, onAccent, parseHexInput, resolveTheme, formatHour, FLASHES, pickFlash, EGG, chargePercent, summarizeNotifications, weatherText, formatTemperature, parseForecast, parseGeocode, parseIpLocation, forecastUrl, geocodeUrl, weatherLine, alarmSummary, batteryDetailsText, healthText } = require('../dock-logic.js');

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
    font: 'dot', theme: 'system', accent: '#d71921', hour12: false, autoDim: true,
    dimStart: 22, dimEnd: 7, dimLevel: 30, weekStart: 1, red: false, reduceEffects: false, unit: 'C', weatherCity: null,
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

test('normalizeSettings theme: follows the device by default, dark and light allowed, junk rejected', () => {
  assert.equal(normalizeSettings({}).theme, 'system');
  assert.equal(normalizeSettings({ theme: 'light' }).theme, 'light');
  assert.equal(normalizeSettings({ theme: 'dark' }).theme, 'dark');
  assert.equal(normalizeSettings({ theme: 'system' }).theme, 'system');
  for (const bad of ['blue', '', 7, null, 'DARK']) assert.equal(normalizeSettings({ theme: bad }).theme, 'system', String(bad));
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

test('formatHour shows 24-hour and 12-hour hours', () => {
  assert.equal(formatHour(22, false), '22:00');
  assert.equal(formatHour(0, false), '00:00');
  assert.equal(formatHour(7, false), '07:00');
  assert.equal(formatHour(22, true), '10:00 PM');
  assert.equal(formatHour(7, true), '7:00 AM');
  assert.equal(formatHour(0, true), '12:00 AM');
  assert.equal(formatHour(12, true), '12:00 PM');
  assert.equal(formatHour(13, true), '1:00 PM');
  assert.equal(formatHour(23, true), '11:00 PM');
});

test('turn down visual effects defaults to off, accepts true, rejects junk', () => {
  assert.equal(normalizeSettings({}).reduceEffects, false);
  assert.equal(normalizeSettings({ reduceEffects: true }).reduceEffects, true);
  for (const bad of ['yes', 1, null]) assert.equal(normalizeSettings({ reduceEffects: bad }).reduceEffects, false, String(bad));
});

test('the flash list is the agents with flash abilities', () => {
  assert.deepEqual(FLASHES.map(f => [f.agent, f.ability]), [
    ['Phoenix', 'Curveball'],
    ['Breach', 'Flashpoint'],
    ['Yoru', 'Blindside'],
    ['Skye', 'Guiding Light'],
    ['KAY/O', 'FLASH/drive'],
  ]);
});

test('every flash is a single gentle pulse: short hold, long fade, never a strobe', () => {
  for (const f of FLASHES) {
    assert.ok(f.windup >= 200 && f.windup <= 1500, `${f.agent} windup ${f.windup}`);
    assert.ok(f.hold >= 200 && f.hold <= 600, `${f.agent} hold ${f.hold}`);
    assert.ok(f.fade >= 800 && f.fade <= 3000, `${f.agent} fade ${f.fade}`);
  }
});

test('pickFlash maps the random number onto the list', () => {
  assert.equal(pickFlash(0, null).agent, 'Phoenix');
  assert.equal(pickFlash(0.999999, null).agent, 'KAY/O');
  assert.equal(pickFlash(0.5, null).agent, 'Yoru');
});

test('pickFlash never repeats the previous agent', () => {
  for (const last of FLASHES.map(f => f.agent)) {
    for (let r = 0; r < 1; r += 0.01) assert.notEqual(pickFlash(r, last).agent, last, `${last} at ${r}`);
  }
  assert.equal(pickFlash(0, 'Phoenix').agent, 'Breach');
});

test('every flash has an id, a tint colour and a flight path that ends at the screen centre', () => {
  assert.deepEqual(FLASHES.map(f => f.id), ['phoenix', 'breach', 'yoru', 'skye', 'kayo']);
  for (const f of FLASHES) {
    assert.match(f.tint, /^#[0-9a-f]{6}$/i, f.id);
    assert.ok(f.points.length >= 2, `${f.id} has a path`);
    for (const [x, y, scale = 1] of f.points) assert.ok(Number.isFinite(x) && Number.isFinite(y) && scale > 0, `${f.id} point`);
    const last = f.points[f.points.length - 1];
    assert.deepEqual([last[0], last[1]], [50, 50], `${f.id} ends in the centre`);
  }
  assert.equal(new Set(FLASHES.map(f => f.tint)).size, FLASHES.length, 'each agent has its own colour');
});

test('the hold is two seconds and the charge-up takes under two more', () => {
  assert.equal(EGG.holdMs, 2000);
  assert.equal(EGG.chargeMs, 1800);
});

test('chargePercent counts from the real level up to 100 over the charge time', () => {
  assert.equal(chargePercent(0.82, 0, 2500), 82);
  assert.equal(chargePercent(0.82, 1250, 2500), 91);
  assert.equal(chargePercent(0.82, 2500, 2500), 100);
  assert.equal(chargePercent(0.82, 9000, 2500), 100, 'never past 100');
  assert.equal(chargePercent(0.82, -50, 2500), 82, 'never below the start');
  assert.equal(chargePercent(-1, 1250, 2500), 50, 'an unknown level counts from 0');
  assert.equal(chargePercent(NaN, 2500, 2500), 100);
  assert.equal(chargePercent(1, 0, 2500), 100);
});

test('summarizeNotifications totals counts and lists the busiest apps first', () => {
  assert.deepEqual(summarizeNotifications([]), { total: 0, totalLabel: '0', rows: [], more: 0 });
  const s = summarizeNotifications([{ app: 'Mail', count: 1 }, { app: 'Messages', count: 2 }]);
  assert.equal(s.total, 3);
  assert.equal(s.totalLabel, '3');
  assert.deepEqual(s.rows.map(r => [r.app, r.count]), [['Messages', 2], ['Mail', 1]]);
  assert.equal(s.more, 0);
});

test('summarizeNotifications breaks ties by name and shows at most three apps', () => {
  const s = summarizeNotifications([
    { app: 'Zed', count: 1 }, { app: 'Alpha', count: 1 }, { app: 'Mail', count: 4 }, { app: 'Chat', count: 1 }, { app: 'Beta', count: 1 }]);
  assert.deepEqual(s.rows.map(r => r.app), ['Mail', 'Alpha', 'Beta']);
  assert.equal(s.more, 2, 'two more apps are not listed');
  assert.equal(s.total, 8, 'but they still count in the total');
});

test('summarizeNotifications ignores bad entries and caps big numbers', () => {
  const s = summarizeNotifications([null, undefined, 'x', {}, { app: '', count: 2 }, { app: 'X', count: 0 }, { app: 'Y', count: -3 }, { count: 3 }, { app: 'Z', count: NaN }, { app: 'W', count: '4' }, { app: 'Ok', count: 2.9 }]);
  assert.deepEqual(s.rows.map(r => [r.app, r.count]), [['Ok', 2]]);
  assert.equal(s.total, 2);
  assert.equal(summarizeNotifications([{ app: 'Spam', count: 150 }]).totalLabel, '99+');
  assert.equal(summarizeNotifications([{ app: 'Spam', count: 150 }]).rows[0].label, '99+');
  assert.deepEqual(summarizeNotifications('nope'), { total: 0, totalLabel: '0', rows: [], more: 0 });
});

test('weatherText describes the weather codes', () => {
  const expected = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 65: 'Rain', 71: 'Snow', 75: 'Snow', 80: 'Showers', 82: 'Showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  for (const [code, text] of Object.entries(expected)) assert.equal(weatherText(Number(code)), text, `code ${code}`);
  assert.equal(weatherText(1234), 'Weather');
  assert.equal(weatherText(NaN), 'Weather');
});

test('formatTemperature rounds and converts', () => {
  assert.equal(formatTemperature(18.4, 'C'), '18°');
  assert.equal(formatTemperature(18.6, 'C'), '19°');
  assert.equal(formatTemperature(18.4, 'F'), '65°');
  assert.equal(formatTemperature(-3.2, 'C'), '-3°');
  assert.equal(formatTemperature(0, 'F'), '32°');
  assert.equal(formatTemperature(-0.2, 'C'), '0°', 'never "-0"');
  assert.equal(formatTemperature(NaN, 'C'), '');
});

test('parseForecast reads the Open-Meteo answer and rejects anything else', () => {
  assert.deepEqual(parseForecast({ current: { temperature_2m: 18.4, weather_code: 1 } }), { tempC: 18.4, code: 1 });
  for (const bad of [null, undefined, {}, { current: {} }, { current: { temperature_2m: 'hot', weather_code: 1 } }, { current: { temperature_2m: 18, weather_code: 'x' } }, { error: true }, 'x'])
    assert.equal(parseForecast(bad), null, JSON.stringify(bad));
});

test('parseGeocode takes the first city match', () => {
  assert.deepEqual(parseGeocode({ results: [{ name: 'Pune', latitude: 18.52, longitude: 73.85, country: 'India' }, { name: 'Pune', latitude: 1, longitude: 2 }] }), { name: 'Pune', lat: 18.52, lon: 73.85 });
  for (const bad of [null, {}, { results: [] }, { results: [{ name: '', latitude: 1, longitude: 2 }] }, { results: [{ name: 'X', latitude: 99, longitude: 2 }] }, { results: [{ name: 'X', latitude: 1, longitude: 200 }] }, { results: [{ name: 'X' }] }])
    assert.equal(parseGeocode(bad), null, JSON.stringify(bad));
});

test('parseIpLocation reads the rough location and tolerates a missing city', () => {
  assert.deepEqual(parseIpLocation({ latitude: '28.6139', longitude: '77.2090', city: 'Delhi' }), { name: 'Delhi', lat: 28.6139, lon: 77.209 });
  assert.deepEqual(parseIpLocation({ latitude: '28.6', longitude: '77.2' }), { name: '', lat: 28.6, lon: 77.2 });
  for (const bad of [null, {}, { latitude: 'x', longitude: '1' }, { latitude: '95', longitude: '1' }, { latitude: '1', longitude: '181' }]) assert.equal(parseIpLocation(bad), null, JSON.stringify(bad));
});

test('the request URLs are built safely', () => {
  assert.equal(forecastUrl(28.6139, 77.209), 'https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.209&current=temperature_2m,weather_code&timezone=auto');
  assert.equal(geocodeUrl('São Paulo & co'), 'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo%20%26%20co&count=1&language=en&format=json');
});

test('weatherLine is empty unless there is real weather', () => {
  assert.equal(weatherLine(null, 'C'), '');
  assert.equal(weatherLine(undefined, 'C'), '');
  assert.equal(weatherLine({ tempC: 18.4, code: 1, name: 'Delhi' }, 'C'), '18° · Mostly clear · Delhi');
  assert.equal(weatherLine({ tempC: 18.4, code: 0, name: '' }, 'F'), '65° · Clear');
});

test('normalizeSettings: unit and weather city', () => {
  assert.equal(normalizeSettings({}).unit, 'C');
  assert.equal(normalizeSettings({ unit: 'F' }).unit, 'F');
  for (const bad of ['K', '', 1, null]) assert.equal(normalizeSettings({ unit: bad }).unit, 'C', String(bad));
  assert.deepEqual(normalizeSettings({ weatherCity: { name: 'Pune', lat: 18.52, lon: 73.85 } }).weatherCity, { name: 'Pune', lat: 18.52, lon: 73.85 });
  for (const bad of [null, 'Pune', {}, { name: '', lat: 1, lon: 2 }, { name: 'X', lat: 95, lon: 2 }, { name: 'X', lat: 1, lon: 200 }, { name: 'X', lat: '1', lon: 2 }, { name: 'x'.repeat(80), lat: 1, lon: 2 }])
    assert.equal(normalizeSettings({ weatherCity: bad }).weatherCity, null, JSON.stringify(bad));
});

test('batteryText: plugged in but not charging (a charge limit) reads Paused', () => {
  assert.deepEqual(batteryText(0.8, false, -1, true), { pct: '80%', big: 'Paused', sub: 'Holding at 80%' });
  assert.deepEqual(batteryText(-1, false, -1, true), { pct: '--%', big: 'Paused', sub: 'Charging is paused' });
  assert.deepEqual(batteryText(1, false, -1, true), { pct: '100%', big: 'Full', sub: 'Fully charged' }, 'full is still full');
});

test('batteryText: unplugged is still Not charging, and the old three-argument call is unchanged', () => {
  assert.deepEqual(batteryText(0.8, false, -1, false), { pct: '80%', big: 'Not charging', sub: 'Plug in to charge' });
  assert.deepEqual(batteryText(0.8, false, -1), { pct: '80%', big: 'Not charging', sub: 'Plug in to charge' });
  assert.deepEqual(batteryText(0.8, true, 1800, true), { pct: '80%', big: 'Charging', sub: 'Full in about 30 min' });
});

test('alarmSummary: nothing is shown for no alarm or one that has passed', () => {
  const now = at(2026, 11, 17, 22, 0).getTime();
  for (const bad of [null, undefined, NaN, 'soon', -1, now, now - 1000]) assert.deepEqual(alarmSummary(bad, now, false), { none: true }, String(bad));
});

test('alarmSummary: the alarm time follows the 12 or 24-hour setting', () => {
  const now = at(2026, 11, 17, 22, 0).getTime(), alarm = at(2026, 11, 18, 7, 0).getTime();
  assert.deepEqual(alarmSummary(alarm, now, false), { none: false, hh: '07', mm: '00', suffix: '', when: 'in 9h', day: '' });
  assert.deepEqual(alarmSummary(alarm, now, true), { none: false, hh: '7', mm: '00', suffix: 'AM', when: 'in 9h', day: '' });
});

test('alarmSummary: how long until it rings', () => {
  const now = at(2026, 11, 17, 22, 0).getTime();
  const when = (y, m, d, h, min) => alarmSummary(at(y, m, d, h, min).getTime(), now, false).when;
  assert.equal(when(2026, 11, 17, 22, 45), 'in 45m');
  assert.equal(when(2026, 11, 17, 23, 15), 'in 1h 15m');
  assert.equal(when(2026, 11, 18, 7, 0), 'in 9h');
  assert.equal(when(2026, 11, 20, 7, 0), 'in 2d 9h');
  assert.equal(when(2026, 11, 20, 22, 0), 'in 3d');
  assert.equal(alarmSummary(now + 30 * 1000, now, false).when, 'in 1m', 'rounds up, never "in 0m"');
});

test('alarmSummary: names the weekday only when the alarm is more than a day away', () => {
  const now = at(2026, 11, 17, 22, 0).getTime();
  assert.equal(alarmSummary(at(2026, 11, 17, 23, 0).getTime(), now, false).day, '');
  assert.equal(alarmSummary(at(2026, 11, 18, 7, 0).getTime(), now, false).day, '', 'tomorrow needs no weekday');
  assert.equal(alarmSummary(at(2026, 11, 20, 7, 0).getTime(), now, false).day, 'Fri');
});

test('healthText turns Android battery health codes into words', () => {
  const expected = { 2: 'Good', 3: 'Hot', 4: 'Dead', 5: 'Overvoltage', 6: 'Fault', 7: 'Cold' };
  for (const [code, text] of Object.entries(expected)) assert.equal(healthText(Number(code)), text, `code ${code}`);
  for (const unknown of [0, 1, 99, NaN, null]) assert.equal(healthText(unknown), '', String(unknown));
});

test('batteryDetailsText: temperature, voltage and health, in C or F', () => {
  assert.deepEqual(batteryDetailsText(31.2, 4210, 2, 'C'), { big: '31\u00b0', sub: '4.21 V \u00b7 Good' });
  assert.deepEqual(batteryDetailsText(31.2, 4210, 2, 'F'), { big: '88\u00b0', sub: '4.21 V \u00b7 Good' });
  assert.deepEqual(batteryDetailsText(-5, 3700, 7, 'C'), { big: '-5\u00b0', sub: '3.70 V \u00b7 Cold' });
  assert.deepEqual(batteryDetailsText(45, 4300, 3, 'C'), { big: '45\u00b0', sub: '4.30 V \u00b7 Hot' });
});

test('batteryDetailsText: copes with missing readings', () => {
  assert.deepEqual(batteryDetailsText(null, 4210, 2, 'C'), { big: '\u2013', sub: '4.21 V \u00b7 Good' });
  assert.deepEqual(batteryDetailsText(31.2, null, 0, 'C'), { big: '31\u00b0', sub: '' });
  assert.deepEqual(batteryDetailsText(NaN, NaN, NaN, 'C'), { big: '\u2013', sub: 'Not available' });
  assert.deepEqual(batteryDetailsText(undefined, undefined, undefined, 'C'), { big: '\u2013', sub: 'Not available' });
});
