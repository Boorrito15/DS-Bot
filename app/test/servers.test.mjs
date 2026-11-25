import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SERVERS_MAX, addServer, lastServer, readServers, removeServer, touchServer } from '../src/servers.mjs'

const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-bot-servers-'))
  return { dir, file: join(dir, 'servers.json'), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a server is saved with its address, and the file can be read again', () => {
  const at = folder()
  try {
    const { servers } = addServer(at.file, { name: 'Mac mini', url: 'https://mac-mini.tailnet.ts.net/' })
    assert.equal(servers.length, 1)
    assert.equal(servers[0].name, 'Mac mini')
    assert.equal(servers[0].url, 'https://mac-mini.tailnet.ts.net')
    assert.deepEqual(readServers(at.file).servers, servers)
    assert.equal(JSON.parse(readFileSync(at.file, 'utf8')).version, 1)
  } finally { at.done() }
})

test('the same address twice updates the name instead of adding a row', () => {
  const at = folder()
  try {
    addServer(at.file, { name: 'First', url: 'http://host:8080' })
    const { servers } = addServer(at.file, { name: 'Second', url: 'http://host:8080/' })
    assert.equal(servers.length, 1)
    assert.equal(servers[0].name, 'Second')
  } finally { at.done() }
})

test('a fresh sign-in for the same computer replaces the old one and keeps its name', () => {
  const at = folder()
  try {
    addServer(at.file, { name: 'Mac mini', url: 'https://mini.tailnet.ts.net/?token=old' })
    const { servers } = addServer(at.file, { url: 'https://mini.tailnet.ts.net/?token=new' })
    assert.equal(servers.length, 1)
    assert.equal(servers[0].name, 'Mac mini')
    assert.equal(servers[0].url, 'https://mini.tailnet.ts.net?token=new')
    assert.equal(readServers(at.file).servers[0].url, 'https://mini.tailnet.ts.net?token=new')
  } finally { at.done() }
})

test('a row with no name shows the address without its scheme or sign-in', () => {
  const at = folder()
  try {
    addServer(at.file, { url: 'https://mini.tailnet.ts.net/?token=abc' })
    assert.equal(readServers(at.file).servers[0].name, 'mini.tailnet.ts.net')
  } finally { at.done() }
})

test('an address that is not http is refused, and nothing is written for it', () => {
  const at = folder()
  try {
    assert.throws(() => addServer(at.file, { url: 'file:///etc/passwd' }), /http/)
    assert.deepEqual(readServers(at.file).servers, [])
  } finally { at.done() }
})

test('a row with no name shows the address without its scheme', () => {
  const at = folder()
  try {
    addServer(at.file, { url: 'http://192.168.1.20:8080' })
    assert.equal(readServers(at.file).servers[0].name, '192.168.1.20:8080')
  } finally { at.done() }
})

test('a name is trimmed and kept to one line', () => {
  const at = folder()
  try {
    addServer(at.file, { name: '  Mac   mini \n ', url: 'http://host:8080' })
    assert.equal(readServers(at.file).servers[0].name, 'Mac mini')
  } finally { at.done() }
})

test('removing a server leaves the others, and removing an unknown id changes nothing', () => {
  const at = folder()
  try {
    const first = addServer(at.file, { name: 'A', url: 'http://a:1' }).server
    addServer(at.file, { name: 'B', url: 'http://b:2' })
    assert.deepEqual(removeServer(at.file, 'nope').servers.map(server => server.name), ['B', 'A'])
    assert.deepEqual(removeServer(at.file, first.id).servers.map(server => server.name), ['B'])
  } finally { at.done() }
})

test('the server used last is the one offered first', () => {
  const at = folder()
  try {
    const a = addServer(at.file, { name: 'A', url: 'http://a:1', now: 10 }).server
    addServer(at.file, { name: 'B', url: 'http://b:2', now: 20 })
    assert.equal(lastServer(readServers(at.file)), undefined)
    touchServer(at.file, a.id, 30)
    assert.equal(lastServer(readServers(at.file))?.name, 'A')
    // An address that is not in the list yet (a --remote launch) is matched by address.
    touchServer(at.file, 'http://b:2', 40)
    assert.equal(lastServer(readServers(at.file))?.name, 'B')
  } finally { at.done() }
})

test('the list is capped, and a full list refuses a new address', () => {
  const at = folder()
  try {
    for (let i = 0; i < SERVERS_MAX; i += 1) addServer(at.file, { url: `http://host:${1000 + i}` })
    assert.equal(readServers(at.file).servers.length, SERVERS_MAX)
    assert.throws(() => addServer(at.file, { url: 'http://one-too-many:1' }), /Remove one first/)
  } finally { at.done() }
})

test('a file that is not a server list reads as none, and the next save replaces it', () => {
  const at = folder()
  try {
    writeFileSync(at.file, 'not json')
    assert.deepEqual(readServers(at.file).servers, [])
    addServer(at.file, { url: 'http://host:8080' })
    assert.equal(readServers(at.file).servers.length, 1)
  } finally { at.done() }
})

test('an entry saved with a bad address is dropped, not shown broken', () => {
  const at = folder()
  try {
    writeFileSync(at.file, JSON.stringify({ version: 1, servers: [{ id: 'a', url: 'ftp://x' }, { id: 'b', url: 'http://good:1' }] }))
    assert.deepEqual(readServers(at.file).servers.map(server => server.url), ['http://good:1'])
  } finally { at.done() }
})
