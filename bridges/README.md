# DSH IM Bridge（个人号扫码参考实现）

个人 WhatsApp 与个人微信都没有可用的官方 Bot API。WhatsApp 默认由 DSH Host 内置 Baileys 扫码，**不需要**本桥接；只有需要把 WhatsApp 会话放到另一台机器时才用这里的 `IM_BRIDGE_KIND=whatsapp`。微信个人号目前需要本桥接。

> 这是**可选的参考实现**。WhatsApp 内置模式已随插件提供；微信个人号需要桥接。非官方协议可能违反平台条款并导致封号；生产客服请优先使用 WhatsApp Business Cloud API 和企业微信。当前环境没有真实个人号凭据，因此本目录的供应商连接未做真机验证；DSH 侧的协议、鉴权和 UI 已通过 mock bridge 验证。

## 1. 安装

```bash
cd bridges
npm install                 # 安装 qrcode
npm install baileys         # WhatsApp，二选一
npm install wechaty wechaty-puppet-wechat4u   # 微信，二选一
```

`qrcode` 是必装依赖；`baileys` / `wechaty` 只在对应 `IM_BRIDGE_KIND` 下动态加载。

## 2. 配置

在 DSH「渠道 → WhatsApp 个人号（扫码）/ 微信个人号（扫码）」创建渠道，复制：

- **回调地址**：`http://<DSH-host>:<port>/api/im-omni.webhook/<channelId>`
- **Bridge token**：点「显示敏感值」复制

然后：

```bash
export IM_BRIDGE_KIND=whatsapp          # 或 wechat
export IM_BRIDGE_TOKEN='<复制出的 bridge token>'
export IM_OMNI_WEBHOOK='http://127.0.0.1:8081/api/im-omni.webhook/<channelId>'
export IM_BRIDGE_PORT=8790
export IM_BRIDGE_STATE_DIR="$PWD/.sessions"
# 微信还需要：
export WECHATY_PUPPET=wechaty-puppet-wechat4u
node server.mjs
```

在渠道配置中把 **Bridge URL** 设为 `http://127.0.0.1:8790`，保存后点「扫码登录」。二维码会通过桥接返回 data URL 并在 DSH 弹窗中显示；登录态由 `.sessions/` 保存。

> DSH 服务在 Docker/另一台机器时，把 `IM_OMNI_WEBHOOK` 改成桥接进程可达的 DSH 地址，并确保桥接端口只对可信网络开放。

## 3. 协议（DSH 与桥接之间）

所有请求带 `Authorization: Bearer <IM_BRIDGE_TOKEN>`：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/session/start` | 启动/复用会话，返回 `{status,qrDataUrl,account,detail}` |
| `GET` | `/session/status?session=default` | 当前状态 |
| `GET` | `/session/qr?session=default` | 重新取二维码 |
| `POST` | `/messages/send` | `{session,to,text,messageId}`，返回 `{ok,id}` |
| `GET` | `/health` | 无鉴权健康检查 |

`status` 取值：`starting | waiting | scanning | connected | disconnected | error`。`qrDataUrl` 必须是 `data:image/png|jpeg|webp;base64,...`。

桥接入站消息 POST 到 DSH 回调，使用同一个 Bearer token：

```json
{
  "event": "message.created",
  "externalConversationId": "1203630...@g.us",
  "externalMessageId": "3EB0...",
  "contact": { "id": "86138...@s.whatsapp.net", "name": "Lin Yue" },
  "message": { "text": "Hello", "attachments": [] },
  "timestamp": "2026-10-31T00:00:00.000Z"
}
```

`externalConversationId` 是回复目标：WhatsApp 用 JID，微信个人号用 contact/room id。DSH 会把它用于 `/messages/send` 的 `to`。

## 4. 已知边界

- 个人号协议不是官方能力，登录态、封号、风控、媒体下载都由桥接端承担；本参考实现只处理文本。
- 微信需要可用的 Wechaty puppet；不同 puppet 的登录方式和稳定性不同。
- 群聊、引用、撤回、已读、富媒体需要扩展桥接协议；DSH 目前的文本收发与统一收件箱已可用。
- 不要把桥接端口暴露到公网；生产请放在内网，或加 TLS 与网络访问控制。
