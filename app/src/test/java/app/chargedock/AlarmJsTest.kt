package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmJsTest {
    @Test
    fun reportsTheNextAlarmTime() {
        assertEquals("window.setNextAlarm(1763400000000)", AlarmJs.script(1_763_400_000_000L))
    }

    @Test
    fun noAlarmIsNull() {
        assertEquals("window.setNextAlarm(null)", AlarmJs.script(null))
    }

    @Test
    fun aNonsenseTimeIsNull() {
        assertEquals("window.setNextAlarm(null)", AlarmJs.script(0L))
        assertEquals("window.setNextAlarm(null)", AlarmJs.script(-5L))
    }
}
