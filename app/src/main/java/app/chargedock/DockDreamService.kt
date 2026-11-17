package app.chargedock

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
        val view = DockWebViewFactory.create(this) { feed?.onPageLoaded() }
        view.setOnLongClickListener { finish(); true }
        webView = view
        feed = BatteryFeed(this, view)
        setContentView(view)
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
