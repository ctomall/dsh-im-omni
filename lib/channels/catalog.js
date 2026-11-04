/**
 * Channel platform catalog.
 *
 * This module is the single source of truth for the configuration surface,
 * setup copy, and transport capabilities the Host and Client halves share.
 * Every value in a field marked `secret` is redacted from browser snapshots.
 * @module @local/im-omni/lib/channels/catalog
 */

/** @typedef {{zh:string,en:string}} Localized */
/** @typedef {{key:string,type?:string,label:Localized,hint?:Localized,placeholder?:Localized,required?:boolean,secret?:boolean,auto?:boolean,options?:Array<{value:string,label:Localized}>}} ChannelField */

/**
 * One platform definition.
 * @typedef {{
 *   id:string,
 *   label:Localized,
 *   caption:Localized,
 *   badge:string,
 *   hue:number,
 *   transport:'webhook'|'polling'|'gateway'|'bridge',
 *   official:boolean,
 *   capabilities:('text'|'media'|'qr'|'group'|'threads')[],
 *   fields:ChannelField[],
 *   setup:{zh:string[],en:string[]},
 *   requiresAny?:string[],
 *   docs:string
 * }} Platform
 */

/** Localized copy helper. */
const l = (zh, en) => ({ zh, en })

/** A required non-secret text field. */
const text = (key, label, hint, placeholder, extra = {}) => ({ key, type: 'text', label, hint, placeholder, required: true, ...extra })
/** A required secret text field. */
const secret = (key, label, hint, placeholder, extra = {}) => ({ key, type: 'password', label, hint, placeholder, required: true, secret: true, ...extra })
/** An optional text field. */
const optional = (key, label, hint, placeholder, extra = {}) => ({ key, type: 'text', label, hint, placeholder, required: false, ...extra })
/** An optional secret field. */
const optionalSecret = (key, label, hint, placeholder, extra = {}) => ({ key, type: 'password', label, hint, placeholder, required: false, secret: true, ...extra })
/** A select field. */
const select = (key, label, options, hint, extra = {}) => ({
  key,
  type: 'select',
  label,
  hint,
  required: true,
  options: options.map(([value, zh, en]) => ({ value, label: l(zh, en) })),
  ...extra,
})

