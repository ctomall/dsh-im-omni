# IM Omni API v1

> 状态：规格稿（v0.1）。手机为主客户端的接口契约。
> 现有 `/api/im-omni.state` / `.command` 保留，v1 是其之上的面向移动端的封装。

> 多租户与账号体系见 `SAAS-ARCHITECTURE.md`。下文接口默认带租户上下文：
> `Authorization: Bearer <accessToken>`，租户由 token 声明或 `X-Tenant-Id` 指定。

## 0.0 实现状态

本文件是**契约**，不等于全部已实现。状态以 `server/src/app.mjs` 的路由为准，
并由 `server/test/docs-consistency.test.mjs` 自动校验（文档与代码不一致时测试失败）。

| 能力 | 端点 | 状态 |
| --- | --- | --- |
| 注册 / 登录 / 刷新 | `POST /v1/auth/{register,login,refresh}` | ✅ 已实现 |
| 切换租户 | `POST /v1/auth/switch` | ✅ 已实现 |
| 我的信息 | `GET /v1/me` | ✅ 已实现 |
| 管理页 | `GET /admin` | ✅ 已实现（团队权限分配，登录后按员工勾选可见号码） |
| 租户 / 成员 | `POST /v1/tenants`、`GET /v1/tenants/{id}/members`、`PATCH /v1/tenants/{id}/members/{userId}`、`GET /v1/tenants/{id}/audit` | ✅ 已实现（PATCH 分配可见范围并写审计，audit 返回最近变更） |
| 邀请 | `POST /v1/tenants/{id}/invites`、`POST /v1/invites/accept` | ✅ 已实现 |
| 设备 | `POST /v1/devices/{code,link,register}`、`GET /v1/devices`、`DELETE /v1/devices/{id}` | ✅ 已实现 |
| 会话列表 | `GET /v1/conversations` | ✅ 已实现（无分页，限 50 条） |
| 联系人 / 渠道 | `GET /v1/contacts`、`GET /v1/channels`、`GET /v1/channels/{id}` | ✅ 已实现（按成员权限范围隔离） |
| 会话消息 / 已读 / 属性 | `GET /v1/conversations/{id}/messages`、`POST /v1/conversations/{id}/read`、`PATCH /v1/conversations/{id}` | ✅ 已实现 |
| 发消息 | `POST /v1/messages` | ✅ 已实现（幂等 + 配额 + 计量） |
| 计费 | `GET /v1/billing/{plan,usage,invoices}`、`POST /v1/billing/invoices`、`POST /v1/billing/invoices/{id}/status` | ✅ 已实现 |
| 运维 | `GET /healthz`、`GET /metrics` | ✅ 已实现 |
| 入站回调 | `POST /v1/webhooks/{channelId}` | ✅ 已实现（HMAC 验签、外部 id 幂等） |
| 通知设置 | `GET /v1/settings/notify`、`PUT /v1/settings/notify`、`POST /v1/settings/notify/test` | ✅ 已实现（企业微信群机器人） |
| 增量同步 | `GET /v1/sync`、`GET /v1/bootstrap` | ⏳ 规划中（S2 数据面迁移） |
| 增量同步游标 | `GET /sync?cursor=` | ⏳ 规划中 |
| 会话属性更新 | `PATCH /v1/conversations/{id}`、`POST /v1/conversations/{id}/read` | ⏳ 规划中 |
| 搜索 | `GET /v1/messages?q=` | ⏳ 规划中 |
| 附件 | `POST /v1/attachments`、`GET /v1/attachments/{id}` | ⏳ 规划中 |
| 推送注册 | `POST /v1/devices/{id}/push` | ⏳ 规划中（当前用企业微信机器人） |

## 0. 通用

- **Base**：`https://<host>/api/im-omni/v1`
- **鉴权**：`Authorization: Bearer <deviceToken>`（配对时颁发，长期有效，可撤销）
- **内容类型**：`application/json; charset=utf-8`（上传除外）
- **时间**：ISO-8601 UTC，例如 `2026-11-04T14:00:00.000Z`
- **ID**：字符串，服务端生成，前缀区分类型（`cnv_`、`msg_`、`ct_`、`chn_`、`dev_`）
- **幂等**：所有写操作接受 `Idempotency-Key` 头（或 body 里的 `clientId`），24h 内重复请求返回同一结果
- **错误**：`{ "error": { "code": "...", "message": "...", "retryable": true } }`

