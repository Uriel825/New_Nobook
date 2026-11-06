package com.ycngmn.nobook.utils

import androidx.annotation.RawRes

data class Script(
    val isEnabled: Boolean,
    @param:RawRes val resourceId: Int
)

/**
 * Builds the single JavaScript bundle injected into the page.
 * (The file keeps its old name so the change applies cleanly as a patch; it no
 * longer fetches anything.)
 *
 * Scripts are read from the app's own resources (res/raw) instead of being
 * downloaded from GitHub at every launch: there is no network wait before the
 * splash screen goes away, and the code running inside the WebView (which has
 * access to the JS bridges) is exactly the code that shipped in the APK.
 */
fun buildScriptBundle(
    scripts: List<Script>,
    readRaw: (Int) -> String
): String {
    val body = scripts
        .filter { it.isEnabled }
        .joinToString(separator = "\n;\n") { readRaw(it.resourceId) }

    // Guard: evaluating the bundle twice in the same document must not stack
    // a second set of observers and listeners.
    return "(function() {\n" +
        "if (window.__nobookInjected) return;\n" +
        "window.__nobookInjected = true;\n" +
        body +
        "\n})();"
}
