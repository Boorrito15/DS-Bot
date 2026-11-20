import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planPercent, planReason, planReset, planWindows } from './plans.ts'

test('a share reads as a whole percent, clamped to the ring', () => {
  assert.equal(planPercent(0.4213), '42%')
  assert.equal(planPercent(0), '0%')
  assert.equal(planPercent(1), '100%')
  assert.equal(planPercent(1.4), '100%')
  assert.equal(planPercent(undefined), '0%')
})

test('a reset reads in the largest unit that fits', () => {
  const now = 1_000_000
  assert.equal(planReset(now + 90_000, now), '2m')
  assert.equal(planReset(now + 3 * 3600_000, now), '3h')
  assert.equal(planReset(now + 2 * 86400_000, now), '2d')
  assert.equal(planReset(now - 5, now), 'now')
  assert.equal(planReset(undefined, now), '')
})

test('the windows keep the ring order whatever order they arrive in', () => {
  const windows = planWindows({ id: 'a', windows: [{ id: 'month', used: 0.3 }, { id: 'session', used: 0.1 }, { id: 'week', used: 0.2 }] })
  assert.deepEqual(windows.map(window => window.id), ['session', 'week', 'month'])
  assert.deepEqual(planWindows(undefined), [])
})

test('a source without numbers keeps the reason it has none', () => {
  assert.equal(planReason({ id: 'a', state: 'signed-out' }), 'signed-out')
  assert.equal(planReason({ id: 'a', state: 'unknown-shape' }), 'unknown-shape')
  assert.equal(planReason({ id: 'a', state: 'error', error: 'HTTP 403' }), 'error')
  assert.equal(planReason({ id: 'a', state: 'ready', windows: [] }), undefined)
})
