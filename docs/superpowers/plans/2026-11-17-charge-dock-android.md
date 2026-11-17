# Charge Dock Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Android app whose screen saver shows the approved dot-matrix dock page whenever the phone is charging, built into a downloadable APK by CI.

**Architecture:** The dock UI is a static web page (`web/`) with its fonts bundled. A Kotlin app (`app/`) hosts that page in a `WebView` in two places: a screen saver service (`DockDreamService`, started by Android while charging) and a normal full-screen activity (`DockActivity`, the preview and fallback). The app reads the battery natively and pushes it into the page. GitHub Actions runs the tests and builds a debug-signed APK on every push.

**Tech Stack:** Kotlin, Gradle (AGP 8.7.3, Kotlin 2.0.21, Gradle 8.10.2), `androidx.webkit` `WebViewAssetLoader`, plain HTML/CSS/JS with Node `node:test` and Playwright for page tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-17-charge-dock-android-design.md`. The approved visual prototype is `docs/superpowers/prototype/dock-prototype-v8.html`.

## Global Constraints

- minSdk 26; targetSdk and compileSdk 35 (current stable). App id `app.chargedock`, app name "Charge Dock".
- Kotlin and Gradle, no UI framework (no Compose, no appcompat). The UI is the web page in a `WebView`.
- Works offline: Doto and Space Mono (both SIL OFL) are bundled in `web/fonts/`. The page makes no network requests.
- Layout: `web/` (page and fonts), `app/` (Android project), `.github/workflows/` (CI). One copy of the page, copied into the app's assets at build time.
- Look matches the prototype: clock tile, battery tile, weather tile labelled "Weather · sample", date tile, week strip, dot-matrix type, Nothing red `#d71921`.
- No alarm. No real weather. No calendar, notification or music tiles.
- Auto-dim 22:00 to 07:00 with Auto, Night (red) and Dim pills, and burn-in drift, as in the prototype.
- Exits from the dock: power button, unplugging, and a long press anywhere calls `finish()`.
- CI produces a debug-signed APK on each push, downloadable from the workflow run.

## Review Focus

1. **Unknown battery reading.** `BatteryManager` can report level `-1` or scale `0`; the page must show "--%" and "Level unknown", never "NaN%" or a negative percentage. (Tasks 1 and 3)
2. **Full battery while plugged in.** Level 100% and charging must read "Full" with no minutes-to-full. (Task 1)
3. **Week strip at month and year boundaries.** Thursday 2026-12-31 shows 28, 29, 30, 31, 1, 2, 3 with Thursday as today; Sunday is the last column. (Task 1)
4. **Night boundaries.** Exactly 22:00 dims, 06:59 dims, 07:00 does not, midnight dims. (Task 1)
5. **Phone language uses a decimal comma** (German, for example). The injected script must still say `0.82`, not `0,82`, or the page breaks. (Task 3)

---

## File Structure

```
web/index.html            page (standalone document, markup + CSS + glue script)
web/dock-logic.js         pure functions: isNight, weekStrip, batteryText (also loaded by the page)
web/fonts/fonts.css       @font-face rules pointing at local woff2 files
web/fonts/*.woff2         Doto and Space Mono, latin subset
web/fonts/NOTICE.md       font licence notice
web/test/logic.test.js    node:test unit tests for dock-logic.js
web/test/page.test.js     Playwright tests of the page
settings.gradle.kts, build.gradle.kts, gradle.properties, gradle/wrapper/*, gradlew
app/build.gradle.kts, app/src/main/AndroidManifest.xml
app/src/main/java/app/chargedock/DockWebViewFactory.kt   builds the WebView that hosts the page
app/src/main/java/app/chargedock/DockActivity.kt         full-screen preview / fallback
app/src/main/java/app/chargedock/MainActivity.kt         launcher: setup screen
app/src/main/java/app/chargedock/BatteryJs.kt            pure: battery values to a JS call string
app/src/main/java/app/chargedock/BatteryFeed.kt          registers the battery receiver, pushes values into the page
app/src/main/java/app/chargedock/DockDreamService.kt     the screen saver
app/src/test/java/app/chargedock/BatteryJsTest.kt
.github/workflows/build.yml, README.md, docs/DEVICE_CHECKLIST.md, .gitignore
```

**Verification notes for the executor.** Web code is verified locally: `NODE_PATH=$(npm root -g) node --test web/test/`. The Android SDK and Google's Maven repo are unreachable from this container, so Android tasks are verified by pushing to `testing` and reading the GitHub Actions run (load the tools with ToolSearch `select:mcp__github__actions_list,mcp__github__actions_get,mcp__github__get_job_logs`). Push only the `testing` branch.

