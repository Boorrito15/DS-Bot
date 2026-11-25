// Connecting to a computer that is already running DS Bot: this app loads that DSH's page
// instead of starting a Host of its own. The address comes from `--remote <url>` or
// DS_BOT_REMOTE, and only an http(s) address is taken, so a normal start never changes
// because of what happens to be in the environment.

// The page lives at the base of the address: the hash is dropped and a trailing slash goes,
// because the window's navigation guard matches the origin it has. The query stays: a DS Bot
// on another computer puts its one-time sign-in there (`?token=…`), and the page trades it for
// a cookie the first time the window loads it.
export function normalizeRemoteUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}${url.search}`
}

/**
 * The same address without its sign-in: what the list shows, and what tells two entries apart
 * when only the token differs.
 */
export function shownRemoteUrl(value) {
  const remote = normalizeRemoteUrl(value)
  if (remote === undefined) return undefined
  const at = remote.indexOf('?')
  return at < 0 ? remote : remote.slice(0, at)
}

export function remoteUrlOf(argv = [], env = process.env) {
  const at = argv.indexOf('--remote')
  const fromArgs = at >= 0 ? argv[at + 1] : argv.find(value => value.startsWith('--remote='))?.slice('--remote='.length)
  return normalizeRemoteUrl(fromArgs ?? env.DS_BOT_REMOTE)
}
