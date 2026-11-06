/**
 * Notifications and the stale-approval sweep for the two-person rule.
 *
 * A proposal immediately tells the owner; anything still pending after
 * {@link STALE_AFTER_MS} gets one reminder, stamped so it is never repeated.
 * @module im-omni-server/approvals
 */
import { db } from './db.mjs'
import { notifySettings, postWecom } from './notifications.mjs'

/** How long a pending approval may wait before the owner is reminded. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * Post one approval card to the tenant robot.
 * @param {string} tenantId - tenant uuid.
 * @param {{title: string, lines: string[]}} card - card content.
 * @param {typeof fetch} [fetchImpl] - injectable fetch.
 * @returns {Promise<{skipped?: string, ok?: boolean}>} outcome.
 */
async function postCard(tenantId, card, fetchImpl = fetch) {
  const settings = await notifySettings(tenantId)
  if (settings.enabled !== true) return { skipped: 'disabled' }
  if (!settings.wecom_webhook) return { skipped: 'no-webhook' }
  const payload = {
    msgtype: 'markdown',
    markdown: { content: [`**${card.title}**`, ...card.lines.map((line) => `> ${line}`)].join('\n') },
  }
  const result = await postWecom(settings.wecom_webhook, payload, fetchImpl)
  return { ok: result.ok, status: result.status }
}

/**
 * Tell the owners that an admin proposed a privileged change.
 * @param {string} tenantId - tenant uuid.
 * @param {{actor: string, target: string, what: string}} change - proposal summary.
 * @param {typeof fetch} [fetchImpl] - injectable fetch.
 * @returns {Promise<{skipped?: string, ok?: boolean}>} outcome.
 */
export function notifyProposal(tenantId, change, fetchImpl = fetch) {
  return postCard(tenantId, {
    title: '待审批 · 权限变更',
    lines: [`${change.actor} 申请把 ${change.target} ${change.what}`, '打开「团队权限」页批准或拒绝'],
  }, fetchImpl)
}

/**
 * Remind the owners about approvals that have waited longer than a day, once each.
 * @param {{now?: Date, fetchImpl?: typeof fetch}} [options] - clock and transport.
 * @returns {Promise<{reminded: number, failed: number}>} sweep counters.
 */
export async function remindStaleApprovals(options = {}) {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS)
  // No tenant context here: the sweep reads through a SECURITY DEFINER function.
  const due = await db().query('SELECT * FROM pending_approvals_due($1)', [cutoff])
  let reminded = 0
  let failed = 0
  for (const row of due.rows) {
    const outcome = await postCard(row.tenant_id, {
      title: '审批仍未处理 · 已超过 24 小时',
      lines: [
        `${row.requester_name || row.requester_email} 申请修改 ${row.target_name || row.target_email}`,
        '打开「团队权限」页批准或拒绝',
      ],
    }, options.fetchImpl ?? fetch).catch(() => ({ ok: false }))
    if (outcome.ok === true) {
      reminded += 1
      await db().query('SELECT mark_approval_reminded($1)', [row.id])
    } else if (outcome.skipped !== undefined) {
      // No robot configured: leave it unreminded so a later reminder can still go out.
      failed += 1
      break
    } else {
      failed += 1
    }
  }
  return { reminded, failed }
}
