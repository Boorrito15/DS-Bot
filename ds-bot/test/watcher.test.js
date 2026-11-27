import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { readWatcherPrefs, stuckSince, makeNotice, WATCHER_DEFAULTS, install as installWatcher } from '../src/host/watcher.js'

// The client module imports the browser's React only for the strip component; its
// readings (watchLook, watchText) are plain functions and bundle with a stand-in.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/watcher.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  external: ['react', './api.js'],
})
const module = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports,
  require: (name) => (name === 'react' ? { createElement: () => null, useEffect: () => {}, useRef: () => ({}), useState: () => [] } : {}),
})
const { watchLook, watchText } = module.exports

const MIN = 60_000

test('the watcher prefs fall back to the defaults for anything unusable', () => {
  assert.deepEqual(readWatcherPrefs(undefined), WATCHER_DEFAULTS)
  assert.deepEqual(readWatcherPrefs({ stuck: 'yes', stuckMinutes: 0, waitingMinutes: 500, finishedMinutes: 12.6 }), {
    ...WATCHER_DEFAULTS, stuckMinutes: WATCHER_DEFAULTS.stuckMinutes, waitingMinutes: WATCHER_DEFAULTS.waitingMinutes, finishedMinutes: 13,
  })
  const off = readWatcherPrefs({ stuck: false, finished: false })
  assert.equal(off.stuck, false)
  assert.equal(off.finished, false)
  assert.equal(off.waiting, true)
})

test('a step still running past the limit is stuck, a finished one never is', () => {
  const entry = { since: 1000, steps: [{ name: 'bash', label: 'Run the tests' }] }
  const now = 1000 + 6 * MIN
  assert.equal(stuckSince(entry, now, 5 * MIN, 1000), 1000)
  assert.equal(stuckSince(entry, now, 5 * MIN, now - 1 * MIN), 0)
  assert.equal(stuckSince({ ...entry, steps: [{ name: 'bash', done: true }] }, now, 5 * MIN, 1000), 0)
  assert.equal(stuckSince(undefined, now, 5 * MIN), 0)
})

test('one notice per piece of work: the same step, approval or ending says nothing twice', () => {
  const a = makeNotice({ kind: 'stuck', bot: { id: 'b', name: 'Writer' }, key: '7', text: 'Run the tests', at: 1000, time: 2000 })
  const b = makeNotice({ kind: 'stuck', bot: { id: 'b', name: 'Writer' }, key: '7', text: 'Run the tests', at: 1000, time: 9000 })
  assert.equal(a.id, b.id)
  const other = makeNotice({ kind: 'waiting', bot: { id: 'b', name: 'Writer' }, key: '7', at: 1000, time: 2000 })
  assert.notEqual(a.id, other.id)
  assert.equal(other.kind, 'waiting')
})

test('the window keeps its own clock for a step, so a slow step is seen as slow', () => {
  const seen = new Map()
  const running = { since: 1000, steps: [{ name: 'bash', label: 'Run the tests' }] }
  const empty = { waiting: {}, approvals: [] }
  const first = watchLook({ work: { bots: { b: running }, ...empty }, now: 1000, seen })
  assert.equal(first.b.going, true)
  assert.equal(first.b.stepAt, 1000)
  const same = watchLook({ work: { bots: { b: running }, ...empty }, now: 4000, seen })
  assert.equal(same.b.stepAt, 1000)
  // A new step restarts the clock; the turn's own start does not.
  const moved = { since: 1000, steps: [{ name: 'bash', done: true }, { name: 'edit', label: 'Change the file' }] }
  const next = watchLook({ work: { bots: { b: moved }, ...empty }, now: 9000, seen })
  assert.equal(next.b.stepAt, 9000)
  assert.equal(next.b.step, 'Change the file')
  // The end of the turn reports how long it ran.
  const over = watchLook({ work: { bots: {}, ...empty }, now: 9000 + 11 * MIN, seen })
  assert.equal(over.b.going, false)
  assert.equal(over.b.ran, 9000 + 11 * MIN - 1000)
})

