# Unslop pass — 插件前端

Credit: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.

## Direction

- **Product.** 客服小队在 DSH 里处理 WhatsApp / Telegram / 企微 / 飞书 多渠客户会话的统一收件箱。
- **Character.** 沉稳、精确、带一点值班台的温度。
- **World.** 夜班客服的值班台：冷灰石墨台面、纸感工单、绿色"在线"指示灯。
- **Moments.** ①统计行里那条主数字；②渠道网格里真实平台的徽标与接入方式。
- **Signature.** 品牌绿只出现在"在线/已连接"状态点与主操作上，其余一律石墨灰。

## Audit（改前）

| 位置 | 症状 |
| --- | --- |
| 顶栏品牌标记 | 135° 渐变瓦片 + 品牌色投影，纯装饰发光 |
| 顶栏背景 | `linear-gradient` 品牌色 4% 洗色 |
| 空状态英雄 | 居中营销式大标题 + 渐变图章 + 三张等宽步骤卡 + 品牌色描边与 34px 大投影 |
| 渠道卡片 | 每条渠道一个 `hsl()` 彩色顶边（彩虹），hover 抬升 + 阴影 |
| 统计卡 | 四张等宽卡 + 彩色图标底（绿/红），渐变底 + 阴影 |
| 聊天区 | `radial-gradient` 品牌光晕 + 头部阴影 |
| 组件 | 一切皆胶囊（999px），标签、筛选、状态全一样 |
| 文案 | "把客户对话，收进一个工作台" —— 放在任何产品都成立 |

## Passes（改后）

1. **Spacing.** 4px 网格：顶栏 56、页边 24、卡片 16–20、统计行 gap 12、步骤行 gap 24；聊天行 10/12。
2. **Color.** 品牌标记改中性瓦片 + 品牌色字形；去顶栏渐变、去英雄渐变/描边/大投影、去聊天光晕、去卡片彩虹边；统计图标统一 `label-tertiary`；品牌绿只留主按钮与状态点。
3. **Icons.** 一个 16px 线性图标，中性色；英雄图章由 sparkles 换成 inbox 字形；统计图标 14→16 且不着色。
4. **Copy.** 标题 `把客户对话，收进一个工作台` → `还没有接入渠道`；正文改成"选一个平台，填凭据或扫码登录…"的可核对事实；英文同步。
5. **Type.** 标题 21/680 → 20/600；正文 12.5 → 13；统计数字加 `tabular-nums`；步骤标题 11.5/650 → 13/500。
6. **Layout.** 英雄由居中改为左对齐接入引导；步骤从三张卡改为一条发丝线分隔的流程行；统计行改为 `1.6fr 1fr 1fr 1fr`（一条主指标 + 三个紧凑指标）。
7. **Details.** 胶囊 999px → 6px chip；卡片 13→12、英雄 18→12、气泡 14/5→12/4；去掉卡片 hover 抬升与聊天头部阴影。
8. **Visuals.** 不加生成图；空状态的"moment"用真实平台网格承担（真实徽标 + 接入方式），英雄图章改为产品化的 inbox 字形。
9. **Motion.** 只保留 `background-color`/`border-color` 过渡；删除 `transform` 抬升与阴影过渡。

## 验收

- `node --check client.js` 通过（样式串语法完好）。
- `node tools/unslop-preview.mjs before|after` 从 `client.js` 抽取真实 CSS 渲染静态预览。
- 前后对比：`docs/unslop-before.png` / `docs/unslop-after.png`（1440×1000）。
- 改动只涉及 `client.js` 与新增 `tools/unslop-preview.mjs`；功能、路由、接口、文案键名未动。

## 仍可继续

- 会话页头部仍有一排状态胶囊（语义色）+ "AI 建议" 的 sparkles 图标，可再做一轮减法。
- 渠道卡片的 `ChannelBadge` 依赖平台 hue（品牌识别），属品牌资产，未动。

## 第二轮：会话页

| 位置 | 改前 | 改后 |
| --- | --- | --- |
| `imoThreadHead` | 身份一行 + 五枚控件挤在第二行，换行堆叠 | 单行：身份左、控件右（≤900px 才换行） |
| 头部下拉 | 实心描边 select，视觉重量等同按钮 | 透明 ghost select，hover 才出底色，主操作仍是唯一的绿按钮 |
| "AI 建议" | sparkles 图标 | 纯文字，去掉闪光符号 |
| `imoDay` | 10px 大写 + 字距 | 11px 常规、`label-tertiary` |
| `imoContextTitle` | 10px 大写 + `.07em` 字距 | 11px / 500、大小写不转换 |
| 右栏 | padding 13、分区 11px | padding 16、分区 14px |
| 会话行 | 名称 12.5/600、预览 11.5 | 13/600、12 |

