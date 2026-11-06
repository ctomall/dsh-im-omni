/**
 * Host half of the team-access panel.
 *
 * It owns no data: the permission model lives in the team service. This plugin
 * exists so an administrator can install the access surface without the chat
 * inbox, and so the two have independent release cycles.
 * @module dsh-im-omni-access
 */
import { forwardSaas } from './lib/saas-proxy.mjs'

/**
 * Register the fallback proxy used when the page is served without nginx.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  const json = (value, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(value),
  })

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: '/api/im-omni-access.saas',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: { code: 'bad-json', message: 'The request body is not valid JSON.' } }, 400)
        }
        const base = String(process.env.IM_OMNI_SAAS ?? body?.base ?? 'http://127.0.0.1:8090')
        try {
          const result = await forwardSaas({
            base,
            path: String(body?.path ?? ''),
            method: String(body?.method ?? 'GET'),
            headers: typeof body?.token === 'string' && body.token !== '' ? { authorization: `Bearer ${body.token}` } : {},
            body: body?.body,
          })
          return json(result.body, result.status)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return json({ ok: false, error: { code: 'proxy-failed', message } }, 502)
        }
      },
    }),
    'im-omni-access: team API proxy',
  )
}
