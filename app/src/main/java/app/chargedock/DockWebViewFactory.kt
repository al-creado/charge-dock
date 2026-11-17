package app.chargedock

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.View
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/** Builds the WebViews that host the app's pages from its bundled assets. */
object DockWebViewFactory {
    private const val ORIGIN = "https://appassets.androidplatform.net/assets/"
    const val DOCK_URL = ORIGIN + "index.html"
    const val SETUP_URL = ORIGIN + "setup.html"

    /** Tells the dock page whether the phone is in dark mode (for the Device theme setting). */
    fun reportTheme(webView: WebView, uiMode: Int) {
        webView.evaluateJavascript(ThemeJs.script(ThemeJs.isNight(uiMode)), null)
    }

    /**
     * The dock page. [onPageLoaded] runs each time it finishes loading. [onExit] runs when the page asks to leave
     * the dock. [onRenderGone] runs if Android kills the WebView's renderer process; the caller must rebuild or finish.
     */
    fun create(context: Context, onPageLoaded: () -> Unit, onExit: () -> Unit, onRenderGone: () -> Unit): WebView =
        build(context, DOCK_URL, "DockHost", DockHost(onExit), true, onPageLoaded, onRenderGone)

    /** The app's front page, with [host] available to it as `SetupHost`. */
    fun createSetup(context: Context, host: SetupHost, onPageLoaded: () -> Unit, onRenderGone: () -> Unit): WebView =
        build(context, SETUP_URL, "SetupHost", host, false, onPageLoaded, onRenderGone)

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun build(
        context: Context,
        url: String,
        bridgeName: String,
        bridge: Any,
        reportsTheme: Boolean,
        onPageLoaded: () -> Unit,
        onRenderGone: () -> Unit,
    ): WebView {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
        return WebView(context).apply {
            setBackgroundColor(Color.BLACK)
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                textZoom = 100
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                // The app never navigates away from its own pages.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = true

                override fun onPageFinished(view: WebView, url: String) {
                    if (reportsTheme) reportTheme(view, view.context.resources.configuration.uiMode)
                    onPageLoaded()
                }

                // Without this, losing the renderer process kills the whole app.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    onRenderGone()
                    return true
                }
            }
            addJavascriptInterface(bridge, bridgeName)
            loadUrl(url)
        }
    }
}
