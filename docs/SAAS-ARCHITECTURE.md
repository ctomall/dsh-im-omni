# 多租户 / 账号体系 / 计费 / 高可用

> 状态：规划稿。前提：App 仍走内网分发（不上架），但后端要做成**可对外交付的多租户服务**。
> 与 `ARCHITECTURE.md`（手机为主）配套：那份定义"手机=主客户端"，这份定义"后端如何服务多个客户"。

## 1. 判断：什么时候真的需要多租户

| 形态 | 是否需要 | 说明 |
| --- | --- | --- |
| 只给自己公司一个部门用 | 不需要 | 单租户，一个 `tenant_id` 恒为 1，保留字段即可 |
| 集团/多子公司、多品牌 | **需要（隔离）** | 按组织切租户，数据与成员互不可见 |
| 卖给其他公司（To B SaaS） | **需要（整套）** | 租户 + 账号 + 角色 + 计费 + 配额 |
| 私有化交付（客户自己部署） | 需要 | 单租户实例 + License 校验，不用计费系统 |

结论：字段与鉴权从第一天就按多租户设计（`tenant_id` 必须有），但**计费系统可以最后做**——没有付费客户之前，它只是负债。

## 2. 角色：控制面 / 数据面

```
控制面（低频、可停机）
  ├─ 租户、成员、邀请、角色
  ├─ 订阅、套餐、配额、账单、发票
  └─ 审计、后台管理（运营侧）

数据面（高频、必须稳）
  ├─ 消息收发、同步、Webhook 接入
  ├─ 媒体上传下载
  └─ 推送/通知
```

拆开的好处：计费系统挂了不影响聊天；数据面扩容不牵动控制面。

## 3. 租户与账号模型

```
tenant        (id, name, slug, plan, status, created_at)
user          (id, email, password_hash, name, status, created_at)
membership    (tenant_id, user_id, role, invited_by, joined_at)   PK(tenant_id,user_id)
role          owner | admin | agent | viewer
device        (id, user_id, tenant_id, name, platform, token_hash, last_seen, revoked_at)
```

- 一个用户可属于多个租户 → App 里做**租户切换器**（类似 Slack workspace）。
- 角色决定控制台权限；App 内：`owner/admin` 能看到账号与团队，`agent` 只能会话。
- 邀请：邮件/链接邀请 + 有效期；企业客户支持 **SSO**（OIDC；国内对 企业微信/钉钉 扫码登录）。

### 隔离策略（Postgres）

| 方案 | 隔离强度 | 运维成本 | 建议 |
| --- | --- | --- | --- |
| 共享表 + `tenant_id` + 应用层过滤 | 中（靠代码自觉） | 低 | 不推荐 |
| **共享表 + `tenant_id` + RLS** | 高 | 低 | **推荐** |
| Schema per tenant | 高 | 中（迁移要跑 N 次） | 大客户私有化时考虑 |
| Database per tenant | 最高 | 高 | 顶级客户/合规要求 |

