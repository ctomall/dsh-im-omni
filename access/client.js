/**
 * Team-access panel: the administrator-facing half of the inbox.
 *
 * It reads and writes the team service only; it never decides who may see what.
 * The page talks to `/im-omni-api/...` (same origin, via nginx) and falls back to
 * this plugin's own Host proxy when that route is absent.
 * @module dsh-im-omni-access/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-omni-access',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // Shared transport/mapping; falls back to the local copy when core is absent.
    let core = null
    try {
      core = require('dsh-im-omni-core')
    } catch {
      core = null
    }

    const NS = 'im-omni-access'
const PANEL_ID = 'im-omni-access'

/** Panel CSS, kept in one place with the `.imA*` prefix. */
const CSS = String.raw`
.imA{display:flex;flex-direction:column;height:100%;min-width:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:13px/1.55 var(--dsw-font-family,"PingFang SC","Segoe UI",system-ui,sans-serif)}
.imAPage{flex:1;overflow:auto;padding:20px 24px 32px}
.imAHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.imATitle{font-size:17px;font-weight:600;margin:0}
.imASub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:4px 0 0}
.imAActions{display:flex;gap:8px;flex:none}
.imABtn{font:inherit;font-size:12px;padding:5px 11px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.imABtn:hover{background:var(--dsw-alias-bg-layer-2)}
.imABtn:disabled{opacity:.55;cursor:default}
.imABtn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.imABtn.primary:hover{filter:brightness(1.06)}
.imACard{border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px 16px;margin-bottom:14px;background:var(--dsw-alias-bg-layer-1)}
.imACardTitle{font-size:13px;font-weight:600;margin:0 0 2px}
.imANote{font-size:12px;color:var(--dsw-alias-label-secondary);margin:2px 0 10px}
.imARow{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:11px 0;border-top:.5px solid var(--dsw-alias-border-l1)}
.imARow:first-of-type{border-top:none}
.imARowMain{min-width:0}
.imARowTitle{font-size:13px}
.imARowNote{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.imAChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.imAChip{display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.imAChip.on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.imAChip input{accent-color:var(--dsw-alias-brand-primary);margin:0}
.imASelect{font:inherit;font-size:12px;padding:4px 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.imAField{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.imAFieldLabel{font-size:12px;color:var(--dsw-alias-label-secondary)}
.imAInput{font:inherit;font-size:13px;padding:7px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:inherit}
.imAInput:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.imAToast{font-size:12px;margin:0 0 12px}
.imAToast.bad{color:var(--dsw-alias-state-error-primary)}
.imAToast.ok{color:var(--dsw-alias-state-success-primary)}
.imAMuted{color:var(--dsw-alias-label-secondary);font-size:12px}
`

/** Icon shown in the sidebar list. */
function PanelIcon() {
  return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
    React.createElement('rect', { x: 4, y: 10, width: 16, height: 10, rx: 2 }),
    React.createElement('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }),
  )
}

/**
 * Call the team API: same-origin path first, Host proxy second.
 * @param {string} path - `/v1/...`.
 * @param {{method?: string, body?: unknown, token?: string}} [options] - request.
 * @returns {Promise<{ok: boolean, status: number, body: any}>} parsed answer.
 */
async function api(path, options = {}) {
  if (core !== null && typeof core.proxySaas === 'function') {
    const response = await core.proxySaas(path, { ...options, proxyPath: '/api/im-omni-access.saas' })
    const body = await response.json()
    return { ok: response.ok, status: response.status, body }
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
    let body = null
    try {
      body = text === '' ? null : JSON.parse(text)
    } catch {
      body = null
    }
    if (body !== null || direct.status !== 404) return { ok: direct.ok, status: direct.status, body }
  } catch {
    // fall through to the Host proxy
  }
  const response = await fetch('/api/im-omni-access.saas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, method, body: options.body, token }),
  })
  const body = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, body }
}

/** Human label for a failed call. */
function failureBody(result) {
  return result.body?.error?.message ?? `HTTP ${result.status}`
}

/**
 * The panel itself.
 * @returns {import('react').ReactElement} page.
 */
