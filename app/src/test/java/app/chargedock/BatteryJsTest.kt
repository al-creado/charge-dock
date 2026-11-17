package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class BatteryJsTest {
    @Test
    fun scriptForNormalReading() {
        assertEquals("window.setBattery(0.82,true,2280,true)", BatteryJs.script(82, 100, true, 2_280_000L, true))
    }

    @Test
    fun fullBatteryIsOne() {
        assertEquals("window.setBattery(1.00,true,-1,true)", BatteryJs.script(100, 100, true, -1L, true))
    }

    @Test
    fun pluggedInButNotChargingIsReportedAsPaused() {
        // A phone holding at its charge limit: plugged in, not charging.
        assertEquals("window.setBattery(0.80,false,-1,true)", BatteryJs.script(80, 100, false, -1L, true))
    }

    @Test
    fun unpluggedIsNotPaused() {
        assertEquals("window.setBattery(0.80,false,-1,false)", BatteryJs.script(80, 100, false, -1L, false))
    }

    @Test
    fun unknownLevel() {
        assertEquals("window.setBattery(-1,true,-1,true)", BatteryJs.script(-1, 100, true, -1L, true))
    }

    @Test
    fun zeroScale() {
        assertEquals("window.setBattery(-1,false,-1,false)", BatteryJs.script(50, 0, false, -1L, false))
    }

    @Test
    fun ignoresDeviceLocale() {
        val saved = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("window.setBattery(0.82,true,2280,true)", BatteryJs.script(82, 100, true, 2_280_000L, true))
        } finally {
            Locale.setDefault(saved)
        }
    }
}