---

### Task 1: The dock page, offline and tested

**Files:**
- Create: `web/index.html`, `web/dock-logic.js`, `web/fonts/fonts.css`, `web/fonts/*.woff2`, `web/fonts/NOTICE.md`, `web/test/logic.test.js`, `web/test/page.test.js`, `.gitignore`
- Source: `docs/superpowers/prototype/dock-prototype-v8.html`

**Interfaces:**
- Produces (`web/dock-logic.js`, exported with `module.exports` under Node and attached to `window.DockLogic` in the browser):
  - `isNight(date: Date, startHour: number = 22, endHour: number = 7): boolean`
  - `weekStrip(now: Date): Array<{ letter: string, day: number, state: 'past' | 'today' | 'future' }>`, seven entries, Monday first, letters `M T W T F S S`
  - `batteryText(level: number, charging: boolean, secsToFull: number): { status: string, pct: string, big: string, sub: string }`; `level` is 0..1 or `-1`/`NaN` for unknown, `secsToFull` is seconds or `-1` for unknown
- Produces (global on the page): `window.setBattery(level: number, charging: boolean, secsToFull: number): void`, renders `batteryText` into `#chg`, `#pct`, `#ringFill`, `#battBig`, `#battSub`. The native app calls this in Tasks 3 and 4.

- [ ] **Step 1: Write the failing logic tests** in `web/test/logic.test.js` (CommonJS, `node:test`, `assert/strict`, helper `at(y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min)`):
  - `isNight default window`: 21:59 false, 22:00 true, 00:00 true, 06:59 true, 07:00 false.
  - `isNight window not crossing midnight`: `isNight(at(2026,11,17,3,0), 1, 5)` true; at 05:00 false.
  - `weekStrip Tuesday`: for 2026-11-17, days are `[16,17,18,19,20,21,22]`, letters join to `MTWTFSS`, state `past` for 16, `today` for 17, `future` for the other five.
  - `weekStrip month and year boundary`: for 2026-12-31 days are `[28,29,30,31,1,2,3]` and index 3 is `today`.
  - `weekStrip Sunday is last`: for 2027-01-03 index 6 is `today`, indexes 0 to 5 are `past`, days `[28,29,30,31,1,2,3]`.
  - `batteryText`, exact objects:
    - `(0.82, true, 2280)` gives `{ status: 'Charging · 82%', pct: '82%', big: 'Charging', sub: 'Full in about 38 min' }`
    - `(-1, true, -1)` gives `{ status: 'Charging · --%', pct: '--%', big: 'Charging', sub: 'Level unknown' }`
    - `(NaN, true, NaN)` gives the same as the line above
    - `(1, true, -1)` gives `{ status: 'Charging · 100%', pct: '100%', big: 'Full', sub: 'Fully charged' }`
    - `(0.2, true, -1)` gives `{ status: 'Charging · 20%', pct: '20%', big: 'Charging', sub: 'Time to full unknown' }`
    - `(0.5, false, -1)` gives `{ status: 'On battery · 50%', pct: '50%', big: 'Not charging', sub: 'Plug in to charge' }`

- [ ] **Step 2: Run to confirm failure.** Run `NODE_PATH=$(npm root -g) node --test web/test/logic.test.js`. Expected: FAIL, "Cannot find module '../dock-logic.js'".

- [ ] **Step 3: Implement `web/dock-logic.js`** with the signatures above. `isNight` handles both `start > end` (crosses midnight) and `start < end`. `weekStrip` compares calendar dates, not timestamps, and builds days from the Monday of `now`'s week with `setDate` so month and year rollovers are handled by `Date`.

- [ ] **Step 4: Run tests.** Same command. Expected: all pass.

- [ ] **Step 5: Create `web/index.html` from the prototype.** Copy the prototype, then change exactly this:
  - Wrap in `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; keep `<title>Charge Dock</title>`; close with `</head><body>` and `</body></html>`.
  - Remove the `claude:viewport-fit-sides` meta and the three Google Fonts `<link>` tags; add `<link rel="stylesheet" href="fonts/fonts.css">` and `<script src="dock-logic.js"></script>` before the inline script.
  - In the inline script, replace the night test in `applyDisplay` with `DockLogic.isNight(new Date())`, build the week strip markup from `DockLogic.weekStrip(n)` (keep classes `today`, `past`, `future`), and delete the `navigator.getBattery` block and the `showBattery` function.
  - Add `window.setBattery = (level, charging, secsToFull) => {...}` that renders `DockLogic.batteryText(...)` into `#chg`, `#pct`, `#battBig`, `#battSub` and sets `#ringFill`'s `stroke-dashoffset` to `251.3 * (1 - level)` (full dashoffset `251.3` when the level is unknown). Call `window.setBattery(-1, true, -1)` once at startup.

