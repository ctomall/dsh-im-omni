# 渠道配置与使用

本文对应插件 **dsh-im-omni 2.0.0**。所有渠道最终进入同一个收件箱；区别只在「消息怎么进来」和「回复怎么出去」。

## 0. 通用前提

1. 打开 DSH Web GUI → 左侧栏 **全渠道 IM** → **渠道** → **添加渠道**。
2. 选择平台，填写凭据。创建后打开 **接入设置**，里面会给出该渠道专属的回调地址、接入步骤和凭据摘要。
3. 回调基地址是当前 DSH Web 的公网地址：

   ```text
   https://<你的 DSH 域名>/api/im-omni.webhook/<channelId>
   ```

   本地 `http://127.0.0.1:8081` 只适合 Telegram 长轮询、Discord Gateway 和本机桥接。WhatsApp Cloud、企业微信、飞书、Slack、LINE、钉钉的官方回调通常要求公网 HTTPS，请用反向代理把 DSH 暴露为 HTTPS，并把域名填到对应平台后台。
4. 凭据保存在 Host 侧 `state.json`（文件权限 0600）。浏览器快照只显示 `••••••••`；点「显示敏感值」才会通过 owner-authenticated 命令返回明文。不要截图或转发该弹窗。
5. 新渠道先点 **测试连接**，再发一条真实消息验收入站。收到首条消息后渠道健康状态会变为「已连接」。

> 出站都是「文本」发送。WhatsApp Cloud 的 24 小时客服窗口、LINE 的好友关系、钉钉的 sessionWebhook 有效期等平台限制仍然适用；窗口外请使用平台模板/主动消息能力。

---

## 1. WhatsApp Business（Meta Cloud API）

**适用**：有 Meta Business 账号、已完成 Business Verification 的官方客户服务。

### 配置

| 字段 | 从哪里取 |
| --- | --- |
| Phone number ID | Meta App → WhatsApp → API Setup |
| WhatsApp Business Account ID | 可选，API Setup / Business Settings |
| System user access token | Business Settings → System Users，授予 `whatsapp_business_messaging`、`whatsapp_business_management` |
| Webhook verify token | 自定义字符串，可留空自动生成 |
| Meta app secret | App Settings → Basic → App Secret |
| Graph API version | 默认 `v23.0`，可留空 |

### 平台侧

1. Meta App → WhatsApp → Configuration → Webhook：
   - Callback URL：接入设置里的地址
   - Verify token：与渠道中一致
   - 订阅 `messages` 字段
2. 用测试号码给业务号码发一条消息，再在收件箱确认。
3. 点「测试连接」会调用 Graph 读取 `display_phone_number` 和 `verified_name`。

### 行为与限制

- 入站校验 `X-Hub-Signature-256`（HMAC-SHA256(raw body, app secret)）；GET 校验 `hub.verify_token` 并回显 `hub.challenge`。
- 联系人身份使用 `wa_id`；会话 `externalId` 也是 `wa_id`，回复走 `POST /{phoneNumberId}/messages`。
- 文本、按钮回复、交互回复、位置会转成文本；图片/文件只保留占位文本和媒体元数据，不转存媒体。
- 24 小时窗口外发送会失败并在消息上显示 Graph 错误；需要模板消息时请扩展 `lib/channels/whatsapp-cloud.js`。
- 官方文档：<https://developers.facebook.com/docs/whatsapp/cloud-api>

---

## 2. WhatsApp 个人号（扫码）

个人 WhatsApp 没有官方 Bot API。插件默认提供 **内置扫码**：由 DSH Host 直接运行 Baileys，点击「扫码登录」即可在 DSH 弹窗里得到二维码，不需要另起服务。也可以切换为外部桥接，把会话放到另一台机器。

### 配置（内置扫码，推荐）

1. 在插件目录安装依赖（本地 link/源码运行时）：

   ```bash
   cd /home/ubuntu/ctomall/im-omni
   npm install
   ```

