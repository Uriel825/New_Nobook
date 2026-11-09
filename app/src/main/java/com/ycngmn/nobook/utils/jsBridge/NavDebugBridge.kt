package com.ycngmn.nobook.utils.jsBridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * TEMPORARY diagnostic: shows a short on-screen message each time the page
 * navigates, and copies the diagnostic report to the clipboard.
 */
class NavDebugBridge(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())

    // JavascriptInterface methods run on a background thread; Toasts and the
    // clipboard need the main thread.
    @JavascriptInterface
    fun log(message: String) {
        handler.post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun copy(text: String) {
        handler.post {
            val clipboard =
                context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("nobook-report", text))
            Toast.makeText(
                context,
                "Informe copiado (${text.length} caracteres)",
                Toast.LENGTH_SHORT
            ).show()
        }
    }
}
