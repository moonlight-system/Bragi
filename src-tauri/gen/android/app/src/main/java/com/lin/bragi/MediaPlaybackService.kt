package com.lin.bragi

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.session.MediaButtonReceiver
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle

class MediaPlaybackService : Service() {

    companion object {
        private const val CHANNEL_ID = "bragi_playback_v2"
        private const val NOTIF_ID = 1

        var instance: MediaPlaybackService? = null
        // set by MainActivity: forwards a command ("play", "next"...) to the JS side
        var onCommand: ((String, Double) -> Unit)? = null

        var themeColor: Int = 0xFF25252B.toInt()
        var accentColor: Int = 0xFF00FF9D.toInt()

        fun update(ctx: Context, title: String, artist: String, playing: Boolean, posMs: Long, durMs: Long) {
            val svc = instance
            if (svc != null) {
                svc.apply(title, artist, playing, posMs, durMs)
            } else {
                val intent = Intent(ctx, MediaPlaybackService::class.java)
                    .putExtra("title", title)
                    .putExtra("artist", artist)
                    .putExtra("playing", playing)
                    .putExtra("pos", posMs)
                    .putExtra("dur", durMs)
                ContextCompat.startForegroundService(ctx, intent)
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, MediaPlaybackService::class.java))
        }
    }

    private lateinit var session: MediaSessionCompat

    private var artCache: Bitmap? = null
    private var artCacheColor = 0
    private var artCacheAccent = 0

    private fun artwork(): Bitmap {
        val cached = artCache
        if (cached != null && artCacheColor == themeColor && artCacheAccent == accentColor) return cached
        val size = 512
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(themeColor)
        // the music-note vector, tinted with the theme accent: this is what Samsung samples
        ContextCompat.getDrawable(this, R.drawable.ic_stat_bragi)?.mutate()?.let {
            it.setTint(accentColor)
            val pad = size / 4
            it.setBounds(pad, pad, size - pad, size - pad)
            it.draw(canvas)
        }
        artCache = bmp
        artCacheColor = themeColor
        artCacheAccent = accentColor
        return bmp
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        if (Build.VERSION.SDK_INT >= 26) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.deleteNotificationChannel("bragi_playback")   // the old silent channel
            val channel = NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_DEFAULT).apply {
                setSound(null, null)       // IMPORTANCE_DEFAULT would otherwise play a sound
                enableVibration(false)
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }
        session = MediaSessionCompat(this, "Bragi").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() { onCommand?.invoke("play", 0.0) }
                override fun onPause() { onCommand?.invoke("pause", 0.0) }
                override fun onSkipToNext() { onCommand?.invoke("next", 0.0) }
                override fun onSkipToPrevious() { onCommand?.invoke("previous", 0.0) }
                override fun onSeekTo(pos: Long) { onCommand?.invoke("seek", pos / 1000.0) }
                override fun onRewind() { onCommand?.invoke("seekby", -10.0) }
                override fun onFastForward() { onCommand?.invoke("seekby", 10.0) }
                override fun onCustomAction(action: String?, extras: Bundle?) {
                    when (action) {
                        "rewind" -> onCommand?.invoke("seekby", -10.0)
                        "forward" -> onCommand?.invoke("seekby", 10.0)
                    }
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.hasExtra("title") == true) {
            apply(
                intent.getStringExtra("title") ?: "",
                intent.getStringExtra("artist") ?: "",
                intent.getBooleanExtra("playing", true),
                intent.getLongExtra("pos", 0),
                intent.getLongExtra("dur", 0),
            )
        } else {
            // a button press from the notification / headset
            MediaButtonReceiver.handleIntent(session, intent)
        }
        return START_NOT_STICKY
    }

    fun apply(title: String, artist: String, playing: Boolean, posMs: Long, durMs: Long) {
        val art = artwork()
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durMs)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art)
                .build()
        )
        val actions = PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_REWIND or PlaybackStateCompat.ACTION_FAST_FORWARD
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(actions)
                .addCustomAction("rewind", "-10s", R.drawable.ic_rewind)
                .addCustomAction("forward", "+10s", R.drawable.ic_forward)
                .setState(
                    if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    posMs,
                    if (playing) 1f else 0f,
                )
                .build()
        )

        val openApp = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bragi)
            .setLargeIcon(art)
            .setColor(themeColor)
            .setColorized(true)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(openApp)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .addAction(
                R.drawable.ic_rewind, "Rewind 10 seconds",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_REWIND)
            )
            .addAction(
                android.R.drawable.ic_media_previous, "Previous",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            )
            .addAction(
                if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (playing) "Pause" else "Play",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY_PAUSE)
            )
            .addAction(
                android.R.drawable.ic_media_next, "Next",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
            )
            .addAction(
                R.drawable.ic_forward, "Forward 10 seconds",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_FAST_FORWARD)
            )
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(1, 2, 3)   // previous, play/pause, next
            )
            .build()

        ServiceCompat.startForeground(this, NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    }

    // the user swiped the app away: stop the service too
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
    }

    override fun onDestroy() {
        instance = null
        session.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}