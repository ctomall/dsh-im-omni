# DSH Omni 架构：手机为主客户端

> 状态：规划稿（v0.1）。描述目标架构、数据归属、同步与推送模型，以及从当前实现的迁移路径。
> 当前实现是"Host 全量快照 + 手机轮询"，本文是把它改成"手机为主"的设计。
> 多租户 / 账号 / 计费 / 高可用见 `SAAS-ARCHITECTURE.md`；内部部署见 `DEPLOYMENT-INTERNAL.md`。

## 1. 现状与目标

### 现状（as built）

```
WhatsApp / Telegram / 企业微信
        │ webhook
        ▼
DSH Host（Node 插件 dsh-im-omni）
  ├─ lib/store.js        权威数据（JSON 文件）
  ├─ lib/commands.js     单一 command switch
  ├─ /api/im-omni.state  全量快照（手机每次轮询）
  ├─ /api/im-omni.command 所有写操作
  └─ client.js           DSH Web 内的聊天 UI
        ▲
        │ 配对 cookie + 轮询
   Android App（薄客户端）
```

问题：全量快照、无增量、无推送、无本地缓存，手机只是"远程显示器"。

### 目标（phone-first）

```
                    ┌──────────────────────────────┐
  渠道 webhook ───▶ │  Host（常驻后端，24×7）        │
                    │  core：接入 / 数据 / AI / 推送 │
                    └───────┬──────────────┬───────┘
                            │ v1 REST      │ 配置/运营 API
                            ▼              ▼
                   ┌────────────────┐  ┌──────────────────┐
                   │ Phone（主客户端）│  │ Web 控制台        │
                   │ Room 缓存+队列  │  │ 账号/团队/模板/审计 │
                   └────────────────┘  └──────────────────┘
```

**原则**

1. 手机负责"用"：日常收发、通知、离线、搜索。
2. Host 负责"活"：接收 webhook、跑 AI/翻译、存权威数据、发推送。手机不能当网关（后台会被杀）。
3. Web 负责"配"：接入、团队、模板群发、审计、看板。
4. 手机不直接依赖 DSH 内部实现，只依赖版本化的 `/api/im-omni/v1/*`。

## 2. 数据归属

| 数据 | 权威来源 | 手机端 | 说明 |
| --- | --- | --- | --- |
| 消息 | Host | Room 缓存 + 出站队列 | 手机可离线写，靠 `clientId` 幂等补发 |
| 会话状态/负责人/标签 | Host | 只读缓存 | 手机改通过 PATCH，Host 回写 revision |
| 联系人 | Host | 只读缓存 | 手机侧可编辑备注（PATCH） |
| 账号配置/密钥 | Host | 不落地 | 只在控制台与账号详情展示脱敏信息 |
| 模板/群发 | Host | 缓存只读 | 管理入口在控制台 |
| 推送 token | Host | 本地加密保存 | 每设备一条，可撤销 |
| 搜索索引 | 手机（本地 FTS）+ Host（全量兜底） | 本地 FTS | 离线可搜 |

## 3. 同步模型

### revision

Host 维护单调递增的 `revision`（与现有 `/api/im-omni.state` 的 `meta.revision` 同源）。任何写操作 +1。

### 客户端游标

手机保存 `lastRevision`，前台恢复时：

```
GET /api/im-omni/v1/sync?cursor=<lastRevision>
→ {
    revision: 1234,
    upserts:  { conversations: [...], messages: [...], contacts: [...], channels: [...] },
    deletions:{ conversations: [...], messages: [...] },
    reset: false          // Host 数据被重建时为 true，手机清库重拉
  }
```

规则：

- `upserts` 只含 `updatedAt > cursor` 的记录；`deletions` 同理（用 tombstone 表）。
- 单次响应限制 500 条；`hasMore=true` 时手机继续拉。
- `reset=true` 时手机清空本地与会话无关的缓存（保留出站队列）。
- 冲突：会话状态类字段 **Host 赢**；消息体 **客户端赢**（本地乐观显示直到 ack）。

### 分页

