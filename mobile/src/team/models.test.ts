import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planModelChange, runModelChange, runsOnLocalAgent, summarizeModelChange, SKIP_LOCAL_AGENT, SKIP_UNAVAILABLE } from './models.ts'

const served = ['deepseek-official/deepseek-v4.1', 'deepseek-official/deepseek-flash']

test('a Bot already on the model is kept, and the rest change', () => {
  const plan = planModelChange([
    { id: 'a', model: 'deepseek-official/deepseek-flash' },
    { id: 'b', model: 'deepseek-official/deepseek-v4.1' },
    { id: 'c' },
  ], 'deepseek-official/deepseek-v4.1', served)
  assert.deepEqual(plan.map(entry => entry.action), ['change', 'keep', 'change'])
})

test('a Bot on a local agent keeps its route and is skipped', () => {
  const plan = planModelChange([{ id: 'a', model: 'local-codex-cli/gpt-5' }], 'deepseek-official/deepseek-v4.1', served)
  assert.equal(plan[0].action, 'skip')
  assert.equal(plan[0].reason, SKIP_LOCAL_AGENT)
})

test('a model the computer does not serve changes nothing', () => {
  const plan = planModelChange([{ id: 'a' }], 'someone/else', served)
  assert.equal(plan[0].reason, SKIP_UNAVAILABLE)
})

test('a route is local when it carries the local prefix', () => {
  assert.equal(runsOnLocalAgent('local-claude-code/opus'), true)
  assert.equal(runsOnLocalAgent('deepseek-official/deepseek-flash'), false)
  assert.equal(runsOnLocalAgent(undefined), false)
})

test('a change runs one Bot at a time and a failure does not stop the rest', async () => {
  const seen: string[] = []
  const updateBot = async (id: string, model: string) => {
    seen.push(`${id}:${model}`)
    if (id === 'b') throw new Error('the computer is busy')
    return true
  }
  const results = await runModelChange({
    bots: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd', model: 'local-opencode/x' }],
    ref: 'deepseek-official/deepseek-v4.1', served, updateBot,
  })
  assert.deepEqual(results.map(entry => entry.status), ['updated', 'failed', 'updated', 'skipped'])
  assert.equal(results[1].message, 'the computer is busy')
  assert.deepEqual(seen, ['a:deepseek-official/deepseek-v4.1', 'b:deepseek-official/deepseek-v4.1', 'c:deepseek-official/deepseek-v4.1'])
  assert.deepEqual(summarizeModelChange(results), { total: 4, updated: 2, unchanged: 0, skipped: 1, failed: 1 })
})