- [ ] **Step 6: Bundle the fonts.** Fetch `https://fonts.googleapis.com/css2?family=Doto:ROND,wght@100,400;100,700&family=Space+Mono:wght@400;700&display=swap` with a desktop Chrome `User-Agent` so it returns woff2. For each block marked `/* latin */`, download its woff2 from `fonts.gstatic.com` into `web/fonts/` (names like `doto-400.woff2`). Write `web/fonts/fonts.css` with the same `@font-face` rules (family, weight, `unicode-range` unchanged) but `src: url(<file>.woff2) format('woff2')`. Write `web/fonts/NOTICE.md` naming Doto and Space Mono, SIL Open Font License 1.1, https://openfontlicense.org. Add `.gitignore` entries: `.gradle/`, `build/`, `local.properties`, `*.iml`, `.idea/`, `node_modules/`.

- [ ] **Step 7: Write the failing page tests** in `web/test/page.test.js` (CommonJS, `require('playwright')`, one browser for the file, `file://` URL of `web/index.html`, `deviceScaleFactor: 1`). For each test, collect `pageerror`, `console` errors, and any request whose URL does not start with `file:` or `data:`:
  - `loads offline with local fonts`: zero external requests, zero errors, `await page.evaluate(() => document.fonts.load('700 20px Doto'))` returns a non-empty list, and the same for `'400 14px "Space Mono"'`.
  - `renders battery from setBattery`: after `window.setBattery(0.82, true, 2280)` the texts are `#pct` "82%", `#battBig` "Charging", `#battSub` "Full in about 38 min", `#chg` "Charging · 82%". After `window.setBattery(-1, true, -1)`: `#pct` is "--%" and `#battSub` is "Level unknown".
  - `fits every orientation`: for viewports 915x412, 412x915, 800x360, 360x800, `document.documentElement.scrollWidth <= innerWidth`, and the bounding box of `.time` lies inside the bounding box of `.tile.clock`.
  - `auto-dim follows the clock`: with `page.clock.install({ time: new Date(2026, 10, 17, 23, 15) })`, `#dock` has class `dim`; at 12:15 it does not; at 23:15 after clicking `#autoBtn` it does not.
  - `night mode toggles`: clicking `.tile.clock` adds class `red` to `body`; clicking it again removes it; `#redBtn` has `aria-pressed` matching.

- [ ] **Step 8: Run to confirm which tests fail, then fix the page until all pass.** Run `NODE_PATH=$(npm root -g) node --test web/test/`. Expected: after fixes, all logic and page tests pass. If `fits every orientation` fails at a viewport, adjust clamp/min sizes in the CSS rather than the test.

- [ ] **Step 9: Commit and push.**

```bash
git add web .gitignore docs/superpowers/prototype docs/superpowers/plans
git commit -m "feat: standalone offline dock page with tests"
git push origin testing
```

---

### Task 2: Android project, CI, and a previewable APK

