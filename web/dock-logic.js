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
  function batteryText(level, charging, secsToFull) {
    const known = Number.isFinite(level) && level >= 0;
    const pct = known ? Math.round(Math.min(level, 1) * 100) + '%' : '--%';
    if (!charging) return { pct, big: 'Not charging', sub: 'Plug in to charge' };
    if (!known) return { pct, big: 'Charging', sub: 'Level unknown' };
    if (level >= 1) return { pct, big: 'Full', sub: 'Fully charged' };
    if (Number.isFinite(secsToFull) && secsToFull > 0) {
      return { pct, big: 'Charging', sub: 'Full in about ' + Math.round(secsToFull / 60) + ' min' };
    }
    return { pct, big: 'Charging', sub: 'Time to full unknown' };
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

  // Agents with a classic flash ability. Each is one gentle pulse: wind up, a short hold at full white, a long fade.
  const FLASHES = [
    { agent: 'Phoenix', ability: 'Curveball',     windup: 700, hold: 400, fade: 1600 },
    { agent: 'Breach',  ability: 'Flashpoint',    windup: 350, hold: 350, fade: 1400 },
    { agent: 'Yoru',    ability: 'Blindside',     windup: 900, hold: 450, fade: 1800 },
    { agent: 'Skye',    ability: 'Guiding Light', windup: 550, hold: 400, fade: 1500 },
    { agent: 'KAY/O',   ability: 'FLASH/drive',   windup: 500, hold: 450, fade: 1700 },
  ];

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
    font: 'dot', theme: 'dark', accent: '#d71921', hour12: false, autoDim: true,
    dimStart: 22, dimEnd: 7, dimLevel: 30, weekStart: 1, red: false, flash: true,
  };

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
      flash: bool(r.flash, d.flash),
    };
  }

  // The palette actually shown. A dimmed screen is always dark: a light one would light up the room.
  function resolveTheme(theme, systemDark, dimmed) {
    if (dimmed) return 'dark';
    if (theme === 'system') return systemDark ? 'dark' : 'light';
    return theme === 'light' ? 'light' : 'dark';
  }

  const api = { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS, FONTS, ACCENTS, hslToHex, hexToHsl, luminance, visibleAccent, onAccent, parseHexInput, resolveTheme, formatHour, THEMES, FLASHES, pickFlash };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DockLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
