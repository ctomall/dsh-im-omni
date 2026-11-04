package com.ila3.dshomni.ui

import com.ila3.dshomni.data.model.Agent
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.Connection
import com.ila3.dshomni.data.model.Contact
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.EntryKind
import com.ila3.dshomni.data.model.FieldOption
import com.ila3.dshomni.data.model.L10n
import com.ila3.dshomni.data.model.Message
import com.ila3.dshomni.data.model.Platform
import com.ila3.dshomni.data.model.PlatformField
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.data.model.Template
import com.ila3.dshomni.data.model.Workspace

/**
 * Deterministic demo content for previews and screenshot tests.
 *
 * Kept out of the app's runtime path: nothing here is reachable unless a test
 * or preview composable asks for it.
 */
object PreviewData {

    private fun zh(text: String) = L10n(zh = text, en = text)

    private val anchor = System.currentTimeMillis()

    private fun minutesAgo(minutes: Long): Long = anchor - minutes * 60_000L

    private fun text(key: String, label: String, required: Boolean = true, secret: Boolean = false) = PlatformField(
        key = key,
        type = if (secret) "password" else "text",
        label = zh(label),
        hint = L10n("", ""),
        placeholder = "",
        required = required,
        secret = secret,
        auto = false,
        options = emptyList(),
    )

    val whatsapp = Platform(
        id = "whatsapp_cloud",
        label = zh("WhatsApp Business"),
        caption = zh("Meta Cloud API，官方 Webhook 与 Graph 发送接口"),
        badge = "WA",
        hue = 142,
        transport = "webhook",
        official = true,
        capabilities = listOf("text", "media"),
        fields = listOf(
            text("phoneNumberId", "电话号码 ID"),
            text("accessToken", "System User 访问令牌", secret = true),
            text("verifyToken", "Webhook 校验 token"),
        ),
        setup = mapOf("zh" to listOf("在 Meta 开发者后台创建 Business 应用并绑定号码。", "生成 System User 永久令牌并授予消息权限。")),
    )

    private fun select(key: String, label: String, options: List<Pair<String, String>>) = PlatformField(
        key = key,
        type = "select",
        label = zh(label),
        hint = L10n("", ""),
        placeholder = "",
        required = true,
        secret = false,
        auto = false,
        options = options.map { (value, text) -> FieldOption(value = value, label = zh(text)) },
    )

    val whatsappQr = Platform(
        id = "whatsapp_qr",
        label = zh("WhatsApp 个人号"),
        caption = zh("内置 Baileys 扫码登录，无需官方 API"),
        badge = "WQ",
        hue = 96,
        transport = "bridge",
        official = false,
        capabilities = listOf("text", "media", "qr"),
        fields = listOf(
            select("mode", "连接方式", listOf("embedded" to "内置扫码", "bridge" to "外部桥接")),
            text("bridgeUrl", "桥接地址（外部模式）", required = false),
            text("bridgeToken", "桥接 token（外部模式）", required = false, secret = true),
            text("sessionName", "会话名称", required = false),
            text("displayPhone", "预期号码（可选）", required = false),
        ),
        setup = mapOf("zh" to listOf("点击生成二维码，用手机 WhatsApp 扫码登录。")),
    )

    val telegram = Platform(
        id = "telegram",
        label = zh("Telegram"),
        caption = zh("Bot API 长轮询，无需公网回调"),
        badge = "TG",
        hue = 200,
        transport = "polling",
        official = true,
        capabilities = listOf("text", "media", "group"),
        fields = listOf(text("botToken", "Bot token", secret = true)),
        setup = mapOf("zh" to listOf("在 BotFather 生成 token 后填入。")),
    )

    val wecom = Platform(
        id = "wecom",
        label = zh("企业微信"),
        caption = zh("自建应用，加密 XML 回调"),
        badge = "WC",
        hue = 210,
        transport = "webhook",
        official = true,
        capabilities = listOf("text", "qr"),
        fields = listOf(
            text("corpId", "Corp ID"),
            text("agentId", "Agent ID"),
            text("secret", "应用 Secret", secret = true),
        ),
        setup = mapOf("zh" to listOf("创建自建应用并开启接收消息。")),
    )

