import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notePlan, planInWindow, readPlans } from '../src/client/turn-plan.js'

const fakeStorage = () => {
  const held = {}
  return { getItem: key => (key in held ? held[key] : null), setItem: (key, value) => { held[key] = String(value) } }
}

test('a plan is kept against the moment it was seen, and read back inside that turn', () => {
  const storage = fakeStorage()
  notePlan(storage, 's1', [{ content: 'Read the code', status: 'completed' }, { content: 'Fix it', status: 'in_progress' }], 1000)
  notePlan(storage, 's1', [{ content: 'Read the code', status: 'completed' }, { content: 'Fix it', status: 'completed' }], 2000)
  const items = planInWindow(storage, 's1', 900, 2500)
  assert.deepEqual(items.map(item => item.status), ['completed', 'completed'])
  assert.equal(planInWindow(storage, 's1', 2501, 9000), null)
})

test('a turn with no plan keeps nothing, and an empty list is not a plan', () => {
  const storage = fakeStorage()
  assert.equal(notePlan(storage, 's1', [], 1000), false)
  assert.equal(notePlan(storage, 's1', [{ content: '   ', status: 'pending' }], 1000), false)
  assert.equal(notePlan(storage, '', [{ content: 'x', status: 'pending' }], 1000), false)
  assert.deepEqual(readPlans(storage), {})
})

test('the same list seen again moves its time instead of filling the record', () => {
  const storage = fakeStorage()
  const list = [{ content: 'One', status: 'pending' }, { content: 'Two', status: 'pending' }]
  for (const at of [100, 200, 300]) notePlan(storage, 's1', list, at)
  assert.equal(readPlans(storage).s1.length, 1)
  assert.equal(planInWindow(storage, 's1', 250, 400).length, 2)
})

test('storage that cannot be read or written is not a crash', () => {
  assert.deepEqual(readPlans(undefined), {})
  assert.equal(planInWindow(undefined, 's1', 0, 1), null)
  const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
  assert.equal(notePlan(broken, 's1', [{ content: 'x', status: 'pending' }], 1), false)
})

test('the record keeps a bounded number of lists per conversation', () => {
  const storage = fakeStorage()
  for (let at = 1; at <= 80; at++) notePlan(storage, 's1', [{ content: `step ${at}`, status: 'pending' }], at)
  assert.equal(readPlans(storage).s1.length, 60)
})
