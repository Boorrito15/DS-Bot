// The plan a turn worked to, kept so it can be read again later. A Bot's todo list is a
// live projection: the next turn replaces it, so a finished turn would leave nothing behind.
// This keeps each list against the moment it was seen, in the browser's storage, and a
// turn's tail reads back the last one inside that turn.

const KEY = 'dsbot.turnPlans'
// Lists kept per conversation: a few hundred KB at most, and far more than anyone scrolls.
const KEEP = 60
const MAX_ITEMS = 40
const TEXT_MAX = 160

const clean = (todos) => (Array.isArray(todos) ? todos : [])
  .slice(0, MAX_ITEMS)
  .map(item => ({
    content: typeof item?.content === 'string' ? item.content.replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) : '',
    status: item?.status === 'completed' || item?.status === 'in_progress' ? item.status : 'pending',
  }))
  .filter(item => item.content !== '')

/** The whole record, or {} when there is none or it cannot be read. */
export function readPlans(storage) {
  try { return JSON.parse(storage?.getItem?.(KEY) ?? '{}') ?? {} } catch { return {} }
}

/**
 * Keep this list against the moment it was seen. The same list seen twice only moves its
 * time, so a long turn does not fill the record with copies of one plan.
 */
export function notePlan(storage, sessionId, todos, at = Date.now()) {
  const items = clean(todos)
  if (typeof sessionId !== 'string' || sessionId === '' || items.length === 0) return false
  const all = readPlans(storage)
  const mine = Array.isArray(all[sessionId]) ? all[sessionId] : []
  const key = JSON.stringify(items)
  const same = [...mine].reverse().find(entry => JSON.stringify(entry?.items) === key)
  const kept = mine.filter(entry => entry !== same)
  kept.push({ at, items })
  kept.sort((a, b) => a.at - b.at)
  all[sessionId] = kept.slice(-KEEP)
  try { storage.setItem(KEY, JSON.stringify(all)) } catch { return false }
  return true
}

/** The last list seen inside this turn's window, or null. */
export function planInWindow(storage, sessionId, start, end = Number.MAX_SAFE_INTEGER) {
  const mine = readPlans(storage)[sessionId]
  if (!Array.isArray(mine)) return null
  const inside = mine.filter(entry => Number.isFinite(entry?.at) && entry.at >= start && entry.at <= end)
  const last = inside.at(-1)
  return last === undefined || !Array.isArray(last.items) || last.items.length === 0 ? null : last.items
}
