package com.ila3.dshomni.data.remote

import com.ila3.dshomni.data.model.Agent
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.Contact
import com.ila3.dshomni.data.model.ContactIdentity
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.FeedEvent
import com.ila3.dshomni.data.model.FieldOption
import com.ila3.dshomni.data.model.L10n
import com.ila3.dshomni.data.model.Message
import com.ila3.dshomni.data.model.Platform
import com.ila3.dshomni.data.model.PlatformField
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.data.model.UpdateInfo
import com.ila3.dshomni.data.model.Workspace
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeParseException

/**
 * Parser for the plugin's public Host snapshots.
 *
 * Every getter degrades to an empty value so an older Host that omits a field
 * still renders, and a malformed record never takes the whole inbox down.
 */
object DtoParser {

    private fun JSONObject.str(key: String, fallback: String = ""): String {
        if (!has(key) || isNull(key)) return fallback
        val value = opt(key)
        return when (value) {
            is String -> value
            is Number, is Boolean -> value.toString()
            else -> fallback
        }
    }

    private fun JSONObject.int(key: String, fallback: Int = 0): Int =
        if (has(key) && !isNull(key)) optInt(key, fallback) else fallback

    private fun JSONObject.long(key: String, fallback: Long = 0L): Long =
        if (has(key) && !isNull(key)) optLong(key, fallback) else fallback

    private fun JSONObject.bool(key: String, fallback: Boolean = false): Boolean =
        if (has(key) && !isNull(key)) optBoolean(key, fallback) else fallback

    private fun JSONObject.obj(key: String): JSONObject? =
        if (has(key) && !isNull(key)) optJSONObject(key) else null

    private fun JSONObject.arr(key: String): JSONArray =
        if (has(key) && !isNull(key)) optJSONArray(key) ?: JSONArray() else JSONArray()

    private fun JSONArray.objects(): List<JSONObject> =
        (0 until length()).mapNotNull { optJSONObject(it) }

    /** ISO-8601 timestamp to epoch millis; 0 when absent or malformed. */
    fun isoToMillis(value: String?): Long {
        if (value.isNullOrBlank()) return 0L
        return try {
            Instant.parse(value).toEpochMilli()
        } catch (_: DateTimeParseException) {
            0L
        }
    }

    private fun l10n(value: JSONObject?): L10n =
        L10n(zh = value?.str("zh") ?: "", en = value?.str("en") ?: "")

    private fun l10nAt(obj: JSONObject, key: String): L10n = l10n(obj.obj(key))

    /** Parse the `state` object the plugin publishes. */
    fun parseSnapshot(state: JSONObject): Snapshot {
        val workspace = state.obj("workspace")
        val bot = workspace?.obj("bot")
        return Snapshot(
            revision = state.obj("meta")?.int("revision", 1) ?: 1,
            demo = state.bool("demo"),
            workspace = Workspace(
                name = workspace?.str("name")?.ifBlank { "Support workspace" } ?: "Support workspace",
                timezone = workspace?.str("timezone") ?: "UTC",
                autoTranslate = workspace?.bool("autoTranslate", true) ?: true,
                translationTarget = workspace?.str("translationTarget")?.ifBlank { "zh-CN" } ?: "zh-CN",
                aiSuggestions = workspace?.bool("aiSuggestions", true) ?: true,
                botEnabled = bot?.bool("enabled") ?: false,
                botName = bot?.str("name")?.ifBlank { "AI 接待" } ?: "AI 接待",
            ),
            agents = state.arr("agents").objects().map {
                Agent(
                    id = it.str("id"),
                    name = it.str("name").ifBlank { "Agent" },
                    hue = it.int("hue", 210),
                )
            },
            channels = state.arr("channels").objects().map { parseChannel(it) },
            contacts = state.arr("contacts").objects().map { parseContact(it) },
            conversations = state.arr("conversations").objects().map { parseConversation(it) },
            platforms = state.arr("channelPlatforms").objects().map { parsePlatform(it) },
            events = state.arr("events").objects().map {
                FeedEvent(
                    id = it.str("id"),
                    type = it.str("type"),
                    text = it.str("text"),
                    createdAt = isoToMillis(it.str("createdAt")),
                )
            }.sortedByDescending { it.createdAt },
            dataFile = state.str("dataFile"),
            serverTime = isoToMillis(state.str("serverTime")).takeIf { it > 0L },
        )
    }

