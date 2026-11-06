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
const cssFile = process.env.IMO_CSS
const source = await readFile(join(here, '..', 'client.js'), 'utf8')
const css = cssFile
  ? await readFile(cssFile, 'utf8')
  : (/const CSS = String\.raw`([\s\S]*?)`/.exec(source)?.[1] ?? '')
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

const view = process.argv[4] ?? 'channels'

const chatHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>im-omni · chat · ${variant}</title>
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
.main{width:1176px;display:flex;flex-direction:column}
${css}
</style></head>
<body><div class="stage"><div class="main"><div class="imoRoot"><div class="imoTop">
  <div class="imoBrand">${brandMark}<span class="imoBrandText"><span class="imoBrandTitle">全渠道 IM</span><span class="imoBrandSub">统一收件箱 · 官方 API · 扫码登录</span></span></div>
  <label class="imoTopSearch"><span>⌕</span><input placeholder="搜索会话、联系人、消息…"></label>
  <div class="imoTopActions"><span class="imoPill success">已连接</span></div>
</div>
<div class="imoTabs"><span class="imoTab on">收件箱</span><span class="imoTab">联系人</span><span class="imoTab">渠道</span><span class="imoTab">快捷回复</span><span class="imoTab">群发</span><span class="imoTab">自动化</span><span class="imoTab">数据分析</span><span class="imoTab">设置</span></div>
<div class="imoInbox imoInboxDetails">
  <aside class="imoListCol">
    <div class="imoListHead"><strong style="font-size:13px">收件箱</strong><span class="imoPill">9 个会话</span></div>
    ${[['C','Ctomall','Hi Ctomall, I have received your refund request.','10 分钟前','进行中'],['P','Priya Nair','Order number is NS-20831.','1 小时','进行中'],['L','Lin Yue','内部备注：已核对售后回照片。','1 小时','待跟进'],['A','Aisha Khan','Of course. I have requested it from billing.','4 小时','待跟进']].map(([initial,name,preview,time,status]) => `
    <button class="imoConvRow ${name === 'Ctomall' ? 'imoConvRowActive' : ''}">
      <span class="imoAvatar">${initial}</span>
      <span style="min-width:0;flex:1;display:flex;flex-direction:column;gap:2px">
        <span style="display:flex;align-items:baseline;gap:8px"><span class="imoConvName">${name}</span><span style="margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary)">${time}</span></span>
        <span class="imoConvPreview">${preview}</span>
        <span class="imoConvMeta"><span class="imoPill">${status}</span><span class="imoPill">Website chat</span></span>
      </span>
    </button>`).join('')}
  </aside>
  <section class="imoThread">
    <header class="imoThreadHead">
      <div class="imoThreadIdentity">
        <span class="imoAvatar">C</span>
        <div style="min-width:0">
          <div class="imoThreadTitle">Ctomall</div>
          <div class="imoThreadMeta"><span style="width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)"></span><span>Website chat</span><span>·</span><span>3 分钟前</span><span class="imoPill success">首次响应已达标</span></div>
        </div>
      </div>
      <div class="imoThreadActions">
        <select class="imoSelect"><option>进行中</option></select>
        <select class="imoSelect"><option>普通</option></select>
        <select class="imoSelect"><option>You</option></select>
        <select class="imoSelect"><option>稍后提醒</option></select>
        <button class="imoBtn imoBtnSm imoBtnPrimary">标记解决</button>
      </div>
    </header>
    <div class="imoThreadBody">
      <div class="imoDay">今天</div>
      <div class="imoMsgRow"><div class="imoMsgStack"><div class="imoBubble">Hi Ctomall, I have received your refund request. Our team will review it and reply within one business day.</div><div class="imoMsgMeta">Ctomall · 02:19</div></div></div>
      <div class="imoMsgRow out"><div class="imoMsgStack"><div class="imoBubble imoBubbleOut">好的，我这边加急处理，今天内给你答复。</div><div class="imoMsgMeta">You · 02:21 ✓✓</div></div></div>
      <div class="imoMsgRow"><div class="imoMsgStack"><div class="imoBubble">Thanks, please keep me posted.</div><div class="imoMsgMeta">Ctomall · 02:24</div></div></div>
    </div>
    <div class="imoComposer">
      <div class="imoComposerTabs"><button class="imoComposerTab imoComposerTabActive">回复</button><button class="imoComposerTab">内部备注</button><select class="imoSelect" style="margin-left:auto"><option>插入快捷回复</option></select><button class="imoBtn imoBtnSm">AI 建议</button></div>
      <div class="imoComposerBox"><textarea class="imoTextarea" placeholder="输入回复…"></textarea><div class="imoComposerFoot"><span style="font-size:11px;color:var(--dsw-alias-label-tertiary)">Enter 发送 · Shift+Enter 换行</span><button class="imoBtn imoBtnSm imoBtnPrimary" style="margin-left:auto">发送</button></div></div>
    </div>
  </section>
  <aside class="imoContext">
    <div class="imoContextHead"><span class="imoContextTitleHead">客户详情</span></div>
    <div class="imoContextSection"><div class="imoContextTitle">会话详情</div>
      <div style="display:grid;gap:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--dsw-alias-label-secondary)">渠道</span><span>Website chat</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--dsw-alias-label-secondary)">状态</span><span>进行中</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--dsw-alias-label-secondary)">优先级</span><span>普通</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--dsw-alias-label-secondary)">最近来信</span><span>10 分钟前</span></div>
      </div>
    </div>
    <div class="imoContextSection"><div class="imoContextTitle">标签</div><span style="font-size:12px;color:var(--dsw-alias-label-secondary)">无</span></div>
    <div class="imoContextSection"><div class="imoContextTitle">内部备注</div><textarea class="imoTextarea" style="min-height:56px" placeholder="写一条只有团队可见的备注…"></textarea><button class="imoBtn imoBtnSm" style="margin-top:8px">保存备注</button></div>
  </aside>
