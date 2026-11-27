import { createElement as h, useEffect, useRef, useState } from 'react'
import { call } from './api.js'
import { t } from './i18n.js'

// -------------------------------------------------------------------------
// The watcher's strip: what the host noticed about the team and the user has not
// dismissed — a Bot stuck on one step, something waiting on them too long, a long job
// just over. The window does the looking (it knows when a step started and how long a
// turn ran); the host decides what is worth saying and keeps the record, so two windows
// say it once between them.
//
// It is the house speaking, so it does not go into a Bot's chat. It sits in the dock
// above the composer, where the eye already goes for work in progress, and each line
// opens the Bot it is about.

// How often the window looks while anything is moving. A still team costs one look a
// minute, enough to notice something that starts waiting on the user.
const LOOK_MS = 10_000
const LOOK_REST_MS = 60_000
const SHOWN_MAX = 2

// What one Bot looks like from this window: whether a turn runs, the step under way,
// when this window first saw that step, whether it waits on the user, and — on the look
// that sees a turn end — how long the turn actually ran.
export function watchLook({ work, now, seen }) {
  const bots = {}
  const workBots = work?.bots ?? {}
  const waits = work?.waiting ?? {}
  const asks = work?.approvals ?? []
  const ids = new Set([...Object.keys(workBots), ...Object.keys(waits), ...asks.map(entry => entry?.botId), ...seen.keys()])
  for (const id of ids) {
    const entry = workBots[id]
    const going = entry !== undefined
    const was = seen.get(id)
    const look = { going }
    if (going) {
      const steps = Array.isArray(entry.steps) ? entry.steps : []
      const newest = steps.at(-1)
      const running = newest !== undefined && newest.done !== true
      const key = running ? `${steps.length}:${newest.name}:${newest.target ?? ''}` : null
      const stepAt = key === null ? 0 : was?.stepKey === key ? was.stepAt : now
      look.stepAt = stepAt
      look.step = running ? String(newest.label ?? newest.target ?? newest.name ?? '') : ''
      const since = was?.since ?? (Number.isFinite(entry.since) ? entry.since : now)
      seen.set(id, { stepKey: key, stepAt, since })
    } else {
      // The turn just ended: how long it ran, for the host to judge a long job by.
      if (was !== undefined && was.since > 0) {
        look.ran = now - was.since
        look.finishedAt = now
      }
      seen.delete(id)
    }
    const approval = asks.find(item => item?.botId === id)
    const wait = waits[id]
    const waitingAt = Number.isFinite(approval?.at) ? approval.at : Number.isFinite(wait?.since) ? wait.since : undefined
    if (waitingAt !== undefined) {
      look.waiting = true
      look.waitingAt = waitingAt
      look.ask = approval !== undefined || wait !== undefined
      look.askText = approval?.tool ?? ''
    }
    bots[id] = look
  }
  return bots
}

