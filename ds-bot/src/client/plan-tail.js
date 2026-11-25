// The plan a turn worked to, at the end of that turn. The chat is a record of what was said
// and done; this is the part that says what the Bot set out to do and what it finished, so a
// finished turn can be read back instead of only watched.
import { createElement as h } from 'react'
import { planInWindow } from './turn-plan.js'
import { Safe } from './safe.js'

const TICK = '✓'

export function PlanTail(props) {
  return h(Safe, { name: 'turn plan' }, h(TailPlan, props))
}

function TailPlan({ turn: location, sessionId }) {
  const start = location?.start?.time ?? 0
  const end = location?.end?.time ?? Number.MAX_SAFE_INTEGER
  let items = null
  try { items = planInWindow(window.localStorage, sessionId, start, end) } catch { items = null }
  if (items === null) return null
  const done = items.filter(item => item.status === 'completed').length
  return h('div', { className: 'bt-turn-plan' },
    h('span', { className: 'bt-turn-plan-count' }, `${done}/${items.length}`),
    h('ol', { className: 'bt-turn-plan-list', role: 'list' },
      items.map((item, index) => h('li', { key: `${index}:${item.content}`, className: 'bt-turn-plan-item', 'data-done': item.status === 'completed' ? '' : undefined, 'data-now': item.status === 'in_progress' ? '' : undefined },
        h('span', { className: 'bt-turn-plan-mark', 'aria-hidden': true }, item.status === 'completed' ? TICK : '·'),
        h('span', { className: 'bt-turn-plan-text' }, item.content)))))
}
