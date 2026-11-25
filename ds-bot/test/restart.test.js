import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleRestart, supervisorJob } from '../src/host/restart.js'

const listOf = rows => async () => ({ stdout: ['PID\tStatus\tLabel', ...rows].join('\n') })

test('the job that supervises the server is found by the word every DS Bot job carries', async () => {
  const found = await supervisorJob({ launchctl: listOf(['123\t0\tcom.apple.something', '456\t0\tapp.dsbot.web']) })
  assert.equal(found, 'app.dsbot.web')
})

test('no job means no restart: a server nothing raises again is not put down', async () => {
  assert.equal(await supervisorJob({ launchctl: listOf(['123\t0\tcom.apple.something']) }), undefined)
  assert.equal(await supervisorJob({ launchctl: async () => { throw new Error('no launchctl') } }), undefined)
  assert.equal(await supervisorJob({ platform: 'linux' }), undefined)
})

test('a restart is asked for from a process of its own, after the reply has left', () => {
  const calls = []
  const spawnProcess = (command, args, options) => { calls.push({ command, args, options }); return { unref() {} } }
  scheduleRestart({ label: 'app.dsbot.web', uid: 501, spawnProcess })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, '/bin/sh')
  assert.match(calls[0].args[1], /^sleep \d; launchctl kickstart -k gui\/501\/app\.dsbot\.web$/)
  assert.equal(calls[0].options.detached, true)
})

test('a restart without a job is refused rather than half done', () => {
  assert.throws(() => scheduleRestart({ label: '', spawnProcess: () => ({ unref() {} }) }), /supervises this server/)
})
