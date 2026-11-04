package com.ila3.dshomni.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ila3.dshomni.data.local.ConnectionStore
import com.ila3.dshomni.data.local.CookieStore
import com.ila3.dshomni.data.model.Attachment
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.CommandResult
import com.ila3.dshomni.data.model.Connection
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.data.model.UpdateInfo
import com.ila3.dshomni.data.remote.ApiClient
import com.ila3.dshomni.data.remote.ApiException
import com.ila3.dshomni.data.remote.PairingTarget
import com.ila3.dshomni.util.sha256Of
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Everything the screens render. */
data class UiState(
    val booted: Boolean = false,
    val snapshot: Snapshot? = null,
    val connection: Connection? = null,
    val connections: List<Connection> = emptyList(),
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
    /** Machine-readable code of the last failure, e.g. `pair-code-invalid`. */
    val errorCode: String? = null,
    val unauthorized: Boolean = false,
    val notice: String? = null,
    val suggestions: List<String> = emptyList(),
    val suggestionBusy: Boolean = false,
    val translating: Boolean = false,
    val update: UpdateState = UpdateState(),
    /** Latest `data:image/png` QR the bridge returned for a personal-account channel. */
    val qrImage: String? = null,
    /** Human-readable QR session state from the bridge. */
    val qrDetail: String = "",
    /** Channel the QR image belongs to. */
    val qrChannelId: String? = null,
    val busyAction: String? = null,
) {
    val paired: Boolean get() = connection != null && snapshot != null
}

/** Version check and APK transfer state for the settings screen. */
data class UpdateState(
    val checking: Boolean = false,
    val info: UpdateInfo? = null,
    val downloading: Boolean = false,
    val received: Long = 0L,
    val total: Long = 0L,
    val ready: File? = null,
    val error: String? = null,
) {
    val progress: Float get() = if (total > 0) (received.toFloat() / total).coerceIn(0f, 1f) else 0f
}

/** Upper-confidence byte size guard for a downloaded update. */
private const val MAX_APK_BYTES = 120L * 1024L * 1024L

/** Mirrors the Host's upload limit so the phone can reject early. */
private const val MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024

/** Owns pairing, the live snapshot, every command, and the update flow. */
class OmniViewModel(app: Application) : AndroidViewModel(app) {

    private val cookies = CookieStore(app)
    private val store = ConnectionStore(app)
    private val api = ApiClient(cookies)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var pollJob: Job? = null

    init {
        val saved = store.load()
        val current = store.find(store.currentId())
        _state.update { it.copy(connections = saved, connection = current, booted = true) }
        if (current != null) refresh(silent = true)
    }

    /** Re-read the saved connection list after an edit. */
    private fun reloadConnections() {
        _state.update { it.copy(connections = store.load()) }
    }

    /** Report a failure once, without dropping the last good snapshot. */
    private fun fail(error: Throwable) {
        val exception = error as? ApiException
        _state.update {
            it.copy(
                loading = false,
                refreshing = false,
                busyAction = null,
                unauthorized = exception?.code == "unauthorized",
                error = exception?.message ?: error.message ?: "操作失败。",
                errorCode = exception?.code,
            )
        }
    }

    /** Clear a consumed banner message. */
    fun clearError() = _state.update { it.copy(error = null, notice = null) }

    /** Clear only the success banner. */
    fun clearNotice() = _state.update { it.copy(notice = null) }

