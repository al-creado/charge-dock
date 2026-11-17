(function (root) {
  // True between startHour (inclusive) and endHour (exclusive), also across midnight.
  function isNight(date, startHour = 22, endHour = 7) {
    const h = date.getHours();
    return startHour > endHour ? (h >= startHour || h < endHour) : (h >= startHour && h < endHour);
  }

  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Seven days, Monday first, for the week that contains `now`.
  function weekStrip(now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return LETTERS.map((letter, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const state = d.getTime() === today.getTime() ? 'today' : (d < today ? 'past' : 'future');
      return { letter, day: d.getDate(), state };
    });
  }

  // level: 0..1, or -1 / NaN when unknown. secsToFull: seconds, or -1 when unknown.
  function batteryText(level, charging, secsToFull) {
    const known = Number.isFinite(level) && level >= 0;
    const pct = known ? Math.round(Math.min(level, 1) * 100) + '%' : '--%';
    const status = (charging ? 'Charging' : 'On battery') + ' · ' + pct;
    if (!charging) return { status, pct, big: 'Not charging', sub: 'Plug in to charge' };
    if (!known) return { status, pct, big: 'Charging', sub: 'Level unknown' };
    if (level >= 1) return { status, pct, big: 'Full', sub: 'Fully charged' };
    if (Number.isFinite(secsToFull) && secsToFull > 0) {
      return { status, pct, big: 'Charging', sub: 'Full in about ' + Math.round(secsToFull / 60) + ' min' };
    }
    return { status, pct, big: 'Charging', sub: 'Time to full unknown' };
  }

  const api = { isNight, weekStrip, batteryText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DockLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
