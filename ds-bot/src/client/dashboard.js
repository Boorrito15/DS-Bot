import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { call } from './api.js'
import { t } from './i18n.js'
import { CloseIcon } from './icons.js'
import { useEscape } from './overlay-hooks.js'

// -------------------------------------------------------------------------
// The dashboard: the team as people, not as numbers. Who is working and on what, who
// is waiting on the user, and what got finished — day by day, as far back as they care
// to scroll. The usage page stays the place for cost; this page answers "what are my
// Bots doing", which a token count never does.

const LIVE_MS = 5_000
const PAGE = 60

const minutes = ms => Math.max(1, Math.round(ms / 60_000))

/** One line for a Bot at work, in the user's words rather than tool names. */
export function workLine(entry) {
  if (entry === undefined || entry === null) return ''
  if (entry.switching === true) return entry.folder === true ? t('Moving to a new working folder') : t('Thinking it over')
  const said = String(entry.label ?? '').trim()
  if (said !== '') return said
  const note = String(entry.note ?? '').trim()
  if (note !== '') return note
  const target = String(entry.target ?? '').trim()
  if (target !== '') return target
  return entry.tool ? t('Working') : t('Thinking it over')
}

/** How a person reads a row: what it is doing, or when it was last done. */
export function stateOf({ going, waiting, last, now, tr = t }) {
  if (waiting > 0) return { state: 'ask', text: waiting === 1 ? tr('Waiting for your answer') : tr('{n} waiting for your answer', { n: waiting }) }
  if (going !== undefined) return { state: 'work', text: workLine(going), since: going.since }
  if (last !== undefined) return { state: 'idle', text: tr('Last finished {when}', { when: awayText(now - last.at, tr) }) }
  return { state: 'idle', text: tr('Nothing finished yet') }
}

function awayText(ms, tr = t) {
  if (!Number.isFinite(ms) || ms < 0) return tr('just now')
  if (ms < 60_000) return tr('just now')
  if (ms < 3_600_000) return tr('{n} min ago', { n: minutes(ms) })
  if (ms < 86_400_000) return tr('{n} h ago', { n: Math.round(ms / 3_600_000) })
  return tr('{n} d ago', { n: Math.round(ms / 86_400_000) })
}

/** The short sentence above the rows: how the team is doing, in counts of people. */
export function summaryOf(rows, tr = t) {
  const working = rows.filter(row => row.state === 'work').length
  const asking = rows.filter(row => row.state === 'ask').length
  const idle = rows.length - working - asking
  if (rows.length === 0) return tr('No Bots yet')
  return [
    working > 0 ? tr('{n} working', { n: working }) : '',
    asking > 0 ? tr('{n} need you', { n: asking }) : '',
    idle > 0 ? tr('{n} free', { n: idle }) : '',
  ].filter(Boolean).join(' · ')
}