    /**
     * Exchange a pairing code, save the entry, and load the first snapshot.
     * A re-pair of the same base URL replaces the saved entry instead of
     * stacking duplicates.
     */
    fun pair(target: PairingTarget, label: String, onPaired: () -> Unit = {}) {
        if (target.code.isBlank()) {
            _state.update { it.copy(error = "请填写配对码。") }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                api.pair(target.baseUrl, target.code, "DSH Omni Android")
                val snapshot = api.state(target.baseUrl)
                val existing = store.load().firstOrNull { it.baseUrl == target.baseUrl }
                val connection = Connection(
                    id = existing?.id ?: UUID.randomUUID().toString(),
                    label = label.ifBlank { target.suggestedLabel() },
                    baseUrl = target.baseUrl,
                    entry = target.guess,
                    pairedAt = System.currentTimeMillis(),
                    lastVersion = snapshot.dataFile,
                    lastSyncAt = System.currentTimeMillis(),
                )
                store.upsert(connection)
                store.setCurrent(connection.id)
                reloadConnections()
                _state.update {
                    it.copy(
                        snapshot = snapshot,
                        connection = connection,
                        loading = false,
                        unauthorized = false,
                        notice = "已连接到 ${connection.label}",
                    )
                }
                startPolling()
                onPaired()
            } catch (error: Throwable) {
                fail(error)
            }
        }
    }

    /** Activate one saved entry and load it. */
    fun connect(connection: Connection) {
        store.setCurrent(connection.id)
        _state.update { it.copy(connection = connection, loading = true, error = null, snapshot = null) }
        refresh(silent = true)
        startPolling()
    }

    /** Forget a saved entry (and its cookies when it is the active one). */
    fun forget(connection: Connection) {
        store.remove(connection.id)
        if (_state.value.connection?.id == connection.id) {
            stopPolling()
            cookies.clear()
            _state.update { it.copy(connection = null, snapshot = null, unauthorized = false) }
        }
        reloadConnections()
    }

    /** Stop using the current entry but keep it for later. */
    fun disconnect() {
        stopPolling()
        store.setCurrent(null)
        _state.update { it.copy(connection = null, snapshot = null, unauthorized = false) }
    }

    /** Refresh the snapshot. Silent refreshes keep the spinner out of the way. */
    fun refresh(silent: Boolean = false) {
        val connection = _state.value.connection ?: return
        _state.update { it.copy(refreshing = !silent, error = if (silent) it.error else null) }
        viewModelScope.launch {
            try {
                val snapshot = api.state(connection.baseUrl)
                store.upsert(connection.copy(lastSyncAt = System.currentTimeMillis()))
                _state.update { it.copy(snapshot = snapshot, refreshing = false, loading = false, unauthorized = false) }
            } catch (error: Throwable) {
                if (silent) {
                    _state.update { it.copy(refreshing = false, loading = false) }
                    val exception = error as? ApiException
                    if (exception?.code == "unauthorized") _state.update { it.copy(unauthorized = true) }
                } else {
                    fail(error)
                }
            }
        }
    }

    /** Poll while a screen is visible; the Host is the single source of truth. */
    fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = viewModelScope.launch {
            while (true) {
                delay(20_000)
                if (_state.value.connection != null) refresh(silent = true)
            }
        }
    }

    fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    /** Run one command and fold the returned snapshot back into state. */
    private fun run(
        action: String,
        payload: JSONObject = JSONObject(),
        onDone: (CommandResult) -> Unit = {},
    ) {
        val connection = _state.value.connection ?: return
        _state.update { it.copy(busyAction = action, error = null) }
        viewModelScope.launch {
            try {
                val result = api.command(connection.baseUrl, action, payload)
                result.snapshot?.let { snapshot ->
                    _state.update { it.copy(snapshot = snapshot, busyAction = null) }
                } ?: _state.update { it.copy(busyAction = null) }
                onDone(result)
                if (result.snapshot == null) refresh(silent = true)
            } catch (error: Throwable) {
                fail(error)
            }
        }
    }

    /** Send a reply into one conversation. */
    fun sendMessage(conversationId: String, text: String, attachments: List<Attachment> = emptyList()) {
        if (text.isBlank() && attachments.isEmpty()) return
        val payload = JSONObject().put("conversationId", conversationId).put("text", text.trim())
        if (attachments.isNotEmpty()) {
            val array = org.json.JSONArray()
            attachments.forEach { attachment -> array.put(JSONObject().put("id", attachment.id)) }
            payload.put("attachments", array)
        }
        run("message.send", payload)
    }

    /** Upload one picked file and send it with the current caption. */
    fun uploadAttachment(
        conversationId: String,
        bytes: ByteArray,
        name: String,
        type: String,
        caption: String,
    ) {
        val connection = _state.value.connection ?: return
        if (bytes.size > MAX_ATTACHMENT_BYTES) {
            _state.update { it.copy(error = "附件不能超过 12 MB。") }
            return
        }
        _state.update { it.copy(busyAction = "attachment.upload", error = null) }
        viewModelScope.launch {
            try {
                val attachment = api.upload(connection.baseUrl, bytes, name, type)
                _state.update { it.copy(busyAction = null) }
                sendMessage(conversationId, caption, listOf(attachment))
            } catch (error: Throwable) {
                fail(error)
            }
        }
    }

    /** Attachment bytes for an inline preview. */
    suspend fun attachmentBytes(url: String): ByteArray? {
        val connection = _state.value.connection ?: return null
        return api.download(connection.baseUrl, url)
    }

    /** Append an internal note: visible to the team, never sent to the customer. */
    fun sendNote(conversationId: String, text: String) {
        if (text.isBlank()) return
        run("message.note", JSONObject().put("conversationId", conversationId).put("text", text.trim()))
    }

    /** Re-queue one failed outbound message. */
    fun retryMessage(messageId: String) {
        run("message.retry", JSONObject().put("messageId", messageId)) {
            _state.update { it.copy(notice = "已重新排队") }
        }
    }

    /** Clear the unread badge of a conversation. */
    fun markRead(conversationId: String) {
        val unread = _state.value.snapshot?.conversation(conversationId)?.unread ?: 0
        if (unread == 0) return
        run("conversation.read", JSONObject().put("conversationId", conversationId))
    }

    /** Change conversation status (`open`, `pending`, `solved`, `snoozed`). */
    fun setConversationStatus(conversationId: String, status: String) {
        run("conversation.update", JSONObject().put("conversationId", conversationId).put("status", status))
    }

    /** Pause or resume the AI reception bot for one conversation. */
    fun setBotPaused(conversationId: String, paused: Boolean) {
        run("conversation.bot", JSONObject().put("conversationId", conversationId).put("paused", paused))
    }

    /** Translate the latest customer messages of one conversation. */
    fun translateConversation(conversationId: String, targetLanguage: String) {
        val connection = _state.value.connection ?: return
        _state.update { it.copy(translating = true, error = null) }
        viewModelScope.launch {
            try {
                val (_, snapshot) = api.intelligence(
                    connection.baseUrl,
                    "translateConversation",
                    JSONObject().put("conversationId", conversationId).put("targetLanguage", targetLanguage),
                )
                _state.update {
                    it.copy(
                        translating = false,
                        snapshot = snapshot ?: it.snapshot,
                        notice = if (snapshot == null) "翻译完成" else "翻译完成",
                    )
                }
                if (snapshot == null) refresh(silent = true)
            } catch (error: Throwable) {
                _state.update { it.copy(translating = false) }
                fail(error)
            }
        }
    }

    /** Ask the model for three reply drafts for one conversation. */
    fun suggestReplies(conversationId: String, targetLanguage: String) {
        val connection = _state.value.connection ?: return
        _state.update { it.copy(suggestionBusy = true, suggestions = emptyList(), error = null) }
        viewModelScope.launch {
            try {
                val (result, _) = api.intelligence(
                    connection.baseUrl,
                    "suggest",
                    JSONObject().put("conversationId", conversationId).put("targetLanguage", targetLanguage),
                )
                val suggestions = result.optJSONArray("suggestions")?.let { array ->
                    (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
                } ?: emptyList()
                _state.update { it.copy(suggestionBusy = false, suggestions = suggestions) }
            } catch (error: Throwable) {
                _state.update { it.copy(suggestionBusy = false) }
                fail(error)
            }
        }
    }

    fun clearSuggestions() = _state.update { it.copy(suggestions = emptyList()) }

    /**
     * Create a channel from the phone.
     * @param config field key to plain value; empty optional fields may stay out.
     */
    fun createChannel(
        name: String,
        type: String,
        description: String,
        config: Map<String, String>,
        onCreated: (String) -> Unit,
    ) {
        val payload = JSONObject()
            .put("name", name)
            .put("type", type)
            .put("description", description)
        val configObject = JSONObject()
        for ((key, value) in config) {
            if (value.isNotBlank()) configObject.put(key, value)
        }
        payload.put("config", configObject)
        run("channel.create", payload) { result ->
            val id = (result.receipt["channelId"] as? String).orEmpty()
            if (id.isNotBlank()) onCreated(id)
        }
    }

    /** Update name, description, or status of a channel. */
    fun updateChannel(channel: Channel, name: String, description: String, status: String) {
        run(
            "channel.update",
            JSONObject()
                .put("channelId", channel.id)
                .put("name", name)
                .put("description", description)
                .put("status", status),
        )
    }

    /** Probe a channel's provider credentials. */
    fun testChannel(channelId: String) {
        run("channel.test", JSONObject().put("channelId", channelId)) {
            _state.update { state -> state.copy(notice = "连接测试成功") }
        }
    }

    /** Start or refresh the QR login of a personal-account channel. */
    fun qrLogin(channelId: String) {
        run("channel.qr", JSONObject().put("channelId", channelId)) { result ->
            captureQr(channelId, result)
        }
    }

    /** Poll one QR session; the bridge is polled by the screen while it is open. */
    fun qrStatus(channelId: String) {
        run("channel.qrStatus", JSONObject().put("channelId", channelId)) { result ->
            captureQr(channelId, result)
        }
    }

    /** Keep only the QR payload of the newest poll. */
    private fun captureQr(channelId: String, result: CommandResult) {
        val image = (result.receipt["qrDataUrl"] as? String).orEmpty()
        val detail = (result.receipt["detail"] as? String).orEmpty()
        val status = (result.receipt["status"] as? String).orEmpty()
        _state.update {
            it.copy(
                qrChannelId = channelId,
                qrImage = image.ifBlank { if (it.qrChannelId == channelId) it.qrImage else null },
                qrDetail = detail.ifBlank { status },
            )
        }
    }

    /** Drop the QR payload when the detail screen closes. */
    fun clearQr() = _state.update { it.copy(qrImage = null, qrDetail = "", qrChannelId = null) }

    /** Reveal masked secrets for the channel detail screen. */
    fun revealSecret(channelId: String, onRevealed: (Map<String, String>) -> Unit) {
        run("channel.revealSecret", JSONObject().put("channelId", channelId)) { result ->
            val shown = buildMap {
                for (key in result.receipt.keys) {
                    val value = result.receipt[key]
                    if (value is String && value.isNotBlank()) put(key, value)
                }
            }
            onRevealed(shown)
        }
    }

    /** Rotate the bridge secret of a channel. */
    fun rotateSecret(channelId: String, onRotated: (Map<String, String>) -> Unit) {
        run("channel.rotateSecret", JSONObject().put("channelId", channelId)) { result ->
            onRotated(result.receipt.mapValues { it.value?.toString().orEmpty() })
        }
    }

    /** Delete a channel the Host no longer has conversations for. */
    fun deleteChannel(channelId: String, onDeleted: () -> Unit) {
        run("channel.delete", JSONObject().put("channelId", channelId)) { onDeleted() }
    }

    /** Patch workspace settings exposed by the app. */
    fun updateSettings(payload: JSONObject, success: String = "设置已保存") {
        run("settings.update", payload) { _state.update { it.copy(notice = success) } }
        // Disabling suggestions must also remove the drafts already on screen.
        if (payload.has("aiSuggestions") && !payload.optBoolean("aiSuggestions")) clearSuggestions()
    }

    /** Ask the Host for the newest published APK. */
    fun checkUpdate() {
        val connection = _state.value.connection ?: return
        _state.update { it.copy(update = it.update.copy(checking = true, error = null)) }
        viewModelScope.launch {
            try {
                val info = api.update(connection.baseUrl)
                _state.update { it.copy(update = it.update.copy(checking = false, info = info, error = null)) }
            } catch (error: Throwable) {
                val exception = error as? ApiException
                _state.update {
                    it.copy(
                        update = it.update.copy(
                            checking = false,
                            error = if (exception?.status == 404) "Host 还没有发布 Android 安装包。" else (exception?.message ?: "检查更新失败。"),
                        ),
                    )
                }
            }
        }
    }

    /** Download the published APK into the cache partition. */
    fun downloadUpdate() {
        val connection = _state.value.connection ?: return
        val info = _state.value.update.info ?: return
        if (info.size > MAX_APK_BYTES) {
            _state.update { it.copy(update = it.update.copy(error = "安装包异常偏大，已停止下载。")) }
            return
        }
        val dir = File(getApplication<Application>().cacheDir, "updates").apply { mkdirs() }
        val target = File(dir, "dsh-im-omni-${info.versionName}.apk")
        _state.update { it.copy(update = it.update.copy(downloading = true, received = 0, total = info.size, error = null, ready = null)) }
        viewModelScope.launch {
            try {
                api.download(connection.baseUrl, info.apkPath, target) { received, total ->
                    _state.update { it.copy(update = it.update.copy(received = received, total = if (total > 0) total else it.update.total)) }
                }
                if (info.sha256.isNotBlank() && !sha256Of(target).equals(info.sha256, ignoreCase = true)) {
                    target.delete()
                    throw ApiException("checksum", "安装包校验失败，已删除下载文件。", 0)
                }
                _state.update { it.copy(update = it.update.copy(downloading = false, ready = target)) }
            } catch (error: Throwable) {
                val exception = error as? ApiException
                _state.update {
                    it.copy(update = it.update.copy(downloading = false, error = exception?.message ?: "下载失败。"))
                }
            }
        }
    }

    fun clearUpdate() = _state.update { it.copy(update = UpdateState()) }

    override fun onCleared() {
        stopPolling()
        super.onCleared()
    }
}
