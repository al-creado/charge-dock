# Charge Dock for Android: design

Date: 2026-11-17. Status: awaiting approval.

## Intent and the why

The owner keeps their phone on a charger by the bed and wants it to turn into a
minimal bedside dock, in the spirit of iPhone StandBy: a big clock and a few
widget tiles, nothing else. It has to appear on its own when the phone is put on
charge. Nobody should open an app or tap anything first.

The look has been prototyped and approved as a web page (kept in this change as
`web/index.html`, see "The page"). This design covers turning that page into an
Android app that starts itself on charge.

Device: Nothing Phone (1). OLED screen, Nothing OS (Android 12 at launch, updated
since). The dot-matrix font and red accent are a deliberate nod to Nothing's own
design language.

## Goals

- Plug in the charger and, once the screen would normally go idle, the dock appears
  full screen, with no manual launch.
- The look matches the approved prototype: clock tile, battery tile, weather
  tile, date tile, week strip, dot-matrix type, Nothing red accent.
- Works in portrait and landscape, on the charger at night, with no network.
- Auto-dim (22:00 to 07:00), manual dim override, and red night mode, as in the
  prototype.
- Installable by the owner without a developer toolchain: a CI build produces an
  APK they can download and sideload.

## Non-goals

- No alarm. It was removed from the prototype on request. An alarm that rings
  with the screen off is a later project and would need native alarm APIs.
- No real weather yet. The weather tile shows sample data and says so.
- No calendar, notifications or music tiles. They need extra permissions.
- No Play Store release, no iOS, no other phones. The app should still run on
  other Android phones, but only the Nothing Phone (1) is tested.
- No Glyph interface (the rear LEDs).

## Anti-goals (a failure even if it technically works)

- The owner has to open the app, or press anything, to start the dock.
- The screen stays at full brightness all night.
- It drains the battery or heats the phone while charging.
- It looks different from the approved prototype.

## Constraints

- Android blocks websites and background apps from launching a full-screen screen
  on a power event. The sanctioned mechanism is a screen saver (a `DreamService`),
  which Android itself starts when the screen would turn off while charging.
  That is why it is the chosen route.
- The prototype loads its fonts (Doto, Space Mono) from Google Fonts. The app must
  work offline, so the fonts ship inside the app. Both are SIL OFL licensed, which
  allows bundling.
- I cannot build or run an Android app in this environment. The APK is built by
  CI, and the owner tests it on the phone.

## Approaches considered

1. **Web page plus an automation app** (MacroDroid, Tasker, or similar, opening
   the page when the charger connects). Fastest, but it needs a hosted address and
   extra permissions, and it can be flaky. Not chosen.
2. **Native app with a screen saver service hosting the page (chosen).** One app,
   started by Android itself, with the existing look kept. Cost: sideloading and
   the idle delay before the dock appears.
3. **Both 1 and 2.** Adds an automation rule on top of the app to open it
   immediately. Not needed yet. It can be added later if the idle delay is
   annoying.

The owner chose approach 2.

## Design

### Shape of the app

- **Language and tools:** Kotlin, Gradle, no UI framework. The UI is the existing
  web page in a `WebView`.
- **Min and target SDK:** minSdk 26, target the current stable SDK.
- **Source layout (builder's call):**
  - `web/` holds the page and fonts as plain static files.
  - `app/` is the Android project. A build step copies `web/` into the app's
    assets, so there is one copy of the page.
  - `.github/workflows/` holds the CI build.

### Two entry points

1. **`DockDreamService`** (the main feature): a `DreamService` that shows the
   `WebView` full screen. It is interactive, fullscreen and lets the system keep
   the screen on while dreaming.
2. **`MainActivity`** (a small launcher screen, needed so the app has an icon
   and a way to set itself up). It has three buttons:
   - open the system screen-saver settings, to select Charge Dock and set "start
     while charging";
   - preview the dock right now;
   - a short line on how to set it up.

### The page

- `web/index.html` is the prototype with these changes: fonts come from local
  files instead of Google Fonts, and the battery tile reads values the app injects.
- **Battery data:** the app reads `BatteryManager` natively and calls a small
  JavaScript function on the page with level and charging state, rather than
  relying on `navigator.getBattery` inside the `WebView`. (Builder's call:
  confirm whether `getBattery` works in `WebView`; if so the native injection can
  be skipped.)
- Everything else (clock, date, week strip, dim, red mode, burn-in drift) already
  runs inside the page.

### Dimming

Auto-dim and the manual override stay in the page, which fades its own contents.
On an OLED screen, near-black pixels cost almost no power, so this also protects
the screen. Lowering the actual screen brightness through the window is an
optional extra for the builder.

### Leaving the dock

The dock is interactive so taps reach the page (Night toggle, Dim, Auto). Exits:
the power button, unplugging, and a long press anywhere calls `finish()`.
(Builder may tune the exact gesture.)

### Build and delivery

- A GitHub Actions workflow builds a debug-signed APK on each push and uploads it
  as a downloadable build artifact. Debug signing is fine for sideloading.
- The README gets install and setup steps for the owner: download the APK,
  allow installs from the source, install, open Charge Dock, tap "Screen saver
  settings", choose Charge Dock, set "When to start" to "While charging".

## Risks and the fallback

- **Screen saver visibility on Nothing OS.** Android's screen saver setting exists
  in standard Android, but some phone makers hide or remove it. This is unverified
  for the Nothing Phone (1). If it is missing, the fallback is approach 3's
  automation rule opening the app's full-screen preview mode, so the launcher
  activity must also be able to show the dock as a normal full-screen activity
  that keeps the screen on.
- **Idle delay.** The dock appears when the screen times out while charging, not at
  the instant of plugging in. If that is too slow, add the automation rule.
- **Fonts offline.** The dot-matrix look depends on the bundled font files being
  fetched once at build time. If that fails, the builder should stop and ask rather
  than fall back to a different typeface.

## Decided by the owner

- Native app (approach 2), for a Nothing Phone (1).
- Look: the approved prototype, no alarm.

## Left to the builder

- Package name (suggested: `app.chargedock`), app icon and app name text.
- Gradle layout, Kotlin versions, and how `web/` is copied into assets.
- How battery data reaches the page (native injection or `getBattery`).
- The exact exit gesture and any real-brightness extra.
- CI details, within "a downloadable APK from each push".

## My calls (for the owner to check)

- minSdk 26.
- Debug-signed APK, no release signing.
- The sample weather tile stays, labelled "sample".
- Interactive dream with a long press to exit.