| HTTP | code | 含义 | 客户端动作 |
| --- | --- | --- | --- |
| 400 | `bad-request` | 参数错误 | 修参数 |
| 401 | `unauthorized` | token 失效 | 重新配对 |
| 403 | `forbidden` | 无权限 | 提示 |
| 404 | `not-found` | 对象不存在 | 刷新列表 |
| 409 | `conflict` | 状态冲突（如已发送） | 刷新后重试 |
| 422 | `invalid` | 业务校验失败 | 展示 message |
| 429 | `rate-limited` | 限流 | 按 `Retry-After` 退避 |
| 5xx | `server-error` | 服务端错误 | 指数退避重试 |

## 1A. 账号 / 租户

### POST /auth/register · POST /auth/login · POST /auth/refresh

```json
// POST /auth/login
{ "email": "a@corp.com", "password": "..." }
// 200
{
  "accessToken": "eyJ...", "expiresIn": 900,
  "refreshToken": "rt_...",
  "user": { "id": "usr_1", "name": "阿杰", "email": "a@corp.com" },
  "tenants": [ { "id": "tnt_1", "name": "售后团队", "role": "admin" } ]
}
```

### GET /me

当前用户 + 所属租户 + 角色。

### GET /tenants/{id}/members · POST /tenants/{id}/invites

成员列表与邀请（`role`、有效期 7 天）。

### POST /devices/link

已登录账号绑定一台手机（替代过去"扫码即登录"）。

```json
{ "code": "K7F2-91QX", "deviceName": "Pixel 7", "platform": "android" }
// 200 { "deviceToken": "dt_...", "deviceId": "dev_...", "tenantId": "tnt_1" }
```

### GET /billing/plan · GET /billing/usage · GET /billing/invoices

当前套餐、本期用量（消息/AI/席位/渠道）、历史账单。写操作在控制台。

## 1. 配对 / 设备

### POST /pair

用一次性配对码换取设备 token（手机扫 Host 的码，或粘贴链接）。

```json
// 请求
{ "code": "M93AUDU2", "deviceName": "Pixel 7", "platform": "android" }
// 200
{
  "deviceToken": "dt_...",
  "deviceId": "dev_...",
  "workspace": { "id": "ws_1", "name": "售后工作区", "timezone": "Asia/Shanghai" }
}
```

错误：`401 pair-code-invalid`（无效/过期）、`429 pair-too-many`。

### GET /devices

返回当前账号的已配对设备。

### DELETE /devices/{deviceId}

撤销某设备（其他设备或控制台执行后，该设备下次请求返回 401）。

### POST /devices/{deviceId}/push

```json
{ "provider": "fcm|hms|xiaomi|apns", "token": "...", "locale": "zh-CN" }
```

### DELETE /devices/{deviceId}/push

登出或 token 轮换时调用。

## 2. 同步

### GET /sync?cursor={revision}

增量同步（手机前台恢复、推送到达后调用）。

```json
// 200
{
  "revision": 1234,
  "hasMore": false,
  "reset": false,
  "upserts": {
    "channels": [{ "id": "chn_wa", "name": "售后 WhatsApp", "type": "whatsapp_cloud", "health": "ok", "status": "active" }],
    "contacts": [{ "id": "ct_lin", "name": "林小满", "company": "木语家居", "hue": 12 }],
    "conversations": [{
      "id": "cnv_lin", "channelId": "chn_wa", "contactId": "ct_lin",
      "status": "open", "priority": "normal", "unread": 2, "tags": ["退款"],
      "assigneeId": "agt_1", "firstResponseAt": "2026-11-04T10:54:05.092Z",
      "lastInboundAt": "2026-11-04T12:49:00.000Z", "updatedAt": "2026-11-04T12:49:00.000Z",
      "lastMessage": { "id": "msg_9", "text": "如果退款的话大概多久到账？", "direction": "in", "createdAt": "..." }
    }],
    "messages": [{ "id": "msg_9", "conversationId": "cnv_lin", "direction": "in", "kind": "text", "text": "...", "status": "received", "createdAt": "...", "attachments": [] }]
  },
  "deletions": { "conversations": ["cnv_old"], "messages": ["msg_3"] }
}
```

