(function (root) {
  // True between startHour (inclusive) and endHour (exclusive), also across midnight.
  function isNight(date, startHour = 22, endHour = 7) {
    const h = date.getHours();
    return startHour > endHour ? (h >= startHour || h < endHour) : (h >= startHour && h < endHour);
  }

  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index = Date#getDay()
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Seven days for the week that contains `now`. weekStart: 1 = Monday first (default), 0 = Sunday first.
  function weekStrip(now, weekStart = 1) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const first = new Date(today);
    first.setDate(today.getDate() - ((today.getDay() - weekStart + 7) % 7));
    return DAY_LETTERS.map((_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      const state = d.getTime() === today.getTime() ? 'today' : (d < today ? 'past' : 'future');
      return { letter: DAY_LETTERS[d.getDay()], name: DAY_NAMES[d.getDay()], day: d.getDate(), state };
    });
  }

  // { hh, mm, suffix } for the big clock. 24-hour pads the hour; 12-hour does not and adds AM/PM.
  function formatTime(date, hour12) {
    const pad = n => String(n).padStart(2, '0');
    const h = date.getHours(), mm = pad(date.getMinutes());
    if (!hour12) return { hh: pad(h), mm, suffix: '' };
    return { hh: String(h % 12 === 0 ? 12 : h % 12), mm, suffix: h < 12 ? 'AM' : 'PM' };
  }

  // level: 0..1, or -1 / NaN when unknown. secsToFull: seconds, or -1 when unknown.
  // pluggedIn: true when a charger is connected, even if the battery is not taking charge (a phone holding at its
  // charge limit). It defaults to `charging`, so the older three-argument call behaves as before.
  // The phone decides whether it is charging rapidly or slowly (the app passes 'fast', 'slow', 'normal' or ''), and the
  // dock uses the same words as the phone's own lock screen.
  const SOURCES = { ac: 'Charger', usb: 'USB', wireless: 'Wireless', dock: 'Dock' };

  function batteryText(level, charging, secsToFull, pluggedIn = charging, source = '', speed = '') {
    const known = Number.isFinite(level) && level >= 0;
    const pct = known ? Math.round(Math.min(level, 1) * 100) + '%' : '--%';
    if (!charging && pluggedIn) {
      if (known && level >= 1) return { pct, big: 'Full', sub: 'Fully charged' };
      return { pct, big: 'Paused', sub: known ? 'Holding at ' + pct : 'Charging is paused' };
    }
    if (!charging) return { pct, big: 'Not charging', sub: 'Plug in to charge' };
    const big = speed === 'fast' ? 'Charging rapidly' : speed === 'slow' ? 'Charging slowly' : 'Charging';
    const via = SOURCES[source] ? SOURCES[source] + ' \u00b7 ' : '';   // e.g. "USB · "
    if (!known) return { pct, big, sub: via + 'Level unknown' };
    if (level >= 1) return { pct, big: 'Full', sub: 'Fully charged' };
    if (Number.isFinite(secsToFull) && secsToFull > 0) {
      return { pct, big, sub: via + 'Full in about ' + Math.round(secsToFull / 60) + ' min' };
    }
    return { pct, big, sub: via + 'Time to full unknown' };
  }

  // ---- colour helpers (hex strings are '#rrggbb') ----
  const HEX = /^#[0-9a-f]{6}$/i;
  const parseHex = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

  // WCAG relative luminance, 0 (black) to 1 (white).
  function luminance(hex) {
    const [r, g, b] = parseHex(hex).map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // h 0..360, s and l 0..100 to '#rrggbb'.
  function hslToHex(h, s, l) {
    const S = s / 100, L = l / 100, k = n => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
    const f = n => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  // '#rrggbb' to { h 0..360, s 0..100, l 0..100 }, rounded.
  function hexToHsl(hex) {
    const [r, g, b] = parseHex(hex).map(c => c / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  // Turns pasted or typed text ('#3399FF', '3399ff', '#39f') into '#rrggbb', or null if it is not a hex colour.
  function parseHexInput(text) {
    if (typeof text !== 'string') return null;
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
    if (!m) return null;
    const h = m[1].toLowerCase();
    return '#' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h);
  }

  // An accent has to stay visible on the tiles. On the dark theme a too-dark colour is lightened;
  // on the light theme a too-pale colour is darkened.
  function visibleAccent(hex, theme = 'dark') {
    if (typeof hex !== 'string' || !HEX.test(hex)) return DEFAULT_ACCENT;
    const rgb = parseHex(hex);
    let out = hex.toLowerCase();
    if (theme === 'light') {
      for (let t = 0.05; luminance(out) > 0.27 && t <= 1.0001; t += 0.05) out = toHex(...rgb.map(c => c * (1 - t)));
    } else {
      for (let t = 0.05; luminance(out) < 0.12 && t <= 1.0001; t += 0.05) out = toHex(...rgb.map(c => c + (255 - c) * t));
    }
    return out;
  }

  // Text colour (black or white) that reads best on top of the accent.
  function onAccent(hex) {
    const L = luminance(hex);
    return 1.05 / (L + 0.05) > (L + 0.05) / 0.05 ? '#ffffff' : '#000000';
  }

  // An hour of the day (0..23) as '22:00', or '10:00 PM' in 12-hour mode.
  function formatHour(hour, hour12) {
    if (!hour12) return String(hour).padStart(2, '0') + ':00';
    return (hour % 12 === 0 ? 12 : hour % 12) + ':00 ' + (hour < 12 ? 'AM' : 'PM');
  }

  // Agents with a classic flash ability, drawn in a stylized way (not exact). Each is one gentle pulse:
  // an orb flies in along `points` ([x%, y%, scale], ending at the centre) during the windup, then the screen
  // goes white for `hold` ms with a rim in the agent's `tint`, then fades over `fade` ms.
  const FLASHES = [
    { id: 'phoenix', agent: 'Phoenix', ability: 'Curveball',     tint: '#ff7a1a', windup: 700, hold: 400, fade: 1600,
      points: [[6, 92], [14, 55], [28, 32], [42, 30], [50, 50]] },                  // curves in
    { id: 'breach',  agent: 'Breach',  ability: 'Flashpoint',    tint: '#ffb21e', windup: 350, hold: 350, fade: 1400,
      points: [[50, 50, 0.2], [50, 50, 2]] },                                       // charges up in place
    { id: 'yoru',    agent: 'Yoru',    ability: 'Blindside',     tint: '#4a7dff', windup: 900, hold: 450, fade: 1800,
      points: [[94, 86], [66, 18], [34, 72], [50, 50]] },                           // bounces off the walls
    { id: 'skye',    agent: 'Skye',    ability: 'Guiding Light', tint: '#4be08a', windup: 550, hold: 400, fade: 1500,
      points: [[-4, 35], [15, 52], [32, 28], [50, 50]] },                           // glides in
    { id: 'kayo',    agent: 'KAY/O',   ability: 'FLASH/drive',   tint: '#2fd0ff', windup: 500, hold: 450, fade: 1700,
      points: [[50, 108], [50, 50]] },                                              // thrown straight up
  ];

  // Counts per app for the Notifications tile. Only app names and counts: never message text.
  function summarizeNotifications(items, maxRows = 3) {
    const cap = n => (n > 99 ? '99+' : String(n));
    const clean = (Array.isArray(items) ? items : [])
      .filter(i => i && typeof i.app === 'string' && i.app.trim() && Number.isFinite(i.count) && Math.floor(i.count) > 0)
      .map(i => ({ app: i.app.trim(), count: Math.floor(i.count) }))
      .sort((a, b) => b.count - a.count || a.app.localeCompare(b.app));
    const total = clean.reduce((sum, i) => sum + i.count, 0);
    return {
      total, totalLabel: cap(total),
      rows: clean.slice(0, maxRows).map(i => ({ ...i, label: cap(i.count) })),
      more: Math.max(0, clean.length - maxRows),
    };
  }

  // ---- weather (Open-Meteo, no account needed) ----
  const IP_LOCATION_URL = 'https://get.geojs.io/v1/ip/geo.json';   // rough location from the internet connection
  const WEATHER_TEXT = [
    [[0], 'Clear'], [[1], 'Mostly clear'], [[2], 'Partly cloudy'], [[3], 'Overcast'], [[45, 48], 'Fog'],
    [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67], 'Rain'], [[71, 73, 75, 77], 'Snow'],
    [[80, 81, 82], 'Showers'], [[85, 86], 'Snow showers'], [[95, 96, 99], 'Thunderstorm'],
  ];
  const weatherText = code => { const hit = WEATHER_TEXT.find(([codes]) => codes.includes(code)); return hit ? hit[1] : 'Weather'; };

  // '18°' (rounded, in C or F), or '' when there is no number.
  function formatTemperature(celsius, unit) {
    if (!Number.isFinite(celsius)) return '';
    const r = Math.round(unit === 'F' ? celsius * 9 / 5 + 32 : celsius);
    return (r === 0 ? 0 : r) + '\u00b0';
  }

  const inRange = (v, max) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
  const forecastUrl = (lat, lon) => 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code&timezone=auto';
  const geocodeUrl = name => 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=en&format=json';

  function parseForecast(json) {
    const c = json && json.current;
    return c && Number.isFinite(c.temperature_2m) && Number.isFinite(c.weather_code) ? { tempC: c.temperature_2m, code: c.weather_code } : null;
  }
  function parseGeocode(json) {
    const r = json && Array.isArray(json.results) ? json.results[0] : null;
    const name = r && typeof r.name === 'string' ? r.name.trim() : '';
    return name && inRange(r.latitude, 90) && inRange(r.longitude, 180) ? { name, lat: r.latitude, lon: r.longitude } : null;
  }
  function parseIpLocation(json) {
    if (!json) return null;
    const lat = parseFloat(json.latitude), lon = parseFloat(json.longitude);
    return inRange(lat, 90) && inRange(lon, 180) ? { name: typeof json.city === 'string' ? json.city.trim() : '', lat, lon } : null;
  }

  // The line on the clock tile, e.g. '18° · Clear · Delhi'. Empty unless there is real weather: nothing is shown offline.
  function weatherLine(weather, unit) {
    if (!weather || !Number.isFinite(weather.tempC)) return '';
    return [formatTemperature(weather.tempC, unit), weatherText(weather.code), weather.name].filter(Boolean).join(' \u00b7 ');
  }

  // ---- next alarm (the phone's real alarm clock, reported by the app) ----
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // { none: true } when there is no upcoming alarm, else its time (in the 12 or 24-hour style), how long until it
  // rings ('in 9h', 'in 2d 9h') and, only when it is more than a day away, the weekday.
  function alarmSummary(triggerMs, nowMs, hour12) {
    if (!Number.isFinite(triggerMs) || !Number.isFinite(nowMs) || triggerMs <= nowMs) return { none: true };
    const at = new Date(triggerMs), t = formatTime(at, hour12);
    const mins = Math.ceil((triggerMs - nowMs) / 60000);
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    const when = mins < 60 ? 'in ' + mins + 'm'
      : d === 0 ? 'in ' + h + 'h' + (m ? ' ' + m + 'm' : '')
      : 'in ' + d + 'd' + (h ? ' ' + h + 'h' : '');
    const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const daysAway = Math.round((startOf(at) - startOf(new Date(nowMs))) / 86400000);
    return { none: false, hh: t.hh, mm: t.mm, suffix: t.suffix, when, day: daysAway > 1 ? DAY_SHORT[at.getDay()] : '' };
  }

  // ---- battery details: temperature, voltage and health from the phone's battery reading ----
  const HEALTH = { 2: 'Good', 3: 'Hot', 4: 'Dead', 5: 'Overvoltage', 6: 'Fault', 7: 'Cold' };
  const healthText = code => HEALTH[code] || '';
  function batteryDetailsText(tempC, millivolts, health, unit) {
    const big = Number.isFinite(tempC) ? formatTemperature(tempC, unit) : '\u2013';
    const parts = [Number.isFinite(millivolts) ? (millivolts / 1000).toFixed(2) + ' V' : '', healthText(health)].filter(Boolean);
    return { big, sub: parts.length ? parts.join(' \u00b7 ') : (big === '\u2013' ? 'Not available' : '') };
  }

  // The hidden effect: hold the battery tile for holdMs, then the ring charges up over chargeMs.
  const EGG = { holdMs: 2000, chargeMs: 1800 };

  // The percentage shown while the ring charges up: from the real level to 100 over chargeMs.
  function chargePercent(level, elapsedMs, chargeMs) {
    const start = Number.isFinite(level) && level >= 0 ? Math.min(level, 1) * 100 : 0;
    const t = Math.min(Math.max(elapsedMs / chargeMs, 0), 1);
    return Math.round(start + (100 - start) * t);
  }

  // rand is a number in [0, 1). Never returns lastAgent, so the same flash does not come twice in a row.
  function pickFlash(rand, lastAgent) {
    const pool = FLASHES.filter(f => f.agent !== lastAgent);
    const r = Math.min(Math.max(Number.isFinite(rand) ? rand : 0, 0), 0.999999);
    return pool[Math.floor(r * pool.length)];
  }

  const FONTS = ['dot', 'mono', 'sans'];
  const THEMES = ['dark', 'light', 'system'];
  const ACCENTS = ['#d71921', '#ffb25b', '#5be28c', '#4aa3ff', '#f4f3f0'];
  const DEFAULT_ACCENT = '#d71921';
  const DEFAULT_SETTINGS = {
    font: 'dot', theme: 'system', accent: '#d71921', hour12: false, autoDim: true,
    dimStart: 22, dimEnd: 7, dimLevel: 30, weekStart: 1, red: false, reduceEffects: false, unit: 'C', weatherCity: null,
  };

  const validCity = c => (c && typeof c.name === 'string' && c.name.trim() && c.name.trim().length <= 60 && inRange(c.lat, 90) && inRange(c.lon, 180)
    ? { name: c.name.trim(), lat: c.lat, lon: c.lon } : null);

  // Turns anything read from storage into a complete, valid settings object.
  function normalizeSettings(raw) {
    const d = DEFAULT_SETTINGS;
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const bool = (v, def) => (typeof v === 'boolean' ? v : def);
    const hour = (v, def) => (Number.isInteger(v) && v >= 0 && v <= 23 ? v : def);
    const level = Number.isFinite(r.dimLevel) ? Math.min(80, Math.max(10, Math.round(r.dimLevel))) : d.dimLevel;
    return {
      font: FONTS.includes(r.font) ? r.font : d.font,
      theme: THEMES.includes(r.theme) ? r.theme : d.theme,
      accent: typeof r.accent === 'string' && HEX.test(r.accent) ? r.accent.toLowerCase() : d.accent,
      hour12: bool(r.hour12, d.hour12),
      autoDim: bool(r.autoDim, d.autoDim),
      dimStart: hour(r.dimStart, d.dimStart),
      dimEnd: hour(r.dimEnd, d.dimEnd),
      dimLevel: level,
      weekStart: r.weekStart === 0 || r.weekStart === 1 ? r.weekStart : d.weekStart,
      red: bool(r.red, d.red),
      reduceEffects: bool(r.reduceEffects, d.reduceEffects),
      unit: r.unit === 'F' ? 'F' : 'C',
      weatherCity: validCity(r.weatherCity),
    };
  }

  // The palette actually shown. A dimmed screen is always dark: a light one would light up the room.
  function resolveTheme(theme, systemDark, dimmed) {
    if (dimmed) return 'dark';
    if (theme === 'system') return systemDark ? 'dark' : 'light';
    return theme === 'light' ? 'light' : 'dark';
  }

  const api = { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS, FONTS, ACCENTS, hslToHex, hexToHsl, luminance, visibleAccent, onAccent, parseHexInput, resolveTheme, formatHour, THEMES, FLASHES, pickFlash, EGG, chargePercent, summarizeNotifications, weatherText, formatTemperature, parseForecast, parseGeocode, parseIpLocation, forecastUrl, geocodeUrl, weatherLine, IP_LOCATION_URL, alarmSummary, batteryDetailsText, healthText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DockLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
