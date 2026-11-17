package app.chargedock

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.WebView
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/** The app's front page: a styled web page (setup.html) with buttons for opening the dock and the system settings. */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pageLoaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        val host = SetupHost(
            onOpenDock = { startActivity(Intent(this, DockActivity::class.java)) },
            onOpenScreenSaverSettings = ::openDreamSettings,
            onOpenNotificationAccess = ::openNotificationAccess,
        )
        webView = DockWebViewFactory.createSetup(
            this,
            host,
            onPageLoaded = { pageLoaded = true; reportAccess() },
            onRenderGone = { recreate() },
        )
        setContentView(webView)
        // Android 15 draws apps edge to edge, so push the page below the status bar and camera and above the
        // navigation bar. The padding goes on the activity's root view, which is where insets are delivered.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { root, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            root.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    // Coming back from the system settings: show whether notification access is now on.
    override fun onResume() {
        super.onResume()
        if (pageLoaded) reportAccess()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun reportAccess() {
        val granted = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)
        webView.evaluateJavascript(NotificationJs.accessScript(granted), null)
    }

    /** Opens the system screen saver page; some phones hide it, so fall back to Display settings. */
    private fun openDreamSettings() {
        try {
            startActivity(Intent(Settings.ACTION_DREAM_SETTINGS))
        } catch (e: ActivityNotFoundException) {
            try {
                startActivity(Intent(Settings.ACTION_DISPLAY_SETTINGS))
            } catch (e2: ActivityNotFoundException) {
                Toast.makeText(this, R.string.setup_missing, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openNotificationAccess() {
        try {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.notif_missing, Toast.LENGTH_LONG).show()
        }
    }
}
