// Plan usage: how much of each paid subscription the account has spent. A provider
// reports its own windows (a Claude plan a rolling session and a week, some plans a
// month), so each source draws three arcs inside each other, one per window it has,
// and a line for the numbers. A source that is not signed in or cannot be read says
// so and draws nothing, so an empty ring never reads as "all used".
import { createElement as h } from 'react'
import { t } from './i18n.js'

const SIZE = 82
const CENTER = SIZE / 2
const RADII = [33, 23.5, 14]
const STROKE = 6
const PAINTS = ['var(--bt-accent)', 'var(--bt-ink-2)', 'var(--bt-ink-3)']

const percentText = used => `${Math.round((used ?? 0) * 100)}%`

// "in 3h", "in 2d", or a clock time when it is close.
export function resetText(resetsAt, now = Date.now()) {
  if (!Number.isFinite(resetsAt)) return ''
  const left = resetsAt - now
  if (left <= 0) return t('now')
  const minutes = Math.round(left / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function Arc({ window, index, paint }) {
  const radius = RADII[index] ?? RADII[0]
  const length = 2 * Math.PI * radius
  const share = Math.max(0, Math.min(1, window.used ?? 0))
  return h('g', null,
    h('circle', { cx: CENTER, cy: CENTER, r: radius, fill: 'none', stroke: 'var(--bt-line)', strokeWidth: STROKE }),
    share > 0
      ? h('circle', {
        cx: CENTER, cy: CENTER, r: radius, fill: 'none', stroke: paint, strokeWidth: STROKE, strokeLinecap: 'round',
        strokeDasharray: `${Math.max(0.5, length * share)} ${length}`, transform: `rotate(-90 ${CENTER} ${CENTER})`,
      })
      : null)
}

function Ring({ source }) {
  const windows = source.windows ?? []
  const session = windows.find(window => window.id === 'session') ?? windows[0]
  return h('div', { className: 'bt-pr-rings', 'aria-hidden': true },
    h('svg', { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}` },
      windows.map((window, index) => h(Arc, { key: window.id ?? index, window, index, paint: PAINTS[index % PAINTS.length] }))),
    session !== undefined ? h('span', { className: 'bt-pr-big' }, percentText(session.used)) : null)
}

function Source({ source }) {
  const windows = source.windows ?? []
  const plan = source.plan ? String(source.plan) : ''
  return h('div', { className: 'bt-pr-source', 'data-state': source.state },
    h(Ring, { source }),
    h('div', { className: 'bt-pr-copy' },
      h('div', { className: 'bt-pr-head' },
        h('b', null, source.name),
        plan ? h('span', { className: 'bt-pr-plan' }, plan) : null),
      source.state === 'ready'
        ? windows.map((window, index) => h('div', { key: window.id ?? index, className: 'bt-pr-line' },
          h('i', { className: 'bt-pr-dot', style: { background: PAINTS[index % PAINTS.length] } }),
          h('span', { className: 'bt-pr-label' }, t(window.label ?? window.id)),
          h('span', { className: 'bt-pr-value' }, percentText(window.used)),
          window.resetsAt !== undefined ? h('span', { className: 'bt-pr-reset' }, t('resets in {time}', { time: resetText(window.resetsAt) })) : null))
        : h('div', { className: 'bt-pr-line bt-pr-quiet' }, reasonText(source)))
  )
}

function reasonText(source) {
  if (source.state === 'signed-out') return t('Not signed in on this computer')
  if (source.state === 'unknown-shape') return t('Signed in, but the answer was not a shape DS Bot knows')
  if (source.state === 'error') return t('Could not read it') + (source.error ? `: ${source.error}` : '')
  return ''
}

export function PlanRings({ view, error }) {
  const sources = view?.sources ?? []
  if (error && sources.length === 0) return null
  return h('section', { className: 'bt-pr', 'aria-label': t('Plan usage') },
    h('div', { className: 'bt-pr-card' },
      h('div', { className: 'bt-pr-title' },
        h('h3', null, t('Plan usage')),
        h('span', { className: 'bt-pr-note' }, t('The accounts you signed in to, not this computer’s tools.'))),
      sources.length === 0
        ? h('div', { className: 'bt-pr-empty' }, t('No signed-in account to read'))
        : sources.map(source => h(Source, { key: source.id, source }))))
}

export const PLAN_RINGS_CSS = `
.bt-pr{display:block}
.bt-pr-card{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border:.5px solid var(--bt-line);border-radius:16px;background:var(--bt-card)}
.bt-pr-title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.bt-pr-title h3{margin:0;font-size:13px;font-weight:600}
.bt-pr-note{font-size:12px;color:var(--bt-ink-3)}
.bt-pr-empty{font-size:12px;color:var(--bt-ink-3)}
.bt-pr-source{display:flex;align-items:center;gap:16px}
.bt-pr-rings{position:relative;flex:none;width:82px;height:82px;display:flex;align-items:center;justify-content:center}
.bt-pr-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.bt-pr-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.bt-pr-head{display:flex;align-items:baseline;gap:8px}
.bt-pr-head b{font-size:13px;font-weight:600}
.bt-pr-plan{font-size:11px;color:var(--bt-ink-3);text-transform:capitalize}
.bt-pr-line{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--bt-ink-2)}
.bt-pr-dot{width:7px;height:7px;border-radius:50%;flex:none}
.bt-pr-label{min-width:62px}
.bt-pr-value{font-variant-numeric:tabular-nums;font-weight:600;color:var(--bt-ink)}
.bt-pr-reset{color:var(--bt-ink-3)}
.bt-pr-quiet{color:var(--bt-ink-3)}
`
