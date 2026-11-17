package app.chargedock

/** Builds the JavaScript calls that hand notification counts and the access state to the dock page. */
object NotificationJs {
    fun script(items: List<AppCount>): String =
        "window.setNotifications([" +
            items.joinToString(",") { "{\"app\":${quote(it.app)},\"count\":${it.count}}" } +
            "])"

    fun accessScript(granted: Boolean): String = "window.setNotificationAccess($granted)"

    /** A JSON string literal. U+2028 and U+2029 are escaped too, since JavaScript treats them as line breaks. */
    private fun quote(s: String): String {
        val out = StringBuilder("\"")
        for (c in s) {
            when {
                c == '"' -> out.append("\\\"")
                c == '\\' -> out.append("\\\\")
                c == '\n' -> out.append("\\n")
                c == '\r' -> out.append("\\r")
                c == '\t' -> out.append("\\t")
                c < ' ' || c == ' ' || c == ' ' -> out.append("\\u").append(c.code.toString(16).padStart(4, '0'))
                else -> out.append(c)
            }
        }
        return out.append('"').toString()
    }
}
