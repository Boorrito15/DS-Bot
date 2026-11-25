// Bringing the server back after it stops is someone else's job: on macOS the launchd job
// that started it. A restart is offered only where that job is found, so a server never
// stops with nobody to raise it again.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const list = promisify(execFile)

// The job that owns this server, if this machine has one. The name is whatever the user
// called it, so it is found by the one word every DS Bot job carries.
export async function supervisorJob({ platform = process.platform, launchctl = list } = {}) {
  if (platform !== 'darwin') return undefined
  try {
    const { stdout } = await launchctl('launchctl', ['list'])
    const labels = stdout.split('\n').slice(1)
      .map(line => line.trim().split(/\s+/).at(-1))
      .filter(label => typeof label === 'string' && /dsbot/i.test(label))
    return labels[0]
  } catch {
    return undefined
  }
}

/**
 * Ask the supervisor to put this server down and start it again, from a process that is not
 * a child of it: the reply to the click has to leave first, and the child of a killed job
 * dies with it. Nothing about the answer is awaited here, because it ends this process.
 */
export function scheduleRestart({ label, uid = process.getuid?.() ?? 501, spawnProcess = spawn, delayMs = 1500 } = {}) {
  if (typeof label !== 'string' || label === '') throw new Error('ds-bot: a restart needs the job that supervises this server')
  const child = spawnProcess('/bin/sh', ['-c', `sleep ${Math.round(delayMs / 1000)}; launchctl kickstart -k gui/${uid}/${label}`], {
    detached: true, stdio: 'ignore',
  })
  child.unref?.()
  return true
}
