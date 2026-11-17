package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationJsTest {
    @Test
    fun emptyListGivesAnEmptyArray() {
        assertEquals("window.setNotifications([])", NotificationJs.script(emptyList()))
    }

    @Test
    fun listsAppsWithCounts() {
        assertEquals(
            "window.setNotifications([{\"app\":\"Mail\",\"count\":2},{\"app\":\"Messages\",\"count\":1}])",
            NotificationJs.script(listOf(AppCount("Mail", 2), AppCount("Messages", 1))),
        )
    }

    @Test
    fun escapesQuotesBackslashesAndNewlines() {
        assertEquals(
            "window.setNotifications([{\"app\":\"He said \\\"hi\\\" \\\\ \\n\",\"count\":1}])",
            NotificationJs.script(listOf(AppCount("He said \"hi\" \\ \n", 1))),
        )
    }

    @Test
    fun escapesControlCharactersAndLineSeparators() {
        assertEquals(
            "window.setNotifications([{\"app\":\"a\\u0001b\\u2028c\",\"count\":1}])",
            NotificationJs.script(listOf(AppCount("a\u0001b\u2028c", 1))),
        )
    }

    @Test
    fun reportsAccess() {
        assertEquals("window.setNotificationAccess(true)", NotificationJs.accessScript(true))
        assertEquals("window.setNotificationAccess(false)", NotificationJs.accessScript(false))
    }
}
