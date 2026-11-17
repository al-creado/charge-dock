package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class BatteryJsTest {
    @Test
    fun scriptForNormalReading() {
        assertEquals("window.setBattery(0.82,true,2280)", BatteryJs.script(82, 100, true, 2_280_000L))
    }

    @Test
    fun fullBatteryIsOne() {
        assertEquals("window.setBattery(1.00,true,-1)", BatteryJs.script(100, 100, true, -1L))
    }

    @Test
    fun unknownLevel() {
        assertEquals("window.setBattery(-1,true,-1)", BatteryJs.script(-1, 100, true, -1L))
    }

    @Test
    fun zeroScale() {
        assertEquals("window.setBattery(-1,false,-1)", BatteryJs.script(50, 0, false, -1L))
    }

    @Test
    fun ignoresDeviceLocale() {
        val saved = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("window.setBattery(0.82,true,2280)", BatteryJs.script(82, 100, true, 2_280_000L))
        } finally {
            Locale.setDefault(saved)
        }
    }
}
