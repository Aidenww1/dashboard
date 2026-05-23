package com.dashboard.healthbridge

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1a1a2e"))
            setPadding(64, 64, 64, 64)
        }
        val text = TextView(this).apply {
            text = "Health Bridge reads your Samsung Health data — steps, heart rate, sleep, calories, weight, SpO2, and exercise — to display it on your personal dashboard.\n\nNo data leaves your phone."
            setTextColor(Color.WHITE)
            textSize = 16f
        }
        layout.addView(text)
        setContentView(layout)
    }
}
