package app.chargedock

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.webkit.WebView

/** While the dock is showing, keeps the page's Next alarm tile up to date. Needs no permission. */
class AlarmFeed(private val context: Context, private val webView: WebView) {
    private var registered = false
    private var pageLoaded = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = push()
    }

    fun start() {
        if (registered) return
        context.registerReceiver(receiver, IntentFilter(AlarmManager.ACTION_NEXT_ALARM_CLOCK_CHANGED))
        registered = true
        push()
    }

    fun stop() {
        if (!registered) return
        context.unregisterReceiver(receiver)
        registered = false
    }

    fun onPageLoaded() {
        pageLoaded = true
        push()
    }

    private fun push() {
        if (!pageLoaded) return
        val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        webView.evaluateJavascript(AlarmJs.script(alarms.nextAlarmClock?.triggerTime), null)
    }
}
