package com.ila3.dshomni.notify

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationManagerCompat
import com.ila3.dshomni.data.local.ConnectionStore
import com.ila3.dshomni.data.local.CookieStore
import com.ila3.dshomni.data.remote.ApiClient
import com.ila3.dshomni.data.remote.ApiException
import com.ila3.dshomni.data.model.Snapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Foreground service that keeps the inbox fresh in the background.
 *
 * There is no FCM (it is unavailable behind many CN networks and would need a
 * Google account), so the phone polls the same authenticated Host API it uses
 * in the foreground. Polling every 30 s costs one small JSON request; the
 * service stops itself when the pair is revoked or the app is disconnected.
 */
class NotificationService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    /** Conversation id → unread count seen on the previous poll. */
    private val seen = mutableMapOf<String, Int>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val connection = ConnectionStore(this).find(ConnectionStore(this).currentId())
        Notifications.ensureChannels(this)
        startForeground(
            Notifications.SERVICE_NOTIFICATION_ID,
            Notifications.serviceNotification(this, connection?.label.orEmpty()),
        )
        if (connection == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (loop?.isActive != true) {
            loop = scope.launch { poll(connection.baseUrl, connection.label) }
        }
        return START_STICKY
    }

    /** Poll until stopped, the pair is revoked, or the service is destroyed. */
    private suspend fun poll(baseUrl: String, label: String) {
        val api = ApiClient(CookieStore(applicationContext))
        while (scope.isActive) {
            val snapshot = try {
                withContext(Dispatchers.IO) { api.state(baseUrl) }
            } catch (error: ApiException) {
                if (error.code == "unauthorized") {
                    // The device was revoked or the session expired: stop quietly.
                    withContext(Dispatchers.Main) { stopSelf() }
                    return
                }
                null
            } catch (_: Throwable) {
                null
            }
            if (snapshot != null) announce(snapshot, label)
            delay(POLL_INTERVAL_MS)
        }
    }

    /** Post one notification per conversation whose unread count grew. */
    private fun announce(snapshot: Snapshot, label: String) {
        for (conversation in snapshot.conversations) {
            val previous = seen[conversation.id] ?: conversation.unread
            if (conversation.unread > previous) {
                val contact = snapshot.contact(conversation.contactId)
                val preview = conversation.lastMessage?.text.orEmpty().ifBlank { "收到一条新消息" }
                Notifications.postMessage(
                    context = this,
                    serverLabel = label,
                    conversationId = conversation.id,
                    contactName = contact?.name.orEmpty(),
                    preview = preview,
                    unread = conversation.unread,
                )
            }
            seen[conversation.id] = conversation.unread
        }
        // Forget conversations that disappeared so a name cannot be reused stale.
        val alive = snapshot.conversations.map { it.id }.toSet()
        seen.keys.retainAll(alive)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        /** Poll cadence: frequent enough to feel live, cheap enough for battery. */
        private const val POLL_INTERVAL_MS = 30_000L
        /** Stop the service. */
        const val ACTION_STOP = "com.ila3.dshomni.STOP_NOTIFICATIONS"
        /** Start the service. */
        const val ACTION_START = "com.ila3.dshomni.START_NOTIFICATIONS"

        /** Start the background connection if a device is paired. */
        fun start(context: Context) {
            val intent = Intent(context, NotificationService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /** Stop the background connection. */
        fun stop(context: Context) {
            context.startService(Intent(context, NotificationService::class.java).setAction(ACTION_STOP))
            NotificationManagerCompat.from(context).cancelAll()
        }
    }
}
