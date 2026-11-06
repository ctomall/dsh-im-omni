#!/usr/bin/env node
/**
 * Static preview of the plugin's channels page, used only for design review.
 *
 * It pulls the real CSS out of client.js and renders a faithful replica of the
 * markup (top bar, tabs, stat row, empty-state hero, platform grid) with DSH
 * token fallbacks, so a before/after screenshot compares the shipped styles.
 *
 *   node tools/unslop-preview.mjs before out.html
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(join(here, '..', 'client.js'), 'utf8')
const css = /const CSS = String\.raw`([\s\S]*?)`/.exec(source)?.[1] ?? ''
const variant = process.argv[2] ?? 'before'

const brandMark = variant === 'before'
  ? '<span class="imoBrandMark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.7-.7L3 21l1.8-5.3A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg></span>'
  : '<span class="imoBrandMark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.7-.7L3 21l1.8-5.3A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg></span>'

const stats = [
  { value: '0', label: '已启用', tone: 'lead' },
  { value: '0', label: '连接正常', tone: 'success' },
  { value: '0', label: '待处理', tone: '' },
  { value: '11', label: '可用平台', tone: '' },
].map((stat) => `
        <div class="imoChannelStat ${stat.tone === 'lead' ? 'lead' : ''}">
          <div class="imoChannelStatTop">
            <span class="imoMetricIcon">◻</span>
            <div><div class="imoChannelStatValue">${stat.value}</div><div class="imoChannelStatLabel">${stat.label}</div></div>
          </div>
        </div>`).join('')

const platforms = [
  ['WA', 'WhatsApp Business', 'Meta Cloud API，官方 Webhook 与 Graph 发送'],
  ['WQ', 'WhatsApp 个人号（扫码）', '内置 Baileys 扫码，或切换外部桥接'],
  ['WX', '微信个人号（扫码）', '通过 Wechaty/WeChatFerry 桥接扫码登录'],
  ['WC', '企业微信', '自建应用回调，AES 加密 XML'],
  ['TG', 'Telegram', 'Bot API，支持长轮询或 Webhook'],
  ['FS', '飞书 / Lark', '事件订阅 v2，支持 Encrypt Key'],
].map(([badge, name, caption]) => `
          <button class="imoPlatformCard">
            <span class="imoPlatformBadge">${badge}</span>
            <span class="imoPlatformBody"><span class="imoPlatformName">${name}</span><span class="imoPlatformCaption">${caption}</span></span>
          </button>`).join('')

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>im-omni · ${variant}</title>
<style>
:root{
  --dsw-alias-bg-base:#fafafa; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#f4f4f5;
  --dsw-alias-label-primary:#18181b; --dsw-alias-label-secondary:#71717a; --dsw-alias-label-tertiary:#a1a1aa;
  --dsw-alias-border-l1:#e6e6e8; --dsw-alias-border-l2:#d4d4d8;
  --dsw-alias-brand-primary:#15803d; --dsw-alias-state-success-primary:#16a34a;
  --dsw-alias-state-warn-primary:#b45309; --dsw-alias-state-error-primary:#b91c1c;
  --dsw-alias-state-idle-primary:#a1a1aa; --dsw-font-family:"PingFang SC","Segoe UI",system-ui,sans-serif;
}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}
.stage{width:1440px;height:1000px;display:flex}
.side{width:264px;border-right:.5px solid var(--dsw-alias-border-l1);padding:12px;background:var(--dsw-alias-bg-layer-1)}
.sideRow{height:32px;border-radius:8px;display:flex;align-items:center;padding:0 8px;color:var(--dsw-alias-label-secondary);font-size:13px}
.sideRow.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
${css}
</style></head>
<body><div class="stage">
  <aside class="side"><div class="sideRow">插件</div><div class="sideRow">自动化任务</div><div class="sideRow">上下文洞察</div><div class="sideRow">智能体专家中心</div><div class="sideRow">IM 通道</div><div class="sideRow on">全渠道 IM</div></aside>
  <div class="main"><div class="imoRoot"><div class="imoTop">
    <div class="imoBrand">${brandMark}<span class="imoBrandText"><span class="imoBrandTitle">全渠道 IM</span><span class="imoBrandSub">统一收件箱 · 官方 API · 扫码登录</span></span></div>
    <label class="imoTopSearch"><span>⌕</span><input placeholder="搜索会话、联系人、消息…"></label>
    <div class="imoTopActions"><button class="imoBtn imoBtnGhost">刷新</button></div>
  </div>
  <div class="imoTabs"><span class="imoTab">收件箱</span><span class="imoTab">联系人</span><span class="imoTab on">渠道</span><span class="imoTab">快捷回复</span><span class="imoTab">群发</span><span class="imoTab">自动化</span><span class="imoTab">数据分析</span><span class="imoTab">设置</span></div>
  <div class="imoPage">
    <div class="imoPageHead"><div><h1 class="imoPageTitle">渠道</h1><p class="imoPageSub">官方 API、个人号扫码与自建 HTTP 桥接，统一进入同一个收件箱。</p></div>
      <div class="imoPageActions"><button class="imoBtn imoBtnPrimary">＋ 添加渠道</button></div></div>
    <div class="imoChannelSummary">${stats}</div>
    <div class="imoWelcome">
      <div class="imoWelcomeIcon">▤</div>
      <h2 class="imoWelcomeTitle">还没有接入渠道</h2>
      <p class="imoWelcomeBody">选一个平台，填凭据或扫码登录。客户消息会进入收件箱，人工接待、翻译和 AI 建议都在同一条会话里。</p>
      <button class="imoBtn imoBtnPrimary">＋ 添加渠道</button>
      <div class="imoWelcomeSteps">
        ${[['连接渠道', '选择平台，填凭据或扫码登录。'], ['验收入站', '从客户侧发一条消息，确认进入收件箱。'], ['开始接待', '配置翻译、AI 建议和自动接待规则。']].map(([title, body], index) => `
        <div class="imoWelcomeStep"><div class="imoWelcomeStepNumber">${index + 1}</div><div class="imoWelcomeStepTitle">${title}</div><div class="imoWelcomeStepBody">${body}</div></div>`).join('')}
      </div>
    </div>
    <section class="imoSection">
      <div class="imoSectionTitle">选择平台后填写凭据；创建后仍可随时修改。</div>
      <div class="imoPlatformGrid imoPlatformGridWelcome">${platforms}</div>
    </section>
  </div></div></div>
</div></body></html>`

await writeFile(process.argv[3] ?? '/tmp/imo-preview.html', html)
console.log('wrote', process.argv[3] ?? '/tmp/imo-preview.html')
