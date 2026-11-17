package app.chargedock

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/** Builds the WebView that hosts the dock page from the app's bundled assets. */
object DockWebViewFactory {
    const val DOCK_URL = "https://appassets.androidplatform.net/assets/index.html"

    /** [onPageLoaded] runs each time the page finishes loading. */
    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, onPageLoaded: () -> Unit): WebView {
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
                    val night = ThemeJs.isNight(view.context.resources.configuration.uiMode)
                    view.evaluateJavascript(ThemeJs.script(night), null)
                    onPageLoaded()
                }
            }
            loadUrl(DOCK_URL)
        }
    }
}
