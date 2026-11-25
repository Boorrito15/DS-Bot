import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepLabel, stepTarget } from '../src/host/turns.js'

test('a step names the file, the search or the site it works on', () => {
  assert.equal(stepTarget({ file_path: '/Users/me/code/app/src/servers.mjs' }), 'servers.mjs')
  assert.equal(stepTarget({ pattern: 'callTarget', path: 'src/host' }).length > 0, true)
  assert.equal(stepTarget({ query: 'dsh compaction threshold' }), 'dsh compaction threshold')
  assert.equal(stepTarget({ url: 'https://example.com/a/b' }), 'example.com')
})

test('a shell command says what it does in its own words, and names no file', () => {
  assert.equal(stepLabel({ command: 'npm test', description: 'Run the unit tests' }), 'Run the unit tests')
  assert.equal(stepLabel({ command: 'cd "/Users/me/DS Bot/repo" && npm run lint' }), 'npm run lint')
  assert.equal(stepLabel({ command: "cd /tmp && cd 'a b' && node scripts/check.mjs" }), 'node scripts/check.mjs')
  assert.equal(stepLabel({ command: '   ' }), undefined)
  assert.equal(stepTarget({ command: 'npm test', description: 'Run the unit tests' }), undefined)
})

test('a file step is named by its file, and says what it is doing too', () => {
  assert.equal(stepTarget({ file_path: '/Users/me/app/src/servers.mjs', description: 'Read the servers page' }), 'servers.mjs')
  assert.equal(stepLabel({ file_path: '/Users/me/app/src/servers.mjs', description: 'Read the servers page' }), 'Read the servers page')
})

test('a call with nothing to name has no target, so the row shows only its words', () => {
  assert.equal(stepTarget({}), undefined)
  assert.equal(stepTarget(undefined), undefined)
  assert.equal(stepTarget({ description: '' }), undefined)
})

test('a long name is cut to one row', () => {
  assert.equal(stepTarget({ query: 'x'.repeat(200) }).length, 80)
})
