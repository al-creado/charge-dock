package app.chargedock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.webkit.WebView

/** Watches the battery while the dock is showing and pushes each reading into the page. */
class BatteryFeed(private val context: Context, private val webView: WebView) {
    private var registered = false
    private var pageLoaded = false
    private var latest: String? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = push(intent)
    }

    fun start() {
        if (registered) return
        // The battery broadcast is sticky: registering returns the current reading straight away.
        val current = context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        registered = true
        current?.let { push(it) }
    }

    fun stop() {
        if (!registered) return
        context.unregisterReceiver(receiver)
        registered = false
    }

    /** Called when the page has loaded: sends the latest reading, which may have arrived earlier. */
    fun onPageLoaded() {
        pageLoaded = true
        latest?.let { webView.evaluateJavascript(it, null) }
    }

    private fun push(intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        // Really taking charge only. A phone held at its charge limit is plugged in but reports "not charging".
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        val pluggedIn = plugged != 0
        val chargeTimeMs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            (context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager).computeChargeTimeRemaining()
        } else {
            -1L
        }
        val script = BatteryJs.script(level, scale, charging, chargeTimeMs, pluggedIn)
        latest = script
        if (pageLoaded) webView.evaluateJavascript(script, null)
    }
}
