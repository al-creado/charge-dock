package app.chargedock

import android.app.Activity
import android.content.res.Configuration
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/** The dock as a normal full-screen activity: opened from the app, charging or not. */
class DockActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var battery: BatteryFeed
    private lateinit var notifications: NotificationFeed

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView = DockWebViewFactory.create(
            this,
            onPageLoaded = { battery.onPageLoaded(); notifications.onPageLoaded() },
            onExit = { finish() },
            onRenderGone = { recreate() },
        )
        battery = BatteryFeed(this, webView)
        notifications = NotificationFeed(this, webView)
        setContentView(webView)
        hideSystemBars()
    }

    override fun onStart() {
        super.onStart()
        battery.start()
        notifications.start()
    }

    override fun onStop() {
        battery.stop()
        notifications.stop()
        super.onStop()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        DockWebViewFactory.reportTheme(webView, newConfig.uiMode)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}