RLS 示例：

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- 每个请求：SET LOCAL app.tenant_id = '<tenant>'
```

连接池要配合：`PgBouncer` 用 transaction 模式，`SET LOCAL` 在事务内生效。

## 4. 认证

| 方式 | 场景 |
| --- | --- |
| 邮箱 + 密码（argon2id） | 默认 |
| 邮箱验证码 / 魔法链接 | 减少密码管理 |
| OIDC / 企业微信 / 钉钉 / 飞书 扫码 | 企业客户首选 |
| 设备绑定（扫码） | App 登录后的**第二因子**：桌面控制台出示码，手机扫 → 绑定设备 |

令牌：

- `access_token`：JWT，15 分钟，含 `sub`、`tenant_id`、`role`、`device_id`
- `refresh_token`：随机串，30 天，服务端存 hash，可撤销（设备列表）
- 请求头：`Authorization: Bearer <access>` + `X-Tenant-Id`（或 token 里的租户）

配对（扫码）流程改为：

```
控制台登录 → 生成一次性 device-code（5 分钟）
手机扫码 → POST /v1/devices/link {code, deviceName} → deviceToken（绑定 user+tenant）
```

这样"扫码"从"进系统的唯一方式"变成"已登录账号绑定设备的动作"，账号体系与设备解耦。

## 5. 数据模型（Postgres）

| 表 | 关键字段 | 索引/分区 |
| --- | --- | --- |
| `tenants` | id, name, plan, status | slug unique |
| `users` | id, email, password_hash | email unique |
| `memberships` | tenant_id, user_id, role | PK(tenant_id,user_id) |
| `devices` | user_id, tenant_id, token_hash, revoked_at | (tenant_id,user_id) |
| `channels` | tenant_id, type, name, credentials(encrypted), health | (tenant_id) |
| `contacts` | tenant_id, name, company, phone, email | (tenant_id, updated_at) |
| `conversations` | tenant_id, channel_id, contact_id, status, assignee_id, priority, tags[] | (tenant_id, updated_at desc) |
| `messages` | tenant_id, conversation_id, direction, kind, text, status, client_id | **分区：按月**；唯一 `(tenant_id, client_id)` 幂等 |
| `attachments` | tenant_id, message_id, object_key, size, type | (tenant_id, message_id) |
| `templates` / `tags` | tenant_id, ... | (tenant_id) |
| `usage_events` | tenant_id, type, quantity, occurred_at | 分区按月 |
| `subscriptions` | tenant_id, plan, status, period_start/end | (tenant_id) |
| `invoices` | tenant_id, period, amount, status | (tenant_id, period) |
| `audit_logs` | tenant_id, actor, action, target, at | (tenant_id, at desc) |

加密：渠道凭证用 KMS/`age` 加密后入库，`revealSecret` 走单独审计。

## 6. 计费

### 套餐维度（示例）

| 套餐 | 席位 | 渠道数 | 月消息量 | AI 额度 | 价格 |
| --- | --- | --- | --- | --- | --- |
| 团队版 | ≤5 | ≤2 | 10,000 | 500 次 | ¥299/月 |
| 商务版 | ≤20 | ≤10 | 100,000 | 5,000 次 | ¥1,299/月 |
| 企业版 | 不限 | 不限 | 不限 | 自定义 | 面谈 |

### 计量点

| 事件 | 触发 | 记录 |
| --- | --- | --- |
| 席位 | 邀请/激活成员 | membership 计数（快照） |
| 渠道 | 接入账号 | channels 计数 |
| 消息 | 每条出站/inbound | `usage_events(type=message)` |
| AI/翻译 | 每次调用 | `usage_events(type=ai, quantity=tokens)` |

### 扣费与提醒

- 计费周期：自然月，`subscriptions.period_*`
- 超配额：软限（提示 + 记录）→ 硬限（拒绝发送/接入）
- 提醒：用量 80% / 100% 邮件 + 控制台横幅
- 支付：国内 **微信支付/支付宝企业 + 对公转账 + 开票**；海外 **Stripe**
- 发票：先做"对公转账 → 后台手动开票"，自动化放后期

### 计费的最小实现（建议）

先用一张 `usage_events` + 一个夜间聚合任务 + 人工生成账单；不要一开始就上支付网关和自动扣款。付费客户 ≥5 家再做自动化。

## 7. 高可用拓扑

```
                    ┌────────────┐
   DNS / CDN ──────▶│  nginx/ALB │
                    └─────┬──────┘
              ┌───────────┴───────────┐
              ▼                       ▼
      app-1 (Node)              app-2 (Node)      ← 无状态，JWT
              │                       │
              ├──────────┬────────────┤
              ▼          ▼            ▼
        PgBouncer   Redis (主从)   MinIO/S3
              │          │            │
              ▼          │            │
     Postgres 主 ──WAL──▶ 备（同步复制, Patroni 自动切换）
              │
              └─▶ WAL 归档 → 对象存储（PITR，保留 7~30 天）