</div></div></div></div></body></html>`

const analyticsHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>im-omni · analytics · ${variant}</title>
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
.main{width:1176px;display:flex;flex-direction:column}
${css}
</style></head>
<body><div class="stage"><div class="main"><div class="imoRoot"><div class="imoTop">
  <div class="imoBrand">${brandMark}<span class="imoBrandText"><span class="imoBrandTitle">全渠道 IM</span><span class="imoBrandSub">统一收件箱 · 官方 API · 扫码登录</span></span></div>
  <label class="imoTopSearch"><span>⌕</span><input placeholder="搜索会话、联系人、消息…"></label>
</div>
<div class="imoTabs"><span class="imoTab">收件箱</span><span class="imoTab">联系人</span><span class="imoTab">渠道</span><span class="imoTab">快捷键回复</span><span class="imoTab">群发</span><span class="imoTab">自动化</span><span class="imoTab on">数据分析</span><span class="imoTab">设置</span></div>
<div class="imoPage">
  <div class="imoPageHead"><div><h1 class="imoPageTitle">数据分析</h1><p class="imoPageSub">最近 14 天消息量、渠道分布与坐席负载。</p></div>
    <div class="imoPageActions"><span class="imoPill">11 月 6 日 11:20 更新</span></div></div>
  <div class="imoKpis">
    ${[['4','未结会话','按当前筛选',true],['2','等待客户','首次响应 SLA',false],['0','超时未响应','首次响应 SLA',false],['9','今日已解决','今天',false],['6 分','平均首次响应','响应时长',false],['42 分','平均解决时长','解决时长',false],['128','近 7 天消息','全部渠道',false],['24','联系人','通讯录',false]].map(([v,l,h,lead]) => `
    <div class="imoKpi ${lead ? 'lead' : ''}"><div class="imoKpiValue">${v}</div><div class="imoKpiLabel">${l}</div>${lead ? `<div class="imoKpiHint">${h}</div>` : ''}</div>`).join('')}
  </div>
  <div class="imoTwoCol">
    <section class="imoSection">
      <div class="imoSectionTitle">消息量</div>
      <div class="imoChart">
        ${[38,52,44,61,70,55,48,66,74,58,49,63,71,57].map((v,i) => `
        <div class="imoChartCol"><div class="imoChartStack"><div class="imoChartIn" style="height:${Math.round(v*0.6)}%"></div><div class="imoChartOut" style="height:${Math.round(v*0.4)}%"></div></div><span class="imoChartLabel">${i % 2 === 0 ? '10-' + String(24 + i) : ''}</span></div>`).join('')}
      </div>
      <div class="imoLegend" style="margin-top:7px"><span><span class="imoLegendSwatch" style="background:var(--dsw-alias-brand-primary)"></span>客户来信</span><span><span class="imoLegendSwatch" style="background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,var(--dsw-alias-bg-layer-1))"></span>我们回复</span><span style="margin-left:auto">按自然日统计</span></div>
    </section>
    <section class="imoSection">
      <div class="imoSectionTitle">按渠道</div>
      <div class="imoBars">
        ${[['售后 WhatsApp',0.9,62,48],['社群 Telegram',0.6,31,22],['官网在线客服',0.35,18,15],['企业微信',0.2,9,11]].map(([name,ratio,a,b]) => `
        <div class="imoBarRow"><span class="imoEllipsis">${name}</span><div class="imoBarTrack"><div class="imoBarFill" style="width:${ratio*100}%"></div></div><span class="imoTiny imoMuted imoNowrap">${a} / ${b}</span></div>`).join('')}
      </div>
    </section>
  </div>
  <div class="imoTwoCol" style="margin-top:14px">
    <section class="imoSection"><div class="imoSectionTitle">按坐席</div>
      <div class="imoTableWrap" style="border:none"><table class="imoTable"><thead><tr><th>姓名</th><th>状态</th><th>未结</th><th>今日解决</th><th>负载</th></tr></thead>
      <tbody><tr><td>You</td><td><span class="imoPill success">在线</span></td><td>2</td><td>5</td><td>中</td></tr>
      <tr><td>林小满</td><td><span class="imoPill warn">忙碌</span></td><td>2</td><td>3</td><td>中</td></tr></tbody></table></div>
    </section>
    <section class="imoSection"><div class="imoSectionTitle">SLA</div><div class="imoSmall imoMuted">首次响应目标 30 分钟，今天达标 7 / 9。</div></section>
  </div>
</div></div></div></div></body></html>`

const settingsHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>im-omni · settings · ${variant}</title>
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
.main{width:1176px;display:flex;flex-direction:column}
${css}
</style></head>
<body><div class="stage"><div class="main"><div class="imoRoot"><div class="imoTop">
  <div class="imoBrand">${brandMark}<span class="imoBrandText"><span class="imoBrandTitle">全渠道 IM</span><span class="imoBrandSub">统一收件箱 · 官方 API · 扫码登录</span></span></div>
</div>
<div class="imoTabs"><span class="imoTab">收件箱</span><span class="imoTab">联系人</span><span class="imoTab">渠道</span><span class="imoTab">快捷回复</span><span class="imoTab">群发</span><span class="imoTab">自动化</span><span class="imoTab">数据分析</span><span class="imoTab on">设置</span></div>
<div class="imoPage">
  <div class="imoPageHead"><div><h1 class="imoPageTitle">设置</h1><p class="imoPageSub">工作区、营业时间、自动接待与团队。</p></div>
    <div class="imoPageActions"><button class="imoBtn imoBtnPrimary">保存修改</button></div></div>
  <section class="imoSection">
    <div class="imoSectionTitle">工作区</div>
    <div class="imoFormGrid">
      <div class="imoFieldGroup"><span class="imoFieldLabel">名称</span><input class="imoInput" value="ctomall 客服"></div>
      <div class="imoFieldGroup"><span class="imoFieldLabel">时区</span><input class="imoInput" value="Asia/Shanghai"></div>
      <div class="imoFieldGroup"><span class="imoFieldLabel">默认 SLA</span><input class="imoInput" value="30"></div>
      <div class="imoFieldGroup"><span class="imoFieldLabel">翻译目标语言</span><input class="imoInput" value="zh-CN"></div>
    </div>
  </section>
  <section class="imoSection">
    <div class="imoSectionTitle">自动接待</div>
    <div class="imoFormGrid">
      <div class="imoFieldGroup"><span class="imoFieldLabel">机器人名称</span><input class="imoInput" value="AI 接待"></div>
      <div class="imoFieldGroup"><span class="imoFieldLabel">最大回合</span><input class="imoInput" value="12"></div>
      <div class="imoFieldGroup full"><span class="imoFieldLabel">转人工关键词</span><input class="imoInput" value="人工,转人工,投诉,退款,human,agent"></div>
      <div class="imoFieldGroup full"><span class="imoFieldLabel">接待说明</span><textarea class="imoTextarea" style="min-height:72px">先确认订单号，再给出处理时限；涉及退款先转人工。</textarea></div>
    </div>
  </section>
  <section class="imoSection">
    <div class="imoSectionTitle">营业时间</div>
    <div class="imoField"><span class="imoFieldLabel">工作日</span><span class="imoFieldValue">周一至周五 09:00 – 21:00</span></div>
    <div class="imoField"><span class="imoFieldLabel">周末</span><span class="imoFieldValue">仅自动接待</span></div>
  </section>
  <section class="imoSection">
    <div class="imoSectionTitle">团队</div>
    <div class="imoTableWrap" style="border:none"><table class="imoTable"><thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th></tr></thead>
    <tbody><tr><td>You</td><td>you@ctomall.cn</td><td>所有者</td><td><span class="imoPill success">在线</span></td></tr>
    <tr><td>林小满</td><td>lin@ctomall.cn</td><td>客服</td><td><span class="imoPill warn">忙碌</span></td></tr></tbody></table></div>
  </section>