    val feishu = Platform(
        id = "feishu",
        label = zh("飞书 / Lark"),
        caption = zh("事件订阅 v2，challenge 校验"),
        badge = "FS",
        hue = 190,
        transport = "webhook",
        official = true,
        capabilities = listOf("text"),
        fields = listOf(text("appId", "App ID"), text("appSecret", "App Secret", secret = true)),
        setup = mapOf("zh" to listOf("开启机器人能力并订阅 im.message.receive_v1。")),
    )

    val line = Platform(
        id = "line",
        label = zh("LINE"),
        caption = zh("Messaging API，Webhook 推送"),
        badge = "LN",
        hue = 120,
        transport = "webhook",
        official = true,
        capabilities = listOf("text"),
        fields = listOf(text("channelAccessToken", "Channel access token", secret = true)),
        setup = mapOf("zh" to listOf("在 LINE Developers 创建 Messaging API channel。")),
    )

    val platforms = listOf(whatsapp, whatsappQr, telegram, wecom, feishu, line)

    private fun channel(
        id: String,
        name: String,
        type: String,
        badge: String,
        platformLabel: String,
        hue: Int,
        health: String,
        inbound: Int,
        outbound: Int,
        capabilities: List<String> = listOf("text", "media"),
        qrStatus: String = "disconnected",
        account: String = "",
        official: Boolean = true,
    ) = Channel(
        id = id,
        name = name,
        description = "",
        type = type,
        status = "active",
        health = health,
        qrStatus = qrStatus,
        account = account,
        lastError = "",
        inbound = inbound,
        outbound = outbound,
        config = mapOf("phoneNumberId" to "1098…", "verifyToken" to "dsh-wa-7f3a"),
        configuredSecrets = mapOf("accessToken" to true, "appSecret" to true),
        webhookPath = "/api/im-omni.webhook/$id",
        badge = badge,
        platformLabel = platformLabel,
        hue = hue,
        capabilities = capabilities,
        official = official,
    )

    val channels = listOf(
        channel("chn_wa", "售后 WhatsApp", "whatsapp_cloud", "WA", "WhatsApp Business", 142, "connected", 1842, 1790),
        channel("chn_tg", "社群 Telegram", "telegram", "TG", "Telegram", 200, "connected", 326, 298, listOf("text", "media", "group")),
        channel(
            "chn_wq", "个人号 · 阿杰", "whatsapp_qr", "WQ", "WhatsApp 个人号", 96, "ready", 74, 61,
            listOf("text", "qr"), qrStatus = "pending", official = false,
        ),
        channel("chn_wc", "企业微信客服", "wecom", "WC", "企业微信", 210, "error", 88, 64, listOf("text", "qr")),
    )

    val contacts = listOf(
        Contact("ct_lin", "林小满", "lin", "木语家居", "lin@example.com", "+86 138…", 12, emptyList()),
        Contact("ct_chen", "陈思远", "chen", "启明电子", "", "", 210, emptyList()),
        Contact("ct_aisha", "Aisha Khan", "aisha", "Northwind", "", "", 330, emptyList()),
        Contact("ct_wang", "王磊", "wanglei", "速达物流", "", "", 46, emptyList()),
    )

    private fun message(
        id: String,
        inbound: Boolean,
        text: String,
        minutes: Long,
        status: String = "sent",
        translation: String? = null,
    ) = Message(
        id = id,
        direction = if (inbound) "in" else "out",
        kind = "text",
        text = text,
        status = status,
        createdAt = minutesAgo(minutes),
        error = "",
        translation = translation,
        attachments = emptyList(),
    )

