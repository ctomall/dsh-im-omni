# IM Omni API v1

> 状态：规格稿（v0.1）。手机为主客户端的接口契约。
> 现有 `/api/im-omni.state` / `.command` 保留，v1 是其之上的面向移动端的封装。

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
