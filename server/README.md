# im-omni-server

多租户 IM 后端（Postgres + RLS）。当前是 S0 骨架：schema、迁移、租户隔离已验证；认证与完整 `/v1` 在 S1。

## 本地起库

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE im_omni_owner LOGIN PASSWORD 'owner_dev_pw';
CREATE ROLE im_omni_app   LOGIN PASSWORD 'app_dev_pw' NOBYPASSRLS;
CREATE DATABASE im_omni_dev OWNER im_omni_owner;
SQL
```

## 迁移与测试

```bash
npm install
node scripts/migrate.mjs          # 应用 migrations/*.sql
node --test                        # 5 个 RLS 隔离用例
node src/server.mjs                # http://127.0.0.1:8090
curl -s localhost:8090/healthz
curl -s -H "x-tenant-id: <uuid>" localhost:8090/v1/conversations
```

## 目录

```
migrations/001_init.sql   租户/用户/成员/设备/渠道/联系人/会话/消息/用量/账单/审计 + RLS
src/db.mjs                连接池 + withTenant（SET LOCAL app.tenant_id）
src/server.mjs            健康检查 + 租户隔离读（S0 占位，S1 接认证）
test/rls.test.mjs         跨租户读不到、写不进、无租户看不到
```

## 设计要点

- **RLS 兜底**：应用层漏写 `tenant_id` 条件也漏不出数据；`FORCE ROW LEVEL SECURITY` 让表属主同样受限
- **消息按月子分区**：`messages` 与 `usage_events` 都是 RANGE 分区，提前建月表
- **幂等**：`client_requests (tenant_id, client_id)` 唯一，重试不重复发
- **凭证加密**：`channels.credentials` 存密文，客户端只读脱敏视图（S1 接 KMS）