- 无变更时 `revision` 不变、`upserts` 为空对象。
- 超过 500 条 `hasMore=true`，客户端带新 `cursor={revision}` 继续。
- `reset=true`：Host 数据重建，客户端清本地并全量重拉（保留 outbox）。

### GET /bootstrap

首次配对或 reset 后的一次性拉取：workspace + 账号 + 联系人 + 第一页会话 + 最近 200 条消息。返回结构同 `/sync` 全量。

## 3. 会话

### GET /conversations?cursor=&limit=50&filter=all|unread|pending

```json
{ "items": [ ...会话对象... ], "nextCursor": "cnv_lin", "unreadTotal": 7 }
```

### GET /conversations/{id}/messages?before={messageId}&limit=50

```json
{ "items": [ ...消息对象... ], "nextCursor": "msg_42", "hasMore": true }
```

### POST /conversations/{id}/read

```json
{ "upToMessageId": "msg_9" }   // 可省略，默认全部
```

### PATCH /conversations/{id}

```json
{ "status": "solved", "assigneeId": "agt_2", "priority": "high", "tags": ["退款","加急"], "botPaused": true }
```

字段均可选；`assigneeId: ""` 表示取消分配。返回更新后的会话对象。

### POST /conversations/{id}/typing（可选）

`{ "typing": true }`，用于 Host 向渠道侧转发"正在输入"。

## 4. 消息

### POST /messages

发送一条消息（幂等）。

```json
{
  "clientId": "c3f1...-uuid",
  "conversationId": "cnv_lin",
  "kind": "text",                 // text | note | attachment
  "text": "稍后给您补发",
  "attachments": ["att_1"]        // kind=attachment 时
}
// 201
{ "message": { "id": "msg_10", "status": "queued", ... }, "revision": 1235 }
```

- `kind=note` 为内部备注，不发给客户。
- 重复 `clientId` 返回 200 与同一条消息（不重复发送）。

### POST /messages/{id}/retry

重发失败消息（`status=failed`）。返回 `202` 与 `{ "revision": ... }`。

### GET /messages?q={keyword}&conversationId=&limit=50

服务端搜索（本地 FTS 未命中时兜底）。

## 5. 附件

### POST /attachments

两步上传：

1. `POST /attachments { "name": "photo.png", "type": "image/png", "size": 105887 }`
   → `{ "attachmentId": "att_1", "uploadUrl": "https://...", "expiresIn": 600 }`
2. 直接 `PUT uploadUrl` 上传字节（`content-type` 必须一致）。
3. 完成后 `POST /attachments/{id}/complete` → `{ "url": "https://..." }`。

### GET /attachments/{id}?thumb=1

返回字节流；`thumb=1` 时返回缩略图（缺失则回退原图）。

## 6. 兼容层

| v1 | 映射到旧命令 |
| --- | --- |
| `POST /messages` | `message.send` / `message.note` |
| `POST /messages/{id}/retry` | `message.retry` |
| `POST /conversations/{id}/read` | `conversation.read` |
| `PATCH /conversations/{id}` | `conversation.update` / `conversation.bot` |
| `POST /pair` | 现有配对流程（`/phone/pair`） |

## 7. 版本策略

- 路径版本（`/v1`）不轻改；新增字段向后兼容。
- 删除/改语义时开 `/v2`，`/v1` 至少保留一个大版本。
- 客户端在 `User-Agent` 中带 App 版本，服务端可做灰度与强制升级（`426 upgrade-required`）。

## 8. 限流

| 端点 | 限制 |
| --- | --- |
| `POST /messages` | 60 次/分钟/设备 |
| `GET /sync` | 120 次/分钟/设备 |
| `POST /pair` | 15 次/10 分钟/IP |

超限返回 `429` + `Retry-After`（秒）。