```

| 组件 | 方案 | 说明 |
| --- | --- | --- |
| 应用 | 2+ 实例，nginx 轮询/pin | 无状态；定时任务用单实例锁（`pg_advisory_lock`） |
| 会话/限流 | Redis | 也可放 Postgres，但 Redis 更适合限流与 presence |
| 队列 | BullMQ（Redis） | webhook 处理、推送、计费聚合 |
| 数据库 | Postgres 15+ 主从 + Patroni | 托管 RDS（阿里云/腾讯云/AWS）更省心，推荐直接买 |
| 连接池 | PgBouncer（transaction） | RLS 的 `SET LOCAL` 兼容 |
| 对象存储 | S3/MinIO | 附件与缩略图，签名 URL |
| 监控 | Prometheus + Grafana + Loki；Sentry | 关键指标：webhook 延迟、发送失败率、队列积压、DB 连接数 |
| 备份 | 每日全量 + WAL 连续归档 | 每季度做一次恢复演练 |

### 容量估算（几十个租户、几百席）

- 消息量：100 席 × 200 条/天 ≈ 20k/天 ≈ 60 万/月 → 单机 Postgres 完全够
- 存储：文本 60 万 × 0.5KB ≈ 300MB/月；附件另算（MinIO 便宜）
- 结论：**HA 是为了不停机，不是为了性能**；性能瓶颈会在 webhook 处理与外部 API 限流，而不是数据库

## 8. 部署形态

| 形态 | 技术 | 客户 |
| --- | --- | --- |
| SaaS | Docker Compose（单机起步）→ K8s（多节点） | 中小客户 |
| 私有化 | 一个 `docker-compose.yml`（app + pg + redis + minio）+ License | 大客户/合规要求 |

私有化注意：License 绑定 `tenant_id` + 到期时间；离线激活（签名文件）。

## 9. 迁移路径（从当前单租户 JSON 插件）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **S0**（1 周） | 抽独立服务 `im-omni-server`（Node + Fastify + Postgres），把 `lib/store.js`/`commands.js` 迁过去；DSH 插件退为连接器/开发壳 | 单租户功能等价，数据在 PG |
| **S1**（1~2 周） | 账号 + 租户 + 成员 + RLS + 登录/SSO；App 加登录 + 租户切换；扫码改为设备绑定 | 两个租户数据互不可见（自动化测试） |
| **S2**（1 周） | 用量计量 + 套餐 + 配额限制 + 控制台账单页 | 超配额被正确拦截并提示 |
| **S3**（1~2 周） | Redis + 队列 + 多实例 + Patroni/RDS + 监控备份 | 杀掉一个 app 实例，业务不中断 |
| **S4**（按需） | 支付网关、自动续费、发票自动化；私有化打包 | 第一笔真实收款 |

## 10. 已落地（S0）

```
server/
  migrations/001_init.sql   13 张表（租户/用户/成员/设备/渠道/联系人/会话/消息/用量/订阅/账单/审计/幂等）
                            + RLS（FORCE）+ 月分区（messages、usage_events）
  scripts/migrate.mjs       按文件名顺序迁移，记录 schema_migrations
  src/db.mjs                withTenant：SET LOCAL app.tenant_id，事务级隔离
  src/server.mjs            /healthz + 租户隔离读（S1 接认证）
  test/rls.test.mjs         5 条隔离用例（读不到/写不进/无租户看不到/幂等唯一）
```

本地验证（Postgres 18 + 两个角色 `im_omni_owner` / `im_omni_app`）：

```
applied 001_init.sql
✔ a tenant sees only its own conversations
✔ an unfiltered query still cannot cross tenants
✔ writing a row for another tenant is rejected
✔ a transaction without a tenant sees nothing
✔ message idempotency is unique per tenant
pass 5 / fail 0
```

## 11. 已落地（S1 后端）

```
server/src/auth.mjs   argon2id 口令、HS256 access token（node:crypto）、
                      refresh/device/invite 令牌只存 SHA-256
server/src/app.mjs    POST /v1/auth/{register,login,refresh,switch}
                      GET  /v1/me、GET /v1/tenants/:id/members
                      POST /v1/tenants、POST /v1/tenants/:id/invites、POST /v1/invites/accept
                      POST /v1/devices/code、POST /v1/devices/link
                      GET  /v1/devices、DELETE /v1/devices/:id
                      GET  /v1/conversations（租户隔离）
```

- 登录前需要"先找行、后定租户"的查询（登录列租户、刷新令牌、邀请码、设备码）走
  `SECURITY DEFINER` 函数，函数属主 `im_omni_owner` 具备 BYPASSRLS；API 运行时仍用
  无 BYPASSRLS 的 `im_omni_app`，所以业务路径始终受 RLS 约束。
- 设备令牌就是带 `did` 声明的 access token + refresh token；每次请求校验设备未被撤销，
  撤销立即 401。
- 验证：`node --test` 共 12 个用例（5 RLS + 7 账号/邀请/设备），全绿；注册→me 的 curl 冒烟通过。

## 12. 已落地（S2 计量与配额）

```
server/migrations/004_plans_quotas.sql  plans 目录（trial/team/business/enterprise）
                                        tenant_period_usage(tenant, period)
