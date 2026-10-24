package com.lin.bragi

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  // latest system-bar sizes in CSS pixels, read by the page through BragiNative.insets()
  private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"

  // tells the page whether the user granted the permission
  private val permissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      webView?.post {
        webView?.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('bragi-permission', { detail: $granted }))", null
        )
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val d = resources.displayMetrics.density   // px -> CSS px
      insetsJson = "{\"top\":${bars.top / d},\"right\":${bars.right / d},\"bottom\":${bars.bottom / d},\"left\":${bars.left / d}}"
      // tells an already-loaded page (rotation, nav mode change...)
      webView?.post {
        webView?.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('bragi-insets', { detail: $insetsJson }))", null
        )
      }
      ViewCompat.onApplyWindowInsets(view, insets)
    }

    // Android 13+: the notification only shows if the user allows it
    if (Build.VERSION.SDK_INT >= 33 &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    // notification buttons -> JS
    MediaPlaybackService.onCommand = { cmd, arg ->
      runOnUiThread {
        webView?.evaluateJavascript("window.__bragiMedia && window.__bragiMedia('$cmd', $arg)", null)
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(MediaBridge(applicationContext), "BragiMedia")
    webView.addJavascriptInterface(
      BragiBridge(this, { insetsJson }) { permission -> runOnUiThread { permissionLauncher.launch(permission) } },
      "BragiNative"
    )
  }

  override fun onDestroy() {
    MediaPlaybackService.onCommand = null
    super.onDestroy()
  }
}