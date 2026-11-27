import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notePlan, planInWindow, planOfTurn, planCount, planLine, readPlans } from '../src/client/turn-plan.js'

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

test('a plan is read back by the turn it belongs to, not only by when it was seen', () => {
  const storage = fakeStorage()
  notePlan(storage, 's1', [{ content: 'One', status: 'pending' }], 1000)
  notePlan(storage, 's1', [{ content: 'One', status: 'completed' }, { content: 'Two', status: 'in_progress' }], 2000, 7)
  notePlan(storage, 's1', [{ content: 'One', status: 'completed' }, { content: 'Two', status: 'completed' }], 3000, 7)
  // The next turn starts its own list; the old turn keeps what it ended with.
  notePlan(storage, 's1', [{ content: 'Three', status: 'pending' }], 4000, 8)
  assert.deepEqual(planOfTurn(storage, 's1', 7).map(item => item.status), ['completed', 'completed'])
  assert.deepEqual(planOfTurn(storage, 's1', 8).map(item => item.content), ['Three'])
  assert.equal(planOfTurn(storage, 's1', 9), null)
  assert.equal(planOfTurn(storage, 's1', undefined), null)
})

test('a step marked nowhere still names the step in hand, so a running turn is not 0 for ever', () => {
  const items = [{ content: 'One', status: 'pending' }, { content: 'Two', status: 'pending' }, { content: 'Three', status: 'pending' }]
  // While it runs, the step in hand is drawn as it stands; once the turn is over, nothing
  // is in hand, so the count stands alone rather than naming a step nobody is on.
  assert.deepEqual(planCount(items, true), { done: 0, total: 3, current: 0 })
  assert.deepEqual(planCount(items, false), { done: 0, total: 3, current: -1 })
  assert.equal(planLine(items, true).text, '0/3 · One')
  assert.equal(planLine(items, false).text, '0/3')
  // A list that does say where it is counts that, whether the turn still runs or not.
  const marked = [{ content: 'One', status: 'completed' }, { content: 'Two', status: 'completed' }, { content: 'Three', status: 'pending' }]
  assert.deepEqual(planCount(marked, true), { done: 2, total: 3, current: -1 })
  assert.equal(planLine(marked, true).text, '2/3')
  // The row and the card read the same list to the same number.
  const allDone = items.map(item => ({ ...item, status: 'completed' }))
  assert.equal(planLine(allDone, true).count, planLine(allDone, false).count)
})
