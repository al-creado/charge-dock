package app.chargedock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Resources
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView

/** Watches the battery while the dock is showing and pushes each reading into the page. */
class BatteryFeed(private val context: Context, private val webView: WebView) {
    private var registered = false
    private var pageLoaded = false
    private var latest: String? = null
    private var latestDetails: String? = null

    private companion object {
        const val DEFAULT_SLOW_MICROWATTS = 4_000_000L    // Android's defaults, used only if the phone does not say
        const val DEFAULT_FAST_MICROWATTS = 10_000_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var lastIntent: Intent? = null
    // The battery broadcast only fires when the level or temperature changes, but charging power moves more often.
    private val refresh = object : Runnable {
        override fun run() {
            lastIntent?.let { push(it) }
            if (registered) handler.postDelayed(this, 30_000L)
        }
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = push(intent)
    }

    fun start() {
        if (registered) return
        // The battery broadcast is sticky: registering returns the current reading straight away.
        val current = context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        registered = true
        current?.let { push(it) }
        handler.postDelayed(refresh, 30_000L)
    }

    fun stop() {
        if (!registered) return
        context.unregisterReceiver(receiver)
        registered = false
        handler.removeCallbacks(refresh)
    }

    /** Called when the page has loaded: sends the latest reading, which may have arrived earlier. */
    fun onPageLoaded() {
        pageLoaded = true
        latest?.let { webView.evaluateJavascript(it, null) }
        latestDetails?.let { webView.evaluateJavascript(it, null) }
    }

    /** One of Android's own charging-speed thresholds (microwatts), or [fallback] if this phone does not define it. */
    private fun systemThreshold(name: String, fallback: Long): Long {
        val resources = Resources.getSystem()
        val id = resources.getIdentifier(name, "integer", "android")
        return if (id != 0) resources.getInteger(id).toLong() else fallback
    }

    private fun push(intent: Intent) {
        lastIntent = intent
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
        // The same inputs and thresholds the phone's lock screen uses for "Charging rapidly" and "Charging slowly".
        // The two extras are not in the public SDK, so they are read by their names.
        val speed = if (charging && pluggedIn) {
            BatteryJs.speedName(
                intent.getIntExtra("max_charging_current", -1),
                intent.getIntExtra("max_charging_voltage", -1),
                systemThreshold("config_chargingSlowlyThreshold", DEFAULT_SLOW_MICROWATTS),
                systemThreshold("config_chargingFastThreshold", DEFAULT_FAST_MICROWATTS),
            )
        } else {
            ""
        }
        val script = BatteryJs.script(level, scale, charging, chargeTimeMs, pluggedIn, BatteryJs.sourceName(plugged), speed)
        val temperature = if (intent.hasExtra(BatteryManager.EXTRA_TEMPERATURE)) intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) else null
        val details = BatteryJs.detailsScript(
            temperature,
            intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0),
            intent.getIntExtra(BatteryManager.EXTRA_HEALTH, 0),
        )
        latest = script
        latestDetails = details
        if (pageLoaded) {
            webView.evaluateJavascript(script, null)
            webView.evaluateJavascript(details, null)
        }
    }
}
