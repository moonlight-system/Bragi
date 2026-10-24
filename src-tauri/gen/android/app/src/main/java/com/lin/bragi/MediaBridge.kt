package com.lin.bragi

import android.content.Context
import android.webkit.JavascriptInterface
import android.graphics.Color

// exposed to the web page as `window.BragiMedia`
class MediaBridge(private val ctx: Context) {
    @JavascriptInterface
    fun update(title: String, artist: String, playing: Boolean, posMs: Double, durMs: Double) {
        MediaPlaybackService.update(ctx, title, artist, playing, posMs.toLong(), durMs.toLong())
    }

    @JavascriptInterface
    fun stop() {
        MediaPlaybackService.stop(ctx)
    }

    @JavascriptInterface
    fun setColor(hex: String) {
        try {
            MediaPlaybackService.themeColor = Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            // ignore a malformed color, keep the previous one
        }
    }

    @JavascriptInterface
    fun setAccent(hex: String) {
        try {
            MediaPlaybackService.accentColor = Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
        }
    }
}