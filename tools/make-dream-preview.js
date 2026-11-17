// Renders the dock page into app/src/main/res/drawable-nodpi/dream_preview.png: the picture shown on the
// Charge Dock card in Android's Screen saver picker.
// Run from the repo root:  NODE_PATH=$(npm root -g) node tools/make-dream-preview.js
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await context.route(u => /open-meteo|geojs/.test(u), r => r.abort());          // no weather line in the picture
  await context.addInitScript(() => { Math.random = () => 0.5; });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(2026, 10, 17, 19, 42) });            // an evening hour, before auto-dim starts
  await page.goto('file://' + path.resolve(__dirname, '..', 'web', 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.setBattery(0.64, true, 3300, true);
    window.setNotifications([{ app: 'Messages', count: 2 }, { app: 'Mail', count: 3 }, { app: 'Calendar', count: 1 }]);
    document.getElementById('notifTile').dataset.state = 'ready';
    document.getElementById('notifLabel').textContent = 'Notifications';
  });
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished)));
  await page.addStyleTag({ content: '.bottom { visibility: hidden; }' });          // no buttons in the picture
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'app', 'src', 'main', 'res', 'drawable-nodpi', 'dream_preview.png') });
  await browser.close();
})();
