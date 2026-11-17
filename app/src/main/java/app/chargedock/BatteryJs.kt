package app.chargedock

import java.util.Locale

/** Builds the JavaScript call that hands battery readings to the dock page. */
object BatteryJs {
    /**
     * `window.setBattery(level, charging, secondsToFull, pluggedIn)` where level is 0..1 (or -1 when unknown) and
     * secondsToFull is -1 when unknown. [charging] is true only while the battery is really taking charge; a phone
     * holding at its charge limit is plugged in but not charging. Numbers never follow the device locale.
     */
    fun script(level: Int, scale: Int, charging: Boolean, chargeTimeMs: Long, pluggedIn: Boolean): String {
        val fraction = if (level >= 0 && scale > 0) {
            String.format(Locale.ROOT, "%.2f", level.toDouble() / scale)
        } else {
            "-1"
        }
        val seconds = if (chargeTimeMs > 0) chargeTimeMs / 1000 else -1L
        return "window.setBattery($fraction,$charging,$seconds,$pluggedIn)"
    }

    /**
     * `window.setBatteryDetails(temperatureC, millivolts, health)` for the Battery details tile. Temperature comes
     * from Android in tenths of a degree; [temperatureTenths] and [millivolts] that are missing become `null`.
     * [health] is Android's BatteryManager health code.
     */
    fun detailsScript(temperatureTenths: Int?, millivolts: Int, health: Int): String {
        val temperature = temperatureTenths?.let { String.format(Locale.ROOT, "%.1f", it / 10.0) } ?: "null"
        val volts = if (millivolts > 0) millivolts.toString() else "null"
        return "window.setBatteryDetails($temperature,$volts,$health)"
    }
}
