import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeRemoteUrl, remoteUrlOf, shownRemoteUrl } from '../src/remote-url.mjs'

test('an address is taken as http or https, without a trailing slash or hash', () => {
  assert.equal(normalizeRemoteUrl('http://192.168.1.20:8080'), 'http://192.168.1.20:8080')
  assert.equal(normalizeRemoteUrl('http://192.168.1.20:8080/'), 'http://192.168.1.20:8080')
  assert.equal(normalizeRemoteUrl(' https://mac-mini.tailnet.ts.net/ds/ '), 'https://mac-mini.tailnet.ts.net/ds')
  // A bare host loses its slash as before; a browser puts it back when it loads the address.
  assert.equal(normalizeRemoteUrl('http://127.0.0.1:7331/?token=abc#top'), 'http://127.0.0.1:7331?token=abc')
})

test('the sign-in a remote server printed stays on the address, and off the shown one', () => {
  assert.equal(shownRemoteUrl('https://mini.tailnet.ts.net/?token=abc'), 'https://mini.tailnet.ts.net')
  assert.equal(shownRemoteUrl('https://mini.tailnet.ts.net/ds/?token=abc'), 'https://mini.tailnet.ts.net/ds')
  assert.equal(shownRemoteUrl('https://mini.tailnet.ts.net/ds'), 'https://mini.tailnet.ts.net/ds')
  assert.equal(shownRemoteUrl('not a url'), undefined)
})

test('anything that is not an http address is refused', () => {
  assert.equal(normalizeRemoteUrl(''), undefined)
  assert.equal(normalizeRemoteUrl(undefined), undefined)
  assert.equal(normalizeRemoteUrl('file:///etc/passwd'), undefined)
  assert.equal(normalizeRemoteUrl('javascript:alert(1)'), undefined)
  assert.equal(normalizeRemoteUrl('not a url'), undefined)
})

test('the address comes from the argument, or the environment when there is none', () => {
  assert.equal(remoteUrlOf(['--remote', 'http://mini:8080'], {}), 'http://mini:8080')
  assert.equal(remoteUrlOf(['--remote=http://mini:9090'], {}), 'http://mini:9090')
  assert.equal(remoteUrlOf([], { DS_BOT_REMOTE: 'http://env:8080' }), 'http://env:8080')
  assert.equal(remoteUrlOf(['--remote'], { DS_BOT_REMOTE: 'http://env:8080' }), 'http://env:8080')
  assert.equal(remoteUrlOf([], {}), undefined)
})

test('a plain start asks for no computer', () => {
  assert.equal(remoteUrlOf(['--inspect=9000'], {}), undefined)
})
