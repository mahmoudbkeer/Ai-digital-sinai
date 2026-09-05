package com.aidigitalsinai

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val message = TextView(this).apply {
            text = "AI Digital Sinai diagnostic APK"
            textSize = 20f
            setPadding(32, 32, 32, 32)
        }
        setContentView(message)
    }
}
