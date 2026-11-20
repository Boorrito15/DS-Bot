import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { anthropicWindows, codexWindows, genericWindows, install, shareOf, WINDOW_ORDER } from '../src/host/subscriptions.js'

// A shape like api/oauth/usage answers on a plan with a session and a week: a share
// between 0 and 1 and the moment it resets.
const anthropicAnswer = {
  five_hour: { utilization: 0.42, resets_at: '2026-11-20T06:00:00.000Z' },
  seven_day: { utilization: 0.18, resets_at: '2026-11-24T00:00:00.000Z' },
  seven_day_opus: { utilization: 0.9, resets_at: '2026-11-24T00:00:00.000Z' },
}

// A shape like Codex answers: two windows with their length in minutes.
const codexAnswer = {
  rate_limits: {
    primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1763600000 },
    secondary: { used_percent: 64, window_minutes: 10080, resets_at: 1764000000 },
  },
}

const home = async (files) => {
  const root = await mkdtemp(join(tmpdir(), 'dsbot-subscriptions-'))
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, typeof body === 'string' ? body : JSON.stringify(body))
  }
  return root
}

test('a share is read from a 0–1 or a 0–100 number', () => {
  assert.equal(shareOf(0.4), 0.4)
  assert.equal(shareOf(40), 0.4)
  assert.equal(shareOf('40%'), 0.4)
  assert.equal(shareOf(1), 1)
  assert.equal(shareOf(0), 0)
  assert.equal(shareOf('nonsense'), undefined)
  assert.equal(shareOf(-1), undefined)
  assert.equal(shareOf(undefined), undefined)
})

test('the Claude answer gives a session and a week, in the ring order', () => {
  const windows = anthropicWindows(anthropicAnswer)
  assert.deepEqual(windows.map(window => window.id), ['session', 'week'])
  assert.equal(windows[0].used, 0.42)
  assert.equal(windows[0].resetsAt, Date.parse('2026-11-20T06:00:00.000Z'))
})

test('a plan with a month keeps it', () => {
  const windows = anthropicWindows({ five_hour: { utilization: 0.1 }, thirty_day: { utilization: 55 } })
  assert.deepEqual(windows.map(window => window.id), ['session', 'month'])
  assert.equal(windows[1].used, 0.55)
})

test('the Codex answer gives a session and a week from the window lengths', () => {
  const windows = codexWindows(codexAnswer)
  assert.deepEqual(windows.map(window => window.id), ['session', 'week'])
  assert.ok(Math.abs(windows[0].used - 0.125) < 1e-9)
  assert.equal(windows[1].used, 0.64)
  // A seconds timestamp becomes milliseconds.
  assert.equal(windows[0].resetsAt, 1763600000 * 1000)
})

test('a shape nobody taught us is read by its own labels, or not at all', () => {
  assert.deepEqual(genericWindows({ fiveHourLimit: { percent: 30 }, weekly: { percent: 80 } }).map(window => window.id), ['session', 'week'])
  assert.deepEqual(genericWindows({ windows: [{ window: '1 month', used: 0.5 }] }).map(window => window.id), ['month'])
  assert.deepEqual(genericWindows({ hello: 'world' }), [])
  assert.deepEqual(genericWindows(null), [])
})

test('a computer with no sign-in says so and asks nothing', async () => {
  const root = await home({})
  let asked = 0
  const rt = { credentialHome: root, runCommand: async () => { throw new Error('no keychain in tests') }, fetchUsage: async () => { asked += 1; throw new Error('should not be called') } }
  install(rt)
  const view = await rt.subscriptionsView()
  assert.deepEqual(view.sources.map(source => source.state), ['signed-out', 'signed-out'])
  assert.equal(asked, 0)
  await rm(root, { recursive: true, force: true })
})

test('a signed-in Claude account answers with its windows in ring order', async () => {
  const root = await home({
    '.claude/.credentials.json': { claudeAiOauth: { accessToken: 'test-token', subscriptionType: 'max' } },
    '.codex/auth.json': { tokens: { access_token: 'codex-token', account_id: 'acct-1' } },
  })
  const seen = []
  const rt = {
    credentialHome: root,
    runCommand: async () => { throw new Error('no keychain in tests') },
    fetchUsage: async (url, init) => {
      seen.push({ url, auth: init.headers.Authorization, beta: init.headers['anthropic-beta'], account: init.headers['chatgpt-account-id'] })
      if (url.includes('anthropic')) return { ok: true, json: async () => anthropicAnswer }
      return { ok: true, json: async () => codexAnswer }
    },
  }
  install(rt)
  const view = await rt.subscriptionsView()
  const claude = view.sources.find(source => source.id === 'anthropic')
  assert.equal(claude.state, 'ready')
  assert.equal(claude.plan, 'max')
  assert.deepEqual(claude.windows.map(window => window.id), WINDOW_ORDER.slice(0, 2))
  assert.deepEqual(claude.windows.map(window => window.label), ['5 hours', '1 week'])
  assert.ok(seen.every(entry => entry.auth.startsWith('Bearer ')))
  assert.equal(seen.find(entry => entry.url.includes('anthropic')).beta, 'oauth-2025-04-20')
  assert.equal(seen.find(entry => entry.url.includes('chatgpt')).account, 'acct-1')
  await rm(root, { recursive: true, force: true })
})

test('a provider that refuses, or answers a shape we do not know, shows no numbers', async () => {
  const root = await home({ '.claude/.credentials.json': { claudeAiOauth: { accessToken: 'test-token' } } })
  const rt = {
    credentialHome: root,
    runCommand: async () => { throw new Error('no keychain in tests') },
    fetchUsage: async (url) => (url.includes('anthropic')
      ? { ok: false, status: 403, text: async () => '{"error":"nope"}' }
      : { ok: true, json: async () => ({ unexpected: true }) }),
  }
  install(rt)
  const view = await rt.subscriptionsView()
  const claude = view.sources.find(source => source.id === 'anthropic')
  assert.equal(claude.state, 'error')
  assert.match(claude.error, /HTTP 403/)
  assert.equal(claude.windows, undefined)
})

test('a source that throws keeps the others working', async () => {
  const root = await home({
    '.claude/.credentials.json': { claudeAiOauth: { accessToken: 'test-token' } },
    '.codex/auth.json': { tokens: { access_token: 'codex-token' } },
  })
  const rt = {
    credentialHome: root,
    runCommand: async () => { throw new Error('no keychain in tests') },
    fetchUsage: async (url) => {
      if (url.includes('anthropic')) throw new Error('offline')
      return { ok: true, json: async () => codexAnswer }
    },
  }
  install(rt)
  const view = await rt.subscriptionsView()
  assert.equal(view.sources.find(source => source.id === 'anthropic').state, 'error')
  assert.equal(view.sources.find(source => source.id === 'codex').state, 'ready')
  await rm(root, { recursive: true, force: true })
})

test('the answer is cached for a minute', async () => {
  const root = await home({ '.codex/auth.json': { tokens: { access_token: 'codex-token' } } })
  let calls = 0
  const rt = { credentialHome: root, runCommand: async () => { throw new Error('no keychain in tests') }, fetchUsage: async () => { calls += 1; return { ok: true, json: async () => codexAnswer } } }
  install(rt)
  await rt.subscriptionsView()
  await rt.subscriptionsView()
  assert.equal(calls, 1) // one source, asked once, the second view served from the cache
  await rm(root, { recursive: true, force: true })
})