// Everything the page draws, from the team the window already has and the history the
// host keeps. A Bot with no row of its own still appears, so an idle Bot is visible.
export function teamRows(roster, live, now) {
  const work = live?.work ?? {}
  const rooms = live?.rooms ?? {}
  const approvals = live?.approvals ?? []
  const waiting = live?.waiting ?? {}
  const last = new Map()
  for (const row of live?.rows ?? []) if (!last.has(row.botId)) last.set(row.botId, row)
  const asksFor = id => approvals.filter(entry => entry.botId === id).length
  const bots = Object.values(roster.byId ?? {}).filter(bot => bot.hidden !== true).map(bot => {
    const going = work[bot.id]
    const waits = waiting[bot.id]
    const state = stateOf({ going, waiting: asksFor(bot.id) + (waits !== undefined && going === undefined ? 1 : 0), last: last.get(bot.id), now })
    return { ...state, kind: 'bot', id: bot.id, name: bot.name, bot }
  })
  const groupRows = Object.values(roster.roomsById ?? {}).map(room => {
    const members = rooms[room.id] ?? []
    const names = members.map(item => roster.byId?.[item.botId]?.name ?? '').filter(Boolean)
    const asking = approvals.filter(entry => entry.roomId === room.id).length
    const first = members.find(item => item.self === true) ?? members[0]
    const state = names.length === 0
      ? stateOf({ waiting: asking, last: (live?.rows ?? []).find(row => row.roomId === room.id), now })
      : { state: asking > 0 ? 'ask' : 'work', text: names.length === 1 ? `${names[0]} · ${workLine(first)}` : t('{n} members working', { n: names.length }), since: first?.since }
    return { ...state, kind: 'group', id: room.id, name: room.name, room }
  })
  // The ones you can act on first, then the ones at work, then the quiet ones.
  const rank = row => (row.state === 'ask' ? 0 : row.state === 'work' ? 1 : 2)
  return [...bots, ...groupRows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

function Dot({ kind }) {
  return h('span', { className: 'bt-dash-dot', 'data-kind': kind, 'aria-hidden': true })
}

function daysOf(pageRows) {
  const days = []
  let current = null
  let key = ''
  for (const row of pageRows) {
    const date = new Date(row.at)
    key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    if (current === null || current.key !== key) {
      current = { key, at: row.at, rows: [] }
      days.push(current)
    }
    current.rows.push(row)
  }
  return days
}

function dayLabel(at, now) {
  const today = new Date(now)
  const date = new Date(at)
  const sameDay = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate()
  if (sameDay) return t('Today')
  const yesterday = new Date(now - 86_400_000)
  if (yesterday.getFullYear() === date.getFullYear() && yesterday.getMonth() === date.getMonth() && yesterday.getDate() === date.getDate()) return t('Yesterday')
  try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date) } catch { return date.toDateString() }
}

// A look at the page without a team behind it: a Bot that is working, one waiting for an
// answer, one quiet, a group, and a day of finished work. Nothing here is real, and the
// page says so above the rows.
export function previewReading(now = Date.now()) {
  const MIN = 60_000
  const rows = [
    { id: 'p:1', at: now - 4 * MIN, start: now - 7 * MIN, ms: 3 * MIN, kind: 'bot', botId: 'p-writer', botName: 'Writer', text: 'Rewrote the onboarding email', steps: 6 },
    { id: 'p:2', at: now - 26 * MIN, start: now - 41 * MIN, ms: 15 * MIN, kind: 'bot', botId: 'p-research', botName: 'Researcher', text: 'Compared three hosting providers', steps: 11 },
    { id: 'p:3', at: now - 2 * 3_600_000, start: now - 2 * 3_600_000 - 9 * MIN, ms: 9 * MIN, kind: 'bot', botId: 'p-runner', botName: 'Runner', text: 'Fixed the failing checkout test', steps: 4 },
    { id: 'p:4', at: now - 3 * 3_600_000, start: now - 3 * 3_600_000 - 18 * MIN, ms: 18 * MIN, kind: 'group', botId: 'p-writer', botName: 'Launch', roomId: 'p-room', roomName: 'Launch', text: 'Drafted the launch checklist', steps: 9 },
  ]
  const previewRoster = {
    byId: {
      'p-writer': { id: 'p-writer', name: 'Writer' },
      'p-research': { id: 'p-research', name: 'Researcher' },
      'p-runner': { id: 'p-runner', name: 'Runner' },
    },
    roomsById: { 'p-room': { id: 'p-room', name: 'Launch' } },
  }
  return {
    roster: previewRoster,
    work: {
      'p-writer': { label: 'Writing the pricing page', since: now - 6 * MIN },
      'p-research': { label: 'Reading two more reviews', since: now - 2 * MIN },
    },
    rooms: { 'p-room': [{ botId: 'p-writer', self: true, since: now - 6 * MIN }, { botId: 'p-research' }] },
    approvals: [{ botId: 'p-runner', roomId: null }, { botId: 'p-writer', roomId: null }],
    waiting: {},
    rows,
    next: 'p:4',
    preview: true,
  }
}

