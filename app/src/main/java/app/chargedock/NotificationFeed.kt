package app.chargedock

import android.content.Context
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat

/** While the dock is showing, keeps the page's Notifications tile up to date. */
class NotificationFeed(private val context: Context, private val webView: WebView) {
    private var started = false
    private var pageLoaded = false
    private val listener: (List<AppCount>) -> Unit = { push() }

    fun start() {
        if (started) return
        started = true
        NotificationHub.addListener(listener)
        push()
    }

    fun stop() {
        if (!started) return
        started = false
        NotificationHub.removeListener(listener)
    }

    fun onPageLoaded() {
        pageLoaded = true
        push()
    }

    private fun push() {
        if (!pageLoaded) return
        val granted = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        webView.evaluateJavascript(NotificationJs.accessScript(granted), null)
        if (granted) webView.evaluateJavascript(NotificationJs.script(NotificationHub.latest), null)
    }
}
