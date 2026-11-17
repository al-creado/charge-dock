(function (root) {
  // True between startHour (inclusive) and endHour (exclusive), also across midnight.
  function isNight(date, startHour = 22, endHour = 7) {
    const h = date.getHours();
    return startHour > endHour ? (h >= startHour || h < endHour) : (h >= startHour && h < endHour);
  }

  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index = Date#getDay()

  // Seven days for the week that contains `now`. weekStart: 1 = Monday first (default), 0 = Sunday first.
  function weekStrip(now, weekStart = 1) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const first = new Date(today);
    first.setDate(today.getDate() - ((today.getDay() - weekStart + 7) % 7));
    return DAY_LETTERS.map((_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      const state = d.getTime() === today.getTime() ? 'today' : (d < today ? 'past' : 'future');
      return { letter: DAY_LETTERS[d.getDay()], day: d.getDate(), state };
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

  const FONTS = ['dot', 'mono', 'sans'];
  const ACCENTS = ['#d71921', '#ffb25b', '#5be28c', '#4aa3ff', '#f4f3f0'];
  const DEFAULT_SETTINGS = {
    font: 'dot', accent: '#d71921', hour12: false, autoDim: true,
    dimStart: 22, dimEnd: 7, dimLevel: 30, drift: true, weekStart: 1, red: false,
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
      accent: ACCENTS.includes(r.accent) ? r.accent : d.accent,
      hour12: bool(r.hour12, d.hour12),
      autoDim: bool(r.autoDim, d.autoDim),
      dimStart: hour(r.dimStart, d.dimStart),
      dimEnd: hour(r.dimEnd, d.dimEnd),
      dimLevel: level,
      drift: bool(r.drift, d.drift),
      weekStart: r.weekStart === 0 || r.weekStart === 1 ? r.weekStart : d.weekStart,
      red: bool(r.red, d.red),
    };
  }

  const api = { isNight, weekStrip, batteryText, formatTime, normalizeSettings, DEFAULT_SETTINGS, FONTS, ACCENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DockLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
