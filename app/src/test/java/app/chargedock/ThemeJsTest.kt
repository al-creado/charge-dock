package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeJsTest {
    @Test
    fun scriptReportsDark() {
        assertEquals("window.setSystemTheme(true)", ThemeJs.script(true))
    }

    @Test
    fun scriptReportsLight() {
        assertEquals("window.setSystemTheme(false)", ThemeJs.script(false))
    }

    @Test
    fun nightModeYesIsDark() {
        // UI_MODE_TYPE_NORMAL (0x01) combined with UI_MODE_NIGHT_YES (0x20)
        assertTrue(ThemeJs.isNight(0x21))
    }

    @Test
    fun nightModeNoAndUndefinedAreLight() {
        assertFalse(ThemeJs.isNight(0x11)) // UI_MODE_NIGHT_NO
        assertFalse(ThemeJs.isNight(0x01)) // UI_MODE_NIGHT_UNDEFINED
    }
}
