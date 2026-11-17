package app.chargedock

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/** What the app's front page (setup.html) can ask of the app. Exposed to that page as `SetupHost`. */
class SetupHost(
    private val onOpenDock: () -> Unit,
    private val onOpenScreenSaverSettings: () -> Unit,
    private val onOpenNotificationAccess: () -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun openDock() { main.post(onOpenDock) }

    @JavascriptInterface
    fun openScreenSaverSettings() { main.post(onOpenScreenSaverSettings) }

    @JavascriptInterface
    fun openNotificationAccess() { main.post(onOpenNotificationAccess) }
}
