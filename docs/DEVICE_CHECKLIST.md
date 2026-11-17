# Device checklist (Nothing Phone 1)

Tick each line pass or fail. Any fail is a bug to report.

## Install and preview
- [ ] The APK installs and **Charge Dock** appears in the app list.
- [ ] Opening the app shows the styled front page: dot-matrix title, a red **Open dock** button, a start-when-charging card and a notifications card.
- [ ] **Open dock** shows the dock while the phone is not charging.
- [ ] **Open dock** shows the dock full screen and the screen stays on.
- [ ] The battery tile shows the real percentage and says **Charging** when plugged in.
- [ ] Rotating the phone keeps the layout intact in both directions.
- [ ] **Open dock** follows the phone: stand it up for portrait, turn it sideways for landscape, even with rotation locked.

## Screen saver
- [ ] **Screen saver settings** opens a page where Charge Dock can be chosen. If not, note what opened instead.
- [ ] With the screen saver set to **While charging**, plugging in and letting the screen time out shows the dock.
- [ ] The battery percentage on the dock matches the phone.
- [ ] The screen saver follows how the phone is held: it comes up in landscape when the phone is sideways and in portrait when it is upright, even with rotation locked. Turn the phone while it shows and the dock turns too.
- [ ] With the phone locked, then plugged in, the dock appears over the lock screen after the screen times out.
- [ ] The line "Hold the clock to exit" shows at the bottom left.
- [ ] Unplugging leaves the dock.
- [ ] A long press on the clock tile leaves the dock. Holding the hex field or a slider in Settings does not.

## Controls
- [ ] Tapping the clock tile toggles red night mode.
- [ ] **Dim** and **Bright** work, and the dock dims by itself after 22:00.
- [ ] Settings opens with the gear, and every setting changes the dock straight away.
- [ ] **Theme: Device** is the default and follows the phone's dark mode on the dock and on the front page. Turn dark mode on and off and check both.
- [ ] The front page's status bar area matches its theme (dark bar in dark, light bar with dark icons in light).
- [ ] A custom accent colour can be picked with the sliders and by pasting a hex code like `#3399ff`.
- [ ] Settings are still there after closing and reopening the dock.
- [ ] The **Turn down visual effects** switch is in Settings. With it off, the clock colon blinks and holding the battery tile for two seconds charges the ring up to 100% and flashes once (a single pulse, not a strobe). With it on, the colon is steady and holding does nothing.

## Tiles
- [ ] The right side is a 2×2 grid: Battery, Next alarm, Notifications, Battery details. Nothing is cut off in portrait or landscape.
- [ ] **Next alarm** shows your real next alarm and counts down. Set, change and delete an alarm in the Clock app and the tile follows. With no alarm it says "No alarm set".
- [ ] **Battery details** shows a believable temperature and voltage that change as the phone charges. °C/°F in Settings changes it.
- [ ] At your charge limit the Battery tile says **Paused**.

## Notifications
- [ ] The notifications card shows **Off** at first. **Notification access** opens the system page where Charge Dock can be switched on.
- [ ] After switching it on and coming back, the card shows **On**.
- [ ] The dock's Notifications tile shows a total and the top apps with counts, and only app names (no message text).
- [ ] The counts go up when a notification arrives and down when you clear it. Music and downloads are not counted.
- [ ] With access off, the tile says to turn on notification access.

## Overnight
- [ ] After a full night of charging the phone is not hot and the dock still shows the right time.
- [ ] Nothing flickers, and the layout drifts slightly but never looks broken.
