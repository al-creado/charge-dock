package app.chargedock

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Counts the notifications currently showing, per app. It reads only which app posted each one:
 * titles and message text are never looked at.
 */
class DockNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() = refresh()

    override fun onListenerDisconnected() = NotificationHub.update(emptyList())

    override fun onNotificationPosted(sbn: StatusBarNotification?) = refresh()

    override fun onNotificationRemoved(sbn: StatusBarNotification?) = refresh()

    private fun refresh() {
        val active = try { activeNotifications } catch (e: SecurityException) { null } ?: return
        val labels = active.filter(::counts).map { appLabel(it.packageName) }
        NotificationHub.update(NotificationCounts.fromLabels(labels))
    }

    // Skip ongoing ones (music, downloads), group summaries (they repeat the children), and our own.
    private fun counts(sbn: StatusBarNotification): Boolean =
        !sbn.isOngoing &&
            sbn.packageName != packageName &&
            (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) == 0

    private fun appLabel(pkg: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg
    }
}
