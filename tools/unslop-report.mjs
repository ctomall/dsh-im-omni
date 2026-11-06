#!/usr/bin/env node
/**
 * Build a single-file report of the unslop passes with inline before/after PNGs,
 * so the redesign can be shared without a server or a folder of images.
 *
 *   node tools/unslop-report.mjs
 */
import { readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const screens = [
  {
    title: '渠道 · 空状态',
    before: 'unslop-before.png',
    after: 'unslop-after.png',
    changes: [
      '渐变图章 + 彩色投影 → 中性瓦片 + 品牌色字形',
      '居中营销式英雄 → 左对齐的接入引导',
      '标题"把客户对话，收进一个工作台" → "还没有接入渠道"',
      '四张等宽统计卡 → 一条主指标 + 三个紧凑指标',
      '彩虹渠道顶边、卡片浮动、品牌色洗底全部删除',
    ],
  },
  {
    title: '会话',
    before: 'unslop-chat-before.png',
    after: 'unslop-chat-after.png',
    changes: [
      '两行头部（身份 + 五枚控件）→ 单行，控件靠右',
      '实心下拉 → ghost 控件，唯一的绿留给「标记解决」',
      '"AI 建议"去掉 sparkles 图标',
      '右栏大写分区标题 → 11/500 常规大小写，padding 13 → 16',
    ],
  },
  {
    title: '数据分析',
    before: 'unslop-analytics-before.png',
    after: 'unslop-analytics-after.png',
    changes: [
      '8 张等宽 KPI + 重复 hint → 4×2，首张 30px 主数字 + 唯一 hint',
      '统计标签去大写与字距，数字统一 tabular-nums',
      '柱图加发丝基线，回复系列改中性灰阶（绿只归一条系列）',
      '渠道条 6px → 4px 轨道，计数等宽',
    ],
  },
  {
    title: '设置',
    before: 'unslop-settings-before.png',
    after: 'unslop-settings-after.png',
    changes: [
      '分组卡片去投影，圆角 14 → 12，padding → 20',
      '表单网格 gap 11 → 16，标签 11 → 12px 且单行',
      '输入框 32 → 34px、13px 字',
      '"默认 SLA（分钟）" → "默认 SLA"，不再折行',
    ],
  },
]

const passes = [
  ['1 间距', '4px 网格；页面 24、卡片 16–20、列表行 10/12；组内 8、组间 24'],
  ['2 颜色', '去渐变、光晕、彩色投影与彩虹边；一条中性 ramp，绿只给主操作与状态'],
  ['3 图标', '统一 16px 线性、中性色；去掉装饰性 sparkles'],
  ['4 文案', '营销标题改成可核对的事实；短标签不带句号'],
  ['5 字体', '11/12/13/14/20/30 几档；400/500/600；数字 tabular-nums'],
  ['6 布局', '空状态左对齐；统计行一条主指标；会话头部单行'],
  ['7 细节', '胶囊收成 6px chip；圆角按嵌套规则；去浮起与阴影过渡'],
  ['8 视觉', '不生成假图；moment 交给真实平台网格与真实计数'],
  ['9 动效', '只保留颜色/边框过渡，删除 transform 与阴影动画'],
]

const dataUrl = async (file) => `data:image/png;base64,${(await readFile(join(root, 'docs', file))).toString('base64')}`

const blocks = []
for (const screen of screens) {
  const [before, after] = await Promise.all([dataUrl(screen.before), dataUrl(screen.after)])
  blocks.push(`<section class="screen">
  <header><h2>${screen.title}</h2><p class="meta">${screen.before} → ${screen.after}</p></header>
  <div class="pair">
    <figure><img src="${before}" alt="改前"><figcaption>改前</figcaption></figure>
    <figure><img src="${after}" alt="改后"><figcaption>改后</figcaption></figure>
  </div>
  <ul class="changes">${screen.changes.map((item) => `<li>${item}</li>`).join('')}</ul>
</section>`)
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-im-omni · unslop 报告</title>
<style>
:root{--ink:#18181b;--muted:#71717a;--line:#e6e6e8;--paper:#fafafa;--green:#15803d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.6 "PingFang SC","Segoe UI",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:48px 24px 64px}
h1{font-size:28px;font-weight:600;letter-spacing:-.01em;margin:0 0 6px}
.lede{color:var(--muted);margin:0 0 32px}
dl{display:grid;grid-template-columns:96px 1fr;gap:8px 16px;margin:0 0 40px;padding:20px;border:.5px solid var(--line);border-radius:12px;background:#fff}
dt{color:var(--muted);font-size:12px}
dd{margin:0}
.screen{margin:0 0 48px}
.screen h2{font-size:18px;font-weight:600;margin:0 0 2px}
.meta{color:var(--muted);font-size:12px;margin:0 0 16px;font-variant-numeric:tabular-nums}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
figure{margin:0}
img{width:100%;display:block;border:.5px solid var(--line);border-radius:10px;background:#fff}
figcaption{color:var(--muted);font-size:12px;margin-top:6px}
.changes{margin:16px 0 0;padding-left:18px;columns:2;column-gap:32px}
.changes li{margin:0 0 4px;break-inside:avoid}
.passes{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;padding:0;list-style:none;margin:8px 0 0}
.passes li{display:flex;gap:10px;font-size:13px}
.passes b{color:var(--muted);font-weight:500;min-width:64px}
footer{margin-top:56px;padding-top:16px;border-top:.5px solid var(--line);color:var(--muted);font-size:12px}
footer a{color:var(--green);text-decoration:none}
@media (max-width:900px){.pair{grid-template-columns:1fr}.changes{columns:1}.passes{grid-template-columns:1fr}}
</style></head>
<body><main>
<h1>dsh-im-omni · 前端去 slop 报告</h1>
<p class="lede">四个页面，同一套方向与九道 pass；改动全部落在 <code>client.js</code>，功能与路由未动。</p>
<dl>
  <dt>产品</dt><dd>客服小队在 DSH 里处理 WhatsApp / Telegram / 企微 / 飞书 多渠会话的统一收件箱</dd>
  <dt>性格</dt><dd>沉稳、精确、带一点值班台的温度</dd>
  <dt>世界</dt><dd>夜班客服的值班台：冷灰石墨台面、纸感工单、绿色"在线"灯</dd>
  <dt>记忆点</dt><dd>统计行的一条主数字；渠道网格里真实平台的徽标与接入方式</dd>
  <dt>签名</dt><dd>品牌绿只出现在"在线/已连接"状态点与主操作，其余一律石墨灰</dd>
</dl>
${blocks.join('\n')}
<section class="screen"><header><h2>九道 pass</h2><p class="meta">按序执行，逐层收敛</p></header>
<ul class="passes">${passes.map(([name, text]) => `<li><b>${name}</b><span>${text}</span></li>`).join('')}</ul></section>
<footer>unslop by Damir Sokolovsky (@heydamir), CC BY 4.0 · 预览截图由 <code>tools/unslop-preview.mjs</code> 从真实 client.js CSS 渲染</footer>
</main></body></html>`

await writeFile(join(root, 'docs', 'unslop-report.html'), html)
const size = (await stat(join(root, 'docs', 'unslop-report.html'))).size
console.log('wrote docs/unslop-report.html', Math.round(size / 1024), 'KB')
