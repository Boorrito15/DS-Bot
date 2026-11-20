import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAT_ROWS, commandRows } from '../src/host/command-rows.js'

test('a Bot chat has the attach sheet and its scheduled tasks', () => {
  assert.deepEqual(commandRows('bot').map(row => row.id), ['file', 'scheduled-task'])
})

test('a group chat adds the group goal', () => {
  assert.deepEqual(commandRows('room').map(row => row.id), CHAT_ROWS)
  assert.equal(CHAT_ROWS.includes('goal'), true)
})

test('every row carries its own slash word, which is what the phone shows and sends', () => {
  for (const row of commandRows('room')) {
    assert.equal(row.name, row.id)
    assert.match(row.name, /^[a-z][a-z-]*$/)
  }
})
