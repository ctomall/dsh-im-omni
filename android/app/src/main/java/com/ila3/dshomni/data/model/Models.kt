package com.ila3.dshomni.data.model

/** Localized (zh/en) copy shipped by the plugin catalog. */
data class L10n(val zh: String, val en: String) {
    fun pick(chinese: Boolean): String = if (chinese) zh.ifBlank { en } else en.ifBlank { zh }
}

/** One selectable option of a channel field. */
data class FieldOption(val value: String, val label: L10n)

/**
 * One configuration field of a channel platform, as the Host catalog declares it.
 * [secret] values are always masked in snapshots; [auto] fields may be generated
 * by the Host when left empty.
 */
data class PlatformField(
    val key: String,
    val type: String,
    val label: L10n,
    val hint: L10n,
    val placeholder: String,
    val required: Boolean,
    val secret: Boolean,
    val auto: Boolean,
    val options: List<FieldOption>,
)

/** One IM platform the Host can bind. */
data class Platform(
    val id: String,
    val label: L10n,
    val caption: L10n,
    val badge: String,
    val hue: Int,
    val transport: String,
    val official: Boolean,
    val capabilities: List<String>,
    val fields: List<PlatformField>,
    val setup: Map<String, List<String>>,
) {
    /** Setup instructions for the active language. */
    fun steps(chinese: Boolean): List<String> = setup[if (chinese) "zh" else "en"] ?: emptyList()
}

/** One bound channel. */
data class Channel(
    val id: String,
    val name: String,
    val description: String,
    val type: String,
    val status: String,
    val health: String,
    val qrStatus: String,
    val account: String,
    val lastError: String,
    val inbound: Int,
    val outbound: Int,
    val config: Map<String, String>,
    val configuredSecrets: Map<String, Boolean>,
    val webhookPath: String,
    val badge: String,
    val platformLabel: String,
    val hue: Int,
    val capabilities: List<String>,
    val official: Boolean,
) {
    val isPaused: Boolean get() = status == "paused"
    val isConnected: Boolean get() = health == "connected"
    val isErrored: Boolean get() = health == "error"
    val supportsQr: Boolean get() = capabilities.contains("qr")
}

/** One contact identity on a channel. */
data class ContactIdentity(val channelId: String, val externalId: String)

/** One customer. */
data class Contact(
    val id: String,
    val name: String,
    val handle: String,
    val company: String,
    val email: String,
    val phone: String,
    val hue: Int,
    val identities: List<ContactIdentity>,
)

/** One file attached to a message; bytes live on the Host. */
data class Attachment(
    val id: String,
    val name: String,
    val type: String,
    val size: Long,
    val url: String,
) {
    val isImage: Boolean get() = type.startsWith("image/")
    val isLocal: Boolean get() = id.isNotBlank()
}

/** One message inside a conversation. */
data class Message(
    val id: String,
    val direction: String,
    val kind: String,
    val text: String,
    val status: String,
    val createdAt: Long,
    val error: String,
    val translation: String?,
    val attachments: List<Attachment>,
) {
    val inbound: Boolean get() = direction == "in"
    val isNote: Boolean get() = kind == "note"
    val failed: Boolean get() = status == "failed" || error.isNotBlank()
}

/** One conversation thread. */
data class Conversation(
    val id: String,
    val channelId: String,
    val contactId: String,
    val subject: String,
    val status: String,
    val priority: String,
    val unread: Int,
    val tags: List<String>,
    val messages: List<Message>,
    val updatedAt: Long,
    val lastInboundAt: Long?,
    val botPaused: Boolean,
    /** BCP-47 language the Host detected for the customer, empty until known. */
    val customerLanguage: String,
    /** Teammate currently owning the conversation; empty when unassigned. */
    val assigneeId: String = "",
    /** When the first agent reply went out; null until the thread is answered. */
    val firstResponseAt: Long? = null,
    /** Snooze deadline, when the conversation is parked. */
    val snoozedUntil: Long? = null,
) {
    val lastMessage: Message? get() = messages.lastOrNull()
    val needsAttention: Boolean get() = status == "pending" || status == "open"
}

/** One canned reply the workspace exposes. */
data class Template(
    val id: String,
    val name: String,
    val body: String,
    val channelIds: List<String>,
) {
    /** Whether this template applies to a conversation on the given channel. */
    fun appliesTo(channelId: String): Boolean = channelIds.isEmpty() || channelIds.contains(channelId)
}

/** One teammate. */
data class Agent(val id: String, val name: String, val hue: Int)

/** Workspace-wide settings the app exposes. */
data class Workspace(
    val name: String,
    val timezone: String,
    val autoTranslate: Boolean,
    val translationTarget: String,
    val aiSuggestions: Boolean,
    val botEnabled: Boolean,
    val botName: String,
    /** First-response target the workspace promises, in minutes. */
    val defaultSlaMinutes: Int = 30,
    /** Whether the Host routes new conversations automatically. */
    val autoAssign: Boolean = true,
)

/** One activity record. */
data class FeedEvent(val id: String, val type: String, val text: String, val createdAt: Long)

/** A complete Host snapshot as `/api/im-omni.state` returns it. */
data class Snapshot(
    val revision: Int,
    val demo: Boolean,
    val workspace: Workspace,
    val agents: List<Agent>,
    val channels: List<Channel>,
    val contacts: List<Contact>,
    val conversations: List<Conversation>,
    val platforms: List<Platform>,
    val templates: List<Template>,
    val events: List<FeedEvent>,
    val dataFile: String,
    val serverTime: Long?,
) {
    val unreadTotal: Int get() = conversations.sumOf { it.unread }
    fun channel(id: String?): Channel? = channels.firstOrNull { it.id == id }
    fun contact(id: String?): Contact? = contacts.firstOrNull { it.id == id }
    fun conversation(id: String?): Conversation? = conversations.firstOrNull { it.id == id }
    fun platform(id: String?): Platform? = platforms.firstOrNull { it.id == id }
}

/** Result of one Host command: the newest snapshot plus the command receipt. */
data class CommandResult(val snapshot: Snapshot?, val receipt: Map<String, Any?>)

/** One saved server connection (LAN or public entry). */
data class Connection(
    val id: String,
    val label: String,
    val baseUrl: String,
    val entry: EntryKind,
    val pairedAt: Long,
    val lastVersion: String = "",
    val lastSyncAt: Long = 0L,
) {
    val isHttps: Boolean get() = baseUrl.startsWith("https://")
}

/** Which network entry a connection points at. */
enum class EntryKind(val label: String) {
    LAN("内网"),
    PUBLIC("外网"),
    CUSTOM("自定义"),
}

/** Published APK update. */
data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val minSdk: Int,
    val notes: String,
    val publishedAt: String,
    val sha256: String,
    val size: Long,
    val apkPath: String,
)
