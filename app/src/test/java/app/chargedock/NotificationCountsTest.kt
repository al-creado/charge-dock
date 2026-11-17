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
}
