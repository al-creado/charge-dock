package app.chargedock

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.service.dreams.DreamService
import android.webkit.WebView

/** The screen saver: Android starts this while the phone is charging and the screen would go idle. */
class DockDreamService : DreamService() {
    private var webView: WebView? = null
    private var battery: BatteryFeed? = null
    private var notifications: NotificationFeed? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = true   // taps reach the page (Night, Dim, Settings)
        isFullscreen = true
        // Ask for landscape even if the phone's rotation is locked to portrait. Android may or may not honour this for screen savers.
        window?.let { w ->
            val attrs = w.attributes
            attrs.screenOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            w.attributes = attrs
        }
        val view = DockWebViewFactory.create(
            this,
            onPageLoaded = { battery?.onPageLoaded(); notifications?.onPageLoaded() },
            onExit = { finish() },
            onRenderGone = { finish() },
        )
        webView = view
        battery = BatteryFeed(this, view)
        notifications = NotificationFeed(this, view)
        setContentView(view)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        webView?.let { DockWebViewFactory.reportTheme(it, newConfig.uiMode) }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        battery?.start()
        notifications?.start()
    }

    override fun onDreamingStopped() {
        battery?.stop()
        notifications?.stop()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        webView?.destroy()
        webView = null
        battery = null
        notifications = null
        super.onDetachedFromWindow()
    }
}
