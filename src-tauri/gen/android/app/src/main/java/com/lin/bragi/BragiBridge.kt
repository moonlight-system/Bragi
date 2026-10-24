package com.lin.bragi

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileOutputStream
import android.os.Environment
import java.io.File
import java.io.FileInputStream
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import java.net.HttpURLConnection
import java.net.URL

class BragiBridge(
    private val context: Context,
    private val getInsets: () -> String,
    private val requestPermission: (String) -> Unit,
) {
    private val permission =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

    private val collection =
        if (Build.VERSION.SDK_INT >= 29) MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    
    private val filesCollection = MediaStore.Files.getContentUri("external")

    private val audioExts = listOf("mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "weba")

    @JavascriptInterface
    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    // system-bar sizes in CSS pixels, as JSON
    @JavascriptInterface
    fun insets(): String = getInsets()

    @JavascriptInterface
    fun askPermission() = requestPermission(permission)

    // every mp3 / m4a on the device, as a JSON array
    @JavascriptInterface
    fun listMp3(): String {
        val result = JSONArray()
        val seen = HashSet<String>()
        val seenNames = HashSet<String>()

        // 1- the audio index: has titles and artists
        try {
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
            )
            context.contentResolver.query(collection, projection, null, null, null)?.use { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val fileCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                while (c.moveToNext()) {
                    val id = c.getLong(idCol).toString()
                    val rawName = c.getString(fileCol) ?: ""
                    val title = c.getString(titleCol)?.trim().orEmpty()
                    val artist = c.getString(artistCol)?.trim().orEmpty()
                    seen.add(id)
                    seenNames.add(rawName.lowercase())
                    result.put(JSONObject().apply {
                        put("id", id)
                        put("name", if (title.isNotEmpty()) title else rawName.substringBeforeLast('.', rawName))
                        put("ext", rawName.substringAfterLast('.', "").lowercase().ifEmpty { "mp3" })
                        put("artist", if (artist.isEmpty() || artist == "<unknown>") JSONObject.NULL else artist)
                    })
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Bragi", "audio query failed", e)
        }

        // 2- audio files the scanner filed elsewhere (e.g. m4a indexed as video): names only
        try {
            val selection = audioExts.joinToString(" OR ") { "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?" }
            val args = audioExts.map { "%.$it" }.toTypedArray()
            context.contentResolver.query(
                filesCollection,
                arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME),
                selection, args, null,
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0).toString()
                    if (!seen.add(id)) continue   // already listed by the audio query
                    val rawName = c.getString(1) ?: continue
                    seenNames.add(rawName.lowercase())
                    result.put(JSONObject().apply {
                        put("id", id)
                        put("name", rawName.substringBeforeLast('.', rawName))
                        put("ext", rawName.substringAfterLast('.', "").lowercase().ifEmpty { "mp3" })
                        put("artist", JSONObject.NULL)
                    })
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Bragi", "files query failed", e)
        }

        scanStorage(result, seenNames)

        return result.toString()
    }

    // "idle", "downloading:NN", "installing" or "error:...", polled by the page
    @Volatile private var updateState = "idle"

    @JavascriptInterface
    fun appVersion(): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
    } catch (e: Exception) { "" }

    // Android 8+ makes the user allow "install unknown apps" for Bragi once
    @JavascriptInterface
    fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    @JavascriptInterface
    fun askInstallPermission() {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    @JavascriptInterface
    fun updateStatus(): String = updateState

    // downloads the APK on a background thread, then opens the system installer
    @JavascriptInterface
    fun downloadUpdate(url: String) {
        if (updateState.startsWith("downloading")) return
        updateState = "downloading:0"
        Thread {
            try {
                val file = File(context.cacheDir, "update.apk")
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                val total = conn.contentLength.toLong()
                conn.inputStream.use { input ->
                    FileOutputStream(file).use { out ->
                        val buf = ByteArray(64 * 1024)
                        var done = 0L
                        var n = 0
                        var lastPct = -1
                        while (input.read(buf).also { n = it } != -1) {
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) { lastPct = pct; updateState = "downloading:$pct" }
                            }
                        }
                    }
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                updateState = "installing"
                context.startActivity(
                    Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e: Exception) {
                android.util.Log.e("Bragi", "update failed", e)
                updateState = "error:${e.message}"
            }
        }.start()
    }

    // copies one file straight to destPath, without passing its bytes through JS
    @JavascriptInterface
    fun copyMp3(id: String, destPath: String): Boolean = try {
        val input = if (id.startsWith("file:")) FileInputStream(File(id.removePrefix("file:")))
                    else context.contentResolver.openInputStream(
                        ContentUris.withAppendedId(filesCollection, id.toLong()))
        input?.use { i -> FileOutputStream(destPath).use { o -> i.copyTo(o) } } != null
    } catch (e: Exception) {
        android.util.Log.e("Bragi", "copyMp3 failed", e)
        false
    }

    // walks a directory tree by path, adding audio files that MediaStore didn't list
    private fun walk(dir: File, out: JSONArray, seenNames: MutableSet<String>, depth: Int = 0) {
        if (depth > 12) return   // protects against symlink loops
        val children = dir.listFiles() ?: return
        for (f in children) {
            if (f.name.startsWith(".")) continue   // hidden folders and thumbnails
            if (f.isDirectory) {
                if (depth == 0 && f.name == "Android") continue   // other apps' private data
                walk(f, out, seenNames, depth + 1)
                continue
            }
            val ext = f.extension.lowercase()
            if (ext !in audioExts) continue
            if (!seenNames.add(f.name.lowercase())) continue   // MediaStore already found it
            out.put(JSONObject().apply {
                put("id", "file:${f.absolutePath}")
                put("name", f.nameWithoutExtension)
                put("ext", ext)
                put("artist", JSONObject.NULL)
            })
        }
    }

    private fun scanStorage(out: JSONArray, seenNames: MutableSet<String>) {
        try {
            walk(Environment.getExternalStorageDirectory(), out, seenNames)
            // SD cards and USB drives are mounted under /storage/<id>
            File("/storage").listFiles()?.forEach {
                if (it.isDirectory && it.name != "emulated" && it.name != "self") walk(it, out, seenNames)
            }
        } catch (e: Exception) {
            android.util.Log.e("Bragi", "storage scan failed", e)
        }
    }
}