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
 * `turn` names the turn it belongs to: the chat's card reads the list back by that name,
 * so the list a turn leaves behind is the one that turn worked to, not the next one's.
 */
export function notePlan(storage, sessionId, todos, at = Date.now(), turn) {
  const items = clean(todos)
  if (typeof sessionId !== 'string' || sessionId === '' || items.length === 0) return false
  const all = readPlans(storage)
  const mine = Array.isArray(all[sessionId]) ? all[sessionId] : []
  const key = JSON.stringify(items)
  const same = [...mine].reverse().find(entry => JSON.stringify(entry?.items) === key)
  const kept = mine.filter(entry => entry !== same)
  kept.push({ at, items, ...(Number.isInteger(turn) ? { turn } : {}) })
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

/** The list this turn worked to, newest state, by the turn's own name. */
export function planOfTurn(storage, sessionId, turn) {
  const mine = readPlans(storage)[sessionId]
  if (!Array.isArray(mine) || !Number.isInteger(turn)) return null
  const last = [...mine].reverse().find(entry => entry?.turn === turn && Array.isArray(entry.items) && entry.items.length > 0)
  return last === undefined ? null : last.items
}

/**
 * How far a turn's list got, counted the way the running row counts it: a tick for a
 * step that is done, a ring for the one in hand. A list that only ever says "pending"
 * still shows the step in hand as the current one, because a plan marked nowhere is how
 * one tool writes it; that is counted as it stands rather than as zero for ever.
 */
export function planCount(items, live) {
  const list = Array.isArray(items) ? items : []
  const marks = list.map(item => item?.status)
  const statusesKept = marks.some(status => status === 'completed' || status === 'in_progress' || status === 'cancelled')
  const done = marks.filter(status => status === 'completed').length
  const current = marks.indexOf('in_progress')
  const marked = done > 0 || current >= 0 || marks.some(status => status === 'cancelled')
  if (marked || live === false || statusesKept) return { done, total: list.length, current }
  // No step marked anywhere: in the row, the step in hand is the first not yet done.
  return { done: 0, total: list.length, current: 0 }
}

/**
 * The one line a row and a card both say: the count, then the step in hand while the
 * turn runs — `2/7 · Fix the watcher`. A turn that is over names no step, since nothing
 * is in hand any more. One function draws it in both places so the two cannot disagree
 * about the same list.
 */
export function planLine(items, live) {
  const { done, total, current } = planCount(items, live)
  if (total === 0) return { count: '', head: '', text: '0/0' }
  const item = live === false || current < 0 ? undefined : items?.[current]
  const head = typeof item?.content === 'string' ? item.content : ''
  return { count: `${done}/${total}`, head, text: head === '' ? `${done}/${total}` : `${done}/${total} · ${head}` }
}