</div></div></div></div></body></html>`

const detailCfg = `
<div class="imCfg">
  <div class="imCfgHead"><div><h2 class="imCfgTitle">插件配置</h2><p class="imCfgSub">这里的改动立即作用于全渠道 IM 面板，两个入口读写同一份 Host 状态。</p></div></div>
  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">在线升级</h3><span class="imCfgGroupNote">分支 main</span></div>
    <div class="imCfgRow">
      <div class="imCfgRowMain"><span class="imCfgRowTitle">当前 v2.9.0 · 9915ec6</span><span class="imCfgRowNote">落后远程 2 个提交。</span></div>
      <div class="imCfgActions">
        <span class="imCfgStatus"><span class="imCfgDot paused"></span>2 个提交待拉取</span>
        <button class="imoBtn imoBtnSm">检查更新</button>
        <button class="imoBtn imoBtnSm">取消</button>
        <button class="imoBtn imoBtnSm imoBtnPrimary">确认升级</button>
      </div>
    </div>
    <div class="imCfgConfirm">
      <p class="imCfgConfirmTitle">将从 9915ec6 更新到远程 main 的最新提交，拉取 2 个提交。</p>
      <p class="imCfgNote">升级会替换宿主代码，完成后需要重启 DSH；工作区有未提交改动时会被拒绝。</p>
    </div>
    <div class="imCfgDirty"><p class="imCfgNote">工作区有 1 个未提交改动，升级会被拒绝：</p><code class="imCfgDirtyFile">client.js</code></div>
    <div class="imCfgCommits">
      <div class="imCfgCommit"><code>9915ec6</code><span class="imCfgCommitSubject">feat: plugin configuration on the plugin detail page</span></div>
      <div class="imCfgCommit"><code>7cc96fb</code><span class="imCfgCommitSubject">docs: single-file unslop report with inline before/after</span></div>
    </div>
  </section>

  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">连接与演示</h3><span class="imCfgGroupNote">所有者</span></div>
    <div class="imCfgGrid">
      <label class="imCfgField"><span class="imCfgLabel">Host 服务地址</span><input class="imCfgInput" readonly value="https://dsh.ila3.top"></label>
      <label class="imCfgField"><span class="imCfgLabel">演示数据</span><select class="imCfgSelect"><option>显示演示数据</option></select></label>
    </div>
  </section>
  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">通知默认值</h3></div>
    <div class="imCfgGrid">
      <label class="imCfgField"><span class="imCfgLabel">企业微信机器人</span><input class="imCfgInput" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"></label>
      <label class="imCfgField"><span class="imCfgLabel">点击深链模板</span><input class="imCfgInput" value="dshomni://chat/{conversationId}"></label>
      <label class="imCfgField"><span class="imCfgLabel">安静时段开始</span><input class="imCfgInput" value="22:00"></label>
      <label class="imCfgField"><span class="imCfgLabel">安静时段结束</span><input class="imCfgInput" value="08:00"></label>
    </div>
    <div class="imCfgActions"><button class="imoBtn imoBtnPrimary">保存通知</button><button class="imoBtn">通知已开启</button></div>
  </section>
  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">接待默认值</h3></div>
    <div class="imCfgGrid">
      <label class="imCfgField"><span class="imCfgLabel">默认 SLA（分钟）</span><input class="imCfgInput" value="30"></label>
      <label class="imCfgField"><span class="imCfgLabel">翻译目标语言</span><input class="imCfgInput" value="zh-CN"></label>
    </div>
    ${[['自动分配新会话', true], ['自动翻译客户消息', true], ['显示 AI 建议', true]].map(([label, on]) => `
    <div class="imCfgRow"><div class="imCfgRowMain"><span class="imCfgRowTitle">${label}</span></div><span class="imoSwitch" style="background:${on ? 'var(--dsw-alias-brand-primary)' : 'transparent'}"></span></div>`).join('')}
    <div class="imCfgActions"><button class="imoBtn imoBtnPrimary">保存接待设置</button></div>
  </section>
  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">渠道开关</h3><span class="imCfgGroupNote">2 个渠道</span></div>
    ${[['售后 WhatsApp', 'whatsapp_cloud · connected', '启用', true], ['社群 Telegram', 'telegram · ready', '启用', true], ['旧官网桥', 'webhook · unconfigured', '已暂停', false]].map(([name, meta, state, on]) => `
    <div class="imCfgRow"><div class="imCfgRowMain"><span class="imCfgRowTitle">${name}</span><span class="imCfgRowNote">${meta}</span></div>
      <div class="imCfgActions"><span class="imCfgStatus"><span class="imCfgDot ${on ? '' : 'paused'}"></span>${state}</span><button class="imoBtn imoBtnSm">${on ? '暂停' : '启用'}</button></div></div>`).join('')}
  </section>
  <section class="imCfgGroup">
    <div class="imCfgGroupHead"><h3 class="imCfgGroupTitle">成员与权限</h3><span class="imCfgGroupNote">身份取当前坐席；Host 侧按角色拒绝越权命令</span></div>
    <table class="imCfgMatrix"><thead><tr><th>权限</th><th>所有者</th><th>管理员</th><th>客服</th></tr></thead><tbody>
      <tr><td>配置插件与通知</td><td class="imCfgMark yes">✓</td><td class="imCfgMark yes">✓</td><td class="imCfgMark no">—</td></tr>
      <tr><td>启用或暂停渠道</td><td class="imCfgMark yes">✓</td><td class="imCfgMark yes">✓</td><td class="imCfgMark no">—</td></tr>
      <tr><td>添加成员与改角色</td><td class="imCfgMark yes">✓</td><td class="imCfgMark">仅限添加/改客服</td><td class="imCfgMark no">—</td></tr>
      <tr><td>接待会话与发送消息</td><td class="imCfgMark yes">✓</td><td class="imCfgMark yes">✓</td><td class="imCfgMark yes">✓</td></tr>
    </tbody></table>
    <div class="imCfgRow"><div class="imCfgRowMain"><span class="imCfgRowTitle">You</span><span class="imCfgRowNote">you@example.com</span></div><span class="imCfgStatus">所有者</span></div>
    <div class="imCfgRow"><div class="imCfgRowMain"><span class="imCfgRowTitle">林小满</span><span class="imCfgRowNote">lin@ctomall.cn</span></div><select class="imCfgSelect"><option>管理员</option><option>客服</option></select></div>
    <div class="imCfgRow"><div class="imCfgRowMain"><span class="imCfgRowTitle">陈思远</span><span class="imCfgRowNote">chen@ctomall.cn</span></div><select class="imCfgSelect"><option>客服</option></select></div>
    <p class="imCfgNote">当前身份：You · 所有者</p>
  </section>
