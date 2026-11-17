package app.chargedock

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArraySet

/** Holds the latest notification counts, written by [DockNotificationListener] and read by the dock screens. */
object NotificationHub {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<(List<AppCount>) -> Unit>()

    @Volatile
    var latest: List<AppCount> = emptyList()
        private set

    fun update(items: List<AppCount>) {
        latest = items
        main.post { listeners.forEach { it(items) } }
    }

    fun addListener(listener: (List<AppCount>) -> Unit) { listeners.add(listener) }

    fun removeListener(listener: (List<AppCount>) -> Unit) { listeners.remove(listener) }
}
