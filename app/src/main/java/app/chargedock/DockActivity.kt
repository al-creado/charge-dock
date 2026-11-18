package app.chargedock

import android.app.Activity
import android.content.res.Configuration
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/** The dock as a normal full-screen activity: opened from the app, charging or not. */
class DockActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var battery: BatteryFeed
    private lateinit var notifications: NotificationFeed
    private lateinit var alarm: AlarmFeed

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView = DockWebViewFactory.create(
            this,
            onPageLoaded = { battery.onPageLoaded(); notifications.onPageLoaded(); alarm.onPageLoaded() },
            onExit = { finish() },
            onRenderGone = { recreate() },
        )
        battery = BatteryFeed(this, webView)
        notifications = NotificationFeed(this, webView)
        alarm = AlarmFeed(this, webView)
        setContentView(webView)
        hideSystemBars()
        // A swipe up from the bottom edge only brings the hidden navigation bar back (the phone then wants a second swipe
        // to go home). Treat that first swipe as "close": the bar showing again after being hidden means leave the dock.
        var navigationBarWasHidden = false
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            if (!insets.isVisible(WindowInsetsCompat.Type.navigationBars())) navigationBarWasHidden = true
            else if (navigationBarWasHidden) finish()
            ViewCompat.onApplyWindowInsets(view, insets)
        }
    }

    override fun onStart() {
        super.onStart()
        battery.start()
        notifications.start()
        alarm.start()
    }

    override fun onStop() {
        battery.stop()
        notifications.stop()
        alarm.stop()
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
