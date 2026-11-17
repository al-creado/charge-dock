# Charge Dock

A minimal bedside dock for an Android phone on a charger: a big dot-matrix clock, battery, weather,
date and a week view, in the spirit of iPhone StandBy. It starts by itself while the phone is charging.
Built for the Nothing Phone (1), and it should run on any Android 8 or newer phone.

## Get the app

1. Open the **Actions** tab of this repository and pick the latest successful **build** run (one runs on every merge to `main`).
2. Download the artifact **charge-dock-debug-apk** and unzip it. It contains `app-debug.apk`.
3. Copy the APK to your phone, open it, and allow installing from that app when Android asks.

## Set it up (once)

1. Open **Charge Dock** and tap **Screen saver settings**.
2. Choose **Charge Dock** as the screen saver.
3. Set **When to start** to **While charging**.

From then on, when the phone is charging and the screen would go idle, the dock appears.
It shows after the normal screen timeout, not the instant you plug in.

Tap **Preview dock** in the app to see it any time.

### If your phone has no Screen saver setting

Some phone makers hide it. Use a free automation app such as MacroDroid or Tasker with this rule:
when the charger connects, open Charge Dock, then tap **Preview dock** (or launch it directly).
Preview keeps the screen on while it is showing.

## Using the dock

- Swipe the tiles left and right, or tap the dots, to change page.
- **Night** (or tap the clock) turns everything red. **Dim** dims or brightens by hand.
- The gear opens **Settings**: clock font, theme (dark, light or device default), accent colour
  (including a custom colour you can paste as a hex code), 12 or 24-hour time, week start,
  and the hours and level for auto-dim.
- A long press on the clock tile, the power button, or unplugging leaves the dock.
- Settings also has a **Turn down visual effects** switch. Turn it on for a steady clock colon and no hidden full-screen effects.

## Notes

- Weather is sample data for now.
- The app works fully offline. There is no alarm yet.

## Development

- `web/` is the dock page, plain HTML, CSS and JavaScript, with its fonts bundled. `app/` is the Android
  app that hosts it in a `WebView` and runs it as a screen saver. The page is copied into the app at build time.
- Page tests: `NODE_PATH=$(npm root -g) node --test "web/test/*.test.js"` (needs Playwright).
- GitHub Actions runs the page tests, the Android unit tests, and builds the debug APK whenever something is merged to `main`.
  To build another branch by hand, open the Actions tab, choose **build**, and use **Run workflow**.
- Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.
