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
