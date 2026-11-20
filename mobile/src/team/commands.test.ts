import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandNamed, commandsFor, matchCommands, parseCommand, unknownCommand } from './commands.ts'

test('a group chat has the goal command, a Bot chat does not', () => {
  assert.deepEqual(commandsFor('room').map(command => command.name), ['scheduled-task', 'goal'])
  assert.deepEqual(commandsFor('bot').map(command => command.name), ['scheduled-task'])
})

test('a slash word and its arguments are one command', () => {
  assert.deepEqual(parseCommand('/scheduled-task'), { name: 'scheduled-task', args: '' })
  assert.deepEqual(parseCommand('  /goal ship it  '), { name: 'goal', args: 'ship it' })
  assert.equal(parseCommand('hello'), undefined)
  assert.equal(parseCommand('/'), undefined)
})

test('a path is a message, not a command', () => {
  // A path has a slash where a command has a word, so it stays a message.
  assert.equal(parseCommand('/usr/bin/env is on the path'), undefined)
  assert.equal(parseCommand('/etc/hosts is wrong'), undefined)
  assert.equal(unknownCommand('/etc/hosts is wrong', commandsFor('bot')), undefined)
})

test('the menu lists every command for a bare slash and narrows as letters come', () => {
  const list = commandsFor('room')
  assert.deepEqual(matchCommands('/', list).map(command => command.name), ['scheduled-task', 'goal'])
  assert.deepEqual(matchCommands('/s', list).map(command => command.name), ['scheduled-task'])
  assert.deepEqual(matchCommands('/G', list).map(command => command.name), ['goal'])
  assert.deepEqual(matchCommands('/nope', list), [])
  assert.deepEqual(matchCommands('/goal now', list), [])
  assert.deepEqual(matchCommands('hello', list), [])
})

test('a slash word nobody knows is named back instead of sent', () => {
  const list = commandsFor('bot')
  assert.equal(unknownCommand('/scheduld', list), 'scheduld')
  assert.equal(unknownCommand('/scheduled-task', list), undefined)
  assert.equal(unknownCommand('/goal', commandsFor('bot')), 'goal')
  assert.equal(unknownCommand('/goal now', list), undefined)
})
