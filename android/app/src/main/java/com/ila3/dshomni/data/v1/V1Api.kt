package com.ila3.dshomni.data.v1

import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.Contact
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.Message
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.data.model.Workspace

/**
 * Reads the SaaS backend (the `/v1` routes) and maps it onto the snapshot the existing
 * Compose screens already render.
 *
 * Keeping the mapping here means the UI does not learn a second data shape:
 * switching the data source is a one-line change in the view model.
 */
class V1Api(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build(),
) {

    /** Load everything the inbox needs for one tenant. */
    suspend fun snapshot(baseUrl: String, accessToken: String, workspaceName: String): Snapshot =
        withContext(Dispatchers.IO) {
            val contacts = array(get(baseUrl, "/v1/contacts", accessToken), "items").map(::toContact)
            val channels = array(get(baseUrl, "/v1/channels", accessToken), "items").map(::toChannel)
            val conversations = array(get(baseUrl, "/v1/conversations", accessToken), "items")
            val withMessages = coroutineScope {
                conversations.take(20).map { item ->
                    async {
                        val id = item.optString("id")
                        val messages = runCatching {
                            array(get(baseUrl, "/v1/conversations/$id/messages?limit=30", accessToken), "items")
                                .map(::toMessage)
                        }.getOrDefault(emptyList())
                        toConversation(item, messages)
                    }
                }.awaitAll()
            }
            Snapshot(
                revision = 1,
                demo = false,
                workspace = Workspace(
                    name = workspaceName,
                    timezone = "Asia/Shanghai",
                    autoTranslate = true,
                    translationTarget = "zh-CN",
                    aiSuggestions = false,
                    botEnabled = false,
                    botName = "AI 接待",
                ),
                agents = emptyList(),
                channels = channels,
                contacts = contacts,
                conversations = withMessages,
                platforms = emptyList(),
                templates = emptyList(),
                events = emptyList(),
                dataFile = "postgres",
                serverTime = System.currentTimeMillis(),
            )
        }

    /** Mark one conversation read on the SaaS backend. */
    suspend fun markRead(baseUrl: String, accessToken: String, conversationId: String) =
        withContext(Dispatchers.IO) {
            post(baseUrl, "/v1/conversations/$conversationId/read", accessToken, JSONObject())
        }

    /**
     * Send one message. `clientId` makes the call idempotent, so a retry after a
     * dropped connection cannot produce a duplicate bubble.
     * @returns the stored message as the server sees it.
     */
    suspend fun sendMessage(
        baseUrl: String,
        accessToken: String,
        conversationId: String,
        text: String,
        clientId: String,
    ): Message = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("conversationId", conversationId)
            .put("text", text)
            .put("kind", "text")
            .put("clientId", clientId)
        val response = post(baseUrl, "/v1/messages", accessToken, payload)
        toMessage(response.optJSONObject("message") ?: JSONObject())
    }

    private fun post(baseUrl: String, path: String, token: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .header("authorization", "Bearer $token")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("服务器返回 ${response.code}")
            return JSONObject(text)
        }
    }

    private fun get(baseUrl: String, path: String, token: String): JSONObject {
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .header("authorization", "Bearer $token")
            .get()
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching {
                    JSONObject(text).optJSONObject("error")?.optString("message")
                }.getOrNull()
                error(message?.takeIf { it.isNotBlank() } ?: "服务器返回 ${response.code}")
            }
            return JSONObject(text)
        }
    }

    private fun array(json: JSONObject, key: String): List<JSONObject> {
        val arr: JSONArray = json.optJSONArray(key) ?: return emptyList()
        return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
    }

    private fun toContact(item: JSONObject) = Contact(
        id = item.optString("id"),
        name = item.optString("name"),
        handle = item.optString("phone"),
        company = item.optString("company"),
        email = item.optString("email"),
        phone = item.optString("phone"),
        hue = item.optInt("hue", 210),
        identities = emptyList(),
    )

    private fun toChannel(item: JSONObject): Channel {
        val type = item.optString("type")
        return Channel(
            id = item.optString("id"),
            name = item.optString("name"),
            description = "",
            type = type,
            status = item.optString("status", "active"),
            health = when (val raw = item.optString("health", "ready")) {
                "ok", "healthy" -> "connected"
                else -> raw
            },
            qrStatus = "",
            account = "",
            lastError = "",
            inbound = 0,
            outbound = 0,
            config = emptyMap(),
            configuredSecrets = emptyMap(),
            webhookPath = "",
            badge = type.take(2).uppercase(),
            platformLabel = type,
            hue = (type.hashCode() and 0x7fffffff) % 360,
            capabilities = emptyList(),
            official = type.contains("cloud") || type.contains("official"),
        )
    }

    private fun toMessage(item: JSONObject) = Message(
        id = item.optString("id"),
        direction = item.optString("direction", "in"),
        kind = item.optString("kind", "text"),
        text = item.optString("body"),
        status = item.optString("status", "received"),
        createdAt = millis(item.optString("created_at")),
        error = "",
        translation = null,
        attachments = emptyList(),
    )

    private fun toConversation(item: JSONObject, messages: List<Message>) = Conversation(
        id = item.optString("id"),
        channelId = item.optString("channel_id"),
        contactId = item.optString("contact_id"),
        subject = item.optString("subject"),
        status = item.optString("status", "open"),
        priority = item.optString("priority", "normal"),
        unread = item.optInt("unread", 0),
        tags = runCatching {
            val arr = item.optJSONArray("tags") ?: JSONArray()
            (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
        }.getOrDefault(emptyList()),
        messages = messages,
        updatedAt = millis(item.optString("updated_at")),
        lastInboundAt = millis(item.optString("last_inbound_at")).takeIf { it > 0 },
        botPaused = item.optBoolean("bot_paused", false),
        customerLanguage = "",
    )

    private fun millis(value: String): Long = runCatching { Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
}
