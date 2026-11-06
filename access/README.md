# dsh-im-omni-access

管理员侧的团队权限面板：登录团队服务 → 按员工分配渠道号码 → 审批高权限变更 → 查看审计。

## 为什么独立成包

客服只装 `dsh-im-omni`（收件箱）；管理员额外装这个包。两个包共用同一个 team-api，
权限判断始终在服务端（Postgres RLS），插件只负责界面。

## 安装

```bash
# 在 profile 里 link 本包，然后重启 dsh
cd ~/.dsh-src/profiles/web
# package.json: "dsh-im-omni-access": "link:/home/pro/dsh/dsh-im-omni-access"
pnpm install
dsh restart   # 或 systemctl --user restart dsh-web
```

面板出现在侧边栏「团队权限」，用团队账号登录（不是 DSH 账号）。

## 配置

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `IM_OMNI_SAAS` | `http://127.0.0.1:8090` | team-api 地址（Host 兜底代使用） |