| 端点 | 默认 | 上限 |
| --- | --- | --- |
| 会话列表 | 50 | 100 |
| 消息 | 50（`before` 游标向旧翻） | 100 |

### 出站队列（outbox）

```
发送 → 写 Room（status=queued, clientId=uuid）
     → POST /v1/messages {clientId, conversationId, text}
     → 200: status=sent（Host 返回消息 id）
     → 5xx/超时: 保留 queued，指数退避重试（2s→4s→8s…上限 5min）
     → 4xx(业务): status=failed，展示重试按钮
```

`clientId` 由 Host 落库去重，重试不会产生重复消息。

## 4. 推送模型

```
Host 收到 inbound ──▶ 查订阅设备 ──▶ 推送
                                     ├─ 海外/有 GMS：FCM
                                     └─ 国内 ROM：华为 HMS / 小米 / OPPO / vivo（或聚合：个推/极光）
```

- 注册：`POST /v1/devices {platform, token, deviceName}` → `deviceId`；卸载/换机 `DELETE /v1/devices/{id}`。
- 载荷最小化：`{ conversationId, messageId, title, body, unread }`；正文按企业策略可脱敏为"你有一条新消息"。
- 折叠：同一会话用 `collapseKey=conversationId`，避免刷屏。
- 通知动作：`Reply`（带 `clientId` 直接进 outbox）、`MarkRead`（`POST /conversations/{id}/read`）。
- 前台：收到推送只作为"有新数据"信号，走增量同步；不直接渲染推送内容。

> 内部自用场景不接厂商推送，改用企业微信/钉钉机器人：见 `docs/DEPLOYMENT-INTERNAL.md` §3。

### 通道决策（若将来对外）

| 场景 | 方案 | 前置条件 |
| --- | --- | --- |
| 海外 / 有 GMS | FCM | Google 账号、`google-services.json` |
| 国内 | 厂商通道 + 聚合 SDK | 各厂商开发者资质、应用上架 |
| 自建内网 | WebSocket 长连接 + 前台服务 | 系统可能杀后台，不保证 |

## 5. 模块边界

### Host（Node）

```
lib/
  core/
    http/        路由与中间件（v1、旧端点兼容层）
    auth/        设备 token、会话、撤销
    sync/        revision、delta 生成、tombstone
    store/       仓储（SQLite 目标，现为 JSON）
    channels/    WhatsApp / Telegram / 企业微信适配器
    push/        设备注册、FCM/HMS 发送
  console/       Web 控制台 API（账号/团队/模板/审计）
```

现有 `lib/commands.js` 的 switch 保留为 v1 的命令实现层，路由层拆薄。

### Android（Compose）

```
data/
  local/    Room：ConversationEntity、MessageEntity、ContactEntity、OutboxEntity、CursorEntity
  remote/   Ktor/OkHttp：/v1/* DTO
  sync/     SyncEngine（增量）、OutboxWorker（WorkManager）
  push/     FirebaseMessagingService（或厂商）
domain/     use case：SendMessage、MarkRead、UpdateConversation
ui/         compose：chat/ inbox/ contacts/ channels/ settings/
```

## 6. 迁移里程碑

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **M0** | Host 增加 `/v1/sync`、分页、幂等发送；手机接入 Room + 增量 | 断网可看历史；飞行模式发送，恢复后不重复不丢失 |
| **M1** | 设备注册 + 推送 + 通知动作 | 锁屏收到消息，通知内直接回复 |
| **M2** | 手机主用：搜索、媒体库、转发、多选、置顶/免打扰 | 连续一周只在手机处理会话 |
| **M3** | 控制台拆分：core / console，补团队/分配/模板/审计 | 新账号接入全程在 Web 完成 |

## 7. 与现有实现的兼容

- 旧端点 `/api/im-omni.state`、`.command` 保留给 Web 控制台与旧版 App，标记 deprecated。
- v1 是对旧命令的**薄封装**：`POST /v1/messages` → `message.send`，`PATCH /conversations/{id}` → `conversation.update`。
- App 升级：`versionCode` 单调递增 + 应用内 updater 已有，继续沿用。
