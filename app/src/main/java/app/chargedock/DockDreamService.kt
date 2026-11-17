package app.chargedock

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.content.Context
import android.service.dreams.DreamService
import android.view.OrientationEventListener
import android.view.WindowManager
import android.webkit.WebView

/** The screen saver: Android starts this while the phone is charging and the screen would go idle. */
class DockDreamService : DreamService() {
    private var webView: WebView? = null
    private var battery: BatteryFeed? = null
    private var notifications: NotificationFeed? = null
    private var layout: OrientationLayout? = null
    private var tilt: OrientationEventListener? = null
    private var lastAngle = 0

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = true   // taps reach the page (Night, Dim, Settings)
        isFullscreen = true
        // Ask Android to follow the sensor. It often ignores this for screen savers, so the dock also turns itself below.
        window?.let { w ->
            val attrs = w.attributes
            attrs.screenOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
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
        // Turn the dock to match how the phone is actually held, whatever orientation Android gave the window.
        val holder = OrientationLayout(this).also { it.setContent(view) }
        layout = holder
        tilt = object : OrientationEventListener(this) {
            override fun onOrientationChanged(orientation: Int) {
                if (orientation == ORIENTATION_UNKNOWN) return   // lying flat: keep the last orientation
                lastAngle = orientation
                turnToMatchPhone()
            }
        }
        setContentView(holder)
    }

    private fun turnToMatchPhone() {
        @Suppress("DEPRECATION")
        val rotation = (getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
        layout?.setContentRotation(OrientationMath.contentRotation(rotation, lastAngle))
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        turnToMatchPhone()
        webView?.let { DockWebViewFactory.reportTheme(it, newConfig.uiMode) }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        battery?.start()
        notifications?.start()
        tilt?.takeIf { it.canDetectOrientation() }?.enable()
    }

    override fun onDreamingStopped() {
        tilt?.disable()
        battery?.stop()
        notifications?.stop()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        webView?.destroy()
        webView = null
        layout = null
        tilt = null
        battery = null
        notifications = null
        super.onDetachedFromWindow()
    }
}