server/src/usage.mjs                    planOf / usageOf / assertQuota / recordUsage / billingSnapshot
server/src/app.mjs                      GET /v1/billing/plan、GET /v1/billing/usage
                                        POST /v1/messages（配额校验 + 幂等 + 计量）
```

- **先校验后写入**：`assertQuota` 在插入前执行，超限直接 402（`code=quota-exceeded`，带 kind/limit/used），不会留下半条数据。
- **计量与写入同事务**：`recordUsage` 与消息插入在同一事务，回滚不会留下幽灵用量。
- **幂等不重复计费**：重复 `clientId` 返回原消息（200, `idempotent:true`），不再加一条用量。
- 席位配额在邀请接受时校验（`assertQuota(tenant,'seat',1)`）。
- 验证：`node --test` 共 **17** 个用例（5 RLS + 8 账号/设备 + 4 计量配额），全绿。

## 13. 已落地（S3 基线）

```
server/src/metrics.mjs       零依赖计数器 + Prometheus 文本输出
server/src/app.mjs           GET /healthz（含 DB 探活与延迟）、GET /metrics、
                             每个路由的请求数/耗时/配额拒绝计数
server/scripts/backup.sh     pg_dump -Fc + gzip + 保留天数清理
server/scripts/restore-drill.sh  还原到临时库并断言 schema_migrations/tenants
server/docker-compose.dev.yml    postgres + redis + minio + 双 app + nginx
server/nginx.dev.conf        upstream 双实例 + proxy_next_upstream 故障切换
server/Dockerfile            node:22-slim，npm ci --omit=dev
```

**验收证据**

| 项 | 结果 |
| --- | --- |
| 双实例共享库 | 实例 A 登录的 token 在实例 B 直接可用；B 写入的消息 A 立刻读到 |
| 故障注入 | 关闭实例 A 后，实例 B 继续返回 200，并完成注册 → me 全流程 |
| 指标 | `/metrics` 输出 `im_omni_requests_total`、耗时 sum/count、uptime |
| 备份 | `pg_dump -Fc` 60KB，保留策略生效 |
| 恢复演练 | `PASS: restored migrations=4 tenants=104` |

> 仍需下单的真实组件：Redis（限流/队列）、MinIO（附件对象存储）、
> Prometheus+Grafana+Loki、Sentry。它们不阻塞"杀实例不中断"这条验收，
> 已在 compose 里就位，等部署到多节点时启用。

## 14. 已落地（S4 最小闭环：账单台账）

```
server/migrations/005_invoice_period_unique.sql   (tenant_id, period) 唯一，生成幂等
server/src/usage.mjs    currentPeriod / ensureInvoice / setInvoiceStatus / listInvoices
server/src/app.mjs      POST /v1/billing/invoices            （owner/admin，按周期幂等）
                        GET  /v1/billing/invoices
                        POST /v1/billing/invoices/:id/status （issued / paid / void）