// One line: who, then what. Past the newest two the oldest give way, rather than the
// strip growing into a wall above the composer.
export function WatchStrip({ useRoster, useWork, actions }) {
  const roster = useRoster(value => value)
  const work = useWork?.(value => value) ?? { bots: {}, approvals: [], waiting: {} }
  const [notices, setNotices] = useState([])
  // This window's own clock for each step and turn, between looks.
  const seen = useRef(new Map())
  const dismissed = useRef(new Set())
  const workKey = JSON.stringify(work)
  // The dock is drawn for every view, including plain DSH Sessions that have no Bot
  // team around them; only a view with a team looks and says anything.
  const watching = useWork !== undefined && roster.ready !== false && Object.keys(roster.byId ?? {}).length > 0
  useEffect(() => {
    if (!watching) return () => {}
    let stopped = false
    let timer
    const look = async () => {
      const bots = watchLook({ work: JSON.parse(workKey), now: Date.now(), seen: seen.current })
      const busy = Object.keys(bots).length
      let quiet = busy === 0 || Object.values(bots).every(item => item.going !== true && item.waiting !== true)
      try {
        const value = await call('watch-check', { bots })
        if (!stopped && Array.isArray(value?.notices)) setNotices(value.notices)
      } catch {
        // A host too old to know the endpoint never answers it; the strip leaves the
        // chat it is in alone rather than sitting empty over the comma.
        if (!stopped) setNotices([])
        quiet = true
      }
      if (stopped) return
      timer = setTimeout(look, quiet ? LOOK_REST_MS : LOOK_MS)
    }
    void look()
    return () => { stopped = true; clearTimeout(timer) }
  }, [workKey, watching])
  const lines = notices.filter(notice => !dismissed.current.has(notice.id)).slice(-SHOWN_MAX).reverse()
  const hide = (id) => { dismissed.current.add(id); setNotices(current => current.filter(notice => notice.id !== id)) }
  if (!watching || lines.length === 0) return null
  return h('div', { className: 'bt-watch', role: 'status', 'aria-live': 'polite' },
    lines.map(notice => {
      const bot = roster?.byId?.[notice.botId]
      const text = watchText(notice)
      const open = () => { hide(notice.id); if (bot) actions?.openSession?.(bot.id) }
      return h('div', { key: notice.id, className: 'bt-watch-line', 'data-kind': notice.kind },
        h('button', { type: 'button', className: 'bt-watch-open', onClick: open },
          h('span', { className: 'bt-watch-dot', 'aria-hidden': true }),
          h('span', { className: 'bt-watch-text' }, text)),
        h('button', { type: 'button', className: 'bt-watch-x', 'aria-label': t('Dismiss'), onClick: () => hide(notice.id) }, '×'))
    }))
}

// What a notice says, in plain words. The time comes from the notice's own stamps, so a
// line stays true when a setting changes later.
export function watchText(notice, now = Date.now(), tr = t) {
  const name = notice.name ?? tr('A Bot')
  const minutes = Math.max(1, Math.round((now - notice.at) / 60_000))
  if (notice.kind === 'stuck') {
    return notice.text === ''
      ? tr('{name} has been on the same step for {n} min', { name, n: minutes })
      : tr('{name} is stuck on {step} ({n} min)', { name, step: notice.text, n: minutes })
  }
  if (notice.kind === 'waiting') return tr('{name} has waited {n} min for your answer', { name, n: minutes })
  return tr('{name} finished a {n} min job', { name, n: Math.max(1, Math.round((notice.ran ?? 0) / 60_000)) })
}

export const WATCH_CSS = `
.bt-watch{display:flex;flex-direction:column;gap:4px;max-width:min(680px,100%);margin:0 auto 8px}
.bt-watch-line{display:flex;align-items:center;border-radius:12px;background:var(--bt-main);box-shadow:0 0 0 .5px var(--bt-line-2),0 2px 8px -3px rgba(0,0,0,.14);font-size:12.5px;line-height:18px;color:var(--bt-ink-2);animation:bt-rise .18s ease-out backwards}
.bt-watch-line:hover{background:color-mix(in srgb,var(--bt-ink) 3%,var(--bt-main))}
.bt-watch-open{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:32px;padding:0 4px 0 12px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.bt-watch-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--bt-ink-3)}
.bt-watch-line[data-kind="stuck"] .bt-watch-dot{background:var(--bt-warn)}
.bt-watch-line[data-kind="waiting"] .bt-watch-dot{background:color-mix(in srgb,var(--bt-warn) 70%,var(--bt-star))}
.bt-watch-line[data-kind="finished"] .bt-watch-dot{background:var(--bt-green)}
.bt-watch-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-watch-x{flex:none;width:28px;height:28px;margin-right:2px;border:0;border-radius:8px;background:none;color:var(--bt-ink-3);font:inherit;font-size:15px;line-height:1;cursor:pointer}
.bt-watch-x:hover{background:var(--bt-hover);color:var(--bt-ink)}
@media (prefers-reduced-motion:reduce){.bt-watch-line{animation:none}}
`
