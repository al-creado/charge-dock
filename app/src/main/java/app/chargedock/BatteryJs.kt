package app.chargedock

import java.util.Locale

/** Builds the JavaScript call that hands battery readings to the dock page. */
object BatteryJs {
    /**
     * `window.setBattery(level, charging, secondsToFull)` where level is 0..1 (or -1 when unknown)
     * and secondsToFull is -1 when unknown. Numbers never follow the device locale (no decimal commas).
     */
    fun script(level: Int, scale: Int, charging: Boolean, chargeTimeMs: Long): String {
        val fraction = if (level >= 0 && scale > 0) {
            String.format(Locale.ROOT, "%.2f", level.toDouble() / scale)
        } else {
            "-1"
        }
        val seconds = if (chargeTimeMs > 0) chargeTimeMs / 1000 else -1L
        return "window.setBattery($fraction,$charging,$seconds)"
    }
}
