package com.ila3.dshomni.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ila3.dshomni.R
import com.ila3.dshomni.data.local.ConnectionStore
import com.ila3.dshomni.data.local.CookieStore
import com.ila3.dshomni.data.model.Attachment
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.CommandResult
import com.ila3.dshomni.data.model.Connection
import com.ila3.dshomni.data.model.Message
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
import com.ila3.dshomni.data.v1.V1Api
import com.ila3.dshomni.data.model.EntryKind

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
    /** WeCom robot settings for the signed-in tenant (v1 only). */
    val notify: NotifyUiState = NotifyUiState(),
) {
    val paired: Boolean get() = connection != null && snapshot != null
}

/** Tenant notification settings shown in 我 → 通知. */
data class NotifyUiState(
    val enabled: Boolean = false,
    val configured: Boolean = false,
    val webhook: String = "",
    val quietStart: String = "",
    val quietEnd: String = "",
    val busy: Boolean = false,
    val message: String? = null,
)

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
    
/**
 * Turn a pairing failure into the category the UI can act on.
 *
 * @param error thrown by the pairing exchange or the follow-up state call.
 * @returns a stable code plus the sentence shown to the user.
 */
private fun classifyPairFailure(error: Throwable): PairFailure {
    val api = error as? ApiException
    return when {
        api?.code == "pair-code-invalid" ->
            PairFailure("pair-code", getApplication<android.app.Application>().getString(R.string.pair_err_code))
        api?.code == "pair-too-many" ->
            PairFailure("pair-rate", getApplication<android.app.Application>().getString(R.string.pair_err_rate))
        error is java.security.cert.CertificateException ||
            error is javax.net.ssl.SSLException ->
            PairFailure("pair-tls", getApplication<android.app.Application>().getString(R.string.pair_err_tls))
        error is java.net.UnknownHostException ->
            PairFailure("pair-dns", getApplication<android.app.Application>().getString(R.string.pair_err_dns))
        error is java.net.SocketTimeoutException ->
            PairFailure("pair-timeout", getApplication<android.app.Application>().getString(R.string.pair_err_timeout))
        error is java.io.IOException ->
            PairFailure("pair-network", getApplication<android.app.Application>().getString(R.string.pair_err_net))
        else ->
            PairFailure("pair-failed", api?.message ?: error.message ?: "配对失败。")
    }
}