    /** Parse one channel, including its platform summary and masked config. */
    fun parseChannel(json: JSONObject): Channel {
        val platform = json.obj("platform")
        val configJson = json.obj("config")
        val config = buildMap {
            if (configJson != null) {
                for (key in configJson.keys()) put(key, configJson.str(key))
            }
        }
        val secretsJson = json.obj("configuredSecrets")
        val secrets = buildMap {
            if (secretsJson != null) {
                for (key in secretsJson.keys()) put(key, secretsJson.bool(key))
            }
        }
        val stats = json.obj("stats")
        val runtime = json.obj("runtime")
        return Channel(
            id = json.str("id"),
            name = json.str("name").ifBlank { "Channel" },
            description = json.str("description"),
            type = json.str("type"),
            status = json.str("status", "active"),
            health = runtime?.str("health") ?: json.str("health", "ready"),
            qrStatus = runtime?.str("qrStatus") ?: "disconnected",
            account = runtime?.str("account") ?: "",
            lastError = runtime?.str("lastError") ?: "",
            inbound = stats?.int("inbound") ?: 0,
            outbound = stats?.int("outbound") ?: 0,
            config = config,
            configuredSecrets = secrets,
            webhookPath = json.str("webhookPath"),
            badge = platform?.str("badge") ?: json.str("type").take(2).uppercase(),
            platformLabel = l10nAt(platform ?: JSONObject(), "label").pick(true),
            hue = platform?.int("hue", 210) ?: 210,
            capabilities = platform?.arr("capabilities")?.let { array ->
                (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
            } ?: emptyList(),
            official = platform?.bool("official") ?: false,
        )
    }

    private fun parseContact(json: JSONObject): Contact = Contact(
        id = json.str("id"),
        name = json.str("name").ifBlank { "Unknown" },
        handle = json.str("handle"),
        company = json.str("company"),
        email = json.str("email"),
        phone = json.str("phone"),
        hue = json.int("hue", 210),
        identities = json.arr("identities").objects().map {
            ContactIdentity(channelId = it.str("channelId"), externalId = it.str("externalId"))
        },
    )

    private fun parseConversation(json: JSONObject): Conversation {
        val messages = json.arr("messages").objects().map { message ->
            Message(
                id = message.str("id"),
                direction = message.str("direction", "in"),
                kind = message.str("kind", "text"),
                text = message.str("text"),
                status = message.str("status"),
                createdAt = isoToMillis(message.str("createdAt")),
                error = message.str("error"),
                translation = message.obj("translation")?.str("text")?.takeIf { it.isNotBlank() },
            )
        }
        return Conversation(
            id = json.str("id"),
            channelId = json.str("channelId"),
            contactId = json.str("contactId"),
            subject = json.str("subject").ifBlank { "Conversation" },
            status = json.str("status", "open"),
            priority = json.str("priority", "normal"),
            unread = json.int("unread"),
            tags = json.arr("tags").let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } },
            messages = messages,
            updatedAt = isoToMillis(json.str("updatedAt")),
            lastInboundAt = isoToMillis(json.str("lastInboundAt")).takeIf { it > 0L },
            botPaused = json.bool("botPaused"),
        )
    }

    /** Parse one catalog platform, including its field list and setup steps. */
    fun parsePlatform(json: JSONObject): Platform {
        val setup = linkedMapOf<String, List<String>>()
        json.obj("setup")?.let { obj ->
            for (lang in obj.keys()) {
                val list = obj.arr(lang)
                setup[lang] = (0 until list.length()).mapNotNull { list.optString(it).takeIf(String::isNotBlank) }
            }
        }
        return Platform(
            id = json.str("id"),
            label = l10nAt(json, "label"),
            caption = l10nAt(json, "caption"),
            badge = json.str("badge"),
            hue = json.int("hue", 210),
            transport = json.str("transport"),
            official = json.bool("official"),
            capabilities = json.arr("capabilities").let { array ->
                (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
            },
            fields = json.arr("fields").objects().map { field ->
                PlatformField(
                    key = field.str("key"),
                    type = field.str("type", "text"),
                    label = l10nAt(field, "label"),
                    hint = l10nAt(field, "hint"),
                    placeholder = field.str("placeholder"),
                    required = field.bool("required"),
                    secret = field.bool("secret"),
                    auto = field.bool("auto"),
                    options = field.arr("options").objects().map {
                        FieldOption(value = it.str("value"), label = l10nAt(it, "label"))
                    },
                )
            },
            setup = setup,
        )
    }

    /** Parse the update manifest served by `/api/im-omni.app.version`. */
    fun parseUpdate(json: JSONObject): UpdateInfo {
        val app = json.obj("app") ?: throw ApiException("bad-version-manifest", "The Host returned no app manifest.", 0)
        val versionCode = app.int("versionCode")
        val versionName = app.str("versionName")
        if (versionCode <= 0 || versionName.isBlank()) {
            throw ApiException("bad-version-manifest", "The Host manifest has no usable version.", 0)
        }
        return UpdateInfo(
            versionCode = versionCode,
            versionName = versionName,
            minSdk = app.int("minSdk", 26),
            notes = app.str("notes"),
            publishedAt = app.str("publishedAt"),
            sha256 = app.str("sha256"),
            size = app.long("size"),
            apkPath = app.str("apkPath").ifBlank { "/api/im-omni.app.apk" },
        )
    }
}

/** One failed Host call, with the code the plugin reported. */
class ApiException(
    val code: String,
    message: String,
    val status: Int,
) : Exception(message)
