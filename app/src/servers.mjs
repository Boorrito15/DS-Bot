// The computers this app can connect to, kept in the app's own folder. An entry is a DS Bot
// already running somewhere else: the window loads that address instead of starting a Host
// of its own (remote-url.mjs), so nothing here starts or stops anything.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizeRemoteUrl } from './remote-url.mjs'

// More than anyone needs, and small enough that the file stays something to read.
export const SERVERS_MAX = 20
const NAME_MAX = 60

// A name is what the list shows; the address is what it connects to. A name that is only
// spaces falls back to the address, so a row is never blank.
const nameOf = (name, url) => {
  const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  return text === '' ? url.replace(/^https?:\/\//, '') : text
}

const empty = () => ({ version: 1, servers: [] })

/**
 * The saved servers, in the order they were last used, newest first. A file that cannot be
 * read, or holds something else, reads as no servers rather than as an error: the app can
 * still start, and the next save replaces it.
 * @param {string} file
 */
export function readServers(file) {
  let held
  try {
    held = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return empty()
  }
  const servers = Array.isArray(held?.servers) ? held.servers : []
  return {
    version: 1,
    servers: servers
      .filter(server => typeof server?.id === 'string' && typeof server?.url === 'string' && normalizeRemoteUrl(server.url) !== undefined)
      .slice(0, SERVERS_MAX)
      .map(server => ({
        id: server.id,
        name: nameOf(server.name, server.url),
        url: normalizeRemoteUrl(server.url),
        addedAt: Number.isFinite(server.addedAt) ? server.addedAt : 0,
        lastUsedAt: Number.isFinite(server.lastUsedAt) ? server.lastUsedAt : 0,
      })),
  }
}

function write(file, held) {
  mkdirSync(dirname(file), { recursive: true })
  const next = `${file}.${process.pid}.tmp`
  writeFileSync(next, `${JSON.stringify(held, null, 2)}\n`)
  renameSync(next, file)
}

/**
 * Add a server, or rename the one already saved at that address. Throws with a message the
 * window can show when the address is not one this app can load.
 * @param {string} file
 * @param {{ name?: string, url: string, now?: number }} entry
 */
export function addServer(file, { name, url, now = Date.now() }) {
  const remote = normalizeRemoteUrl(url)
  if (remote === undefined) throw new Error('That is not an address this app can open. It needs to start with http:// or https://')
  const held = readServers(file)
  const at = held.servers.findIndex(server => server.url === remote)
  if (at >= 0) {
    const servers = held.servers.map((server, index) => (index === at ? { ...server, name: nameOf(name, remote) } : server))
    const next = { version: 1, servers }
    write(file, next)
    return { servers, server: servers[at] }
  }
  if (held.servers.length >= SERVERS_MAX) throw new Error(`This app holds ${SERVERS_MAX} servers. Remove one first.`)
  const server = { id: randomUUID(), name: nameOf(name, remote), url: remote, addedAt: now, lastUsedAt: 0 }
  const servers = [server, ...held.servers]
  write(file, { version: 1, servers })
  return { servers, server }
}

/** Remove one server. Unknown ids are ignored, so a second click does nothing. */
export function removeServer(file, id) {
  const held = readServers(file)
  const servers = held.servers.filter(server => server.id !== id)
  if (servers.length === held.servers.length) return held
  write(file, { version: 1, servers })
  return { version: 1, servers }
}

/**
 * Note that the app just connected to this one. The address is matched rather than the id,
 * because a launch address (--remote) may not be in the list yet.
 */
export function touchServer(file, idOrUrl, now = Date.now()) {
  const held = readServers(file)
  const servers = held.servers.map(server => (server.id === idOrUrl || server.url === normalizeRemoteUrl(idOrUrl) ? { ...server, lastUsedAt: now } : server))
  write(file, { version: 1, servers })
  return { version: 1, servers }
}

/** The server the app should offer first: the one used most recently, if any. */
export function lastServer(held) {
  const used = held.servers.filter(server => server.lastUsedAt > 0)
  return [...used].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]
}

export const serversFile = (userData) => join(userData, 'servers.json')
