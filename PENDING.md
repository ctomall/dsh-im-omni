# 待确认项与边界

插件已实现 11 种渠道适配器；以下是需要真实凭据/平台策略才能最终验收的部分。

## 1. 真实平台连通性

- WhatsApp Business：需要 Meta Business 账号、Business Verification、Phone number ID、System User token、App Secret，以及公网 HTTPS 回调。
- WhatsApp 个人号：默认内置 Baileys 已完成 QR 生成与扫码流程；真实登录/收发仍需个人号扫码验收。
- 微信个人号：需要可登录的个人号与 Wechaty 桥接；参考桥接未做真机验证。
- 非官方协议存在封号与合规风险。
- 企业微信：需要 Corp ID、自建应用 AgentId/Secret、回调 Token/EncodingAESKey，以及可信 IP/应用可见范围。
- Telegram：需要 BotFather token；Webhook 模式需要公网 HTTPS，长轮询不需要。
- 飞书/Lark：需要企业自建应用、机器人能力、im 权限、事件订阅地址与 Encrypt Key。
- Slack：需要 App、bot scopes、Signing Secret、Event Subscriptions 与工作区安装。
- Discord：需要 Bot token，并在 Developer Portal 开启 MESSAGE CONTENT INTENT。
- LINE：需要 Messaging API channel、long-lived token、Webhook URL，且机器人需被加好友/拉群。
- 钉钉：需要企业内部应用/机器人、加签密钥；主动发送还需要 AppKey/AppSecret/RobotCode。

当前仓库测试覆盖签名、解密、归一化、mock 出站与 DSH UI；没有在真实租户上完成端到端验收。

## 2. 公网入口

所有官方回调都要求平台能访问 DSH。当前开发实例是 `http://43.157.160.176:5199/`，生产需要：

- HTTPS 反向代理到 DSH Web 端口；
- 保留原始 body（签名需要 raw body）；
- 保留 query（WhatsApp/WeCom 验证）；
- 如启用 IP allowlist，加入各平台出口网段。

## 3. 尚未覆盖的能力

- 入站媒体转存已落地（`lib/media.js`：单附件 12 MB、单条最多 5 个、15 s 超时、按 provider 限定下载域名）；病毒扫描、CDN 签名 URL、大文件分片仍未做；
- WhatsApp 模板消息与 24h 窗口外发送策略；
- 群发退订、频控、发送窗口与审核流；
- 多租户、坐席独立登录与细粒度权限；
- 多 DSH 实例共享状态（当前单进程 JSON）；
- 消息撤回、已读、引用、表情、卡片等平台富事件；
- 个人号桥接的群聊/媒体完整支持；
- 附件保留策略（`DEFAULT_KEEP_DAYS` / 配额）只有常量，尚无执行者。

## 4. 翻译与 AI

- 翻译优先使用 DSH `translator` 服务；当前 profile 未挂载 translator，因此实现回退到 Google Translate 公共端点。启用自动翻译即表示消息文本可能发送给 Google；如不允许出境，请挂载企业翻译 provider 或关闭自动翻译。
- AI 建议回复与自动接待机器人使用 DSH 当前默认模型（live 验证为 `deepseek-official/deepseek-flash`）；会产生模型调用费用。AI 建议只作为草稿；自动接待由设置页开关控制，转人工后暂停。
- 自动接待目前是**上下文对话 + 接待策略**，不会调用订单/CRM/工具，也不会创建 DSH 工具 Agent 会话。需要查订单、退款、物流等真实业务动作时，必须接工具或转人工。
- 目标语言默认 `zh-CN`，可在设置页改为任意 BCP-47/常用语言代码；源语言由翻译提供方自动检测。
- 演示模式默认关闭；已有 demo 数据通过 id 白名单清理，不按“全部清空”处理，以免误删真实记录。

## 5. 安全决策

- 凭据以明文保存在 Host 状态文件（0600），未接 KMS/Vault；如需要，可在 `Store` 前接入 DSH credential service。
- 个人号 bridge token 与 DSH 共享；轮换会同时使入站和扫码状态失效，必须同步桥接端。
- 桥接参考实现绑定 `127.0.0.1`；如跨机部署，请加 TLS、网络 ACL，不要直接暴露公网。
- 钉钉个人号/群聊回复依赖 `sessionWebhook` 1.5h 窗口；主动发送需要应用凭据。
- 入站媒体会落入 `$DSH_PROFILE_DIR/.im-omni/attachments/`（0600）；对外只暴露 `att_*` 标识符，绝对路径与 provider URL 均不进快照。