截图：`docs/unslop-chat-before.png` / `docs/unslop-chat-after.png`（预览由 `tools/unslop-preview.mjs <variant> out chat` 生成，before 用 `IMO_CSS` 指向旧版 CSS）。

## 第三轮：数据分析页

| 位置 | 改前 | 改后 |
| --- | --- | --- |
| KPI 卡 | 8 张等宽卡、每张都带一行重复 hint、21/650 数字 | 4×2 网格；首张为 30px 主数字 + 唯一 hint；数字 `tabular-nums`、22/600 |
| 统计标签 | 10px 大写 + `.05em` | 11px 常规、不转换大小写 |
| 消息量图 | 9px 标签、品牌色两种深浅做双系列、无基线 | 200px 高 + 发丝基线；来信=品牌绿、回复=中性 22% 灰阶；日期 10px 等宽 |
| 渠道条 | 6px 轨道、品牌色填充 | 4px 轨道、2px 圆角、中性轨道 + 品牌绿填充，计数等宽 |
| 图例 | "我们回复"用品牌色 35% 浅绿 | 中性灰阶，让绿色只属于一条系列 |

截图：`docs/unslop-analytics-before.png` / `docs/unslop-analytics-after.png`。

## 第四轮：设置页

| 位置 | 改前 | 改后 |
| --- | --- | --- |
| 分组卡片 | 14px 圆角、15/16 padding、`.5px` 边框 + 1px 投影 | 12px 圆角、20 padding、纯发丝边框、无投影 |
| 分组标题 | 13/650、下间距 10 | 14/600、下间距 16 |
| 表单网格 | 11px gap | 16px gap；字段标签 11 → 12 |
| 输入框 | 32px 高、12.5px 字 | 34px 高、13px 字、内边距 10 |
| 详情行（营业时间） | 11.5px、标签列 74 | 12.5px、标签列 88、行距 8 |
| 文案 | `默认 SLA（分钟）` 在双列里换行 | `默认 SLA`，标签单行不折行（`white-space:nowrap`） |

截图：`docs/unslop-settings-before.png` / `docs/unslop-settings-after.png`。

## 汇总报告

`node tools/unslop-report.mjs` 生成 `docs/unslop-report.html`（约 1.1 MB，图片内联，双击即看）：
方向五行 + 四组 before/after + 九道 pass + 署名。封面截图：`docs/unslop-report-cover.png`。

## 生效方式（实测）

`client.js` 是浏览端半边，宿主（`packages/client/hmr`）每 500ms 对每个插件的 bundle 做 stat 轮询，
mmtime/ctime/size 变化即调用 `rebuilt(id)` 并通过 `/plugins/events` SSE 推送 `rebuilt` 帧，
浏览器半边据此用新 `rev` 重新导入模块。**改 client.js 既不需要重启 dsh，也不需要手动刷新**。

实测证据（本机 dsh web，pid 3302319）：

```
$ curl -sN http://127.0.0.1:52102/plugins/events &        # 订阅
$ touch client.js                                          # 只改 mtime
data: {"type":"graph",...,"id":"dsh-im-omni","rev":"f13eb1e19943"}
data: {"type":"rebuilt","id":"dsh-im-omni","rev":"92174c545404"}   # ~1s 内到达
$ curl "http://127.0.0.1:52102/plugins/??dsh-im-omni/client.js&rev=92174c545404"
  → 200, 317195 bytes, 内含 .imoKpi.lead / imoWelcomeTitle{font-size:20px / 扁平 imoBrandMark
```

边界：改**宿主半边**（`index.js`、`lib/*`、`cordis.patch.yml`）仍然需要重启 dsh，因为那是进程内加载的。

## 第五轮：插件详情页（插件管理器内）

在 DSH 插件管理器里点「全渠道 IM」进入的详情页，原本只有 README；这一轮在上面加了 **插件配置** 区，
按 unslop 的方向设计（同一套石墨中性 + 品牌绿只给主操作与状态点）。

| 分组 | 能改什么 | 落到哪个命令 |
| --- | --- | --- |
| 连接与演示 | Host 服务地址（只读）、演示数据开关 | `workspace.update { demo }` |
| 通知默认值 | 企业微信机器人、深链模板、安静时段、通知开关 | `workspace.update { notify }`（复用既有校验：webhook 必须 https） |
| 接待默认值 | 默认 SLA、翻译目标语言、自动分配/自动翻译/AI 建议 | `workspace.update { … }` |
| 渠道开关 | 每个渠道启用/暂停 + 健康状态 | `channel.update { channelId, status }` |
| 成员与权限 | 角色矩阵、成员角色下拉、当前身份 | `agent.update { agentId, role }`；所有权 `workspace.owner` |

