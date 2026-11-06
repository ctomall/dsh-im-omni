/**
 * Workspace audit records for plugin self-upgrades.
 *
 * The event stream is a rolling 2000-entry log, so an upgrade record would fall
 * out of it eventually. This module keeps the last {@link MAX_UPGRADES} upgrades
 * on the workspace itself and mirrors each one into the event stream.
 * @module dsh-im-omni/lib/audit
 */

/** How many upgrade records the workspace keeps. */
export const MAX_UPGRADES = 20

/**
 * Append one successful upgrade record.
 * @param {{state: Record<string, any>, event: Function}} store - workspace store.
 * @param {Record<string, any>} result - `applyUpgrade()` result.
 * @returns {Record<string, any> | null} the record, or null when nothing changed.
 */
export function recordUpgrade(store, result) {
  if (result?.changed !== true) return null
  const workspace = store.state.workspace ?? (store.state.workspace = {})
  const upgrades = Array.isArray(workspace.upgrades) ? workspace.upgrades : (workspace.upgrades = [])
  const record = {
    id: `upg_${Date.now().toString(36)}`,
    from: result.before?.short ?? '',
    to: result.after?.short ?? '',
    at: new Date().toISOString(),
    changedFiles: Array.isArray(result.changedFiles) ? result.changedFiles.length : 0,
    restartRequired: result.restartRequired === true,
  }
  upgrades.push(record)
  if (upgrades.length > MAX_UPGRADES) upgrades.splice(0, upgrades.length - MAX_UPGRADES)
  store.event('plugin.upgraded', `插件更新 ${record.from} → ${record.to}`, {
    actorId: store.state.workspace.currentAgentId ?? null,
  })
  return record
}
