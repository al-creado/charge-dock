package app.chargedock

/** Builds the JavaScript call that hands the phone's next alarm to the dock page. */
object AlarmJs {
    /** `window.setNextAlarm(epochMillis)`, or `null` when there is no alarm. */
    fun script(triggerMillis: Long?): String =
        "window.setNextAlarm(${if (triggerMillis != null && triggerMillis > 0) triggerMillis.toString() else "null"})"
}
