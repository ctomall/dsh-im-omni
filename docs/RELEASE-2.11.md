# dsh-im-omni 2.11.0 · 权限治理与团队协作改造

## 一句话

从"单人本地收件箱"升级为"按员工授权、可复核、可追溯"的多人工作台：服务端强制隔离，
管理页与插件详情页共用同一套权限模型。

## 交付清单

| 能力 | 位置 | 证据 |
| --- | --- | --- |
| 按员工的渠道号码/数据隔离 | `server/migrations/012-014`、`src/scope.mjs` | `test/isolation.test.mjs` 23 条 |
| 403（越权）/404（不存在）语义 | `src/app.mjs` `allowScoped()` | 同上，含"不泄露渠道名"断言 |
| 团队权限页（登录/授权/审批/导出） | `server/public/admin.html` + `GET /admin` | `docs/permissions-*.png` |
| 审批快照 / 游标分页 / 超时提醒 | `approvals.mjs`、`migrations/015-017` | `test/approvals.test.mjs` |
| 双人复核（提权/移除/删渠道） | `src/app.mjs` 审批分支 | isolation + approvals |
| 审批/租户级 CSV 导出 | `GET /v1/tenants/{id}/audit.csv` | isolation |
| 服务端搜索（会话/渠道） | `GET /v1/conversations?q=`、`/v1/channels?q=` | isolation |
| 插件详情页团队权限（读写） | `client.js` `团队与权限（SaaS）` | `docs/detail-saas-team.png` |
| 跨域（插件页 → API） | `src/app.mjs` CORS + preflight | `test/admin.test.mjs` |
| 去 slop 视觉规范 | `docs/UNSLOP.md`、`client.js` | `docs/unslop-*`、`docs/detail-*` |

## 权限模型（最终形态）

| 角色 | 默认范围 | 可被单独授权 |
| --- | --- | --- |
| owner | 整个租户 | — |
| admin | 整个租户 | — |
| agent / viewer | 仅自己 | `channelIds` 指定号码；`dataScope=all` 需所有者批准 |

- 判定在数据库行策略 + `checkScopedAccess()`，**改授权下一次请求即生效**（无缓存）。
- 高危变更三件套：`confirmEmail` 确认 → 管理员仅能提案 → 所有者批准 → 审计同事务写入。

## 命令

```bash
cd server
node scripts/migrate.mjs     # 012 → 017
node --test                  # 86 passed
node src/server.mjs          # http://127.0.0.1:8090/admin 团队权限页
```

## 已知边界

- 搜索仅覆盖会话与渠道；消息全文检索未做（当前用 `messages.body ILIKE` 参与会话匹配）。
- 插件详情页的 SaaS 登录态只存在内存，刷新后需重新登录（未接持久化）。
- 未做真实页面点击回归（截图来自 `tools/unslop-preview.mjs` 的复刻渲染）。