实现方式：注册插件管理器的 `plugins.detail.section` 槽（list / root），只在 `subject.pkg.name === 'dsh-im-omni'`
时渲染；组件直接读写同一份 Host API，和面板不出现两份真相。

### 权限设计（Host 侧强制）

- `workspace.ownerId`：首个成员自动成为所有者；`workspace.owner` 只允许所有者转移。
- 角色：`owner` > `admin` > `agent`；`agent` 不能改配置，`admin` 不能授予管理员。
- 门在 `lib/commands.js`：`CONFIG_ACTIONS` 集合命中时用「当前坐席」的角色判定，越权返回 `403 forbidden` / `403 owner-only`。
- 诚实的边界：插件 API 是本地 Host API，"当前坐席"由客户端声明，**不是强身份**；真正的多用户鉴权在 SaaS 服务端（JWT + RLS + 成员表），这里只做单机工作区的角色约束。

截图：`docs/unslop-detail-before.png` / `docs/unslop-detail-after.png` / `docs/unslop-detail-permissions.png`。

## 第六轮：详情页的在线一键升级

插件详情页顶部新增「在线升级」分组（在插件页和面板设置里读的是同一个 `/api/im-omni.upgrade` 路由）：

| 元素 | 内容 |
| --- | --- |
| 版本行 | `当前 v2.9.0 · 9915ec6`、分支、最近检查结论 |
| 状态 | 6px 圆点 + 文字：已是最新 / N 个提交待拉取 / 工作区有改动 / 打包安装无法自更新 |
| 操作 | `检查更新`（次要）、`一键升级`（主操作，仅当 `canPull` 为真可点） |
| 待拉取提交 | 最多 5 条，短 sha（等宽）+ 提交标题，超长省略 |
| 结果 | 完成后回写状态；`restartRequired` 时提示“重启 DSH 后生效” |

Host 侧沿用既有安全边界：`git` 只跑 `fetch / rev-list / status / pull --ff-only`，工作区脏直接拒绝，
不接收路径参数。**改的是宿主半边（`lib/upgrade.js` 与 `index.js` 不动），所以升级后必须重启 DSH 才生效**；
详情页只是把这条能力搬到插件页，避免用户去面板设置里找。

实测（本机真实 checkout）：`installKind=git`、`version=2.9.0`、`branch=main`、`behind=0`、`canPull=false`、`message=已是最新版本。`
（截图里的“落后 2 个提交”是设计预览用的样例数据。）

### 升级确认（第七轮）

`一键升级` 不再直接拉取，先展开确认条：

- 一句事实：「将从 `9915ec6` 更新到远程 `main` 的最新提交，拉取 2 个提交。」
- 一句边界：「升级会替换宿主代码，完成后需要重启 DSH；工作区有未提交改动时会被拒绝。」
- 脏工作区时列出最多 5 个文件（等宽 chip），并说明升级会被拒绝
- 按钮改为 `取消` / `确认升级`；确认后按钮变 `升级中…`，完成后回写「已更新到 <sha>，重启 DSH 后生效。」

截图：`docs/unslop-detail-upgrade-confirm.png`。

### 升级后的重启指引（第八轮）

`applyUpgrade` 返回里新增 `restartHints`：宿主按启动方式推断（`INVOCATION_ID` → systemd），
详情页在升级成功后直接渲染「让新代码生效」块：

- 这个 DSH 跑在 systemd 下 → `sudo systemctl restart dsh-web`
- 重新启动 Host → `dsh web`
- 页面硬刷新（客户端半边会先热替换）

不伪造"自动重启"：更新器只负责拉取，重启方式交给用户确认。单测覆盖了 systemd 与无 systemd 两条分支。
截图：`docs/unslop-detail-restart.png`。

### 升级失败的处理与复制（第九轮）

- 每条提示后跟一个 `复制` 小按钮（`navigator.clipboard`），1.5 秒后回显「已复制」。
- 升级失败时清空"让新代码生效"，换成「这次没升成，怎么处理」：
  - 脏工作区 → `git stash push -u -m "im-omni: before upgrade"`
  - 远程不可达 → `git fetch --all --prune`
  - 已拉到一半 → `git reset --hard <升级前 sha>`（文案明确"会丢弃本地未提交改动"）
- 只在失败时出现；成功时回到重启指引，两块互斥。
截图：`docs/unslop-detail-recovery.png`。
