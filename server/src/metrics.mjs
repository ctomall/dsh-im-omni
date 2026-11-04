/**
 * Minimal Prometheus-style metrics without a dependency.
 *
 * Only the handful of numbers an on-call person needs: request counts by
 * route/status class, a latency sum/count pair, and quota refusals.
 */

const counters = new Map()
const startedAt = Date.now()

/**
 * Bump one counter label set.
 * @param {string} name - metric name.
 * @param {Record<string, string>} labels - label pairs.
 * @param {number} [delta] - increment.
 */
export function inc(name, labels = {}, delta = 1) {
  const key = `${name}|${Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',')}`
  const current = counters.get(key) ?? { name, labels, value: 0 }
  current.value += delta
  counters.set(key, current)
}

/**
 * Render the registry in Prometheus text format.
 * @returns {string} exposition body.
 */
export function render() {
  const lines = []
  const byName = new Map()
  for (const entry of counters.values()) {
    if (!byName.has(entry.name)) byName.set(entry.name, [])
    byName.get(entry.name).push(entry)
  }
  for (const [name, entries] of byName) {
    lines.push(`# TYPE ${name} counter`)
    for (const entry of entries) {
      const labels = Object.entries(entry.labels)
        .map(([key, value]) => `${key}="${String(value).replaceAll('"', '\\"')}"`)
        .join(',')
      lines.push(`${name}${labels === '' ? '' : `{${labels}}`} ${entry.value}`)
    }
  }
  lines.push('# TYPE im_omni_uptime_seconds gauge')
  lines.push(`im_omni_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`)
  return `${lines.join('\n')}\n`
}

/** Reset the registry (tests). */
export function reset() {
  counters.clear()
}
