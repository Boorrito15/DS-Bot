import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addGrant, grantExpired, removeGrant, siteValue, untilOf } from './browser.ts'

test('a site is kept as a bare host and an empty one means every site', () => {
  assert.equal(siteValue('https://Example.com/path?x=1'), 'example.com')
  assert.equal(siteValue('  news.ycombinator.com:443  '), 'news.ycombinator.com')
  assert.equal(siteValue(''), '*')
})

test('a grant runs out at the end of the day it was given for', () => {
  const now = new Date(2026, 10, 20, 9, 30).getTime()
  const today = untilOf('today', now)!
  const end = new Date(today)
  assert.equal(end.getDate(), 20)
  assert.equal(end.getHours(), 23)
  assert.equal(untilOf('permanent', now), undefined)
  assert.equal(untilOf('hour', now), now + 60 * 60 * 1000)
  assert.equal(untilOf('week', now), now + 7 * 24 * 60 * 60 * 1000)
})

test('an expired grant is dead and a permanent one never is', () => {
  const now = 1000
  assert.equal(grantExpired({ site: 'a', until: 999 }, now), true)
  assert.equal(grantExpired({ site: 'a', until: 1000 }, now), true)
  assert.equal(grantExpired({ site: 'a', until: 1001 }, now), false)
  assert.equal(grantExpired({ site: 'a' }, now), false)
})

test('adding a grant drops the ones that already ran out', () => {
  const now = 1000
  const kept = addGrant([{ site: 'old', until: 999 }, { site: 'live' }], { site: 'new', kinds: ['post'] }, now)
  assert.deepEqual(kept.map(grant => grant.site), ['live', 'new'])
})

test('removing the last grant clears the field instead of leaving an empty list', () => {
  const now = 1000
  assert.equal(removeGrant([{ site: 'a' }], 0, now), null)
  assert.deepEqual(removeGrant([{ site: 'a' }, { site: 'b' }], 0, now)?.map(grant => grant.site), ['b'])
})