/** @type {Platform[]} */
export const PLATFORMS = [
  {
    id: 'whatsapp_cloud',
    label: l('WhatsApp Business', 'WhatsApp Business'),
    caption: l('Meta Cloud API，官方 Webhook 与 Graph 发送接口', 'Meta Cloud API with official webhooks and Graph sends'),
    badge: 'WA',
    hue: 142,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'media'],
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [
      text('phoneNumberId', l('电话号码 ID', 'Phone number ID'), l('Meta 应用 → WhatsApp → API Setup 中的号码 ID', 'WhatsApp → API Setup in your Meta app'), '109876543210987'),
      optional('businessAccountId', l('WhatsApp 商业账户 ID', 'WhatsApp Business Account ID'), l('可选，用于排查与审计', 'Optional, useful for diagnostics'), '102290129340398'),
      secret('accessToken', l('System User 访问令牌', 'System user access token'), l('建议使用永不过期的 System User token', 'Prefer a non-expiring system-user token'), 'EAAG...'),
      text('verifyToken', l('Webhook 校验 token', 'Webhook verify token'), l('自定义字符串，Meta 回调校验时回传', 'A string you choose; Meta echoes it during verification'), 'dsh-wa-...', { auto: true }),
      secret('appSecret', l('Meta App Secret', 'Meta app secret'), l('用于校验 X-Hub-Signature-256', 'Verifies X-Hub-Signature-256'), 'App secret'),
      optional('graphVersion', l('Graph API 版本', 'Graph API version'), l('默认 v23.0；升级前请核对 Meta 变更日志', 'Defaults to v23.0'), 'v23.0'),
    ],
    setup: {
      zh: [
        '在 Meta for Developers 创建 Business 应用并添加 WhatsApp 产品，完成 Business Verification 与号码绑定。',
        '生成 System User 永久 token，授予 whatsapp_business_messaging 与 whatsapp_business_management 权限。',
        '把 Phone number ID、token、App secret 填入本渠道；Webhook verify token 可留空自动生成。',
        '在 Meta → WhatsApp → Configuration 把 Callback URL 设为下方地址，Verify token 与页面一致，并订阅 messages 字段。',
        '点击“测试连接”会调用 Graph 读取号码信息；给测试号码发一条消息即可验证入站签名。',
      ],
      en: [
        'Create a Business app in Meta for Developers, add WhatsApp, complete Business Verification, and bind a number.',
        'Create a System User token with whatsapp_business_messaging and whatsapp_business_management.',
        'Enter the Phone number ID, token, and app secret. Leave the verify token empty to generate one.',
        'In WhatsApp → Configuration, set the Callback URL below, match the verify token, and subscribe to the messages field.',
        'Run Test connection to read the phone number through Graph, then message the test number to verify inbound signatures.',
      ],
    },
  },
  {
    id: 'whatsapp_qr',
    label: l('WhatsApp 个人号（扫码）', 'WhatsApp personal (QR)'),
    caption: l('内置 Baileys 扫码，或切换外部桥接；无官方个人号 API', 'Built-in Baileys QR or an external bridge; no official personal API'),
    badge: 'WQ',
    hue: 152,
    transport: 'bridge',
    official: false,
    capabilities: ['text', 'media', 'qr'],
    docs: 'https://github.com/WhiskeySockets/Baileys',
    fields: [
      select('mode', l('连接方式', 'Connection mode'), [['embedded', '内置扫码（推荐）', 'Built-in QR (recommended)'], ['bridge', '外部桥接', 'External bridge']], l('内置模式由 DSH Host 直接运行 Baileys，无需另起服务', 'Built-in runs Baileys inside the DSH Host; no second process needed')),
      optional('bridgeUrl', l('桥接地址（外部模式）', 'Bridge URL (external mode)'), l('仅外部桥接模式必填；内置模式留空', 'Required only for external bridge mode'), 'http://127.0.0.1:8790'),
      optionalSecret('bridgeToken', l('桥接 token（外部模式）', 'Bridge token (external mode)'), l('仅外部桥接模式使用；留空自动生成', 'Used only by external bridge mode; generated when empty'), 'Bridge token', { auto: true }),
      optional('sessionName', l('会话名称', 'Session name'), l('外部桥接端保存的登录会话名', 'Login session name kept by an external bridge'), 'default'),
      optional('displayPhone', l('预期号码（可选）', 'Expected phone (optional)'), l('仅用于展示与核对', 'Display and sanity check only'), '+86 138...'),
    ],
    setup: {
      zh: [
        '个人 WhatsApp 没有官方 Bot API。默认“内置扫码”由 DSH Host 直接运行 Baileys，二维码会自动出现在弹窗中。',
        '点击“扫码登录”，用手机 WhatsApp → 已连接的设备扫描。登录态保存在 Host 的 profile 数据目录，DSH 不保存明文密码。',
        '如需把会话放到另一台机器，连接方式选择“外部桥接”，运行 bridges/ 中的 DSH IM Bridge，并填写 Bridge URL 与 token。',
        '内置模式不需要 Webhook 或公网地址；Host 直接接收消息并写入统一收件箱。',
        '非官方协议存在封号与合规风险；生产客服请优先使用 WhatsApp Business Cloud API。',
      ],
      en: [
        'Personal WhatsApp has no official bot API. The default Built-in QR mode runs Baileys inside the DSH Host and renders the QR in the dialog automatically.',
        'Choose QR login and scan with WhatsApp → Linked devices. The session is stored in the Host profile directory; DSH stores no plaintext password.',
        'To keep the session on another machine, choose External bridge, run bridges/ DSH IM Bridge, and enter its URL and token.',
        'Built-in mode needs no webhook or public URL; the Host receives messages directly.',
        'Unofficial protocols carry account-ban and compliance risk. Prefer WhatsApp Business Cloud API for production support.',
      ],
    },
  },
  {
    id: 'wechat_qr',
    label: l('微信个人号（扫码）', 'WeChat personal (QR)'),
    caption: l('通过 Wechaty/WeChatFerry 桥接扫码登录', 'QR login through a Wechaty/WeChatFerry bridge'),
    badge: 'WX',
    hue: 128,
    transport: 'bridge',
    official: false,
    capabilities: ['text', 'qr', 'group'],
    docs: 'https://wechaty.js.org/',
    fields: [
      text('bridgeUrl', l('桥接地址', 'Bridge URL'), l('Wechaty Gateway 或自建桥接的 HTTP 根地址', 'HTTP root of the Wechaty gateway or your bridge'), 'http://127.0.0.1:8791'),
      secret('bridgeToken', l('桥接 token', 'Bridge token'), l('桥接端与 DSH 共用；留空自动生成', 'Shared with the bridge; generated when empty'), 'Bridge token', { auto: true }),
      optional('sessionName', l('会话名称', 'Session name'), l('桥接端保存的登录会话名', 'Login session name kept by the bridge'), 'default'),
      optional('displayName', l('预期账号（可选）', 'Expected account (optional)'), l('仅用于展示与核对', 'Display and sanity check only'), '客服小助手'),
    ],
    setup: {
      zh: [
        '微信个人号没有官方开放协议，扫码登录必须依赖桥接端。请运行 bridges/ 中的 DSH IM Bridge（Wechaty/WeChatFerry）。',
        '把 Bridge URL 指向桥接服务；Bridge token 留空自动生成，创建后在设置里复制给桥接端。',
        '点击“扫码登录”显示二维码，用微信扫码确认。账号登录态与掉线重连由桥接端负责。',
        '桥接端把消息 POST 到下方 Webhook，Authorization 使用同一个 bridge token。',
        '非官方协议存在封号与合规风险；面向客户的生产场景请优先使用企业微信。',
      ],
      en: [
        'Personal WeChat has no official open protocol, so QR login requires a bridge. Run the DSH IM Bridge (Wechaty/WeChatFerry) under bridges/.',
        'Point Bridge URL at it. Leave the bridge token empty to generate one, then copy it into the bridge.',
        'Choose QR login, scan with WeChat, and confirm. The bridge owns session persistence and reconnect.',
        'The bridge POSTs messages to the Webhook below using the same bearer token.',
        'Unofficial protocols carry account-ban and compliance risk. Prefer WeCom for production customer support.',
      ],
    },
  },
  {
    id: 'wecom',
    label: l('企业微信', 'WeCom'),
    caption: l('自建应用回调，AES 加密 XML 与主动消息发送', 'Self-built app callbacks with AES XML and outbound messages'),
    badge: 'WC',
    hue: 196,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'media'],
    docs: 'https://developer.work.weixin.qq.com/document/path/90930',
    fields: [
      text('corpId', l('企业 Corp ID', 'Corp ID'), l('企业微信管理后台 → 我的企业 → 企业信息', 'My Enterprise → Enterprise Info'), 'wwxxxxxxxxxxxxxxxx'),
      text('agentId', l('应用 Agent ID', 'Agent ID'), l('自建应用 → 应用管理 → AgentId', 'App Management → AgentId'), '1000002'),
      secret('secret', l('应用 Secret', 'App secret'), l('自建应用的 Secret，用于 gettoken', 'App secret used for gettoken'), 'App secret'),
      secret('callbackToken', l('回调 Token', 'Callback token'), l('接收消息服务器配置中的 Token', 'Token from the receive-message server config'), 'Callback token'),
      secret('encodingAESKey', l('EncodingAESKey', 'EncodingAESKey'), l('43 位，接收消息服务器配置中的 EncodingAESKey', '43 characters from the receive-message server config'), '43-character key'),
    ],
    setup: {
      zh: [
        '企业微信管理后台创建自建应用，记录 Corp ID、AgentId 与 Secret。',
        '在“接收消息”中设置 API 接收 URL 为下方地址，生成 Token 与 EncodingAESKey 并填入本渠道。',
        'URL 验证时 DSH 会用 AES-256-CBC 解密 echostr；企业微信要求 5 秒内响应，本插件只做入库。',
        '消息入站使用企业微信 XML 回调，出站调用 message/send；通讯录范围与可信 IP 需允许 DSH 服务器。',
        '点击“测试连接”只校验 gettoken，不发送测试消息。',
      ],
      en: [
        'Create a self-built app in the WeCom admin console and record Corp ID, AgentId, and Secret.',
        'Under Receive Messages, set the API URL below, generate a Token and EncodingAESKey, and enter them here.',
        'DSH decrypts echostr with AES-256-CBC during URL verification. WeCom requires a response within five seconds; the plugin only ingests.',
        'Inbound uses WeCom XML callbacks; outbound calls message/send. Allow the DSH host in trusted IPs and app visibility.',
        'Test connection only validates gettoken; it does not send a test message.',
      ],
    },
  },
  {
    id: 'telegram',
    label: l('Telegram', 'Telegram'),
    caption: l('Bot API，支持长轮询或 Webhook', 'Bot API with long polling or webhooks'),
    badge: 'TG',
    hue: 202,
    transport: 'polling',
    official: true,
    capabilities: ['text', 'media', 'group'],
    docs: 'https://core.telegram.org/bots/api',
    fields: [
      secret('botToken', l('机器人 token', 'Bot token'), l('@BotFather 生成的 token', 'Token from @BotFather'), '123456:ABC...'),
      select('mode', l('接收模式', 'Receiving mode'), [['polling', '长轮询（无需公网）', 'Long polling (no public URL)'], ['webhook', 'Webhook（需公网 HTTPS）', 'Webhook (public HTTPS)']], l('切换后保存即可，Host 会自动启停轮询', 'Saved changes restart polling automatically')),
      optionalSecret('secretToken', l('Webhook secret token', 'Webhook secret token'), l('Webhook 模式建议设置，Telegram 会放在 X-Telegram-Bot-Api-Secret-Token 头', 'Recommended in webhook mode; sent as X-Telegram-Bot-Api-Secret-Token'), 'Secret token'),
      optional('parseMode', l('解析模式', 'Parse mode'), l('留空为纯文本；也可填 HTML 或 MarkdownV2', 'Empty for plain text; HTML or MarkdownV2 allowed'), 'HTML'),
    ],
    setup: {
      zh: [
        '在 Telegram 里找 @BotFather，/newbot 创建机器人并复制 token。',
        '选择长轮询时无需公网，保存后 Host 自动调用 getUpdates；多个 DSH 实例不要共用同一个 token。',
        '选择 Webhook 时，把 setWebhook 指向下方地址，并设置 secret_token；本插件会校验请求头。',
        '（可选）把机器人拉进群并关闭 privacy mode，否则群内只能收到 @ 提及。',
        '点击“测试连接”调用 getMe，确认 token 有效。',
      ],
      en: [
        'Create a bot with @BotFather and copy its token.',
        'Long polling needs no public URL; the Host calls getUpdates after save. Do not share one token across DSH instances.',
        'For webhook mode, call setWebhook with the URL below and a secret_token; the plugin verifies the header.',
        'Optional: add the bot to groups and disable privacy mode to receive all group messages.',
        'Test connection calls getMe to validate the token.',
      ],
    },
  },
  {
    id: 'feishu',
    label: l('飞书 / Lark', 'Feishu / Lark'),
    caption: l('事件订阅 v2，支持 Encrypt Key 与 URL 验证', 'Event subscription v2 with Encrypt Key and URL verification'),
    badge: 'FS',
    hue: 216,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'media', 'group', 'threads'],
    docs: 'https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case',
    fields: [
      text('appId', l('App ID', 'App ID'), l('飞书开放平台 → 凭证与基础信息', 'Developer console → Credentials'), 'cli_xxxxxxxxx'),
      secret('appSecret', l('应用 Secret', 'App secret'), l('用于获取 tenant_access_token', 'Used for tenant_access_token'), 'App secret'),
      optionalSecret('verificationToken', l('Verification Token', 'Verification token'), l('事件订阅 → 加密策略；与 Encrypt Key 至少填一个', 'Event encryption settings; fill this or the Encrypt Key'), 'Verification token'),
      optionalSecret('encryptKey', l('Encrypt Key', 'Encrypt Key'), l('启用加密后必填，用于解密与签名校验', 'Required when encryption is enabled'), 'Encrypt Key'),
      select('domain', l('开放平台', 'Open platform'), [['feishu', '飞书（open.feishu.cn）', 'Feishu (open.feishu.cn)'], ['lark', 'Lark（open.larksuite.com）', 'Lark (open.larksuite.com)']], l('按租户所在区域选择', 'Choose the tenant region')),
    ],
    requiresAny: ['verificationToken', 'encryptKey'],
    setup: {
      zh: [
        '在飞书开放平台创建企业自建应用，开启“机器人”能力并申请 im:message 与 im:message:send_as_bot 权限。',
        '事件订阅选择“将事件发送至开发者服务器”，请求地址填下方 URL。',
        '复制 Verification Token 和/或 Encrypt Key；启用加密时必须填 Encrypt Key，签名校验才会通过。',
        '订阅 im.message.receive_v1，发布应用并把机器人加入需要接待的群。',
        'URL 验证时 DSH 会回显 challenge；点击“测试连接”会获取 tenant_access_token。',
      ],
      en: [
        'Create a custom app in the Feishu console, enable Bot, and request im:message and im:message:send_as_bot.',
        'Choose Send events to developer server and use the URL below.',
        'Copy the Verification Token and/or Encrypt Key. With encryption on, the Encrypt Key is required for signature verification.',
        'Subscribe to im.message.receive_v1, publish the app, and add the bot to target chats.',
        'DSH echoes the challenge during URL verification. Test connection fetches tenant_access_token.',
      ],
    },
  },
  {
    id: 'slack',
    label: l('Slack', 'Slack'),
    caption: l('Events API 签名校验与 chat.postMessage', 'Events API signature checks and chat.postMessage'),
    badge: 'SL',
    hue: 292,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'media', 'group', 'threads'],
    docs: 'https://api.slack.com/events-api',
    fields: [
      secret('botToken', l('机器人 OAuth token', 'Bot user OAuth token'), l('xoxb- 开头，需 chat:write 与 users:read', 'Starts with xoxb-; needs chat:write and users:read'), 'xoxb-...'),
      secret('signingSecret', l('Signing Secret', 'Signing secret'), l('App Credentials → Signing Secret', 'App Credentials → Signing Secret'), 'Signing secret'),
      optional('appId', l('App ID（可选）', 'App ID (optional)'), l('仅用于展示', 'Display only'), 'A0...'),
    ],
    setup: {
      zh: [
        '在 api.slack.com/apps 创建 App，Bot Token Scopes 至少添加 chat:write、users:read、channels:history、groups:history。',
        'Event Subscriptions 开启并填下方 Request URL；DSH 会处理 url_verification challenge。',
        '订阅 message.channels、message.groups、message.im、app_mention（按需）。',
        'Install App 到工作区，复制 Bot token 与 Signing Secret。',
        '点击“测试连接”调用 auth.test；事件请求必须在 3 秒内响应，本插件仅入库，自动回复走异步发送。',
      ],
      en: [
        'Create an app at api.slack.com/apps. Add chat:write, users:read, channels:history, and groups:history scopes.',
        'Enable Event Subscriptions with the Request URL below; DSH handles the url_verification challenge.',
        'Subscribe to message.channels, message.groups, message.im, and app_mention as needed.',
        'Install the app, then copy the bot token and signing secret.',
        'Test connection calls auth.test. Slack expects a response within three seconds; ingestion is synchronous and replies are async.',
      ],
    },
  },
  {
    id: 'discord',
    label: l('Discord', 'Discord'),
    caption: l('Bot Gateway 长连接，无需公网回调', 'Bot Gateway connection; no public callback required'),
    badge: 'DC',
    hue: 236,
    transport: 'gateway',
    official: true,
    capabilities: ['text', 'media', 'group', 'threads'],
    docs: 'https://discord.com/developers/docs/topics/gateway',
    fields: [
      secret('botToken', l('机器人 token', 'Bot token'), l('Developer Portal → Bot → Reset Token', 'Developer Portal → Bot → Reset Token'), 'Bot token'),
      optional('applicationId', l('Application ID（可选）', 'Application ID (optional)'), l('仅用于展示', 'Display only'), '1234567890'),
      optional('guildId', l('Guild ID（可选）', 'Guild ID (optional)'), l('只接收指定服务器；留空接收全部', 'Only this guild; empty for all'), '1234567890'),
    ],
    setup: {
      zh: [
        '在 Discord Developer Portal 创建 Application → Bot，复制 token。',
        '在 Bot → Privileged Gateway Intents 开启 MESSAGE CONTENT INTENT，否则消息内容为空。',
        'OAuth2 URL Generator 勾选 bot 与 Send Messages、Read Message History，邀请机器人进服务器。',
        '保存后 Host 会建立 Gateway 长连接并自动重连；不需要公网 Webhook。',
        '点击“测试连接”调用 /users/@me。DM 需要与机器人先建立会话。',
      ],
      en: [
        'Create an Application → Bot in the Discord Developer Portal and copy the token.',
        'Enable MESSAGE CONTENT INTENT under Bot → Privileged Gateway Intents, or message content is empty.',
        'Use the OAuth2 URL Generator with bot, Send Messages, and Read Message History to invite the bot.',
        'After saving, the Host opens and reconnects the Gateway; no public webhook is needed.',
        'Test connection calls /users/@me. DMs require an existing conversation with the bot.',
      ],
    },
  },
  {
    id: 'line',
    label: l('LINE', 'LINE'),
    caption: l('Messaging API，HMAC 签名与 push 发送', 'Messaging API with HMAC signatures and push sends'),
    badge: 'LN',
    hue: 96,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'media', 'group'],
    docs: 'https://developers.line.biz/en/docs/messaging-api/',
    fields: [
      secret('channelSecret', l('Channel secret', 'Channel secret'), l('LINE Developers → Basic settings', 'LINE Developers → Basic settings'), 'Channel secret'),
      secret('channelAccessToken', l('Channel access token', 'Channel access token'), l('Messaging API → Channel access token (long-lived)', 'Messaging API → long-lived channel access token'), 'Channel access token'),
      optional('botUserId', l('机器人 user ID（可选）', 'Bot user ID (optional)'), l('用于忽略机器人自己的消息', 'Used to ignore the bot itself'), 'U...'),
    ],
    setup: {
      zh: [
        '在 LINE Developers 创建 Messaging API channel，复制 Channel secret 与长期 Channel access token。',
        'Messaging API 设置里把 Webhook URL 填为下方地址并启用 Use webhook；关闭自动回复消息。',
        '把机器人加为好友或拉进群；push API 可主动发送，无需 reply token，但受官方频控与好友关系限制。',
        '签名头为 X-Line-Signature，DSH 用 channel secret 做 HMAC-SHA256/base64 校验。',
        '点击“测试连接”调用 /v2/bot/info。',
      ],
      en: [
        'Create a Messaging API channel in LINE Developers and copy the channel secret and long-lived access token.',
        'Set the Webhook URL below and enable Use webhook; disable auto-reply messages.',
        'Add the bot as a friend or into a group. Push API sends proactively without a reply token, subject to LINE rate limits and friendship.',
        'The X-Line-Signature header is verified as HMAC-SHA256/base64 with the channel secret.',
        'Test connection calls /v2/bot/info.',
      ],
    },
  },
  {
    id: 'dingtalk',
    label: l('钉钉', 'DingTalk'),
    caption: l('机器人回调签名，应用 API 或会话 Webhook 回复', 'Robot callback signatures with app API or session webhook replies'),
    badge: 'DT',
    hue: 32,
    transport: 'webhook',
    official: true,
    capabilities: ['text', 'group'],
    docs: 'https://open.dingtalk.com/document/orgapp/robots',
    fields: [
      optionalSecret('signSecret', l('机器人加签密钥', 'Robot sign secret'), l('机器人安全设置中的“加签”密钥，强烈建议配置', 'Signing secret from robot security settings; strongly recommended'), 'SEC...'),
      optionalSecret('appKey', l('AppKey / Client ID（可选）', 'AppKey / Client ID (optional)'), l('配置后可主动发消息；否则仅能在会话 Webhook 有效期内回复', 'Enables proactive sends; otherwise replies only inside the session webhook window'), 'ding...'),
      optionalSecret('appSecret', l('AppSecret / Client Secret（可选）', 'AppSecret / Client Secret (optional)'), l('与 AppKey 配对', 'Pairs with AppKey'), 'AppSecret'),
      optional('robotCode', l('Robot code（可选）', 'Robot code (optional)'), l('通常与 AppKey 相同', 'Usually the same as AppKey'), 'ding...'),
      select('conversationType', l('会话类型', 'Conversation type'), [['group', '群聊', 'Group'], ['single', '单聊', 'Direct']], l('主动发送时用于选择接口', 'Selects the proactive send endpoint')),
    ],
    requiresAny: ['signSecret', 'appKey'],
    setup: {
      zh: [
        '在钉钉开放平台创建企业内部应用，添加机器人并发布；记录 AppKey、AppSecret、RobotCode。',
        '机器人“消息接收地址”填下方 URL；安全设置建议启用“加签”，把密钥填入 Robot sign secret。',
        '入站回调签名 = Base64(HMAC-SHA256(timestamp + "\\n" + secret))，DSH 会校验 timestamp 与 sign。',
        '有 AppKey/AppSecret/RobotCode 时主动发送；否则只在消息附带的 sessionWebhook 1.5 小时有效期内回复。',
        '点击“测试连接”在配置了应用凭据时获取 accessToken。',
      ],
      en: [
        'Create an internal DingTalk app, add a robot, publish it, and record AppKey, AppSecret, and RobotCode.',
        'Set the robot receive URL below. Enable signing in security settings and enter the secret.',
        'Callback sign = Base64(HMAC-SHA256(timestamp + "\\n" + secret)); DSH verifies timestamp and sign.',
        'With app credentials it sends proactively; otherwise replies only within the 1.5-hour sessionWebhook window.',
        'Test connection fetches accessToken when app credentials are configured.',
      ],
    },
  },
  {
    id: 'webhook',
    label: l('通用 HTTP 桥接', 'Custom HTTP bridge'),
    caption: l('任意能发 HTTP 的 IM；自带 token/HMAC 与出站回调', 'Any HTTP-capable IM with token/HMAC auth and outbound callbacks'),
    badge: 'HTTP',
    hue: 210,
    transport: 'webhook',
    official: false,
    capabilities: ['text', 'media'],
    docs: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST',
    fields: [
      optional('outboundUrl', l('出站地址', 'Outbound URL'), l('DSH 把回复 POST 到这里；留空则只收不发', 'DSH POSTs replies here; leave empty to receive only'), 'https://bridge.example.com/im/outbound'),
      optionalSecret('bridgeToken', l('入站 token', 'Inbound token'), l('留空自动使用渠道 secret', 'Empty uses the channel secret'), 'Bridge token', { auto: true }),
    ],
    setup: {
      zh: [
        '适合自建客服、官网 Widget、其他厂商的 HTTP 机器人或没有原生适配器的 IM。',
        '把消息 POST 到下方 Webhook，使用 token 或 HMAC 签名；字段说明见「桥接协议」。',
        '配置 Outbound URL 后，DSH 会把回复 POST 过去，并带 x-im-omni-signature。',
        '点击“测试连接”会向 Outbound URL 发送 ping；未配置出站地址时只校验本地配置。',
      ],
      en: [
        'Use this for in-house chat, website widgets, other vendors’ HTTP bots, or any IM without a native adapter.',
        'POST messages to the Webhook with a token or HMAC signature; see the bridge protocol below.',
        'With an Outbound URL, DSH POSTs replies there with x-im-omni-signature.',
        'Test connection pings the Outbound URL; without one it only validates local configuration.',
      ],
    },
  },
]