```

- 金额取当前套餐月费（`plans.price_cents`），外币字段随套餐；**不做按量计费**，用量只用于配额和超额提示。
- 状态机 `draft → issued → paid`，`void` 可作废；`issued_at` / `paid_at` 自动打点。
- 幂等：同一租户同一周期只有一张账单（DB 唯一索引兜底，非应用层判断）。
- 隔离：其他租户在列表里看不到、按 id 改状态返回 404（RLS + 租户上下文）。
- 验证：**25** 个服务端用例全绿（5 RLS + 8 账号/设备 + 4 计量 + 4 高可用 + 4 账单）。

支付网关（微信/支付宝/Stripe）与自动续费未接：需要商户资质与回调验签，属 S4 的第二段，
接口已按 `status` 设计好，接入时只加"支付回调 → setInvoiceStatus('paid')"一条链路。

## 15. 已落地（发送与投递）

```
server/src/dispatch.mjs       worker：queued → POST channel.config.outboundUrl → sent / 重试 / failed
server/migrations/006_dispatch.sql   attempts、next_attempt_at、queued 索引
server/scripts/echo-webhook.mjs      本地 provider 桥，用于演示与测试
server/src/server.mjs        进程内 3s 调度（DISPATCH_ENABLED=false 可关）
```

- 桥地址来自 `channels.config.outboundUrl`；未配置桥的渠道消息保持 `queued` 并退避 5 分钟，不空转。
- 失败重试 3 次（1s→2s→4s 指数退避），超限置 `failed` 并记录 `error`。
- 渠道 `credentials` 非空时附带 `x-dsh-signature: sha256=<HMAC>`，桥可以验签。
- 投递权限集中在 worker：它用 `DISPATCH_DATABASE_URL`（开发环境为 owner，BYPASSRLS）连接，
  只做投递，不服务任何请求；API 进程仍用无 BYPASSRLS 的 `im_omni_app`。
- 验证：**36** 个服务端用例全绿（新增 3 条：成功投递、失败重试到 failed、无桥退避）；
  端到端在模拟器上完成：App 发送 → 库里 `sent` → 气泡显示 **Sent ✓✓**。

## 16. 已落地（入站回流）

```
server/src/inbound.mjs             provider 回调 → 找客户/会话 → 落库 → unread+1 → 计量
server/migrations/007_inbound_lookup.sql   channel_lookup()：URL 只有 channelId，先解析租户
server/src/app.mjs                 POST /v1/webhooks/{channelId}
```

- 验签：渠道 credentials 非空时要求 x-dsh-signature: sha256=<HMAC(raw body)>，不匹配 401。
- 幂等：externalId 落成 client_id=in:<id>，重复回调返回 200 + duplicate:true。
- 归并：同手机号复用联系人；同渠道同联系人优先落进未解决会话，否则新建。
- 计量：入站同样写 usage_events(type=message)，与出站共用配额。
- 验证：40 个服务端用例全绿；模拟器实拍：curl 打一条回调 → App 刷新出现「王小雨」新会话（未读 1）→ 会话内白色气泡。

## 16. 已落地（通知）

```
server/migrations/008_notify_settings.sql   tenant_notify（RLS，每租户一条）
server/src/notifications.mjs                设置读写、webhook 脱敏、安静时段、卡片构造、发送
server/src/app.mjs                          GET/PUT /v1/settings/notify、POST /v1/settings/notify/test
                                            入站 webhook 提交后异步通知（不阻塞 ack）
```

- 设置里的 webhook 只回显掩码（key=****），保存时空值表示“保持原值”，避免把掩码写回。
- 校验 https；安静时段支持跨零点；privatePreview 时卡片只显示“你有一条新消息”。
- 入站 → 通知是 fire-and-forget，慢机器人不会拖住 provider ack；发送失败只记日志。
- 验证：47 个服务端用例全绿（新增 7 条通知用例）；App 实拍：我 → 企业微信通知，
  点发送测试收到 Test card sent，本地桥收到 markdown 卡片；再打一条入站，
  桥收到 王小雨 · 售后 WhatsApp / 换成蓝色的话还有货吗？。

## 17. 通知深链

- `tenant_notify.link_template`（默认空）里写 `dshomni://chat/{conversationId}`，卡片就带 [打开会话]。
- App 注册了 `dshomni://chat` 的 intent-filter，MainActivity 解析 path 后直接跳到该会话；
  冷启动（有会话）与热启动（onNewIntent）都覆盖。
- 验证：48 个服务端用例全绿；模拟器 `am start -a VIEW -d dshomni://chat/<id>` 直接落在
  「王小雨」会话（三条入站消息可见）。

## 17. 通知降噪：聚合与免打扰

- 免打扰：会话 `muted=true` 时入站照常落库，但不发卡片（服务端在通知前查会话状态）。
- 聚合：`notify_log` 记录每个 (租户, 会话) 的最后发送时间；60 秒窗口内的后续消息只累加
  `suppressed`，不再连发卡片。
- App：会话详情抽屉新增「免打扰」开关，走 `PATCH /v1/conversations/{id}`，本地即时回写。
- 验证：50 个服务端用例全绿（新增：静音会话不响、窗口内两条只发一张且 suppressed>=1）；
  模拟器实拍：开关打开后 `conversations.muted=t`，再打入站消息，本地桥日志行数不变（9→9）。

## 18. 通知降噪的可读性

- 聚合后的下一张卡片附带 `另有 N 条新消息`（读取 notify_log.suppressed 后清零）。
- App 会话列表对被静音的会话显示「铃铛斜杠」图标，位置在未读徽标左侧。
- 验证：51 个服务端用例全绿（新增：窗口外发送时带上 suppressed 计数并清零）；
  模拟器实拍 docs/v1-mute-list.png。

