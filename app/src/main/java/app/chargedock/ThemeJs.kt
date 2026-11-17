package app.chargedock

import android.content.res.Configuration

/** Tells the dock page whether the phone is in dark mode, for the "Device" theme setting. */
object ThemeJs {
    fun script(dark: Boolean): String = "window.setSystemTheme($dark)"

    fun isNight(uiMode: Int): Boolean =
        (uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
}