/** Index platforms by id. */
const BY_ID = new Map(PLATFORMS.map((platform) => [platform.id, platform]))

/**
 * Look up one platform definition.
 * @param {string} id - platform id.
 * @returns {Platform|undefined} definition.
 */
export function platformOf(id) {
  return BY_ID.get(id)
}

/**
 * Public catalog without any secret material.
 * @returns {Platform[]} catalog copy.
 */
export function publicCatalog() {
  return structuredClone(PLATFORMS)
}

/**
 * All field keys that hold a secret for a platform.
 * @param {string} type - platform id.
 * @returns {string[]} secret keys.
 */
export function secretFields(type) {
  return (platformOf(type)?.fields ?? []).filter((field) => field.secret).map((field) => field.key)
}

/**
 * All fields that may be generated when empty.
 * @param {string} type - platform id.
 * @returns {string[]} auto keys.
 */
export function autoFields(type) {
  return (platformOf(type)?.fields ?? []).filter((field) => field.auto).map((field) => field.key)
}

/**
 * Localized label for a platform.
 * @param {string} type - platform id.
 * @param {string} [lang] - zh or en.
 * @returns {string} label.
 */
export function platformLabel(type, lang = 'en') {
  const label = platformOf(type)?.label
  return label === undefined ? type : (lang.startsWith('zh') ? label.zh : label.en)
}