## 19. WhatsApp Cloud 适配器

```
server/src/channels/whatsapp.mjs   sendWhatsapp（Graph 调用）、parseWebhook（Meta 嵌套载荷拍平）
server/src/dispatch.mjs            channel.type=whatsapp_cloud 时走适配器，其余仍用 outboundUrl 桥
server/scripts/fake-graph.mjs       本地 Graph 替身（演示/联调）
```

- 出站：`POST {graphBase}/{phoneNumberId}/messages`，`Authorization: Bearer <channel.credentials>`，
  body 为 `{messaging_product:'whatsapp', to, type:'text', text:{body}}`。
- 入站：只有带 `entry` 的 Meta 信封才拍平；普通 `{phone,name,text}` 仍可直接投给 WA 渠道（兼容自建桥）。
- 验签：WA 渠道用 `config.appSecret` 校验 `x-hub-signature-256`；其他渠道用 credentials 校验 `x-dsh-signature`。
- 验证：54 个服务端用例全绿（新增 3 条 WA：Graph 请求形状、Meta 入站拍平、非消息信封 422）；
  模拟器实拍 docs/v1-whatsapp.png，本地 Graph 收到
  `POST /v20.0/109876543210/messages to=+8613800012345`，消息状态 sent。

## 20. 附件（v1）

```
server/migrations/011_attachments.sql   附件元数据（RLS，object_key 指向磁盘）
server/src/attachments.mjs              写入/读取/关联消息/publicAttachment
server/src/app.mjs                      POST /v1/attachments、GET /v1/attachments/{id}
                                        消息列表返回 attachments 数组；POST /v1/messages 接受 attachments[]
```

- 字节落盘（`UPLOAD_DIR`，按 tenant 分目录 + 随机 key），元数据入 Postgres；对象存储后续替换读写层。
- 下载走鉴权路由，跨租户返回 404；消息鉴权与附件鉴权一致。
- App 端用 `V1Api.attachmentBytes` 拉取，图片气泡直接渲染（截图 docs/v1-attachment.png）。
- 验证：56 个服务端用例全绿（新增 2：上传/关联/下载字节一致；跨租户不可读）。
- 已知：出站投递仍未把附件转成 WhatsApp 媒体对象（先文本），下一轮补。

## 17. 风险与取舍

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 过早做计费 | 没客户时纯负债 | 先做 `usage_events` 埋点，账单人工 |
| 多租户改造成本 | 数据层全量加 `tenant_id` + RLS + 迁移 | 第一天就加字段，哪怕恒为 1 |
| HA 运维成本 | Patroni/RDS + 监控需要人 | 优先买托管数据库，别自建主从 |
| 消息表膨胀 | 百万级后变慢 | 按月分区 + 冷数据归档 |
| 私有化交付 | 版本碎片 | 只提供单一 Compose 包 + 版本号，不做定制分支 |

## 21. 按成员隔离（渠道号码 + 数据）

### 权限模型（按员工授权，不按角色写死）

可见范围是**每个员工的授权**，角色只提供默认值：

| 授权项 | 取值 | 说明 |
| --- | --- | --- |
| `permissions.dataScope` | `all` / `own` | `all` = 整个租户；未显式设置时按角色默认（owner/admin → all，agent/viewer → own） |
| `permissions.channelIds` | 渠道 uuid 数组 | 额外授权的号码；被授权号码上的会话随之可见 |

接口：`PATCH /v1/tenants/{tenantId}/members/{userId}`，body `{ "dataScope": "all" }` 或
`{ "channelIds": ["<channel-uuid>"] }`；只有 owner/admin 能分配，且 `channelIds` 里的渠道必须属于该租户。

`app_scope()` / `app_channel_ids()` 每次查询从 `memberships` 现算，**授权一改，下一次请求立即生效**，没有缓存需要失效。

### 服务端强制（三道）

1. **行级策略**（`migrations/012`、`013`）：`channels`、`conversations`、`contacts` 用 `app_user_id()` + `app_scope()` 过滤；
   `app.user_id` 为空表示系统上下文（webhook、投递器、计量），保留租户级可见性。
