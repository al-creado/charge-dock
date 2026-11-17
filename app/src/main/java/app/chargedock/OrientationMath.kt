package app.chargedock

/**
 * How far to turn the dock so it is upright for the person holding the phone, even when Android keeps the screen saver's
 * window in portrait.
 */
object OrientationMath {
    /**
     * The phone's tilt as [android.view.OrientationEventListener] reports it (0..359, clockwise from upright),
     * snapped to 0, 90, 180 or 270.
     */
    fun snap(deviceAngle: Int): Int = when (((deviceAngle % 360) + 360) % 360) {
        in 45..134 -> 90
        in 135..224 -> 180
        in 225..314 -> 270
        else -> 0
    }

    /**
     * Degrees (clockwise) to turn the content: -90, 0, 90 or 180. [displayRotation] is the window's current
     * Surface.ROTATION_* (0..3). When the system already rotates the window to match the phone, the answer is 0.
     */
    fun contentRotation(displayRotation: Int, deviceAngle: Int): Int {
        val raw = (((displayRotation * 90 - snap(deviceAngle)) % 360) + 360) % 360
        return if (raw == 270) -90 else raw
    }
}
