package app.chargedock

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** Launcher screen: the app's setup page. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val title = TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val steps = TextView(this).apply {
            text = getString(R.string.setup_steps)
            textSize = 15f
            setTextColor(Color.LTGRAY)
            setPadding(0, pad, 0, pad)
        }
        val preview = Button(this).apply {
            text = getString(R.string.btn_preview)
            setOnClickListener { startActivity(Intent(this@MainActivity, DockActivity::class.java)) }
        }
        val dreamSettings = Button(this).apply {
            text = getString(R.string.btn_dream_settings)
            setOnClickListener { openDreamSettings() }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            setPadding(pad, pad, pad, pad)
            fitsSystemWindows = true
            addView(title)
            addView(steps)
            addView(dreamSettings)
            addView(preview)
        })
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
}
