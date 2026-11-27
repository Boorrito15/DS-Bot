// The plan a turn worked to, at the end of that turn. The chat is a record of what was said
// and done; this is the part that says what the Bot set out to do and what it finished, so a
// finished turn can be read back instead of only watched — and a reader scrolling back sees
// the list as it ended, not only while the Bot was busy.
//
// The list is kept in the browser's storage against the turn it belongs to (turn-plan.js),
// because the Bot's own todo list is replaced by the next turn. This card reads it back by
// that turn's name and counts it with the same function the running row uses, so the two
// never disagree.
import { createElement as h, useState } from 'react'
import { planInWindow, planOfTurn, planLine } from './turn-plan.js'
import { Safe } from './safe.js'
import { t } from './i18n.js'

const TICK = '✓'
// How many steps show before the card folds: enough to see the shape of the work, not a
// wall. The rest are one press away, and the press stays put while the reader scrolls.
const SHOWN = 3

export function PlanTail(props) {
  return h(Safe, { name: 'turn plan' }, h(TailPlan, props))
}

function TailPlan({ turn: location, sessionId }) {
  const [open, setOpen] = useState(false)
  const start = location?.start?.time ?? 0
  const end = location?.end?.time ?? Number.MAX_SAFE_INTEGER
  let items = null
  try {
    // By the turn's own name first; a list kept before the turn id was recorded, or by a
    // window that never learned it, still reads back from its window of time.
    items = planOfTurn(window.localStorage, sessionId, location?.turn) ?? planInWindow(window.localStorage, sessionId, start, end)
  } catch { items = null }
  if (items === null) return null
  const line = planLine(items, false)
  const folded = !open && items.length > SHOWN
  const shown = folded ? items.slice(0, SHOWN) : items
  const rest = items.length - shown.length
  return h('div', { className: 'bt-turn-plan', role: 'group', 'aria-label': t('The plan for this turn') },
    h('div', { className: 'bt-turn-plan-head' },
      h('span', { className: 'bt-turn-plan-count', title: line.count }, line.count),
      h('span', { className: 'bt-turn-plan-title' }, t('The plan'))),
    h('ol', { className: 'bt-turn-plan-list', role: 'list' },
      shown.map((item, index) => h('li', {
        key: `${index}:${item.content}`,
        className: 'bt-turn-plan-item',
        'data-done': item.status === 'completed' ? '' : undefined,
        'data-now': item.status === 'in_progress' ? '' : undefined,
      },
      h('span', { className: 'bt-turn-plan-mark', 'aria-hidden': true }, item.status === 'completed' ? TICK : '·'),
      h('span', { className: 'bt-turn-plan-text' }, item.content)))),
    rest > 0 || open
      ? h('button', { type: 'button', className: 'bt-turn-plan-more', onClick: () => setOpen(value => !value) },
        open ? t('Show less') : t('and {count} more', { count: rest }))
      : null)
}