test('a Bot waiting on the user is reported with when it started waiting', () => {
  const seen = new Map()
  const look = watchLook({ work: { bots: {}, waiting: { b: { since: 5000, bots: [], rooms: [], for: [], waits: [] } }, approvals: [] }, now: 9000, seen })
  assert.equal(look.b.waiting, true)
  assert.equal(look.b.waitingAt, 5000)
  const approval = watchLook({ work: { bots: {}, waiting: {}, approvals: [{ id: 'x', botId: 'b', at: 7000, tool: 'bash' }] }, now: 9000, seen })
  assert.equal(approval.b.waitingAt, 7000)
  assert.equal(approval.b.askText, 'bash')
})

test('a notice reads in plain words, with the time it actually took', () => {
  const at = 1000
  const now = at + 7 * MIN
  assert.equal(watchText({ kind: 'stuck', name: 'Writer', text: 'Run the tests', at }, now), 'Writer is stuck on Run the tests (7 min)')
  assert.equal(watchText({ kind: 'stuck', name: 'Writer', text: '', at }, now), 'Writer has been on the same step for 7 min')
  assert.equal(watchText({ kind: 'waiting', name: 'Writer', at }, now), 'Writer has waited 7 min for your answer')
  assert.equal(watchText({ kind: 'finished', name: 'Writer', at, ran: 14 * MIN }, now), 'Writer finished a 14 min job')
})

// The host decides what is worth saying from what a window reports, so the rule lives
// here too: run against a small stand-in for the runtime.
function host() {
  const state = { prefs: {} }
  const watching = { since: 1000 }
  const published = []
  const rt = {
    ctx: { effect: () => {} },
    state,
    load: async () => {},
    botOf: id => (id === 'b' ? { id: 'b', name: 'Writer' } : undefined),
    workView: () => ({ b: watching }),
    approvalsView: () => [],
    waitingView: () => ({}),
    save: async () => {},
    publishFeed: (event, data) => published.push({ event, data }),
  }
  installWatcher(rt)
  return { rt, state, watching, published }
}

test('the host says a stuck step once, and only while it still sees that turn', async () => {
  const { rt, watching, published } = host()
  const entry = { since: 1000, steps: [{ name: 'bash', label: 'Run the tests' }] }
  // The window's step began 9 minutes ago: past the 5 minute default.
  const bots = { b: { going: true, entry, stepAt: Date.now() - 9 * MIN, step: 'Run the tests' } }
  const first = await rt.watchCheck({ bots })
  assert.deepEqual(first.notices.map(notice => [notice.kind, notice.name, notice.text]), [['stuck', 'Writer', 'Run the tests']])
  const again = await rt.watchCheck({ bots })
  assert.equal(again.notices.length, 1)
  // The turn it saw has since ended and another began: the report is out of date.
  watching.since = 5000
  const stale = { b: { going: true, entry: { ...entry, since: 1000 }, stepAt: Date.now() - 9 * MIN, step: 'Run the tests' } }
  const after = await rt.watchCheck({ bots: stale })
  assert.equal(after.notices.length, 1)
  assert.equal(published.filter(item => item.event === 'watch').length, 1)
})

test('the host keeps the minutes the user set, and a switch that is off says nothing', async () => {
  const { rt, state, watching } = host()
  const bots = { b: { going: true, entry: { since: 1000, steps: [{ name: 'bash', label: 'Run the tests' }] }, stepAt: Date.now() - 4 * MIN, step: 'Run the tests' } }
  // Four minutes is short of the default five.
  assert.equal((await rt.watchCheck({ bots })).notices.length, 0)
  state.prefs.watcher = { stuck: false }
  watching.since = 1000
  assert.equal((await rt.watchCheck({ bots: { ...bots, b: { ...bots.b, stepAt: Date.now() - 30 * MIN } } })).notices.length, 0)
  // Read back the stored switch through the same reader the channel uses.
  assert.equal(readWatcherPrefs(state.prefs.watcher).stuck, false)
  assert.equal(readWatcherPrefs(state.prefs.watcher).stuckMinutes, 5)
})