2. 渠道 → 添加渠道 → WhatsApp 个人号（扫码）。
3. 「连接方式」保持 **内置扫码**，`Bridge URL` 留空；保存后点「扫码登录」。
4. 手机 WhatsApp → 已连接的设备 → 扫码。登录态保存在 Host 的 profile 数据目录（`whatsapp-auth/<channelId>`），DSH 不保存明文密码。
5. 登录成功后，收到的消息直接进入统一收件箱；回复通过同一个 Socket 发出，不需要 Webhook。

内置模式无公网回调要求，但个人号协议仍需要 Host 能访问 WhatsApp 服务。

### 配置（外部桥接，可选）

1. 运行 [bridges/README.md](../bridges/README.md) 中的 DSH IM Bridge（Baileys）。
2. 渠道「连接方式」选择 **外部桥接**，填写 Bridge URL 与 Bridge token（token 可留空自动生成，保存后在「显示敏感值」复制给桥接端）。
3. 桥接端把消息 POST 到渠道回调；DSH 回复 POST 到桥接 `/messages/send`。

### 限制与风险

- 非官方协议，存在封号、掉线、风控风险；生产请用 Cloud API。
- 内置模式只处理文本；群聊、媒体、引用需要扩展 `lib/channels/whatsapp-embedded.js`。
- 外部桥接的 QR/状态/发送协议与内置模式不同；切换模式后需要重新扫码。
- `Expected phone` 仅用于展示核对。

---

## 3. 微信个人号（扫码）

同样没有官方个人号 API，使用 **DSH IM Bridge**（Wechaty）扫码。企业客户强烈建议改用企业微信。

### 配置

1. 安装 Wechaty 与 puppet：

   ```bash
   cd bridges
   npm install
   npm install wechaty wechaty-puppet-wechat4u
   ```

2. 启动桥接：

   ```bash
   IM_BRIDGE_KIND=wechat \
   IM_BRIDGE_TOKEN='<渠道 bridge token>' \
   IM_OMNI_WEBHOOK='http://127.0.0.1:8081/api/im-omni.webhook/<channelId>' \
   WECHATY_PUPPET=wechaty-puppet-wechat4u \
   node server.mjs
   ```

3. 渠道中填 Bridge URL，保存后复制 token；点「扫码登录」并用微信扫码确认。
4. 入站/出站协议与 WhatsApp 个人号一致：文本通过 `/messages/send` 发送到 `externalId`（联系人 id 或群 room id）。

### 限制

- 非官方协议；个人号风控、封号与合规风险由使用方承担。
- 微信 bridge 的登录稳定性取决于 puppet；不同 puppet 的扫码参数可能不同。
- 只有文本；图片/语音/文件不会转存。
- 收到过某个联系人/群的消息后，桥接才能向它回复（需要缓存对象）。

---

## 4. 企业微信（WeCom）

**适用**：企业自建应用 + 微信插件/客户联系。

### 配置

| 字段 | 从哪里取 |
| --- | --- |
| Corp ID | 管理后台 → 我的企业 → 企业信息 |
| Agent ID | 应用管理 → 自建应用 |
| App secret | 自建应用详情 |
| Callback token | 接收消息服务器配置的 Token |
| EncodingAESKey | 接收消息服务器配置的 43 位 EncodingAESKey |

### 平台侧

1. 管理后台创建自建应用，记录 Corp ID、AgentId、Secret。
2. 应用 → 接收消息 → 设置 API 接收 URL 为接入设置中的回调地址；随机生成 Token 与 EncodingAESKey，填回渠道。
3. 将 DSH 服务器出口 IP 加入企业可信 IP（若启用）。
4. 需要接收消息的应用可见范围包含目标成员/客户。
5. 点「测试连接」调用 `gettoken`，不会发送测试消息。

### 行为

- URL 验证：`GET` 带 `msg_signature/timestamp/nonce/echostr`，DSH 验签后用 AES-256-CBC 解密并返回 echostr。
- 消息回调：`POST` XML（`<Encrypt>`），DSH 解密后解析 `FromUserName`、`MsgType`、`Content`、`MsgId`。
- 出站：`POST /cgi-bin/message/send`，`touser=externalId`，`agentid` 为数字。access_token 内存缓存，401/42001 时刷新一次。
- 只处理文本和常见媒体占位；企业微信要求 5 秒内响应，插件只做入库，实际回复走异步队列。
- 官方文档：<https://developer.work.weixin.qq.com/document/path/90930>

