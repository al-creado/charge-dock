package app.chargedock

/** How many notifications one app has showing. Only the app's name and a count: never message text. */
data class AppCount(val app: String, val count: Int)

object NotificationCounts {
    /** One label per notification in, one row per app out (first-seen order). Blank labels become "Other". */
    fun fromLabels(labels: List<String>): List<AppCount> =
        labels.map { it.trim().ifEmpty { "Other" } }
            .groupingBy { it }
            .eachCount()
            .map { AppCount(it.key, it.value) }
}
