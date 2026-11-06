# dsh-im-omni 架构（按"多人共用"重排）

> 出发点（来自产品要求）：多人共用一套收件箱；渠道号码与数据按员工权限隔离；隔离必须由服务端强制；
> 功能要长在插件里，而不是另开一个要让用户记地址的站点；每个事实只有一个真源。

![目标架构](./architecture-target.png)

## 1. 四个运行单元

| # | 单元 | 位置 | 职责 | 不做什么 |
| --- | --- | --- | --- | --- |
| ① | 插件 UI | `client.js`（DSH 页面内） | 收件箱、渠道、团队权限、设置、详情页配置 | 不做权限判断；不直连团队 API |
| ② | Host 半边 | `index.js` + `lib/*` | 本机能力（命令/媒体/通知/升级）、API 兜底代理 | 不再是团队数据真源 |
| ③ | 接入层 | nginx `/im-omni-api/` | 同源转发到 team-api | 不做业务判断 |
| ④ | 团队服务 | `server/`（Node + Postgres） | 鉴权、成员与授权、审批、审计、设置 | 不做界面 |

## 2. 一条主链路（读数据）

```
面板 proxySaas('/v1/...')            ← 只带 JWT，不带 tenant 猜测
  → /im-omni-api/v1/...              ← 同源：无 CORS、无混合内容
    → authenticate()                 ← JWT → userId
      → withTenant(tenantId, fn, userId)   ← 事务内 SET app.tenant_id / app.user_id
        → Postgres RLS               ← 行级策略决定"看得见哪些行"
          → 403 out-of-scope / 404 not-found
```

**关键点**：隔离发生在数据库，不在 UI。"前端隐藏"从来不算隔离。

## 3. 权限模型（单一规则，两处使用）

| 概念 | 存储 | 说明 |
| --- | --- | --- |
| 角色 | `memberships.role` | owner / admin / agent / viewer，提供**默认**范围 |
| 成员授权 | `memberships.permissions` | `dataScope`（all/own）+ `channelIds`，**覆盖默认** |
| 生效判定 | `app_scope()` / `app_channel_ids()` | SQL 函数，策略直接调用 |
| 危险操作 | `confirmEmail` + `approval_requests` + `audit_logs` | 确认 → 复核 → 追溯 |

角色只决定默认值；"这个人能看什么"永远由 `permissionOf()` 的合成结果回答。

## 4. 危险操作三件套

```
改可见范围 / 改角色 / 移除成员 / 删渠道
  ├─ 1. 确认：必须输入目标邮箱（防误触）
  ├─ 2. 复核：管理员 → approval_requests(202)；所有者 → 直接执行
  └─ 3. 追溯：变更与审批同事务写 audit_logs
```

## 5. 边界规则（防止再次跑偏）

| 关注点 | 唯一负责方 | 明确禁止 |
| --- | --- | --- |
| 谁能看哪些号码/会话 | team-api + Postgres RLS | 前端过滤、按 UI 隐藏 |
| 权限变更历史 | `audit_logs` | Host JSON、插件本地文件 |
| 用户入口 | 插件面板「团队权限」 | 让用户记 `:8090/admin` |
| 本机离线数据 | Host `store.js` | 与团队数据双写 |
| 升级来源 | Host `lib/upgrade.js` | 把 github.com 当单点 |

## 6. 现状 vs 目标

| 项 | 现状 | 目标 | 差距 |
| --- | --- | --- | --- |
| 面板入口 | 已有「团队权限」标签页 | 唯一入口 | ✅ |
| 详情页配置 | 登录后走 v1，未登录走 Host | 只保留登录态路径 | 🟡 双路径并存 |
| 团队数据 | team-api 为准 | 唯一真源 | 🟡 Host store 仍存历史字段 |
| 管理页 | `:8090/admin` 仍可访问 | 降级为运维只读 | 🟡 两个界面 |
| 升级 | 依赖 github.com | remote 可配置 + 备用源 | ❌ 未做 |
| Host 代理 | 已实现 `/api/im-omni.saas` | 保留为兜底 | ✅ |

## 7. 迁移顺序（每步可验收）

1. **收口入口**：详情页配置去掉"未登录写本机"分支，统一要求登录（离线只读快照）。
2. **收口数据**：Host store 只保留 `token`、`lastSnapshot` 与本机渠道配置，不再存成员/权限。
3. **收口管理页**：`:8090/admin` 加开关默认关闭，仅运维只读；所有写操作从面板发起。
4. **升级解耦**：`IM_OMNI_UPGRADE_REMOTE` 支持自定义 remote / 备用源，GitHub 不可用时可切换。
5. **通知升级**：审批与提醒同时支持企业微信与站内（面板红点）。

## 8. 验收口径

- `node --test`（server 87 + 插件升级/代理 14）全绿；
- 越权访问返回 403 且不泄露名字；跨租户返回 404；
- 授权变更下一次请求即生效（无缓存）；
- 面板内完成：登录 → 授权 → 提案 → 批准 → 审计可见；
- `origin/main == HEAD`。
