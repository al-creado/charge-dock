# Device checklist (Nothing Phone 1)

Tick each line pass or fail. Any fail is a bug to report.

## Install and preview
- [ ] The APK installs and **Charge Dock** appears in the app list.
- [ ] Opening the app shows the title, three setup lines, and two buttons.
- [ ] **Preview dock** shows the dock full screen and the screen stays on.
- [ ] The battery tile shows the real percentage and says **Charging** when plugged in.
- [ ] Rotating the phone keeps the layout intact in both directions.
- [ ] With rotation locked to portrait, **Preview dock** still opens in landscape.

## Screen saver
- [ ] **Screen saver settings** opens a page where Charge Dock can be chosen. If not, note what opened instead.
- [ ] With the screen saver set to **While charging**, plugging in and letting the screen time out shows the dock.
- [ ] The battery percentage on the dock matches the phone.
- [ ] With rotation locked to portrait, the screen saver also comes up in landscape. (Android may ignore the request for screen savers; if so, tell me.)
- [ ] With the phone locked, then plugged in, the dock appears over the lock screen after the screen times out.
- [ ] The line "Hold the clock to exit" shows at the bottom left.
- [ ] Unplugging leaves the dock.
- [ ] A long press on the clock tile leaves the dock. Holding the hex field or a slider in Settings does not.

## Controls
- [ ] Tapping the clock tile toggles red night mode.
- [ ] **Dim** and **Bright** work, and the dock dims by itself after 22:00.
- [ ] Settings opens with the gear, and every setting changes the dock straight away.
- [ ] **Theme: Device** follows the phone's dark mode. Turn dark mode on and off and check.
- [ ] A custom accent colour can be picked with the sliders and by pasting a hex code like `#3399ff`.
- [ ] Settings are still there after closing and reopening the dock.
- [ ] The **Turn down visual effects** switch is in Settings. With it off, the clock colon blinks and holding the battery tile for five seconds fills the ring and flashes once (a single pulse, not a strobe). With it on, the colon is steady and holding does nothing.

## Overnight
- [ ] After a full night of charging the phone is not hot and the dock still shows the right time.
- [ ] Nothing flickers, and the layout drifts slightly but never looks broken.