/** One classified pairing failure. */
private data class PairFailure(val code: String, val message: String)

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
                // Pairing is the app's login, so its failures need to explain
                // themselves: "wrong code" and "cannot reach the server" are
                // different problems with different next steps.
                val failure = classifyPairFailure(error)
                _state.update {
                    it.copy(
                        loading = false,
                        error = failure.message,
                        errorCode = failure.code,
                    )
                }
            }
        }
    }

    /**
     * Load the signed-in tenant from the SaaS backend.
     *
     * The synthetic `Connection` keeps `state.paired` true so the legacy pairing
     * gate steps aside; nothing is written to the legacy connection store.
     */
    fun adoptSession(baseUrl: String, accessToken: String, label: String) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val token = ensureFreshToken(baseUrl, accessToken)
            runCatching { V1Api().snapshot(baseUrl, token, label) }
                .onSuccess { snapshot ->
                    _state.update {
                        it.copy(
                            snapshot = snapshot,
                            connection = Connection(
                                id = "v1:" + baseUrl,
                                label = label,
                                baseUrl = baseUrl,
                                entry = EntryKind.PUBLIC,
                                pairedAt = System.currentTimeMillis(),
                                lastSyncAt = System.currentTimeMillis(),
                            ),
                            loading = false,
                            refreshing = false,
                            error = null,
                            unauthorized = false,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            error = error.message ?: "加载失败",
                            unauthorized = error.message?.contains("401") == true,
                        )
                    }
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
        val active = _state.value.connection
        if (active != null && active.id.startsWith("v1:")) {
            sendViaV1(active.baseUrl, conversationId, text.trim())
            return
        }
        val payload = JSONObject().put("conversationId", conversationId).put("text", text.trim())
        if (attachments.isNotEmpty()) {
            val array = org.json.JSONArray()
            attachments.forEach { attachment -> array.put(JSONObject().put("id", attachment.id)) }
            payload.put("attachments", array)
        }
        run("message.send", payload)
    }

    /**
     * Send through the SaaS backend with an optimistic bubble.
     *
     * The bubble appears immediately as `queued`; the server reply replaces it
     * with the stored message (`sent`), and a failure flips it to `failed` so
     * the existing retry affordance keeps working.
     */
    private fun sendViaV1(baseUrl: String, conversationId: String, text: String) {
        val stored = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return
        val clientId = UUID.randomUUID().toString()
        val optimistic = Message(
            id = "local-" + clientId,
            direction = "out",
            kind = "text",
            text = text,
            status = "queued",
            createdAt = System.currentTimeMillis(),
            error = "",
            translation = null,
            attachments = emptyList(),
        )
        _state.update { state -> appendMessage(state, conversationId, optimistic) }
        viewModelScope.launch {
            val token = ensureFreshToken(baseUrl, stored.accessToken)
            runCatching { V1Api().sendMessage(baseUrl, token, conversationId, text, clientId) }
                .onSuccess { stored ->
                    // Keep the server's status: the SaaS backend queues the
                    // message, and the delivery worker flips it to sent later.
                    _state.update { state ->
                        replaceMessage(state, conversationId, optimistic.id, stored)
                    }
                    // Reload once so the bubble picks up the delivered state.
                    refreshV1Soon(baseUrl)
                }
                .onFailure { error ->
                    _state.update { state ->
                        replaceMessage(
                            state,
                            conversationId,
                            optimistic.id,
                            optimistic.copy(status = "failed", error = error.message ?: "发送失败"),
                        )
                    }
                }
        }
    }

    /**
     * Return a usable access token, refreshing it when it is about to expire.
     *
     * Access tokens live 15 minutes; without this the app silently starts
     * failing after the first quarter of an hour of use.
     */
    private suspend fun ensureFreshToken(baseUrl: String, current: String): String {
        if (!expiresSoon(current)) return current
        val session = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return current
        return when (val result = com.ila3.dshomni.data.auth.AuthApi().refresh(baseUrl, session.refreshToken)) {
            is com.ila3.dshomni.data.auth.AuthResult.Success -> {
                com.ila3.dshomni.data.auth.AuthStore(getApplication()).save(result.session)
                result.session.accessToken
            }
            is com.ila3.dshomni.data.auth.AuthResult.Failure -> current
        }
    }

    /** Load notification settings for the active v1 tenant. */
    fun loadNotify() {
        val active = _state.value.connection ?: return
        if (!active.id.startsWith("v1:")) return
        val session = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return
        viewModelScope.launch {
            runCatching {
                val token = ensureFreshToken(active.baseUrl, session.accessToken)
                V1Api().notifySettings(active.baseUrl, token)
            }.onSuccess { json ->
                _state.update {
                    it.copy(
                        notify = NotifyUiState(
                            enabled = json.optBoolean("enabled", false),
                            configured = json.optBoolean("configured", false),
                            webhook = json.optString("wecomWebhook"),
                            quietStart = json.optString("quietStart"),
                            quietEnd = json.optString("quietEnd"),
                        ),
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(notify = it.notify.copy(message = error.message)) }
            }
        }
    }

    /** Persist notification settings. */
    fun saveNotify(enabled: Boolean, webhook: String, quietStart: String, quietEnd: String) {
        val active = _state.value.connection ?: return
        if (!active.id.startsWith("v1:")) return
        val session = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return
        _state.update { it.copy(notify = it.notify.copy(busy = true, message = null)) }
        viewModelScope.launch {
            runCatching {
                val token = ensureFreshToken(active.baseUrl, session.accessToken)
                V1Api().saveNotifySettings(active.baseUrl, token, enabled, webhook, quietStart, quietEnd)
            }.onSuccess { json ->
                _state.update {
                    it.copy(
                        notify = NotifyUiState(
                            enabled = json.optBoolean("enabled", false),
                            configured = json.optBoolean("configured", false),
                            webhook = json.optString("wecomWebhook"),
                            quietStart = json.optString("quietStart"),
                            quietEnd = json.optString("quietEnd"),
                            message = getApplication<android.app.Application>().getString(com.ila3.dshomni.R.string.notify_saved),
                        ),
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(notify = it.notify.copy(busy = false, message = error.message)) }
            }
        }
    }

    /** Send a test card through the configured robot. */
    fun testNotify() {
        val active = _state.value.connection ?: return
        if (!active.id.startsWith("v1:")) return
        val session = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return
        _state.update { it.copy(notify = it.notify.copy(busy = true, message = null)) }
        viewModelScope.launch {
            runCatching {
                val token = ensureFreshToken(active.baseUrl, session.accessToken)
                V1Api().testNotify(active.baseUrl, token)
            }.onSuccess {
                _state.update {
                    it.copy(notify = it.notify.copy(busy = false, message = getApplication<android.app.Application>().getString(com.ila3.dshomni.R.string.notify_test_sent)))
                }
            }.onFailure { error ->
                _state.update { it.copy(notify = it.notify.copy(busy = false, message = error.message)) }
            }
        }
    }

    /** Reload the tenant shortly after a send so delivery state catches up. */
    private fun refreshV1Soon(baseUrl: String) {
        viewModelScope.launch {
            // The worker ticks on its own schedule; two reloads cover both a fast
            // and a slow dispatch without polling the API forever.
            for (delayMs in longArrayOf(2_500L, 6_000L)) {
                kotlinx.coroutines.delay(delayMs)
                val session = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load() ?: return@launch
                adoptSession(baseUrl, session.accessToken, session.email)
            }
        }
    }

    /** Whether a JWT expires within the next two minutes. */
    private fun expiresSoon(token: String): Boolean {
        return runCatching {
            val payload = token.split(".")[1]
            val json = String(android.util.Base64.decode(payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING))
            val exp = org.json.JSONObject(json).optLong("exp", 0L)
            exp > 0 && exp - System.currentTimeMillis() / 1000 < 120
        }.getOrDefault(true)
    }

    /** Append one message to a conversation inside the current snapshot. */
    private fun appendMessage(state: UiState, conversationId: String, message: Message): UiState {
        val snapshot = state.snapshot ?: return state
        return state.copy(
            snapshot = snapshot.copy(
                conversations = snapshot.conversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(messages = conversation.messages + message)
                    } else {
                        conversation
                    }
                },
            ),
        )
    }

    /** Replace an optimistic message with its stored or failed version. */
    private fun replaceMessage(state: UiState, conversationId: String, localId: String, next: Message): UiState {
        val snapshot = state.snapshot ?: return state
        return state.copy(
            snapshot = snapshot.copy(
                conversations = snapshot.conversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(
                            messages = conversation.messages.map { if (it.id == localId) next else it },
                        )
                    } else {
                        conversation
                    }
                },
            ),
        )
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
        val current = _state.value.connection
        if (current != null && current.id.startsWith("v1:")) {
            val token = com.ila3.dshomni.data.auth.AuthStore(getApplication()).load()?.accessToken
            if (token != null) {
                viewModelScope.launch {
                    runCatching { V1Api().markRead(current.baseUrl, token, conversationId) }
                        .onSuccess {
                            _state.update { state ->
                                val snapshot = state.snapshot ?: return@update state
                                state.copy(
                                    snapshot = snapshot.copy(
                                        conversations = snapshot.conversations.map {
                                            if (it.id == conversationId) it.copy(unread = 0) else it
                                        },
                                    ),
                                )
                            }
                        }
                }
                return
            }
        }
        val unread = _state.value.snapshot?.conversation(conversationId)?.unread ?: 0
        if (unread == 0) return
        run("conversation.read", JSONObject().put("conversationId", conversationId))
    }

    /**
     * Mark every unread conversation read.
     *
     * The Host has no bulk command, so this walks the unread rows one request
     * at a time (the same `conversation.read` the per-row action uses). A
     * partial failure keeps the successful rows and reports how many are left,
     * because silently marking everything read after a timeout would hide lost
     * conversations.
     */
    fun markAllRead() {
        val connection = _state.value.connection ?: return
        val snapshot = _state.value.snapshot ?: return
        val unread = snapshot.conversations.filter { it.unread > 0 }
        if (unread.isEmpty()) return
        _state.update { it.copy(busyAction = "conversation.read", error = null) }
        viewModelScope.launch {
            var failed = 0
            for (conversation in unread) {
                try {
                    val result = api.command(
                        connection.baseUrl,
                        "conversation.read",
                        JSONObject().put("conversationId", conversation.id),
                    )
                    result.snapshot?.let { fresh -> _state.update { it.copy(snapshot = fresh) } }
                } catch (error: Throwable) {
                    failed += 1
                    if (error is ApiException && error.code == "unauthorized") {
                        _state.update { it.copy(busyAction = null, unauthorized = true) }
                        return@launch
                    }
                }
            }
            _state.update {
                it.copy(
                    busyAction = null,
                    error = if (failed > 0) getApplication<android.app.Application>().getString(R.string.inbox_mark_all_failed, failed) else it.error,
                )
            }
            if (failed == 0) refresh(silent = true)
        }
    }

    /** Change conversation status (`open`, `pending`, `solved`, `snoozed`). */
    fun setConversationStatus(conversationId: String, status: String) {
        run("conversation.update", JSONObject().put("conversationId", conversationId).put("status", status))
    }

    /** Assign the conversation to a teammate (empty string clears it). */
    fun setConversationAssignee(conversationId: String, agentId: String) {
        run(
            "conversation.update",
            JSONObject().put("conversationId", conversationId).put("assigneeId", agentId),
        )
    }

    /** Set the conversation priority (`low`, `normal`, `high`, `urgent`). */
    fun setConversationPriority(conversationId: String, priority: String) {
        run(
            "conversation.update",
            JSONObject().put("conversationId", conversationId).put("priority", priority),
        )
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
