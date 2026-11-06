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

## 9. 要不要拆成「聊天 / 权限 / 配置」三个插件包？

![拆分判断](./plugin-split-decision.png)

**结论：现在不拆，先把"缝"留在模块边界上；满足触发条件再拆。**

### 9.1 为什么现在不拆

1. **拆包不拆数据**：三个包仍然调同一个 team-api。权限安全来自服务端 RLS，和有几个包无关。
2. **登录态成本**：DSH 每个插件包是独立面板与独立宿主上下文。拆开后要么三次登录，要么做一个
   `@omni/core` 共享包（session + proxy + 类型）。没有 core 就拆 = 三份代理、三套真相。
3. **当前体量**：`client.js` 一个包，三个视图共享一次登录、一次构建、一次回滚，边际成本最低。
4. **前车之鉴**：我们刚因为"两个真相"（Host store vs SaaS、`:8090/admin` vs 面板）返工过两次。
   拆包会再制造一次同类风险。

### 9.2 现在该做的：把模块缝留好

| 模块 | 现有落点 | 拆分时会变成 |
| --- | --- | --- |
| chat（收件箱/渠道/群发） | 面板 `tab` 视图 | `@omni/chat` |
| access（成员/审批/审计） | `TeamView` + `/v1/members`、`/v1/approvals` | `@omni/access` |
| settings（通知/接待/升级） | 详情页四组 + `SettingsView` | `@omni/settings` |
| 共享 | `proxySaas()`、登录态、错误语义 | `@omni/core` |

**硬约束**：任何视图不得自行拼 API 地址或自己解析 token——只允许经 `proxySaas()`，这样拆包时
core 可以原样抽走。

### 9.3 什么时候真的拆

| 触发条件 | 结论 |
| --- | --- |
| 权限 UI 需要独立安装给管理员（聊天的 agent 不需要） | 拆 |
| 发布节奏不同（聊天周更、权限月更），回滚要互不影响 | 拆 |
| 不同负责人/团队，需要合同化边界 | 拆 |
| 只是"结构上觉得应该分" | 不拆，继续分模块 |

### 9.4 若拆，按这个顺序

1. 先抽 `@omni/core`（proxySaas / session / 错误码 / 类型），主包改为依赖它——**功能零变化**；
2. 把 access 视图整块搬到 `@omni/access`，复用 core；
3. 最后搬 settings；
4. team-api 不动：服务端永远是唯一的权限与数据真源。

### 9.5 落地结果（按"管理员单独装、客服只装聊天"执行）

| 包 | 装给谁 | 内容 | 状态 |
| --- | --- | --- | --- |
| `dsh-im-omni` | 客服 | 收件箱、渠道、模板、群发、自动化、数据分析、设置、详情页配置 | ✅ 已移除「团队权限」标签 |
| `dsh-im-omni-access` | 管理员 | 团队权限面板：登录 → 成员授权 → 审批 → 审计 | ✅ 已建包并 link 进 profile |

- 访问插件独立包：`/home/pro/dsh/dsh-im-omni-access`（自带 `package.json`、`cordis.patch.yml`、
  侧栏入口 order 47、Host 兜底代理 `/api/im-omni-access.saas`）。
- profile 注册：`~/.dsh-src/profiles/web/package.json` 增加 `link:` 依赖与 bundles 条目，`pnpm install` 已链接。
- **生效需要重启 dsh**（宿主侧插件在启动时加载）；重启后侧栏会多出「团队权限」，聊天面板不再有该标签。
- team-api 未改动：两个包共用同一服务与同一套 RLS。

### 10. 打开即登录，权限决定界面

面板不再"打开就是收件箱"，而是先过一道闸：

```
打开面板
  ├─ 本地有 token → /v1/me 校验 → 有效则进入
  ├─ 无 token / 失效 → 登录页（邮箱 + 密码），登录后存 token
  └─ 进入后：角色决定可见标签与可做操作（服务端返回，前端只按结果渲染）
```

| 角色 | 可见标签 | 不可见 |
| --- | --- | --- |
| owner / admin | 全部 | — |
| agent | 收件箱、联系人、快捷回复、数据分析、设置 | 渠道、自动化、群发 |
| viewer | 收件箱、联系人、数据分析、设置 | 同上 + 只读 |

- token 存 `localStorage['im-omni.session']`；失效自动清除并回到登录页。
- 越权标签即使被强行切过去，也会立刻回落到收件箱，且数据仍受服务端 RLS 约束（前端隐藏只是体验层）。

截图：`docs/panel-login-gate.png`。
