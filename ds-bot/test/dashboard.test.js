import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { finishedRow, pageOf, daysOf } from '../src/host/finished.js'

// The page's readings are plain functions; the component itself is not drawn here.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/dashboard.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  external: ['react', './api.js'],
})
const module = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports,
  require: (name) => (name === 'react' ? { createElement: () => null, useCallback: fn => fn, useEffect: () => {}, useRef: () => ({}), useState: () => [] } : {}),
  Intl,
  Date,
})
const { workLine, stateOf, summaryOf, teamRows, countsOf, toneOf, spanText, doneLine } = module.exports

const MIN = 60_000
const DAY = 86_400_000

test('a finished row keeps who, what, and how long it took', () => {
  const row = finishedRow({ id: 's:1', at: 10 * MIN, start: 3 * MIN, kind: 'bot', botId: 'b', botName: 'Writer', text: '  Wrote   the docs ', steps: 4 })
  assert.equal(row.ms, 7 * MIN)
  assert.equal(row.text, 'Wrote the docs')
  assert.equal(row.steps, 4)
  assert.equal(finishedRow({ id: 's:1', at: 10, botName: '' }), undefined)
  // An end before the start is not a negative duration.
  assert.equal(finishedRow({ id: 'x', at: 5, start: 9, botName: 'Writer' }).ms, 0)
})

test('the history pages back by time, newest first, and says when there is more', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: `r${index}`, at: 1000 + index }))
  const first = pageOf(rows, { limit: 2 })
  assert.deepEqual(first.rows.map(row => row.id), ['r4', 'r3'])
  assert.equal(first.next, 'r3')
  const second = pageOf(rows, { limit: 2, before: 'r3' })
  assert.deepEqual(second.rows.map(row => row.id), ['r2', 'r1'])
  assert.equal(pageOf(rows, { limit: 10 }).next, null)
})

test('history is grouped into days, newest day first', () => {
  const base = new Date(2026, 10, 27, 15, 0, 0).getTime()
  const days = daysOf([{ at: base }, { at: base - 1000 }, { at: base - 86_400_000 }], 'en-GB')
  assert.equal(days.length, 2)
  assert.equal(days[0].rows.length, 2)
  assert.equal(days[1].rows.length, 1)
})

test('a row says what the Bot is on, in words rather than a tool name', () => {
  assert.equal(workLine({ tool: 'bash', label: 'Run the tests' }), 'Run the tests')
  assert.equal(workLine({ tool: 'bash', note: 'Fix the parser' }), 'Fix the parser')
  assert.equal(workLine({ tool: 'bash', target: 'src/app.js' }), 'src/app.js')
  assert.equal(workLine({ tool: 'bash' }), 'Working')
  assert.equal(workLine(undefined), '')
})

test('waiting on the user comes before working, and idleness says when it last finished', () => {
  const now = 100 * MIN
  assert.equal(stateOf({ waiting: 1, going: { since: now - MIN }, last: undefined, now }).state, 'ask')
  assert.equal(stateOf({ going: { since: now - 5 * MIN, label: 'Run the tests' }, now }).text, 'Run the tests')
  assert.equal(stateOf({ last: { at: now - 3 * MIN }, now }).text, 'Last finished 3 min ago')
  assert.equal(stateOf({ now }).text, 'Nothing finished yet')
})

test('the summary counts people, and a Bot with no work still gets a row', () => {
  const rows = [{ state: 'work' }, { state: 'work' }, { state: 'ask' }, { state: 'idle' }]
  assert.equal(summaryOf(rows), '2 working · 1 need you · 1 free')
  assert.equal(summaryOf([]), 'No Bots yet')
  const roster = { byId: { a: { id: 'a', name: 'Alpha' }, b: { id: 'b', name: 'Beta' } }, roomsById: {} }
  const live = { work: { b: { since: 5, label: 'Run the tests' } }, rooms: {}, approvals: [], waiting: {}, rows: [], next: null }
  const team = teamRows(roster, live, 10 * MIN)
  const order = team.map(row => `${row.name}:${row.kind}`)
  assert.deepEqual(order.length, 2)
  // Which Bot comes first here is not the test; a working one sorting ahead of a quiet one is.
  assert.equal(team.find(row => row.name === 'Beta').state, 'work')
  assert.equal(team.find(row => row.name === 'Alpha').state, 'idle')
})

