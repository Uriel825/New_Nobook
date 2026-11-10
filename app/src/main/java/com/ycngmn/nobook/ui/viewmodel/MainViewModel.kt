package com.ycngmn.nobook.ui.viewmodel

import android.content.res.Resources
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ycngmn.nobook.R
import com.ycngmn.nobook.utils.Script
import com.ycngmn.nobook.utils.buildScriptBundle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext


class MainViewModel(
    resources: Resources,
    settings: SettingsViewModel
): ViewModel() {

    private val _themeColor = mutableStateOf(Color.Transparent)
    val themeColor: State<Color> = _themeColor

    private val _scripts = mutableStateOf<String?>(null)
    val scripts: State<String?> = _scripts

    init {
        loadScripts(
            resources,
            settings
        )
    }

    fun setThemeColor(color: Color) {
        _themeColor.value = color
    }

    private fun loadScripts(
        resources: Resources,
        settings: SettingsViewModel
    ) {
        val scripts = listOf(
            Script(true, R.raw.scripts), // always apply
            Script(true, R.raw.cdn_fallback), // retry stuck images/videos on the sibling CDN node
            Script(true, R.raw.nav_debug), // TEMPORARY diagnostic
            Script(settings.removeAds.value, R.raw.adblock),
            Script(settings.enableDownloadContent.value, R.raw.download_content),
            Script(settings.enableCopyToClipboard.value, R.raw.copy_to_clipboard),
            Script(settings.stickyNavbar.value, R.raw.sticky_navbar),
            Script(!settings.pinchToZoom.value, R.raw.pinch_to_zoom),
            Script(settings.amoledBlack.value, R.raw.amoled_black),
            Script(settings.hideSuggested.value, R.raw.hide_suggested),
            Script(settings.hideReels.value, R.raw.hide_reels),
            Script(settings.hideStories.value, R.raw.hide_stories),
            Script(settings.hidePeopleYouMayKnow.value, R.raw.hide_pymk),
            Script(settings.hideGroups.value, R.raw.hide_groups)
        )

        viewModelScope.launch {
            _scripts.value = withContext(Dispatchers.IO) {
                val bundle = buildScriptBundle(scripts) { resId ->
                    resources.openRawResource(resId).bufferedReader()
                        .use { it.readText() }
                }
                // TEMPORARY diagnostic: lets the report list which scripts ran.
                val active = scripts
                    .filter { it.isEnabled }
                    .joinToString(",") { "\"" + resources.getResourceEntryName(it.resourceId) + "\"" }
                "window.__nbActive=[$active];\n$bundle"
            }
        }
    }

    fun refresh(
        resources: Resources,
        settings: SettingsViewModel
    ) {
        clearScripts()
        loadScripts(resources, settings)
    }

    private fun clearScripts() {
        _scripts.value = null
    }
}
