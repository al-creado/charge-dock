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

/** Builds the WebView that hosts the dock page from the app's bundled assets. */
object DockWebViewFactory {
    const val DOCK_URL = "https://appassets.androidplatform.net/assets/index.html"

    /** Tells the page whether the phone is in dark mode (for the Device theme setting). */
    fun reportTheme(webView: WebView, uiMode: Int) {
        webView.evaluateJavascript(ThemeJs.script(ThemeJs.isNight(uiMode)), null)
    }

    /**
     * [onPageLoaded] runs each time the page finishes loading. [onExit] runs when the page asks to leave the
     * dock. [onRenderGone] runs if Android kills the WebView's renderer process; the caller must rebuild or finish.
     */
    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, onPageLoaded: () -> Unit, onExit: () -> Unit, onRenderGone: () -> Unit): WebView {
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

                // The dock never navigates away from its own page.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = true

                override fun onPageFinished(view: WebView, url: String) {
                    reportTheme(view, view.context.resources.configuration.uiMode)
                    onPageLoaded()
                }

                // Without this, losing the renderer process kills the whole app.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    onRenderGone()
                    return true
                }
            }
            addJavascriptInterface(DockHost(onExit), "DockHost")
            loadUrl(DOCK_URL)
        }
    }
}
