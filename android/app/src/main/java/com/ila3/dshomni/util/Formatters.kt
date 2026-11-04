package com.ila3.dshomni.util

import androidx.compose.ui.graphics.Color
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Human labels for the Host's channel types and statuses. */
object Labels {

    private val channelTypes = mapOf(
        "whatsapp_cloud" to "WhatsApp Business",
        "whatsapp_qr" to "WhatsApp 个人号",
        "wechat_qr" to "微信个人号",
        "wecom" to "企业微信",
        "dingtalk" to "钉钉",
        "feishu" to "飞书 / Lark",
        "slack" to "Slack",
        "discord" to "Discord",
        "line" to "LINE",
        "telegram" to "Telegram",
        "webhook" to "通用 HTTP",
    )

    fun channelType(type: String): String = channelTypes[type] ?: type

    fun health(health: String): String = when (health) {
        "connected" -> "已连接"
        "error" -> "连接异常"
        else -> "待配置"
    }

    fun status(status: String): String = when (status) {
        "active" -> "启用"
        "paused" -> "暂停"
        else -> status
    }

    fun conversationStatus(status: String): String = when (status) {
        "open" -> "待处理"
        "pending" -> "跟进中"
        "solved" -> "已解决"
        "snoozed" -> "已稍后"
        else -> status
    }

    fun priority(priority: String): String = when (priority) {
        "urgent" -> "紧急"
        "high" -> "高"
        "low" -> "低"
        else -> "普通"
    }

    fun qrStatus(status: String): String = when (status) {
        "pending" -> "等待扫码"
        "scanned" -> "已扫码，确认中"
        "connected" -> "已登录"
        "error" -> "登录失败"
        else -> "未登录"
    }

    fun direction(direction: String): String = if (direction == "in") "客户" else "客服"
}

/** Time formatting for message rows and lists. */
object Times {

    private val timeOfDay = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())
    private val monthDay = DateTimeFormatter.ofPattern("M月d日", Locale.SIMPLIFIED_CHINESE)

    /** `刚刚`, `12 分钟前`, `3 小时前`, `昨天`, or a date. */
    fun relative(millis: Long, now: Long = System.currentTimeMillis()): String {
        if (millis <= 0L) return ""
        val delta = now - millis
        return when {
            delta < 60_000L -> "刚刚"
            delta < 3_600_000L -> "${delta / 60_000L} 分钟前"
            delta < 86_400_000L -> "${delta / 3_600_000L} 小时前"
            delta < 172_800_000L -> "昨天"
            delta < 604_800_000L -> "${delta / 86_400_000L} 天前"
            else -> monthDay.format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
        }
    }

    /** `14:32` for same-day messages, `昨天 14:32`, or a dated stamp. */
    fun messageStamp(millis: Long, now: Long = System.currentTimeMillis()): String {
        if (millis <= 0L) return ""
        val zone = ZoneId.systemDefault()
        val instant = Instant.ofEpochMilli(millis).atZone(zone)
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val day = instant.toLocalDate()
        return when {
            day == today -> timeOfDay.format(instant)
            day == today.minusDays(1) -> "昨天 ${timeOfDay.format(instant)}"
            else -> "${monthDay.format(instant)} ${timeOfDay.format(instant)}"
        }
    }

    /** `MM-dd HH:mm` used by the settings diagnostics card. */
    fun stamp(millis: Long): String {
        if (millis <= 0L) return "—"
        return timeOfDay.format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
    }
}

/** First one or two glyphs of a name, for avatar placeholders. */
fun initialsOf(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    val first = trimmed.first()
    return if (first.code > 0x2E80) {
        // CJK: one glyph reads better than two stacked characters.
        trimmed.take(1)
    } else {
        trimmed.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    }
}

/** Hue (0-360) to a saturated avatar color, stable per contact. */
fun hueColor(hue: Int, saturation: Float = 0.55f, value: Float = 0.85f): Color {
    val normalized = ((hue % 360) + 360) % 360
    return Color.hsv(normalized.toFloat(), saturation, value)
}

/** File size in the units a phone upload screen would use. */
fun formatBytes(bytes: Long): String = when {
    bytes <= 0L -> "—"
    bytes < 1024L -> "$bytes B"
    bytes < 1024L * 1024L -> String.format(Locale.US, "%.1f KB", bytes / 1024.0)
    else -> String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
