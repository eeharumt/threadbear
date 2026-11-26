package io.github.eeharumt.threadbear.tauri

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val content = findViewById<View>(android.R.id.content)
        val reserved = WindowInsetsCompat.Type.systemBars() or
            WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val padding = insets.getInsets(reserved)
            view.setPadding(padding.left, padding.top, padding.right, padding.bottom)
            WindowInsetsCompat.Builder(insets).setInsets(reserved, Insets.NONE).build()
        }
        ViewCompat.requestApplyInsets(content)
    }

    // Dictation for the page, which a WebView has none of (Dictation.kt).
    override fun onWebViewCreate(webView: WebView) {
        webView.addJavascriptInterface(Dictation(this, webView), "threadbearDictation")
    }
}