</div>`

const detailHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>im-omni · detail · ${variant}</title>
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
.shell{flex:1;min-width:0;overflow:auto}
.page{max-width:1000px;margin:0 auto;padding:28px 40px 40px}
.crumb{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:20px}
.head{display:flex;gap:16px;align-items:flex-start}
.mark{width:48px;height:48px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary);flex:none}
h1{font-size:22px;font-weight:600;margin:0}
.meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin:4px 0 0}
.desc{font-size:13px;color:var(--dsw-alias-label-secondary);margin:16px 0 0;max-width:720px;line-height:1.6}
.doc{margin-top:24px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:20px}
.doc h2{font-size:15px;font-weight:600;margin:0 0 10px}
.doc p{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.7;margin:0 0 10px;max-width:720px}
.doc code{font-size:12px;background:var(--dsw-alias-bg-layer-2);padding:1px 4px;border-radius:4px}
${css}
</style></head>
<body><div class="stage"><div class="shell"><div class="page">
  <div class="crumb">插件 / 全渠道 IM</div>
  <div class="head"><div class="mark">✉</div><div>
    <h1>全渠道 IM</h1>
    <p class="meta">dsh-im-omni · v2.9.0 · 已启用</p>
  </div></div>
  <p class="desc">把 WhatsApp、Telegram、企业微信、飞书等渠道的客户对话收进 DSH：统一收件箱、AI 建议、自动翻译、SLA 与群机器人通知。</p>
  <div class="doc">
    <h2>接入前准备</h2>
    <p>先在 Host 里启用插件，再打开 <code>全渠道 IM</code> 面板添加渠道。官方 API 渠道填凭据；个人号走扫码桥接；自建系统用 HTTP 桥接并配置出站地址。</p>
    <p>通知走企业微信群机器人，需要群主提供 <code>webhook</code> 地址。安静时段内不发卡片，消息仍会入库。</p>
  </div>
  ${variant === 'after' ? detailCfg : ''}
</div></div></div></body></html>`

if (view === 'detail') {
  await writeFile(process.argv[3] ?? '/tmp/imo-detail.html', detailHtml)
  console.log('wrote detail preview')
} else if (view === 'settings') {
  await writeFile(process.argv[3] ?? '/tmp/imo-settings.html', settingsHtml)
  console.log('wrote settings preview')
} else if (view === 'analytics') {
  await writeFile(process.argv[3] ?? '/tmp/imo-analytics.html', analyticsHtml)
  console.log('wrote analytics preview')
} else if (view === 'chat') {
  await writeFile(process.argv[3] ?? '/tmp/imo-chat.html', chatHtml)
  console.log('wrote chat preview')
} else {
  await writeFile(process.argv[3] ?? '/tmp/imo-preview.html', html)
  console.log('wrote', process.argv[3] ?? '/tmp/imo-preview.html')
}
