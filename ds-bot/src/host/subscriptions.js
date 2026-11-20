// Plan usage: how much of a paid subscription the account has spent, for the rings on
// the Usage page. The windows belong to the provider (a Claude plan reports a rolling
// session, a week and, on some plans, a month), and they are read from the account's
// own sign-in — the credentials its client keeps after the user logs in — never from
// whether a command line tool happens to be installed on this computer.
//
// Nothing here is required for DS Bot to work: a source that is not signed in, cannot
// be reached, or answers in a shape we do not know says so and shows no numbers.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// A minute of cache: the Usage page is opened by hand, and providers dislike polling.
const CACHE_MS = 60_000
const TIMEOUT_MS = 8_000

const WINDOW_LABELS = { session: '5 hours', week: '1 week', month: '1 month' }

// The three windows, in the order the rings are drawn inside each other.
export const WINDOW_ORDER = ['session', 'week', 'month']

// Where each provider's own client keeps the account it is signed in to.
export function credentialFiles(home = homedir(), env = process.env) {
  return {
    anthropic: [join(home, '.claude', '.credentials.json')],
    codex: [join(env.CODEX_HOME ?? join(home, '.codex'), 'auth.json')],
    zen: [join(home, '.local', 'share', 'opencode', 'auth.json')],
  }
}

// A share between 0 and 1, from a 0–1 or 0–100 number, or undefined.
export function shareOf(value) {
  const number = typeof value === 'string' ? Number(value.replace('%', '')) : value
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return undefined
  return number > 1 ? Math.min(1, number / 100) : number
}

const timeOf = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

// One window out of a provider's own object: its share and when it resets.
function windowOf(entry) {
  if (entry === null || typeof entry !== 'object') return undefined
  const used = shareOf(entry.utilization ?? entry.used_percent ?? entry.usedPercent ?? entry.percent ?? entry.used ?? entry.utilization_percent)
  if (used === undefined) return undefined
  const resetsAt = timeOf(entry.resets_at ?? entry.resetsAt ?? entry.reset_at ?? entry.resets ?? entry.until)
  return { used, ...(resetsAt === undefined ? {} : { resetsAt }) }
}

const pick = (source, keys) => {
  for (const key of keys) if (source?.[key] !== undefined) return source[key]
  return undefined
}

// Anthropic's answer (api/oauth/usage): a rolling session and a week, per model on
// some plans, and a month on the ones that have it.
export function anthropicWindows(body) {
  const windows = []
  const session = windowOf(pick(body, ['five_hour', 'fiveHour', 'session', 'session_5h']))
  if (session !== undefined) windows.push({ id: 'session', ...session })
  const week = windowOf(pick(body, ['seven_day', 'sevenDay', 'week', 'weekly', 'seven_day_all']))
  if (week !== undefined) windows.push({ id: 'week', ...week })
  const month = windowOf(pick(body, ['thirty_day', 'thirtyDay', 'month', 'monthly']))
  if (month !== undefined) windows.push({ id: 'month', ...month })
  return windows
}

// Codex's answer: rate limits with a window length in minutes. 300 minutes is the
// session, 10080 the week; anything else is kept under its own length.
export function codexWindows(body) {
  const limits = pick(body, ['rate_limits', 'rateLimits']) ?? body
  const windows = []
  for (const entry of [limits?.primary, limits?.secondary, ...(Array.isArray(limits?.windows) ? limits.windows : [])]) {
    if (entry === null || typeof entry !== 'object') continue
    const window = windowOf(entry)
    if (window === undefined) continue
    const minutes = Number(entry.window_minutes ?? entry.windowMinutes ?? entry.window)
    const id = !Number.isFinite(minutes) ? undefined : minutes <= 60 * 6 ? 'session' : minutes <= 60 * 24 * 8 ? 'week' : 'month'
    if (id === undefined || windows.some(other => other.id === id)) continue
    windows.push({ id, ...window })
  }
  return windows
}

// Any other answer: read the top level for a key that names one of the three windows,
// then for a list of windows with their own labels.
export function genericWindows(body) {
  if (body === null || typeof body !== 'object') return []
  const named = (pattern) => Object.entries(body).find(([key, value]) => pattern.test(key) && windowOf(value) !== undefined)?.[1]
  const found = [
    ['session', named(/five|5h|session|hour/i)],
    ['week', named(/seven|7d|week/i)],
    ['month', named(/thirty|30d|month/i)],
  ]
  const windows = []
  for (const [id, entry] of found) {
    const window = windowOf(entry)
    if (window !== undefined) windows.push({ id, ...window })
  }
  if (windows.length > 0) return windows
  const list = Array.isArray(body.windows) ? body.windows : Array.isArray(body.limits) ? body.limits : []
  for (const entry of list) {
    const window = windowOf(entry)
    const label = String(entry?.window ?? entry?.id ?? entry?.label ?? '')
    const id = /five|5h|session|hour/i.test(label) ? 'session' : /seven|7d|week/i.test(label) ? 'week' : /thirty|30d|month/i.test(label) ? 'month' : undefined
    if (window !== undefined && id !== undefined && !windows.some(other => other.id === id)) windows.push({ id, ...window })
  }
  return windows
}