---

## 5. Telegram

**适用**：BotFather 机器人，支持私聊、群、频道。

### 配置

| 字段 | 说明 |
| --- | --- |
| Bot token | `@BotFather` → `/newbot` |
| Receiving mode | `polling`（无需公网）或 `webhook`（公网 HTTPS） |
| Webhook secret token | Webhook 模式建议填写；Telegram 放在 `X-Telegram-Bot-Api-Secret-Token` |
| Parse mode | 留空纯文本；可填 `HTML` / `MarkdownV2` |

### 长轮询（默认）

保存后 Host 自动 `getUpdates`，不需要任何公网地址。多个 DSH 实例不要共用同一个 bot token，否则会互相抢更新。

### Webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://<DSH域名>/api/im-omni.webhook/<channelId>",
    "secret_token": "<secretToken>",
    "allowed_updates": ["message", "channel_post"]
  }'
```

- DSH 校验 `X-Telegram-Bot-Api-Secret-Token`。
- 群消息需要关闭 BotFather 的 privacy mode，或让机器人收到命令/@提及。
- 回复会带 `message_thread_id`（如果会话来自 topic）。
- 测试连接调用 `getMe`。
- 官方文档：<https://core.telegram.org/bots/api>

---

## 6. 飞书 / Lark

**适用**：企业自建应用机器人，事件订阅 v2。

### 配置

| 字段 | 从哪里取 |
| --- | --- |
| App ID / App secret | 开放平台 → 凭证与基础信息 |
| Verification Token | 事件与回调 → 加密策略 |
| Encrypt Key | 同上；启用加密时必填 |
| Open platform | 飞书 `open.feishu.cn` 或 Lark `open.larksuite.com` |

`Verification Token` 与 `Encrypt Key` 至少填一个；启用 Encrypt Key 时必须填，否则签名校验无法通过。

### 平台侧

1. 创建企业自建应用，开启「机器人」能力，申请 `im:message`、`im:message:send_as_bot`（按需再加群/媒体权限）。
2. 事件订阅 → 将事件发送至开发者服务器 → 请求地址填回调 URL。
3. 加密策略复制 Verification Token / Encrypt Key；订阅 `im.message.receive_v1`。
4. 发布应用，把机器人加入目标群；群里 @ 机器人或私聊。
5. 点「测试连接」获取 `tenant_access_token`。

### 行为

- URL 验证：DSH 原样回显 `challenge`（支持加密请求）。
- 签名：`sha256(timestamp + nonce + encryptKey + rawBody)` 与 `X-Lark-Signature` 比对；无 Encrypt Key 时退化为 Verification Token 比对。
- 解密：AES-256-CBC，key = SHA256(Encrypt Key)，前 16 字节为 IV。
- 出站：`POST /open-apis/im/v1/messages?receive_id_type=chat_id`，`receive_id=externalId`，文本内容 JSON 字符串。
- `post` 富文本会拼接文本；图片/文件仅占位。
- 官方文档：<https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>

---

## 7. Slack

**适用**：Slack App（Events API）。

### 配置

| 字段 | 说明 |
| --- | --- |
| Bot user OAuth token | `xoxb-...`，需要 `chat:write`、`users:read`、`channels:history`、`groups:history` |
| Signing secret | App Credentials → Signing Secret |
| App ID | 可选，仅展示 |

### 平台侧

1. api.slack.com/apps 创建 App。
2. OAuth & Permissions 添加上述 scopes。
3. Event Subscriptions 开启，Request URL 填回调地址；DSH 处理 `url_verification` challenge。
4. 订阅 `message.channels`、`message.groups`、`message.im`、`app_mention`（按需）。
5. Install App 到工作区，复制 bot token/signing secret。
6. 点「测试连接」调用 `auth.test`。

### 行为

- 校验 `X-Slack-Signature`：`v0=HMAC-SHA256("v0:timestamp:rawBody", signingSecret)`，并检查时间戳 ±5 分钟。
- 忽略 bot 消息、编辑/删除、频道 join/leave 等 subtype。
- 回复调用 `chat.postMessage`；如果会话是 thread，会带 `thread_ts`。
- Slack 要求 3 秒内响应；插件同步入库，自动回复异步发送。
- 官方文档：<https://api.slack.com/events-api>

---

## 8. Discord

**适用**：Discord Bot，通过 Gateway 长连接接收消息，**无需公网回调**。

### 配置

| 字段 | 说明 |
| --- | --- |
| Bot token | Developer Portal → Bot → Reset Token |
| Application ID | 可选 |
| Guild ID | 可选，只接收指定服务器 |

### 平台侧

1. Developer Portal 创建 Application → Bot，复制 token。
2. Bot → Privileged Gateway Intents 开启 **MESSAGE CONTENT INTENT**（否则消息内容为空）。
3. OAuth2 URL Generator 勾选 `bot` 与 Send Messages、Read Message History，邀请机器人。
4. 保存渠道后 Host 自动建立 Gateway v10 长连接，断线指数退避重连。
5. 点「测试连接」调用 `/users/@me`。

### 行为

- 只接收 `MESSAGE_CREATE`，忽略 bot/自己。
- 消息 >2000 字符按行拆分发送；会话 `externalId` 是 `channel_id`。
- DM 需要先与机器人建立会话；群/频道需要机器人有发送权限。
- 无需填 Webhook URL；如果只想入站不回复，暂停渠道即可。
- 官方文档：<https://discord.com/developers/docs/topics/gateway>

---

## 9. LINE

**适用**：LINE Messaging API 官方机器人。

### 配置

| 字段 | 从哪里取 |
| --- | --- |
| Channel secret | LINE Developers → Basic settings |
| Channel access token | Messaging API → long-lived token |
| Bot user ID | 可选，用于忽略自己 |

### 平台侧

1. 创建 Messaging API channel，复制 secret 与 access token。
2. Messaging API 设置 → Webhook URL 填回调地址 → 启用 Use webhook。
3. 关闭 LINE 后台的自动回复消息，否则会与 DSH 回复重复。
4. 把机器人加为好友或拉进群。
5. 点「测试连接」调用 `/v2/bot/info`。

### 行为

- 校验 `X-Line-Signature` = Base64(HMAC-SHA256(rawBody, channelSecret))。
- 只处理 `message` 事件；`source.userId/groupId/roomId` 作为会话 id。
- 回复走 **push API**（不需要 reply token），受官方频控与好友关系限制。
- 官方文档：<https://developers.line.biz/en/docs/messaging-api/>

---

## 10. 钉钉（DingTalk）

**适用**：企业内部应用机器人。

### 配置

| 字段 | 说明 |
| --- | --- |
| Robot sign secret | 机器人安全设置 → 加签（与 AppKey 至少填一个；强烈建议） |
| AppKey / AppSecret | 企业内部应用凭证（主动发消息需要） |
| Robot code | 通常与 AppKey 相同 |
| Conversation type | 群聊 / 单聊，用于主动发送接口 |

### 平台侧

1. 开放平台创建企业内部应用，添加机器人并发布。
2. 机器人「消息接收地址」填回调 URL。
3. 安全设置启用「加签」，把密钥填入 Robot sign secret；没有加签时至少填写 AppKey。
4. 应用权限/可见范围包含目标群或成员。
5. 点「测试连接」：有应用凭据时获取 accessToken；否则只验证回调模式。

### 行为

- 校验 `timestamp` 与 `sign` = Base64(HMAC-SHA256(timestamp + "\n" + secret))，时间戳容差 1 小时。
- 入站保存 `sessionWebhook` 到会话；有 AppKey/AppSecret/RobotCode 时优先走应用机器人 API（群 `groupMessages/send`、单聊 `oToMessages/batchSend`），否则在 1.5 小时 sessionWebhook 窗口内回复。
- 入站消息文本来自 `text.content` 或 `richText`。
- 官方文档：<https://open.dingtalk.com/document/orgapp/robots>

---

## 11. 通用 HTTP 桥接

**适用**：自建客服、官网 Widget、没有原生适配器的厂商，或想把任意 IM 转成 HTTP。

### 配置

- **Outbound URL**：DSH 把回复 POST 到这里；留空则只收不发。
- **Inbound token**：留空自动生成；入站可用 `?token=`、`x-im-omni-token`、`Authorization: Bearer`，或 `x-im-omni-signature: sha256=<hmac>`。

### 入站

```http
POST /api/im-omni.webhook/<channelId>?token=<bridgeToken>
Content-Type: application/json