2. **请求身份**：`withTenant(tenantId, fn, userId)` 每个请求都带登录成员；路由层 `asMember(claims, fn)` 统一入口。
3. **归属写入**：入站消息建会话时继承渠道的 `owner_user_id`；发消息/改状态/已读前先 `checkScopedAccess()`。

### 403 与 404 的分界

被策略隐藏的行与不存在的行在事务里长得一样，所以用**系统上下文**探测一次：
存在但不在你的范围 → `403 out-of-scope`；不存在 → `404 not-found`。探测只读 `owner_user_id`，不返回业务字段。

### 覆盖的路径

| 路径 | 隔离方式 |
| --- | --- |
| `GET /v1/channels`、`/v1/channels/{id}` | 策略过滤；详情先探测（403/404） |
| `GET /v1/conversations` | 策略过滤 |
| `GET /v1/conversations/{id}/messages` | 先探测会话（403/404） |
| `POST /v1/messages`、`PATCH /v1/conversations/{id}`、`POST …/read` | 先探测会话，拒绝时 403 且不落库 |
| `GET /v1/contacts` | 策略：至少一条可见会话关联 |
| `GET /v1/attachments/{id}` | 附件继承其消息所在会话的可见性 |

### 未覆盖（明说）

- **搜索 / 导出 / 统计**：这三个接口目前不存在，没有可隔离的实现；将来新增时必须在同一策略事务内实现。
- 渠道创建接口不存在（数据来自脚本/测试），所以"新增渠道归属"由直接写入的 `owner_user_id` 决定；建端点时应强制等于当前成员。
- 交接（把会话转给他人）会改变可见性：转出方随即不可见。属于产品决策，尚未实现转让接口。

### 验收测试

`server/test/isolation.test.mjs`（7 条，全部通过）：

```
$ cd server && node --test test/isolation.test.mjs
✔ 只能列出自己的渠道号码
✔ 读他人渠道 → 403 out-of-scope，且响应里没有对方渠道名
✔ 只能列出/读取自己的会话；他人会话 403
✔ 向他人会话发消息 / 改状态 / 标已读 → 403，且没有落库
✔ 联系人跟随可见会话
✔ owner 看全租户
✔ 角色改为 admin 后，下一次请求立即看到全部
```

全量：`cd server && node --test` → **64 passed**。

### 授权界面

`GET /admin`（由 API 进程直接返回的静态页，`server/public/admin.html`）：

- 管理员登录后列出成员，每人一行：`dataScope` 下拉（仅自己 / 整个团队）+ 渠道号码多选 chip
- 勾选即写 `PATCH /v1/tenants/{id}/members/{userId}`，保存成功后重新拉取成员列表
- 非管理员角色登录后整页只读（下拉与勾选均 disabled）
- 只用一个中性色板；品牌绿只出现在主按钮与选中态

截图：`docs/permissions-admin.png`（林小满被授予「售后 WhatsApp」后显示"1 个号码"）、
`docs/permissions-admin-before-grant.png`（授权前）。

### 权限变更审计

- 写入动作（均在同一事务内写 `audit_logs`，`actor_id` 为操作人，`target` 为成员 id）：

| 动作 | 触发点 | `detail` |
| --- | --- | --- |
| `member.permissions` | `PATCH …/members/{userId}` 改可见范围 | `{grant, before, after}` |
| `member.role` | 同上，改角色（仅所有者） | `{grant:{role}, before, after}` |
| `member.join` | 邀请码被接受 | `{email, role, source}` |
| `member.remove` | `DELETE …/members/{userId}`（仅所有者） | `{role}` |

- `GET /v1/tenants/{id}/audit?limit=20&before=<id>` 返回上述四类，按 id 倒序，`before` 为游标；仅 owner/admin 可读（其他人 403）。
- **授权到"整个团队"时告警**：`PATCH` 里 `dataScope=all` 会异步向租户的企业微信机器人推一张卡片
  （`sendPermissionAlert`，复用 `tenant_notify`），不阻塞请求；机器人未配置时静默跳过。
- 管理页「最近变更」卡片展示最近 8 条：`操作人 → 目标成员`、变更内容（整个团队 / 仅自己·N 个号码）、时间（`MM-DD HH:mm`）。
截图：`docs/permissions-admin-audit.png`。

### 放开到「整个团队」需要二次确认

