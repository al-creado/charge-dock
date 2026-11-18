package app.chargedock

import java.util.Locale

/** Builds the JavaScript call that hands battery readings to the dock page. */
object BatteryJs {
    /**
     * `window.setBattery(level, charging, secondsToFull, pluggedIn, source, speed)` where level is 0..1 (or -1 when unknown) and
     * secondsToFull is -1 when unknown. [charging] is true only while the battery is really taking charge; a phone
     * holding at its charge limit is plugged in but not charging. Numbers never follow the device locale.
     */
    fun script(level: Int, scale: Int, charging: Boolean, chargeTimeMs: Long, pluggedIn: Boolean, source: String = "", speed: String = ""): String {
        val fraction = if (level >= 0 && scale > 0) {
            String.format(Locale.ROOT, "%.2f", level.toDouble() / scale)
        } else {
            "-1"
        }
        val seconds = if (chargeTimeMs > 0) chargeTimeMs / 1000 else -1L
        return "window.setBattery($fraction,$charging,$seconds,$pluggedIn,\"$source\",\"$speed\")"
    }

    /** What the phone is plugged into, from BatteryManager's EXTRA_PLUGGED bits: "ac", "usb", "wireless", "dock" or "". */
    fun sourceName(plugged: Int): String = when {
        plugged and 4 != 0 -> "wireless"   // PLUGGED_WIRELESS
        plugged and 1 != 0 -> "ac"         // PLUGGED_AC
        plugged and 2 != 0 -> "usb"        // PLUGGED_USB
        plugged and 8 != 0 -> "dock"       // PLUGGED_DOCK
        else -> ""
    }

    /** Android's default charger voltage when the charger does not report one: 5 V, in microvolts. */
    const val DEFAULT_CHARGER_MICROVOLTS = 5_000_000

    /**
     * "fast", "normal", "slow" or "" (unknown), decided the way Android's own lock screen decides between "Charging
     * rapidly" and "Charging slowly": the charger's rated maximum current (microamps) times its voltage (microvolts, 5 V
     * when it does not say), compared with the system's slow and fast thresholds in microwatts.
     */
    fun speedName(maxMicroAmps: Int, maxMicroVolts: Int, slowMicroWatts: Long, fastMicroWatts: Long): String {
        if (maxMicroAmps <= 0) return ""
        val volts = if (maxMicroVolts > 0) maxMicroVolts else DEFAULT_CHARGER_MICROVOLTS
        val microWatts = (maxMicroAmps / 1000L) * (volts / 1000L)
        return when {
            microWatts < slowMicroWatts -> "slow"
            microWatts > fastMicroWatts -> "fast"
            else -> "normal"
        }
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