{
  "externalConversationId": "thread-123",
  "externalMessageId": "msg-456",
  "contact": { "id": "customer-1", "name": "Lin Yue", "handle": "@lin" },
  "message": {
    "text": "Hello",
    "attachments": [{ "name": "receipt.pdf", "url": "https://example.com/receipt.pdf", "type": "application/pdf" }]
  },
  "timestamp": "2026-10-31T01:00:00.000Z"
}
```

响应 `202`，包含 `conversationId`、`messageId`、`duplicate`。重复 `externalMessageId` 不会重复入库。

### 出站

DSH POST 到 `outboundUrl`：

```json
{
  "event": "message.created",
  "channelId": "chn_...",
  "conversation": { "id": "cnv_...", "externalId": "thread-123", "status": "open" },
  "contact": { "id": "ct_...", "name": "Lin Yue", "handle": "@lin" },
  "message": { "id": "msg_...", "text": "Our reply", "direction": "out", "createdAt": "..." }
}
```

请求头带 `x-im-omni-event` 和 `x-im-omni-signature: sha256=<HMAC-SHA256(rawBody, bridgeToken)>`。非 2xx 会记录失败，可在收件箱重试。

---

## 12. 收件箱使用

- **回复**：打开会话，输入文本回车；消息先 `queued`，出站成功后转 `sent`，失败显示错误并可重试。
- **内部备注**：不会发给客户，只留在会话时间线。
- **状态/优先级/负责人/标签/稍后提醒**：用于协作和 SLA。
- **快捷回复**：支持变量 `{{contact.name}}` 等，可在回复框一键插入。
- **群发**：按联系人标签 + 渠道身份圈选；平台限制（WhatsApp 24h、LINE 好友）仍然适用。
- **自动化**：收到消息/新建会话/会话分配触发，可自动回复、分配、打标签、设优先级。
- **数据分析**：按渠道统计收发量、首次响应、解决时长。

## 13. 排障

| 现象 | 检查 |
| --- | --- |
| URL 验证失败（WhatsApp/WeCom） | 回调是否公网 HTTPS；verify token / Token / AES key 是否与平台一致；反代是否保留 query 与 raw body |
| 入站 401 | 平台签名密钥是否填对；是否经过会改写 body 的代理 |
| 飞书 challenge 失败 | Encrypt Key 是否填；签名头是否被代理丢弃 |
| Telegram 无消息 | bot 是否被拉群/关闭 privacy mode；polling 与 webhook 是否同时启用；token 是否被其他实例占用 |
| Discord 消息为空 | 是否开启 MESSAGE CONTENT INTENT |
| 企业微信 5 秒超时 | DSH 是否可达；是否有慢代理；插件只入库，应快速返回 |
| 回复失败 | 看渠道卡片「最近错误」；WhatsApp 24h 窗口、LINE 好友关系、钉钉 sessionWebhook 过期、Discord 权限 |
| 扫码不显示 | Bridge URL/token 是否正确；桥接是否在运行；`/session/status` 是否返回 `data:image/...` |
| 页面仍显示旧版 UI / 保存表单行为不一致 | 客户端 bundle 是 immutable 缓存；更新插件后必须硬刷新（Ctrl/Cmd+Shift+R）或关闭标签页重开。Host 已重启但浏览器未刷新时会出现“能看到平台、保存却走旧逻辑”的混合状态。 |
