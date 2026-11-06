/**
 * IM omnichannel Client half.
 *
 * Registers the left-sidebar panel icon and the full workspace page in the
 * layout's `main` keyed slot. All data comes from the Host API; the browser
 * keeps no durable copy.
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-omni',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // The shared module is temporarily disabled while its load path is verified:
    // requiring an undeclared external broke client boot, and a white page is
    // worse than one duplicated mapping.
    const core = null

    /** Locale namespace owned by this plugin. */
    const NS = 'imOmni'
    /** Authenticated state route. */
    const STATE_PATH = '/api/im-omni.state'
    /** Authenticated command route. */
    const COMMAND_PATH = '/api/im-omni.command'
    /** Owner route that checks and applies the plugin's own Git update. */
    const UPGRADE_PATH = '/api/im-omni.upgrade'
    /** Owner route that stores one uploaded file. */
    const UPLOAD_PATH = '/api/im-omni.upload'
    /** Authenticated translation/AI route. */
    const INTELLIGENCE_PATH = '/api/im-omni.ai'
    /**
     * Call the team API. Prefers the same-origin path nginx exposes
     * (`/im-omni-api/...`), which avoids mixed content and CORS entirely; falls
     * back to the Host proxy route so a bare `dsh web` without nginx still works.
     * @param {string} path - absolute API path starting with /v1/.
     * @param {{method?: string, body?: unknown, token?: string}} [options] - request.
     * @returns {Promise<{ok: boolean, status: number, json: () => Promise<any>}>} response-like.
     */
    async function proxySaas(path, options = {}) {
      if (core && typeof core.proxySaas === 'function') {
        return core.proxySaas(path, { ...options, proxyPath: '/api/im-omni.saas' })
      }
      const token = options.token ?? ''
      const method = options.method ?? 'GET'
      const headers = { accept: 'application/json' }
      if (token !== '') headers.authorization = `Bearer ${token}`
      const init = { method, headers }
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json'
        init.body = JSON.stringify(options.body)
      }
      try {
        const direct = await fetch(`/im-omni-api${path}`, init)
        const text = await direct.text()
        let payload = null
        try { payload = text === '' ? null : JSON.parse(text) } catch { payload = null }
        // A JSON body means the API answered; a bare 404 means no proxy route.
        if (payload !== null || direct.status !== 404) {
          return { ok: direct.ok, status: direct.status, json: async () => payload }
        }
      } catch {
        // Network failure: fall through to the Host proxy.
      }
      const response = await fetch('/api/im-omni.saas', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ path, method, body: options.body, token }),
      })
      const payload = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, json: async () => payload }
    }

    /** Sidebar and main panel id. */
    const PANEL_ID = 'im-omni'
    /** Locale used for date formatting when the document has no lang. */
    const LANG = typeof navigator !== 'undefined' ? (navigator.language || 'en') : 'en'

    /** Build marker printed by the bundle; verifies which revision the page loaded. */
    const BUNDLE_REV = 'im-omni-config-13'

    /** Theme-aware, host-consistent styles. Literal colors are limited to avatar artwork. */
    const CSS = String.raw`
/* --- Plugin detail page: configuration section --------------------------- */
.imCfg{display:flex;flex-direction:column;gap:24px;margin-top:32px;border-top:.5px solid var(--dsw-alias-border-l1);padding:24px 0 8px;max-width:880px}
.imCfgHead{display:flex;align-items:flex-start;gap:12px}
.imCfgTitle{font-size:15px;font-weight:600;margin:0}
.imCfgSub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:4px 0 0}
.imCfgGroup{border-top:.5px solid var(--dsw-alias-border-l1);padding-top:16px;display:flex;flex-direction:column;gap:12px}
.imCfgGroupHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.imCfgGroupTitle{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);margin:0}
.imCfgGroupNote{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.imCfgGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.imCfgGrid.wide{grid-template-columns:1fr}
.imCfgField{display:flex;flex-direction:column;gap:6px;min-width:0}
.imCfgLabel{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imCfgInput{height:34px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 10px;outline:none;min-width:0}
.imCfgInput:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.imCfgRow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imCfgRow:last-child{border-bottom:none;padding-bottom:0}
.imCfgRowMain{display:flex;flex-direction:column;gap:2px;min-width:0}
.imCfgRowTitle{font-size:13px}
.imCfgRowNote{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.imCfgActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.imCfgStatus{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.imCfgDot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.imCfgDot.paused{background:var(--dsw-alias-state-idle-primary)}
.imCfgMatrix{width:100%;border-collapse:collapse;font-size:12px}
.imCfgMatrix th{text-align:left;font-weight:500;color:var(--dsw-alias-label-secondary);font-size:11px;padding:0 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imCfgMatrix td{padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);vertical-align:middle}
.imCfgMatrix tr:last-child td{border-bottom:none}
.imCfgMark{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.imCfgMark.yes{color:var(--dsw-alias-label-primary)}
.imCfgMark.no{color:var(--dsw-alias-label-tertiary)}
.imCfgSelect{height:30px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 8px}
.imCfgHistory{display:flex;flex-direction:column;gap:6px;padding-top:4px}
.imCfgHistoryRow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:12px}
.imCfgHistoryText{color:var(--dsw-alias-label-secondary)}
.imCfgHistoryNote{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-left:auto;padding-right:12px}
.imCfgHistoryTime{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
.imCfgError{font-size:11.5px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;margin:8px 0 0}
.imCfgCopy{height:24px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.imCfgCopy:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.imCfgFailure{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-1)}
.imCfgHints{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-1)}
.imCfgHintRow{display:flex;align-items:center;gap:10px;font-size:12px}
.imCfgHintLabel{color:var(--dsw-alias-label-secondary)}
.imCfgHintCommand{font-size:11.5px;background:var(--dsw-alias-bg-layer-2);padding:2px 8px;border-radius:4px;color:var(--dsw-alias-label-primary)}
.imCfgConfirm{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.imCfgConfirmTitle{font-size:12.5px;margin:0;line-height:1.5}
.imCfgDirty{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.imCfgDirtyFile{font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);padding:1px 6px;border-radius:4px}
.imCfgChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.imCfgChip{display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.imCfgChip.on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.imCfgChip input{accent-color:var(--dsw-alias-brand-primary);margin:0}
.imCfgPending{border-top:.5px solid var(--dsw-alias-border-l1);margin-top:12px;padding-top:12px}
.imCfgCommits{display:flex;flex-direction:column;gap:6px;padding:4px 0 0}
.imCfgCommit{display:flex;align-items:baseline;gap:10px;font-size:12px;min-width:0}
.imCfgCommit code{font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);padding:1px 5px;border-radius:4px;flex:none}
.imCfgCommitSubject{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imCfgNote{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.imCfgToast{font-size:12px;color:var(--dsw-alias-state-success-primary)}
.imCfgToast.bad{color:var(--dsw-alias-state-error-primary)}
@media (max-width:720px){.imCfgGrid{grid-template-columns:1fr}}

.imoRoot{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.45;overflow:hidden;position:relative}
.imoRoot *{box-sizing:border-box}
.imoTop{display:flex;align-items:center;gap:12px;min-height:56px;padding:0 24px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.imoBrand{display:flex;align-items:center;gap:9px;min-width:0;flex:none}
.imoBrandMark{width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);flex:none}
.imoBrandText{display:flex;flex-direction:column;min-width:0}
.imoBrandTitle{font-size:14px;font-weight:600;line-height:18px;white-space:nowrap}
.imoBrandSub{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:14px;white-space:nowrap}
.imoDemo{display:inline-flex;align-items:center;gap:4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 7px;font-size:10px;line-height:15px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.imoTopSearch{display:flex;align-items:center;gap:7px;flex:1;max-width:440px;min-width:120px;height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.imoTopSearch input{border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;width:100%;min-width:0}
.imoTopActions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}
.imoAgent{display:flex;align-items:center;gap:6px;min-width:0}
.imoAgentDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
.imoAgentDot.busy{background:var(--dsw-alias-state-warn-primary)}
.imoAgentDot.offline{background:var(--dsw-alias-state-idle-primary)}
.imoSelect{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;height:30px;padding:0 8px;max-width:190px;outline:none}
.imoSelect:focus-visible,.imoInput:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.imoBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 11px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.imoBtn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,var(--dsw-alias-bg-layer-1))}
.imoBtn:disabled{opacity:.55;cursor:default}
.imoBtnPrimary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:transparent}
.imoBtnPrimary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 86%,var(--dsw-alias-label-primary))}
.imoBtnDanger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-1)}
.imoBtnDanger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,var(--dsw-alias-bg-layer-1))}
.imoBtnGhost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.imoBtnGhost:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.imoBtnSm{height:27px;padding:0 8px;font-size:12px;border-radius:7px}
.imoIconBtn{width:30px;height:30px;padding:0;border-radius:8px;border:.5px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.imoIconBtn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.imoIconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.imoTabs{display:flex;align-items:center;gap:3px;padding:6px 12px;min-height:46px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;overflow-x:auto;scrollbar-width:none}
.imoTabs::-webkit-scrollbar{display:none}
.imoTab{position:relative;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.imoTab:hover{color:var(--dsw-alias-label-primary)}
.imoTabActive{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);font-weight:650;box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.imoTabSpacer{flex:1}
.imoTabRole{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 8px;white-space:nowrap}
.imoTabBadge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-size:10px;font-weight:600}
.imoContent{flex:1;min-height:0;overflow:hidden;position:relative;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2) 34%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base) 170px)}
.imoPage{height:100%;overflow:auto;padding:24px 26px 32px}
.imoPageHead{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}
.imoPageTitle{font-size:19px;font-weight:650;line-height:26px;margin:0}
.imoPageSub{color:var(--dsw-alias-label-secondary);font-size:12.5px;margin:2px 0 0;max-width:760px}
.imoPageActions{margin-left:auto;display:flex;align-items:center;gap:8px;flex:none}
.imoGate{display:flex;align-items:center;justify-content:center;padding:32px}
.imoGateCard{width:100%;max-width:360px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:22px 22px 18px}
.imoGateHead{margin-bottom:16px}
.imoGateTitle{font-size:17px;font-weight:600;margin:0}
.imoGateSub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:5px 0 0;line-height:1.5}
.imoGateSubmit{width:100%;margin-top:6px;justify-content:center}
.imoGateError{color:var(--dsw-alias-state-error-primary);margin:8px 0 0}
.imoGateHint{margin:12px 0 0;line-height:1.5}
.imoRow{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l1)}
.imoRow:first-of-type{border-top:none}
.imoRow>div:first-child{min-width:0}
.imoBtnRow{display:flex;align-items:center;gap:8px;flex:none}
.imoRow .imoPill{cursor:pointer;gap:4px}
.imoRow .imoPill input{accent-color:var(--dsw-alias-brand-primary);margin:0}
.imoSection{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:20px;margin-bottom:20px;min-width:0}
.imoSectionTitle{font-size:14px;font-weight:600;margin:0 0 16px}
.imoMuted{color:var(--dsw-alias-label-secondary)}
.imoFaint{color:var(--dsw-alias-label-secondary);opacity:.78}
.imoSmall{font-size:12px}
.imoTiny{font-size:11px}
.imoMono{font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px}
.imoNowrap{white-space:nowrap}
.imoEllipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoInbox{display:grid;grid-template-columns:296px minmax(0,1fr);height:100%;min-height:0;position:relative}
.imoInboxDetails{grid-template-columns:296px minmax(0,1fr) 296px}
.imoListCol{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.imoListHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px 8px;flex:none}
.imoListTitle{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:650}
.imoListFilters{padding:0 10px 9px;display:flex;flex-direction:column;gap:7px;flex:none;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imoFilterRow{display:flex;align-items:center;gap:6px}
.imoFilterRow .imoSelect{flex:1;min-width:0;max-width:none;height:29px}
.imoStatusChips{display:flex;gap:4px;flex-wrap:wrap;padding-bottom:1px}
.imoStatusChips::-webkit-scrollbar{display:none}
.imoChip{display:inline-flex;align-items:center;gap:4px;height:25px;padding:0 8px;border-radius:7px;border:.5px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
.imoChip:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.imoChipActive{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 13%,transparent);color:var(--dsw-alias-label-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent)}
.imoConvList{flex:1;min-height:0;overflow:auto}
.imoConvRow{display:flex;gap:8px;width:calc(100% - 16px);margin:2px 8px;padding:10px 12px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;cursor:pointer;position:relative;transition:background-color .15s}
.imoConvRow:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)}
.imoConvRowActive{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}
.imoConvRowActive:before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:3px;background:var(--dsw-alias-brand-primary)}
.imoAvatar{width:34px;height:34px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex:none;font-size:12px;font-weight:650;color:#fff;letter-spacing:.2px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.imoAvatarLg{width:44px;height:44px;border-radius:13px;font-size:15px}
.imoAvatarSm{width:25px;height:25px;border-radius:8px;font-size:10px}
.imoConvMain{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
.imoConvTop{display:flex;align-items:center;gap:6px;min-width:0}
.imoConvName{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.imoConvTime{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}
.imoConvPreview{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoConvMeta{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}
.imoUnread{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-size:10px;font-weight:650;flex:none}
.imoDot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.imoDot.open{background:var(--dsw-alias-state-success-primary)}
.imoDot.pending{background:var(--dsw-alias-state-warn-primary)}
.imoDot.snoozed{background:var(--dsw-alias-brand-primary)}
.imoDot.resolved{background:var(--dsw-alias-state-idle-primary)}
.imoDot.urgent{background:var(--dsw-alias-state-error-primary)}
.imoDot.high{background:var(--dsw-alias-state-warn-primary)}
.imoTag{display:inline-flex;align-items:center;gap:3px;max-width:120px;padding:1px 5px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.imoTagButton{cursor:pointer}
.imoTagRemove{border:none;background:transparent;color:inherit;padding:0;margin-left:1px;cursor:pointer;font-size:11px;line-height:1}
.imoEmpty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:36px 20px;gap:6px;color:var(--dsw-alias-label-secondary);min-height:180px}
.imoEmptyIcon{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);color:var(--dsw-alias-brand-primary);margin-bottom:3px}
.imoEmptyTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.imoEmptyBody{font-size:12px;max-width:320px}
.imoThread{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}
.imoThreadHead{display:flex;align-items:center;gap:8px 12px;padding:12px 20px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;flex-wrap:nowrap;z-index:2}
.imoThreadIdentity{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 auto}
.imoThreadTitle{font-size:14px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoThreadMeta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;white-space:nowrap}
.imoThreadActions{display:flex;align-items:center;gap:6px;flex:0 0 auto;justify-content:flex-end;overflow:visible}
.imoThreadActions .imoSelect{height:28px;font-size:12px;max-width:140px;border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:0 6px}
.imoThreadActions .imoSelect:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.imoThreadActions .imoSelect:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.imoThreadBody{flex:1;min-height:0;overflow:auto;padding:24px 24px 16px;background:var(--dsw-alias-bg-base)}
.imoDay{display:flex;align-items:center;gap:10px;margin:4px 0 12px;color:var(--dsw-alias-label-tertiary);font-size:11px;letter-spacing:0}
.imoDay:before,.imoDay:after{content:"";height:.5px;background:var(--dsw-alias-border-l1);flex:1}
.imoMsgRow{display:flex;gap:8px;margin-bottom:11px;align-items:flex-end}
.imoMsgRow.out{flex-direction:row-reverse}
.imoMsgRow.system{justify-content:center;margin:9px 0}
.imoMsgStack{display:flex;flex-direction:column;gap:3px;max-width:min(680px,78%);min-width:0}
.imoMsgRow.out .imoMsgStack{align-items:flex-end}
.imoBubble{padding:9px 12px;border-radius:12px;border-bottom-left-radius:4px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.imoBubbleOut{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-border-l1);border-bottom-left-radius:12px;border-bottom-right-radius:4px}
.imoBubbleNote{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 24%,var(--dsw-alias-border-l1))}
.imoBubbleSystem{background:transparent;border:none;color:var(--dsw-alias-label-secondary);font-size:10.5px;padding:2px 6px;text-align:center}
.imoMsgMeta{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.imoMsgError{color:var(--dsw-alias-state-error-primary);font-size:10.5px;display:flex;align-items:center;gap:4px;max-width:360px}
.imoRetry{border:none;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font:inherit;font-size:10.5px;padding:0;text-decoration:underline}
.imoAttachImg{max-width:220px;max-height:180px;border-radius:10px;display:block;margin:2px 0;object-fit:cover}
.imoAttachPending{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px 0}
.imoAttachChip{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 4px 2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis}
.imoAttach{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.imoAttach a{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:11px;text-decoration:none;border:.5px solid var(--dsw-alias-border-l1);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoComposer{flex:none;border-top:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);padding:10px 14px 12px}
.imoComposerTabs{display:flex;align-items:center;gap:4px;margin-bottom:7px}
.imoComposerTab{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;padding:3px 7px;border-radius:6px;cursor:pointer}
.imoComposerTab:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.imoComposerTabActive{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);font-weight:600}
.imoComposerBox{border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);padding:9px 11px 8px;transition:border-color .15s,box-shadow .15s;box-shadow:0 1px 2px color-mix(in srgb,#000 4%,transparent)}
.imoComposerBox:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 58%,var(--dsw-alias-border-l1));box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.imoTextarea{display:block;width:100%;min-height:64px;max-height:190px;resize:vertical;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;padding:0;caret-color:var(--dsw-alias-brand-primary)}
.imoComposerBox .imoTextarea:focus,.imoComposerBox .imoTextarea:focus-visible{outline:none !important;box-shadow:none !important;border:none}
.imoComposerFoot{display:flex;align-items:center;gap:7px;margin-top:6px;flex-wrap:wrap}
.imoComposerHint{font-size:10px;color:var(--dsw-alias-label-secondary);margin-left:auto;white-space:nowrap}
.imoContext{min-width:0;min-height:0;overflow:auto;border-left:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);padding:16px}
.imoContextSection{padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imoContextHead{display:flex;align-items:center;gap:6px;padding:0 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l1);margin-bottom:2px}
.imoContextTitleHead{font-size:12px;font-weight:600;flex:1;min-width:0}
.imoContextSection:first-child{padding-top:2px}
.imoContextSection:last-child{border-bottom:none;padding-bottom:2px}
.imoContextTitle{font-size:11px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.imoContactHero{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.imoContactName{font-size:13px;font-weight:650;line-height:17px}
.imoContactSub{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:15px}
.imoField{display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;font-size:12.5px;line-height:1.45;min-width:0}
.imoFieldLabel{color:var(--dsw-alias-label-secondary);width:88px;flex:none}
.imoFieldValue{min-width:0;overflow-wrap:anywhere;flex:1}
.imoFieldValue a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.imoDivider{height:.5px;background:var(--dsw-alias-border-l1);margin:9px 0}
.imoTagEditor{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px}
.imoTagInput{height:24px;width:92px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:10.5px;padding:0 5px;outline:none}
.imoSla{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.imoSlaTrack{height:5px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);overflow:hidden}
.imoSlaFill{height:100%;border-radius:4px;background:var(--dsw-alias-state-success-primary)}
.imoSlaFill.warn{background:var(--dsw-alias-state-warn-primary)}
.imoSlaFill.bad{background:var(--dsw-alias-state-error-primary)}
.imoEventList{display:flex;flex-direction:column;gap:7px}
.imoEvent{display:flex;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.35}
.imoEventDot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-border-l2);margin-top:4px;flex:none}
.imoGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.imoCard{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:11px;padding:13px;min-width:0;display:flex;flex-direction:column;gap:9px}
.imoCardHead{display:flex;align-items:flex-start;gap:9px}
.imoCardTitle{font-size:13px;font-weight:650;line-height:18px;overflow-wrap:anywhere}
.imoCardSub{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.4;overflow-wrap:anywhere}
.imoCardActions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:auto}
.imoStatsRow{display:flex;gap:14px;flex-wrap:wrap}
.imoStatValue{font-size:16px;font-weight:600;line-height:20px;font-variant-numeric:tabular-nums}
.imoStatLabel{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:0;text-transform:none}
.imoKpis{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:12px;margin-bottom:24px}
.imoKpi{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px 18px;min-width:0}
.imoKpiValue{font-size:22px;font-weight:600;line-height:28px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.imoKpiLabel{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.imoKpi.lead{border-color:var(--dsw-alias-border-l2)}
.imoKpi.lead .imoKpiValue{font-size:30px;line-height:36px}
.imoKpiHint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:6px}
.imoTwoCol{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:14px}
.imoChart{display:flex;align-items:flex-end;gap:8px;height:200px;padding:8px 0 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imoChartCol{flex:1;min-width:10px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px;position:relative}
.imoChartStack{width:100%;max-width:28px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;border-radius:3px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent)}
.imoChartIn{background:var(--dsw-alias-brand-primary);width:100%;min-height:0}
.imoChartOut{background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,var(--dsw-alias-bg-layer-1));width:100%;min-height:0}
.imoChartLabel{font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}
.imoLegend{display:flex;align-items:center;gap:12px;font-size:10.5px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.imoLegendSwatch{width:8px;height:8px;border-radius:2px;display:inline-block;margin-right:4px}
.imoBars{display:flex;flex-direction:column;gap:9px}
.imoBarRow{display:grid;grid-template-columns:minmax(80px,1.2fr) minmax(60px,2fr) auto;gap:8px;align-items:center;font-size:11px;min-width:0}
.imoBarTrack{height:4px;border-radius:2px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);overflow:hidden}
.imoBarFill{height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.imoTableWrap{overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1)}
.imoTable{width:100%;border-collapse:collapse;font-size:12px;min-width:680px}
.imoTable th{text-align:left;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:600;padding:9px 11px;border-bottom:.5px solid var(--dsw-alias-border-l1);white-space:nowrap;background:var(--dsw-alias-bg-layer-1);position:sticky;top:0;z-index:1}
.imoTable td{padding:9px 11px;border-bottom:.5px solid var(--dsw-alias-border-l1);vertical-align:middle}
.imoTable tr:last-child td{border-bottom:none}
.imoTable tbody tr:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent)}
.imoTableButton{border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0}
.imoTableButton:hover{color:var(--dsw-alias-brand-primary)}
.imoPill{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:6px;font-size:11px;line-height:16px;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.imoPill.success{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,var(--dsw-alias-border-l1))}
.imoPill.warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,var(--dsw-alias-border-l1))}
.imoPill.bad{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,var(--dsw-alias-border-l1))}
.imoPill.brand{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,var(--dsw-alias-border-l1))}
.imoInput{width:100%;height:34px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 10px;outline:none}
.imoTextareaForm{width:100%;min-height:86px;resize:vertical;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.45;padding:8px 9px;outline:none}
.imoFormGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.imoFormGrid .full{grid-column:1/-1}
.imoFieldGroup{display:flex;flex-direction:column;gap:6px;min-width:0}
.imoFieldLabel{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imoHelp{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.4}
.imoFormError{display:flex;align-items:flex-start;gap:6px;padding:8px 9px;border-radius:8px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:1.45;margin-bottom:10px}
.imoCheck{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer}
.imoCheck input{accent-color:var(--dsw-alias-brand-primary)}
.imoModalOverlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:22px;background:color-mix(in srgb,#000 42%,transparent)}
.imoModal{width:min(560px,100%);max-height:min(86vh,760px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden}
.imoModalWide{width:min(720px,100%)}
.imoModalHead{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none}
.imoModalTitle{font-size:14px;font-weight:650;line-height:20px;margin:0}
.imoModalSub{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.imoModalBody{padding:14px 16px;overflow:auto;min-height:0}
.imoModalFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:11px 16px;border-top:.5px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.imoModalFoot .imoBtnDanger{margin-right:auto}
.imoCodeBox{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:9px 10px;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;color:var(--dsw-alias-label-secondary)}
.imoSecretBox{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base)}
.imoSecretValue{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;word-break:break-all;flex:1;min-width:120px}
.imoToast{position:absolute;right:16px;bottom:16px;z-index:1300;max-width:min(420px,calc(100% - 32px));display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 32px rgba(0,0,0,.22);font-size:12px;line-height:1.4}
.imoToast.success{border-left:3px solid var(--dsw-alias-state-success-primary)}
.imoToast.error{border-left:3px solid var(--dsw-alias-state-error-primary)}
.imoSpinner{width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);border-top-color:var(--dsw-alias-brand-primary);animation:imoSpin .7s linear infinite;flex:none}
.imoLoading{height:100%;display:flex;align-items:center;justify-content:center;gap:9px;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.imoSkeletonRow{height:54px;border-radius:9px;background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent),color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent),color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent));background-size:200% 100%;animation:imoShimmer 1.4s ease infinite;margin-bottom:7px}
.imoSwitch{position:relative;width:34px;height:19px;border-radius:999px;border:none;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);cursor:pointer;flex:none;transition:background .15s}
.imoSwitch:after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.imoSwitchOn{background:var(--dsw-alias-brand-primary)}
.imoSwitchOn:after{transform:translateX(15px)}
.imoActionRow{display:flex;align-items:flex-end;gap:7px;flex-wrap:wrap}
.imoActionRow .imoFieldGroup{flex:1;min-width:120px}
.imoInlineForm{display:flex;align-items:flex-end;gap:7px;flex-wrap:wrap}
.imoInlineForm .imoFieldGroup{flex:1;min-width:130px}
.imoWeekdays{display:flex;gap:4px;flex-wrap:wrap}
.imoWeekday{width:30px;height:27px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer}
.imoWeekdayOn{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,var(--dsw-alias-border-l1));color:var(--dsw-alias-label-primary)}
.imoDangerZone{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 26%,var(--dsw-alias-border-l1))}
.imoDangerTitle{color:var(--dsw-alias-state-error-primary)}
.imoInfoGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.imoInfoCell{background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:9px 10px;min-width:0}
.imoInfoValue{font-size:12px;font-weight:600;overflow-wrap:anywhere}
.imoInfoLabel{font-size:10px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.imoPlatformGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:9px}
.imoPlatformGridWelcome{grid-template-columns:repeat(3,minmax(0,1fr))}
.imoPlatformCard{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;min-width:0;box-shadow:0 1px 2px color-mix(in srgb,#000 4%,transparent);transition:transform .16s,border-color .16s,background .16s}
.imoPlatformCard:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,var(--dsw-alias-bg-layer-1))}
.imoPlatformCard:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.imoPlatformBadge{width:36px;height:36px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.03em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.imoPlatformBody{min-width:0;flex:1}
.imoPlatformName{font-size:12.5px;font-weight:650;line-height:17px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.imoPlatformCaption{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.4;margin-top:2px}
.imoPlatformTags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.imoChannelSummary{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:12px;margin-bottom:24px}
.imoChannelStat{position:relative;padding:16px 18px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);min-width:0;overflow:hidden}
.imoChannelStatValue{font-size:22px;font-weight:600;line-height:26px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.imoChannelStatLabel{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:15px;margin-top:2px}
.imoChannelStat.lead .imoChannelStatValue{font-size:26px;line-height:30px}
.imoChannelGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:11px}
.imoChannelCard{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;min-width:0;display:flex;flex-direction:column;gap:8px;transition:border-color .16s,background-color .16s}
.imoChannelCard:hover{border-color:var(--dsw-alias-border-l2)}
.imoChannelHead{display:flex;align-items:flex-start;gap:9px;min-width:0}
.imoChannelIdentity{min-width:0;flex:1}
.imoChannelName{font-size:13px;font-weight:650;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoChannelCaption{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.imoChannelStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:7px 0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.imoChannelStatCell{min-width:0}
.imoChannelStatNumber{font-size:12.5px;font-weight:600}
.imoChannelStatCaption{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.imoWebhookRow{display:flex;align-items:center;gap:5px;min-width:0}
.imoWebhookCode{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.imoChannelActions{display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.imoChannelActions .imoBtnSm{padding:0 6px;font-size:11px}
.imoChannelActions .imoIconBtn{width:27px;height:27px}
.imoSetupSection{border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:11px 12px;background:var(--dsw-alias-bg-base);margin-bottom:10px;min-width:0}
.imoSetupLabel{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:600;margin-bottom:5px}
.imoSetupUrl{display:flex;align-items:center;gap:6px;min-width:0}
.imoSetupUrl .imoSecretValue{font-size:10.5px}
.imoSetupSteps{margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;font-size:11.5px;line-height:1.5}
.imoSetupSteps li::marker{color:var(--dsw-alias-brand-primary);font-weight:650}
.imoCredGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.imoCred{min-width:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:7px;padding:6px 7px;background:var(--dsw-alias-bg-layer-1)}
.imoCredKey{font-size:9.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imoCredValue{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10px;overflow-wrap:anywhere;margin-top:1px}
.imoQrWrap{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:4px 0 2px}
.imoQrFrame{width:230px;height:230px;border-radius:12px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden}
.imoQrImage{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.imoQrStatus{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;justify-content:center}
.imoProviderFoot{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.imoSetupNote{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.5}
.imoInlineCode{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10px;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.imoTranslation{margin-top:5px;padding:6px 8px;border-radius:7px;border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.imoTranslationLabel{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:600;color:var(--dsw-alias-brand-primary);margin-bottom:2px}
.imoSuggestions{display:flex;flex-direction:column;gap:5px;padding:7px 9px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,var(--dsw-alias-bg-layer-1))}
.imoSuggestionHead{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:650;color:var(--dsw-alias-brand-primary)}
.imoSuggestionCard{text-align:left;border:.5px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:1.45;padding:6px 8px;cursor:pointer}
.imoSuggestionCard:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,var(--dsw-alias-bg-base))}
.imoTranslateError{font-size:10px;color:var(--dsw-alias-state-warn-primary);margin-top:3px}
@keyframes imoSlideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
@keyframes imoSpin{to{transform:rotate(360deg)}}{grid-template-columns:repeat(2,minmax(0,1fr))}.imoCredGrid{grid-template-columns:1fr}}
@keyframes imoSpin{to{transform:rotate(360deg)}}
@keyframes imoShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.imoChannelCard:hover{transform:translateY(-1px);box-shadow:0 8px 22px color-mix(in srgb,#000 9%,transparent);border-color:var(--dsw-alias-border-l2)}
.imoPlatformCard:hover{transform:translateY(-1px)}
.imoWelcome{position:relative;overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:24px;margin-bottom:24px;text-align:left;display:flex;flex-direction:column;align-items:flex-start}
.imoWelcomeIcon{width:40px;height:40px;margin:0 0 12px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);position:relative;z-index:1}
.imoWelcomeTitle{font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:28px;margin:0;position:relative;z-index:1}
.imoWelcomeBody{font-size:13px;color:var(--dsw-alias-label-secondary);max-width:620px;margin:6px 0 16px;line-height:1.6;position:relative;z-index:1}
.imoWelcomeSteps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;width:100%;margin:20px 0 0;text-align:left;position:relative;z-index:1}
.imoWelcomeStep{padding:12px 0 0;border:none;border-top:.5px solid var(--dsw-alias-border-l1);border-radius:0;background:transparent}
.imoWelcomeStepNumber{width:auto;height:auto;border-radius:0;display:inline-flex;align-items:center;justify-content:flex-start;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;margin-bottom:4px}
.imoWelcomeStepTitle{font-size:13px;font-weight:500}
.imoWelcomeStepBody{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5;margin-top:2px}
.imoChannelStatTop{display:flex;align-items:center;gap:12px}
.imoMetricIcon{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);flex:none}
.imoMetricIcon.success{color:var(--dsw-alias-label-tertiary)}
.imoMetricIcon.bad{color:var(--dsw-alias-label-tertiary)}
.imoChannelStatTop .imoChannelStatValue{margin:0}
@media (prefers-reduced-motion:reduce){.imoChannelCard,.imoPlatformCard{transition:none}}
@media (max-width:720px){.imoWelcomeSteps{grid-template-columns:1fr}.imoWelcome{padding:24px 16px 20px}}
@keyframes imoSlideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
@media (max-width:1180px){.imoInbox,.imoInboxDetails{grid-template-columns:280px minmax(0,1fr)}.imoInboxDetails .imoContext{display:block;position:absolute;right:0;top:0;bottom:0;width:min(320px,92%);z-index:30;box-shadow:-12px 0 30px rgba(0,0,0,.18)}.imoTwoCol{grid-template-columns:minmax(0,1fr)}.imoKpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.imoInbox{grid-template-columns:250px minmax(0,1fr)}.imoThreadHead{flex-wrap:wrap}.imoThreadActions{width:100%;overflow-x:auto}.imoPage{padding:15px}.imoBrandSub{display:none}.imoTopSearch{max-width:none}}
@media (max-width:720px){.imoInbox{grid-template-columns:minmax(0,1fr)}.imoListCol{display:none}.imoThreadActions .imoSelect{max-width:120px}.imoTop{flex-wrap:wrap;padding:8px 12px;height:auto}.imoTopSearch{order:3;max-width:none;flex-basis:100%}.imoContent{min-height:0}.imoFormGrid{grid-template-columns:1fr}.imoChart{gap:4px}.imoKpiValue{font-size:18px}}
@media (prefers-reduced-motion:reduce){.imoSpinner,.imoSkeletonRow{animation:none}}
`

    /** Simplified Chinese copy. */
    const zh = {
      'panel.label': '全渠道 IM',
      'panel.sub': '统一收件箱 · 官方 API · 扫码登录',
      'app.demo': '演示数据',
      'app.searchPlaceholder': '搜索会话、联系人、消息…',
      'app.refresh': '刷新',
      'app.signOut': '退出登录',
      'app.offline': '离线，正在重试',
      'app.loading': '正在加载全渠道工作区…',
      'app.loadError': '工作区加载失败',
      'app.loadErrorBody': '无法连接 Host API。请确认插件已启用，然后重试。',
      'app.retry': '重试',
      'app.currentAgent': '当前坐席',
      'app.noAgent': '未选择坐席',
      'app.saved': '已保存',
      'app.version': '版本',
      'app.bridge': '全渠道',
      'nav.inbox': '收件箱',
      'nav.contacts': '联系人',
      'nav.channels': '渠道',
      'nav.templates': '快捷回复',
      'nav.broadcasts': '群发',
      'nav.automation': '自动化',
      'nav.analytics': '数据分析',
      'nav.settings': '设置',
      'common.cancel': '取消',
      'common.save': '保存',
      'common.saving': '保存中…',
      'common.delete': '删除',
      'common.edit': '编辑',
      'common.close': '关闭',
      'common.confirm': '确认',
      'common.add': '添加',
      'common.remove': '移除',
      'common.copy': '复制',
      'common.copied': '已复制',
      'common.all': '全部',
      'common.none': '无',
      'common.never': '从未',
      'common.unknown': '未知',
      'common.search': '搜索',
      'common.reset': '重置',
      'common.refresh': '刷新',
      'common.new': '新建',
      'common.open': '打开',
      'common.back': '返回',
      'common.optional': '可选',
      'common.required': '必填',
      'common.loading': '加载中…',
      'common.noData': '暂无数据',
      'common.today': '今天',
      'common.yesterday': '昨天',
      'common.actions': '操作',
      'common.more': '更多',
      'common.enabled': '已启用',
      'common.disabled': '已停用',
      'common.send': '发送',
      'common.sending': '发送中…',
      'common.deleted': '已删除',
      'common.created': '已创建',
      'common.updated': '已更新',
      'common.failed': '失败',
      'common.yes': '是',
      'common.no': '否',
      'common.filter': '筛选',
      'common.clear': '清空',
      'common.now': '现在',
      'common.auto': '自动',
      'status.open': '进行中',
      'status.pending': '待跟进',
      'status.resolved': '已解决',
      'status.snoozed': '已稍后提醒',
      'status.all': '全部',
      'priority.low': '低',
      'priority.normal': '普通',
      'priority.high': '高',
      'priority.urgent': '紧急',
      'availability.online': '在线',
      'availability.busy': '忙碌',
      'availability.offline': '离线',
      'channelStatus.active': '已启用',
      'channelStatus.paused': '已暂停',
      'broadcastStatus.draft': '草稿',
      'broadcastStatus.scheduled': '已排期',
      'broadcastStatus.sending': '发送中',
      'broadcastStatus.sent': '已发送',
      'broadcastStatus.failed': '失败',
      'broadcastStatus.cancelled': '已取消',
      'trigger.message.received': '收到消息',
      'trigger.conversation.created': '新建会话',
      'trigger.conversation.assigned': '会话分配',
      'action.assign': '分配坐席',
      'action.tag': '添加标签',
      'action.priority': '设置优先级',
      'action.status': '设置状态',
      'action.reply': '自动回复',
      'action.snooze': '稍后提醒',
      'role.admin': '管理员',
      'role.agent': '坐席',
      'day.1': '一',
      'day.2': '二',
      'day.3': '三',
      'day.4': '四',
      'day.5': '五',
      'day.6': '六',
      'day.7': '日',
      'time.justNow': '刚刚',
      'time.minsAgo': '{n} 分钟前',
      'time.hoursAgo': '{n} 小时前',
      'time.daysAgo': '{n} 天前',
      'time.minutesShort': '{n} 分',
      'time.hoursShort': '{n} 小时',
      'time.daysShort': '{n} 天',
      'time.noValue': '—',
      'sla.breachedBy': '超时 {d}',
      'sla.dueIn': '剩余 {d}',
      'sla.responded': '已首次响应',
      'sla.noInbound': '暂无客户消息',
      'inbox.title': '收件箱',
      'inbox.subtitle': '所有渠道的客户对话都在这里。',
      'inbox.count': '{n} 个会话',
      'inbox.emptyTitle': '收件箱是空的',
      'inbox.emptyBody': '通过 HTTP 桥接接入一个渠道后，新消息会出现在这里。',
      'inbox.noResults': '没有匹配的会话',
      'inbox.search': '搜索会话',
      'inbox.channel': '渠道',
      'inbox.assignee': '负责人',
      'inbox.allChannels': '全部渠道',
      'inbox.allAgents': '全部坐席',
      'inbox.unassigned': '未分配',
      'inbox.mine': '我的',
      'inbox.unread': '未读',
      'inbox.noSubject': '未命名会话',
      'inbox.sla': 'SLA',
      'inbox.demoHint': '演示数据可在设置中清空',
      'conversation.context': '客户详情',
      'conversation.details': '详情',
      'conversation.customerDetails': '客户详情',
      'conversation.detailsToggle': '打开/关闭客户详情',
      'translate.short': '译文',
      'translate.label': '译文',
      'translate.toggle': '显示或隐藏自动翻译',
      'translate.unavailable': '自动翻译暂不可用',
      'ai.suggest': 'AI 建议',
      'ai.title': 'AI 建议回复',
      'ai.regenerate': '重新生成',
      'ai.empty': '模型没有返回可用建议',
      'conversation.contact': '联系人',
      'conversation.details': '会话详情',
      'conversation.tags': '标签',
      'conversation.addTag': '添加标签',
      'conversation.tagPlaceholder': '输入后回车',
      'conversation.assignee': '负责人',
      'conversation.priority': '优先级',
      'conversation.status': '状态',
      'conversation.created': '创建时间',
      'conversation.firstResponse': '首次响应',
      'conversation.lastInbound': '最近来信',
      'conversation.externalId': '外部会话 ID',
      'conversation.resolve': '标记解决',
      'conversation.reopen': '重新打开',
      'conversation.snooze': '稍后提醒',
      'conversation.snooze1h': '1 小时',
      'conversation.snooze4h': '4 小时',
      'conversation.snoozeTomorrow': '明天',
      'conversation.viewContact': '查看联系人',
      'conversation.notes': '内部备注',
      'conversation.addNotePlaceholder': '写一条只有团队可见的备注…',
      'conversation.activity': '最近活动',
      'conversation.noActivity': '暂无活动',
      'conversation.noMessages': '还没有消息',
      'conversation.you': '你',
      'conversation.unknownContact': '未知联系人',
      'conversation.noChannel': '渠道已删除',
      'conversation.messageCount': '{n} 条消息',
      'conversation.openInContacts': '在联系人中打开',
      'composer.reply': '回复',
      'composer.note': '内部备注',
      'composer.placeholderReply': '输入回复…',
      'composer.placeholderNote': '输入内部备注…',
      'composer.send': '发送',
      'composer.saveNote': '保存备注',
      'composer.template': '插入快捷回复',
      'composer.attach': '附件',
      'composer.hint': 'Enter 发送 · Shift+Enter 换行',
      'composer.noteHint': '仅团队可见，不会发送给客户',
      'composer.noTemplates': '暂无可用快捷回复',
      'message.retry': '重试',
      'message.failed': '发送失败：{error}',
      'message.local': '本地备注',
      'message.internalNote': '内部备注',
      'message.attachments': '{n} 个附件',
      'message.noText': '（无文本）',
      'message.file': '附件',
      'contacts.title': '联系人',
      'contacts.subtitle': '跨渠道识别同一位客户，保留完整上下文。',
      'contacts.new': '新建联系人',
      'contacts.search': '搜索姓名、邮箱、标签…',
      'contacts.emptyTitle': '还没有联系人',
      'contacts.emptyBody': '收到第一条桥接消息或手动新建后，联系人会显示在这里。',
      'contacts.noResults': '没有匹配的联系人',
      'contacts.count': '{n} 位联系人',
      'contacts.name': '姓名',
      'contacts.handle': '账号',
      'contacts.email': '邮箱',
      'contacts.phone': '电话',
      'contacts.company': '公司',
      'contacts.tags': '标签',
      'contacts.channels': '渠道身份',
      'contacts.conversations': '会话',
      'contacts.lastSeen': '最近活跃',
      'contacts.created': '创建时间',
      'contacts.notes': '备注',
      'contacts.addNote': '添加备注',
      'contacts.save': '保存联系人',
      'contacts.delete': '删除联系人',
      'contacts.deleteConfirm': '删除联系人“{name}”？此操作不可撤销。',
      'contacts.detailTitle': '联系人详情',
      'contacts.editTitle': '编辑联系人',
      'contacts.newTitle': '新建联系人',
      'contacts.noNotes': '暂无备注',
      'contacts.noChannels': '暂无渠道身份',
      'contacts.identities': '身份',
      'contacts.noCompany': '未填写公司',
      'contacts.noEmail': '未填写邮箱',
      'contacts.noPhone': '未填写电话',
      'contacts.noHandle': '未填写账号',
      'contacts.tagPlaceholder': '标签',
      'contacts.addTag': '添加标签',
      'contacts.attributes': '自定义属性',
      'contacts.openConversation': '打开最近会话',
      'contacts.timeline': '会话记录',
      'channels.title': '渠道',
      'channels.subtitle': '官方 API、个人号扫码与自建 HTTP 桥接，统一进入同一个收件箱。',
      'channels.new': '新建渠道',
      'channels.emptyTitle': '还没有渠道',
      'channels.emptyBody': '新建一个 HTTP 桥接渠道，把任意 IM 的消息转发到 DSH。',
      'channels.count': '{n} 个渠道',
      'channels.active': '已启用',
      'channels.paused': '已暂停',
      'channels.inbound': '收到',
      'channels.outbound': '发出',
      'channels.lastInbound': '最近来信',
      'channels.lastOutbound': '最近发出',
      'channels.lastError': '最近错误',
      'channels.webhook': '入站 Webhook',
      'channels.webhookHint': '把渠道侧事件 POST 到这个地址；token 或 HMAC 签名用于鉴权。',
      'channels.copyWebhook': '复制地址与 token',
      'channels.copySecret': '复制 token',
      'channels.copied': '已复制',
      'channels.revealSecret': '显示 token',
      'channels.hideSecret': '隐藏 token',
      'channels.rotateSecret': '轮换 token',
      'channels.rotateConfirm': '轮换 token 会立即让旧 token 失效。确定继续？',
      'channels.test': '测试桥接',
      'channels.testing': '测试中…',
      'channels.testOk': '桥接连接成功',
      'channels.pause': '暂停',
      'channels.resume': '启用',
      'channels.delete': '删除渠道',
      'channels.deleteConfirm': '删除渠道“{name}”？只有没有会话的渠道可以删除。',
      'channels.editTitle': '编辑渠道',
      'channels.newTitle': '新建 HTTP 桥接渠道',
      'channels.name': '渠道名称',
      'channels.namePlaceholder': '例如：官网在线客服',
      'channels.description': '描述',
      'channels.descriptionPlaceholder': '这个渠道来自哪里？',
      'channels.outboundUrl': '出站地址',
      'channels.outboundHint': '可选。DSH 会把回复 POST 到这个地址；留空则只接收。',
      'channels.status': '状态',
      'channels.secret': 'Bridge token',
      'channels.secretHint': '入站请求可放在 ?token=、x-im-omni-token 或 Authorization: Bearer 中。',
      'channels.secretOnce': '请立即保存：token 只在此刻显示。',
      'channels.protocol': '桥接协议',
      'channels.protocolInbound': '入站 JSON',
      'channels.protocolOutbound': '出站 JSON',
      'channels.inboundDoc': '入站：POST /api/im-omni.webhook/<channelId>，支持 externalConversationId、contact、message.text / attachments、externalMessageId。',
      'channels.outboundDoc': '出站：DSH POST 到渠道配置的 outboundUrl，携带 x-im-omni-signature: sha256=<hmac>，事件类型为 message.created 或 ping。',
      'channels.noOutbound': '未配置出站地址，只能接收消息。',
      'channels.demo': '演示通道',
      'channels.noSecret': '未生成 token',
      'channels.channelType': '类型',
      'channels.add': '添加渠道',
      'channels.welcomeTitle': '还没有接入渠道',
      'channels.welcomeBody': '选一个平台，填凭据或扫码登录。客户消息会进入收件箱，人工接待、翻译和 AI 建议都在同一条会话里。',
      'channels.welcomeStep1': '连接渠道',
      'channels.welcomeStep1Body': '选择平台，填凭据或扫码登录。',
      'channels.welcomeStep2': '验收入站',
      'channels.welcomeStep2Body': '从客户侧发一条消息，确认进入收件箱。',
      'channels.welcomeStep3': '开始接待',
      'channels.welcomeStep3Body': '配置翻译、AI 建议和自动接待规则。',
      'channels.addTitle': '选择渠道平台',
      'channels.addSubtitle': '官方 API 直连，或通过扫码/HTTP 桥接接入没有开放协议的平台。',
      'channels.choosePlatform': '选择平台后填写凭据；创建后仍可随时修改。',
      'channels.summaryActive': '已启用',
      'channels.summaryPlatforms': '可用平台',
      'channels.summaryConnected': '连接正常',
      'channels.summaryErrors': '待处理',
      'channels.health.ready': '待验证',
      'channels.health.connected': '已连接',
      'channels.health.error': '连接异常',
      'channels.health.unconfigured': '未配置',
      'channels.official': '官方 API',
      'channels.unofficial': '非官方桥接',
      'channels.transport.webhook': 'Webhook',
      'channels.transport.polling': '长轮询',
      'channels.transport.gateway': 'Gateway',
      'channels.transport.bridge': '扫码桥接',
      'channels.setup': '接入设置',
      'channels.setupTitle': '接入设置',
      'channels.editConfig': '编辑配置',
      'channels.testConnection': '测试连接',
      'channels.qrLogin': '扫码登录',
      'channels.qrTitle': '扫码登录',
      'channels.qrSubtitle': '二维码由 DSH 内置会话或外部桥接生成；DSH 不保存个人号凭据。',
      'channels.qrRefresh': '刷新二维码',
      'channels.qrWaiting': '等待扫码',
      'channels.qrScanning': '已扫码，请在手机上确认',
      'channels.qrConnected': '已登录',
      'channels.qrDisconnected': '未连接',
      'channels.qrStarting': '正在启动会话',
      'channels.qrError': '二维码获取失败',
      'channels.qrHint': '打开手机上的对应 App，进入“已连接的设备”或“扫一扫”，扫描上方二维码。',
      'channels.qrAccount': '当前账号',
      'channels.qrMissing': '尚未获取二维码。请确认桥接地址和 token 已保存。',
      'channels.callback': '回调地址',
      'channels.callbackHint': '把这个地址填到平台后台；不同平台的校验方式见下方步骤。',
      'channels.webhookUrl': 'Webhook URL',
      'channels.copyUrl': '复制地址',
      'channels.credentials': '凭据',
      'channels.showSecrets': '显示敏感值',
      'channels.hideSecrets': '隐藏敏感值',
      'channels.secretSet': '已配置',
      'channels.leaveBlank': '留空则保留已保存的值',
      'channels.configTitle': '渠道配置',
      'channels.optional': '可选',
      'channels.required': '必填',
      'channels.gatewayNote': '该平台使用 Host 长连接接收消息，不需要公网回调地址。',
      'channels.pollingNote': '长轮询模式不需要公网地址；切换到 Webhook 后需要公网 HTTPS。',
      'channels.inboundOnly': '仅入站',
      'channels.platformCount': '{n} 个平台',
      'channels.openDocs': '平台文档',
      'channels.connectedAs': '账号：{name}',
      'channels.testFailed': '连接测试失败',
      'channels.setupNote': '所有凭据保存在 Host 侧状态文件（0600），浏览器快照只显示掩码；点击“显示敏感值”才会返回一次明文。',
      'channels.fieldMissing': '请填写 {field}',
      'channels.atLeastOne': '以下至少填写一项',
      'channels.atLeastOneShort': '至少一项',
      'channels.autoGenerated': '自动生成',
      'channels.autoGeneratedHint': '留空时由 DSH 自动生成安全随机值',
      'channels.qrUnreachable': '无法连接桥接服务：请检查 Bridge URL、桥接进程是否启动、token 是否正确。',
      'channels.embeddedNote': '内置扫码模式由 DSH Host 直接运行 Baileys，无需 Webhook 或公网地址。',
      'channels.saveConfig': '保存配置',
      'channels.platform': '平台',
      'channels.addPlatform': '添加{name}',
      'channels.configuredAt': '最近检查',
      'channels.noCallback': '此渠道由 Host 主动连接，无需回调地址。',
      'channels.rotateBridge': '轮换桥接 token',
      'channels.rotateBridgeConfirm': '轮换后桥接端必须立即改用新 token，否则入站和扫码状态都会失败。继续？',
      'channels.internalToken': '内部 secret',
      'channels.copyToken': '复制 token',
      'channels.secretTitle': '凭据与地址',
      'channels.secretSubtitle': '仅当前登录的 owner 可查看。',
      'channels.newConfig': '新建{name}',
      'channels.nameHint': '用于在统一收件箱中区分来源。',
      'channels.display': '显示',
      'channels.testSuccess': '连接成功',
      'channels.testDetail': '连接成功：{detail}',
      'templates.title': '快捷回复',
      'templates.subtitle': '把常用回复保存为模板，支持变量替换和渠道范围。',
      'templates.new': '新建快捷回复',
      'templates.emptyTitle': '还没有快捷回复',
      'templates.emptyBody': '创建一条模板，在回复框中一键插入。',
      'templates.count': '{n} 条模板',
      'templates.name': '模板名称',
      'templates.shortcut': '快捷指令',
      'templates.body': '模板内容',
      'templates.channels': '适用渠道',
      'templates.allChannels': '全部渠道',
      'templates.locale': '语言',
      'templates.usage': '使用 {n} 次',
      'templates.edit': '编辑模板',
      'templates.delete': '删除模板',
      'templates.deleteConfirm': '删除模板“{name}”？',
      'templates.editTitle': '编辑快捷回复',
      'templates.newTitle': '新建快捷回复',
      'templates.namePlaceholder': '例如：退款已收到',
      'templates.shortcutPlaceholder': '/refund',
      'templates.bodyPlaceholder': '输入模板内容…',
      'templates.bodyHint': '可用变量：{{contact.name}}、{{workspace.name}}、{{conversation.id}}、{{agent.name}}。',
      'templates.preview': '预览',
      'templates.previewHint': '使用第一位匹配联系人的上下文预览。',
      'templates.search': '搜索模板',
      'templates.insert': '插入',
      'templates.scope': '渠道范围',
      'broadcasts.title': '群发',
      'broadcasts.subtitle': '按标签圈选受众，通过某个渠道批量发送并跟踪结果。',
      'broadcasts.new': '新建群发',
      'broadcasts.emptyTitle': '还没有群发',
      'broadcasts.emptyBody': '创建一个草稿，选择渠道和受众后发送或排期。',
      'broadcasts.count': '{n} 个群发',
      'broadcasts.name': '群发名称',
      'broadcasts.channel': '发送渠道',
      'broadcasts.audience': '受众标签',
      'broadcasts.audienceHint': '留空表示该渠道上的所有联系人。',
      'broadcasts.audienceAll': '全部联系人',
      'broadcasts.tagPlaceholder': '例如：vip',
      'broadcasts.body': '消息内容',
      'broadcasts.schedule': '排期',
      'broadcasts.scheduledAt': '计划发送时间',
      'broadcasts.status': '状态',
      'broadcasts.targeted': '目标',
      'broadcasts.sent': '成功',
      'broadcasts.failed': '失败',
      'broadcasts.created': '创建时间',
      'broadcasts.sentAt': '发送时间',
      'broadcasts.sendNow': '立即发送',
      'broadcasts.send': '发送',
      'broadcasts.scheduleAction': '排期发送',
      'broadcasts.cancel': '取消',
      'broadcasts.delete': '删除群发',
      'broadcasts.deleteConfirm': '删除群发“{name}”？',
      'broadcasts.sendConfirm': '向 {n} 位匹配联系人的渠道会话发送“{name}”？',
      'broadcasts.edit': '编辑',
      'broadcasts.editTitle': '编辑群发',
      'broadcasts.createTitle': '新建群发',
      'broadcasts.bodyPlaceholder': '输入要群发的消息…',
      'broadcasts.namePlaceholder': '例如：十月产品更新',
      'broadcasts.noChannels': '还没有可用渠道',
      'broadcasts.noChannelsBody': '先在“渠道”中创建并启用一个渠道。',
      'broadcasts.stats': '发送结果',
      'broadcasts.progress': '已发送 {sent} / {total}',
      'broadcasts.draftHelp': '草稿不会发送，保存后可以再排期或立即发送。',
      'broadcasts.scheduledHelp': '到点后 Host 会自动发送；请保持 DSH 运行。',
      'automation.title': '自动化',
      'automation.subtitle': '用触发条件自动分配、打标签、升级优先级或回复。',
      'automation.new': '新建规则',
      'automation.emptyTitle': '还没有自动化规则',
      'automation.emptyBody': '创建一条规则，让重复的分流和回复自动完成。',
      'automation.count': '{n} 条规则',
      'automation.name': '规则名称',
      'automation.trigger': '触发事件',
      'automation.keyword': '关键词',
      'automation.keywordPlaceholder': '消息包含…',
      'automation.contactTag': '联系人标签',
      'automation.contactTagPlaceholder': '例如：vip',
      'automation.priority': '当前优先级',
      'automation.conditions': '条件',
      'automation.actions': '动作',
      'automation.actionType': '动作',
      'automation.actionValue': '值',
      'automation.addAction': '添加动作',
      'automation.removeAction': '移除动作',
      'automation.enabled': '启用',
      'automation.lastRun': '最近运行',
      'automation.runs': '已运行 {n} 次',
      'automation.edit': '编辑规则',
      'automation.delete': '删除规则',
      'automation.deleteConfirm': '删除自动化“{name}”？',
      'automation.editTitle': '编辑自动化',
      'automation.createTitle': '新建自动化',
      'automation.namePlaceholder': '例如：VIP 自动分配',
      'automation.triggerHint': '条件留空表示不限制。',
      'automation.valuePlaceholder': '输入值',
      'automation.replyPlaceholder': '自动回复内容…',
      'automation.minutes': '分钟',
      'automation.assignAuto': '自动选择在线坐席',
      'automation.selectAgent': '选择坐席',
      'automation.selectPriority': '选择优先级',
      'automation.selectStatus': '选择状态',
      'automation.snoozeMinutes': '稍后提醒时长',
      'automation.noActions': '至少添加一个动作',
      'automation.save': '保存规则',
      'analytics.title': '数据分析',
      'analytics.subtitle': '从会话、消息、渠道和坐席负载观察服务质量。',
      'analytics.empty': '还没有足够的数据',
      'analytics.open': '未解决会话',
      'analytics.unread': '未读消息',
      'analytics.awaiting': '等待回复',
      'analytics.breached': 'SLA 超时',
      'analytics.resolvedToday': '今日解决',
      'analytics.messages7d': '近 7 天消息',
      'analytics.avgFirstResponse': '平均首次响应',
      'analytics.avgResolution': '平均解决时长',
      'analytics.contacts': '联系人',
      'analytics.channels': '渠道',
      'analytics.activeChannels': '启用渠道',
      'analytics.volume': '近 14 天消息量',
      'analytics.volumeHint': '按 UTC 日期聚合，含入站和出站消息。',
      'analytics.byChannel': '渠道分布',
      'analytics.byAgent': '坐席负载',
      'analytics.agentOpen': '未解决',
      'analytics.agentResolvedToday': '今日解决',
      'analytics.agentTotal': '累计',
      'analytics.broadcasts': '群发表现',
      'analytics.delivered': '成功送达',
      'analytics.failed': '失败',
      'analytics.scheduled': '已排期',
      'analytics.drafted': '草稿',
      'analytics.noData': '暂无数据',
      'analytics.inbound': '入站',
      'analytics.outbound': '出站',
      'analytics.totalMessages': '消息总量',
      'analytics.performance': '服务表现',
      'analytics.responseTime': '首次响应',
      'analytics.resolutionTime': '解决时长',
      'analytics.load': '负载',
      'settings.title': '设置',
      'settings.subtitle': '工作区偏好、团队、SLA 和数据管理。',
      'settings.workspace': '工作区',
      'settings.intelligence': '翻译与 AI',
      'settings.translation': '自动翻译',
      'settings.translationOn': '自动翻译客户消息',
      'settings.translationHint': '进入会话时自动把客户消息译为目标语言；原文保留。',
      'settings.translationTarget': '目标语言',
      'settings.translationTargetHint': 'BCP-47 或常用语言代码，例如 zh-CN、en、ja、es、ar。',
      'settings.ai': 'AI 建议回复',
      'settings.aiOn': '在回复框显示 AI 建议',
      'settings.aiHint': '使用 DSH 当前默认模型，基于会话上下文生成 3 条草稿，不会自动发送。',
      'settings.bot': '自动接待机器人',
      'settings.botHint': '开启后，新客户消息会由 DSH 默认模型自动接待并回复；命中转人工关键词、达到最大轮次或客户要求人工时自动转人工。',
      'settings.botEnabled': '机器人接待',
      'settings.botEnabledOn': '启用自动接待',
      'settings.botName': '机器人名称',
      'settings.botMaxTurns': '最大自动轮次',
      'settings.botMaxTurnsHint': '达到后自动转人工，防止无限对话。',
      'settings.botHandoff': '转人工关键词',
      'settings.botHandoffHint': '逗号分隔；客户消息包含任一关键词时立即转人工。',
      'settings.botGreeting': '欢迎语（可选）',
      'settings.botGreetingPlaceholder': '例如：您好，我是 AI 客服，请问有什么可以帮您？',
      'settings.botInstructions': '接待规则',
      'settings.botInstructionsHint': '会作为系统策略注入模型；不要写密钥。',
      'settings.botInstructionsPlaceholder': '例如：只回答售后和物流问题；退款审批必须转人工；不要承诺具体到账时间。',
      'bot.name': 'AI 接待',
      'bot.takeover': '人工接管',
      'bot.resume': '恢复 AI',
      'bot.toggle': '切换 AI 接待 / 人工接管',
      'bot.paused': '已切换为人工接管',
      'bot.resumed': '已恢复 AI 接待',
      'settings.workspaceName': '工作区名称',
      'settings.timezone': '时区',
      'settings.sla': '默认 SLA',
      'settings.slaHint': '从首次客户消息到首次回复的目标时长。',
      'settings.autoAssign': '自动分配',
      'settings.autoAssignHint': '新会话自动分配给在线且负载最低的坐席。',
      'settings.businessHours': '工作时间',
      'settings.start': '开始',
      'settings.end': '结束',
      'settings.days': '工作日',
      'settings.save': '保存设置',
      'phone.title': '手机配对',
      'phone.hint': '手机 App 要先与主机配对，之后才能远程收发消息。配对码 5 分钟内有效、只能使用一次。',
      'phone.entry': '入口',
      'phone.generate': '生成配对码',
      'phone.generating': '生成中…',
      'phone.expires': '剩余',
      'phone.once': '扫码或把链接发给手机后，用一次即失效。',
      'phone.devices': '已配对设备',
      'phone.manage': '设备管理在 DSH 全局设置的「手机远程」里。',
      'phone.missing': '未检测到手机远程入口，请先安装并启用 phone-remote 插件。',
      'phone.failed': '生成失败',
      'upgrade.title': '插件更新',
      'upgrade.current': '当前',
      'upgrade.check': '检查更新',
      'upgrade.checking': '检查中…',
      'upgrade.pull': '立即更新',
      'upgrade.pulling': '更新中…',
      'upgrade.upToDate': '已是最新',
      'upgrade.behind': '个提交待拉取',
      'upgrade.ahead': '个本地提交未推送',
      'upgrade.dirty': '工作区有未提交改动，已暂停更新',
      'upgrade.notRepo': '当前不是 Git 目录安装，无法自更新',
      'upgrade.unknown': '尚未检查',
      'upgrade.restart': '已更新，重载插件（或重启 DSH）后生效',
      'upgrade.failed': '更新失败',
      'upgrade.branch': '分支',
      'settings.saved': '设置已保存',
      'settings.team': '团队',
      'settings.teamHint': '坐席可在会话中被分配，并参与自动路由。',
      'settings.addMember': '添加成员',
      'settings.memberName': '成员姓名',
      'settings.memberEmail': '邮箱',
      'settings.role': '角色',
      'settings.availability': '状态',
      'settings.remove': '移除',
      'settings.removeConfirm': '移除成员“{name}”？请先转移其会话。',
      'settings.currentAgent': '当前坐席',
      'settings.danger': '数据管理',
      'settings.dangerHint': '数据保存在当前 DSH Profile 的 Host 目录中。',
      'settings.resetDemo': '重置演示数据',
      'settings.exitDemo': '退出演示模式',
      'settings.exitDemoConfirm': '删除内置演示渠道、联系人、会话和示例规则，保留你自己创建的记录。继续？',
      'toast.demoExited': '已退出演示模式',
      'settings.resetConfirm': '用初始演示数据替换当前工作区？现有会话、联系人、渠道和模板都会被替换。',
      'settings.clearData': '清空所有数据',
      'settings.clearConfirm': '清空全部会话、联系人、渠道、模板、群发和自动化？此操作不可撤销。',
      'settings.dataLocation': '数据文件',
      'settings.plugin': '插件信息',
      'settings.version': '版本',
      'settings.bridge': '桥接协议',
      'settings.roleAdmin': '管理员',
      'settings.roleAgent': '坐席',
      'settings.storage': '存储',
      'settings.storageHint': 'Host 侧原子写入的 JSON 文档。浏览器不保存业务数据。',
      'settings.weekdays': '工作日',
      'settings.noTeam': '还没有团队成员',
      'settings.memberAdded': '成员已添加',
      'settings.memberDeleted': '成员已移除',
      'settings.saveSettings': '保存设置',
      'toast.messageQueued': '消息已加入发送队列',
      'toast.noteAdded': '内部备注已保存',
      'toast.conversationUpdated': '会话已更新',
      'toast.contactSaved': '联系人已保存',
      'toast.contactDeleted': '联系人已删除',
      'toast.channelCreated': '渠道已创建',
      'toast.channelUpdated': '渠道已更新',
      'toast.channelDeleted': '渠道已删除',
      'toast.secretRotated': 'Bridge token 已轮换',
      'toast.templateSaved': '快捷回复已保存',
      'toast.templateDeleted': '快捷回复已删除',
      'toast.automationSaved': '自动化已保存',
      'toast.automationDeleted': '自动化已删除',
      'toast.broadcastCreated': '群发草稿已创建',
      'toast.broadcastUpdated': '群发已更新',
      'toast.broadcastSent': '群发已发送',
      'toast.broadcastScheduled': '群发已排期',
      'toast.broadcastCancelled': '群发已取消',
      'toast.broadcastDeleted': '群发已删除',
      'toast.settingsSaved': '设置已保存',
      'toast.agentAdded': '成员已添加',
      'toast.agentUpdated': '成员已更新',
      'toast.agentDeleted': '成员已移除',
      'toast.demoReset': '演示数据已重置',
      'toast.dataCleared': '所有数据已清空',
      'toast.copied': '已复制到剪贴板',
      'toast.testPassed': '桥接测试成功',
      'error.generic': '操作失败，请重试',
      'error.unauthorized': '桥接鉴权失败',
      'error.channel-paused': '该渠道已暂停',
      'error.channel-in-use': '渠道仍有会话，不能删除',
      'error.contact-in-use': '联系人仍有会话，不能删除',
      'error.agent-in-use': '坐席仍有会话，不能移除',
      'error.broadcast-sent': '该群发已经发送',
      'error.invalid-url': '出站地址必须是 http(s) URL',
      'error.invalid-name': '名称不能为空',
      'error.empty-body': '内容不能为空',
      'error.empty-message': '消息不能为空',
      'error.bridge-test-failed': '桥接测试失败',
      'error.rate-limited': '请求过于频繁，请稍后重试',
    }

    /** English copy. */
    const en = {
      'panel.label': 'Omnichannel IM',
      'panel.sub': 'Unified inbox · official APIs · QR login',
      'app.demo': 'Demo data',
      'app.searchPlaceholder': 'Search conversations, contacts, messages…',
      'app.refresh': 'Refresh',
      'app.signOut': 'Sign out',
      'app.offline': 'Offline, retrying',
      'app.loading': 'Loading the omnichannel workspace…',
      'app.loadError': 'Workspace could not load',
      'app.loadErrorBody': 'The Host API is unreachable. Confirm the plugin is enabled, then retry.',
      'app.retry': 'Retry',
      'app.currentAgent': 'Current agent',
      'app.noAgent': 'No agent selected',
      'app.saved': 'Saved',
      'app.version': 'Version',
      'app.bridge': 'Omnichannel',
      'nav.inbox': 'Inbox',
      'nav.contacts': 'Contacts',
      'nav.channels': 'Channels',
      'nav.templates': 'Templates',
      'nav.broadcasts': 'Broadcasts',
      'nav.automation': 'Automation',
      'nav.analytics': 'Analytics',
      'nav.settings': 'Settings',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.saving': 'Saving…',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.close': 'Close',
      'common.confirm': 'Confirm',
      'common.add': 'Add',
      'common.remove': 'Remove',
      'common.copy': 'Copy',
      'common.copied': 'Copied',
      'common.all': 'All',
      'common.none': 'None',
      'common.never': 'Never',
      'common.unknown': 'Unknown',
      'common.search': 'Search',
      'common.reset': 'Reset',
      'common.refresh': 'Refresh',
      'common.new': 'New',
      'common.open': 'Open',
      'common.back': 'Back',
      'common.optional': 'Optional',
      'common.required': 'Required',
      'common.loading': 'Loading…',
      'common.noData': 'No data yet',
      'common.today': 'Today',
      'common.yesterday': 'Yesterday',
      'common.actions': 'Actions',
      'common.more': 'More',
      'common.enabled': 'Enabled',
      'common.disabled': 'Disabled',
      'common.send': 'Send',
      'common.sending': 'Sending…',
      'common.deleted': 'Deleted',
      'common.created': 'Created',
      'common.updated': 'Updated',
      'common.failed': 'Failed',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.filter': 'Filter',
      'common.clear': 'Clear',
      'common.now': 'Now',
      'common.auto': 'Auto',
      'status.open': 'Open',
      'status.pending': 'Pending',
      'status.resolved': 'Resolved',
      'status.snoozed': 'Snoozed',
      'status.all': 'All',
      'priority.low': 'Low',
      'priority.normal': 'Normal',
      'priority.high': 'High',
      'priority.urgent': 'Urgent',
      'availability.online': 'Online',
      'availability.busy': 'Busy',
      'availability.offline': 'Offline',
      'channelStatus.active': 'Active',
      'channelStatus.paused': 'Paused',
      'broadcastStatus.draft': 'Draft',
      'broadcastStatus.scheduled': 'Scheduled',
      'broadcastStatus.sending': 'Sending',
      'broadcastStatus.sent': 'Sent',
      'broadcastStatus.failed': 'Failed',
      'broadcastStatus.cancelled': 'Cancelled',
      'trigger.message.received': 'Message received',
      'trigger.conversation.created': 'Conversation created',
      'trigger.conversation.assigned': 'Conversation assigned',
      'action.assign': 'Assign agent',
      'action.tag': 'Add tag',
      'action.priority': 'Set priority',
      'action.status': 'Set status',
      'action.reply': 'Auto reply',
      'action.snooze': 'Snooze',
      'role.admin': 'Admin',
      'role.agent': 'Agent',
      'day.1': 'Mon',
      'day.2': 'Tue',
      'day.3': 'Wed',
      'day.4': 'Thu',
      'day.5': 'Fri',
      'day.6': 'Sat',
      'day.7': 'Sun',
      'time.justNow': 'Just now',
      'time.minsAgo': '{n}m ago',
      'time.hoursAgo': '{n}h ago',
      'time.daysAgo': '{n}d ago',
      'time.minutesShort': '{n}m',
      'time.hoursShort': '{n}h',
      'time.daysShort': '{n}d',
      'time.noValue': '—',
      'sla.breachedBy': 'Breached {d}',
      'sla.dueIn': 'Due in {d}',
      'sla.responded': 'First response sent',
      'sla.noInbound': 'No customer message',
      'inbox.title': 'Inbox',
      'inbox.subtitle': 'Every customer conversation, every channel.',
      'inbox.count': '{n} conversations',
      'inbox.emptyTitle': 'Your inbox is empty',
      'inbox.emptyBody': 'Connect a channel over the HTTP bridge and new messages will land here.',
      'inbox.noResults': 'No conversations match',
      'inbox.search': 'Search conversations',
      'inbox.channel': 'Channel',
      'inbox.assignee': 'Assignee',
      'inbox.allChannels': 'All channels',
      'inbox.allAgents': 'All agents',
      'inbox.unassigned': 'Unassigned',
      'inbox.mine': 'Mine',
      'inbox.unread': 'Unread',
      'inbox.noSubject': 'Untitled conversation',
      'inbox.sla': 'SLA',
      'inbox.demoHint': 'Clear the demo data in Settings',
      'conversation.context': 'Customer details',
      'conversation.details': 'Details',
      'conversation.customerDetails': 'Customer details',
      'conversation.detailsToggle': 'Open or close customer details',
      'translate.short': 'Translate',
      'translate.label': 'Translated',
      'translate.toggle': 'Show or hide automatic translation',
      'translate.unavailable': 'Translation unavailable',
      'ai.suggest': 'AI suggest',
      'ai.title': 'AI suggested replies',
      'ai.regenerate': 'Regenerate',
      'ai.empty': 'The model returned no usable suggestions',
      'conversation.contact': 'Contact',
      'conversation.details': 'Conversation details',
      'conversation.tags': 'Tags',
      'conversation.addTag': 'Add tag',
      'conversation.tagPlaceholder': 'Press Enter',
      'conversation.assignee': 'Assignee',
      'conversation.priority': 'Priority',
      'conversation.status': 'Status',
      'conversation.created': 'Created',
      'conversation.firstResponse': 'First response',
      'conversation.lastInbound': 'Last inbound',
      'conversation.externalId': 'External conversation ID',
      'conversation.resolve': 'Resolve',
      'conversation.reopen': 'Reopen',
      'conversation.snooze': 'Snooze',
      'conversation.snooze1h': '1 hour',
      'conversation.snooze4h': '4 hours',
      'conversation.snoozeTomorrow': 'Tomorrow',
      'conversation.viewContact': 'View contact',
      'conversation.notes': 'Internal notes',
      'conversation.addNotePlaceholder': 'Write a note only your team can see…',
      'conversation.activity': 'Recent activity',
      'conversation.noActivity': 'No activity yet',
      'conversation.noMessages': 'No messages yet',
      'conversation.you': 'You',
      'conversation.unknownContact': 'Unknown contact',
      'conversation.noChannel': 'Channel deleted',
      'conversation.messageCount': '{n} messages',
      'conversation.openInContacts': 'Open in contacts',
      'composer.reply': 'Reply',
      'composer.note': 'Internal note',
      'composer.placeholderReply': 'Write a reply…',
      'composer.placeholderNote': 'Write an internal note…',
      'composer.send': 'Send',
      'composer.saveNote': 'Save note',
      'composer.template': 'Insert template',
      'composer.attach': 'Attach',
      'composer.hint': 'Enter to send · Shift+Enter for a new line',
      'composer.noteHint': 'Visible to your team only; never sent to the customer',
      'composer.noTemplates': 'No templates available',
      'message.retry': 'Retry',
      'message.failed': 'Delivery failed: {error}',
      'message.local': 'Local note',
      'message.internalNote': 'Internal note',
      'message.attachments': '{n} attachments',
      'message.noText': '(no text)',
      'message.file': 'Attachment',
      'contacts.title': 'Contacts',
      'contacts.subtitle': 'Recognize one customer across channels and keep the full context.',
      'contacts.new': 'New contact',
      'contacts.search': 'Search name, email, tags…',
      'contacts.emptyTitle': 'No contacts yet',
      'contacts.emptyBody': 'Contacts appear here after the first bridge message or when you add one.',
      'contacts.noResults': 'No contacts match',
      'contacts.count': '{n} contacts',
      'contacts.name': 'Name',
      'contacts.handle': 'Handle',
      'contacts.email': 'Email',
      'contacts.phone': 'Phone',
      'contacts.company': 'Company',
      'contacts.tags': 'Tags',
      'contacts.channels': 'Channel identities',
      'contacts.conversations': 'Conversations',
      'contacts.lastSeen': 'Last seen',
      'contacts.created': 'Created',
      'contacts.notes': 'Notes',
      'contacts.addNote': 'Add note',
      'contacts.save': 'Save contact',
      'contacts.delete': 'Delete contact',
      'contacts.deleteConfirm': 'Delete contact “{name}”? This cannot be undone.',
      'contacts.detailTitle': 'Contact details',
      'contacts.editTitle': 'Edit contact',
      'contacts.newTitle': 'New contact',
      'contacts.noNotes': 'No notes yet',
      'contacts.noChannels': 'No channel identities',
      'contacts.identities': 'Identities',
      'contacts.noCompany': 'No company',
      'contacts.noEmail': 'No email',
      'contacts.noPhone': 'No phone',
      'contacts.noHandle': 'No handle',
      'contacts.tagPlaceholder': 'Tag',
      'contacts.addTag': 'Add tag',
      'contacts.attributes': 'Custom attributes',
      'contacts.openConversation': 'Open latest conversation',
      'contacts.timeline': 'Conversations',
      'channels.title': 'Channels',
      'channels.subtitle': 'Official APIs, personal QR bridges, and custom HTTP endpoints share one inbox.',
      'channels.new': 'New channel',
      'channels.emptyTitle': 'No channels yet',
      'channels.emptyBody': 'Create an HTTP bridge channel to forward any IM into DSH.',
      'channels.count': '{n} channels',
      'channels.active': 'Active',
      'channels.paused': 'Paused',
      'channels.inbound': 'Inbound',
      'channels.outbound': 'Outbound',
      'channels.lastInbound': 'Last inbound',
      'channels.lastOutbound': 'Last outbound',
      'channels.lastError': 'Last error',
      'channels.webhook': 'Inbound webhook',
      'channels.webhookHint': 'POST channel events to this URL; authenticate with the token or an HMAC signature.',
      'channels.copyWebhook': 'Copy URL and token',
      'channels.copySecret': 'Copy token',
      'channels.copied': 'Copied',
      'channels.revealSecret': 'Reveal token',
      'channels.hideSecret': 'Hide token',
      'channels.rotateSecret': 'Rotate token',
      'channels.rotateConfirm': 'Rotating the token invalidates the old one immediately. Continue?',
      'channels.test': 'Test bridge',
      'channels.testing': 'Testing…',
      'channels.testOk': 'Bridge connection succeeded',
      'channels.pause': 'Pause',
      'channels.resume': 'Resume',
      'channels.delete': 'Delete channel',
      'channels.deleteConfirm': 'Delete channel “{name}”? Only channels without conversations can be deleted.',
      'channels.editTitle': 'Edit channel',
      'channels.newTitle': 'New HTTP bridge channel',
      'channels.name': 'Channel name',
      'channels.namePlaceholder': 'For example: Website live chat',
      'channels.description': 'Description',
      'channels.descriptionPlaceholder': 'Where does this channel come from?',
      'channels.outboundUrl': 'Outbound URL',
      'channels.outboundHint': 'Optional. DSH POSTs replies here; leave empty to receive only.',
      'channels.status': 'Status',
      'channels.secret': 'Bridge token',
      'channels.secretHint': 'Send it as ?token=, x-im-omni-token, or Authorization: Bearer.',
      'channels.secretOnce': 'Save it now: the token is shown only at this moment.',
      'channels.protocol': 'Bridge protocol',
      'channels.protocolInbound': 'Inbound JSON',
      'channels.protocolOutbound': 'Outbound JSON',
      'channels.inboundDoc': 'Inbound: POST /api/im-omni.webhook/<channelId> with externalConversationId, contact, message.text / attachments, and externalMessageId.',
      'channels.outboundDoc': 'Outbound: DSH POSTs to the configured outboundUrl with x-im-omni-signature: sha256=<hmac>, event message.created or ping.',
      'channels.noOutbound': 'No outbound URL; this channel can receive only.',
      'channels.demo': 'Demo transport',
      'channels.noSecret': 'No token generated',
      'channels.channelType': 'Type',
      'channels.add': 'Add channel',
      'channels.welcomeTitle': 'No channels yet',
      'channels.welcomeBody': 'Pick a platform, then sign in with credentials or a QR code. Customer messages land in the inbox, where replies, translation and AI suggestions live in the same thread.',
      'channels.welcomeStep1': 'Connect a channel',
      'channels.welcomeStep1Body': 'Pick a platform, enter credentials, or scan a QR.',
      'channels.welcomeStep2': 'Verify inbound',
      'channels.welcomeStep2Body': 'Send a customer test message and confirm it lands in the inbox.',
      'channels.welcomeStep3': 'Start receiving',
      'channels.welcomeStep3Body': 'Configure translation, AI suggestions, and reception rules.',
      'channels.addTitle': 'Choose a channel platform',
      'channels.addSubtitle': 'Connect official APIs directly, or bridge platforms without an open protocol over QR or HTTP.',
      'channels.choosePlatform': 'Pick a platform, then enter credentials. You can change them later.',
      'channels.summaryActive': 'Active',
      'channels.summaryPlatforms': 'Platforms',
      'channels.summaryConnected': 'Connected',
      'channels.summaryErrors': 'Needs attention',
      'channels.health.ready': 'Ready to verify',
      'channels.health.connected': 'Connected',
      'channels.health.error': 'Error',
      'channels.health.unconfigured': 'Not configured',
      'channels.official': 'Official API',
      'channels.unofficial': 'Unofficial bridge',
      'channels.transport.webhook': 'Webhook',
      'channels.transport.polling': 'Long polling',
      'channels.transport.gateway': 'Gateway',
      'channels.transport.bridge': 'QR bridge',
      'channels.setup': 'Setup',
      'channels.setupTitle': 'Channel setup',
      'channels.editConfig': 'Edit configuration',
      'channels.testConnection': 'Test connection',
      'channels.qrLogin': 'QR login',
      'channels.qrTitle': 'QR login',
      'channels.qrSubtitle': 'The DSH Host or an external bridge renders the QR. DSH never stores personal-account credentials.',
      'channels.qrRefresh': 'Refresh QR',
      'channels.qrWaiting': 'Waiting for scan',
      'channels.qrScanning': 'Scanned; confirm on your phone',
      'channels.qrConnected': 'Logged in',
      'channels.qrDisconnected': 'Disconnected',
      'channels.qrStarting': 'Starting session',
      'channels.qrError': 'Could not load QR',
      'channels.qrHint': 'Open the app on your phone, go to Linked devices or Scan, and scan the code above.',
      'channels.qrAccount': 'Account',
      'channels.qrMissing': 'No QR yet. Confirm the bridge URL and token are saved.',
      'channels.callback': 'Callback URL',
      'channels.callbackHint': 'Paste this URL into the platform console; see the steps below for each verification method.',
      'channels.webhookUrl': 'Webhook URL',
      'channels.copyUrl': 'Copy URL',
      'channels.credentials': 'Credentials',
      'channels.showSecrets': 'Reveal secret values',
      'channels.hideSecrets': 'Hide secret values',
      'channels.secretSet': 'Configured',
      'channels.leaveBlank': 'Leave blank to keep the saved value',
      'channels.configTitle': 'Channel configuration',
      'channels.optional': 'Optional',
      'channels.required': 'Required',
      'channels.gatewayNote': 'This platform uses a Host-side persistent connection and needs no public callback.',
      'channels.pollingNote': 'Long polling needs no public URL. Webhook mode requires public HTTPS.',
      'channels.inboundOnly': 'Inbound only',
      'channels.platformCount': '{n} platforms',
      'channels.openDocs': 'Platform docs',
      'channels.connectedAs': 'Account: {name}',
      'channels.testFailed': 'Connection test failed',
      'channels.setupNote': 'Credentials live in the Host state file (0600); browser snapshots contain masks only. Revealing returns plaintext once, to the owner.',
      'channels.fieldMissing': 'Enter {field}',
      'channels.atLeastOne': 'Fill at least one of these',
      'channels.atLeastOneShort': 'one required',
      'channels.autoGenerated': 'auto-generated',
      'channels.autoGeneratedHint': 'DSH generates a secure random value when left empty',
      'channels.qrUnreachable': 'Cannot reach the bridge: check the Bridge URL, that the bridge process is running, and the token.',
      'channels.embeddedNote': 'Built-in QR runs Baileys inside the DSH Host; no webhook or public URL is needed.',
      'channels.saveConfig': 'Save configuration',
      'channels.platform': 'Platform',
      'channels.addPlatform': 'Add {name}',
      'channels.configuredAt': 'Last checked',
      'channels.noCallback': 'The Host connects outbound for this channel; no callback is needed.',
      'channels.rotateBridge': 'Rotate bridge token',
      'channels.rotateBridgeConfirm': 'The bridge must switch to the new token immediately or inbound events and QR status will fail. Continue?',
      'channels.internalToken': 'Internal secret',
      'channels.copyToken': 'Copy token',
      'channels.secretTitle': 'Credentials and endpoint',
      'channels.secretSubtitle': 'Visible only to the signed-in owner.',
      'channels.newConfig': 'New {name}',
      'channels.nameHint': 'Shown in the unified inbox to identify this source.',
      'channels.display': 'Show',
      'channels.testSuccess': 'Connection succeeded',
      'channels.testDetail': 'Connection succeeded: {detail}',
      'templates.title': 'Templates',
      'templates.subtitle': 'Save frequent replies, substitute variables, and scope them to channels.',
      'templates.new': 'New template',
      'templates.emptyTitle': 'No templates yet',
      'templates.emptyBody': 'Create a template and insert it from the composer in one click.',
      'templates.count': '{n} templates',
      'templates.name': 'Template name',
      'templates.shortcut': 'Shortcut',
      'templates.body': 'Template body',
      'templates.channels': 'Channels',
      'templates.allChannels': 'All channels',
      'templates.locale': 'Language',
      'templates.usage': 'Used {n} times',
      'templates.edit': 'Edit template',
      'templates.delete': 'Delete template',
      'templates.deleteConfirm': 'Delete template “{name}”?',
      'templates.editTitle': 'Edit template',
      'templates.newTitle': 'New template',
      'templates.namePlaceholder': 'For example: Refund received',
      'templates.shortcutPlaceholder': '/refund',
      'templates.bodyPlaceholder': 'Write the template…',
      'templates.bodyHint': 'Available variables: {{contact.name}}, {{workspace.name}}, {{conversation.id}}, {{agent.name}}.',
      'templates.preview': 'Preview',
      'templates.previewHint': 'Previewed with the first matching contact context.',
      'templates.search': 'Search templates',
      'templates.insert': 'Insert',
      'templates.scope': 'Channel scope',
      'broadcasts.title': 'Broadcasts',
      'broadcasts.subtitle': 'Target contacts by tag, send through a channel, and track delivery.',
      'broadcasts.new': 'New broadcast',
      'broadcasts.emptyTitle': 'No broadcasts yet',
      'broadcasts.emptyBody': 'Create a draft, choose a channel and audience, then send or schedule it.',
      'broadcasts.count': '{n} broadcasts',
      'broadcasts.name': 'Broadcast name',
      'broadcasts.channel': 'Channel',
      'broadcasts.audience': 'Audience tag',
      'broadcasts.audienceHint': 'Leave empty for every contact on this channel.',
      'broadcasts.audienceAll': 'All contacts',
      'broadcasts.tagPlaceholder': 'For example: vip',
      'broadcasts.body': 'Message body',
      'broadcasts.schedule': 'Schedule',
      'broadcasts.scheduledAt': 'Scheduled at',
      'broadcasts.status': 'Status',
      'broadcasts.targeted': 'Targeted',
      'broadcasts.sent': 'Sent',
      'broadcasts.failed': 'Failed',
      'broadcasts.created': 'Created',
      'broadcasts.sentAt': 'Sent at',
      'broadcasts.sendNow': 'Send now',
      'broadcasts.send': 'Send',
      'broadcasts.scheduleAction': 'Schedule',
      'broadcasts.cancel': 'Cancel',
      'broadcasts.delete': 'Delete broadcast',
      'broadcasts.deleteConfirm': 'Delete broadcast “{name}”?',
      'broadcasts.sendConfirm': 'Send “{name}” to {n} matching channel conversations?',
      'broadcasts.edit': 'Edit',
      'broadcasts.editTitle': 'Edit broadcast',
      'broadcasts.createTitle': 'New broadcast',
      'broadcasts.bodyPlaceholder': 'Write the broadcast message…',
      'broadcasts.namePlaceholder': 'For example: October product update',
      'broadcasts.noChannels': 'No usable channels',
      'broadcasts.noChannelsBody': 'Create and activate a channel under Channels first.',
      'broadcasts.stats': 'Delivery result',
      'broadcasts.progress': 'Sent {sent} / {total}',
      'broadcasts.draftHelp': 'A draft is not sent. Save it, then schedule or send it.',
      'broadcasts.scheduledHelp': 'The Host sends it when due; keep DSH running.',
      'automation.title': 'Automation',
      'automation.subtitle': 'Route, tag, prioritize, or reply automatically when conditions match.',
      'automation.new': 'New rule',
      'automation.emptyTitle': 'No automation rules',
      'automation.emptyBody': 'Create a rule to remove repetitive routing and replies.',
      'automation.count': '{n} rules',
      'automation.name': 'Rule name',
      'automation.trigger': 'Trigger',
      'automation.keyword': 'Keyword',
      'automation.keywordPlaceholder': 'Message contains…',
      'automation.contactTag': 'Contact tag',
      'automation.contactTagPlaceholder': 'For example: vip',
      'automation.priority': 'Current priority',
      'automation.conditions': 'Conditions',
      'automation.actions': 'Actions',
      'automation.actionType': 'Action',
      'automation.actionValue': 'Value',
      'automation.addAction': 'Add action',
      'automation.removeAction': 'Remove action',
      'automation.enabled': 'Enabled',
      'automation.lastRun': 'Last run',
      'automation.runs': 'Ran {n} times',
      'automation.edit': 'Edit rule',
      'automation.delete': 'Delete rule',
      'automation.deleteConfirm': 'Delete automation “{name}”?',
      'automation.editTitle': 'Edit automation',
      'automation.createTitle': 'New automation',
      'automation.namePlaceholder': 'For example: Route VIP contacts',
      'automation.triggerHint': 'Leave a condition empty to match everything.',
      'automation.valuePlaceholder': 'Enter a value',
      'automation.replyPlaceholder': 'Auto-reply body…',
      'automation.minutes': 'minutes',
      'automation.assignAuto': 'Auto-pick an online agent',
      'automation.selectAgent': 'Select agent',
      'automation.selectPriority': 'Select priority',
      'automation.selectStatus': 'Select status',
      'automation.snoozeMinutes': 'Snooze duration',
      'automation.noActions': 'Add at least one action',
      'automation.save': 'Save rule',
      'analytics.title': 'Analytics',
      'analytics.subtitle': 'Read service quality from conversations, messages, channels, and agent load.',
      'analytics.empty': 'Not enough data yet',
      'analytics.open': 'Open conversations',
      'analytics.unread': 'Unread messages',
      'analytics.awaiting': 'Awaiting reply',
      'analytics.breached': 'SLA breached',
      'analytics.resolvedToday': 'Resolved today',
      'analytics.messages7d': 'Messages, 7 days',
      'analytics.avgFirstResponse': 'Avg first response',
      'analytics.avgResolution': 'Avg resolution',
      'analytics.contacts': 'Contacts',
      'analytics.channels': 'Channels',
      'analytics.activeChannels': 'Active channels',
      'analytics.volume': 'Message volume, 14 days',
      'analytics.volumeHint': 'Aggregated by UTC date across inbound and outbound messages.',
      'analytics.byChannel': 'Channel mix',
      'analytics.byAgent': 'Agent load',
      'analytics.agentOpen': 'Open',
      'analytics.agentResolvedToday': 'Resolved today',
      'analytics.agentTotal': 'Total',
      'analytics.broadcasts': 'Broadcast performance',
      'analytics.delivered': 'Delivered',
      'analytics.failed': 'Failed',
      'analytics.scheduled': 'Scheduled',
      'analytics.drafted': 'Drafts',
      'analytics.noData': 'No data yet',
      'analytics.inbound': 'Inbound',
      'analytics.outbound': 'Outbound',
      'analytics.totalMessages': 'Total messages',
      'analytics.performance': 'Service performance',
      'analytics.responseTime': 'First response',
      'analytics.resolutionTime': 'Resolution',
      'analytics.load': 'Load',
      'settings.title': 'Settings',
      'settings.subtitle': 'Workspace preferences, team, SLA, and data management.',
      'settings.workspace': 'Workspace',
      'settings.intelligence': 'Translation and AI',
      'settings.translation': 'Auto-translate',
      'settings.translationOn': 'Auto-translate customer messages',
      'settings.translationHint': 'Translate incoming messages into the target language when a conversation opens; the original stays visible.',
      'settings.translationTarget': 'Target language',
      'settings.translationTargetHint': 'BCP-47 or a common language code such as zh-CN, en, ja, es, or ar.',
      'settings.ai': 'AI reply suggestions',
      'settings.aiOn': 'Show AI suggestions above the composer',
      'settings.aiHint': 'Uses the current default Harness model to draft three replies from conversation context; never sends automatically.',
      'settings.bot': 'Autonomous reception bot',
      'settings.botHint': 'When enabled, new customer messages are answered by the default Harness model. The bot hands off on keywords, max turns, or an explicit request for a human.',
      'settings.botEnabled': 'Bot reception',
      'settings.botEnabledOn': 'Enable autonomous replies',
      'settings.botName': 'Bot name',
      'settings.botMaxTurns': 'Max auto turns',
      'settings.botMaxTurnsHint': 'Hand off after this many bot replies to prevent loops.',
      'settings.botHandoff': 'Handoff keywords',
      'settings.botHandoffHint': 'Comma-separated; any match hands the conversation to a human.',
      'settings.botGreeting': 'Greeting (optional)',
      'settings.botGreetingPlaceholder': 'For example: Hi, I am the AI assistant. How can I help?',
      'settings.botInstructions': 'Reception policy',
      'settings.botInstructionsHint': 'Injected into the model as policy; never put secrets here.',
      'settings.botInstructionsPlaceholder': 'For example: only answer shipping and after-sales questions; hand refund approvals to a human; do not promise dates.',
      'bot.name': 'AI reception',
      'bot.takeover': 'Take over',
      'bot.resume': 'Resume AI',
      'bot.toggle': 'Toggle AI reception / human takeover',
      'bot.paused': 'Human takeover enabled',
      'bot.resumed': 'AI reception resumed',
      'settings.workspaceName': 'Workspace name',
      'settings.timezone': 'Time zone',
      'settings.sla': 'Default SLA',
      'settings.slaHint': 'Target time from the first customer message to the first reply.',
      'settings.autoAssign': 'Auto-assign',
      'settings.autoAssignHint': 'Route new conversations to the online agent with the lightest load.',
      'settings.businessHours': 'Business hours',
      'settings.start': 'Start',
      'settings.end': 'End',
      'settings.days': 'Working days',
      'settings.save': 'Save settings',
      'phone.title': 'Pair a phone',
      'phone.hint': 'The Android app pairs with this Host once, then works remotely. Codes last 5 minutes and are single-use.',
      'phone.entry': 'Entry',
      'phone.generate': 'Create code',
      'phone.generating': 'Creating…',
      'phone.expires': 'Expires in',
      'phone.once': 'Scan it or send the link to the phone; it is consumed on first use.',
      'phone.devices': 'Paired devices',
      'phone.manage': 'Manage devices in DSH settings → Phone remote.',
      'phone.missing': 'No phone-remote entry found. Install and enable the phone-remote plugin first.',
      'phone.failed': 'Could not create a code',
      'upgrade.title': 'Plugin update',
      'upgrade.current': 'Current',
      'upgrade.check': 'Check',
      'upgrade.checking': 'Checking…',
      'upgrade.pull': 'Update now',
      'upgrade.pulling': 'Updating…',
      'upgrade.upToDate': 'Up to date',
      'upgrade.behind': 'commits to pull',
      'upgrade.ahead': 'local commits not pushed',
      'upgrade.dirty': 'Uncommitted changes block the update',
      'upgrade.notRepo': 'Installed from a package, not a Git checkout',
      'upgrade.unknown': 'Not checked yet',
      'upgrade.restart': 'Updated; reload the plugin (or restart DSH) to apply',
      'upgrade.failed': 'Update failed',
      'upgrade.branch': 'branch',
      'settings.saved': 'Settings saved',
      'settings.team': 'Team',
      'settings.teamHint': 'Agents can be assigned conversations and participate in routing.',
      'settings.addMember': 'Add member',
      'settings.memberName': 'Member name',
      'settings.memberEmail': 'Email',
      'settings.role': 'Role',
      'settings.availability': 'Availability',
      'settings.remove': 'Remove',
      'settings.removeConfirm': 'Remove member “{name}”? Reassign their conversations first.',
      'settings.currentAgent': 'Current agent',
      'settings.danger': 'Data management',
      'settings.dangerHint': 'Data lives in a Host directory for the current DSH profile.',
      'settings.resetDemo': 'Reset demo data',
      'settings.exitDemo': 'Exit demo mode',
      'settings.exitDemoConfirm': 'Remove the built-in demo channels, contacts, conversations, and sample rules while keeping records you created. Continue?',
      'toast.demoExited': 'Demo mode disabled',
      'settings.resetConfirm': 'Replace the workspace with the original demo data? Existing conversations, contacts, channels, and templates will be replaced.',
      'settings.clearData': 'Clear all data',
      'settings.clearConfirm': 'Clear every conversation, contact, channel, template, broadcast, and automation? This cannot be undone.',
      'settings.dataLocation': 'Data file',
      'settings.plugin': 'Plugin',
      'settings.version': 'Version',
      'settings.bridge': 'Bridge protocol',
      'settings.roleAdmin': 'Admin',
      'settings.roleAgent': 'Agent',
      'settings.storage': 'Storage',
      'settings.storageHint': 'An atomically written JSON document on the Host. The browser stores no business data.',
      'settings.weekdays': 'Working days',
      'settings.noTeam': 'No team members yet',
      'settings.memberAdded': 'Member added',
      'settings.memberDeleted': 'Member removed',
      'settings.saveSettings': 'Save settings',
      'toast.messageQueued': 'Message queued for delivery',
      'toast.noteAdded': 'Internal note saved',
      'toast.conversationUpdated': 'Conversation updated',
      'toast.contactSaved': 'Contact saved',
      'toast.contactDeleted': 'Contact deleted',
      'toast.channelCreated': 'Channel created',
      'toast.channelUpdated': 'Channel updated',
      'toast.channelDeleted': 'Channel deleted',
      'toast.secretRotated': 'Bridge token rotated',
      'toast.templateSaved': 'Template saved',
      'toast.templateDeleted': 'Template deleted',
      'toast.automationSaved': 'Automation saved',
      'toast.automationDeleted': 'Automation deleted',
      'toast.broadcastCreated': 'Broadcast draft created',
      'toast.broadcastUpdated': 'Broadcast updated',
      'toast.broadcastSent': 'Broadcast sent',
      'toast.broadcastScheduled': 'Broadcast scheduled',
      'toast.broadcastCancelled': 'Broadcast cancelled',
      'toast.broadcastDeleted': 'Broadcast deleted',
      'toast.settingsSaved': 'Settings saved',
      'toast.agentAdded': 'Member added',
      'toast.agentUpdated': 'Member updated',
      'toast.agentDeleted': 'Member removed',
      'toast.demoReset': 'Demo data reset',
      'toast.dataCleared': 'All data cleared',
      'toast.copied': 'Copied to clipboard',
      'toast.testPassed': 'Bridge test succeeded',
      'error.generic': 'The action failed. Try again.',
      'error.unauthorized': 'Bridge authentication failed',
      'error.channel-paused': 'This channel is paused',
      'error.channel-in-use': 'This channel still has conversations',
      'error.contact-in-use': 'This contact still has conversations',
      'error.agent-in-use': 'This agent still has conversations',
      'error.broadcast-sent': 'This broadcast was already sent',
      'error.invalid-url': 'The outbound URL must be http(s)',
      'error.invalid-name': 'A name is required',
      'error.empty-body': 'A body is required',
      'error.empty-message': 'A message is required',
      'error.bridge-test-failed': 'The bridge test failed',
      'error.rate-limited': 'Too many requests. Try again later.',
      'error.channel-test-failed': 'The channel connection test failed',
      'error.missing-config': 'Required channel configuration is missing',
      'error.invalid-config': 'The channel configuration is invalid',
      'error.unknown-channel-type': 'Unknown channel platform',
      'error.channel-type-immutable': 'The platform cannot be changed; create a new channel instead',
      'error.not-qr-channel': 'This channel does not support QR login',
      'error.channel-not-found': 'Channel not found',
    }

    /**
     * Translate and substitute `{name}` variables even when the locale service
     * returns a plain string.
     * @param {(key: string, vars?: Record<string, unknown>) => string} t - translator.
     * @param {string} key - locale key.
     * @param {Record<string, unknown>} [vars] - substitutions.
     * @returns {string} localized text.
     */
    function tr(t, key, vars = {}) {
      const value = t(key, vars)
      return String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] === undefined ? `{${name}}` : String(vars[name]))
    }

    /** Pick the current UI language from a localized `{zh,en}` value. */
    const UI_LANG = String(LANG).toLowerCase().startsWith('zh') ? 'zh' : 'en'

    /**
     * Resolve a localized catalog value.
     * @param {{zh?:string,en?:string}|string|undefined} value - value.
     * @returns {string} display text.
     */
    function localized(value) {
      if (typeof value === 'string') return value
      if (value === null || value === undefined) return ''
      return value[UI_LANG] ?? value.en ?? value.zh ?? ''
    }

    /**
     * Find a platform definition from the snapshot catalog.
     * @param {Record<string, any>} snapshot - workspace snapshot.
     * @param {string} type - channel type.
     * @returns {Record<string, any>} platform.
     */
    function platformOf(snapshot, type) {
      const catalog = Array.isArray(snapshot?.channelPlatforms) ? snapshot.channelPlatforms : []
      return catalog.find((item) => item.id === type)
        ?? catalog.find((item) => item.id === 'webhook')
        ?? { id: type, label: { zh: type, en: type }, caption: { zh: '', en: '' }, badge: 'IM', hue: 210, transport: 'webhook', official: false, capabilities: [], fields: [], setup: { zh: [], en: [] } }
    }

    /**
     * Platform identity tile.
     * @param {{platform: Record<string, any>, size?: number}} props - platform and edge.
     * @returns {import('react').ReactElement} badge.
     */
    function ChannelBadge({ platform, size = 36 }) {
      const hue = Number(platform?.hue) || 210
      return h('span', {
        className: 'imoPlatformBadge',
        style: {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          fontSize: Math.max(9, Math.round(size * 0.29)),
          background: `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${(hue + 24) % 360} 55% 34%))`,
        },
        title: localized(platform?.label),
        'aria-hidden': true,
      }, String(platform?.badge ?? 'IM').slice(0, 4))
    }

    /**
     * Health pill for one channel.
     * @param {{channel: Record<string, any>, t: Function}} props - channel and translator.
     * @returns {import('react').ReactElement} pill.
     */
    function ChannelHealthPill({ channel, t }) {
      const health = ['ready', 'connected', 'error', 'unconfigured'].includes(channel.health) ? channel.health : 'ready'
      const tone = health === 'connected' ? 'success' : health === 'error' ? 'bad' : health === 'unconfigured' ? 'warn' : ''
      return h(Pill, { tone }, t(`channels.health.${health}`))
    }

    /** Minimal inline icon set, rendered with the host's text color. */
    const ICON_PATHS = {
      inbox: ['M4 4h16v16H4z', 'M4 13h4l2 3h4l2-3h4'],
      users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
      plug: ['M9 7V3', 'M15 7V3', 'M7 7h10v4a5 5 0 0 1-10 0z', 'M12 16v5'],
      template: ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
      megaphone: ['M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z', 'M14 8a4 4 0 0 1 0 8', 'M17 5a8 8 0 0 1 0 14'],
      bolt: ['M13 2 4 14h6l-1 8 9-12h-6z'],
      chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
      settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-3v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-3h.09A1.7 1.7 0 0 0 4.6 9.95a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 8.26 6.3a1.7 1.7 0 0 0 1-1.55V4h3v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1H21v3h-.09a1.7 1.7 0 0 0-1.55 1z'],
      search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
      refresh: ['M20 11a8 8 0 0 0-14.9-3M4 5v4h4', 'M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4'],
      send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'],
      note: ['M4 4h12l4 4v12H4z', 'M8 10h8', 'M8 14h6'],
      check: ['M20 6 9 17l-5-5'],
      checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
      clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
      tag: ['M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
      x: ['M18 6 6 18', 'M6 6l12 12'],
      plus: ['M12 5v14', 'M5 12h14'],
      copy: ['M9 9h13v13H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
      eye: ['M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
      eyeOff: ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19', 'M1 1l22 22', 'M14.12 14.12a3 3 0 1 1-4.24-4.24'],
      rotate: ['M21 2v6h-6', 'M3 12a9 9 0 0 1 15-6.7L21 8', 'M3 22v-6h6', 'M21 12a9 9 0 0 1-15 6.7L3 16'],
      play: ['M6 4l14 8-14 8z'],
      pause: ['M8 4h3v16H8z', 'M13 4h3v16h-3z'],
      trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
      edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
      chevronDown: ['M6 9l6 6 6-6'],
      chevronRight: ['M9 18l6-6-6-6'],
      arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
      alert: ['M12 9v4', 'M12 17h.01', 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'],
      sparkles: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z'],
      server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01'],
      file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
      external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
      filter: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
      user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
      mail: ['M2 4h20v16H2z', 'M22 6l-10 7L2 6'],
      paperclip: ['M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
      phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
      building: ['M3 21h18', 'M6 21V3h12v18', 'M9 7h2', 'M13 7h2', 'M9 11h2', 'M13 11h2', 'M9 15h2', 'M13 15h2'],
      globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z'],
      lock: ['M5 11h14v11H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
      key: ['M21 2l-2 2', 'M15.5 8.5 19 5', 'M10.5 13.5 14 10', 'M7 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z', 'M7 17l-4 4'],
      calendar: ['M4 5h16v16H4z', 'M16 3v4', 'M8 3v4', 'M4 11h16'],
      activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
      dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
      bridge: ['M3 12h18', 'M6 8v8', 'M18 8v8', 'M3 8h18', 'M3 16h18'],
      qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14h1v1', 'M14 20h7', 'M20 18v3'],
      inboxCheck: ['M4 4h16v16H4z', 'M4 13h4l2 3h4l2-3h4', 'M9 8l2 2 4-4'],
    }

    /**
     * Draw one inline icon.
     * @param {{name: string, size?: number}} props - icon name and edge.
     * @returns {import('react').ReactElement} svg.
     */
    function Icon({ name, size = 16 }) {
      const paths = ICON_PATHS[name] ?? ICON_PATHS.dots
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )
    }

    /**
     * Derive initials for an avatar.
     * @param {string} name - display name.
     * @returns {string} one or two characters.
     */
    function initials(name) {
      const value = String(name || '?').trim()
      if (value === '') return '?'
      const words = value.split(/\s+/).filter(Boolean)
      if (words.length === 1) return value.slice(0, 2).toUpperCase()
      return `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase()
    }

    /**
     * Colored initials avatar. Colors are artwork, not theme chrome.
     * @param {{name: string, hue?: number, size?: 'sm'|'lg'|'', className?: string}} props - avatar props.
     * @returns {import('react').ReactElement} avatar.
     */
    function Avatar({ name, hue = 215, size = '', className = '' }) {
      const style = {
        background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 28) % 360} 52% 38%))`,
      }
      return h('span', { className: `imoAvatar ${size === 'lg' ? 'imoAvatarLg' : size === 'sm' ? 'imoAvatarSm' : ''} ${className}`.trim(), style, title: name }, initials(name))
    }

    /**
     * Small status pill.
     * @param {{tone?: string, children: import('react').ReactNode}} props - tone and content.
     * @returns {import('react').ReactElement} pill.
     */
    function Pill({ tone = '', children }) {
      return h('span', { className: `imoPill ${tone}`.trim() }, children)
    }

    /**
     * Format an exact date.
     * @param {string|null|undefined} iso - timestamp.
     * @returns {string} short date or dash.
     */
    function fmtDate(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return new Intl.DateTimeFormat(LANG, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date)
    }

    /**
     * Format date and time.
     * @param {string|null|undefined} iso - timestamp.
     * @returns {string} date-time or dash.
     */
    function fmtDateTime(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return new Intl.DateTimeFormat(LANG, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
    }

    /**
     * Format a clock time.
     * @param {string|null|undefined} iso - timestamp.
     * @returns {string} time.
     */
    function fmtTime(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return new Intl.DateTimeFormat(LANG, { hour: '2-digit', minute: '2-digit' }).format(date)
    }

    /**
     * Relative time suitable for inbox rows.
     * @param {string|null|undefined} iso - timestamp.
     * @param {(key: string, vars?: Record<string, unknown>) => string} t - translator.
     * @returns {string} relative label.
     */
    function fmtRelative(iso, t) {
      if (!iso) return '—'
      const ms = Date.now() - Date.parse(iso)
      if (!Number.isFinite(ms)) return '—'
      if (ms < 60_000) return t('time.justNow')
      if (ms < 3_600_000) return tr(t, 'time.minsAgo', { n: Math.floor(ms / 60_000) })
      if (ms < 86_400_000) return tr(t, 'time.hoursAgo', { n: Math.floor(ms / 3_600_000) })
      if (ms < 7 * 86_400_000) return tr(t, 'time.daysAgo', { n: Math.floor(ms / 86_400_000) })
      return fmtDate(iso)
    }

    /**
     * Compact duration.
     * @param {number} seconds - duration.
     * @param {(key: string, vars?: Record<string, unknown>) => string} t - translator.
     * @returns {string} compact duration.
     */
    function fmtDuration(seconds, t) {
      if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
      if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`
      if (seconds < 3600) return tr(t, 'time.minutesShort', { n: Math.round(seconds / 60) })
      if (seconds < 86_400) return tr(t, 'time.hoursShort', { n: Math.round(seconds / 3600) })
      return tr(t, 'time.daysShort', { n: Math.round(seconds / 86_400) })
    }

    /**
     * Day key used to group messages.
     * @param {string} iso - timestamp.
     * @returns {string} local date key.
     */
    function dayOf(iso) {
      const date = new Date(iso)
      return Number.isNaN(date.getTime()) ? 'unknown' : date.toDateString()
    }

    /**
     * Friendly day heading.
     * @param {string} iso - timestamp.
     * @param {(key: string, vars?: Record<string, unknown>) => string} t - translator.
     * @returns {string} heading.
     */
    function dayLabel(iso, t) {
      const key = dayOf(iso)
      const today = new Date().toDateString()
      const yesterday = new Date(Date.now() - 86_400_000).toDateString()
      if (key === today) return t('common.today')
      if (key === yesterday) return t('common.yesterday')
      return fmtDate(iso)
    }

    /**
     * SLA state for one conversation.
     * @param {Record<string, any>} conversation - conversation.
     * @param {Record<string, any>} workspace - workspace.
     * @param {(key: string, vars?: Record<string, unknown>) => string} t - translator.
     * @returns {{label: string, tone: string, percent: number}} SLA presentation.
     */
    function slaInfo(conversation, workspace, t) {
      if (conversation.status === 'resolved') return { label: t('sla.responded'), tone: 'ok', percent: 100 }
      const firstIn = conversation.messages.find((message) => message.direction === 'in')
      if (firstIn === undefined) return { label: t('sla.noInbound'), tone: 'ok', percent: 0 }
      if (conversation.firstResponseAt !== null && conversation.firstResponseAt !== undefined) {
        return { label: t('sla.responded'), tone: 'ok', percent: 100 }
      }
      const slaMs = Math.max(1, Number(workspace.defaultSlaMinutes) || 30) * 60_000
      const elapsed = Date.now() - Date.parse(firstIn.createdAt)
      const left = slaMs - elapsed
      const percent = Math.max(0, Math.min(100, (elapsed / slaMs) * 100))
      if (left <= 0) return { label: tr(t, 'sla.breachedBy', { d: fmtDuration(-left / 1000, t) }), tone: 'bad', percent: 100 }
      return { label: tr(t, 'sla.dueIn', { d: fmtDuration(left / 1000, t) }), tone: left < 5 * 60_000 ? 'warn' : 'ok', percent }
    }

    /**
     * Only allow http(s) attachment links from external bridges.
     * @param {unknown} value - candidate URL.
     * @returns {string} safe href or '#'.
     */
    function safeHref(value) {
      if (typeof value !== 'string') return '#'
      try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '#'
      } catch {
        return '#'
      }
    }

    /**
     * Copy text through the Clipboard API with a legacy fallback.
     * @param {string} value - text to copy.
     * @returns {Promise<void>} resolution after the copy attempt.
     */
    async function copyText(value) {
      try {
        await navigator.clipboard.writeText(value)
        return
      } catch {
        const area = document.createElement('textarea')
        area.value = value
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
    }

    /**
     * Read the workspace snapshot and expose command execution.
     * @returns {Record<string, any>} state, status, refresh, and command.
     */
    function useWorkspace() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      const [offline, setOffline] = React.useState(false)
      const alive = React.useRef(true)
      const busy = React.useRef(false)

      const applyState = React.useCallback((next) => {
        if (next === null || typeof next !== 'object' || next.meta === undefined) return
        setSnapshot((previous) => {
          if (previous === null) return next
          const oldRevision = Number(previous.meta?.revision) || 0
          const newRevision = Number(next.meta?.revision) || 0
          return newRevision >= oldRevision ? next : previous
        })
      }, [])

      const refresh = React.useCallback(async (quiet = false) => {
        if (busy.current) return
        try {
          const response = await fetch(STATE_PATH, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' })
          const payload = await response.json().catch(() => null)
          if (!response.ok || payload?.ok !== true || payload.state === undefined) {
            throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          }
          if (!alive.current) return
          applyState(payload.state)
          setError(null)
          setOffline(false)
          setLoading(false)
        } catch (reason) {
          if (!alive.current) return
          setOffline(true)
          if (!quiet) {
            setError(reason instanceof Error ? reason.message : String(reason))
            setLoading(false)
          }
        }
      }, [applyState])

      const intelligence = React.useCallback(async (action, payload = {}) => {
        const response = await fetch(INTELLIGENCE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action, payload }),
        })
        const body = await response.json().catch(() => null)
        if (body?.state !== undefined) applyState(body.state)
        if (!response.ok || body?.ok !== true) {
          const failure = new Error(body?.error?.message ?? `HTTP ${response.status}`)
          failure.code = body?.error?.code ?? `http-${response.status}`
          throw failure
        }
        setOffline(false)
        return body.result ?? {}
      }, [applyState])

      const command = React.useCallback(async (action, payload = {}) => {
        busy.current = true
        try {
          const response = await fetch(COMMAND_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action, payload }),
          })
          const body = await response.json().catch(() => null)
          if (body?.state !== undefined) applyState(body.state)
          if (!response.ok || body?.ok !== true) {
            const failure = new Error(body?.error?.message ?? `HTTP ${response.status}`)
            failure.code = body?.error?.code ?? `http-${response.status}`
            throw failure
          }
          setOffline(false)
          return body.result ?? {}
        } finally {
          busy.current = false
        }
      }, [applyState])

      React.useEffect(() => {
        alive.current = true
        void refresh(false)
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') void refresh(true)
        }, 4000)
        const onVisible = () => {
          if (document.visibilityState === 'visible') void refresh(true)
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          alive.current = false
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [refresh])

      return { snapshot, loading, error, offline, refresh, command, intelligence }
    }

    /**
     * Accessible modal with Escape and backdrop dismissal.
     * @param {Record<string, any>} props - title, subtitle, children, footer, onClose, wide.
     * @returns {import('react').ReactElement} modal.
     */
    function Modal({ title, subtitle, children, footer, onClose, wide = false }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      return h(
        'div',
        {
          className: 'imoModalOverlay',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'section',
          { className: `imoModal ${wide ? 'imoModalWide' : ''}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h(
            'header',
            { className: 'imoModalHead' },
            h('div', { style: { flex: 1, minWidth: 0 } }, h('h2', { className: 'imoModalTitle' }, title), subtitle ? h('div', { className: 'imoModalSub' }, subtitle) : null),
            h('button', { type: 'button', className: 'imoIconBtn', onClick: onClose, 'aria-label': 'Close' }, h(Icon, { name: 'x' })),
          ),
          h('div', { className: 'imoModalBody' }, children),
          footer ? h('footer', { className: 'imoModalFoot' }, footer) : null,
        ),
      )
    }

    /**
     * Confirmation dialog used by destructive actions.
     * @param {Record<string, any>} props - request and callbacks.
     * @returns {import('react').ReactElement|null} dialog.
     */
    function ConfirmDialog({ request, onClose }) {
      if (request === null) return null
      return h(
        Modal,
        {
          title: request.title,
          onClose,
          footer: [
            h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, request.cancelLabel),
            h('button', {
              key: 'ok',
              type: 'button',
              className: request.danger === false ? 'imoBtn imoBtnPrimary' : 'imoBtn imoBtnDanger',
              onClick: () => {
                onClose()
                void request.onConfirm()
              },
            }, request.confirmLabel),
          ],
        },
        h('div', { className: 'imoSmall', style: { lineHeight: 1.6 } }, request.body),
      )
    }

    /**
     * Field label wrapper.
     * @param {{label: string, hint?: string, children: import('react').ReactNode, full?: boolean}} props - field.
     * @returns {import('react').ReactElement} field group.
     */
    function Field({ label, hint, children, full = false }) {
      return h('div', { className: `imoFieldGroup ${full ? 'full' : ''}`.trim() },
        h('span', { className: 'imoFieldLabel' }, label),
        children,
        hint ? h('span', { className: 'imoHelp' }, hint) : null,
      )
    }

    /**
     * Boolean switch with an accessible name.
     * @param {{checked: boolean, onChange: (value: boolean) => void, label: string}} props - switch.
     * @returns {import('react').ReactElement} switch.
     */
    function Switch({ checked, onChange, label }) {
      return h('button', {
        type: 'button',
        className: `imoSwitch ${checked ? 'imoSwitchOn' : ''}`.trim(),
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        onClick: () => onChange(!checked),
      })
    }

    /**
     * Empty-state block.
     * @param {{icon?: string, title: string, body?: string, action?: import('react').ReactNode}} props - content.
     * @returns {import('react').ReactElement} empty state.
     */
    function Empty({ icon = 'inbox', title, body, action }) {
      return h('div', { className: 'imoEmpty' },
        h('span', { className: 'imoEmptyIcon' }, h(Icon, { name: icon, size: 19 })),
        h('div', { className: 'imoEmptyTitle' }, title),
        body ? h('div', { className: 'imoEmptyBody' }, body) : null,
        action ?? null,
      )
    }

    /**
     * Localized error text with the Host's message as a fallback.
     * @param {(key: string) => string} t - translator.
     * @param {any} error - failure.
     * @returns {string} user-facing text.
     */
    function errorText(t, error) {
      const code = error?.code
      if (typeof code === 'string' && code !== '') {
        const key = `error.${code}`
        const localized = t(key)
        if (localized !== key) return localized
      }
      return error instanceof Error && error.message !== '' ? error.message : t('error.generic')
    }

    /**
     * Configuration errors carry the exact field/detail; show it instead of a
     * generic localized code so a failed save is actionable.
     * @param {(key:string)=>string} t - translator.
     * @param {any} error - command failure.
     * @returns {string} error text.
     */
    function channelErrorText(t, error) {
      const code = error?.code
      if (['missing-config', 'invalid-config', 'invalid-url', 'channel-test-failed', 'unknown-channel-type', 'channel-type-immutable'].includes(code)) {
        return error instanceof Error && error.message !== '' ? error.message : errorText(t, error)
      }
      return errorText(t, error)
    }

    /**
     * Small channel dot and name.
     * @param {{channel: Record<string, any>|undefined, t: Function}} props - channel and translator.
     * @returns {import('react').ReactElement} badge.
     */
    function ChannelPill({ channel, t }) {
      if (channel === undefined) return h(Pill, { tone: '' }, t('conversation.noChannel'))
      return h(Pill, { tone: channel.status === 'active' ? 'success' : 'warn' }, h(Icon, { name: 'plug', size: 11 }), channel.name)
    }

    /**
     * Application top bar.
     * @param {Record<string, any>} props - snapshot, search, agent, and callbacks.
     * @returns {import('react').ReactElement} top bar.
     */
    function TopBar({ snapshot, t, search, onSearch, onAgent, onRefresh, offline }) {
      const agents = snapshot.agents
      const current = agents.find((agent) => agent.id === snapshot.workspace.currentAgentId)
      return h(
        'div',
        { className: 'imoTop' },
        h('div', { className: 'imoBrand' },
          h('span', { className: 'imoBrandMark' }, h(Icon, { name: 'bridge', size: 17 })),
          h('div', { className: 'imoBrandText' },
            h('span', { className: 'imoBrandTitle' }, t('panel.label')),
            h('span', { className: 'imoBrandSub' }, t('panel.sub')),
          ),
          snapshot.demo ? h('span', { className: 'imoDemo' }, h(Icon, { name: 'sparkles', size: 11 }), t('app.demo')) : null,
        ),
        h('label', { className: 'imoTopSearch' },
          h(Icon, { name: 'search', size: 14 }),
          h('input', {
            value: search,
            onChange: (event) => onSearch(event.target.value),
            placeholder: t('app.searchPlaceholder'),
            'aria-label': t('app.searchPlaceholder'),
            type: 'search',
          }),
        ),
        h('div', { className: 'imoTopActions' },
          agents.length > 0
            ? h('div', { className: 'imoAgent', title: t('app.currentAgent') },
              h('span', { className: `imoAgentDot ${current?.availability ?? 'offline'}` }),
              h('select', {
                className: 'imoSelect',
                value: current?.id ?? '',
                onChange: (event) => onAgent(event.target.value),
                'aria-label': t('app.currentAgent'),
              }, current === undefined ? h('option', { value: '' }, t('app.noAgent')) : null,
                agents.map((agent) => h('option', { key: agent.id, value: agent.id }, `${agent.name} · ${t(`availability.${agent.availability}`)}`)),
              ),
            )
            : null,
          offline ? h('span', { className: 'imoPill warn', title: t('app.offline') }, h(Icon, { name: 'alert', size: 11 }), t('app.offline')) : null,
          h('button', { type: 'button', className: 'imoIconBtn', onClick: onRefresh, title: t('app.refresh'), 'aria-label': t('app.refresh') }, h(Icon, { name: 'refresh' })),
        ),
      )
    }

    /**
     * Main section tabs.
     * @param {Record<string, any>} props - active tab, counts, and callback.
     * @returns {import('react').ReactElement} tabs.
     */
    /**
     * Tabs a role may open. Pure so the rule can be tested without React.
     * @param {string} role - owner/admin/agent/viewer.
     * @param {number} unread - unread badge count.
     * @returns {Array<[string, string, number]>} [id, icon, badge].
     */
    function tabItems(role, unread = 0) {
      const all = [
        ['inbox', 'inbox', unread],
        ['contacts', 'users', 0],
        ['channels', 'plug', 0],
        ['templates', 'template', 0],
        ['broadcasts', 'megaphone', 0],
        ['automation', 'bolt', 0],
        ['analytics', 'chart', 0],
        ['settings', 'settings', 0],
      ]
      if (role === 'owner' || role === 'admin') return all
      return all.filter(([id]) => id !== 'channels' && id !== 'automation' && id !== 'broadcasts')
    }

    function TabBar({ tab, onTab, t, unread, role, name, onSignOut }) {
      const items = tabItems(role, unread)
      return h('nav', { className: 'imoTabs', 'aria-label': t('panel.label') },
        items.map(([id, icon, badge]) => h('button', {
          key: id,
          type: 'button',
          className: `imoTab ${tab === id ? 'imoTabActive' : ''}`.trim(),
          onClick: () => onTab(id),
          'aria-current': tab === id ? 'page' : undefined,
        },
          h(Icon, { name: icon, size: 14 }),
          t(`nav.${id}`),
          badge > 0 ? h('span', { className: 'imoTabBadge' }, badge > 99 ? '99+' : String(badge)) : null,
        )),
        h('span', { className: 'imoTabSpacer' }),
        h('span', { className: 'imoTabRole', title: membershipLabel(role) }, `${name} · ${membershipLabel(role)}`),
        h('button', { type: 'button', className: 'imoTab', onClick: onSignOut }, t('app.signOut') ?? '退出'),
      )
    }

    /**
     * Human label for a membership role.
     * @param {string} role - owner/admin/agent/viewer.
     * @returns {string} label.
     */
    function membershipLabel(role) {
      if (core && typeof core.membershipLabel === 'function') return core.membershipLabel(role)
      if (role === 'owner') return '所有者'
      if (role === 'admin') return '管理员'
      if (role === 'viewer') return '只读'
      return '客服'
    }

    /**
     * One inbox conversation row.
     * @param {Record<string, any>} props - conversation, related records, callbacks.
     * @returns {import('react').ReactElement} row.
     */
    function ConversationRow({ conversation, contact, channel, t, active, onClick }) {
      const last = conversation.messages[conversation.messages.length - 1]
      const preview = last === undefined
        ? t('conversation.noMessages')
        : `${last.direction === 'note' ? `${t('message.internalNote')}: ` : ''}${last.text || t('message.noText')}`
      return h('button', {
        type: 'button',
        className: `imoConvRow ${active ? 'imoConvRowActive' : ''}`.trim(),
        onClick,
        'aria-current': active ? 'true' : undefined,
      },
        h(Avatar, { name: contact?.name ?? t('conversation.unknownContact'), hue: contact?.hue ?? 215 }),
        h('span', { className: 'imoConvMain' },
          h('span', { className: 'imoConvTop' },
            h('span', { className: 'imoConvName' }, contact?.name ?? t('conversation.unknownContact')),
            h('span', { className: 'imoConvTime' }, fmtRelative(conversation.updatedAt, t)),
          ),
          h('span', { className: 'imoConvPreview' }, preview),
          h('span', { className: 'imoConvMeta' },
            h('span', { className: `imoDot ${conversation.status}` }),
            h('span', { className: 'imoTiny imoMuted' }, t(`status.${conversation.status}`)),
            channel ? h('span', { className: 'imoTag' }, channel.name) : null,
            conversation.priority === 'urgent' || conversation.priority === 'high'
              ? h('span', { className: `imoDot ${conversation.priority}` })
              : null,
            conversation.tags.slice(0, 1).map((tag) => h('span', { key: tag, className: 'imoTag' }, `#${tag}`)),
            conversation.unread > 0 ? h('span', { className: 'imoUnread' }, conversation.unread > 99 ? '99+' : String(conversation.unread)) : null,
          ),
        ),
      )
    }

    /**
     * Unified inbox: list, thread, and context.
     * @param {Record<string, any>} props - app services and page state.
     * @returns {import('react').ReactElement} inbox.
     */
    function InboxView({ snapshot, t, search, selectedId, setSelectedId, command, intelligence, notify, confirm, onOpenContact }) {
      const [detailsOpen, setDetailsOpen] = React.useState(false)
      const [status, setStatus] = React.useState('all')
      const [channelId, setChannelId] = React.useState('')
      const [assignee, setAssignee] = React.useState('all')
      const [sort, setSort] = React.useState('newest')
      const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]))
      const channels = new Map(snapshot.channels.map((channel) => [channel.id, channel]))
      const agents = snapshot.agents
      const currentAgent = snapshot.workspace.currentAgentId
      const q = search.trim().toLowerCase()

      const filtered = React.useMemo(() => {
        const result = snapshot.conversations.filter((conversation) => {
          if (status !== 'all' && conversation.status !== status) return false
          if (channelId !== '' && conversation.channelId !== channelId) return false
          if (assignee === 'unassigned' && conversation.assigneeId !== null) return false
          if (assignee === 'mine' && conversation.assigneeId !== currentAgent) return false
          if (assignee !== 'all' && assignee !== 'unassigned' && assignee !== 'mine' && conversation.assigneeId !== assignee) return false
          if (q === '') return true
          const contact = contacts.get(conversation.contactId)
          const haystack = [
            contact?.name,
            contact?.handle,
            contact?.email,
            conversation.subject,
            ...(conversation.tags ?? []),
            ...conversation.messages.slice(-10).map((message) => message.text),
          ].join(' ').toLowerCase()
          return haystack.includes(q)
        })
        result.sort((left, right) => {
          if (sort === 'priority') {
            const rank = { urgent: 0, high: 1, normal: 2, low: 3 }
            return (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9)
          }
          return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        })
        return result
      }, [snapshot.conversations, status, channelId, assignee, q, sort, currentAgent, contacts])

      const selected = snapshot.conversations.find((conversation) => conversation.id === selectedId)
        ?? filtered[0]
        ?? null

      React.useEffect(() => {
        if (filtered.length === 0) return
        if (selectedId === null || !filtered.some((conversation) => conversation.id === selectedId)) {
          setSelectedId(filtered[0].id)
        }
      }, [filtered, selectedId, setSelectedId])

      const counts = {
        all: snapshot.conversations.length,
        open: snapshot.conversations.filter((conversation) => conversation.status === 'open').length,
        pending: snapshot.conversations.filter((conversation) => conversation.status === 'pending').length,
        resolved: snapshot.conversations.filter((conversation) => conversation.status === 'resolved').length,
        snoozed: snapshot.conversations.filter((conversation) => conversation.status === 'snoozed').length,
      }

      function selectConversation(conversation) {
        setSelectedId(conversation.id)
        if ((conversation.unread ?? 0) > 0) {
          command('conversation.read', { conversationId: conversation.id }).catch(() => {})
        }
      }

      return h('div', { className: `imoInbox ${detailsOpen ? 'imoInboxDetails' : ''}`.trim() },
        h('section', { className: 'imoListCol' },
          h('div', { className: 'imoListHead' },
            h('span', { className: 'imoListTitle' }, h(Icon, { name: 'inbox', size: 15 }), t('inbox.title')),
            h('span', { className: 'imoTiny imoMuted' }, tr(t, 'inbox.count', { n: filtered.length })),
          ),
          h('div', { className: 'imoListFilters' },
            h('div', { className: 'imoStatusChips', role: 'tablist' },
              ['all', 'open', 'pending', 'resolved', 'snoozed'].map((value) => h('button', {
                key: value,
                type: 'button',
                role: 'tab',
                'aria-selected': status === value,
                className: `imoChip ${status === value ? 'imoChipActive' : ''}`.trim(),
                onClick: () => setStatus(value),
              }, t(`status.${value}`), h('span', { className: 'imoFaint' }, String(counts[value] ?? 0)))),
            ),
            h('div', { className: 'imoFilterRow' },
              h('select', {
                className: 'imoSelect',
                value: channelId,
                onChange: (event) => setChannelId(event.target.value),
                'aria-label': t('inbox.channel'),
              }, h('option', { value: '' }, t('inbox.allChannels')), snapshot.channels.map((channel) => h('option', { key: channel.id, value: channel.id }, channel.name))),
              h('select', {
                className: 'imoSelect',
                value: assignee,
                onChange: (event) => setAssignee(event.target.value),
                'aria-label': t('inbox.assignee'),
              }, h('option', { value: 'all' }, t('inbox.allAgents')), h('option', { value: 'mine' }, t('inbox.mine')), h('option', { value: 'unassigned' }, t('inbox.unassigned')), agents.map((agent) => h('option', { key: agent.id, value: agent.id }, agent.name))),
              h('select', {
                className: 'imoSelect',
                value: sort,
                onChange: (event) => setSort(event.target.value),
                'aria-label': 'Sort',
                style: { maxWidth: 90 },
              }, h('option', { value: 'newest' }, 'Newest'), h('option', { value: 'priority' }, 'Priority')),
            ),
          ),
          h('div', { className: 'imoConvList' },
            filtered.length === 0
              ? h(Empty, {
                icon: 'inboxCheck',
                title: q !== '' || status !== 'all' || channelId !== '' ? t('inbox.noResults') : t('inbox.emptyTitle'),
                body: q !== '' || status !== 'all' || channelId !== '' ? '' : t('inbox.emptyBody'),
              })
              : filtered.map((conversation) => h(ConversationRow, {
                key: conversation.id,
                conversation,
                contact: contacts.get(conversation.contactId),
                channel: channels.get(conversation.channelId),
                t,
                active: selected?.id === conversation.id,
                onClick: () => selectConversation(conversation),
              })),
          ),
        ),
        h(Thread, {
          conversation: selected,
          snapshot,
          t,
          command,
          intelligence,
          notify,
          confirm,
          onOpenContact,
          detailsOpen,
          onToggleDetails: () => setDetailsOpen((value) => !value),
        }),
        detailsOpen
          ? h(ContextPanel, {
            conversation: selected,
            snapshot,
            t,
            command,
            notify,
            onOpenContact,
            onClose: () => setDetailsOpen(false),
          })
          : null,
      )
    }

    /**
     * Conversation thread and composer.
     * @param {Record<string, any>} props - conversation and services.
     * @returns {import('react').ReactElement} thread.
     */
    function Thread({ conversation, snapshot, t, command, intelligence, notify, confirm, onOpenContact, detailsOpen, onToggleDetails }) {
      const bodyRef = React.useRef(null)
      const contact = conversation === null ? undefined : snapshot.contacts.find((item) => item.id === conversation.contactId)
      const channel = conversation === null ? undefined : snapshot.channels.find((item) => item.id === conversation.channelId)
      const agents = snapshot.agents
      const currentAgent = snapshot.agents.find((agent) => agent.id === snapshot.workspace.currentAgentId)
      const [showTranslation, setShowTranslation] = React.useState(true)
      const [translationError, setTranslationError] = React.useState('')
      const translationTarget = snapshot.workspace.translationTarget || 'zh-CN'

      React.useEffect(() => {
        if (conversation === null || snapshot.workspace.autoTranslate !== true || showTranslation !== true) return undefined
        if (conversation.messages.length === 0) return undefined
        let cancelled = false
        const timer = setTimeout(() => {
          void intelligence('translateConversation', {
            conversationId: conversation.id,
            targetLanguage: translationTarget,
          }).then(() => {
            if (!cancelled) setTranslationError('')
          }).catch((error) => {
            if (!cancelled) setTranslationError(error instanceof Error ? error.message : String(error))
          })
        }, 350)
        return () => {
          cancelled = true
          clearTimeout(timer)
        }
      }, [conversation?.id, conversation?.messages.length, snapshot.workspace.autoTranslate, translationTarget, showTranslation, intelligence])

      React.useEffect(() => {
        if (conversation !== null && (conversation.unread ?? 0) > 0) {
          command('conversation.read', { conversationId: conversation.id }).catch(() => {})
        }
      }, [conversation?.id, conversation?.unread, command])

      React.useEffect(() => {
        const node = bodyRef.current
        if (node === null) return
        node.scrollTop = node.scrollHeight
      }, [conversation?.id, conversation?.messages.length])

      if (conversation === null) {
        return h('section', { className: 'imoThread' },
          h(Empty, { icon: 'inbox', title: t('inbox.emptyTitle'), body: t('inbox.emptyBody') }),
        )
      }

      async function update(fields, message = t('toast.conversationUpdated')) {
        try {
          await command('conversation.update', { conversationId: conversation.id, ...fields })
          notify(message)
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      async function send(text, mode, templateId, attachments = []) {
        try {
          if (mode === 'note') {
            await command('message.note', { conversationId: conversation.id, text })
            notify(t('toast.noteAdded'))
          } else {
            await command('message.send', {
              conversationId: conversation.id,
              text,
              templateId,
              attachments: attachments.map((attachment) => ({ id: attachment.id })),
            })
            notify(t('toast.messageQueued'))
          }
          return true
        } catch (error) {
          notify(errorText(t, error), 'error')
          return false
        }
      }

      async function retry(messageId) {
        try {
          await command('message.retry', { messageId })
          notify(t('toast.messageQueued'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      const sla = slaInfo(conversation, snapshot.workspace, t)
      return h('section', { className: 'imoThread' },
        h('header', { className: 'imoThreadHead' },
          h('div', { className: 'imoThreadIdentity' },
            h(Avatar, { name: contact?.name ?? t('conversation.unknownContact'), hue: contact?.hue ?? 215, size: 'lg' }),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', { className: 'imoThreadTitle' }, contact?.name ?? t('conversation.unknownContact')),
              h('div', { className: 'imoThreadMeta' },
                channel ? h(ChannelPill, { channel, t }) : h(Pill, { tone: 'bad' }, t('conversation.noChannel')),
                h('span', { className: 'imoEllipsis' }, conversation.subject),
                h('span', { className: 'imoFaint' }, `${conversation.messages.length} · ${fmtRelative(conversation.updatedAt, t)}`),
                h('span', { className: `imoPill ${sla.tone === 'bad' ? 'bad' : sla.tone === 'warn' ? 'warn' : 'success'}`.trim() }, h(Icon, { name: 'clock', size: 10 }), sla.label),
                translationError !== '' ? h('span', { className: 'imoTranslateError', title: translationError }, t('translate.unavailable')) : null,
              ),
            ),
          ),
          h('div', { className: 'imoThreadActions' },
            h('button', {
              type: 'button',
              className: `imoBtn imoBtnSm ${detailsOpen ? 'imoBtnPrimary' : ''}`.trim(),
              onClick: onToggleDetails,
              title: t('conversation.detailsToggle'),
            }, h(Icon, { name: 'user', size: 12 }), t('conversation.customerDetails')),
            h('button', {
              type: 'button',
              className: `imoBtn imoBtnSm ${showTranslation ? 'imoBtnPrimary' : ''}`.trim(),
              onClick: () => setShowTranslation((value) => !value),
              title: t('translate.toggle'),
            }, h(Icon, { name: 'globe', size: 12 }), t('translate.short')),
            snapshot.workspace.bot?.enabled === true
              ? h('button', {
                type: 'button',
                className: `imoBtn imoBtnSm ${conversation.botPaused === true ? '' : 'imoBtnPrimary'}`.trim(),
                onClick: async () => {
                  try {
                    await command('conversation.bot', { conversationId: conversation.id, paused: conversation.botPaused !== true })
                    notify(conversation.botPaused === true ? t('bot.resumed') : t('bot.paused'))
                  } catch (error) {
                    notify(errorText(t, error), 'error')
                  }
                },
                title: t('bot.toggle'),
              }, h(Icon, { name: 'bolt', size: 12 }), conversation.botPaused === true ? t('bot.resume') : t('bot.takeover'))
              : null,
            h('select', {
              className: 'imoSelect',
              value: conversation.status,
              onChange: (event) => {
                const value = event.target.value
                void update({ status: value }, value === 'resolved' ? t('toast.conversationUpdated') : t('toast.conversationUpdated'))
              },
              'aria-label': t('conversation.status'),
            }, ['open', 'pending', 'resolved', 'snoozed'].map((value) => h('option', { key: value, value }, t(`status.${value}`)))),
            h('select', {
              className: 'imoSelect',
              value: conversation.priority,
              onChange: (event) => { void update({ priority: event.target.value }) },
              'aria-label': t('conversation.priority'),
            }, ['low', 'normal', 'high', 'urgent'].map((value) => h('option', { key: value, value }, t(`priority.${value}`)))),
            h('select', {
              className: 'imoSelect',
              value: conversation.assigneeId ?? '',
              onChange: (event) => { void update({ assigneeId: event.target.value === '' ? null : event.target.value }) },
              'aria-label': t('conversation.assignee'),
            }, h('option', { value: '' }, t('inbox.unassigned')), agents.map((agent) => h('option', { key: agent.id, value: agent.id }, agent.name))),
            h('select', {
              className: 'imoSelect',
              value: '',
              onChange: (event) => {
                if (event.target.value === '') return
                const minutes = event.target.value === 'tomorrow' ? 60 * 24 : Number(event.target.value)
                void update({ snoozeMinutes: minutes })
                event.target.value = ''
              },
              'aria-label': t('conversation.snooze'),
              style: { maxWidth: 105 },
            }, h('option', { value: '' }, t('conversation.snooze')), h('option', { value: '60' }, t('conversation.snooze1h')), h('option', { value: '240' }, t('conversation.snooze4h')), h('option', { value: 'tomorrow' }, t('conversation.snoozeTomorrow'))),
            h('button', {
              type: 'button',
              className: `imoBtn imoBtnSm ${conversation.status === 'resolved' ? '' : 'imoBtnPrimary'}`.trim(),
              onClick: () => { void update({ status: conversation.status === 'resolved' ? 'open' : 'resolved' }) },
            }, h(Icon, { name: conversation.status === 'resolved' ? 'refresh' : 'check', size: 13 }), conversation.status === 'resolved' ? t('conversation.reopen') : t('conversation.resolve')),
          ),
        ),
        h('div', { className: 'imoThreadBody', ref: bodyRef },
          conversation.messages.length === 0
            ? h(Empty, { icon: 'note', title: t('conversation.noMessages') })
            : h(MessageList, { conversation, contact, agents, t, onRetry: retry, showTranslation: showTranslation && snapshot.workspace.autoTranslate === true, botName: snapshot.workspace.bot?.name ?? t('bot.name') }),
        ),
        h(Composer, {
          conversation,
          contact,
          currentAgent,
          workspaceName: snapshot.workspace.name,
          workspace: snapshot.workspace,
          templates: snapshot.templates,
          t,
          intelligence,
          notify,
          onSend: send,
        }),
      )
    }

    /**
     * Day-grouped message list.
     * @param {Record<string, any>} props - conversation and related records.
     * @returns {import('react').ReactElement} list.
     */
    function MessageList({ conversation, contact, agents, t, onRetry, showTranslation = true, botName = 'AI' }) {
      const rows = []
      let day = ''
      for (const message of conversation.messages) {
        const nextDay = dayOf(message.createdAt)
        if (nextDay !== day) {
          day = nextDay
          rows.push({ kind: 'day', key: `day-${day}`, iso: message.createdAt })
        }
        rows.push({ kind: 'message', key: message.id, message })
      }
      return rows.map((row) => {
        if (row.kind === 'day') return h('div', { key: row.key, className: 'imoDay' }, dayLabel(row.iso, t))
        const message = row.message
        const outbound = message.direction === 'out'
        const note = message.direction === 'note'
        const system = message.direction === 'system'
        const right = outbound || note
        const agent = agents.find((item) => item.id === message.agentId)
        if (system) {
          return h('div', { key: row.key, className: 'imoMsgRow system' }, h('div', { className: 'imoBubble imoBubbleSystem' }, message.text))
        }
        return h('div', { key: row.key, className: `imoMsgRow ${right ? 'out' : ''}`.trim() },
          !right ? h(Avatar, { name: contact?.name ?? '?', hue: contact?.hue ?? 215, size: 'sm' }) : null,
          h('div', { className: 'imoMsgStack' },
            h('div', { className: `imoBubble ${outbound ? 'imoBubbleOut' : ''} ${note ? 'imoBubbleNote' : ''}`.trim() },
              message.text || t('message.noText'),
              message.attachments?.length > 0
                ? h('div', { className: 'imoAttach' }, message.attachments.map((attachment, index) => {
                  const key = `${message.id}-att-${index}`
                  // Attachment bytes are owner-authenticated, so the same-origin
                  // <img> carries the session cookie and needs no blob handling.
                  if (String(attachment.type ?? '').startsWith('image/')) {
                    return h('a', { key, href: safeHref(attachment.url), target: '_blank', rel: 'noreferrer noopener' },
                      h('img', { className: 'imoAttachImg', src: attachment.url, alt: attachment.name || t('message.file') }))
                  }
                  return h('a', {
                    key,
                    href: safeHref(attachment.url),
                    target: '_blank',
                    rel: 'noreferrer noopener',
                  }, h(Icon, { name: 'file', size: 11 }), attachment.name || attachment.type || t('message.file'))
                }))
                : null,
            ),
            message.direction === 'in' && showTranslation === true && message.translation !== null && message.translation !== undefined && message.translation.text !== message.text
              ? h('div', { className: 'imoTranslation' },
                h('div', { className: 'imoTranslationLabel' }, h(Icon, { name: 'sparkles', size: 10 }), `${t('translate.label')} · ${message.translation.sourceLanguage ? `${message.translation.sourceLanguage} → ` : ''}${message.translation.targetLanguage}`),
                message.translation.text,
              )
              : null,
            h('div', { className: 'imoMsgMeta' },
              note ? h('span', { className: 'imoPill warn' }, t('message.internalNote')) : null,
              h('span', null, outbound
                ? (message.sender === 'bot' ? h('span', { className: 'imoPill brand' }, h(Icon, { name: 'bolt', size: 10 }), botName) : (agent?.name ?? t('conversation.you')))
                : (contact?.name ?? t('conversation.unknownContact'))),
              h('span', null, fmtTime(message.createdAt)),
              outbound ? h('span', { className: message.status === 'failed' ? 'imoMsgError' : '' },
                message.status === 'failed'
                  ? h(React.Fragment, null,
                    h(Icon, { name: 'alert', size: 10 }),
                    tr(t, 'message.failed', { error: message.error || t('common.failed') }),
                    h('button', {
                      type: 'button',
                      className: 'imoRetry',
                      onClick: () => { void onRetry(message.id) },
                    }, t('message.retry')),
                  )
                  : `${message.status === 'queued' ? t('common.sending') : message.status === 'sending' ? t('common.sending') : ''}`,
              ) : null,
            ),
          ),
        )
      })
    }

    /**
     * Reply/note composer with template insertion.
     * @param {Record<string, any>} props - conversation, templates, and send callback.
     * @returns {import('react').ReactElement} composer.
     */
    function Composer({ conversation, contact, currentAgent, workspaceName, workspace, templates, t, intelligence, notify, onSend }) {
      const [mode, setMode] = React.useState('reply')
      const [text, setText] = React.useState('')
      const [sending, setSending] = React.useState(false)
      const [suggestions, setSuggestions] = React.useState([])
      const [suggesting, setSuggesting] = React.useState(false)
      const [uploads, setUploads] = React.useState([])
      const [uploading, setUploading] = React.useState(false)
      const fileRef = React.useRef(null)
      const available = templates.filter((template) => template.channelIds.length === 0 || template.channelIds.includes(conversation.channelId))

      React.useEffect(() => {
        setText('')
        setMode('reply')
        setSending(false)
        setSuggestions([])
        setSuggesting(false)
      }, [conversation.id])

      async function suggest() {
        if (suggesting) return
        setSuggesting(true)
        try {
          const result = await intelligence('suggest', {
            conversationId: conversation.id,
            // Unknown customer language falls back to 'auto': the Host then asks
            // the model to mirror whatever the customer wrote.
            targetLanguage: conversation.customerLanguage || 'auto',
          })
          setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : [])
          if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) notify(t('ai.empty'), 'error')
        } catch (error) {
          notify(errorText(t, error), 'error')
        } finally {
          setSuggesting(false)
        }
      }

      async function uploadFiles(fileList) {
        const files = Array.from(fileList ?? []).slice(0, 5)
        if (files.length === 0) return
        setUploading(true)
        try {
          for (const file of files) {
            if (file.size > 12 * 1024 * 1024) {
              notify(`${file.name} 超过 12 MB，已跳过`, 'error')
              continue
            }
            const response = await fetch(UPLOAD_PATH, {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'x-file-name': encodeURIComponent(file.name || 'attachment'),
                'content-type': file.type || 'application/octet-stream',
              },
              body: file,
            })
            const body = await response.json().catch(() => null)
            if (!response.ok || body?.ok !== true) {
              notify(body?.error?.message ?? `上传失败：HTTP ${response.status}`, 'error')
              continue
            }
            const attachment = body.result?.attachment
            if (attachment !== undefined) setUploads((previous) => [...previous, attachment].slice(0, 5))
          }
        } finally {
          setUploading(false)
          if (fileRef.current !== null) fileRef.current.value = ''
        }
      }

      async function submit() {
        const value = text.trim()
        if ((value === '' && uploads.length === 0) || sending || uploading) return
        setSending(true)
        const ok = await onSend(value, mode, null, mode === 'note' ? [] : uploads)
        setSending(false)
        if (ok) {
          setText('')
          setUploads([])
        }
      }

      function insertTemplate(templateId) {
        const template = available.find((item) => item.id === templateId)
        if (template === undefined) return
        const rendered = String(template.body)
          .replaceAll('{{contact.name}}', contact?.name ?? 'there')
          .replaceAll('{{contact.handle}}', contact?.handle ?? '')
          .replaceAll('{{workspace.name}}', workspaceName)
          .replaceAll('{{conversation.id}}', conversation.id)
          .replaceAll('{{agent.name}}', currentAgent?.name ?? '')
        setText((previous) => previous.trim() === '' ? rendered : `${previous}\n${rendered}`)
      }

      return h('div', { className: 'imoComposer' },
        h('div', { className: 'imoComposerTabs' },
          h('button', {
            type: 'button',
            className: `imoComposerTab ${mode === 'reply' ? 'imoComposerTabActive' : ''}`.trim(),
            onClick: () => setMode('reply'),
          }, h(Icon, { name: 'send', size: 12 }), t('composer.reply')),
          h('button', {
            type: 'button',
            className: `imoComposerTab ${mode === 'note' ? 'imoComposerTabActive' : ''}`.trim(),
            onClick: () => setMode('note'),
          }, h(Icon, { name: 'note', size: 12 }), t('composer.note')),
          available.length > 0
            ? h('select', {
              className: 'imoSelect',
              value: '',
              onChange: (event) => { insertTemplate(event.target.value); event.target.value = '' },
              'aria-label': t('composer.template'),
              style: { maxWidth: 160, marginLeft: 'auto', height: 26, fontSize: 11 },
            }, h('option', { value: '' }, t('composer.template')), available.map((template) => h('option', { key: template.id, value: template.id }, `${template.shortcut ? `${template.shortcut} · ` : ''}${template.name}`)))
            : null,
          workspace.aiSuggestions !== false
            ? h('button', {
              type: 'button',
              className: 'imoBtn imoBtnSm',
              onClick: () => { void suggest() },
              disabled: suggesting,
              title: t('ai.suggest'),
              style: { marginLeft: 'auto' },
            }, suggesting ? h('span', { className: 'imoSpinner' }) : null, t('ai.suggest'))
            : null,
        ),
        suggestions.length > 0
          ? h('div', { className: 'imoSuggestions' },
            h('div', { className: 'imoSuggestionHead' },
              h(Icon, { name: 'sparkles', size: 12 }),
              h('span', { style: { flex: 1 } }, `${t('ai.title')} · ${conversation.customerLanguage || workspace.translationTarget || 'zh-CN'}`),
              h('button', { type: 'button', className: 'imoIconBtn', style: { width: 20, height: 20 }, title: t('ai.regenerate'), 'aria-label': t('ai.regenerate'), onClick: () => { void suggest() } }, h(Icon, { name: 'refresh', size: 11 })),
              h('button', { type: 'button', className: 'imoIconBtn', style: { width: 20, height: 20 }, title: t('common.close'), 'aria-label': t('common.close'), onClick: () => setSuggestions([]) }, h(Icon, { name: 'x', size: 11 })),
            ),
            suggestions.map((suggestion, index) => h('button', {
              key: index,
              type: 'button',
              className: 'imoSuggestionCard',
              onClick: () => {
                setText(suggestion)
                setSuggestions([])
              },
            }, suggestion)),
          )
          : null,
        h('div', { className: 'imoComposerBox' },
          h('textarea', {
            className: 'imoTextarea',
            value: text,
            onChange: (event) => setText(event.target.value),
            placeholder: mode === 'note' ? t('composer.placeholderNote') : t('composer.placeholderReply'),
            'aria-label': mode === 'note' ? t('composer.note') : t('composer.reply'),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            },
          }),
          uploads.length > 0
            ? h('div', { className: 'imoAttachPending' }, uploads.map((attachment) => h('span', { key: attachment.id, className: 'imoAttachChip' },
              h(Icon, { name: 'file', size: 11 }),
              attachment.name,
              h('button', {
                type: 'button',
                className: 'imoIconBtn',
                style: { width: 18, height: 18 },
                title: t('common.remove'),
                'aria-label': t('common.remove'),
                onClick: () => setUploads((previous) => previous.filter((item) => item.id !== attachment.id)),
              }, h(Icon, { name: 'x', size: 10 })),
            )))
            : null,
          h('div', { className: 'imoComposerFoot' },
            h('span', { className: 'imoComposerHint' }, mode === 'note' ? t('composer.noteHint') : t('composer.hint')),
            mode === 'reply'
              ? h('input', {
                ref: fileRef,
                type: 'file',
                multiple: true,
                style: { display: 'none' },
                onChange: (event) => { void uploadFiles(event.target.files) },
              })
              : null,
            mode === 'reply'
              ? h('button', {
                type: 'button',
                className: 'imoBtn imoBtnSm',
                disabled: uploading || uploads.length >= 5,
                title: '附件',
                'aria-label': '附件',
                onClick: () => fileRef.current?.click(),
              }, uploading ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'paperclip', size: 13 }), t('composer.attach'))
              : null,
            h('button', {
              type: 'button',
              className: 'imoBtn imoBtnPrimary imoBtnSm',
              disabled: sending || uploading || (text.trim() === '' && uploads.length === 0),
              onClick: () => { void submit() },
            }, sending ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: mode === 'note' ? 'note' : 'send', size: 13 }), mode === 'note' ? t('composer.saveNote') : t('composer.send')),
          ),
        ),
      )
    }

    /**
     * Right-side contact and conversation context.
     * @param {Record<string, any>} props - conversation, snapshot, and services.
     * @returns {import('react').ReactElement} context panel.
     */
    function ContextPanel({ conversation, snapshot, t, command, notify, onOpenContact, onClose }) {
      const [tagDraft, setTagDraft] = React.useState('')
      const [noteDraft, setNoteDraft] = React.useState('')
      const contact = conversation === null ? undefined : snapshot.contacts.find((item) => item.id === conversation.contactId)
      const channel = conversation === null ? undefined : snapshot.channels.find((item) => item.id === conversation.channelId)
      const events = conversation === null ? [] : snapshot.events.filter((event) => event.conversationId === conversation.id).slice(-6).reverse()
      const sla = conversation === null ? null : slaInfo(conversation, snapshot.workspace, t)

      if (conversation === null) return h('aside', { className: 'imoContext' }, h('div', { className: 'imoContextHead' }, h(Icon, { name: 'users', size: 13 }), h('span', { className: 'imoContextTitleHead' }, t('conversation.context')), h('button', { type: 'button', className: 'imoIconBtn', style: { width: 24, height: 24 }, title: t('common.close'), 'aria-label': t('common.close'), onClick: onClose }, h(Icon, { name: 'x', size: 13 }))), h(Empty, { icon: 'users', title: t('conversation.context') }))

      async function update(fields) {
        try {
          await command('conversation.update', { conversationId: conversation.id, ...fields })
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      async function addTag() {
        const tag = tagDraft.trim()
        if (tag === '' || conversation.tags.includes(tag)) return
        setTagDraft('')
        await update({ tags: [...conversation.tags, tag] })
      }

      async function addNote() {
        const body = noteDraft.trim()
        if (body === '') return
        try {
          await command('message.note', { conversationId: conversation.id, text: body })
          setNoteDraft('')
          notify(t('toast.noteAdded'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      return h('aside', { className: 'imoContext' },
        h('div', { className: 'imoContextHead' },
          h(Icon, { name: 'users', size: 13 }),
          h('span', { className: 'imoContextTitleHead' }, t('conversation.context')),
          h('button', { type: 'button', className: 'imoIconBtn', style: { width: 24, height: 24 }, title: t('common.close'), 'aria-label': t('common.close'), onClick: onClose }, h(Icon, { name: 'x', size: 13 })),
        ),
        h('div', { className: 'imoContextSection' },
          h('div', { className: 'imoContactHero' },
            h(Avatar, { name: contact?.name ?? t('conversation.unknownContact'), hue: contact?.hue ?? 215, size: 'lg' }),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'imoContactName' }, contact?.name ?? t('conversation.unknownContact')),
              h('div', { className: 'imoContactSub' }, [contact?.company, contact?.handle].filter(Boolean).join(' · ') || t('contacts.noCompany')),
            ),
          ),
          contact ? h(React.Fragment, null,
            contact.email ? h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('contacts.email')), h('a', { className: 'imoFieldValue', href: `mailto:${contact.email}` }, contact.email)) : null,
            contact.phone ? h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('contacts.phone')), h('span', { className: 'imoFieldValue' }, contact.phone)) : null,
            h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.externalId')), h('span', { className: 'imoFieldValue imoMono' }, conversation.externalId)),
          ) : null,
          h('button', { type: 'button', className: 'imoBtn imoBtnSm', style: { width: '100%', marginTop: 4 }, onClick: () => onOpenContact(contact?.id ?? null) }, h(Icon, { name: 'user', size: 12 }), t('conversation.viewContact')),
        ),
        h('div', { className: 'imoContextSection' },
          h('div', { className: 'imoContextTitle' }, t('conversation.details')),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('inbox.channel')), h('span', { className: 'imoFieldValue' }, channel?.name ?? t('conversation.noChannel'))),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.status')), h('span', { className: 'imoFieldValue' }, t(`status.${conversation.status}`))),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.priority')), h('span', { className: 'imoFieldValue' }, t(`priority.${conversation.priority}`))),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.created')), h('span', { className: 'imoFieldValue' }, fmtDateTime(conversation.createdAt))),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.firstResponse')), h('span', { className: 'imoFieldValue' }, conversation.firstResponseAt ? fmtDateTime(conversation.firstResponseAt) : t('common.never'))),
          h('div', { className: 'imoField' }, h('span', { className: 'imoFieldLabel' }, t('conversation.lastInbound')), h('span', { className: 'imoFieldValue' }, conversation.lastInboundAt ? fmtRelative(conversation.lastInboundAt, t) : t('common.never'))),
          h('div', { className: 'imoSla' },
            h('div', { className: 'imoSlaTrack' }, h('div', { className: `imoSlaFill ${sla.tone === 'bad' ? 'bad' : sla.tone === 'warn' ? 'warn' : ''}`.trim(), style: { width: `${sla.percent}%` } })),
            h('div', { className: 'imoTiny imoMuted' }, sla.label),
          ),
        ),
        h('div', { className: 'imoContextSection' },
          h('div', { className: 'imoContextTitle' }, t('conversation.tags')),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            conversation.tags.length === 0 ? h('span', { className: 'imoTiny imoMuted' }, t('common.none')) : null,
            conversation.tags.map((tag) => h('span', { key: tag, className: 'imoTag' }, `#${tag}`, h('button', {
              type: 'button',
              className: 'imoTagRemove',
              onClick: () => { void update({ tags: conversation.tags.filter((item) => item !== tag) }) },
              'aria-label': `${t('common.remove')} ${tag}`,
            }, '×'))),
          ),
          h('div', { className: 'imoTagEditor' },
            h('input', {
              className: 'imoTagInput',
              value: tagDraft,
              onChange: (event) => setTagDraft(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } },
              placeholder: t('conversation.tagPlaceholder'),
              'aria-label': t('conversation.addTag'),
            }),
            h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => { void addTag() }, disabled: tagDraft.trim() === '' }, t('common.add')),
          ),
        ),
        h('div', { className: 'imoContextSection' },
          h('div', { className: 'imoContextTitle' }, t('conversation.notes')),
          h('textarea', {
            className: 'imoTextareaForm',
            style: { minHeight: 58, fontSize: 11.5 },
            value: noteDraft,
            onChange: (event) => setNoteDraft(event.target.value),
            placeholder: t('conversation.addNotePlaceholder'),
            'aria-label': t('conversation.addNotePlaceholder'),
          }),
          h('button', { type: 'button', className: 'imoBtn imoBtnSm', style: { marginTop: 5 }, disabled: noteDraft.trim() === '', onClick: () => { void addNote() } }, t('composer.saveNote')),
          h('div', { style: { marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 } },
            conversation.messages.filter((message) => message.direction === 'note').slice(-3).reverse().map((message) => h('div', { key: message.id, className: 'imoBubble imoBubbleNote', style: { fontSize: 11, padding: '6px 8px' } }, message.text, h('div', { className: 'imoMsgMeta' }, fmtRelative(message.createdAt, t)))),
          ),
        ),
        h('div', { className: 'imoContextSection' },
          h('div', { className: 'imoContextTitle' }, t('conversation.activity')),
          events.length === 0
            ? h('div', { className: 'imoTiny imoMuted' }, t('conversation.noActivity'))
            : h('div', { className: 'imoEventList' }, events.map((event) => h('div', { key: event.id, className: 'imoEvent' }, h('span', { className: 'imoEventDot' }), h('span', null, event.text, h('div', { className: 'imoFaint' }, fmtRelative(event.createdAt, t)))))),
        ),
      )
    }

    /**
     * Contacts page with a detail/edit dialog.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function ContactsView({ snapshot, t, command, notify, confirm, focusContactId, setFocusContactId, onOpenConversation }) {
      const [search, setSearch] = React.useState('')
      const [editing, setEditing] = React.useState(null)
      const q = search.trim().toLowerCase()
      const filtered = snapshot.contacts.filter((contact) => {
        if (q === '') return true
        return [contact.name, contact.handle, contact.email, contact.company, contact.phone, ...(contact.tags ?? [])].join(' ').toLowerCase().includes(q)
      })
      const current = editing === 'new' ? null : (snapshot.contacts.find((contact) => contact.id === editing) ?? null)
      React.useEffect(() => {
        if (focusContactId !== null) {
          setEditing(focusContactId)
          setFocusContactId(null)
        }
      }, [focusContactId, setFocusContactId])
      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('contacts.title')),
            h('p', { className: 'imoPageSub' }, t('contacts.subtitle')),
          ),
          h('div', { className: 'imoPageActions' },
            h('label', { className: 'imoTopSearch', style: { maxWidth: 260, height: 32 } },
              h(Icon, { name: 'search', size: 14 }),
              h('input', { value: search, onChange: (event) => setSearch(event.target.value), placeholder: t('contacts.search'), 'aria-label': t('contacts.search') }),
            ),
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setEditing('new') }, h(Icon, { name: 'plus', size: 13 }), t('contacts.new')),
          ),
        ),
        h('div', { className: 'imoTiny imoMuted', style: { marginBottom: 8 } }, tr(t, 'contacts.count', { n: filtered.length })),
        filtered.length === 0
          ? h('div', { className: 'imoSection' }, h(Empty, { icon: 'users', title: snapshot.contacts.length === 0 ? t('contacts.emptyTitle') : t('contacts.noResults'), body: snapshot.contacts.length === 0 ? t('contacts.emptyBody') : '', action: snapshot.contacts.length === 0 ? h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setEditing('new'), style: { marginTop: 8 } }, t('contacts.new')) : null }))
          : h('div', { className: 'imoTableWrap' },
            h('table', { className: 'imoTable' },
              h('thead', null, h('tr', null,
                h('th', null, t('contacts.name')),
                h('th', null, t('contacts.company')),
                h('th', null, t('contacts.email')),
                h('th', null, t('contacts.channels')),
                h('th', null, t('contacts.tags')),
                h('th', null, t('contacts.conversations')),
                h('th', null, t('contacts.lastSeen')),
              )),
              h('tbody', null, filtered.map((contact) => {
                const conversations = snapshot.conversations.filter((conversation) => conversation.contactId === contact.id)
                return h('tr', { key: contact.id },
                  h('td', null,
                    h('button', { type: 'button', className: 'imoTableButton', onClick: () => setEditing(contact.id), style: { display: 'flex', alignItems: 'center', gap: 7 } },
                      h(Avatar, { name: contact.name, hue: contact.hue, size: 'sm' }),
                      h('span', null, contact.name, h('div', { className: 'imoTiny imoMuted' }, contact.handle || t('contacts.noHandle'))),
                    ),
                  ),
                  h('td', null, contact.company || h('span', { className: 'imoMuted' }, t('contacts.noCompany'))),
                  h('td', null, contact.email || h('span', { className: 'imoMuted' }, t('contacts.noEmail'))),
                  h('td', null, h('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap' } }, (contact.identities ?? []).map((identity) => {
                    const channel = snapshot.channels.find((item) => item.id === identity.channelId)
                    return h('span', { key: identity.channelId, className: 'imoTag' }, channel?.name ?? identity.channelId)
                  }))),
                  h('td', null, h('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap' } }, contact.tags.slice(0, 3).map((tag) => h('span', { key: tag, className: 'imoTag' }, `#${tag}`)))),
                  h('td', null, String(conversations.length)),
                  h('td', null, contact.lastSeenAt ? fmtRelative(contact.lastSeenAt, t) : '—'),
                )
              })),
            ),
          ),
        editing !== null
          ? h(ContactModal, {
            contact: current,
            snapshot,
            t,
            command,
            notify,
            confirm,
            onClose: () => setEditing(null),
            onOpenConversation: (id) => { setEditing(null); onOpenConversation(id) },
          })
          : null,
      )
    }

    /**
     * Contact create/edit and detail dialog.
     * @param {Record<string, any>} props - contact, snapshot, and services.
     * @returns {import('react').ReactElement} dialog.
     */
    function ContactModal({ contact, snapshot, t, command, notify, confirm, onClose, onOpenConversation }) {
      const isNew = contact === null
      const [form, setForm] = React.useState({
        name: contact?.name ?? '',
        handle: contact?.handle ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        company: contact?.company ?? '',
        tags: (contact?.tags ?? []).join(', '),
      })
      const [note, setNote] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')
      const conversations = contact === null ? [] : snapshot.conversations.filter((conversation) => conversation.contactId === contact.id)

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      async function save() {
        if (form.name.trim() === '') {
          setError(t('error.invalid-name'))
          return
        }
        setSaving(true)
        setError('')
        try {
          const payload = {
            name: form.name.trim(),
            handle: form.handle.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            company: form.company.trim(),
            tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          }
          if (isNew) await command('contact.create', payload)
          else await command('contact.update', { contactId: contact.id, ...payload })
          notify(t('toast.contactSaved'))
          onClose()
        } catch (reason) {
          setError(errorText(t, reason))
        } finally {
          setSaving(false)
        }
      }

      async function remove() {
        confirm({
          title: t('contacts.delete'),
          body: tr(t, 'contacts.deleteConfirm', { name: contact.name }),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('contact.delete', { contactId: contact.id })
              notify(t('toast.contactDeleted'))
              onClose()
            } catch (reason) {
              notify(errorText(t, reason), 'error')
            }
          },
        })
      }

      async function addNote() {
        if (note.trim() === '') return
        try {
          await command('contact.note', { contactId: contact.id, text: note.trim() })
          setNote('')
          notify(t('toast.noteAdded'))
        } catch (reason) {
          notify(errorText(t, reason), 'error')
        }
      }

      return h(Modal, {
        title: isNew ? t('contacts.newTitle') : t('contacts.detailTitle'),
        subtitle: isNew ? t('contacts.subtitle') : contact.name,
        wide: true,
        onClose,
        footer: [
          !isNew ? h('button', { key: 'delete', type: 'button', className: 'imoBtn imoBtnDanger', onClick: () => { void remove() } }, h(Icon, { name: 'trash', size: 13 }), t('contacts.delete')) : null,
          h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.cancel')),
          h('button', { key: 'save', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void save() } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('contacts.save')),
        ],
      },
        h('div', { className: 'imoFormGrid' },
          h(Field, { label: t('contacts.name'), full: true }, h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value), autoFocus: true })),
          h(Field, { label: t('contacts.handle') }, h('input', { className: 'imoInput', value: form.handle, onChange: (event) => setField('handle', event.target.value), placeholder: '@name' })),
          h(Field, { label: t('contacts.email') }, h('input', { className: 'imoInput', type: 'email', value: form.email, onChange: (event) => setField('email', event.target.value) })),
          h(Field, { label: t('contacts.phone') }, h('input', { className: 'imoInput', value: form.phone, onChange: (event) => setField('phone', event.target.value) })),
          h(Field, { label: t('contacts.company') }, h('input', { className: 'imoInput', value: form.company, onChange: (event) => setField('company', event.target.value) })),
          h(Field, { label: t('contacts.tags'), full: true }, h('input', { className: 'imoInput', value: form.tags, onChange: (event) => setField('tags', event.target.value), placeholder: 'vip, billing' })),
        ),
        error !== '' ? h('div', { className: 'imoSmall', style: { color: 'var(--dsw-alias-state-error-primary)', marginTop: 8 } }, error) : null,
        !isNew ? h(React.Fragment, null,
          h('div', { className: 'imoDivider' }),
          h('div', { className: 'imoInfoGrid' },
            h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String((contact.identities ?? []).length)), h('div', { className: 'imoInfoLabel' }, t('contacts.channels'))),
            h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(conversations.length)), h('div', { className: 'imoInfoLabel' }, t('contacts.conversations'))),
            h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, contact.lastSeenAt ? fmtRelative(contact.lastSeenAt, t) : '—'), h('div', { className: 'imoInfoLabel' }, t('contacts.lastSeen'))),
            h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, fmtDate(contact.createdAt)), h('div', { className: 'imoInfoLabel' }, t('contacts.created'))),
          ),
          h('div', { className: 'imoSectionTitle', style: { marginTop: 14 } }, t('contacts.identities')),
          (contact.identities ?? []).length === 0
            ? h('div', { className: 'imoSmall imoMuted' }, t('contacts.noChannels'))
            : h('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap' } }, contact.identities.map((identity) => {
              const channel = snapshot.channels.find((item) => item.id === identity.channelId)
              return h('span', { key: identity.channelId, className: 'imoTag' }, channel?.name ?? identity.channelId, ` · ${identity.externalId}`)
            })),
          h('div', { className: 'imoSectionTitle', style: { marginTop: 14 } }, t('contacts.conversations')),
          conversations.length === 0
            ? h('div', { className: 'imoSmall imoMuted' }, t('common.none'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } }, conversations.slice(0, 5).map((conversation) => h('button', {
              key: conversation.id,
              type: 'button',
              className: 'imoBtn',
              style: { justifyContent: 'space-between' },
              onClick: () => onOpenConversation(conversation.id),
            }, h('span', { className: 'imoEllipsis' }, conversation.subject), h('span', { className: 'imoTiny imoMuted' }, t(`status.${conversation.status}`), ' · ', fmtRelative(conversation.updatedAt, t)))),
          ),
          h('div', { className: 'imoSectionTitle', style: { marginTop: 14 } }, t('contacts.notes')),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-end' } },
            h('textarea', { className: 'imoTextareaForm', style: { minHeight: 50, flex: 1 }, value: note, onChange: (event) => setNote(event.target.value), placeholder: t('conversation.addNotePlaceholder') }),
            h('button', { type: 'button', className: 'imoBtn imoBtnSm', disabled: note.trim() === '', onClick: () => { void addNote() } }, t('contacts.addNote')),
          ),
          (contact.notes ?? []).length === 0
            ? h('div', { className: 'imoSmall imoMuted', style: { marginTop: 7 } }, t('contacts.noNotes'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 7 } }, contact.notes.slice().reverse().map((item) => h('div', { key: item.id, className: 'imoBubble imoBubbleNote', style: { fontSize: 11.5 } }, item.body, h('div', { className: 'imoMsgMeta' }, fmtRelative(item.createdAt, t))))),
        ) : null,
      )
    }

    /**
     * Resolve a channel type's catalog entry for a channel form.
     * @param {Record<string, any>} channel - channel or draft.
     * @param {Record<string, any>} snapshot - snapshot.
     * @returns {Record<string, any>} platform.
     */
    function platformForChannel(channel, snapshot) {
      return platformOf(snapshot, channel?.type)
    }

    /**
     * Initial form config; configured secrets stay blank so a save preserves them.
     * @param {Record<string, any>} platform - platform.
     * @param {Record<string, any>|null} channel - existing channel.
     * @returns {Record<string, string>} form config.
     */
    function initialChannelConfig(platform, channel) {
      const result = {}
      for (const field of platform.fields ?? []) {
        if (field.secret) result[field.key] = ''
        else if (field.key === 'outboundUrl' && String(channel?.config?.[field.key] ?? '').startsWith('demo://')) result[field.key] = ''
        else if (channel?.config?.[field.key] !== undefined) result[field.key] = String(channel.config[field.key] ?? '')
        else if (field.type === 'select') result[field.key] = field.options?.[0]?.value ?? ''
        else result[field.key] = ''
      }
      return result
    }

    /**
     * Channel overview: platform picker, native cards, setup and QR dialogs.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function ChannelsView({ snapshot, t, command, notify, confirm }) {
      const [pickerOpen, setPickerOpen] = React.useState(false)
      const [editing, setEditing] = React.useState(null)
      const [editingPlatform, setEditingPlatform] = React.useState(null)
      const [setupChannel, setSetupChannel] = React.useState(null)
      const [setupSecrets, setSetupSecrets] = React.useState({})
      const [qrChannel, setQrChannel] = React.useState(null)
      const [busy, setBusy] = React.useState('')

      const platforms = Array.isArray(snapshot.channelPlatforms) ? snapshot.channelPlatforms : []
      const channels = snapshot.channels
      const active = channels.filter((channel) => channel.status === 'active').length
      const connected = channels.filter((channel) => channel.health === 'connected').length
      const errors = channels.filter((channel) => channel.health === 'error').length

      function openNew(platform) {
        setPickerOpen(false)
        setEditingPlatform(platform)
        setEditing('new')
      }

      function openEdit(channel) {
        setEditingPlatform(platformForChannel(channel, snapshot))
        setEditing(channel.id)
      }

      function openSetup(channel, secrets = {}) {
        setSetupSecrets(secrets)
        setSetupChannel(channel)
      }

      async function test(channel) {
        setBusy(channel.id)
        try {
          const result = await command('channel.test', { channelId: channel.id })
          notify(result.detail === '' ? t('channels.testSuccess') : tr(t, 'channels.testDetail', { detail: result.detail }))
        } catch (error) {
          notify(channelErrorText(t, error), 'error')
        } finally {
          setBusy('')
        }
      }

      async function toggle(channel) {
        try {
          await command('channel.update', { channelId: channel.id, status: channel.status === 'active' ? 'paused' : 'active' })
          notify(t('toast.channelUpdated'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      async function rotateBridge(channel) {
        try {
          const result = await command('channel.rotateSecret', { channelId: channel.id })
          notify(t('toast.secretRotated'))
          openSetup(channel, result.secrets ?? {})
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      function remove(channel) {
        confirm({
          title: t('channels.delete'),
          body: tr(t, 'channels.deleteConfirm', { name: channel.name }),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('channel.delete', { channelId: channel.id })
              notify(t('toast.channelDeleted'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      const editingChannel = editing === 'new' ? null : channels.find((channel) => channel.id === editing)

      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('channels.title')),
            h('p', { className: 'imoPageSub' }, t('channels.subtitle')),
          ),
          h('div', { className: 'imoPageActions' },
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setPickerOpen(true) }, h(Icon, { name: 'plus', size: 13 }), t('channels.add')),
          ),
        ),
        h('div', { className: 'imoChannelSummary' },
          [
            { key: 'active', icon: 'play', value: active, label: t('channels.summaryActive'), tone: 'lead' },
            { key: 'connected', icon: 'checkCircle', value: connected, label: t('channels.summaryConnected'), tone: 'success' },
            { key: 'errors', icon: 'alert', value: errors, label: t('channels.summaryErrors'), tone: errors > 0 ? 'bad' : '' },
            { key: 'platforms', icon: 'plug', value: platforms.length, label: t('channels.summaryPlatforms'), tone: '' },
          ].map((stat) => h('div', { key: stat.key, className: `imoChannelStat ${stat.tone === 'lead' ? 'lead' : ''}`.trim() },
            h('div', { className: 'imoChannelStatTop' },
              h('span', { className: `imoMetricIcon ${stat.tone}`.trim() }, h(Icon, { name: stat.icon, size: 14 })),
              h('div', null,
                h('div', { className: 'imoChannelStatValue' }, String(stat.value)),
                h('div', { className: 'imoChannelStatLabel' }, stat.label),
              ),
            ),
          )),
        ),
        channels.length === 0
          ? h('div', null,
            h('div', { className: 'imoWelcome' },
              h('div', { className: 'imoWelcomeIcon' }, h(Icon, { name: 'inbox', size: 20 })),
              h('h2', { className: 'imoWelcomeTitle' }, t('channels.welcomeTitle')),
              h('p', { className: 'imoWelcomeBody' }, t('channels.welcomeBody')),
              h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setPickerOpen(true), style: { height: 36, padding: '0 15px' } }, h(Icon, { name: 'plus', size: 14 }), t('channels.add')),
              h('div', { className: 'imoWelcomeSteps' },
                [
                  [t('channels.welcomeStep1'), t('channels.welcomeStep1Body')],
                  [t('channels.welcomeStep2'), t('channels.welcomeStep2Body')],
                  [t('channels.welcomeStep3'), t('channels.welcomeStep3Body')],
                ].map(([title, body], index) => h('div', { key: title, className: 'imoWelcomeStep' },
                  h('div', { className: 'imoWelcomeStepNumber' }, String(index + 1)),
                  h('div', { className: 'imoWelcomeStepTitle' }, title),
                  h('div', { className: 'imoWelcomeStepBody' }, body),
                )),
              ),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('channels.choosePlatform')),
              h('div', { className: 'imoPlatformGrid imoPlatformGridWelcome' }, platforms.slice(0, 6).map((platform) => h('button', {
                key: platform.id,
                type: 'button',
                className: 'imoPlatformCard',
                onClick: () => openNew(platform),
              },
              h(ChannelBadge, { platform }),
              h('span', { className: 'imoPlatformBody' },
                h('span', { className: 'imoPlatformName' }, localized(platform.label)),
                h('span', { className: 'imoPlatformCaption' }, localized(platform.caption)),
              )))),
            ),
          )
          : h('div', { className: 'imoChannelGrid' }, channels.map((channel) => {
            const platform = platformForChannel(channel, snapshot)
            const isQr = channel.type === 'whatsapp_qr' || channel.type === 'wechat_qr'
            return h('article', { key: channel.id, className: 'imoChannelCard' },
              h('div', { className: 'imoChannelHead' },
                h(ChannelBadge, { platform }),
                h('div', { className: 'imoChannelIdentity' },
                  h('div', { className: 'imoChannelName', title: channel.name }, channel.name),
                  h('div', { className: 'imoChannelCaption' }, channel.description || localized(platform.caption)),
                  h('div', { className: 'imoPlatformTags', style: { marginTop: 5 } },
                    h(Pill, { tone: platform.official ? 'brand' : '' }, platform.official ? t('channels.official') : t('channels.unofficial')),
                    h(Pill, {}, t(`channels.transport.${platform.transport}`)),
                    channel.runtime?.account ? h(Pill, {}, channel.runtime.account) : null,
                  ),
                ),
                h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' } },
                  h(Pill, { tone: channel.status === 'active' ? 'success' : 'warn' }, t(`channelStatus.${channel.status}`)),
                  h(ChannelHealthPill, { channel, t }),
                ),
              ),
              h('div', { className: 'imoChannelStats' },
                h('div', { className: 'imoChannelStatCell' }, h('div', { className: 'imoChannelStatNumber' }, String(channel.stats?.inbound ?? 0)), h('div', { className: 'imoChannelStatCaption' }, t('channels.inbound'))),
                h('div', { className: 'imoChannelStatCell' }, h('div', { className: 'imoChannelStatNumber' }, String(channel.stats?.outbound ?? 0)), h('div', { className: 'imoChannelStatCaption' }, t('channels.outbound'))),
                h('div', { className: 'imoChannelStatCell' }, h('div', { className: 'imoChannelStatNumber', style: { fontSize: 10.5, fontWeight: 500 } }, channel.stats?.lastInboundAt ? fmtRelative(channel.stats.lastInboundAt, t) : '—'), h('div', { className: 'imoChannelStatCaption' }, t('channels.lastInbound'))),
              ),
              platform.transport === 'gateway' || (channel.type === 'telegram' && channel.config?.mode !== 'webhook') || (channel.type === 'whatsapp_qr' && channel.config?.mode !== 'bridge')
                ? h('div', { className: 'imoHelp' }, platform.transport === 'gateway'
                  ? t('channels.gatewayNote')
                  : channel.type === 'whatsapp_qr' ? t('channels.embeddedNote') : t('channels.pollingNote'))
                : h('div', null,
                  h('div', { className: 'imoWebhookRow' },
                    h('code', { className: 'imoWebhookCode', title: channel.webhookPath }, channel.webhookPath),
                    h('button', { type: 'button', className: 'imoIconBtn', style: { width: 24, height: 24 }, title: t('channels.copyUrl'), 'aria-label': t('channels.copyUrl'), onClick: async () => { try { await copyText(`${window.location.origin}${channel.webhookPath}`); notify(t('channels.copied')) } catch { notify(t('error.generic'), 'error') } } }, h(Icon, { name: 'copy', size: 12 })),
                  ),
                ),
              channel.stats?.lastError ? h('div', { className: 'imoMsgError', title: channel.stats.lastError }, h(Icon, { name: 'alert', size: 11 }), channel.stats.lastError) : null,
              h('div', { className: 'imoChannelActions' },
                h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => openSetup(channel) }, h(Icon, { name: 'settings', size: 12 }), t('channels.setup')),
                h('button', { type: 'button', className: 'imoBtn imoBtnSm', disabled: busy === channel.id, onClick: () => { void test(channel) } }, busy === channel.id ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'activity', size: 12 }), t('channels.testConnection')),
                isQr ? h('button', { type: 'button', className: 'imoBtn imoBtnSm imoBtnPrimary', onClick: () => setQrChannel(channel) }, h(Icon, { name: 'qr', size: 12 }), t('channels.qrLogin')) : null,
                h('button', { type: 'button', className: 'imoIconBtn', title: channel.status === 'active' ? t('channels.pause') : t('channels.resume'), 'aria-label': channel.status === 'active' ? t('channels.pause') : t('channels.resume'), onClick: () => { void toggle(channel) } }, h(Icon, { name: channel.status === 'active' ? 'pause' : 'play', size: 13 })),
                h('button', { type: 'button', className: 'imoIconBtn', title: t('common.edit'), 'aria-label': t('common.edit'), onClick: () => openEdit(channel) }, h(Icon, { name: 'edit', size: 13 })),
                h('button', { type: 'button', className: 'imoIconBtn', title: t('channels.delete'), 'aria-label': t('channels.delete'), onClick: () => remove(channel) }, h(Icon, { name: 'trash', size: 13 })),
              ),
            )
          })),
        h('div', { className: 'imoHelp', style: { marginTop: 12, maxWidth: 860 } }, t('channels.setupNote')),

        pickerOpen
          ? h(PlatformPicker, { platforms, t, onPick: openNew, onClose: () => setPickerOpen(false) })
          : null,
        editing !== null
          ? h(ChannelModal, {
            channel: editingChannel,
            platform: editingPlatform,
            snapshot,
            t,
            command,
            notify,
            onClose: () => { setEditing(null); setEditingPlatform(null) },
            onCreated: (result, platform) => {
              openSetup(result.channel ?? {
                id: result.channelId,
                name: result.name ?? channelNameFallback(result, platform),
                type: result.type ?? platform.id,
                status: 'active',
                config: {},
                webhookPath: result.webhookPath,
                health: 'ready',
                stats: {},
                runtime: {},
              }, result.secrets ?? {})
            },
          })
          : null,
        setupChannel !== null
          ? h(SetupModal, {
            channel: setupChannel,
            snapshot,
            t,
            command,
            notify,
            initialSecrets: setupSecrets,
            onClose: () => setSetupChannel(null),
            onEdit: () => { const target = setupChannel; setSetupChannel(null); setEditingPlatform(platformForChannel(target, snapshot)); setEditing(target.id) },
            onQr: () => { const target = setupChannel; setSetupChannel(null); setQrChannel(target) },
            onRotate: () => { void rotateBridge(setupChannel) },
          })
          : null,
        qrChannel !== null
          ? h(QrModal, { channel: qrChannel, t, command, onClose: () => setQrChannel(null) })
          : null,
      )
    }

    /**
     * Human fallback for a newly created channel title.
     * @param {Record<string, any>} result - create result.
     * @param {Record<string, any>} platform - platform.
     * @returns {string} name.
     */
    function channelNameFallback(result, platform) {
      return result?.name ?? localized(platform.label)
    }

    /**
     * Platform chooser.
     * @param {Record<string, any>} props - platforms and callbacks.
     * @returns {import('react').ReactElement} dialog.
     */
    function PlatformPicker({ platforms, t, onPick, onClose }) {
      const [query, setQuery] = React.useState('')
      const q = query.trim().toLowerCase()
      const visible = platforms.filter((platform) => q === ''
        || [localized(platform.label), localized(platform.caption), platform.id].join(' ').toLowerCase().includes(q))
      return h(Modal, {
        title: t('channels.addTitle'),
        subtitle: t('channels.addSubtitle'),
        onClose,
        wide: true,
        footer: [h('button', { key: 'close', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.close'))],
      },
        h('div', { className: 'imoTopSearch', style: { maxWidth: 'none', marginBottom: 11 } },
          h(Icon, { name: 'search', size: 13 }),
          h('input', { value: query, onChange: (event) => setQuery(event.target.value), placeholder: t('common.search'), 'aria-label': t('common.search') }),
        ),
        visible.length === 0
          ? h('div', { className: 'imoSmall imoMuted' }, t('common.none'))
          : h('div', { className: 'imoPlatformGrid' }, visible.map((platform) => h('button', {
            key: platform.id,
            type: 'button',
            className: 'imoPlatformCard',
            onClick: () => onPick(platform),
          },
          h(ChannelBadge, { platform }),
          h('span', { className: 'imoPlatformBody' },
            h('span', { className: 'imoPlatformName' }, localized(platform.label)),
            h('span', { className: 'imoPlatformCaption' }, localized(platform.caption)),
            h('span', { className: 'imoPlatformTags' },
              h(Pill, { tone: platform.official ? 'brand' : '' }, platform.official ? t('channels.official') : t('channels.unofficial')),
              h(Pill, {}, t(`channels.transport.${platform.transport}`)),
              platform.capabilities?.includes('qr') ? h(Pill, {}, 'QR') : null,
            ),
          ),
          ))),
        h('div', { className: 'imoHelp', style: { marginTop: 10 } }, t('channels.choosePlatform')),
      )
    }

    /**
     * Create/edit a channel with platform-specific fields.
     * @param {Record<string, any>} props - channel, platform, services.
     * @returns {import('react').ReactElement} dialog.
     */
    function ChannelModal({ channel, platform, snapshot, t, command, notify, onClose, onCreated }) {
      const isNew = channel === null || channel === undefined
      const resolved = platform ?? platformForChannel(channel, snapshot)
      const [form, setForm] = React.useState({
        name: channel?.name ?? '',
        description: channel?.description ?? '',
        status: channel?.status ?? 'active',
        config: initialChannelConfig(resolved, channel),
      })
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        if (error !== '') document.querySelector('.imoModalBody')?.scrollTo({ top: 0, behavior: 'smooth' })
      }, [error])

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      function setConfig(key, value) {
        setForm((previous) => ({ ...previous, config: { ...previous.config, [key]: value } }))
      }

      async function save() {
        if (form.name.trim() === '') {
          setError(t('error.invalid-name'))
          return
        }
        for (const field of resolved.fields ?? []) {
          const isConfigured = field.secret && (channel?.configuredSecrets?.[field.key] === true)
          if (field.required && field.auto !== true && !isConfigured && String(form.config[field.key] ?? '').trim() === '') {
            setError(tr(t, 'channels.fieldMissing', { field: localized(field.label) }))
            return
          }
        }
        if (Array.isArray(resolved.requiresAny) && resolved.requiresAny.length > 0) {
          const any = resolved.requiresAny.some((key) => {
            const field = (resolved.fields ?? []).find((item) => item.key === key)
            return String(form.config[key] ?? '').trim() !== '' || (field?.secret === true && channel?.configuredSecrets?.[key] === true)
          })
          if (!any) {
            setError(tr(t, 'channels.fieldMissing', {
              field: resolved.requiresAny
                .map((key) => localized((resolved.fields ?? []).find((field) => field.key === key)?.label ?? key))
                .join(' / '),
            }))
            return
          }
        }
        setSaving(true)
        setError('')
        try {
          if (isNew) {
            const result = await command('channel.create', {
              name: form.name,
              description: form.description,
              status: form.status,
              type: resolved.id,
              config: form.config,
            })
            notify(t('toast.channelCreated'))
            onCreated(result, resolved)
          } else {
            await command('channel.update', {
              channelId: channel.id,
              name: form.name,
              description: form.description,
              status: form.status,
              config: form.config,
            })
            notify(t('toast.channelUpdated'))
          }
          onClose()
        } catch (reason) {
          setError(channelErrorText(t, reason))
        } finally {
          setSaving(false)
        }
      }

      return h(Modal, {
        title: isNew ? tr(t, 'channels.newConfig', { name: localized(resolved.label) }) : t('channels.configTitle'),
        subtitle: localized(resolved.caption),
        onClose,
        wide: true,
        footer: [
          h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.cancel')),
          h('button', { key: 'save', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void save() } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('channels.saveConfig')),
        ],
      },
        h('div', { style: { display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12 } },
          h(ChannelBadge, { platform: resolved, size: 42 }),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'imoPlatformName' }, localized(resolved.label)),
            h('div', { className: 'imoChannelCaption' }, localized(resolved.caption)),
          ),
        ),
        error !== '' ? h('div', { className: 'imoFormError', role: 'alert' }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
        Array.isArray(resolved.requiresAny) && resolved.requiresAny.length > 0
          ? h('div', { className: 'imoHelp', style: { marginBottom: 9 } }, `${t('channels.atLeastOne')}: ${resolved.requiresAny.map((key) => localized((resolved.fields ?? []).find((field) => field.key === key)?.label ?? key)).join(' / ')}`)
          : null,
        h('div', { className: 'imoFormGrid' },
          h(Field, { label: t('channels.name'), hint: t('channels.nameHint'), full: true },
            h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value), placeholder: localized(resolved.label), autoFocus: true }),
          ),
          h(Field, { label: t('channels.description'), full: true },
            h('input', { className: 'imoInput', value: form.description, onChange: (event) => setField('description', event.target.value), placeholder: localized(resolved.caption) }),
          ),
          ...(resolved.fields ?? []).filter((field) => resolved.id !== 'whatsapp_qr'
            || field.key === 'mode'
            || form.config.mode === 'bridge'
            || !['bridgeUrl', 'bridgeToken', 'sessionName'].includes(field.key)).map((field) => {
            const wide = field.key.endsWith('Url') || field.key === 'accessToken' || field.key === 'appSecret' || field.key === 'encodingAESKey'
            const configured = field.secret && channel?.configuredSecrets?.[field.key] === true
            let control
            if (field.type === 'select') {
              control = h('select', {
                className: 'imoInput',
                value: form.config[field.key] ?? '',
                onChange: (event) => setConfig(field.key, event.target.value),
              }, (field.options ?? []).map((option) => h('option', { key: option.value, value: option.value }, localized(option.label))))
            } else {
              control = h('input', {
                className: 'imoInput',
                type: field.type === 'password' ? 'password' : 'text',
                value: form.config[field.key] ?? '',
                onChange: (event) => setConfig(field.key, event.target.value),
                placeholder: configured ? t('channels.leaveBlank') : localized(field.placeholder),
                autoComplete: 'off',
                spellCheck: false,
              })
            }
            return h(Field, {
              key: field.key,
              label: `${localized(field.label)}${field.auto ? ` · ${t('channels.autoGenerated')}` : resolved.requiresAny?.includes(field.key) ? ` · ${t('channels.atLeastOneShort')}` : field.required ? ` · ${t('channels.required')}` : ` · ${t('channels.optional')}`}`,
              hint: configured ? `${t('channels.secretSet')} · ${t('channels.leaveBlank')}` : (field.auto ? t('channels.autoGeneratedHint') : localized(field.hint)),
              full: wide,
            }, control)
          }),
          h(Field, { label: t('channels.status') },
            h('select', { className: 'imoInput', value: form.status, onChange: (event) => setField('status', event.target.value) },
              h('option', { value: 'active' }, t('channelStatus.active')),
              h('option', { value: 'paused' }, t('channelStatus.paused')),
            ),
          ),
        ),
        h('div', { className: 'imoHelp', style: { marginTop: 10 } }, t('channels.setupNote')),
      )
    }

    /**
     * Setup instructions, endpoint, and credentials for one channel.
     * @param {Record<string, any>} props - channel, snapshot, services.
     * @returns {import('react').ReactElement} dialog.
     */
    function SetupModal({ channel, snapshot, t, command, notify, initialSecrets = {}, onClose, onEdit, onQr, onRotate }) {
      const platform = platformForChannel(channel, snapshot)
      const [revealed, setRevealed] = React.useState(false)
      const [secrets, setSecrets] = React.useState(initialSecrets)
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => { setSecrets(initialSecrets) }, [initialSecrets])
      const [error, setError] = React.useState('')
      const callback = channel.webhookPath ? `${window.location.origin}${channel.webhookPath}` : ''
      const isQr = platform.capabilities?.includes('qr') === true
      const isEmbeddedQr = channel.type === 'whatsapp_qr' && channel.config?.mode !== 'bridge'
      const isOutboundOnly = platform.transport === 'gateway' || (channel.type === 'telegram' && channel.config?.mode !== 'webhook') || isEmbeddedQr

      async function reveal() {
        if (revealed) {
          setRevealed(false)
          return
        }
        setBusy(true)
        setError('')
        try {
          const result = await command('channel.revealSecret', { channelId: channel.id })
          setSecrets(result.secrets ?? {})
          setRevealed(true)
        } catch (reason) {
          setError(errorText(t, reason))
        } finally {
          setBusy(false)
        }
      }

      async function copy(value) {
        try {
          await copyText(value)
          notify(t('channels.copied'))
        } catch {
          notify(t('error.generic'), 'error')
        }
      }

      async function testNow() {
        setBusy(true)
        setError('')
        try {
          const result = await command('channel.test', { channelId: channel.id })
          notify(result.detail === '' ? t('channels.testSuccess') : tr(t, 'channels.testDetail', { detail: result.detail }))
        } catch (reason) {
          setError(channelErrorText(t, reason))
        } finally {
          setBusy(false)
        }
      }

      const visibleConfig = { ...(channel.config ?? {}), ...(revealed ? secrets : {}) }
      const credentialRows = (platform.fields ?? []).filter((field) => {
        if (isEmbeddedQr && ['bridgeUrl', 'bridgeToken', 'sessionName'].includes(field.key)) return false
        if (field.secret) return revealed ? String(secrets[field.key] ?? '').length > 0 : channel.configuredSecrets?.[field.key] === true
        return String(channel.config?.[field.key] ?? '').length > 0
      })

      return h(Modal, {
        title: t('channels.setupTitle'),
        subtitle: `${channel.name} · ${localized(platform.label)}`,
        onClose,
        wide: true,
        footer: [
          h('button', { key: 'close', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.close')),
          isQr ? h('button', { key: 'qr', type: 'button', className: 'imoBtn imoBtnPrimary', onClick: onQr }, h(Icon, { name: 'qr', size: 13 }), t('channels.qrLogin')) : null,
          h('button', { key: 'test', type: 'button', className: 'imoBtn', disabled: busy, onClick: () => { void testNow() } }, busy ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'activity', size: 13 }), t('channels.testConnection')),
          h('button', { key: 'edit', type: 'button', className: 'imoBtn imoBtnPrimary', onClick: onEdit }, h(Icon, { name: 'edit', size: 13 }), t('channels.editConfig')),
        ],
      },
        error !== '' ? h('div', { className: 'imoFormError', role: 'alert' }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
        h('div', { className: 'imoSetupSection' },
          h('div', { className: 'imoSetupLabel' }, t('channels.callback')),
          isOutboundOnly
            ? h('div', { className: 'imoSetupNote' }, platform.transport === 'gateway'
              ? t('channels.noCallback')
              : isEmbeddedQr ? t('channels.embeddedNote') : t('channels.pollingNote'))
            : callback === ''
              ? h('div', { className: 'imoSetupNote' }, t('channels.noCallback'))
              : h('div', null,
                h('div', { className: 'imoSetupUrl' },
                  h('code', { className: 'imoSecretValue' }, callback),
                  h('button', { type: 'button', className: 'imoIconBtn', title: t('channels.copyUrl'), 'aria-label': t('channels.copyUrl'), onClick: () => { void copy(callback) } }, h(Icon, { name: 'copy', size: 13 })),
                ),
                h('div', { className: 'imoHelp', style: { marginTop: 4 } }, t('channels.callbackHint')),
              ),
        ),
        h('div', { className: 'imoSetupSection' },
          h('div', { className: 'imoSetupLabel' }, t('channels.setup')),
          h('ol', { className: 'imoSetupSteps' }, (platform.setup?.[UI_LANG] ?? platform.setup?.en ?? []).map((step, index) => h('li', { key: index }, step))),
          h('div', { className: 'imoProviderFoot', style: { marginTop: 8 } },
            h('a', { href: platform.docs, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary)' } }, t('channels.openDocs')),
            h('span', null, '·'),
            h('span', null, platform.official ? t('channels.official') : t('channels.unofficial')),
          ),
        ),
        h('div', { className: 'imoSetupSection' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' } },
            h('div', { className: 'imoSetupLabel', style: { marginBottom: 0, flex: 1 } }, t('channels.credentials')),
            h('button', { type: 'button', className: 'imoBtn imoBtnSm', disabled: busy, onClick: () => { void reveal() } }, h(Icon, { name: revealed ? 'eyeOff' : 'eye', size: 12 }), revealed ? t('channels.hideSecrets') : t('channels.showSecrets')),
            (isQr && !isEmbeddedQr) || channel.type === 'webhook' ? h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: onRotate }, h(Icon, { name: 'rotate', size: 12 }), t('channels.rotateBridge')) : null,
          ),
          credentialRows.length === 0
            ? h('div', { className: 'imoSetupNote' }, t('channels.noSecret'))
            : h('div', { className: 'imoCredGrid' }, credentialRows.map((field) => h('div', { key: field.key, className: 'imoCred' },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 3 } },
                h('div', { className: 'imoCredKey', style: { flex: 1 } }, localized(field.label)),
                revealed && String(visibleConfig[field.key] ?? '') !== ''
                  ? h('button', { type: 'button', className: 'imoIconBtn', style: { width: 19, height: 19 }, title: t('common.copy'), 'aria-label': t('common.copy'), onClick: () => { void copy(String(visibleConfig[field.key])) } }, h(Icon, { name: 'copy', size: 10 }))
                  : null,
              ),
              h('div', { className: 'imoCredValue' }, field.secret && !revealed ? '••••••••' : (visibleConfig[field.key] || '—')),
            ))),
          h('div', { className: 'imoHelp', style: { marginTop: 8 } }, t('channels.setupNote')),
        ),
      )
    }

    /**
     * QR login dialog with live status polling.
     * @param {Record<string, any>} props - channel and services.
     * @returns {import('react').ReactElement} dialog.
     */
    function QrModal({ channel, t, command, onClose }) {
      const [state, setState] = React.useState({ loading: true, status: 'disconnected', qrDataUrl: '', account: '', detail: '', error: '' })

      const load = React.useCallback(async (initial) => {
        setState((previous) => ({ ...previous, loading: true, error: initial ? '' : previous.error }))
        try {
          const result = await command(initial ? 'channel.qr' : 'channel.qrStatus', { channelId: channel.id })
          const detail = result.detail ?? ''
          const friendly = /fetch failed|failed to fetch/i.test(detail) ? t('channels.qrUnreachable') : detail
          setState({ loading: false, status: result.status ?? 'disconnected', qrDataUrl: result.qrDataUrl ?? '', account: result.account ?? '', detail: friendly, error: result.ok === false ? friendly : '' })
        } catch (error) {
          setState((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }, [channel.id, command])

      React.useEffect(() => {
        void load(true)
      }, [load])

      React.useEffect(() => {
        if (state.status === 'connected') return undefined
        const timer = setInterval(() => { void load(false) }, 3000)
        return () => clearInterval(timer)
      }, [load, state.status])

      const statusLabel = state.status === 'connected'
        ? t('channels.qrConnected')
        : state.status === 'waiting'
          ? t('channels.qrWaiting')
          : state.status === 'scanning'
            ? t('channels.qrScanning')
            : state.status === 'starting'
              ? t('channels.qrStarting')
              : state.status === 'error'
                ? t('channels.qrError')
                : t('channels.qrDisconnected')
      const tone = state.status === 'connected' ? 'success' : state.status === 'error' ? 'bad' : 'warn'

      return h(Modal, {
        title: t('channels.qrTitle'),
        subtitle: `${channel.name} · ${t('channels.qrSubtitle')}`,
        onClose,
        footer: [
          h('button', { key: 'close', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.close')),
          h('button', { key: 'refresh', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: state.loading, onClick: () => { void load(true) } }, state.loading ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'refresh', size: 13 }), t('channels.qrRefresh')),
        ],
      },
        h('div', { className: 'imoQrWrap' },
          state.qrDataUrl !== ''
            ? h('div', { className: 'imoQrFrame' }, h('img', { className: 'imoQrImage', src: state.qrDataUrl, alt: t('channels.qrTitle') }))
            : h('div', { className: 'imoQrFrame' }, state.loading ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'qr', size: 44 })),
          h('div', { className: 'imoQrStatus' }, h(Pill, { tone }, statusLabel), state.loading ? h('span', { className: 'imoSpinner' }) : null),
          state.account !== '' ? h('div', { className: 'imoTiny imoMuted' }, tr(t, 'channels.connectedAs', { name: state.account })) : null,
          state.error !== '' || (state.status === 'error' && state.detail !== '')
            ? h('div', { className: 'imoMsgError', style: { maxWidth: 360 } }, h(Icon, { name: 'alert', size: 11 }), state.error || state.detail)
            : state.qrDataUrl === '' && !state.loading
              ? h('div', { className: 'imoSetupNote', style: { maxWidth: 360 } }, t('channels.qrMissing'))
              : h('div', null,
                h('div', { className: 'imoSetupNote', style: { maxWidth: 360 } }, t('channels.qrHint')),
                state.detail !== '' ? h('div', { className: 'imoTiny imoMuted', style: { maxWidth: 360, marginTop: 4 } }, state.detail) : null,
              ),
        ),
      )
    }

    /**
     * Templates page and editor.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function TemplatesView({ snapshot, t, command, notify, confirm }) {
      const [search, setSearch] = React.useState('')
      const [editing, setEditing] = React.useState(null)
      const q = search.trim().toLowerCase()
      const templates = snapshot.templates.filter((template) =>
        q === '' || [template.name, template.shortcut, template.body].join(' ').toLowerCase().includes(q))
      const previewConversation = snapshot.conversations[0]
      const previewContact = previewConversation === undefined ? undefined : snapshot.contacts.find((contact) => contact.id === previewConversation.contactId)

      function remove(template) {
        confirm({
          title: t('templates.delete'),
          body: tr(t, 'templates.deleteConfirm', { name: template.name }),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('template.delete', { templateId: template.id })
              notify(t('toast.templateDeleted'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      function renderPreview(body) {
        if (previewConversation === undefined) return body
        return body
          .replaceAll('{{contact.name}}', previewContact?.name ?? 'there')
          .replaceAll('{{contact.handle}}', previewContact?.handle ?? '')
          .replaceAll('{{workspace.name}}', snapshot.workspace.name)
          .replaceAll('{{conversation.id}}', previewConversation.id)
          .replaceAll('{{agent.name}}', snapshot.agents.find((agent) => agent.id === snapshot.workspace.currentAgentId)?.name ?? '')
      }

      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('templates.title')),
            h('p', { className: 'imoPageSub' }, t('templates.subtitle')),
          ),
          h('div', { className: 'imoPageActions' },
            h('label', { className: 'imoTopSearch', style: { maxWidth: 240, height: 32 } },
              h(Icon, { name: 'search', size: 14 }),
              h('input', { value: search, onChange: (event) => setSearch(event.target.value), placeholder: t('templates.search'), 'aria-label': t('templates.search') }),
            ),
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setEditing('new') }, h(Icon, { name: 'plus', size: 13 }), t('templates.new')),
          ),
        ),
        h('div', { className: 'imoTiny imoMuted', style: { marginBottom: 8 } }, tr(t, 'templates.count', { n: templates.length })),
        templates.length === 0
          ? h('div', { className: 'imoSection' }, h(Empty, { icon: 'template', title: t('templates.emptyTitle'), body: t('templates.emptyBody'), action: h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', style: { marginTop: 8 }, onClick: () => setEditing('new') }, t('templates.new')) }))
          : h('div', { className: 'imoGrid' }, templates.map((template) => h('article', { key: template.id, className: 'imoCard' },
            h('div', { className: 'imoCardHead' },
              h('span', { className: 'imoBrandMark', style: { width: 32, height: 32, borderRadius: 9 } }, h(Icon, { name: 'template', size: 16 })),
              h('div', { style: { minWidth: 0, flex: 1 } },
                h('div', { className: 'imoCardTitle' }, template.name),
                h('div', { className: 'imoCardSub' }, template.shortcut || '—', ' · ', tr(t, 'templates.usage', { n: template.usageCount ?? 0 })),
              ),
            ),
            h('div', { className: 'imoBubble', style: { fontSize: 12, background: 'var(--dsw-alias-bg-base)' } }, renderPreview(template.body)),
            h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
              template.channelIds.length === 0 ? h(Pill, { tone: 'brand' }, t('templates.allChannels')) : template.channelIds.map((channelId) => {
                const channel = snapshot.channels.find((item) => item.id === channelId)
                return h(Pill, { key: channelId }, channel?.name ?? channelId)
              }),
              template.locale ? h(Pill, null, template.locale) : null,
            ),
            h('div', { className: 'imoCardActions' },
              h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => setEditing(template.id) }, h(Icon, { name: 'edit', size: 12 }), t('common.edit')),
              h('button', { type: 'button', className: 'imoIconBtn', title: t('templates.delete'), 'aria-label': t('templates.delete'), onClick: () => remove(template) }, h(Icon, { name: 'trash', size: 13 })),
            ),
          ))),
        editing !== null
          ? h(TemplateModal, {
            template: editing === 'new' ? null : snapshot.templates.find((item) => item.id === editing),
            snapshot,
            t,
            command,
            notify,
            onClose: () => setEditing(null),
          })
          : null,
      )
    }

    /**
     * Template create/edit dialog.
     * @param {Record<string, any>} props - template, snapshot, services.
     * @returns {import('react').ReactElement} dialog.
     */
    function TemplateModal({ template, snapshot, t, command, notify, onClose }) {
      const isNew = template === null || template === undefined
      const [form, setForm] = React.useState({
        name: template?.name ?? '',
        shortcut: template?.shortcut ?? '',
        body: template?.body ?? '',
        channelIds: template?.channelIds ?? [],
        locale: template?.locale ?? '',
      })
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')
      const previewConversation = snapshot.conversations[0]
      const previewContact = previewConversation === undefined ? undefined : snapshot.contacts.find((contact) => contact.id === previewConversation.contactId)
      const preview = form.body
        .replaceAll('{{contact.name}}', previewContact?.name ?? 'there')
        .replaceAll('{{contact.handle}}', previewContact?.handle ?? '')
        .replaceAll('{{workspace.name}}', snapshot.workspace.name)
        .replaceAll('{{conversation.id}}', previewConversation?.id ?? 'cnv_preview')
        .replaceAll('{{agent.name}}', snapshot.agents.find((agent) => agent.id === snapshot.workspace.currentAgentId)?.name ?? '')

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      async function save() {
        if (form.name.trim() === '') {
          setError(t('error.invalid-name'))
          return
        }
        if (form.body.trim() === '') {
          setError(t('error.empty-body'))
          return
        }
        setSaving(true)
        setError('')
        try {
          if (isNew) await command('template.create', form)
          else await command('template.update', { templateId: template.id, ...form })
          notify(t('toast.templateSaved'))
          onClose()
        } catch (reason) {
          setError(errorText(t, reason))
        } finally {
          setSaving(false)
        }
      }

      return h(Modal, {
        title: isNew ? t('templates.newTitle') : t('templates.editTitle'),
        subtitle: t('templates.subtitle'),
        wide: true,
        onClose,
        footer: [
          h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.cancel')),
          h('button', { key: 'save', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void save() } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('common.save')),
        ],
      },
        h('div', { className: 'imoFormGrid' },
          h(Field, { label: t('templates.name') }, h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value), placeholder: t('templates.namePlaceholder'), autoFocus: true })),
          h(Field, { label: t('templates.shortcut') }, h('input', { className: 'imoInput', value: form.shortcut, onChange: (event) => setField('shortcut', event.target.value), placeholder: t('templates.shortcutPlaceholder') })),
          h(Field, { label: t('templates.channels'), full: true },
            h('select', {
              className: 'imoInput',
              value: form.channelIds.length === 0 ? '' : form.channelIds[0],
              onChange: (event) => setField('channelIds', event.target.value === '' ? [] : [event.target.value]),
            }, h('option', { value: '' }, t('templates.allChannels')), snapshot.channels.map((channel) => h('option', { key: channel.id, value: channel.id }, channel.name))),
          ),
          h(Field, { label: t('templates.body'), hint: t('templates.bodyHint'), full: true }, h('textarea', { className: 'imoTextareaForm', value: form.body, onChange: (event) => setField('body', event.target.value), placeholder: t('templates.bodyPlaceholder') })),
          h(Field, { label: t('templates.locale'), full: true }, h('input', { className: 'imoInput', value: form.locale, onChange: (event) => setField('locale', event.target.value), placeholder: 'zh' })),
        ),
        error !== '' ? h('div', { className: 'imoSmall', style: { color: 'var(--dsw-alias-state-error-primary)', marginTop: 8 } }, error) : null,
        h('div', { className: 'imoSectionTitle', style: { marginTop: 12 } }, t('templates.preview')),
        h('div', { className: 'imoBubble', style: { background: 'var(--dsw-alias-bg-base)' } }, preview || t('common.noData')),
      )
    }

    /**
     * Broadcast page with delivery tracking.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function BroadcastsView({ snapshot, t, command, notify, confirm }) {
      const [editing, setEditing] = React.useState(null)
      const [busy, setBusy] = React.useState('')

      function audienceCount(broadcast) {
        return snapshot.contacts.filter((contact) => {
          if (broadcast.audienceTag !== '' && !contact.tags.includes(broadcast.audienceTag)) return false
          return (contact.identities ?? []).some((identity) => identity.channelId === broadcast.channelId)
        }).length
      }

      function send(broadcast) {
        const count = audienceCount(broadcast)
        confirm({
          title: t('broadcasts.send'),
          body: tr(t, 'broadcasts.sendConfirm', { n: count, name: broadcast.name }),
          confirmLabel: t('broadcasts.sendNow'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            setBusy(broadcast.id)
            try {
              await command('broadcast.send', { broadcastId: broadcast.id })
              notify(t('toast.broadcastSent'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            } finally {
              setBusy('')
            }
          },
        })
      }

      async function cancel(broadcast) {
        try {
          await command('broadcast.cancel', { broadcastId: broadcast.id })
          notify(t('toast.broadcastCancelled'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      function remove(broadcast) {
        confirm({
          title: t('broadcasts.delete'),
          body: tr(t, 'broadcasts.deleteConfirm', { name: broadcast.name }),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('broadcast.delete', { broadcastId: broadcast.id })
              notify(t('toast.broadcastDeleted'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('broadcasts.title')),
            h('p', { className: 'imoPageSub' }, t('broadcasts.subtitle')),
          ),
          h('div', { className: 'imoPageActions' },
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setEditing('new'), disabled: snapshot.channels.length === 0 }, h(Icon, { name: 'plus', size: 13 }), t('broadcasts.new')),
          ),
        ),
        snapshot.channels.length === 0
          ? h('div', { className: 'imoSection' }, h(Empty, { icon: 'megaphone', title: t('broadcasts.noChannels'), body: t('broadcasts.noChannelsBody') }))
          : snapshot.broadcasts.length === 0
            ? h('div', { className: 'imoSection' }, h(Empty, { icon: 'megaphone', title: t('broadcasts.emptyTitle'), body: t('broadcasts.emptyBody'), action: h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', style: { marginTop: 8 }, onClick: () => setEditing('new') }, t('broadcasts.new')) }))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, snapshot.broadcasts.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((broadcast) => {
              const channel = snapshot.channels.find((item) => item.id === broadcast.channelId)
              const total = Math.max(1, broadcast.stats.targeted ?? 0)
              const done = (broadcast.stats.sent ?? 0) + (broadcast.stats.failed ?? 0)
              return h('article', { key: broadcast.id, className: 'imoSection', style: { marginBottom: 0 } },
                h('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' } },
                  h('div', { style: { minWidth: 0, flex: 1 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' } },
                      h('strong', { style: { fontSize: 13.5 } }, broadcast.name),
                      h(Pill, { tone: broadcast.status === 'sent' ? 'success' : broadcast.status === 'failed' ? 'bad' : broadcast.status === 'scheduled' ? 'brand' : '' }, t(`broadcastStatus.${broadcast.status}`)),
                      channel ? h(Pill, null, channel.name) : null,
                      broadcast.audienceTag ? h(Pill, null, `#${broadcast.audienceTag}`) : h(Pill, null, t('broadcasts.audienceAll')),
                    ),
                    h('div', { className: 'imoCardSub', style: { marginTop: 3 } }, broadcast.body.length > 160 ? `${broadcast.body.slice(0, 160)}…` : broadcast.body),
                  ),
                  h('div', { className: 'imoStatsRow' },
                    h('div', null, h('div', { className: 'imoStatValue' }, String(broadcast.stats.targeted ?? 0)), h('div', { className: 'imoStatLabel' }, t('broadcasts.targeted'))),
                    h('div', null, h('div', { className: 'imoStatValue', style: { color: 'var(--dsw-alias-state-success-primary)' } }, String(broadcast.stats.sent ?? 0)), h('div', { className: 'imoStatLabel' }, t('broadcasts.sent'))),
                    h('div', null, h('div', { className: 'imoStatValue', style: { color: broadcast.stats.failed > 0 ? 'var(--dsw-alias-state-error-primary)' : undefined } }, String(broadcast.stats.failed ?? 0)), h('div', { className: 'imoStatLabel' }, t('broadcasts.failed'))),
                  ),
                ),
                broadcast.status === 'sending' || done > 0
                  ? h('div', { style: { marginTop: 9 } },
                    h('div', { className: 'imoSlaTrack' }, h('div', { className: 'imoBarFill', style: { width: `${Math.min(100, (done / total) * 100)}%` } })),
                    h('div', { className: 'imoTiny imoMuted', style: { marginTop: 4 } }, tr(t, 'broadcasts.progress', { sent: done, total: broadcast.stats.targeted ?? 0 })),
                  )
                  : null,
                broadcast.error ? h('div', { className: 'imoMsgError', style: { marginTop: 6 } }, h(Icon, { name: 'alert', size: 11 }), broadcast.error) : null,
                h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 9, flexWrap: 'wrap' } },
                  h('span', { className: 'imoTiny imoMuted' }, `${t('broadcasts.created')} ${fmtDateTime(broadcast.createdAt)}`, broadcast.scheduledAt ? ` · ${t('broadcasts.scheduledAt')} ${fmtDateTime(broadcast.scheduledAt)}` : '', broadcast.sentAt ? ` · ${t('broadcasts.sentAt')} ${fmtDateTime(broadcast.sentAt)}` : ''),
                  h('span', { style: { flex: 1 } }),
                  broadcast.status !== 'sending' && broadcast.status !== 'sent' && broadcast.status !== 'cancelled'
                    ? h('button', { type: 'button', className: 'imoBtn imoBtnSm imoBtnPrimary', disabled: busy === broadcast.id, onClick: () => send(broadcast) }, busy === broadcast.id ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'send', size: 12 }), t('broadcasts.sendNow'))
                    : null,
                  broadcast.status === 'scheduled' ? h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => { void cancel(broadcast) } }, t('broadcasts.cancel')) : null,
                  broadcast.status === 'draft' || broadcast.status === 'scheduled' ? h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => setEditing(broadcast.id) }, h(Icon, { name: 'edit', size: 12 }), t('broadcasts.edit')) : null,
                  broadcast.status !== 'sending' ? h('button', { type: 'button', className: 'imoIconBtn', title: t('broadcasts.delete'), 'aria-label': t('broadcasts.delete'), onClick: () => remove(broadcast) }, h(Icon, { name: 'trash', size: 13 })) : null,
                ),
              )
            })),
        editing !== null
          ? h(BroadcastModal, {
            broadcast: editing === 'new' ? null : snapshot.broadcasts.find((item) => item.id === editing),
            snapshot,
            t,
            command,
            notify,
            onClose: () => setEditing(null),
          })
          : null,
      )
    }

    /**
     * Convert an ISO timestamp for a datetime-local input.
     * @param {string|null|undefined} iso - timestamp.
     * @returns {string} local input value.
     */
    function localInput(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const offset = date.getTimezoneOffset() * 60_000
      return new Date(date.getTime() - offset).toISOString().slice(0, 16)
    }

    /**
     * Broadcast create/edit dialog.
     * @param {Record<string, any>} props - broadcast, snapshot, services.
     * @returns {import('react').ReactElement} dialog.
     */
    function BroadcastModal({ broadcast, snapshot, t, command, notify, onClose }) {
      const isNew = broadcast === null || broadcast === undefined
      const [form, setForm] = React.useState({
        name: broadcast?.name ?? '',
        channelId: broadcast?.channelId ?? snapshot.channels[0]?.id ?? '',
        audienceTag: broadcast?.audienceTag ?? '',
        body: broadcast?.body ?? '',
        scheduledAt: localInput(broadcast?.scheduledAt),
      })
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      async function save(schedule) {
        if (form.name.trim() === '') {
          setError(t('error.invalid-name'))
          return
        }
        if (form.body.trim() === '') {
          setError(t('error.empty-body'))
          return
        }
        if (form.channelId === '') {
          setError(t('broadcasts.noChannels'))
          return
        }
        setSaving(true)
        setError('')
        try {
          const payload = {
            name: form.name.trim(),
            channelId: form.channelId,
            audienceTag: form.audienceTag.trim(),
            body: form.body,
            scheduledAt: form.scheduledAt === '' ? null : new Date(form.scheduledAt).toISOString(),
          }
          let id = broadcast?.id
          if (isNew) {
            const result = await command('broadcast.create', payload)
            id = result.broadcastId
          } else {
            await command('broadcast.update', { broadcastId: broadcast.id, ...payload, ...(schedule ? {} : { status: 'draft' }) })
          }
          if (schedule) {
            if (form.scheduledAt === '') {
              setError(t('broadcasts.scheduledAt'))
              setSaving(false)
              return
            }
            await command('broadcast.schedule', { broadcastId: id, scheduledAt: new Date(form.scheduledAt).toISOString() })
            notify(t('toast.broadcastScheduled'))
          } else {
            notify(isNew ? t('toast.broadcastCreated') : t('toast.broadcastUpdated'))
          }
          onClose()
        } catch (reason) {
          setError(errorText(t, reason))
        } finally {
          setSaving(false)
        }
      }

      return h(Modal, {
        title: isNew ? t('broadcasts.createTitle') : t('broadcasts.editTitle'),
        subtitle: t('broadcasts.subtitle'),
        wide: true,
        onClose,
        footer: [
          h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.cancel')),
          h('button', { key: 'schedule', type: 'button', className: 'imoBtn', disabled: saving || form.scheduledAt === '', onClick: () => { void save(true) } }, h(Icon, { name: 'clock', size: 13 }), t('broadcasts.scheduleAction')),
          h('button', { key: 'save', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void save(false) } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('common.save')),
        ],
      },
        h('div', { className: 'imoFormGrid' },
          h(Field, { label: t('broadcasts.name'), full: true }, h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value), placeholder: t('broadcasts.namePlaceholder'), autoFocus: true })),
          h(Field, { label: t('broadcasts.channel') }, h('select', { className: 'imoInput', value: form.channelId, onChange: (event) => setField('channelId', event.target.value) }, snapshot.channels.map((channel) => h('option', { key: channel.id, value: channel.id }, channel.name)))),
          h(Field, { label: t('broadcasts.audience'), hint: t('broadcasts.audienceHint') }, h('input', { className: 'imoInput', value: form.audienceTag, onChange: (event) => setField('audienceTag', event.target.value), placeholder: t('broadcasts.tagPlaceholder') })),
          h(Field, { label: t('broadcasts.body'), full: true }, h('textarea', { className: 'imoTextareaForm', value: form.body, onChange: (event) => setField('body', event.target.value), placeholder: t('broadcasts.bodyPlaceholder') })),
          h(Field, { label: t('broadcasts.scheduledAt'), hint: t('broadcasts.scheduledHelp'), full: true }, h('input', { className: 'imoInput', type: 'datetime-local', value: form.scheduledAt, onChange: (event) => setField('scheduledAt', event.target.value) })),
        ),
        error !== '' ? h('div', { className: 'imoSmall', style: { color: 'var(--dsw-alias-state-error-primary)', marginTop: 8 } }, error) : null,
        h('div', { className: 'imoHelp', style: { marginTop: 8 } }, t('broadcasts.draftHelp')),
      )
    }

    /**
     * Automation list with enable/disable and rule editor.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function AutomationView({ snapshot, t, command, notify, confirm }) {
      const [editing, setEditing] = React.useState(null)

      async function toggle(automation) {
        try {
          await command('automation.update', { automationId: automation.id, enabled: !automation.enabled })
          notify(t('toast.automationSaved'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      function remove(automation) {
        confirm({
          title: t('automation.delete'),
          body: tr(t, 'automation.deleteConfirm', { name: automation.name }),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('automation.delete', { automationId: automation.id })
              notify(t('toast.automationDeleted'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      function conditionChips(automation) {
        const conditions = automation.conditions ?? {}
        const chips = []
        if (conditions.keyword) chips.push(`${t('automation.keyword')}: ${conditions.keyword}`)
        if (conditions.channelId) {
          const channel = snapshot.channels.find((item) => item.id === conditions.channelId)
          chips.push(channel?.name ?? conditions.channelId)
        }
        if (conditions.contactTag) chips.push(`#${conditions.contactTag}`)
        if (conditions.priority) chips.push(t(`priority.${conditions.priority}`))
        return chips
      }

      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('automation.title')),
            h('p', { className: 'imoPageSub' }, t('automation.subtitle')),
          ),
          h('div', { className: 'imoPageActions' },
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', onClick: () => setEditing('new') }, h(Icon, { name: 'plus', size: 13 }), t('automation.new')),
          ),
        ),
        h('div', { className: 'imoTiny imoMuted', style: { marginBottom: 8 } }, tr(t, 'automation.count', { n: snapshot.automations.length })),
        snapshot.automations.length === 0
          ? h('div', { className: 'imoSection' }, h(Empty, { icon: 'bolt', title: t('automation.emptyTitle'), body: t('automation.emptyBody'), action: h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', style: { marginTop: 8 }, onClick: () => setEditing('new') }, t('automation.new')) }))
          : h('div', { className: 'imoGrid' }, snapshot.automations.map((automation) => h('article', { key: automation.id, className: 'imoCard' },
            h('div', { className: 'imoCardHead' },
              h('span', { className: 'imoBrandMark', style: { width: 32, height: 32, borderRadius: 9 } }, h(Icon, { name: 'bolt', size: 16 })),
              h('div', { style: { minWidth: 0, flex: 1 } },
                h('div', { className: 'imoCardTitle' }, automation.name),
                h('div', { className: 'imoCardSub' }, t(`trigger.${automation.trigger}`), ' · ', tr(t, 'automation.runs', { n: automation.runCount ?? 0 })),
              ),
              h(Switch, { checked: automation.enabled, onChange: () => { void toggle(automation) }, label: t('automation.enabled') }),
            ),
            h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
              conditionChips(automation).length === 0 ? h(Pill, null, t('common.all')) : conditionChips(automation).map((chip, index) => h(Pill, { key: index, tone: 'brand' }, chip)),
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              (automation.actions ?? []).map((action, index) => h('div', { key: index, style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 } },
                h('span', { className: 'imoPill brand' }, t(`action.${action.type}`)),
                h('span', { className: 'imoEllipsis imoMuted', style: { flex: 1 } }, actionValueLabel(action, snapshot, t)),
              )),
            ),
            h('div', { className: 'imoCardActions' },
              h('span', { className: 'imoTiny imoMuted', style: { marginRight: 'auto' } }, automation.lastRunAt ? `${t('automation.lastRun')} ${fmtRelative(automation.lastRunAt, t)}` : t('common.never')),
              h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => setEditing(automation.id) }, h(Icon, { name: 'edit', size: 12 }), t('common.edit')),
              h('button', { type: 'button', className: 'imoIconBtn', title: t('automation.delete'), 'aria-label': t('automation.delete'), onClick: () => remove(automation) }, h(Icon, { name: 'trash', size: 13 })),
            ),
          ))),
        editing !== null
          ? h(AutomationModal, {
            automation: editing === 'new' ? null : snapshot.automations.find((item) => item.id === editing),
            snapshot,
            t,
            command,
            notify,
            onClose: () => setEditing(null),
          })
          : null,
      )
    }

    /**
     * Human-readable action value.
     * @param {Record<string, any>} action - action.
     * @param {Record<string, any>} snapshot - snapshot.
     * @param {Function} t - translator.
     * @returns {string} label.
     */
    function actionValueLabel(action, snapshot, t) {
      if (action.type === 'assign') {
        if (action.value === 'auto') return t('automation.assignAuto')
        return snapshot.agents.find((agent) => agent.id === action.value)?.name ?? action.value
      }
      if (action.type === 'priority') return t(`priority.${action.value}`)
      if (action.type === 'status') return t(`status.${action.value}`)
      if (action.type === 'snooze') return `${action.value} ${t('automation.minutes')}`
      return action.value
    }

    /**
     * Automation create/edit dialog.
     * @param {Record<string, any>} props - automation, snapshot, services.
     * @returns {import('react').ReactElement} dialog.
     */
    function AutomationModal({ automation, snapshot, t, command, notify, onClose }) {
      const isNew = automation === null || automation === undefined
      const [form, setForm] = React.useState({
        name: automation?.name ?? '',
        enabled: automation?.enabled ?? true,
        trigger: automation?.trigger ?? 'message.received',
        keyword: automation?.conditions?.keyword ?? '',
        channelId: automation?.conditions?.channelId ?? '',
        contactTag: automation?.conditions?.contactTag ?? '',
        priority: automation?.conditions?.priority ?? '',
        actions: (automation?.actions ?? [{ type: 'tag', value: '' }]).map((action) => ({ ...action })),
      })
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      function setAction(index, patch) {
        setForm((previous) => ({
          ...previous,
          actions: previous.actions.map((action, actionIndex) => actionIndex === index ? { ...action, ...patch } : action),
        }))
      }

      function defaultAction(type) {
        if (type === 'assign') return 'auto'
        if (type === 'priority') return 'high'
        if (type === 'status') return 'pending'
        if (type === 'snooze') return '60'
        return ''
      }

      async function save() {
        if (form.name.trim() === '') {
          setError(t('error.invalid-name'))
          return
        }
        if (form.actions.length === 0 || form.actions.some((action) => ['tag', 'reply'].includes(action.type) && action.value.trim() === '')) {
          setError(t('automation.noActions'))
          return
        }
        setSaving(true)
        setError('')
        try {
          const payload = {
            name: form.name.trim(),
            enabled: form.enabled,
            trigger: form.trigger,
            keyword: form.keyword,
            channelId: form.channelId,
            contactTag: form.contactTag,
            priority: form.priority,
            actions: form.actions,
          }
          if (isNew) await command('automation.create', payload)
          else await command('automation.update', { automationId: automation.id, ...payload })
          notify(t('toast.automationSaved'))
          onClose()
        } catch (reason) {
          setError(errorText(t, reason))
        } finally {
          setSaving(false)
        }
      }

      function valueControl(action, index) {
        if (action.type === 'assign') {
          return h('select', { className: 'imoInput', value: action.value, onChange: (event) => setAction(index, { value: event.target.value }) },
            h('option', { value: 'auto' }, t('automation.assignAuto')),
            snapshot.agents.map((agent) => h('option', { key: agent.id, value: agent.id }, agent.name)),
          )
        }
        if (action.type === 'priority') {
          return h('select', { className: 'imoInput', value: action.value, onChange: (event) => setAction(index, { value: event.target.value }) },
            ['low', 'normal', 'high', 'urgent'].map((value) => h('option', { key: value, value }, t(`priority.${value}`))))
        }
        if (action.type === 'status') {
          return h('select', { className: 'imoInput', value: action.value, onChange: (event) => setAction(index, { value: event.target.value }) },
            ['open', 'pending', 'resolved', 'snoozed'].map((value) => h('option', { key: value, value }, t(`status.${value}`))))
        }
        if (action.type === 'snooze') {
          return h('input', { className: 'imoInput', type: 'number', min: 1, max: 43200, value: action.value, onChange: (event) => setAction(index, { value: event.target.value }) })
        }
        if (action.type === 'reply') {
          return h('textarea', { className: 'imoTextareaForm', style: { minHeight: 48 }, value: action.value, onChange: (event) => setAction(index, { value: event.target.value }), placeholder: t('automation.replyPlaceholder') })
        }
        return h('input', { className: 'imoInput', value: action.value, onChange: (event) => setAction(index, { value: event.target.value }), placeholder: t('automation.valuePlaceholder') })
      }

      return h(Modal, {
        title: isNew ? t('automation.createTitle') : t('automation.editTitle'),
        subtitle: t('automation.subtitle'),
        wide: true,
        onClose,
        footer: [
          h('button', { key: 'cancel', type: 'button', className: 'imoBtn', onClick: onClose }, t('common.cancel')),
          h('button', { key: 'save', type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void save() } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('common.save')),
        ],
      },
        h('div', { className: 'imoFormGrid' },
          h(Field, { label: t('automation.name'), full: true }, h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value), placeholder: t('automation.namePlaceholder'), autoFocus: true })),
          h(Field, { label: t('automation.trigger') }, h('select', { className: 'imoInput', value: form.trigger, onChange: (event) => setField('trigger', event.target.value) },
            ['message.received', 'conversation.created', 'conversation.assigned'].map((value) => h('option', { key: value, value }, t(`trigger.${value}`))))),
          h(Field, { label: t('automation.enabled') }, h('label', { className: 'imoCheck', style: { height: 32 } }, h('input', { type: 'checkbox', checked: form.enabled, onChange: (event) => setField('enabled', event.target.checked) }), t('automation.enabled'))),
          h(Field, { label: t('automation.conditions') + ' · ' + t('automation.keyword'), hint: t('automation.triggerHint') }, h('input', { className: 'imoInput', value: form.keyword, onChange: (event) => setField('keyword', event.target.value), placeholder: t('automation.keywordPlaceholder') })),
          h(Field, { label: t('automation.contactTag') }, h('input', { className: 'imoInput', value: form.contactTag, onChange: (event) => setField('contactTag', event.target.value), placeholder: t('automation.contactTagPlaceholder') })),
          h(Field, { label: t('inbox.channel') }, h('select', { className: 'imoInput', value: form.channelId, onChange: (event) => setField('channelId', event.target.value) }, h('option', { value: '' }, t('common.all')), snapshot.channels.map((channel) => h('option', { key: channel.id, value: channel.id }, channel.name)))),
          h(Field, { label: t('automation.priority') }, h('select', { className: 'imoInput', value: form.priority, onChange: (event) => setField('priority', event.target.value) }, h('option', { value: '' }, t('common.all')), ['low', 'normal', 'high', 'urgent'].map((value) => h('option', { key: value, value }, t(`priority.${value}`))))),
        ),
        h('div', { className: 'imoSectionTitle', style: { marginTop: 14 } }, t('automation.actions')),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          form.actions.map((action, index) => h('div', { key: index, className: 'imoActionRow' },
            h('select', {
              className: 'imoInput',
              style: { width: 138, flex: 'none' },
              value: action.type,
              onChange: (event) => setAction(index, { type: event.target.value, value: defaultAction(event.target.value) }),
              'aria-label': t('automation.actionType'),
            }, ['assign', 'tag', 'priority', 'status', 'reply', 'snooze'].map((value) => h('option', { key: value, value }, t(`action.${value}`)))),
            h('div', { style: { flex: 1, minWidth: 120 } }, valueControl(action, index)),
            h('button', { type: 'button', className: 'imoIconBtn', title: t('automation.removeAction'), 'aria-label': t('automation.removeAction'), onClick: () => setForm((previous) => ({ ...previous, actions: previous.actions.filter((_, actionIndex) => actionIndex !== index) })) }, h(Icon, { name: 'x', size: 13 })),
          )),
        ),
        h('button', {
          type: 'button',
          className: 'imoBtn imoBtnSm',
          style: { marginTop: 8 },
          onClick: () => setForm((previous) => ({ ...previous, actions: [...previous.actions, { type: 'tag', value: '' }] })),
        }, h(Icon, { name: 'plus', size: 12 }), t('automation.addAction')),
        error !== '' ? h('div', { className: 'imoSmall', style: { color: 'var(--dsw-alias-state-error-primary)', marginTop: 8 } }, error) : null,
      )
    }

    /**
     * Analytics page.
     * @param {Record<string, any>} props - snapshot.
     * @returns {import('react').ReactElement} page.
     */
    function AnalyticsView({ snapshot, t }) {
      const analytics = snapshot.analytics
      const totals = analytics.totals
      const maxVolume = Math.max(1, ...analytics.volume.map((day) => day.total))
      const maxChannel = Math.max(1, ...analytics.channels.map((channel) => channel.inbound + channel.outbound))
      const maxAgent = Math.max(1, ...analytics.agents.map((agent) => agent.open))
      const kpis = [
        [t('analytics.open'), totals.open, t('analytics.performance')],
        [t('analytics.awaiting'), totals.awaiting, t('inbox.sla')],
        [t('analytics.breached'), totals.breached, t('analytics.performance')],
        [t('analytics.resolvedToday'), totals.resolvedToday, t('common.today')],
        [t('analytics.avgFirstResponse'), fmtDuration(totals.avgFirstResponseSeconds, t), t('analytics.responseTime')],
        [t('analytics.avgResolution'), fmtDuration(totals.avgResolutionSeconds, t), t('analytics.resolutionTime')],
        [t('analytics.messages7d'), totals.messages7d, t('analytics.totalMessages')],
        [t('analytics.contacts'), totals.contacts, t('nav.contacts')],
      ]
      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('analytics.title')),
            h('p', { className: 'imoPageSub' }, t('analytics.subtitle')),
          ),
          h('div', { className: 'imoPageActions' }, h(Pill, { tone: 'brand' }, fmtDateTime(analytics.generatedAt))),
        ),
        h('div', { className: 'imoKpis' }, kpis.map(([label, value, hint], index) => h('div', { key: index, className: `imoKpi ${index === 0 ? 'lead' : ''}`.trim() },
          h('div', { className: 'imoKpiValue' }, typeof value === 'number' ? String(value) : value),
          h('div', { className: 'imoKpiLabel' }, label),
          index === 0 ? h('div', { className: 'imoKpiHint' }, hint) : null,
        ))),
        h('div', { className: 'imoTwoCol' },
          h('section', { className: 'imoSection' },
            h('div', { className: 'imoSectionTitle' }, t('analytics.volume')),
            h('div', { className: 'imoChart' }, analytics.volume.map((day, index) => h('div', { key: day.date, className: 'imoChartCol', title: `${day.date}: ${day.total}` },
              h('div', { className: 'imoChartStack' },
                h('div', { className: 'imoChartIn', style: { height: `${(day.inbound / maxVolume) * 100}%` } }),
                h('div', { className: 'imoChartOut', style: { height: `${(day.outbound / maxVolume) * 100}%` } }),
              ),
              index % 2 === 0 ? h('span', { className: 'imoChartLabel' }, day.date.slice(5)) : h('span', { className: 'imoChartLabel' }, ''),
            ))),
            h('div', { className: 'imoLegend', style: { marginTop: 7 } },
              h('span', null, h('span', { className: 'imoLegendSwatch', style: { background: 'var(--dsw-alias-brand-primary)' } }), t('analytics.inbound')),
              h('span', null, h('span', { className: 'imoLegendSwatch', style: { background: 'color-mix(in srgb,var(--dsw-alias-label-primary) 22%,var(--dsw-alias-bg-layer-1))' } }), t('analytics.outbound')),
              h('span', { style: { marginLeft: 'auto' } }, t('analytics.volumeHint')),
            ),
          ),
          h('section', { className: 'imoSection' },
            h('div', { className: 'imoSectionTitle' }, t('analytics.byChannel')),
            analytics.channels.length === 0
              ? h('div', { className: 'imoSmall imoMuted' }, t('analytics.noData'))
              : h('div', { className: 'imoBars' }, analytics.channels.map((channel) => h('div', { key: channel.id, className: 'imoBarRow' },
                h('span', { className: 'imoEllipsis', title: channel.name }, channel.name),
                h('div', { className: 'imoBarTrack' }, h('div', { className: 'imoBarFill', style: { width: `${((channel.inbound + channel.outbound) / maxChannel) * 100}%` } })),
                h('span', { className: 'imoTiny imoMuted imoNowrap' }, `${channel.inbound} / ${channel.outbound}`),
              ))),
          ),
        ),
        h('div', { className: 'imoTwoCol', style: { marginTop: 14 } },
          h('section', { className: 'imoSection' },
            h('div', { className: 'imoSectionTitle' }, t('analytics.byAgent')),
            h('div', { className: 'imoTableWrap', style: { border: 'none' } },
              h('table', { className: 'imoTable', style: { minWidth: 420 } },
                h('thead', null, h('tr', null, h('th', null, t('contacts.name')), h('th', null, t('settings.availability')), h('th', null, t('analytics.agentOpen')), h('th', null, t('analytics.agentResolvedToday')), h('th', null, t('analytics.load')))),
                h('tbody', null, analytics.agents.map((agent) => h('tr', { key: agent.id },
                  h('td', null, h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, h(Avatar, { name: agent.name, hue: snapshot.agents.find((item) => item.id === agent.id)?.hue ?? 210, size: 'sm' }), agent.name)),
                  h('td', null, h(Pill, { tone: agent.availability === 'online' ? 'success' : agent.availability === 'busy' ? 'warn' : '' }, t(`availability.${agent.availability}`))),
                  h('td', null, String(agent.open)),
                  h('td', null, String(agent.resolvedToday)),
                  h('td', { style: { width: 130 } }, h('div', { className: 'imoBarTrack' }, h('div', { className: 'imoBarFill', style: { width: `${(agent.open / maxAgent) * 100}%` } }))),
                ))),
              ),
            ),
          ),
          h('section', { className: 'imoSection' },
            h('div', { className: 'imoSectionTitle' }, t('analytics.broadcasts')),
            h('div', { className: 'imoKpis', style: { gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'imoKpi' }, h('div', { className: 'imoKpiValue' }, String(analytics.broadcasts.delivered)), h('div', { className: 'imoKpiLabel' }, t('analytics.delivered'))),
              h('div', { className: 'imoKpi' }, h('div', { className: 'imoKpiValue', style: { color: analytics.broadcasts.failed > 0 ? 'var(--dsw-alias-state-error-primary)' : undefined } }, String(analytics.broadcasts.failed)), h('div', { className: 'imoKpiLabel' }, t('analytics.failed'))),
              h('div', { className: 'imoKpi' }, h('div', { className: 'imoKpiValue' }, String(analytics.broadcasts.scheduled)), h('div', { className: 'imoKpiLabel' }, t('analytics.scheduled'))),
              h('div', { className: 'imoKpi' }, h('div', { className: 'imoKpiValue' }, String(analytics.broadcasts.drafted)), h('div', { className: 'imoKpiLabel' }, t('analytics.drafted'))),
            ),
            h('div', { className: 'imoDivider' }),
            h('div', { className: 'imoInfoGrid' },
              h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(totals.channels)), h('div', { className: 'imoInfoLabel' }, t('analytics.channels'))),
              h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(totals.activeChannels)), h('div', { className: 'imoInfoLabel' }, t('analytics.activeChannels'))),
              h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(totals.unread)), h('div', { className: 'imoInfoLabel' }, t('analytics.unread'))),
              h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(totals.conversations)), h('div', { className: 'imoInfoLabel' }, t('inbox.title'))),
            ),
          ),
        ),
      )
    }

    /**
     * Workspace settings, team management, and data controls.
     * @param {Record<string, any>} props - snapshot and services.
     * @returns {import('react').ReactElement} page.
     */
    function SettingsView({ snapshot, t, command, notify, confirm }) {
      const workspace = snapshot.workspace
      const [form, setForm] = React.useState({
        name: workspace.name,
        timezone: workspace.timezone,
        defaultSlaMinutes: workspace.defaultSlaMinutes,
        autoAssign: workspace.autoAssign,
        autoTranslate: workspace.autoTranslate !== false,
        translationTarget: workspace.translationTarget || 'zh-CN',
        aiSuggestions: workspace.aiSuggestions !== false,
        botEnabled: workspace.bot?.enabled === true,
        botName: workspace.bot?.name ?? 'AI 接待',
        botGreeting: workspace.bot?.greeting ?? '',
        botInstructions: workspace.bot?.instructions ?? '',
        botHandoff: workspace.bot?.handoffKeywords ?? '人工,转人工,投诉,退款,human,agent',
        botMaxTurns: workspace.bot?.maxTurns ?? 12,
        start: workspace.businessHours.start,
        end: workspace.businessHours.end,
        days: workspace.businessHours.days,
      })
      const [saving, setSaving] = React.useState(false)
      const [member, setMember] = React.useState({ name: '', email: '', role: 'agent', availability: 'online' })
      const [adding, setAdding] = React.useState(false)
      const [phoneStatus, setPhoneStatus] = React.useState(null)
      const [phoneEntry, setPhoneEntry] = React.useState('public')
      const [phonePairing, setPhonePairing] = React.useState(null)
      const [phoneBusy, setPhoneBusy] = React.useState(false)
      const [phoneError, setPhoneError] = React.useState('')
      const [, setPhoneTick] = React.useState(0)
      const [upgrade, setUpgrade] = React.useState(null)
      const [upgradeBusy, setUpgradeBusy] = React.useState('')
      const [upgradeNote, setUpgradeNote] = React.useState('')

      const workspaceSignature = JSON.stringify([
        workspace.name,
        workspace.timezone,
        workspace.defaultSlaMinutes,
        workspace.autoAssign,
        workspace.autoTranslate,
        workspace.translationTarget,
        workspace.aiSuggestions,
        workspace.bot?.enabled,
        workspace.bot?.name,
        workspace.bot?.greeting,
        workspace.bot?.instructions,
        workspace.bot?.handoffKeywords,
        workspace.bot?.maxTurns,
        workspace.businessHours.start,
        workspace.businessHours.end,
        workspace.businessHours.days,
      ])
      const lastWorkspaceSignature = React.useRef('')
      React.useEffect(() => {
        if (lastWorkspaceSignature.current === workspaceSignature) return
        lastWorkspaceSignature.current = workspaceSignature
        setForm({
          name: workspace.name,
          timezone: workspace.timezone,
          defaultSlaMinutes: workspace.defaultSlaMinutes,
          autoAssign: workspace.autoAssign,
          autoTranslate: workspace.autoTranslate !== false,
          translationTarget: workspace.translationTarget || 'zh-CN',
          aiSuggestions: workspace.aiSuggestions !== false,
          botEnabled: workspace.bot?.enabled === true,
          botName: workspace.bot?.name ?? 'AI 接待',
          botGreeting: workspace.bot?.greeting ?? '',
          botInstructions: workspace.bot?.instructions ?? '',
          botHandoff: workspace.bot?.handoffKeywords ?? '人工,转人工,投诉,退款,human,agent',
          botMaxTurns: workspace.bot?.maxTurns ?? 12,
          start: workspace.businessHours.start,
          end: workspace.businessHours.end,
          days: workspace.businessHours.days,
        })
      }, [workspaceSignature])

      function setField(key, value) {
        setForm((previous) => ({ ...previous, [key]: value }))
      }

      function toggleDay(day) {
        setForm((previous) => ({
          ...previous,
          days: previous.days.includes(day) ? previous.days.filter((item) => item !== day) : [...previous.days, day].sort(),
        }))
      }

      async function saveSettings() {
        setSaving(true)
        try {
          await command('settings.update', {
            name: form.name,
            timezone: form.timezone,
            defaultSlaMinutes: Number(form.defaultSlaMinutes),
            autoAssign: form.autoAssign,
            autoTranslate: form.autoTranslate,
            translationTarget: form.translationTarget,
            aiSuggestions: form.aiSuggestions,
            bot: {
              enabled: form.botEnabled,
              name: form.botName,
              greeting: form.botGreeting,
              instructions: form.botInstructions,
              handoffKeywords: form.botHandoff,
              maxTurns: Number(form.botMaxTurns),
            },
            businessHours: { start: form.start, end: form.end, days: form.days },
          })
          notify(t('toast.settingsSaved'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        } finally {
          setSaving(false)
        }
      }

      async function addMember() {
        if (member.name.trim() === '') {
          notify(t('error.invalid-name'), 'error')
          return
        }
        setAdding(true)
        try {
          await command('agent.create', member)
          setMember({ name: '', email: '', role: 'agent', availability: 'online' })
          notify(t('toast.agentAdded'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        } finally {
          setAdding(false)
        }
      }

      async function updateAgent(agent, patch) {
        try {
          await command('agent.update', { agentId: agent.id, ...patch })
          notify(t('toast.agentUpdated'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      function removeAgent(agent) {
        confirm({
          title: t('settings.remove'),
          body: tr(t, 'settings.removeConfirm', { name: agent.name }),
          confirmLabel: t('common.remove'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('agent.delete', { agentId: agent.id })
              notify(t('toast.agentDeleted'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      function exitDemo() {
        confirm({
          title: t('settings.exitDemo'),
          body: t('settings.exitDemoConfirm'),
          confirmLabel: t('settings.exitDemo'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('demo.exit')
              notify(t('toast.demoExited'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      function clearAll() {
        confirm({
          title: t('settings.clearData'),
          body: t('settings.clearConfirm'),
          confirmLabel: t('settings.clearData'),
          cancelLabel: t('common.cancel'),
          onConfirm: async () => {
            try {
              await command('demo.clear')
              notify(t('toast.dataCleared'))
            } catch (error) {
              notify(errorText(t, error), 'error')
            }
          },
        })
      }

      /**
       * Call the plugin's own upgrade route. It is not a workspace command, so
       * it does not touch the snapshot and uses its own endpoint.
       * @param {'check'|'pull'} action - requested operation.
       * @returns {Promise<object>} result payload.
       */
      async function upgradeCall(action) {
        const response = await fetch(UPGRADE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok || body?.ok !== true) {
          const failure = new Error(body?.error?.message ?? `HTTP ${response.status}`)
          failure.code = body?.error?.code ?? `http-${response.status}`
          throw failure
        }
        return body.result ?? {}
      }

      /**
       * Talk to the phone-remote plugin's owner routes. The code is minted
       * server-side, so the page never holds pairing secrets it did not receive.
       * @param {string} path - absolute owner route.
       * @param {object} [body] - JSON body; omitted for GET.
       * @returns {Promise<object>} parsed payload.
       */
      async function phoneCall(path, body) {
        const response = await fetch(path, body === undefined
          ? { credentials: 'same-origin', headers: { accept: 'application/json' } }
          : {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
          })
        const data = await response.json().catch(() => null)
        if (!response.ok || (data && data.error)) {
          const failure = new Error(data?.error ?? `HTTP ${response.status}`)
          failure.status = response.status
          throw failure
        }
        return data ?? {}
      }

      async function loadPhoneStatus() {
        try {
          const data = await phoneCall('/api/phone-remote/status')
          setPhoneStatus(data)
          setPhoneError('')
          const running = (data.entries ?? []).filter((entry) => entry.phase === 'running')
          if (running.length > 0 && !running.some((entry) => entry.id === phoneEntry)) {
            setPhoneEntry(running[0].id)
          }
        } catch (error) {
          setPhoneStatus(null)
          setPhoneError(error.status === 404 ? t('phone.missing') : error.message)
        }
      }

      async function createPhonePairing() {
        setPhoneBusy(true)
        try {
          const data = await phoneCall('/api/phone-remote/pairing', { entry: phoneEntry })
          setPhonePairing(data.pairing ?? (data.pairings ?? [])[0] ?? null)
          setPhoneError('')
          await loadPhoneStatus()
        } catch (error) {
          setPhoneError(`${t('phone.failed')}: ${error.message}`)
        } finally {
          setPhoneBusy(false)
        }
      }

      async function loadUpgrade() {
        setUpgradeBusy('check')
        try {
          const result = await upgradeCall('check')
          setUpgrade(result.status ?? null)
          setUpgradeNote('')
        } catch (error) {
          setUpgradeNote(`${t('upgrade.failed')}: ${error.message}`)
        } finally {
          setUpgradeBusy('')
        }
      }

      async function runUpgrade() {
        setUpgradeBusy('pull')
        setUpgradeNote('')
        try {
          const result = await upgradeCall('pull')
          setUpgrade(result.status ?? null)
          setUpgradeNote(result.restartRequired ? t('upgrade.restart') : (result.message ?? ''))
          if (result.restartRequired) notify(t('upgrade.restart'))
        } catch (error) {
          setUpgradeNote(`${t('upgrade.failed')}: ${error.message}`)
          notify(errorText(t, error), 'error')
        } finally {
          setUpgradeBusy('')
        }
      }

      React.useEffect(() => {
        void loadUpgrade()
        void loadPhoneStatus()
      }, [])

      React.useEffect(() => {
        if (phonePairing === null) return undefined
        const timer = setInterval(() => setPhoneTick((value) => value + 1), 1_000)
        return () => clearInterval(timer)
      }, [phonePairing])

      return h('div', { className: 'imoPage' },
        h('div', { className: 'imoPageHead' },
          h('div', null,
            h('h1', { className: 'imoPageTitle' }, t('settings.title')),
            h('p', { className: 'imoPageSub' }, t('settings.subtitle')),
          ),
        ),
        h('div', { className: 'imoTwoCol' },
          h('div', null,
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('settings.workspace')),
              h('div', { className: 'imoFormGrid' },
                h(Field, { label: t('settings.workspaceName'), full: true }, h('input', { className: 'imoInput', value: form.name, onChange: (event) => setField('name', event.target.value) })),
                h(Field, { label: t('settings.timezone') }, h('input', { className: 'imoInput', value: form.timezone, onChange: (event) => setField('timezone', event.target.value), placeholder: 'Asia/Shanghai' })),
                h(Field, { label: t('settings.sla'), hint: t('settings.slaHint') }, h('input', { className: 'imoInput', type: 'number', min: 1, max: 1440, value: form.defaultSlaMinutes, onChange: (event) => setField('defaultSlaMinutes', event.target.value) })),
                h(Field, { label: t('settings.autoAssign'), full: true },
                  h('label', { className: 'imoCheck' }, h('input', { type: 'checkbox', checked: form.autoAssign, onChange: (event) => setField('autoAssign', event.target.checked) }), t('settings.autoAssignHint')),
                ),
                h(Field, { label: t('settings.businessHours'), full: true },
                  h('div', { className: 'imoInlineForm' },
                    h(Field, { label: t('settings.start') }, h('input', { className: 'imoInput', type: 'time', value: form.start, onChange: (event) => setField('start', event.target.value), style: { width: 110 } })),
                    h(Field, { label: t('settings.end') }, h('input', { className: 'imoInput', type: 'time', value: form.end, onChange: (event) => setField('end', event.target.value), style: { width: 110 } })),
                  ),
                ),
                h(Field, { label: t('settings.weekdays'), full: true },
                  h('div', { className: 'imoWeekdays' }, [1, 2, 3, 4, 5, 6, 7].map((day) => h('button', {
                    key: day,
                    type: 'button',
                    className: `imoWeekday ${form.days.includes(day % 7) ? 'imoWeekdayOn' : ''}`.trim(),
                    onClick: () => toggleDay(day % 7),
                    'aria-pressed': form.days.includes(day % 7),
                  }, t(`day.${day}`)))),
                ),
                h('div', { className: 'full', style: { borderTop: '.5px solid var(--dsw-alias-border-l1)', paddingTop: 10, marginTop: 2 } },
                  h('div', { className: 'imoSectionTitle', style: { marginBottom: 7 } }, h(Icon, { name: 'globe', size: 13 }), ' ', t('settings.intelligence')),
                  h('div', { className: 'imoFormGrid' },
                    h(Field, { label: t('settings.translationTarget'), hint: t('settings.translationTargetHint') },
                      h('input', { className: 'imoInput', value: form.translationTarget, onChange: (event) => setField('translationTarget', event.target.value), placeholder: 'zh-CN' }),
                    ),
                    h(Field, { label: t('settings.translation'), hint: t('settings.translationHint') },
                      h('label', { className: 'imoCheck' }, h('input', { type: 'checkbox', checked: form.autoTranslate, onChange: (event) => setField('autoTranslate', event.target.checked) }), t('settings.translationOn')),
                    ),
                    h(Field, { label: t('settings.ai'), hint: t('settings.aiHint'), full: true },
                      h('label', { className: 'imoCheck' }, h('input', { type: 'checkbox', checked: form.aiSuggestions, onChange: (event) => setField('aiSuggestions', event.target.checked) }), t('settings.aiOn')),
                    ),
                  ),
                  h('div', { className: 'imoSectionTitle', style: { marginTop: 12, marginBottom: 7 } }, h(Icon, { name: 'bolt', size: 13 }), ' ', t('settings.bot')),
                  h('div', { className: 'imoHelp', style: { marginBottom: 8 } }, t('settings.botHint')),
                  h('div', { className: 'imoFormGrid' },
                    h(Field, { label: t('settings.botEnabled') },
                      h('label', { className: 'imoCheck' }, h('input', { type: 'checkbox', checked: form.botEnabled, onChange: (event) => setField('botEnabled', event.target.checked) }), t('settings.botEnabledOn')),
                    ),
                    h(Field, { label: t('settings.botName') },
                      h('input', { className: 'imoInput', value: form.botName, onChange: (event) => setField('botName', event.target.value), placeholder: 'AI 接待' }),
                    ),
                    h(Field, { label: t('settings.botMaxTurns'), hint: t('settings.botMaxTurnsHint') },
                      h('input', { className: 'imoInput', type: 'number', min: 1, max: 100, value: form.botMaxTurns, onChange: (event) => setField('botMaxTurns', event.target.value) }),
                    ),
                    h(Field, { label: t('settings.botHandoff'), hint: t('settings.botHandoffHint') },
                      h('input', { className: 'imoInput', value: form.botHandoff, onChange: (event) => setField('botHandoff', event.target.value) }),
                    ),
                    h(Field, { label: t('settings.botGreeting'), full: true },
                      h('input', { className: 'imoInput', value: form.botGreeting, onChange: (event) => setField('botGreeting', event.target.value), placeholder: t('settings.botGreetingPlaceholder') }),
                    ),
                    h(Field, { label: t('settings.botInstructions'), hint: t('settings.botInstructionsHint'), full: true },
                      h('textarea', { className: 'imoTextareaForm', value: form.botInstructions, onChange: (event) => setField('botInstructions', event.target.value), placeholder: t('settings.botInstructionsPlaceholder') }),
                    ),
                  ),
                ),
              ),
              h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 } },
                h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', disabled: saving, onClick: () => { void saveSettings() } }, saving ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'check', size: 13 }), t('settings.save')),
              ),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('settings.team')),
              h('div', { className: 'imoHelp', style: { marginBottom: 9 } }, t('settings.teamHint')),
              snapshot.agents.length === 0
                ? h('div', { className: 'imoSmall imoMuted' }, t('settings.noTeam'))
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } }, snapshot.agents.map((agent) => h('div', { key: agent.id, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '.5px solid var(--dsw-alias-border-l1)', flexWrap: 'wrap' } },
                  h(Avatar, { name: agent.name, hue: agent.hue, size: 'sm' }),
                  h('div', { style: { minWidth: 120, flex: 1 } }, h('div', { style: { fontSize: 12.5, fontWeight: 600 } }, agent.name), h('div', { className: 'imoTiny imoMuted' }, agent.email || '—')),
                  h('select', { className: 'imoSelect', value: agent.role, onChange: (event) => { void updateAgent(agent, { role: event.target.value }) }, 'aria-label': t('settings.role') }, h('option', { value: 'admin' }, t('settings.roleAdmin')), h('option', { value: 'agent' }, t('settings.roleAgent'))),
                  h('select', { className: 'imoSelect', value: agent.availability, onChange: (event) => { void updateAgent(agent, { availability: event.target.value }) }, 'aria-label': t('settings.availability') }, ['online', 'busy', 'offline'].map((value) => h('option', { key: value, value }, t(`availability.${value}`)))),
                  agent.id !== workspace.currentAgentId ? h('button', { type: 'button', className: 'imoIconBtn', title: t('common.remove'), 'aria-label': t('common.remove'), onClick: () => removeAgent(agent) }, h(Icon, { name: 'trash', size: 13 })) : h(Pill, { tone: 'brand' }, t('settings.currentAgent')),
                ))),
              h('div', { className: 'imoDivider' }),
              h('div', { className: 'imoActionRow' },
                h(Field, { label: t('settings.memberName') }, h('input', { className: 'imoInput', value: member.name, onChange: (event) => setMember((previous) => ({ ...previous, name: event.target.value })) })),
                h(Field, { label: t('settings.memberEmail') }, h('input', { className: 'imoInput', type: 'email', value: member.email, onChange: (event) => setMember((previous) => ({ ...previous, email: event.target.value })) })),
                h(Field, { label: t('settings.role') }, h('select', { className: 'imoInput', value: member.role, onChange: (event) => setMember((previous) => ({ ...previous, role: event.target.value })) }, h('option', { value: 'agent' }, t('settings.roleAgent')), h('option', { value: 'admin' }, t('settings.roleAdmin')))),
                h(Field, { label: t('settings.availability') }, h('select', { className: 'imoInput', value: member.availability, onChange: (event) => setMember((previous) => ({ ...previous, availability: event.target.value })) }, ['online', 'busy', 'offline'].map((value) => h('option', { key: value, value }, t(`availability.${value}`))))),
                h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', disabled: adding || member.name.trim() === '', onClick: () => { void addMember() } }, adding ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'plus', size: 12 }), t('settings.addMember')),
              ),
            ),
            h('section', { className: 'imoSection imoDangerZone' },
              h('div', { className: 'imoSectionTitle imoDangerTitle' }, t('settings.danger')),
              h('div', { className: 'imoHelp', style: { marginBottom: 9 } }, t('settings.dangerHint')),
              h('div', { style: { display: 'flex', gap: 7, flexWrap: 'wrap' } },
                snapshot.demo ? h('button', { type: 'button', className: 'imoBtn', onClick: exitDemo }, h(Icon, { name: 'sparkles', size: 12 }), t('settings.exitDemo')) : null,
                h('button', { type: 'button', className: 'imoBtn imoBtnDanger', onClick: clearAll }, h(Icon, { name: 'trash', size: 12 }), t('settings.clearData')),
              ),
            ),
          ),
          h('div', null,
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('settings.plugin')),
              h('div', { className: 'imoInfoGrid' },
                h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, upgrade?.version || '—'), h('div', { className: 'imoInfoLabel' }, t('settings.version'))),
                h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, t('app.bridge')), h('div', { className: 'imoInfoLabel' }, t('settings.bridge'))),
                h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(snapshot.channels.length)), h('div', { className: 'imoInfoLabel' }, t('analytics.channels'))),
                h('div', { className: 'imoInfoCell' }, h('div', { className: 'imoInfoValue' }, String(snapshot.contacts.length)), h('div', { className: 'imoInfoLabel' }, t('analytics.contacts'))),
              ),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, h(Icon, { name: 'phone', size: 13 }), ' ', t('phone.title')),
              phoneStatus === null
                ? h('div', { className: 'imoSmall imoMuted' }, phoneError || t('phone.missing'))
                : h('div', null,
                  h('div', { className: 'imoHelp', style: { marginBottom: 8 } }, t('phone.hint')),
                  h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
                    (phoneStatus.entries ?? []).filter((entry) => entry.phase === 'running').map((entry) => h('button', {
                      key: entry.id,
                      type: 'button',
                      className: `imoBtn imoBtnSm ${phoneEntry === entry.id ? 'imoBtnPrimary' : ''}`.trim(),
                      onClick: () => { setPhoneEntry(entry.id); setPhonePairing(null) },
                    }, entry.label ?? entry.id)),
                  ),
                  h('div', { style: { display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' } },
                    h('button', {
                      type: 'button',
                      className: 'imoBtn imoBtnPrimary',
                      disabled: phoneBusy,
                      onClick: () => { void createPhonePairing() },
                    }, phoneBusy ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'qr', size: 12 }), phoneBusy ? t('phone.generating') : t('phone.generate')),
                    h('span', { className: 'imoTiny imoMuted' }, `${t('phone.devices')} ${phoneStatus.deviceCount ?? 0}`),
                  ),
                  phonePairing !== null
                    ? h('div', { style: { marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
                      phonePairing.qr ? h('img', {
                        src: phonePairing.qr,
                        alt: t('phone.title'),
                        style: { width: 148, height: 148, borderRadius: 10, background: '#fff', padding: 6, flex: 'none' },
                      }) : null,
                      h('div', { style: { flex: 1, minWidth: 180 } },
                        h('div', { className: 'imoCodeBox', style: { wordBreak: 'break-all', fontSize: 11 } }, phonePairing.url ?? ''),
                        h('div', { className: 'imoTiny imoMuted', style: { marginTop: 6 } },
                          `${t('phone.expires')} ${Math.max(0, Math.ceil(((phonePairing.expiresAt ?? 0) - Date.now()) / 1000))}s · ${t('phone.once')}`,
                        ),
                        h('div', { className: 'imoTiny imoMuted', style: { marginTop: 4 } }, t('phone.manage')),
                      ),
                    )
                    : null,
                  phoneError ? h('div', { className: 'imoHelp', style: { marginTop: 8, color: 'var(--dsw-alias-state-danger-primary, #c0392b)' } }, phoneError) : null,
                ),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, h(Icon, { name: 'bolt', size: 13 }), ' ', t('upgrade.title')),
              h('div', { className: 'imoSmall', style: { lineHeight: 1.6 } },
                upgrade === null
                  ? t('upgrade.unknown')
                  : upgrade.repo !== true
                    ? t('upgrade.notRepo')
                    : h('div', null,
                      h('div', null, `${upgrade.current?.short ?? '—'} · ${upgrade.current?.subject ?? ''}`),
                      h('div', { className: 'imoTiny imoMuted' },
                        `${t('upgrade.branch')} ${upgrade.branch ?? '—'} · `,
                        upgrade.behind > 0
                          ? `${upgrade.behind} ${t('upgrade.behind')}`
                          : upgrade.ahead > 0
                            ? `${upgrade.ahead} ${t('upgrade.ahead')}`
                            : upgrade.fetchError
                              ? upgrade.fetchError
                              : t('upgrade.upToDate'),
                      ),
                      upgrade.dirtyFiles?.length
                        ? h('div', { className: 'imoTiny', style: { color: 'var(--dsw-alias-state-warning-primary, #b07a00)', marginTop: 4 } }, t('upgrade.dirty'))
                        : null,
                    ),
              ),
              upgrade?.commits?.length
                ? h('div', { className: 'imoCodeBox', style: { marginTop: 8, maxHeight: 118, overflow: 'auto', whiteSpace: 'pre-wrap' } }, upgrade.commits.join('\n'))
                : null,
              upgradeNote ? h('div', { className: 'imoHelp', style: { marginTop: 8 } }, upgradeNote) : null,
              h('div', { style: { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 } },
                h('button', {
                  type: 'button',
                  className: 'imoBtn',
                  disabled: upgradeBusy !== '',
                  onClick: () => { void loadUpgrade() },
                }, upgradeBusy === 'check' ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'refresh', size: 12 }), upgradeBusy === 'check' ? t('upgrade.checking') : t('upgrade.check')),
                h('button', {
                  type: 'button',
                  className: 'imoBtn imoBtnPrimary',
                  disabled: upgradeBusy !== '' || upgrade?.canPull !== true,
                  onClick: () => { void runUpgrade() },
                }, upgradeBusy === 'pull' ? h('span', { className: 'imoSpinner' }) : h(Icon, { name: 'bolt', size: 12 }), upgradeBusy === 'pull' ? t('upgrade.pulling') : t('upgrade.pull')),
              ),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('settings.storage')),
              h('div', { className: 'imoSmall imoMuted', style: { lineHeight: 1.6 } }, t('settings.storageHint')),
              h('div', { className: 'imoCodeBox', style: { marginTop: 7 } }, snapshot.dataFile ?? 'Host profile data directory'),
            ),
            h('section', { className: 'imoSection' },
              h('div', { className: 'imoSectionTitle' }, t('app.currentAgent')),
              h('select', {
                className: 'imoInput',
                value: workspace.currentAgentId ?? '',
                onChange: async (event) => {
                  try {
                    await command('settings.update', { currentAgentId: event.target.value })
                    notify(t('toast.settingsSaved'))
                  } catch (error) {
                    notify(errorText(t, error), 'error')
                  }
                },
              }, h('option', { value: '' }, t('app.noAgent')), snapshot.agents.map((agent) => h('option', { key: agent.id, value: agent.id }, `${agent.name} · ${t(`availability.${agent.availability}`)}`))),
            ),
          ),
        ),
      )
    }

    /**
     * Full workspace page.
     * @param {{t: Function}} props - locale translator.
     * @returns {import('react').ReactElement} page.
     */
    /**
     * Inline mirror of `lib/team-inbox.mjs`: the client bundle only resolves
     * `require` of shared deps, so the mapping lives here too. Keep the two in
     * sync until @omni/core exists (see docs/ARCHITECTURE.md §9).
     * @param {string} token - team token.
     * @returns {Record<string, Function>} adapter bound to the same-origin proxy.
     */
    function createTeamInbox(token) {
      if (core && typeof core.createTeamInbox === 'function') {
        return core.createTeamInbox({ token, proxyPath: '/api/im-omni.saas' })
      }
      const call = async (path, init = {}) => {
        const response = await proxySaas(path, { method: init.method ?? 'GET', body: init.body, token })
        const body = await response.json()
        if (!response.ok) {
          const error = new Error(body?.error?.message ?? `HTTP ${response.status}`)
          error.code = body?.error?.code
          throw error
        }
        return body
      }
      const toConversation = (row) => ({
        id: row.id,
        channelId: row.channel_id,
        contactId: row.contact_id,
        subject: row.subject ?? '',
        status: row.status ?? 'open',
        priority: row.priority ?? 'normal',
        unread: Number(row.unread ?? 0),
        tags: Array.isArray(row.tags) ? row.tags : [],
        botPaused: row.bot_paused === true,
        muted: row.muted === true,
        lastInboundAt: row.last_inbound_at ?? null,
        updatedAt: row.updated_at ?? null,
        ownerId: row.owner_user_id ?? null,
        messages: [],
        team: true,
      })
      const toMessage = (row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
        body: row.body ?? '',
        at: row.created_at ?? row.at ?? null,
        status: row.status ?? 'sent',
        authorType: row.author_type === 'agent' ? 'agent' : 'contact',
        team: true,
      })
      return {
        async load(limits = {}) {
          const limit = Number(limits.limit ?? 30)
          const [conversations, contacts, channels] = await Promise.all([
            call(`/v1/conversations?limit=${limit}`),
            call('/v1/contacts'),
            call('/v1/channels'),
          ])
          const snapshot = {
            conversations: (conversations.items ?? []).map(toConversation),
            contacts: (contacts.items ?? []).map((row) => ({
              id: row.id, name: row.name ?? '', handle: row.handle ?? '', phone: row.phone ?? '',
              tags: Array.isArray(row.tags) ? row.tags : [], channelId: row.channel_id ?? null,
            })),
            channels: (channels.items ?? []).map((row) => ({
              id: row.id, name: row.name ?? '', type: row.type ?? 'webhook', status: row.status ?? 'active',
              runtime: { health: row.health ?? 'ready', lastError: '', qrStatus: 'disconnected', account: '' },
              stats: { inbound: 0, outbound: 0 }, config: {},
            })),
          }
          await Promise.all(snapshot.conversations.slice(0, Number(limits.messageLimit ?? 8)).map(async (conversation) => {
            try {
              const messages = await call(`/v1/conversations/${conversation.id}/messages`)
              conversation.messages = (messages.items ?? []).slice(-40).map(toMessage)
            } catch {
              conversation.messages = []
            }
          }))
          return snapshot
        },
        async read(conversationId) {
          await call(`/v1/conversations/${conversationId}/read`, { method: 'POST' })
        },
        async update(conversationId, fields) {
          const body = {}
          for (const key of ['status', 'priority', 'tags', 'muted', 'botPaused']) {
            if (fields[key] !== undefined) body[key] = fields[key]
          }
          if (Object.keys(body).length === 0) return
          await call(`/v1/conversations/${conversationId}`, { method: 'PATCH', body })
        },
        async send(conversationId, body) {
          const result = await call('/v1/messages', { method: 'POST', body: { conversationId, body } })
          return result.message ?? null
        },
      }
    }

    /**
     * Inbox backed by the team service: the lists arrive already filtered by the
     * member's permission, and every write hits the endpoint that re-checks it.
     * @param {{token: string}|null} session - signed-in session.
     * @returns {Record<string, any>} workspace-like object (`snapshot`, `command`, `refresh`).
     */
    function useTeamWorkspace(session) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const inboxRef = React.useRef(null)

      const refresh = React.useCallback(async () => {
        if (session === null) return
        try {
          const inbox = createTeamInbox(session.token)
          inboxRef.current = inbox
          const slice = await inbox.load()
          setSnapshot({
            ...slice,
            agents: [],
            templates: [],
            automations: [],
            broadcasts: [],
            events: [],
            workspace: { name: '', ownerId: null, bot: {}, notify: {} },
            meta: { revision: Date.now(), updatedAt: new Date().toISOString() },
          })
          setError(null)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }, [session])

      React.useEffect(() => {
        if (session === null) {
          setLoading(false)
          return
        }
        void refresh()
      }, [refresh, session])

      const command = React.useCallback(async (name, payload = {}) => {
        const inbox = inboxRef.current
        if (inbox === null) throw new Error('团队数据尚未加载')
        if (name === 'conversation.read') return inbox.read(payload.conversationId)
        if (name === 'conversation.update') return inbox.update(payload.conversationId, payload)
        if (name === 'conversation.bot') return inbox.update(payload.conversationId, { botPaused: payload.paused })
        if (name === 'message.send') return inbox.send(payload.conversationId, payload.body ?? payload.text ?? '')
        throw new Error('这个操作还在本机模式下，尚未接入团队服务')
      }, [])

      return { snapshot, loading, error, offline: false, command, refresh, intelligence: null }
    }

    /** Where the panel keeps the team token between reloads. */
    const TOKEN_KEY = 'im-omni.session'

    /**
     * The panel opens on a login gate: no token, no inbox. The token is validated
     * against the team service, and the resulting role decides what is offered.
     * @returns {{ready: boolean, session: null|{token: string, role: string, tenantId: string, name: string}, signIn: Function, signOut: Function, error: string, busy: boolean}} gate state.
     */
    function useSession() {
      const [state, setState] = React.useState({ ready: false, session: null, error: '', busy: false })

      const validate = React.useCallback(async (token) => {
        try {
          const response = await proxySaas('/v1/me', { token })
          const body = await response.json()
          if (!response.ok || body === null) throw new Error(body?.error?.message ?? '登录已失效')
          const tenant = body.tenants.find((item) => item.tenant_id === body.currentTenant) ?? body.tenants[0]
          if (tenant === undefined) throw new Error('这个账号还没有加入任何团队')
          return { token, role: tenant.role, tenantId: tenant.tenant_id, name: body.user?.name ?? body.user?.email ?? '' }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        const stored = (() => {
          try { return window.localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' }
        })()
        if (stored === '') {
          setState((current) => ({ ...current, ready: true }))
          return () => { alive = false }
        }
        void validate(stored).then((result) => {
          if (!alive) return
          if (result.error !== undefined) {
            try { window.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
            setState({ ready: true, session: null, error: result.error, busy: false })
            return
          }
          setState({ ready: true, session: result, error: '', busy: false })
        })
        return () => { alive = false }
      }, [validate])

      const signIn = React.useCallback(async (email, password) => {
        setState((current) => ({ ...current, busy: true, error: '' }))
        try {
          const login = await proxySaas('/v1/auth/login', { method: 'POST', body: { email, password } })
          const body = await login.json()
          if (!login.ok) throw new Error(body?.error?.message ?? `HTTP ${login.status}`)
          const result = await validate(body.accessToken)
          if (result.error !== undefined) throw new Error(result.error)
          try { window.localStorage.setItem(TOKEN_KEY, body.accessToken) } catch { /* ignore */ }
          setState({ ready: true, session: result, error: '', busy: false })
        } catch (error) {
          setState((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }, [validate])

      const signOut = React.useCallback(() => {
        try { window.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
        setState({ ready: true, session: null, error: '', busy: false })
      }, [])

      return { ...state, signIn, signOut }
    }

    /**
     * Login screen shown before the inbox when there is no valid team session.
     * @param {{onSubmit: Function, busy: boolean, error: string}} props - gate props.
     * @returns {import('react').ReactElement} login view.
     */
    function LoginGate({ onSubmit, busy, error }) {
      const [email, setEmail] = React.useState('')
      const [password, setPassword] = React.useState('')
      return h('div', { className: 'imoRoot imoGate' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'imoGateCard' },
          h('div', { className: 'imoGateHead' },
            h('h1', { className: 'imoGateTitle' }, '登录团队'),
            h('p', { className: 'imoGateSub' }, '用团队账号登录；打开后能看到什么，由你在团队里的权限决定。'),
          ),
          h('label', { className: 'imoFieldGroup' },
            h('span', { className: 'imoFieldLabel' }, '邮箱'),
            h('input', {
              className: 'imoInput',
              value: email,
              autoFocus: true,
              onChange: (event) => setEmail(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') void onSubmit(email, password) },
            }),
          ),
          h('label', { className: 'imoFieldGroup' },
            h('span', { className: 'imoFieldLabel' }, '密码'),
            h('input', {
              className: 'imoInput',
              type: 'password',
              value: password,
              onChange: (event) => setPassword(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') void onSubmit(email, password) },
            }),
          ),
          h('button', {
            type: 'button',
            className: 'imoBtn imoBtnPrimary imoGateSubmit',
            disabled: busy,
            onClick: () => { void onSubmit(email, password) },
          }, busy ? '登录中…' : '登录'),
          error === '' ? null : h('p', { className: 'imoSmall imoGateError' }, error),
          h('p', { className: 'imoTiny imoMuted imoGateHint' }, '权限范围（可见号码、可做操作）由团队服务返回，前端只按结果渲染。'),
        ),
      )
    }

    /**
     * Keep a render error readable instead of leaving the panel blank.
     */
    class AppBoundary extends React.Component {
      /** @param {Record<string, any>} props - children. */
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      /**
       * Capture a descendant render error.
       * @param {Error} error - thrown error.
       * @returns {{error: Error}} next state.
       */
      static getDerivedStateFromError(error) {
        return { error }
      }

      /**
       * Log the failure for the browser console.
       * @param {Error} error - thrown error.
       * @param {{componentStack?: string}} info - React info.
       */
      componentDidCatch(error, info) {
        if (typeof console !== 'undefined') console.error('[im-omni] panel crashed:', error, info?.componentStack)
      }

      /** @returns {import('react').ReactNode} children or a readable failure. */
      render() {
        if (this.state.error === null) return this.props.children
        const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
        return h('div', { className: 'imoRoot', style: { padding: 24 } },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'imoGateCard' },
            h('h1', { className: 'imoGateTitle' }, '面板加载出错'),
            h('p', { className: 'imoGateSub' }, message),
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary imoGateSubmit', onClick: () => { window.location.reload() } }, '重新加载'),
            h('p', { className: 'imoTiny imoMuted imoGateHint' }, '详情见浏览器 Console；把这段文字发我即可定位。'),
          ),
        )
      }
    }

    function App({ t }) {
      const gate = useSession()
      const hostWorkspace = useWorkspace()
      const teamWorkspace = useTeamWorkspace(gate.session)
      const workspace = gate.session === null ? hostWorkspace : teamWorkspace
      const [tab, setTab] = React.useState('inbox')
      const [search, setSearch] = React.useState('')
      const [selectedId, setSelectedId] = React.useState(null)
      const [toast, setToast] = React.useState(null)
      const [confirmState, setConfirmState] = React.useState(null)
      const [focusContactId, setFocusContactId] = React.useState(null)

      const notify = React.useCallback((text, tone = 'success') => {
        setToast({ id: Date.now(), text, tone })
      }, [])

      React.useEffect(() => {
        if (toast === null) return undefined
        const timer = setTimeout(() => setToast(null), 4200)
        return () => clearTimeout(timer)
      }, [toast])

      function confirm(request) {
        setConfirmState({
          title: request.title,
          body: request.body,
          confirmLabel: request.confirmLabel ?? t('common.confirm'),
          cancelLabel: request.cancelLabel ?? t('common.cancel'),
          onConfirm: request.onConfirm,
          danger: request.danger,
        })
      }

      async function changeAgent(agentId) {
        try {
          await workspace.command('settings.update', { currentAgentId: agentId })
          notify(t('toast.settingsSaved'))
        } catch (error) {
          notify(errorText(t, error), 'error')
        }
      }

      function openContact(contactId) {
        setTab('contacts')
        setFocusContactId(contactId)
      }

      function openConversation(conversationId) {
        setTab('inbox')
        setSelectedId(conversationId)
      }

      if (workspace.loading) {
        return h('div', { className: 'imoRoot' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'imoLoading' }, h('span', { className: 'imoSpinner' }), t('app.loading')),
        )
      }

      if (workspace.snapshot === null) {
        return h('div', { className: 'imoRoot' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'imoLoading', style: { flexDirection: 'column', textAlign: 'center' } },
            h('span', { className: 'imoEmptyIcon' }, h(Icon, { name: 'alert', size: 20 })),
            h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('app.loadError')),
            h('div', { className: 'imoSmall imoMuted', style: { maxWidth: 360 } }, t('app.loadErrorBody')),
            workspace.error ? h('div', { className: 'imoTiny imoMuted' }, workspace.error) : null,
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', style: { marginTop: 8 }, onClick: () => { void workspace.refresh(false) } }, t('app.retry')),
          ),
        )
      }

      if (!gate.ready) {
        return h('div', { className: 'imoRoot imoGate' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('p', { className: 'imoSmall imoMuted' }, '正在确认登录状态…'),
        )
      }

      if (gate.session === null) {
        return h(LoginGate, { onSubmit: gate.signIn, busy: gate.busy, error: gate.error })
      }

      const canManage = gate.session.role === 'owner' || gate.session.role === 'admin'
      const allowed = canManage ? true : !['channels', 'automation', 'broadcasts'].includes(tab)
      if (!allowed) {
        // A role that cannot open this tab always lands on the inbox.
        queueMicrotask(() => setTab('inbox'))
      }

      const snapshot = workspace.snapshot
      const unread = snapshot.conversations.reduce((sum, conversation) => sum + (conversation.unread ?? 0), 0)
      let page
      if (tab === 'contacts') {
        page = h(ContactsView, {
          snapshot,
          t,
          command: workspace.command,
          notify,
          confirm,
          focusContactId,
          setFocusContactId,
          onOpenConversation: openConversation,
        })
      } else if (tab === 'channels') {
        page = h(ChannelsView, { snapshot, t, command: workspace.command, notify, confirm })
      } else if (tab === 'templates') {
        page = h(TemplatesView, { snapshot, t, command: workspace.command, notify, confirm })
      } else if (tab === 'broadcasts') {
        page = h(BroadcastsView, { snapshot, t, command: workspace.command, notify, confirm })
      } else if (tab === 'automation') {
        page = h(AutomationView, { snapshot, t, command: workspace.command, notify, confirm })
      } else if (tab === 'analytics') {
        page = h(AnalyticsView, { snapshot, t })
      } else if (tab === 'settings') {
        page = h(SettingsView, { snapshot, t, command: workspace.command, notify, confirm })
      } else {
        page = h(InboxView, {
          snapshot,
          t,
          search,
          selectedId,
          setSelectedId,
          command: workspace.command,
          intelligence: workspace.intelligence,
          notify,
          confirm,
          onOpenContact: openContact,
        })
      }

      return h('div', { className: 'imoRoot' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(TopBar, {
          snapshot,
          t,
          search,
          onSearch: setSearch,
          onAgent: (agentId) => { void changeAgent(agentId) },
          onRefresh: () => { void workspace.refresh(false) },
          offline: workspace.offline,
        }),
        h(TabBar, { tab, onTab: setTab, t, unread, role: gate.session.role, name: gate.session.name, onSignOut: gate.signOut }),
        h('main', { className: 'imoContent' }, page),
        toast !== null
          ? h('div', { className: `imoToast ${toast.tone}`.trim(), role: toast.tone === 'error' ? 'alert' : 'status' },
            toast.tone === 'error' ? h(Icon, { name: 'alert', size: 14 }) : h(Icon, { name: 'checkCircle', size: 14 }),
            h('span', { style: { flex: 1 } }, toast.text),
            h('button', { type: 'button', className: 'imoIconBtn', style: { width: 22, height: 22 }, onClick: () => setToast(null), 'aria-label': t('common.close') }, h(Icon, { name: 'x', size: 12 })),
          )
          : null,
        h(ConfirmDialog, { request: confirmState, onClose: () => setConfirmState(null) }),
      )
    }

    /**
     * Sidebar panel glyph. The shell owns the button, label, and tooltip.
     * @param {{size: number, active: boolean}} props - requested edge and selection state.
     * @returns {import('react').ReactElement} icon.
     */
    function PanelIcon({ size }) {
      return h(Icon, { name: 'bridge', size })
    }

    /** Client services used by this plugin. */
    const inject = ['slots', 'locale']


    /**
     * Configuration contributed to this plugin's page in the plugin manager.
     * Reads and writes the same Host API the panel uses, so the two surfaces
     * never disagree about a value.
     * @returns {import('react').ReactElement} the section.
     */
    function PluginConfigSection() {
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const [saving, setSaving] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [form, setForm] = React.useState(null)
      const [upgrade, setUpgrade] = React.useState(null)
      const [upgradeBusy, setUpgradeBusy] = React.useState('')
      const [upgradeNote, setUpgradeNote] = React.useState('')
      const [confirming, setConfirming] = React.useState(false)
      const [hints, setHints] = React.useState([])
      const [failure, setFailure] = React.useState(null)
      const [copied, setCopied] = React.useState('')
      const [copyFallback, setCopyFallback] = React.useState(false)
      const [saas, setSaas] = React.useState({
        email: '',
        password: '',
        token: '',
        tenantId: '',
        role: '',
        me: null,
        members: [],
        channels: [],
        approvals: 0,
        pending: [],
        busy: '',
        error: '',
      })

      const saasLogin = React.useCallback(async () => {
        setSaas((current) => ({ ...current, busy: 'login', error: '' }))
        try {
          const response = await proxySaas('/v1/auth/login', { method: 'POST', body: { email: saas.email, password: saas.password } })
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
          const me = await proxySaas('/v1/me', { token: body.accessToken }).then((item) => item.json())
          const tenant = me.tenants.find((item) => item.tenant_id === me.currentTenant) ?? me.tenants[0]
          const token = body.accessToken
          const [members, channels, approvals, notifySettings, workspaceSettings] = await Promise.all([
            proxySaas(`/v1/tenants/${tenant.tenant_id}/members`, { token }).then((item) => item.json()),
            proxySaas('/v1/channels', { token }).then((item) => item.json()),
            proxySaas(`/v1/tenants/${tenant.tenant_id}/approvals?status=all`, { token }).then((item) => (item.ok ? item.json() : { items: [] })),
            proxySaas('/v1/settings/notify', { token }).then((item) => item.json()),
            proxySaas('/v1/settings/workspace', { token }).then((item) => item.json()),
          ])
          const notify = notifySettings.notify ?? {}
          const workspaceDefaults = workspaceSettings.settings ?? {}
          setForm((current) => (current === null ? current : {
            ...current,
            notifyEnabled: notify.enabled === true,
            webhook: notify.webhookMasked !== undefined && notify.webhookMasked !== '' ? '' : (notify.wecomWebhook ?? ''),
            quietStart: notify.quietStart ?? current.quietStart,
            quietEnd: notify.quietEnd ?? current.quietEnd,
            linkTemplate: notify.linkTemplate ?? current.linkTemplate,
            sla: String(workspaceDefaults.defaultSlaMinutes ?? current.sla),
            autoAssign: workspaceDefaults.autoAssign === true,
            autoTranslate: workspaceDefaults.autoTranslate !== false,
            translationTarget: workspaceDefaults.translationTarget ?? current.translationTarget,
            aiSuggestions: workspaceDefaults.aiSuggestions !== false,
          }))
          setSaas((current) => ({
            ...current,
            busy: '',
            token,
            tenantId: tenant.tenant_id,
            role: tenant.role,
            me: me.user,
            members: members.items ?? [],
            channels: channels.items ?? [],
            approvals: (approvals.items ?? []).filter((item) => item.status === 'pending').length,
            pending: (approvals.items ?? []).filter((item) => item.status === 'pending'),
          }))
        } catch (error) {
          setSaas((current) => ({ ...current, busy: '', error: error instanceof Error ? error.message : String(error) }))
        }
      }, [saas.email, saas.password])

      /**
       * Reload the roster the SaaS API reports for the signed-in member.
       * @returns {Promise<void>} nothing.
       */
      const saasRefresh = React.useCallback(async () => {
        if (saas.token === '' || saas.tenantId === '') return
        const [members, channels, approvals] = await Promise.all([
          proxySaas(`/v1/tenants/${saas.tenantId}/members`, { token: saas.token }).then((item) => item.json()),
          proxySaas('/v1/channels', { token: saas.token }).then((item) => item.json()),
          proxySaas(`/v1/tenants/${saas.tenantId}/approvals?status=all`, { token: saas.token }).then((item) => (item.ok ? item.json() : { items: [] })),
        ])
        setSaas((current) => ({
          ...current,
          members: members.items ?? [],
          channels: channels.items ?? [],
          approvals: (approvals.items ?? []).filter((item) => item.status === 'pending').length,
          pending: (approvals.items ?? []).filter((item) => item.status === 'pending'),
        }))
      }, [saas.token, saas.tenantId])

      /**
       * Change one member's visibility, asking for the email before a tenant-wide grant.
       * @param {Record<string, any>} member - roster row.
       * @param {{dataScope?: string, channelIds?: string[]}} patch - requested change.
       * @returns {Promise<void>} nothing.
       */
      const saasGrant = React.useCallback(async (member, patch) => {
        if (saas.token === '') return
        const body = { ...patch }
        if (body.dataScope === 'all') {
          const typed = window.prompt(`把 ${member.name || member.email} 设成整个团队？输入对方邮箱确认：`, '')
          if (typed === null) return
          body.confirmEmail = typed.trim()
        }
        try {
          const response = await proxySaas(`/v1/tenants/${saas.tenantId}/members/${member.user_id}`, { method: 'PATCH', body, token: saas.token })
          const payload = await response.json().catch(() => null)
          if (response.status === 202) {
            setSaas((current) => ({ ...current, error: '', approvals: current.approvals + 1 }))
            return
          }
          if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          await saasRefresh()
        } catch (error) {
          setSaas((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }))
        }
      }, [saas.token, saas.tenantId, saasRefresh])

      /**
       * Approve or reject a pending request as the owner.
       * @param {string} id - approval id.
       * @param {'approve'|'reject'} decision - what to do.
       * @returns {Promise<void>} nothing.
       */
      const saasDecide = React.useCallback(async (id, decision) => {
        if (saas.token === '') return
        try {
          const response = await proxySaas(`/v1/tenants/${saas.tenantId}/approvals/${id}`, { method: 'POST', body: { decision }, token: saas.token })
          if (!response.ok) {
            const payload = await response.json().catch(() => null)
            throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          }
          await saasRefresh()
        } catch (error) {
          setSaas((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }))
        }
      }, [saas.token, saas.tenantId, saasRefresh])

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(STATE_PATH, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          const payload = await response.json().catch(() => null)
          if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          setState(payload.state)
          const workspace = payload.state.workspace
          setForm({
            demo: workspace.demo !== false,
            notifyEnabled: workspace.notify?.enabled === true,
            webhook: workspace.notify?.wecomWebhook ?? '',
            quietStart: workspace.notify?.quietStart ?? '',
            quietEnd: workspace.notify?.quietEnd ?? '',
            linkTemplate: workspace.notify?.linkTemplate ?? '',
            sla: String(workspace.defaultSlaMinutes ?? 30),
            autoAssign: workspace.autoAssign === true,
            autoTranslate: workspace.autoTranslate !== false,
            translationTarget: workspace.translationTarget ?? 'zh-CN',
            aiSuggestions: workspace.aiSuggestions !== false,
          })
          setError('')
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const upgradeCall = React.useCallback(async (action) => {
        const response = await fetch(UPGRADE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok || body?.ok !== true) {
          const failure = new Error(body?.error?.message ?? `HTTP ${response.status}`)
          failure.code = body?.error?.code ?? `http-${response.status}`
          throw failure
        }
        return body.result ?? {}
      }, [])

      const checkUpgrade = React.useCallback(async () => {
        setUpgradeBusy('check')
        setUpgradeNote('')
        try {
          const result = await upgradeCall('check')
          setUpgrade(result.status ?? null)
        } catch (error) {
          setUpgradeNote(`检查失败：${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setUpgradeBusy('')
        }
      }, [upgradeCall])

      React.useEffect(() => { void checkUpgrade() }, [checkUpgrade])

      const copy = React.useCallback(async (text) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(text)
          setTimeout(() => setCopied(''), 1500)
        } catch {
          setCopied('')
          setCopyFallback(true)
        }
      }, [])

      const pullUpgrade = React.useCallback(async () => {
        setUpgradeBusy('pull')
        setUpgradeNote('')
        try {
          const result = await upgradeCall('pull')
          setFailure(null)
          if (result.status !== undefined) setUpgrade(result.status)
          const short = result.status?.current?.short
          setUpgradeNote(result.restartRequired
            ? `已更新${short === undefined ? '' : `到 ${short}`}，重启 DSH 后生效。`
            : (result.message ?? ''))
          setHints(result.restartRequired ? (result.restartHints ?? []) : [])
          setConfirming(false)
        } catch (error) {
          setUpgradeNote(`更新失败：${error instanceof Error ? error.message : String(error)}`)
          setHints([])
          setFailure({ code: error?.code ?? 'unknown', message: error instanceof Error ? error.message : String(error) })
        } finally {
          setUpgradeBusy('')
        }
      }, [upgradeCall])

      const run = React.useCallback(async (label, action, payload) => {
        setSaving(label)
        setNotice('')
        setError('')
        try {
          const response = await fetch(COMMAND_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action, payload }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || body?.ok !== true) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
          if (body.state !== undefined) setState(body.state)
          setNotice(`${label}已保存`)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setSaving('')
        }
      }, [])

      if (error !== '' && state === null) {
        return h('div', { className: 'imCfg' }, h('p', { className: 'imCfgNote' }, `配置加载失败：${error}`))
      }
      if (state === null || form === null) {
        return h('div', { className: 'imCfg' }, h('p', { className: 'imCfgNote' }, '正在读取插件配置…'))
      }

      const workspace = state.workspace ?? {}
      const channels = Array.isArray(state.channels) ? state.channels : []
      const agents = Array.isArray(state.agents) ? state.agents : []
      const currentAgent = agents.find((agent) => agent.id === workspace.currentAgentId)
      const role = currentAgent === undefined ? 'owner' : workspace.ownerId === currentAgent.id ? 'owner' : currentAgent.role === 'admin' ? 'admin' : 'agent'
      const canConfigure = role === 'owner' || role === 'admin'

      const saveNotify = async () => {
        if (saas.token !== '') {
          try {
            const response = await proxySaas('/v1/settings/notify', {
              method: 'PUT',
              token: saas.token,
              body: {
                enabled: form.notifyEnabled,
                wecomWebhook: form.webhook,
                quietStart: form.quietStart,
                quietEnd: form.quietEnd,
                linkTemplate: form.linkTemplate,
              },
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
            setNotice('通知默认值已保存到团队')
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error))
          }
          return
        }
        return run('通知默认值', 'workspace.update', {
        notify: {
          enabled: form.notifyEnabled,
          wecomWebhook: form.webhook,
          quietStart: form.quietStart,
          quietEnd: form.quietEnd,
          linkTemplate: form.linkTemplate,
        },
      })
      }

      const saveReception = async () => {
        if (saas.token !== '') {
          try {
            const response = await proxySaas('/v1/settings/workspace', {
              method: 'PATCH',
              token: saas.token,
              body: {
                defaultSlaMinutes: Number(form.sla) || 30,
                autoAssign: form.autoAssign,
                autoTranslate: form.autoTranslate,
                translationTarget: form.translationTarget,
                aiSuggestions: form.aiSuggestions,
              },
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
            setNotice('接待默认值已保存到团队')
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error))
          }
          return
        }
        return run('接待默认值', 'workspace.update', {
        defaultSlaMinutes: Number(form.sla) || 30,
        autoAssign: form.autoAssign,
        autoTranslate: form.autoTranslate,
        translationTarget: form.translationTarget,
        aiSuggestions: form.aiSuggestions,
      })
      }

      return h('div', { className: 'imCfg' },
        h('div', { className: 'imCfgHead' },
          h('div', null,
            h('h2', { className: 'imCfgTitle' }, '插件配置'),
            h('p', { className: 'imCfgSub' }, '这里的改动立即作用于全渠道 IM 面板，两个入口读写同一份 Host 状态。'),
          ),
        ),
        notice === '' ? null : h('p', { className: `imCfgToast ${error === '' ? '' : 'bad'}`.trim() }, notice),
        error === '' ? null : h('p', { className: 'imCfgToast bad' }, error),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' },
            h('h3', { className: 'imCfgGroupTitle' }, '在线升级'),
            h('span', { className: 'imCfgGroupNote' }, upgrade === null ? '检查中' : upgrade.installKind === 'git' ? `分支 ${upgrade.branch ?? '—'}` : '打包安装'),
          ),
          h('div', { className: 'imCfgRow' },
            h('div', { className: 'imCfgRowMain' },
              h('span', { className: 'imCfgRowTitle' }, upgrade === null ? '正在检查版本…' : `当前 v${upgrade.version ?? '—'}${upgrade.current?.short ? ` · ${upgrade.current.short}` : ''}`),
              h('span', { className: 'imCfgRowNote' }, upgradeNote !== '' ? upgradeNote : (upgrade?.message ?? '尚未检查')),
            ),
            h('div', { className: 'imCfgActions' },
              h('span', { className: 'imCfgStatus' },
                h('span', { className: `imCfgDot ${upgrade?.behind > 0 || (upgrade?.dirtyFiles?.length ?? 0) > 0 ? 'paused' : ''}`.trim() }),
                upgrade === null ? '检查中' : upgrade.behind > 0 ? `${upgrade.behind} 个提交待拉取` : upgrade.dirtyFiles?.length > 0 ? '工作区有改动' : '已是最新',
              ),
              h('button', {
                type: 'button',
                className: 'imoBtn imoBtnSm',
                disabled: upgradeBusy !== '',
                onClick: () => { void checkUpgrade() },
              }, upgradeBusy === 'check' ? '检查中…' : '检查更新'),
              confirming
                ? h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => setConfirming(false) }, '取消')
                : null,
              h('button', {
                type: 'button',
                className: 'imoBtn imoBtnSm imoBtnPrimary',
                disabled: upgradeBusy !== '' || upgrade === null || upgrade.canPull !== true,
                onClick: () => {
                  if (confirming) void pullUpgrade()
                  else setConfirming(true)
                },
              }, upgradeBusy === 'pull' ? '升级中…' : confirming ? '确认升级' : '一键升级'),
            ),
          ),
          confirming && upgrade !== null
            ? h('div', { className: 'imCfgConfirm' },
              h('p', { className: 'imCfgConfirmTitle' }, `将从 ${upgrade.current?.short ?? '当前提交'} 更新到远程 ${upgrade.branch ?? ''} 的最新提交，拉取 ${upgrade.behind ?? 0} 个提交。`),
              h('p', { className: 'imCfgNote' }, '升级会替换宿主代码，完成后需要重启 DSH；工作区有未提交改动时会被拒绝。'),
            )
            : null,
          (upgrade?.dirtyFiles?.length ?? 0) > 0
            ? h('div', { className: 'imCfgDirty' },
              h('p', { className: 'imCfgNote' }, `工作区有 ${upgrade.dirtyFiles.length} 个未提交改动，升级会被拒绝：`),
              upgrade.dirtyFiles.slice(0, 5).map((file) => h('code', { key: file, className: 'imCfgDirtyFile' }, file)),
            )
            : null,
          failure !== null
            ? h('div', { className: 'imCfgFailure' },
              h('p', { className: 'imCfgGroupTitle' }, '这次没升成，怎么处理'),
              failure.code === 'dirty-worktree' || (upgrade?.dirtyFiles?.length ?? 0) > 0
                ? h('div', { className: 'imCfgHintRow' },
                  h('span', { className: 'imCfgHintLabel' }, '先收起本地改动，再升级'),
                  h('code', { className: 'imCfgHintCommand' }, 'git stash push -u -m "im-omni: before upgrade"'),
                  h('button', { type: 'button', className: 'imCfgCopy', onClick: () => { void copy('git stash push -u -m "im-omni: before upgrade"') } }, '复制'),
                )
                : null,
              failure.code === 'fetch-failed'
                ? h('div', { className: 'imCfgHintRow' },
                  h('span', { className: 'imCfgHintLabel' }, '远程不可达时手动检查'),
                  h('code', { className: 'imCfgHintCommand' }, 'git fetch --all --prune'),
                  h('button', { type: 'button', className: 'imCfgCopy', onClick: () => { void copy('git fetch --all --prune') } }, '复制'),
                )
                : null,
              upgrade?.current?.sha !== undefined
                ? h('div', { className: 'imCfgHintRow' },
                  h('span', { className: 'imCfgHintLabel' }, '已经拉到一半时，回滚到升级前（会丢弃本地未提交改动）'),
                  h('code', { className: 'imCfgHintCommand' }, `git reset --hard ${upgrade.current.sha}`),
                  h('button', { type: 'button', className: 'imCfgCopy', onClick: () => { void copy(`git reset --hard ${upgrade.current.sha}`) } }, '复制'),
                )
                : null,
            )
            : null,
          (() => {
            // The workspace keeps its own list; the event stream is only a fallback
            // for workspaces that upgraded before the list existed.
            const upgrades = Array.isArray(workspace.upgrades) ? workspace.upgrades : []
            const rows = upgrades.length > 0
              ? upgrades.slice(-3).reverse().map((item) => ({
                key: item.id,
                text: `插件更新 ${item.from} → ${item.to}`,
                note: typeof item.changedFiles === 'number' ? `${item.changedFiles} 个文件` : '',
                at: item.at,
              }))
              : (Array.isArray(state.events) ? state.events : [])
                .filter((event) => event.type === 'plugin.upgraded')
                .slice(-3).reverse()
                .map((event) => ({ key: event.id, text: event.text, note: '', at: event.createdAt }))
            if (rows.length === 0) return null
            return h('div', { className: 'imCfgHistory' },
              h('p', { className: 'imCfgGroupTitle' }, '升级历史'),
              rows.map((row) => h('div', { key: row.key, className: 'imCfgHistoryRow' },
                h('span', { className: 'imCfgHistoryText' }, row.text),
                row.note === '' ? null : h('span', { className: 'imCfgHistoryNote' }, row.note),
                h('span', { className: 'imCfgHistoryTime' }, row.at === undefined ? '' : new Date(row.at).toLocaleString()),
              )),
            )
          })(),
          hints.length > 0
            ? h('div', { className: 'imCfgHints' },
              h('p', { className: 'imCfgGroupTitle' }, '让新代码生效'),
              copyFallback
                ? h('p', { className: 'imCfgNote' }, '当前页面不是安全上下文，浏览器不允许自动复制——请手动选中命令。')
                : null,
              hints.map((hint) => h('div', { key: hint.label, className: 'imCfgHintRow' },
                h('span', { className: 'imCfgHintLabel' }, hint.label),
                hint.command === undefined
                  ? null
                  : h('code', { className: 'imCfgHintCommand' }, hint.command),
                hint.command === undefined
                  ? null
                  : h('button', {
                    type: 'button',
                    className: 'imCfgCopy',
                    onClick: () => { void copy(hint.command) },
                  }, copied === hint.command ? '已复制' : '复制'),
              )),
            )
            : null,
          upgrade?.commits?.length > 0
            ? h('div', { className: 'imCfgCommits' },
              upgrade.commits.slice(0, 5).map((commit) => h('div', { key: commit.sha, className: 'imCfgCommit' },
                h('code', null, commit.short ?? String(commit.sha ?? '').slice(0, 7)),
                h('span', { className: 'imCfgCommitSubject' }, commit.subject ?? ''),
              )),
            )
            : (upgrade?.ahead > 0 ? h('p', { className: 'imCfgNote' }, `本地领先远程 ${upgrade.ahead} 个提交。`) : null),
        ),
        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' },
            h('h3', { className: 'imCfgGroupTitle' }, '团队与权限（SaaS）'),
            h('span', { className: 'imCfgGroupNote' }, saas.token === '' ? '未登录' : `${saas.me?.name ?? saas.me?.email ?? ''} · ${saas.role === 'owner' ? '所有者' : saas.role === 'admin' ? '管理员' : '客服'}`),
          ),
          saas.token === ''
            ? h('div', { className: 'imCfgGrid' },
              h('label', { className: 'imCfgField' },
                h('span', { className: 'imCfgLabel' }, '账号邮箱'),
                h('input', { className: 'imCfgInput', value: saas.email, placeholder: 'you@team.com', onChange: (event) => setSaas({ ...saas, email: event.target.value }) }),
              ),
              h('label', { className: 'imCfgField' },
                h('span', { className: 'imCfgLabel' }, '密码'),
                h('input', { className: 'imCfgInput', type: 'password', value: saas.password, onChange: (event) => setSaas({ ...saas, password: event.target.value }) }),
              ),
            )
            : h('div', { className: 'imCfgSaas' },
              h('div', { className: 'imCfgRow' },
                h('div', { className: 'imCfgRowMain' },
                  h('span', { className: 'imCfgRowTitle' }, `${saas.members.length} 名成员 · ${saas.channels.length} 个号码可见`),
                  h('span', { className: 'imCfgRowNote' }, saas.approvals > 0 ? `${saas.approvals} 条待审批，需要在团队权限页处理` : '没有待审批'),
                ),
                h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => setSaas({ ...saas, token: '', password: '', members: [], channels: [], approvals: 0 }) }, '退出'),
              ),
              saas.members.map((member) => {
                const permission = member.permissions ?? {}
                const isAdminRole = member.role === 'owner' || member.role === 'admin'
                const all = permission.dataScope === 'all' || (permission.dataScope === undefined && isAdminRole)
                const granted = new Set(Array.isArray(permission.channelIds) ? permission.channelIds : [])
                const canGrant = saas.role === 'owner' || saas.role === 'admin'
                return h('div', { key: member.user_id, className: 'imCfgRow' },
                  h('div', { className: 'imCfgRowMain' },
                    h('span', { className: 'imCfgRowTitle' }, member.name || member.email),
                    h('span', { className: 'imCfgRowNote' }, all ? '整个团队' : granted.size > 0 ? `${granted.size} 个号码` : '仅自己'),
                    all || !canGrant
                      ? null
                      : h('div', { className: 'imCfgChips' }, saas.channels.map((channel) => {
                        const on = granted.has(channel.id)
                        return h('label', { key: channel.id, className: `imCfgChip ${on ? 'on' : ''}`.trim() },
                          h('input', {
                            type: 'checkbox',
                            checked: on,
                            onChange: () => {
                              const next = new Set(granted)
                              if (on) next.delete(channel.id)
                              else next.add(channel.id)
                              void saasGrant(member, { channelIds: [...next], dataScope: 'own' })
                            },
                          }),
                          channel.name,
                        )
                      })),
                  ),
                  canGrant && member.role !== 'owner'
                    ? h('select', {
                      className: 'imCfgSelect',
                      value: all ? 'all' : 'own',
                      onChange: (event) => {
                        void saasGrant(member, event.target.value === 'all'
                          ? { dataScope: 'all', channelIds: [] }
                          : { dataScope: 'own' })
                      },
                    }, h('option', { value: 'own' }, '仅自己'), h('option', { value: 'all' }, '整个团队'))
                    : h('span', { className: 'imCfgStatus' }, member.role === 'owner' ? '所有者' : isAdminRole ? '管理员' : '客服'),
                )
              }),
            ),
          saas.token === ''
            ? h('div', { className: 'imCfgActions' },
              h('button', { type: 'button', className: 'imoBtn imoBtnSm imoBtnPrimary', disabled: saas.busy !== '', onClick: () => { void saasLogin() } }, saas.busy === 'login' ? '登录中…' : '登录'),
              saas.error === '' ? null : h('span', { className: 'imCfgNote' }, saas.error),
            )
            : h('div', null,
              h('p', { className: 'imCfgNote' }, '授权立即生效；把成员放开到「整个团队」会在下方生成待审批。'),
              saas.pending.length === 0
                ? null
                : h('div', { className: 'imCfgPending' },
                  h('p', { className: 'imCfgGroupTitle' }, `待审批 ${saas.pending.length}`),
                  saas.pending.map((item) => h('div', { key: item.id, className: 'imCfgRow' },
                    h('div', { className: 'imCfgRowMain' },
                      h('span', { className: 'imCfgRowTitle' }, `${item.requester_name || item.requester_email} 申请修改 ${item.payload?.targetName ?? item.target_name ?? ''}`),
                      h('span', { className: 'imCfgRowNote' }, item.action === 'channel.delete' ? `删除渠道 ${item.payload?.channelName ?? ''}` : item.action === 'member.remove' ? '移除成员' : item.payload?.dataScope === 'all' ? '放开到整个团队' : `角色改为 ${item.payload?.role ?? ''}`),
                    ),
                    saas.role === 'owner'
                      ? h('div', { className: 'imCfgActions' },
                        h('button', { type: 'button', className: 'imoBtn imoBtnSm imoBtnPrimary', onClick: () => { void saasDecide(item.id, 'approve') } }, '批准'),
                        h('button', { type: 'button', className: 'imoBtn imoBtnSm', onClick: () => { void saasDecide(item.id, 'reject') } }, '拒绝'),
                      )
                      : h('span', { className: 'imCfgStatus' }, '等待所有者'),
                  )),
                ),
              saas.error === '' ? null : h('span', { className: 'imCfgNote' }, saas.error),
            ),
        ),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' },
            h('h3', { className: 'imCfgGroupTitle' }, '连接与演示'),
            h('span', { className: 'imCfgGroupNote' }, role === 'owner' ? '所有者' : role === 'admin' ? '管理员' : '客服'),
          ),
          h('div', { className: 'imCfgGrid' },
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, 'Host 服务地址'),
              h('input', { className: 'imCfgInput', readOnly: true, value: typeof window === 'undefined' ? '' : window.location.origin }),
            ),
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '演示数据'),
              h('select', {
                className: 'imCfgSelect',
                value: form.demo ? 'on' : 'off',
                disabled: !canConfigure,
                onChange: (event) => {
                  const demo = event.target.value === 'on'
                  setForm({ ...form, demo })
                  void run('演示模式', 'workspace.update', { demo })
                },
              }, h('option', { value: 'on' }, '显示演示数据'), h('option', { value: 'off' }, '只用真实数据')),
            ),
          ),
        ),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' }, h('h3', { className: 'imCfgGroupTitle' }, '通知默认值')),
          h('div', { className: 'imCfgGrid' },
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '企业微信机器人'),
              h('input', {
                className: 'imCfgInput',
                placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
                value: form.webhook,
                disabled: !canConfigure,
                onChange: (event) => setForm({ ...form, webhook: event.target.value }),
              }),
            ),
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '点击深链模板'),
              h('input', {
                className: 'imCfgInput',
                placeholder: 'dshomni://chat/{conversationId}',
                value: form.linkTemplate,
                disabled: !canConfigure,
                onChange: (event) => setForm({ ...form, linkTemplate: event.target.value }),
              }),
            ),
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '安静时段开始'),
              h('input', { className: 'imCfgInput', placeholder: '22:00', value: form.quietStart, disabled: !canConfigure, onChange: (event) => setForm({ ...form, quietStart: event.target.value }) }),
            ),
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '安静时段结束'),
              h('input', { className: 'imCfgInput', placeholder: '08:00', value: form.quietEnd, disabled: !canConfigure, onChange: (event) => setForm({ ...form, quietEnd: event.target.value }) }),
            ),
          ),
          h('div', { className: 'imCfgActions' },
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', disabled: !canConfigure || saving !== '', onClick: () => { void saveNotify() } }, saving === '通知默认值' ? '保存中…' : '保存通知'),
            h('button', {
              type: 'button',
              className: 'imoBtn',
              disabled: !canConfigure,
              onClick: () => {
                setForm({ ...form, notifyEnabled: !form.notifyEnabled })
                void run('通知开关', 'workspace.update', { notify: { enabled: !form.notifyEnabled } })
              },
            }, form.notifyEnabled ? '通知已开启' : '通知已关闭'),
          ),
        ),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' }, h('h3', { className: 'imCfgGroupTitle' }, '接待默认值')),
          h('div', { className: 'imCfgGrid' },
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '默认 SLA（分钟）'),
              h('input', { className: 'imCfgInput', inputMode: 'numeric', value: form.sla, disabled: !canConfigure, onChange: (event) => setForm({ ...form, sla: event.target.value }) }),
            ),
            h('label', { className: 'imCfgField' },
              h('span', { className: 'imCfgLabel' }, '翻译目标语言'),
              h('input', { className: 'imCfgInput', value: form.translationTarget, disabled: !canConfigure, onChange: (event) => setForm({ ...form, translationTarget: event.target.value }) }),
            ),
          ),
          h('div', null,
            [
              ['自动分配新会话', 'autoAssign'],
              ['自动翻译客户消息', 'autoTranslate'],
              ['显示 AI 建议', 'aiSuggestions'],
            ].map(([label, key]) => h('div', { key, className: 'imCfgRow' },
              h('div', { className: 'imCfgRowMain' }, h('span', { className: 'imCfgRowTitle' }, label)),
              h('button', {
                type: 'button',
                className: 'imoSwitch',
                role: 'switch',
                'aria-checked': form[key] ? 'true' : 'false',
                disabled: !canConfigure,
                style: { opacity: form[key] ? 1 : 0.45, background: form[key] ? 'var(--dsw-alias-brand-primary)' : 'color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)' },
                onClick: () => setForm({ ...form, [key]: !form[key] }),
              }),
            )),
          ),
          h('div', { className: 'imCfgActions' },
            h('button', { type: 'button', className: 'imoBtn imoBtnPrimary', disabled: !canConfigure || saving !== '', onClick: () => { void saveReception() } }, saving === '接待默认值' ? '保存中…' : '保存接待设置'),
          ),
        ),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' },
            h('h3', { className: 'imCfgGroupTitle' }, '渠道开关'),
            h('span', { className: 'imCfgGroupNote' }, `${channels.length} 个渠道`),
          ),
          channels.length === 0
            ? h('p', { className: 'imCfgNote' }, '还没有渠道。在全渠道 IM 的渠道页添加。')
            : channels.map((channel) => {
              const active = channel.status === 'active'
              return h('div', { key: channel.id, className: 'imCfgRow' },
                h('div', { className: 'imCfgRowMain' },
                  h('span', { className: 'imCfgRowTitle' }, channel.name),
                  h('span', { className: 'imCfgRowNote' }, `${channel.type} · ${channel.runtime?.health ?? 'unconfigured'}`),
                ),
                h('div', { className: 'imCfgActions' },
                  h('span', { className: 'imCfgStatus' }, h('span', { className: `imCfgDot ${active ? '' : 'paused'}`.trim() }), active ? '启用' : '已暂停'),
                  h('button', {
                    type: 'button',
                    className: 'imoBtn imoBtnSm',
                    disabled: !canConfigure,
                    onClick: () => run(active ? '暂停渠道' : '启用渠道', 'channel.update', { channelId: channel.id, status: active ? 'paused' : 'active' }),
                  }, active ? '暂停' : '启用'),
                ),
              )
            }),
        ),

        h('section', { className: 'imCfgGroup' },
          h('div', { className: 'imCfgGroupHead' },
            h('h3', { className: 'imCfgGroupTitle' }, '成员与权限'),
            h('span', { className: 'imCfgGroupNote' }, '身份取当前坐席；Host 侧按角色拒绝越权命令'),
          ),
          h('table', { className: 'imCfgMatrix' },
            h('thead', null, h('tr', null,
              h('th', null, '权限'), h('th', null, '所有者'), h('th', null, '管理员'), h('th', null, '客服'),
            )),
            h('tbody', null,
              [
                ['配置插件与通知', 'yes', 'yes', 'no'],
                ['启用或暂停渠道', 'yes', 'yes', 'no'],
                ['添加成员与改角色', 'yes', 'limit', 'no'],
                ['接待会话与发送消息', 'yes', 'yes', 'yes'],
              ].map(([label, owner, admin, agent]) => h('tr', { key: label },
                h('td', null, label),
                [owner, admin, agent].map((mark, index) => h('td', { key: index, className: `imCfgMark ${mark === 'yes' ? 'yes' : mark === 'no' ? 'no' : ''}`.trim() },
                  mark === 'yes' ? '✓' : mark === 'no' ? '—' : '仅限添加/改客服')),
              )),
            ),
          ),
          h('div', null, agents.length === 0
            ? h('p', { className: 'imCfgNote' }, '还没有成员。')
            : agents.map((agent) => {
              const isOwner = workspace.ownerId === agent.id
              return h('div', { key: agent.id, className: 'imCfgRow' },
                h('div', { className: 'imCfgRowMain' },
                  h('span', { className: 'imCfgRowTitle' }, agent.name),
                  h('span', { className: 'imCfgRowNote' }, agent.email || agent.id),
                ),
                isOwner
                  ? h('span', { className: 'imCfgStatus' }, '所有者')
                  : h('select', {
                    className: 'imCfgSelect',
                    value: agent.role ?? 'agent',
                    disabled: role !== 'owner',
                    onChange: (event) => run('成员角色', 'agent.update', { agentId: agent.id, role: event.target.value }),
                  }, h('option', { value: 'admin' }, '管理员'), h('option', { value: 'agent' }, '客服')),
              )
            }),
          ),
          h('p', { className: 'imCfgNote' }, '当前身份：' + (currentAgent === undefined ? '未选择坐席（按所有者处理）' : `${currentAgent.name} · ${role === 'owner' ? '所有者' : role === 'admin' ? '管理员' : '客服'}`)),
        ),
      )
    }

    /**
     * Register the sidebar entry, main panel, and locale dictionaries.
     * @param {import('@deepseek-ai/cordis').Context} ctx - Client context.
     */
    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'im-omni: dictionaries',
      )
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 46,
        locale: NS,
        label: () => t('panel.label'),
      }, PanelIcon))
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, (props) => h(AppBoundary, null, h(App, props))))
      /**
       * The form this bundle registers for its own page in the plugin manager.
       * It sits right after the README, above rows, versions and source.
       * @param {{view?: 'summary'|'page'}} props - the view the page asks for.
       * @returns {import('react').ReactNode} the section, or null for a summary.
       */
      function PluginConfigView(props) {
        if (props?.view !== undefined && props.view !== 'page') return null
        return h(ConfigBoundary, null, h(PluginConfigSection, null))
      }

      /**
       * Keep one failing section from blanking the plugin page: a render error
       * shows here instead of unmounting the subtree silently.
       */
      class ConfigBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { message: '' }
        }

        static getDerivedStateFromError(error) {
          return { message: error instanceof Error ? error.message : String(error) }
        }

        render() {
          // The stylesheet normally rides on the panel's App root; the plugin
          // page never mounts App, so the section carries its own copy.
          const style = h('style', { dangerouslySetInnerHTML: { __html: CSS } })
          if (this.state.message !== '') {
            return h('div', { className: 'imCfg', 'data-im-omni-config': 'error' },
              style,
              h('p', { className: 'imCfgSub' }, '插件配置渲染失败'),
              h('pre', { className: 'imCfgError' }, this.state.message),
            )
          }
          return h('div', { className: 'imCfgHost', 'data-im-omni-config': 'mounted' }, style, this.props.children)
        }
      }
      ctx.slots.inject('plugins.bundle.config', () => {
        try {
          const dispose = ctx.slots.register({
            name: 'plugins.bundle.config',
            key: 'dsh-im-omni',
            locale: NS,
          }, PluginConfigView)
          if (typeof globalThis !== 'undefined') globalThis.__imOmniConfig = { registered: true, rev: BUNDLE_REV }
          return dispose
        } catch (error) {
          // A rejected contribution must not take the sidebar panel down with it.
          const message = error instanceof Error ? error.message : String(error)
          if (typeof globalThis !== 'undefined') globalThis.__imOmniConfig = { registered: false, error: message }
          if (typeof console !== 'undefined') console.warn('[im-omni] bundle config not registered:', message)
          return () => {}
        }
      })
    }

    return { name: 'im-omni', inject, apply, tabItems, membershipLabel }
  },
})
