package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationCountsTest {
    @Test
    fun noNotificationsGivesNoRows() {
        assertEquals(emptyList<AppCount>(), NotificationCounts.fromLabels(emptyList()))
    }

    @Test
    fun countsEachAppAndKeepsFirstSeenOrder() {
        assertEquals(
            listOf(AppCount("Mail", 2), AppCount("Messages", 1)),
            NotificationCounts.fromLabels(listOf("Mail", "Messages", "Mail")),
        )
    }

    @Test
    fun blankLabelsBecomeOther() {
        assertEquals(listOf(AppCount("Other", 2)), NotificationCounts.fromLabels(listOf("", "   ")))
    }

    @Test
    fun fallbackNameIsTheLastPartOfThePackage() {
        assertEquals("Mail", NotificationCounts.fallbackName("com.example.mail"))
        assertEquals("Whatsapp", NotificationCounts.fallbackName("com.whatsapp"))
        assertEquals("Systemui", NotificationCounts.fallbackName("com.android.systemui"))
        assertEquals("Photo editor", NotificationCounts.fallbackName("app.photo_editor"))
        assertEquals("Single", NotificationCounts.fallbackName("single"))
    }

    @Test
    fun fallbackNameForNothingIsOther() {
        assertEquals("Other", NotificationCounts.fallbackName(""))
        assertEquals("Other", NotificationCounts.fallbackName("com.example."))
    }
}
