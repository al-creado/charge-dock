package app.chargedock

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/** The only thing the dock page can ask of the app: leave the dock. Exposed to the page as `DockHost`. */
class DockHost(private val onExit: () -> Unit) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun exit() {
        main.post(onExit)
    }
}
