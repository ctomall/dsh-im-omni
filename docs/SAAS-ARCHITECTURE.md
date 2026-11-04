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

## 12. 风险与取舍

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 过早做计费 | 没客户时纯负债 | 先做 `usage_events` 埋点，账单人工 |
| 多租户改造成本 | 数据层全量加 `tenant_id` + RLS + 迁移 | 第一天就加字段，哪怕恒为 1 |
| HA 运维成本 | Patroni/RDS + 监控需要人 | 优先买托管数据库，别自建主从 |
| 消息表膨胀 | 百万级后变慢 | 按月分区 + 冷数据归档 |
| 私有化交付 | 版本碎片 | 只提供单一 Compose 包 + 版本号，不做定制分支 |