**Files:**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradle/wrapper/*`, `gradlew`, `gradlew.bat`, `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/res/values/strings.xml`, adaptive launcher icon resources, `DockWebViewFactory.kt`, `DockActivity.kt`, `MainActivity.kt`, `.github/workflows/build.yml`

**Interfaces:**
- Produces: `object DockWebViewFactory { fun create(context: Context, onPageLoaded: () -> Unit): WebView }`. The WebView has JavaScript and DOM storage on, file access off, black background, text zoom 100, and loads `https://appassets.androidplatform.net/assets/index.html` through `WebViewAssetLoader` with an `AssetsPathHandler` mounted at `/assets/`. Navigation away from that origin is blocked. `onPageLoaded` runs from `onPageFinished`.
- Produces: `DockActivity` (shows the dock full screen with `FLAG_KEEP_SCREEN_ON` and hidden system bars, long press calls `finish()`).
- Produces: `MainActivity` (launcher) with one button, "Preview dock", that starts `DockActivity`. Task 4 adds the second button.

- [ ] **Step 1: Generate the Gradle wrapper.** In a temp directory run `gradle wrapper --gradle-version 8.10.2`, copy `gradlew`, `gradlew.bat`, `gradle/wrapper/` into the repo root, `chmod +x gradlew`.

- [ ] **Step 2: Write the Gradle files.** `settings.gradle.kts` includes `:app` and uses `google()` and `mavenCentral()` in plugin and dependency management. Root `build.gradle.kts` declares AGP 8.7.3 and Kotlin 2.0.21 plugins (`apply false`). `app/build.gradle.kts`: namespace and applicationId `app.chargedock`, compileSdk 35, minSdk 26, targetSdk 35, versionCode 1, versionName "0.1.0", JVM target 17, dependency `androidx.webkit:webkit:1.12.1`, test dependency `junit:junit:4.13.2`. Add a `Copy` task `syncWebAssets` that copies `../web` (excluding `test/**`) into `build/generated/web`, registers that folder as an assets source dir, and runs before `preBuild`.

- [ ] **Step 3: Write the manifest and resources.** `MainActivity` is the launcher (`MAIN`/`LAUNCHER`), `DockActivity` is not exported, theme `@android:style/Theme.DeviceDefault.NoActionBar`, label from `@string/app_name` = "Charge Dock". Launcher icon: a minimal adaptive icon, black background and a few red dots as vector foreground (builder's design).

- [ ] **Step 4: Implement the three Kotlin files** with the signatures above. `DockActivity` hides system bars with `WindowInsetsController` and sets `setOnLongClickListener { finish(); true }` on the WebView. `MainActivity` builds a simple programmatic layout (centered title, one button).

- [ ] **Step 5: Write `.github/workflows/build.yml`.** Triggers: `push` (all branches) and `workflow_dispatch`. Job `web`: checkout, setup-node 22, `npm install --no-save playwright@1.49.1`, `npx playwright install --with-deps chromium`, `node --test web/test/`. Job `android`: checkout, setup-java (temurin 17), `gradle/actions/setup-gradle@v4`, `./gradlew --no-daemon testDebugUnitTest assembleDebug`, a step that fails unless `unzip -l app/build/outputs/apk/debug/app-debug.apk` lists `assets/index.html`, `assets/dock-logic.js` and `assets/fonts/`, then `actions/upload-artifact@v4` with name `charge-dock-debug-apk`, path `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 6: Commit, push, and verify CI.**

```bash
git add -A
git commit -m "feat: Android project, CI, and dock preview activity"
git push origin testing
```
Poll the run for this commit with `mcp__github__actions_list`. Expected: both `web` and `android` jobs succeed and the artifact `charge-dock-debug-apk` exists. On failure read `mcp__github__get_job_logs`, fix, and push again.

---

### Task 3: Battery bridge

**Files:**
- Create: `app/src/main/java/app/chargedock/BatteryJs.kt`, `app/src/main/java/app/chargedock/BatteryFeed.kt`, `app/src/test/java/app/chargedock/BatteryJsTest.kt`
- Modify: `DockActivity.kt` (start and stop the feed), `DockWebViewFactory.kt` only if the `onPageLoaded` hook needs adjusting.

**Interfaces:**
- Consumes: `DockWebViewFactory.create(context, onPageLoaded)` from Task 2 and `window.setBattery(level, charging, secsToFull)` from Task 1.
- Produces: `object BatteryJs { fun script(level: Int, scale: Int, charging: Boolean, chargeTimeMs: Long): String }`, pure, returns `window.setBattery(<fraction>,<true|false>,<seconds>)`. The fraction is `level/scale` as an invariant-locale decimal (`Locale.ROOT`), or `-1` when level or scale is not positive; seconds is `chargeTimeMs / 1000`, or `-1` when `chargeTimeMs <= 0`.
- Produces: `class BatteryFeed(context: Context, webView: WebView) { fun start(); fun stop(); fun onPageLoaded() }`. `start` registers a receiver for `Intent.ACTION_BATTERY_CHANGED` (the sticky intent is read immediately), `stop` unregisters it, `onPageLoaded` re-sends the latest reading. It reads `BatteryManager.EXTRA_LEVEL`, `EXTRA_SCALE`, charging from `EXTRA_STATUS` (charging or full) or `EXTRA_PLUGGED != 0`, and `computeChargeTimeRemaining()` on API 28+ (else `-1`). It calls `webView.evaluateJavascript(BatteryJs.script(...), null)` on the main thread.

- [ ] **Step 1: Write the failing test** `BatteryJsTest.kt` (JUnit 4):
  - `scriptForNormalReading`: `BatteryJs.script(82, 100, true, 2_280_000)` equals `"window.setBattery(0.82,true,2280)"`.
  - `unknownLevel`: `script(-1, 100, true, -1)` equals `"window.setBattery(-1,true,-1)"`.
  - `zeroScale`: `script(50, 0, false, -1)` equals `"window.setBattery(-1,false,-1)"`.
  - `ignoresDeviceLocale`: set `Locale.setDefault(Locale.GERMANY)` (restore in `finally`), then `script(82, 100, true, 2_280_000)` still equals `"window.setBattery(0.82,true,2280)"`.

- [ ] **Step 2: Implement `BatteryJs.kt`** to satisfy the tests.

- [ ] **Step 3: Implement `BatteryFeed.kt`** with the signatures above and wire it into `DockActivity`: create the WebView with `onPageLoaded = { feed.onPageLoaded() }`, `feed.start()` in `onStart`, `feed.stop()` in `onStop`.

- [ ] **Step 4: Commit, push, and verify CI.**

```bash
git add -A
git commit -m "feat: push battery state into the dock page"
git push origin testing
```
Expected: the `android` job runs `testDebugUnitTest` with the four `BatteryJsTest` tests passing, and the `web` job still passes.

---

### Task 4: Screen saver service, setup screen, and docs

**Files:**
- Create: `app/src/main/java/app/chargedock/DockDreamService.kt`, `README.md` (replace the placeholder), `docs/DEVICE_CHECKLIST.md`
- Modify: `AndroidManifest.xml`, `MainActivity.kt`

**Interfaces:**
- Consumes: `DockWebViewFactory.create`, `BatteryFeed`.
- Produces: `class DockDreamService : DreamService()`. In `onAttachedToWindow`: `isInteractive = true`, `isFullscreen = true`, create the WebView (with `onPageLoaded` forwarding to the feed) and `setContentView(it)`; long press calls `finish()`. `onDreamingStarted` calls `feed.start()`, `onDreamingStopped` calls `feed.stop()`, `onDetachedFromWindow` calls `webView.destroy()`. Manifest entry: exported service with `android:permission="android.permission.BIND_DREAM_SERVICE"` and an intent filter for action `android.service.dreams.DreamService` and category `android.intent.category.DEFAULT`.
- Produces: a second button in `MainActivity`, "Screen saver settings", that starts `Settings.ACTION_DREAM_SETTINGS` and, on `ActivityNotFoundException`, falls back to `Settings.ACTION_DISPLAY_SETTINGS`. Under the buttons, three lines of setup text: install, choose Charge Dock, set "When to start" to "While charging".

- [ ] **Step 1: Implement `DockDreamService`** and register it in the manifest as specified.

- [ ] **Step 2: Add the settings button and setup text to `MainActivity`.**

- [ ] **Step 3: Write `README.md`.** What the app is, how to get the APK (Actions run, artifact `charge-dock-debug-apk`), how to install it (allow installs from the browser or file manager, open the APK), the three setup steps from Step 2, how to uninstall, and a "If the Screen saver setting is missing" section: use any free automation app (MacroDroid or Tasker) with the rule "charger connected, then open Charge Dock, then Preview dock".

- [ ] **Step 4: Write `docs/DEVICE_CHECKLIST.md`**, a checklist for the owner on the Nothing Phone (1), each line a pass or fail: install works; "Preview dock" shows the dock full screen and the screen stays on; battery tile shows the real percentage and "Charging" when plugged in; "Screen saver settings" opens a screen where Charge Dock can be chosen (if not, report it); with the screen saver set to "While charging", plugging in and letting the screen time out shows the dock; rotating the phone keeps the layout intact; tapping the clock tile toggles red; Dim, Bright and Auto pills work; a long press exits; unplugging exits; the dock dims after 22:00; after a full night of charging the phone is not hot and the dock still shows the right time.

- [ ] **Step 5: Commit, push, and verify CI.**

```bash
git add -A
git commit -m "feat: screen saver service, setup screen, and docs"
git push origin testing
```
Expected: both jobs succeed, the APK artifact exists, and `unzip -l` still lists the assets.

- [ ] **Step 6: Hand over to the owner.** Tell them where to download the APK and point them at `docs/DEVICE_CHECKLIST.md`. Any failed line becomes a bug to fix. The executor cannot run these checks.