    val conversations = listOf(
        Conversation(
            id = "cnv_lin",
            channelId = "chn_wa",
            contactId = "ct_lin",
            subject = "订单 #4821 破损退款",
            status = "pending",
            priority = "high",
            unread = 2,
            tags = listOf("退款"),
            messages = listOf(
                message("m1", true, "你好，订单 #4821 已经签收，但其中一件商品有破损。可以申请退款吗？", 46, translation = "Hi, order #4821 arrived but one item is damaged. Can I get a refund?"),
                message("m2", false, "你好 Lin，很抱歉收到这样的体验。请拍一张破损处的照片，我这边马上为你处理退款。", 44),
                message("m3", true, "照片已经上传了，另外外箱也压扁了。", 14, translation = "The photo is uploaded; the outer box was crushed too."),
                message("m4", true, "如果退款的话大概多久到账？", 13),
            ),
            updatedAt = minutesAgo(13),
            lastInboundAt = minutesAgo(13),
            botPaused = false,
            customerLanguage = "zh-CN",
        ),
        Conversation(
            id = "cnv_chen",
            channelId = "chn_tg",
            contactId = "ct_chen",
            subject = "批量采购报价",
            status = "open",
            priority = "normal",
            unread = 0,
            tags = listOf("售前"),
            messages = listOf(
                message("m5", true, "想咨询 200 台的批量价格，含税吗？", 90),
                message("m6", false, "含税。200 台可以走 9 折，我发一份报价单给你。", 88),
                message("m7", true, "好的，麻烦发我邮箱。", 62),
            ),
            updatedAt = minutesAgo(62),
            lastInboundAt = minutesAgo(62),
            botPaused = false,
            customerLanguage = "zh-CN",
        ),
        Conversation(
            id = "cnv_aisha",
            channelId = "chn_wa",
            contactId = "ct_aisha",
            subject = "Shipping delay",
            status = "open",
            priority = "urgent",
            unread = 1,
            tags = emptyList(),
            messages = listOf(
                message("m8", true, "Where is my parcel? It was promised for Monday.", 5, translation = "我的包裹在哪里？说好周一到。"),
            ),
            updatedAt = minutesAgo(5),
            lastInboundAt = minutesAgo(5),
            botPaused = true,
            customerLanguage = "en",
        ),
        Conversation(
            id = "cnv_wang",
            channelId = "chn_wc",
            contactId = "ct_wang",
            subject = "发票抬头修改",
            status = "solved",
            priority = "low",
            unread = 0,
            tags = emptyList(),
            messages = listOf(
                message("m9", true, "发票抬头写错了，能改吗？", 300),
                message("m10", false, "已修改并重新发送，请查收。", 290),
            ),
            updatedAt = minutesAgo(290),
            lastInboundAt = minutesAgo(300),
            botPaused = false,
            customerLanguage = "zh-CN",
        ),
    )

    val snapshot = Snapshot(
        revision = 42,
        demo = false,
        workspace = Workspace(
            name = "木语家居客服",
            timezone = "Asia/Shanghai",
            autoTranslate = true,
            translationTarget = "zh-CN",
            aiSuggestions = true,
            botEnabled = true,
            botName = "AI 接待",
        ),
        agents = listOf(Agent("agent_mia", "Mia", 210)),
        channels = channels,
        contacts = contacts,
        conversations = conversations,
        platforms = platforms,
        templates = listOf(
            Template("tpl_refund", "退款处理", "您好，退款会在 3 个工作日内原路退回，请留意查收。", listOf("chn_wa")),
            Template("tpl_ship", "物流查询", "请把订单号发我，我这边帮您查物流进度。", emptyList()),
        ),
        events = emptyList(),
        dataFile = "/home/ubuntu/.dsh/profiles/web/.im-omni/state.json",
        serverTime = minutesAgo(0),
    )

    private val publicServer = Connection(
        id = "conn_public",
        label = "外网 · harness.ila3.net",
        baseUrl = "https://harness.ila3.net/phone/",
        entry = EntryKind.PUBLIC,
        pairedAt = minutesAgo(1_200),
        lastVersion = "",
        lastSyncAt = minutesAgo(1),
    )

    private val lanServer = Connection(
        id = "conn_lan",
        label = "内网 · 192.168.1.20",
        baseUrl = "http://192.168.1.20:8080/phone/",
        entry = EntryKind.LAN,
        pairedAt = minutesAgo(3_000),
        lastVersion = "",
        lastSyncAt = minutesAgo(60),
    )

    /** State a paired phone would hold. */
    val paired = UiState(
        booted = true,
        snapshot = snapshot,
        connection = publicServer,
        connections = listOf(publicServer, lanServer),
    )

    /** State before the first pairing. */
    val pairing = UiState(
        booted = true,
        connections = listOf(publicServer, lanServer),
    )
}
