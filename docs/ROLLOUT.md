# 上线与回滚：三个插件包

## 现在装了什么

| 包 | 角色 | 侧栏入口 |
| --- | --- | --- |
| `dsh-im-omni` | 聊天（客服用） | 全渠道 IM |
| `dsh-im-omni-access` | 权限（管理员用） | 团队权限 |
| `dsh-im-omni-core` | 共享模块（无界面） | — |

profile：`~/.dsh-src/profiles/web/package.json` 用 `link:` 指向仓库内 `core/`、`access/`，
`dsh.profile.bundles` 顺序为 **core → chat → access**（消费者必须排在被依赖者之后）。

## 上线（一次受控重启）

```bash
cd ~/.dsh-src/profiles/web && pnpm install --offline
dsh restart            # 或 systemctl --user restart dsh-web
```

重启后自检：

| 检查 | 期望 |
| --- | --- |
| 侧栏 | 多出「团队权限」 |
| 全渠道 IM | 打开是登录闸，不再直接进收件箱 |
| 团队权限 | 登录后看到成员 / 待审批 / 最近变更 |
| 控制台 | `__imOmniConfig.registered === true` |

## 回滚（任一异常）

```bash
cd ~/.dsh-src/profiles/web
cp package.json.bak-rollout-<时间戳> package.json   # 或手工删掉两个 omni-* bundles
pnpm install --offline && dsh restart
```

聊天包单独可用：即使两个新包加载失败，`dsh-im-omni` 不依赖它们也能启动
（`core` 在内联实现里被禁用为 `const core = null`）。

## 已知的加载陷阱（踩过两次）

1. **客户端 bundle 必须是 `window.__ModuleLoader__.load({ id, factory(require) })` 形式**，ESM `import` 不会加载；
2. **`require('别的包')` 必须在 `dsh.client.external` 里声明**，否则启动阶段直接失败（`try/catch` 兜不住）；
3. **bundles 顺序**：被依赖的包要排在消费者之前，否则模块图校验失败 → 白屏。

第三条就是本次白屏的根因；已按三步法重排。
