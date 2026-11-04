# im-omni-server

多租户 IM 后端（Postgres + RLS）。当前是 S0 骨架：schema、迁移、租户隔离已验证；认证与完整 `/v1` 在 S1。

## 本地起库

```bash
sudo -u postgres psql -f scripts/bootstrap.sql   # 角色 + BYPASSRLS
sudo -u postgres createdb -O im_omni_owner im_omni_dev
```

两个角色的分工是隔离的关键：

| 角色 | 用途 | RLS |
| --- | --- | --- |
| `im_omni_owner` | 建表、迁移、`SECURITY DEFINER` 函数（登录/刷新/邀请/设备码需要"先找行、后定租户"） | **BYPASSRLS** |
| `im_omni_app` | API 运行时连接 | 强制生效（无 BYPASSRLS） |

## 迁移与测试

```bash
npm install
node scripts/migrate.mjs          # 应用 migrations/*.sql
node --test                        # 5 个 RLS + 7 个账号/邀请/设备用例
node src/server.mjs                # http://127.0.0.1:8090
curl -s localhost:8090/healthz
curl -s -H "x-tenant-id: <uuid>" localhost:8090/v1/conversations
```

## 目录

```
migrations/001_init.sql   租户/用户/成员/设备/渠道/联系人/会话/消息/用量/账单/审计 + RLS
migrations/002_auth.sql   刷新令牌/邀请码/设备码 + claim_* 函数
migrations/003_cross_tenant_lookup.sql  登录前所需的跨租户查找函数
scripts/bootstrap.sql     超级用户一次性初始化（角色、BYPASSRLS）
src/db.mjs                连接池 + withTenant（SET LOCAL app.tenant_id）
src/app.mjs               路由：注册/登录/刷新/切换租户/成员/邀请/设备绑定
src/server.mjs            进程入口
test/rls.test.mjs         跨租户读不到、写不进、无租户看不到
```

## 设计要点

- **RLS 兜底**：应用层漏写 `tenant_id` 条件也漏不出数据；`FORCE ROW LEVEL SECURITY` 让表属主同样受限
- **消息按月子分区**：`messages` 与 `usage_events` 都是 RANGE 分区，提前建月表
- **幂等**：`client_requests (tenant_id, client_id)` 唯一，重试不重复发
- **凭证加密**：`channels.credentials` 存密文，客户端只读脱敏视图（S1 接 KMS）
