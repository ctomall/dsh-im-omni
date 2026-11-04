package com.ila3.dshomni

import com.ila3.dshomni.data.remote.ApiException
import com.ila3.dshomni.data.remote.DtoParser
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Host snapshot and update-manifest parsing. */
class DtoParserTest {

    private val snapshotJson = JSONObject(
        """
        {
          "demo": false,
          "meta": { "revision": 12 },
          "dataFile": "/tmp/state.json",
          "serverTime": "2026-11-04T07:00:00.000Z",
          "workspace": {
            "name": "木语家居客服",
            "timezone": "Asia/Shanghai",
            "autoTranslate": true,
            "translationTarget": "zh-CN",
            "aiSuggestions": true,
            "bot": { "enabled": true, "name": "AI 接待" }
          },
          "agents": [ { "id": "agent_mia", "name": "Mia", "hue": 210 } ],
          "channelPlatforms": [
            {
              "id": "telegram",
              "label": { "zh": "Telegram", "en": "Telegram" },
              "caption": { "zh": "长轮询", "en": "Long polling" },
              "badge": "TG",
              "hue": 200,
              "transport": "polling",
              "official": true,
              "capabilities": ["text", "media"],
              "fields": [
                { "key": "botToken", "type": "password", "label": {"zh":"Token"}, "hint": {"zh":"BotFather"},
                  "placeholder": "123:abc", "required": true, "secret": true }
              ],
              "setup": { "zh": ["在 BotFather 生成 token"], "en": ["Create a token in BotFather"] }
            }
          ],
          "channels": [
            {
              "id": "chn_tg", "name": "社群 Telegram", "type": "telegram", "status": "active",
              "config": { "botToken": "••••" },
              "configuredSecrets": { "botToken": true },
              "webhookPath": "/api/im-omni.webhook/chn_tg",
              "runtime": { "health": "connected", "qrStatus": "disconnected", "account": "@muyu_bot", "lastError": "" },
              "stats": { "inbound": 326, "outbound": 298 },
              "platform": { "badge": "TG", "label": {"zh":"Telegram"}, "hue": 200, "official": true, "capabilities": ["text","media"] }
            }
          ],
          "contacts": [ { "id": "ct_lin", "name": "林小满", "company": "木语家居", "hue": 12 } ],
          "conversations": [
            {
              "id": "cnv_lin", "channelId": "chn_tg", "contactId": "ct_lin", "subject": "破损退款",
              "status": "pending", "priority": "high", "unread": 2, "updatedAt": "2026-11-04T06:59:00.000Z",
              "lastInboundAt": "2026-11-04T06:58:00.000Z", "botPaused": false,
              "tags": ["退款"],
              "messages": [
                { "id": "m1", "direction": "in", "kind": "text", "text": "你好", "status": "received",
                  "createdAt": "2026-11-04T06:58:00.000Z", "attachments": [],
                  "translation": { "text": "Hello", "targetLanguage": "zh-CN" } }
              ]
            }
          ],
          "events": []
        }
        """.trimIndent(),
    )

    @Test
    fun `snapshot parses workspace channels contacts and conversations`() {
        val snapshot = DtoParser.parseSnapshot(snapshotJson)
        assertEquals(12, snapshot.revision)
        assertEquals("木语家居客服", snapshot.workspace.name)
        assertTrue(snapshot.workspace.botEnabled)
        assertEquals(1, snapshot.channels.size)
        assertEquals(1, snapshot.platforms.size)
        assertEquals(1, snapshot.conversations.size)
        assertEquals(2, snapshot.unreadTotal)
        assertEquals("林小满", snapshot.contact("ct_lin")?.name)

        val conversation = snapshot.conversations.first()
        assertEquals("pending", conversation.status)
        assertEquals("Hello", conversation.messages.first().translation)
        assertEquals(1, conversation.tags.size)

        val channel = snapshot.channels.first()
        assertEquals("connected", channel.health)
        assertEquals("@muyu_bot", channel.account)
        assertEquals(326, channel.inbound)
        assertTrue(channel.official)
        assertFalse(channel.supportsQr)
        assertTrue(channel.configuredSecrets["botToken"] == true)
        assertEquals("Telegram", channel.platformLabel)
    }

    @Test
    fun `catalog platforms keep fields and setup steps`() {
        val platform = DtoParser.parseSnapshot(snapshotJson).platforms.first()
        assertEquals("telegram", platform.id)
        assertEquals(1, platform.fields.size)
        val field = platform.fields.first()
        assertTrue(field.secret)
        assertTrue(field.required)
        assertEquals("在 BotFather 生成 token", platform.steps(chinese = true).first())
    }

    @Test
    fun `update manifest parses the published version`() {
        val info = DtoParser.parseUpdate(
            JSONObject(
                """
                { "ok": true, "app": { "versionCode": 3, "versionName": "0.3.0", "minSdk": 26,
                  "notes": "收件箱优化", "sha256": "abc", "size": 1024,
                  "apkPath": "/api/im-omni.app.apk" } }
                """.trimIndent(),
            ),
        )
        assertEquals(3, info.versionCode)
        assertEquals("0.3.0", info.versionName)
        assertEquals(1024L, info.size)
        assertEquals("/api/im-omni.app.apk", info.apkPath)
    }

    @Test(expected = ApiException::class)
    fun `update manifest without a version is rejected`() {
        DtoParser.parseUpdate(JSONObject("""{ "ok": true, "app": { "versionCode": 0 } }"""))
    }

    @Test
    fun `malformed channel records degrade instead of throwing`() {
        val snapshot = DtoParser.parseSnapshot(JSONObject("""{ "channels": [ {} ], "contacts": [ {} ] }"""))
        assertEquals(1, snapshot.channels.size)
        assertNotNull(snapshot.channels.first().name)
        assertEquals("Unknown", snapshot.contacts.first().name)
    }
}