function App() {
  const [session, setSession] = React.useState({ email: '', password: '', token: '', tenantId: '', role: '', name: '' })
  const [roster, setRoster] = React.useState({ members: [], channels: [], pending: [], audit: [] })
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const load = React.useCallback(async (token, tenantId) => {
    const [members, channels, approvals, audit] = await Promise.all([
      api(`/v1/tenants/${tenantId}/members`, { token }),
      api('/v1/channels', { token }),
      api(`/v1/tenants/${tenantId}/approvals?status=all`, { token }),
      api(`/v1/tenants/${tenantId}/audit?limit=8`, { token }),
    ])
    setRoster({
      members: members.body?.items ?? [],
      channels: channels.body?.items ?? [],
      pending: (approvals.body?.items ?? []).filter((item) => item.status === 'pending'),
      audit: audit.body?.items ?? [],
    })
  }, [])

  const signIn = React.useCallback(async () => {
    setBusy('login')
    setError('')
    setNotice('')
    try {
      const login = await api('/v1/auth/login', { method: 'POST', body: { email: session.email, password: session.password } })
      if (!login.ok) throw new Error(failureBody(login))
      const token = login.body.accessToken
      const me = await api('/v1/me', { token })
      const tenant = me.body.tenants.find((item) => item.tenant_id === me.body.currentTenant) ?? me.body.tenants[0]
      setSession((current) => ({ ...current, token, tenantId: tenant.tenant_id, role: tenant.role, name: me.body.user?.name ?? me.body.user?.email ?? '' }))
      await load(token, tenant.tenant_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }, [session.email, session.password, load])

  const grant = React.useCallback(async (member, patch) => {
    setBusy(member.user_id)
    setError('')
    setNotice('')
    try {
      const body = { ...patch }
      if (body.dataScope === 'all') {
        const typed = window.prompt(`把 ${member.name || member.email} 设成整个团队？输入对方邮箱确认：`, '')
        if (typed === null) return
        body.confirmEmail = typed.trim()
      }
      const result = await api(`/v1/tenants/${session.tenantId}/members/${member.user_id}`, { method: 'PATCH', body, token: session.token })
      if (result.status === 202) setNotice('已提交审批，等待所有者批准')
      else if (!result.ok) throw new Error(failureBody(result))
      else setNotice('已保存')
      await load(session.token, session.tenantId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }, [session.tenantId, session.token, load])

  const decide = React.useCallback(async (id, decision) => {
    setBusy(id)
    setError('')
    try {
      const result = await api(`/v1/tenants/${session.tenantId}/approvals/${id}`, { method: 'POST', body: { decision }, token: session.token })
      if (!result.ok) throw new Error(failureBody(result))
      setNotice(decision === 'approve' ? '已批准并生效' : '已拒绝')
      await load(session.token, session.tenantId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }, [session.tenantId, session.token, load])

  if (session.token === '') {
    return React.createElement('div', { className: 'imA' },
      React.createElement('style', { dangerouslySetInnerHTML: { __html: CSS } }),
      React.createElement('div', { className: 'imAPage' },
        React.createElement('div', { className: 'imAHead' },
          React.createElement('div', null,
            React.createElement('h1', { className: 'imATitle' }, '团队权限'),
            React.createElement('p', { className: 'imASub' }, '登录团队服务后，按员工分配可见的渠道号码与数据范围。'),
          ),
        ),
        React.createElement('div', { className: 'imACard' },
          React.createElement('label', { className: 'imAField' },
            React.createElement('span', { className: 'imAFieldLabel' }, '邮箱'),
            React.createElement('input', { className: 'imAInput', value: session.email, onChange: (event) => setSession({ ...session, email: event.target.value }) }),
          ),
          React.createElement('label', { className: 'imAField' },
            React.createElement('span', { className: 'imAFieldLabel' }, '密码'),
            React.createElement('input', { className: 'imAInput', type: 'password', value: session.password, onChange: (event) => setSession({ ...session, password: event.target.value }) }),
          ),
          React.createElement('div', { className: 'imAActions' },
            React.createElement('button', { type: 'button', className: 'imABtn primary', disabled: busy !== '', onClick: () => { void signIn() } }, busy === 'login' ? '登录中…' : '登录'),
          ),
          error === '' ? null : React.createElement('p', { className: 'imAToast bad' }, error),
        ),
      ),
    )
  }

  return React.createElement('div', { className: 'imA' },
    React.createElement('style', { dangerouslySetInnerHTML: { __html: CSS } }),
    React.createElement('div', { className: 'imAPage' },
      React.createElement('div', { className: 'imAHead' },
        React.createElement('div', null,
          React.createElement('h1', { className: 'imATitle' }, '团队权限'),
          React.createElement('p', { className: 'imASub' }, `${session.name} · ${session.role === 'owner' ? '所有者' : session.role === 'admin' ? '管理员' : '客服'} · 授权立即生效，放开到整个团队需所有者批准`),
        ),
        React.createElement('div', { className: 'imAActions' },
          React.createElement('button', { type: 'button', className: 'imABtn', onClick: () => { void load(session.token, session.tenantId) } }, '刷新'),
          React.createElement('button', { type: 'button', className: 'imABtn', onClick: () => setSession({ ...session, token: '', password: '' }) }, '退出'),
        ),
      ),
      notice === '' ? null : React.createElement('p', { className: 'imAToast ok' }, notice),
      error === '' ? null : React.createElement('p', { className: 'imAToast bad' }, error),
      roster.pending.length === 0 ? null : React.createElement('section', { className: 'imACard' },
        React.createElement('p', { className: 'imACardTitle' }, `待审批 ${roster.pending.length}`),
        roster.pending.map((item) => React.createElement('div', { key: item.id, className: 'imARow' },
          React.createElement('div', { className: 'imARowMain' },
            React.createElement('span', { className: 'imARowTitle' }, `${item.requester_name || item.requester_email} 申请修改 ${item.payload?.targetName ?? item.target_name ?? ''}`),
            React.createElement('span', { className: 'imARowNote' }, item.action === 'channel.delete' ? `删除渠道 ${item.payload?.channelName ?? ''}` : item.action === 'member.remove' ? '移除成员' : item.payload?.dataScope === 'all' ? '放开到整个团队' : `角色改为 ${item.payload?.role ?? ''}`),
          ),
          session.role === 'owner'
            ? React.createElement('div', { className: 'imAActions' },
              React.createElement('button', { type: 'button', className: 'imABtn primary', onClick: () => { void decide(item.id, 'approve') } }, '批准'),
              React.createElement('button', { type: 'button', className: 'imABtn', onClick: () => { void decide(item.id, 'reject') } }, '拒绝'),
            )
            : React.createElement('span', { className: 'imAMuted' }, '等待所有者'),
        )),
      ),
      React.createElement('section', { className: 'imACard' },
        React.createElement('p', { className: 'imACardTitle' }, `成员 ${roster.members.length}`),
        roster.members.map((member) => {
          const permission = member.permissions ?? {}
          const isAdminRole = member.role === 'owner' || member.role === 'admin'
          const all = permission.dataScope === 'all' || (permission.dataScope === undefined && isAdminRole)
          const granted = new Set(Array.isArray(permission.channelIds) ? permission.channelIds : [])
          const canGrant = session.role === 'owner' || session.role === 'admin'
          return React.createElement('div', { key: member.user_id, className: 'imARow' },
            React.createElement('div', { className: 'imARowMain' },
              React.createElement('span', { className: 'imARowTitle' }, member.name || member.email),
              React.createElement('span', { className: 'imARowNote' }, all ? '整个团队' : granted.size > 0 ? `${granted.size} 个号码` : '仅自己'),
              all || !canGrant
                ? null
                : React.createElement('div', { className: 'imAChips' }, roster.channels.map((channel) => {
                  const on = granted.has(channel.id)
                  return React.createElement('label', { key: channel.id, className: `imAChip ${on ? 'on' : ''}`.trim() },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: on,
                      onChange: () => {
                        const next = new Set(granted)
                        if (on) next.delete(channel.id)
                        else next.add(channel.id)
                        void grant(member, { channelIds: [...next], dataScope: 'own' })
                      },
                    }),
                    channel.name,
                  )
                })),
            ),
            canGrant && member.role !== 'owner'
              ? React.createElement('select', {
                className: 'imASelect',
                value: all ? 'all' : 'own',
                onChange: (event) => { void grant(member, event.target.value === 'all' ? { dataScope: 'all', channelIds: [] } : { dataScope: 'own' }) },
              }, React.createElement('option', { value: 'own' }, '仅自己'), React.createElement('option', { value: 'all' }, '整个团队'))
              : React.createElement('span', { className: 'imAMuted' }, member.role === 'owner' ? '所有者' : isAdminRole ? '管理员' : '客服'),
          )
        }),
      ),
      React.createElement('section', { className: 'imACard' },
        React.createElement('p', { className: 'imACardTitle' }, '最近变更'),
        roster.audit.length === 0
          ? React.createElement('p', { className: 'imAMuted' }, '还没有权限变更记录。')
          : roster.audit.map((item) => React.createElement('div', { key: item.id, className: 'imARow' },
            React.createElement('span', { className: 'imARowTitle' }, `${item.actor_name || item.actor_email} → ${item.target_name || item.target_email}`),
            React.createElement('span', { className: 'imAMuted' }, new Date(item.created_at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
          )),
      ),
    ),
  )
}

/**
 * Register the sidebar entry and the panel page.
 * @param {import('@deepseek-ai/cordis').Context} ctx - client plugin context.
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { 'panel.label': '团队权限' }), 'im-omni-access: locale')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 47,
    locale: NS,
    label: () => '团队权限',
  }, PanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, App))
}

return { name: 'im-omni-access', inject: [], apply }
  },
})
