package app.chargedock

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout

/**
 * Holds one view and can turn it by a quarter turn. For 90 and -90 the view is given the screen's height as its
 * width and the other way round, so the page inside sees a landscape screen on a portrait window and vice versa.
 */
class OrientationLayout(context: Context) : FrameLayout(context) {
    private var content: View? = null
    private var degrees = 0

    fun setContent(view: View) {
        content?.let { removeView(it) }
        content = view
        addView(view)
        apply()
    }

    fun setContentRotation(newDegrees: Int) {
        if (newDegrees == degrees) return
        degrees = newDegrees
        apply()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        apply()
    }

    private fun apply() {
        val view = content ?: return
        if (width == 0 || height == 0) return
        val sideways = degrees == 90 || degrees == -90
        val params = (view.layoutParams as? LayoutParams) ?: LayoutParams(0, 0)
        params.width = if (sideways) height else width
        params.height = if (sideways) width else height
        params.gravity = Gravity.CENTER
        view.layoutParams = params
        view.rotation = degrees.toFloat()   // turns about the view's centre, which is the layout's centre
    }
}
