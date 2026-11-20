// Connecting to a computer that is already running DS Bot: this app loads that DSH's page
// instead of starting a Host of its own. The address comes from `--remote <url>` or
// DS_BOT_REMOTE, and only an http(s) address is taken, so a normal start never changes
// because of what happens to be in the environment.

// The page lives at the base of the address: the query and the hash are dropped and a
// trailing slash goes, because the window's navigation guard matches the origin it has.
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
  return `${url.origin}${path}`
}

export function remoteUrlOf(argv = [], env = process.env) {
  const at = argv.indexOf('--remote')
  const fromArgs = at >= 0 ? argv[at + 1] : argv.find(value => value.startsWith('--remote='))?.slice('--remote='.length)
  return normalizeRemoteUrl(fromArgs ?? env.DS_BOT_REMOTE)
}