const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

// The Claude client keeps its sign-in in the login keychain on macOS and in a file
// elsewhere; both hold the same JSON.
async function anthropicToken(home, env, run) {
  for (const path of credentialFiles(home, env).anthropic) {
    const body = await readJson(path)
    const token = body?.claudeAiOauth?.accessToken ?? body?.accessToken
    if (typeof token === 'string' && token !== '') return { token, plan: body?.claudeAiOauth?.subscriptionType }
  }
  if (process.platform !== 'darwin') return undefined
  const body = await run('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w']).catch(() => undefined)
  if (typeof body !== 'string' || body.trim() === '') return undefined
  try {
    const parsed = JSON.parse(body)
    const token = parsed?.claudeAiOauth?.accessToken ?? parsed?.accessToken
    if (typeof token === 'string' && token !== '') return { token, plan: parsed?.claudeAiOauth?.subscriptionType }
  } catch { /* not JSON: signed in some other way */ }
  return undefined
}

async function codexToken(home, env) {
  for (const path of credentialFiles(home, env).codex) {
    const body = await readJson(path)
    const token = body?.tokens?.access_token ?? body?.access_token
    const account = body?.tokens?.account_id ?? body?.account_id
    if (typeof token === 'string' && token !== '') return { token, account: typeof account === 'string' ? account : undefined }
  }
  return undefined
}

// The three sources. `url` and `parse` are the provider's own usage endpoint and the
// reader for its answer; `headers` adds what that endpoint wants beside the bearer.
const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Claude',
    signIn: 'Claude Code',
    token: anthropicToken,
    url: 'https://api.anthropic.com/api/oauth/usage',
    headers: { 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01' },
    parse: (body) => {
      const windows = anthropicWindows(body)
      return windows.length > 0 ? windows : genericWindows(body)
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    signIn: 'Codex',
    token: codexToken,
    url: 'https://chatgpt.com/backend-api/wham/usage',
    headers: (credentials) => (credentials.account === undefined ? {} : { 'chatgpt-account-id': credentials.account }),
    parse: (body) => {
      const windows = codexWindows(body)
      return windows.length > 0 ? windows : genericWindows(body)
    },
  },
]

function withLabels(windows) {
  return WINDOW_ORDER
    .map(id => windows.find(window => window.id === id))
    .filter(window => window !== undefined)
    .map(window => ({ ...window, label: WINDOW_LABELS[window.id] }))
}

export function install(rt) {
  // `credentialHome` is a seam for tests; a real host reads the OS home.
  const home = rt.credentialHome ?? homedir()
  const env = process.env
  // The keychain read and the HTTP calls are injectable, so tests never touch either.
  const run = rt.runCommand ?? ((command, args) => new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TIMEOUT_MS }, (error, stdout) => (error !== null ? reject(error) : resolve(stdout)))
  }))
  const request = rt.fetchUsage ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }))
  let cached
  let pending

  const readSource = async (provider) => {
    const credentials = await provider.token(home, env, run).catch(() => undefined)
    if (credentials === undefined) return { id: provider.id, name: provider.name, state: 'signed-out' }
    try {
      const extra = typeof provider.headers === 'function' ? provider.headers(credentials) : provider.headers
      const headers = { Authorization: `Bearer ${credentials.token}`, Accept: 'application/json', ...extra }
      const response = await request(provider.url, { headers })
      if (response?.ok !== true) {
        const body = await response?.text?.().catch(() => '')
        const detail = String(body ?? '').slice(0, 200)
        return { id: provider.id, name: provider.name, state: 'error', plan: credentials.plan, error: `HTTP ${response?.status ?? '?'}${detail === '' ? '' : ` · ${detail}`}` }
      }
      const body = await response.json()
      const windows = withLabels(provider.parse(body))
      if (windows.length === 0) return { id: provider.id, name: provider.name, state: 'unknown-shape', plan: credentials.plan }
      return { id: provider.id, name: provider.name, state: 'ready', plan: credentials.plan, windows }
    } catch (error) {
      return { id: provider.id, name: provider.name, state: 'error', plan: credentials.plan, error: String(error?.message ?? error) }
    }
  }

  // One answer for every source, cached for a minute. A source that fails keeps the
  // others: the page shows what it has.
  rt.subscriptionsView = async () => {
    if (cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.value
    pending ??= (async () => {
      const sources = await Promise.all(PROVIDERS.map(readSource))
      // A plan that is signed in but has no usage endpoint we know of is said plainly.
      const value = { at: Date.now(), sources }
      cached = { at: Date.now(), value }
      return value
    })().finally(() => { pending = undefined })
    return pending
  }

  // The sign-ins this computer has, for the page's empty state.
  rt.subscriptionsCredentialFiles = () => credentialFiles(home, env)
}

export { PROVIDERS, WINDOW_LABELS }
