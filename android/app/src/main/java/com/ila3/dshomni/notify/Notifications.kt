package com.ila3.dshomni.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ila3.dshomni.MainActivity
import com.ila3.dshomni.R

/**
 * Notification channels and posting helpers.
 *
 * The app is self-hosted, so there is no vendor push service: a foreground
 * service polls the Host and posts these locally. That keeps the feature
 * working on any network, including behind a LAN or a private tunnel.
 */
object Notifications {

    /** Foreground-service channel; low importance so it never makes a sound. */
    private const val CHANNEL_SERVICE = "dsh_omni_service"
    /** Incoming-message channel. */
    const val CHANNEL_MESSAGES = "dsh_omni_messages"

    /** Id of the persistent foreground notification. */
    const val SERVICE_NOTIFICATION_ID = 1001

    /** Base id for per-conversation message notifications. */
    private const val MESSAGE_BASE_ID = 2000

    /** Create both channels; safe to call repeatedly. */
    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "后台接收消息", NotificationManager.IMPORTANCE_MIN).apply {
                description = "保持与 DSH 主机的连接，用于接收新消息"
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGES, "新消息", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "有客户消息进入收件箱时提醒"
            },
        )
    }

    /** Whether the user granted POST_NOTIFICATIONS (always true before Android 13). */
    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    /** The persistent, silent notification the foreground service must show. */
    fun serviceNotification(context: Context, serverLabel: String): Notification {
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("全渠道 IM 正在后台接收消息")
            .setContentText(serverLabel.ifBlank { "已连接到 DSH 主机" })
            .setContentIntent(open)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
    }

    /**
     * One notification per conversation, keyed so updates replace instead of stack.
     *
     * Lint cannot follow the [canPost] guard through this call, hence the
     * suppression; the permission is checked at the top of the body and the
     * post itself stays inside runCatching for a revoked-while-running grant.
     */
    @SuppressLint("MissingPermission")
    fun postMessage(
        context: Context,
        serverLabel: String,
        conversationId: String,
        contactName: String,
        preview: String,
        unread: Int,
    ) {
        if (!canPost(context)) return
        val open = Intent(context, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_CONVERSATION_ID, conversationId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            context,
            conversationId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(contactName.ifBlank { "新消息" })
            .setContentText(preview.take(120))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setNumber(unread)
            .setStyle(NotificationCompat.BigTextStyle().bigText(preview.take(300)))
            .build()
        runCatching {
            NotificationManagerCompat.from(context)
                .notify(MESSAGE_BASE_ID + (conversationId.hashCode() and 0xffff), notification)
        }
    }

    /** Drop every message notification, e.g. after the user opens the inbox. */
    fun clearMessages(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