// The page is its own place in the app, not a row in Settings: it answers one question,
// and opening it should not mean walking past the settings list to reach it.
export function DashboardScreen({ roster, actions, preview = false }) {
  const close = () => actions.closeDashboard?.()
  useEscape(() => { if (close) close() })
  return h('div', { className: 'bt-dashboard', role: 'dialog', 'aria-modal': true, 'aria-label': t('Dashboard') },
    h('div', { className: 'bt-dashboard-head' },
      h('div', { className: 'bt-dashboard-title' }, t('Dashboard')),
      actions.closeDashboard ? h('button', { type: 'button', className: 'bt-icon-btn bt-dashboard-close', 'aria-label': `${t('Close')} ${t('Dashboard')}`, title: `${t('Close')} ${t('Dashboard')}`, onClick: close }, h(CloseIcon)) : null),
    h('div', { className: 'bt-dashboard-body' }, h(DashboardPage, { roster, actions, preview })))
}

export function DashboardPage({ roster, actions, preview = false }) {
  const [live, setLive] = useState({ work: {}, rooms: {}, approvals: [], waiting: {}, rows: [], next: null })
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [shown, setShown] = useState(PAGE)
  const busy = useRef(false)

  const read = useCallback(async (limit = PAGE) => {
    if (preview) return
    if (busy.current) return
    busy.current = true
    try {
      const value = await call('dashboard', { limit })
      setLive({ ...value, rows: value.rows ?? [] })
      setFailed(false)
    } catch { setFailed(true) } finally { busy.current = false }
  }, [preview])

  useEffect(() => {
    if (preview) { setLive(previewReading(Date.now())); return undefined }
    void read(shown)
    const timer = setInterval(() => { void read(shown); setNow(Date.now()) }, LIVE_MS)
    return () => clearInterval(timer)
  }, [read, shown, preview])

  const rows = teamRows(preview && live.roster ? live.roster : roster, live, now)
  const days = daysOf(live.rows)
  const openRow = (row) => {
    if (row.kind === 'group') { actions.showDetails?.(row.id) ?? actions.openSession?.(row.id) } else actions.openSession?.(row.id)
  }
  return h('div', { className: 'bt-dash' },
    preview ? h('div', { className: 'bt-dash-preview', role: 'note' }, t('A made-up team, to show the page. Nothing here is real.')) : null,
    h('div', { className: 'bt-dash-sum', role: 'status' }, summaryOf(rows)),
    failed ? h('div', { className: 'bt-dash-err', role: 'alert' }, t('Could not read the team just now. Trying again.')) : null,
    h('div', { className: 'bt-dash-people' },
      rows.map(row => h('button', {
        key: `${row.kind}:${row.id}`, type: 'button', className: 'bt-dash-row', 'data-kind': row.kind,
        onClick: () => openRow(row),
      },
      row.bot ? h('span', { className: 'bt-dash-face' }, row.name.slice(0, 1).toUpperCase()) : h('span', { className: 'bt-dash-face', 'data-group': '' }, '#'),
      h('span', { className: 'bt-dash-text' },
        h('span', { className: 'bt-dash-name' }, row.name),
        h('span', { className: 'bt-dash-state' }, row.text,
          row.since ? h('span', { className: 'bt-dash-time' }, ` · ${minutes(now - row.since)} ${t('min')}`) : null)),
      h(Dot, { kind: row.state })))),
    h('div', { className: 'bt-dash-head' }, t('Finished')),
    days.length === 0
      ? h('div', { className: 'bt-dash-empty' }, t('Nothing finished yet. Work a Bot does will be listed here.'))
      : days.map(day => h('div', { key: day.key, className: 'bt-dash-day' },
        h('div', { className: 'bt-dash-day-label' }, dayLabel(day.at, now)),
        day.rows.map(row => h('div', { key: row.id, className: 'bt-dash-done' },
          h('span', { className: 'bt-dash-done-name' }, row.roomName || row.botName),
          h('span', { className: 'bt-dash-done-what' }, row.text || t('Answered')),
          h('span', { className: 'bt-dash-done-time' }, `${minutes(row.ms)} ${t('min')}`))))),
    live.next !== null && live.rows.length >= shown
      ? h('button', { type: 'button', className: 'bt-dash-more', disabled: loading, onClick: () => { setLoading(true); setShown(value => value + PAGE); setLoading(false) } }, t('Show earlier'))
      : null)
}

