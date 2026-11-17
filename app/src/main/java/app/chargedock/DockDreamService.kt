package app.chargedock

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.service.dreams.DreamService
import android.webkit.WebView

/** The screen saver: Android starts this while the phone is charging and the screen would go idle. */
class DockDreamService : DreamService() {
    private var webView: WebView? = null
    private var feed: BatteryFeed? = null

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
            onPageLoaded = { feed?.onPageLoaded() },
            onExit = { finish() },
            onRenderGone = { finish() },
        )
        webView = view
        feed = BatteryFeed(this, view)
        setContentView(view)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        webView?.let { DockWebViewFactory.reportTheme(it, newConfig.uiMode) }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        feed?.start()
    }

    override fun onDreamingStopped() {
        feed?.stop()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        webView?.destroy()
        webView = null
        feed = null
        super.onDetachedFromWindow()
    }
}
