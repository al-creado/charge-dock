package app.chargedock

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/** The dock as a normal full-screen activity: the preview, and the fallback if the screen saver is unavailable. */
class DockActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var feed: BatteryFeed

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView = DockWebViewFactory.create(this) { feed.onPageLoaded() }
        feed = BatteryFeed(this, webView)
        webView.setOnLongClickListener { finish(); true }
        setContentView(webView)
        hideSystemBars()
    }

    override fun onStart() {
        super.onStart()
        feed.start()
    }

    override fun onStop() {
        feed.stop()
        super.onStop()
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
