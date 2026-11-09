package com.ycngmn.nobook.utils.jsBridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * TEMPORARY diagnostic: shows a short on-screen message each time the page
 * navigates, to tell full page loads apart from in-page (history) navigation.
 */
class NavDebugBridge(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())

    // JavascriptInterface methods run on a background thread; Toasts need the
    // main thread.
    @JavascriptInterface
    fun log(message: String) {
        handler.post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}
