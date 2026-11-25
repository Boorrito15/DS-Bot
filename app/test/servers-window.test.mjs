import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readServers } from '../src/servers.mjs'
import { openServersWindow } from '../src/servers-window.mjs'

function fakeElectron() {
  const windows = []
  const handlers = new Map()
  class FakeWindow {
    constructor(options) {
      this.options = options
      this.events = new Map()
      this.destroyed = false
      this.webContents = { on: () => {}, setWindowOpenHandler: () => {} }
      windows.push(this)
    }
    once(name, fn) { this.events.set(name, fn); return this }
    on(name, fn) { this.events.set(name, fn); return this }
    loadFile(page) { this.page = page; return Promise.resolve() }
    show() { this.shown = true }
    focus() { this.focused = true }
    isDestroyed() { return this.destroyed }
    close() { this.destroyed = true; this.events.get('closed')?.() }
  }
  return {
    windows,
    handlers,
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (channel, fn) => { handlers.set(channel, fn) },
      removeHandler: channel => { handlers.delete(channel) },
    },
    nativeTheme: { shouldUseDarkColors: true },
  }
}

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-bot-servers-window-'))
  const electron = fakeElectron()
  const opened = []
  const local = []
  const win = openServersWindow({
    electron,
    page: '/app/src/servers/servers.html',
    preload: '/app/src/servers-preload.cjs',
    userData: dir,
    currentUrl: 'https://mac-mini.tailnet.ts.net',
    lang: 'en',
    onConnect: url => opened.push(url),
    onLocal: () => local.push(true),
  })
  const call = (channel, payload) => electron.handlers.get(`ds-bot:servers-${channel}`)({ sender: win.webContents }, payload)
  return { dir, electron, win, call, opened, local, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('the window is sandboxed, loads the page, and says where it is now', async () => {
  const at = setup()
  try {
    assert.equal(at.electron.windows.length, 1)
    assert.equal(at.electron.windows[0].options.webPreferences.sandbox, true)
    assert.equal(at.electron.windows[0].options.webPreferences.contextIsolation, true)
    assert.equal(at.electron.windows[0].page, '/app/src/servers/servers.html')
    const state = await at.call('state')
    assert.deepEqual(state.servers, [])
    assert.equal(state.currentUrl, 'https://mac-mini.tailnet.ts.net')
    assert.equal(state.lang, 'en')
  } finally { at.done() }
})

test('adding a server saves it, and a bad address comes back as an error', async () => {
  const at = setup()
  try {
    assert.deepEqual(await at.call('add', { url: 'file:///etc/passwd' }), { error: 'That is not an address this app can open. It needs to start with http:// or https://' })
    const added = await at.call('add', { url: 'http://192.168.1.20:8080', name: 'Mini' })
    assert.equal(added.server.url, 'http://192.168.1.20:8080')
    assert.deepEqual((await at.call('state')).servers.map(server => server.name), ['Mini'])
  } finally { at.done() }
})

test('removing takes the row away', async () => {
  const at = setup()
  try {
    const { server } = await at.call('add', { url: 'http://a:1' })
    await at.call('remove', server.id)
    assert.deepEqual((await at.call('state')).servers, [])
  } finally { at.done() }
})

test('connecting hands the address on, closes the window and frees its channels', async () => {
  const at = setup()
  try {
    const { server } = await at.call('add', { url: 'http://192.168.1.20:8080' })
    assert.deepEqual(await at.call('connect', server.id), { ok: true })
    assert.deepEqual(at.opened, ['http://192.168.1.20:8080'])
    assert.equal(at.win.destroyed, true)
    assert.equal(at.electron.handlers.size, 0)
  } finally { at.done() }
})

test('connecting to a server that is gone answers instead of doing nothing', async () => {
  const at = setup()
  try {
    const answer = await at.call('connect', 'missing')
    assert.equal(answer.error, 'That server is no longer in the list')
    assert.deepEqual(at.opened, [])
    assert.equal(at.win.destroyed, false)
  } finally { at.done() }
})

test('closing from the page frees the channels, so the window can open again', async () => {
  const at = setup()
  try {
    assert.deepEqual(await at.call('close'), { ok: true })
    assert.equal(at.electron.handlers.size, 0)
  } finally { at.done() }
})

test('a message from another frame is refused', () => {
  const at = setup()
  try {
    assert.throws(() => at.electron.handlers.get('ds-bot:servers-state')({ sender: {} }), /Servers window/)
  } finally { at.done() }
})

test('the file the window edits is the app’s own servers.json', async () => {
  const at = setup()
  try {
    await at.call('add', { url: 'http://a:1', name: 'A' })
    assert.deepEqual(readServers(join(at.dir, 'servers.json')).servers.map(server => server.name), ['A'])
  } finally { at.done() }
})

test('the way back to this computer closes the window and asks for a local start', async () => {
  const at = setup()
  try {
    assert.deepEqual(await at.call('local'), { ok: true })
    assert.deepEqual(at.local, [true])
    assert.equal(at.win.destroyed, true)
    assert.equal(at.electron.handlers.size, 0)
  } finally { at.done() }
})
