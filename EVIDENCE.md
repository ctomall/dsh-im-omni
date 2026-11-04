# 验证记录

日期：2026-10-31（Asia/Shanghai）。环境：Linux、Node 24、DSH Web profile `web`。

## 1. 自动化测试

```bash
cd /home/ubuntu/ctomall/im-omni
node --test test/*.test.js
```

结果：**14 passed / 0 failed**。

覆盖内容：

| 测试 | 结果 |
| --- | --- |
| 11 个平台目录项、自动 token、必填校验 | pass |
| 公开快照脱敏 + `configuredSecrets` | pass |
| WhatsApp Cloud challenge、`X-Hub-Signature-256`、消息归一化 | pass |
| Telegram secret token、消息归一化 | pass |
| 飞书 challenge、SHA256 签名、AES-256-CBC 解密 | pass |
| 企业微信 GET echostr、加密 XML、`msg_signature` | pass |
| Slack / LINE / 钉钉 / Discord 签名与归一化 | pass |
| QR bridge 状态、bearer 入站、二维码 data URL | pass |
| 创建渠道 → 入站 → 出站（Telegram，mock API） | pass |
| 通用 HTTP 桥接创建、签名出站 | pass |
| 全部 native adapter 的出站请求（WhatsApp/Telegram/飞书/企微/Slack/Discord/LINE/钉钉/QR） | pass |
| 暂停渠道拒绝入站、非法配置拒绝创建 | pass |

## 2. 浏览器验证

隔离 DSH 实例：`http://127.0.0.1:8097`（复制 profile，未使用用户当前 8081 状态）。Playwright Chromium，zh-CN，1440×1050。

- 左栏出现 **全渠道 IM**，点击进入。
- 渠道页：7 个已启用渠道、11 个平台、0 个待处理；native 渠道卡片显示平台徽标、接入方式、健康状态、统计与回调地址。
- **添加渠道** 弹窗列出全部 11 个平台（WhatsApp Cloud、WhatsApp/微信扫码、企微、Telegram、飞书、Slack、Discord、LINE、钉钉、通用 HTTP）。
- 飞书渠道 **接入设置**：回调地址、5 步接入说明、凭据掩码、显示敏感值、编辑配置。
- WhatsApp 个人号 **扫码登录**：mock bridge 返回真实二维码 data URL，弹窗显示并每 3 秒轮询状态。
- 暗色模式无控制台错误。
- 回归修复：demo 渠道的 `demo://` 出站地址编辑保存曾返回 400；现已允许 `demo://` 并保留编辑表单空值，保存恢复正常。
- 表单 UX：必填/至少一项/自动生成标记；保存与测试错误显示在弹窗顶部，保留后端具体原因；桥接不可达显示可操作提示。
- 当前 profile 的 live 实例已通过伪造的本地 owner cookie 做 API/UI 验证：新建 Telegram/WhatsApp/QR 类型正确，demo 渠道编辑成功，测试连接错误可见；测试渠道已清理。
- **WhatsApp 号码修复**：v2.6.1 起从 `key.senderPn` / `participantPn` 读取真实 PN，用 `senderLid` 作为 alternate identity；LID 不再写入 `phone/handle`，旧 LID 记录会在下一条消息到达时合并到真实号码；自动测试覆盖 LID→PN 合并。
- **页面美化**：重做顶部品牌/标签页、渠道统计卡、平台卡、会话列表、消息气泡、输入框、空工作区引导；亮色/暗色截图无自身控制台错误。
- **取消演示模式**：新 Store 默认 `emptyState()`，`demo:false`；live 已执行 `demo.exit`，删除 3 个 demo 渠道、8 位 demo 联系人/会话及示例模板/规则/群发，保留用户自行创建的 `123` 渠道和 `Hi` 会话；迁移前备份为 `state.before-no-demo.json`。
- mock bridge 入站 POST 返回 `202 {"ok":true,"received":1,"duplicate":false}`，收件箱出现消息。
- **内置 WhatsApp 扫码**：`whatsapp-embedded.js` 直接运行 Baileys，实测在 DSH 弹窗生成 `data:image/png` 二维码，无需外部桥接；`qrcode`/`baileys` 已加入依赖。
- **客户详情默认隐藏**：live 页面初始 `.imoContext` 数量为 0；点「会话详情」后出现，关闭按钮可收起；窄屏为覆盖抽屉。
- **自动翻译**：live 调用 `/api/im-omni.ai` 的 `translateText` 返回 `你好，请问我的订单在哪里？`，检测源语言 `en`；`translateConversation` 将客户消息写入 `message.translation`。DSH `translator` 未挂载时自动回退 Google gtx（`google-http`），设置中可选择目标语言、关闭自动翻译。
- **AI 建议回复**：live 调用 `suggest` 使用默认模型 `deepseek-official/deepseek-flash` 返回 3 条中文草稿；UI 点击填入回复框，不自动发送。
- **自动接待机器人**：隔离实例开启 bot 后，客户发 “What are your support hours?”，机器人自动回复 `Our support hours are 09:00–18:00, Monday–Friday, Asia/Shanghai time. How can I help?`；第二通消息触发 `conversation.botPaused=true`、`status=pending`，记录 `botHandoffReason`，不再自动回复。
- 截图：[channels.png](docs/channels.png)、[channel-new.png](docs/channel-new.png)、[channel-setup.png](docs/channel-setup.png)、[channel-qr.png](docs/channel-qr.png)、[channels-dark.png](docs/channels-dark.png)。

## 3. 安装

```text
plugin_manager remove_bundle @local/im-omni
plugin_manager install_bundle /home/ubuntu/ctomall/im-omni
```

结果：`application: applied`，版本 `2.6.1`。插件为 profile link，修改源码后需按 Plugin Manager 的生效状态刷新/重载；Host 模块替换建议做一次 DSH 重启。隔离实例已验证新代码可启动并注册左侧栏。

## 4. 未验证/边界

- 无真实 WhatsApp/微信/企微/Telegram/飞书/Slack/Discord/LINE/钉钉凭据，真实平台收发未验收。
- 个人号 bridge 的 Baileys/Wechaty 连接未在真机运行；DSH 侧 QR/状态/发送/入站协议已用 mock bridge 验证。
- 回调公网 HTTPS、平台后台配置、IP allowlist 需要部署方完成。
- 媒体只保留元数据/占位，不下载转存。