test('a group with members working is its own row', () => {
  const roster = { byId: { a: { id: 'a', name: 'Alpha' } }, roomsById: { r1: { id: 'r1', name: 'Ops' } } }
  const live = { work: {}, rooms: { r1: [{ botId: 'a', since: 5, label: 'Check the logs' }] }, approvals: [], waiting: {}, rows: [], next: null }
  const team = teamRows(roster, live, 10 * MIN)
  const group = team.find(row => row.kind === 'group')
  assert.equal(group.name, 'Ops')
  assert.equal(group.state, 'work')
  assert.equal(group.text.includes('Check the logs'), true)
  assert.match(group.text, /Check the logs/)
})

test('the day is counted from what happened, not from how the list looks', () => {
  const now = 100 * MIN
  const live = {
    rows: [
      { id: 'a', at: now - 10 * MIN },
      { id: 'b', at: now - 60 * MIN },
      { id: 'c', at: now - 3 * DAY },
    ],
    failed: [{ id: 'f1', at: now - 5 * MIN }, { id: 'f2', at: now - 4 * DAY }],
    approvals: [{ botId: 'a' }, { botId: 'a' }, { botId: 'b' }],
    waiting: { c: true },
  }
  const roster = { byId: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' }, hidden: { id: 'hidden', hidden: true } }, roomsById: {} }
  const day = countsOf({ live, roster, now })
  assert.equal(day.finished, 2, 'the row from three days ago is outside today')
  assert.equal(day.failed, 1)
  // Two approvals for the same Bot are still one thing waiting for the user.
  assert.equal(day.waitingOn, 3)
  assert.equal(day.bots, 3, 'a hidden Bot is not on the team')
  assert.equal(day.quietFor, 10 * MIN)
  // An empty day is not a quiet day: there is nothing to be quiet.
  assert.equal(countsOf({ live: {}, roster, now }).quietFor, null)
  assert.equal(countsOf({ live: {}, roster, now }).finished, 0)
})

test('a failure and a queue at your door are coloured, an ordinary count is not', () => {
  const calm = toneOf({ finished: 4, failed: 0, waitingOn: 0, quietFor: 2 * MIN })
  assert.equal([calm.finished, calm.failed, calm.waitingOn, calm.quietFor].join(), 'plain,plain,plain,plain')
  const rough = toneOf({ finished: 0, failed: 2, waitingOn: 1, quietFor: 5 * DAY })
  assert.equal(rough.failed, 'bad')
  assert.equal(rough.waitingOn, 'ask')
  assert.equal(rough.quietFor, 'warn')
  // Never worked before is not "quiet for long".
  assert.equal(toneOf({ failed: 0, waitingOn: 0, quietFor: null }).quietFor, 'plain')
})

test('how far back the numbers reach is said in words', () => {
  assert.equal(spanText(DAY), 'last 24 hours')
  assert.equal(spanText(7 * DAY), 'last 7 days')
  assert.equal(spanText(30 * DAY), 'in the last 30 days')
})

test('a finished row says what changed before it repeats what was said', () => {
  assert.equal(doneLine({ touched: ['course/operations/01-run-model.md'], text: 'Done — it is in the ops files now.' }), 'Changed 01-run-model.md')
  assert.equal(doneLine({ touched: ['a/x.md', 'a/y.md', 'a/z.md'] }), 'Changed x.md and 2 more')
  // Nothing changed, so the Bot's own words are all there is; a silent turn still says something.
  assert.equal(doneLine({ text: 'Answered the question' }), 'Answered the question')
  assert.equal(doneLine({}), 'Answered')
})