- 服务端：`PATCH …/members/{userId}` 带 `dataScope=all` 时**必须**同时传 `confirmEmail`，且必须与该成员邮箱一致
  （大小写不敏感）；缺失或不符返回 `422 confirm-required`，且**不写入**。
- 页面：把下拉切到「整个团队」不会立即保存，而是在该成员下方展开确认条——写明后果、要求输入对方邮箱，
  只有点「确认放开」且邮箱一致才发请求；取消则回到原状态。
- 组合效果：即使有人绕过页面直接调接口，也过不了确认这一关；页面层只是把同一规则演示得更清楚。

截图：`docs/permissions-confirm-all.png`。

### 移除成员同样要确认

- 服务端：`DELETE …/members/{userId}?confirmEmail=<邮箱>`，邮箱必须与目标成员一致，否则 `422 confirm-required`
  且不删除；仍保留"不能删自己、不能删所有者、缺人 404"。
- 页面：所有者行才有「移除」按钮；点击后在成员下方展开确认条（说明"立即失去访问、历史记录保留"），
  输入对方邮箱后点「确认移除」才发请求。
截图：`docs/permissions-remove-confirm.png`。

### 三类危险操作统一口径

| 操作 | 服务端要求 | 页面 |
| --- | --- | --- |
| 放开到整个团队（`dataScope=all`） | `confirmEmail` 必须等于目标邮箱 | 下拉切换后展开确认条 |
| 改角色（`role` admin/agent） | 同上；且只有所有者可改 | 角色下拉切换后展开确认条 |
| 移除成员（`DELETE`） | `confirmEmail` 作为查询参数，必须匹配 | 「移除」按钮展开确认条 |

三者都做到：**字段缺失或不符 → 422 且不写入**；页面只是同一规则的演示层。
截图：`docs/permissions-role-confirm.png`。

### 审计导出

- `GET /v1/tenants/{id}/audit.csv`：仅 owner/admin；CSV 头 `id,action,created_at,actor_email,target_email,detail`，
  最多 5000 行，`content-disposition: attachment`。
- 页面「最近变更」右上角「导出 CSV」直接下载。
- 隔离保证：导出走同一 `withTenant` 事务 + 角色校验，**不会带出其他租户的行**（测试用另一个租户验证只得到表头）；
  非管理员 403。
截图：`docs/permissions-audit-export.png`。

### 双人复核（管理员提案，所有者批准）

- 规则：**管理员**提出的高权限变更（`dataScope=all` 或改 `role`）不会直接生效，而是落一条
  `approval_requests`（`status=pending`，含 `payload`、`requested_by`），接口返回 **202**。
- 所有者：`GET /v1/tenants/{id}/approvals?status=all` 查看，`POST …/approvals/{approvalId}` 传
  `{decision:"approve"|"reject"}`；批准时在同一事务里应用 `payload` 并写两条审计
  （`member.permissions`/`member.role` + `approval.approved`），拒绝只写 `approval.rejected`。
- 所有者自己操作时**不需要**复核（直接生效），避免自己给自己上审批。
- 提案人不能批准自己的申请（非 owner → 403）。
截图：`docs/permissions-approval.png`（待审批）、`docs/permissions-approved.png`（批准后成员变为整个团队）。

### 复核范围与提醒

- 纳入复核的操作：`dataScope=all`、改 `role`、移除成员、删除渠道（`DELETE /v1/channels/{id}`）。
  渠道下有会话时直接 409，不进审批。
- 提案在 `payload` 里存**名称快照**（`targetName` / `channelName`），审批页直接显示"人/渠道名"，不靠 id 反查。
- `GET …/approvals` 支持 `limit` 与 `before=<created_at>` 游标。
- 提案即时提醒：`notifyProposal()` 向企业微信机器人推一张「待审批 · 权限变更」卡片（未配置机器人则跳过）。
- 超时提醒：`remindStaleApprovals()` 扫 `pending && reminded_at IS NULL && created_at < now()-24h`，
  推「审批仍未处理 · 已超过 24 小时」，成功后写 `reminded_at`，**每条只提醒一次**；
  服务端每小时跑一次（`APPROVAL_REMINDER_MS` 可调，0 关闭）。
  扫描无租户上下文，走 `SECURITY DEFINER` 的 `pending_approvals_due()`，不引入特权连接池。
截图：`docs/permissions-approval.png` / `docs/permissions-approved.png`。