export const DASHBOARD_CSS = `
.bt-dashboard{position:fixed;inset:var(--dsh-frame-chrome-top,0px) 0 0;z-index:62;display:flex;flex-direction:column;background:var(--bt-main);overflow:hidden}
.bt-dashboard-head{flex:none;display:flex;align-items:center;gap:8px;height:52px;padding:0 14px 0 18px;border-bottom:.5px solid var(--bt-line-2)}
.bt-dashboard-title{flex:1;min-width:0;font-size:15px;font-weight:600;color:var(--bt-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-dashboard-close{flex:none}
.bt-dashboard-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px 18px 40px}
.bt-dashboard-body .bt-dash{width:100%;max-width:720px;margin:0 auto}
.bt-dash{display:flex;flex-direction:column;gap:10px;padding:4px 2px 24px}
.bt-dash-preview{font-size:12px;line-height:17px;color:var(--bt-ink-3);padding:6px 9px;border-radius:8px;background:var(--bt-tag-bg)}
.bt-dash-sum{font-size:12.5px;line-height:18px;color:var(--bt-ink-3)}
.bt-dash-err{font-size:12px;line-height:17px;color:var(--bt-danger)}
.bt-dash-people{display:flex;flex-direction:column;gap:2px;margin:0 -8px}
.bt-dash-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 10px;border:0;border-radius:12px;background:none;color:var(--bt-ink);font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease}
.bt-dash-row:hover{background:var(--bt-hover)}
.bt-dash-face{flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--bt-tag-bg);color:var(--bt-ink-2);font-size:13px;font-weight:600}
.bt-dash-face[data-group]{border-radius:10px}
.bt-dash-text{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}
.bt-dash-name{font-size:14px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-dash-state{font-size:12px;line-height:16px;color:var(--bt-ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-dash-row[data-kind=ask] .bt-dash-state{color:var(--bt-warn)}
.bt-dash-time{font-variant-numeric:tabular-nums}
.bt-dash-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--bt-line-2)}
.bt-dash-dot[data-kind=work]{background:var(--bt-green)}
.bt-dash-dot[data-kind=ask]{background:var(--bt-warn);box-shadow:0 0 0 3px color-mix(in srgb,var(--bt-warn) 22%,transparent)}
.bt-dash-head{margin-top:8px;font-size:11px;line-height:16px;letter-spacing:.04em;text-transform:uppercase;color:var(--bt-ink-3)}
.bt-dash-empty{font-size:12.5px;line-height:18px;color:var(--bt-ink-3);padding:2px 0 8px}
.bt-dash-day{display:flex;flex-direction:column;gap:1px}
.bt-dash-day-label{font-size:11.5px;line-height:17px;color:var(--bt-ink-3);margin:8px 0 2px}
.bt-dash-done{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:12.5px;line-height:18px;padding:3px 0}
.bt-dash-done-name{flex:none;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-2)}
.bt-dash-done-what{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-3)}
.bt-dash-done-time{flex:none;font-variant-numeric:tabular-nums;color:var(--bt-ink-3)}
.bt-dash-more{align-self:center;margin-top:10px;height:30px;padding:0 14px;border:0;border-radius:999px;background:var(--bt-main);box-shadow:inset 0 0 0 .5px var(--bt-line-2);color:var(--bt-ink-2);font:inherit;font-size:12.5px;cursor:pointer}
.bt-dash-more:hover{background:var(--bt-hover)}
`
