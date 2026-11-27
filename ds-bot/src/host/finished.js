// A record of finished work, for the dashboard: who did what, and how long it took.
//
// The team knows what is running right now (turns.js) and what the models cost (usage.js),
// but neither remembers "the Writer finished a job at four and it took nine minutes". That
// is what a user looking at their Bots as staff actually wants to read back, so this keeps
// it: one row per finished turn that answered someone, and one per finished group round.
//
// It lives in its own small SQLite file beside the usage ledger, with the same careful
// opening: the database is a convenience, and a machine where SQLite is unavailable keeps
// the last few days in memory rather than losing the page altogether.

import { join } from 'node:path'
import { mkdir, unlink } from 'node:fs/promises'

const VERSION = 1
// Kept in memory when there is no database: enough for a working day.
const MEMORY_ROWS = 2000
// A row is a summary, not a transcript.
const TEXT_MAX = 220

/** The row for one finished turn or round, or undefined when there is nothing to keep. */
export function finishedRow({ id, at, start, kind, botId, botName, roomId, roomName, text, steps }) {
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof botName !== 'string' || botName === '') return undefined
  const from = Number.isFinite(start) && start > 0 && start <= at ? start : at
  return {
    id,
    at,
    start: from,
    ms: Math.max(0, at - from),
    kind: kind === 'group' ? 'group' : 'bot',
    botId: botId ?? '',
    botName,
    roomId: roomId ?? '',
    roomName: roomName ?? '',
    steps: Number.isInteger(steps) && steps > 0 ? steps : 0,
    text: String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX),
  }
}

/** Newest first, bounded by `limit`; `before` names the last row of the page before. */
export function pageOf(rows, { limit = 60, before } = {}) {
  const size = Math.min(Math.max(Number(limit) || 60, 1), 200)
  const sorted = rows.filter(row => row !== undefined).slice().sort((a, b) => b.at - a.at)
  // Pages are taken by row id: the row named `before` itself is never repeated, and two
  // rows that share a millisecond cannot slip between pages.
  const from = typeof before === 'string' ? sorted.findIndex(item => item.id === before) : -1
  const kept = from < 0 ? sorted : sorted.slice(from + 1)
  const page = kept.slice(0, size)
  // The next page starts after the last row shown by its own id, so two rows that share a
  // millisecond neither repeat nor disappear at the seam.
  return { rows: page, next: kept.length > size ? page[page.length - 1].id : null }
}

// The rows grouped by the day they ended, newest day first, in the user's zone.
export function daysOf(rows, locale) {
  const days = new Map()
  for (const row of rows) {
    let label
    try {
      label = new Intl.DateTimeFormat(locale || 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(row.at))
    } catch { label = new Date(row.at).toDateString() }
    const list = days.get(label) ?? []
    list.push(row)
    days.set(label, list)
  }
  return [...days.entries()].map(([day, list]) => ({ day, rows: list }))
}

function sqliteStore(DatabaseSync, path) {
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec('PRAGMA journal_mode = WAL')
    const version = db.prepare('PRAGMA user_version').get().user_version
    if (version !== VERSION) {
      db.exec(`
        DROP TABLE IF EXISTS finished;
        CREATE TABLE finished (id TEXT PRIMARY KEY, at INTEGER NOT NULL, start INTEGER NOT NULL, ms INTEGER NOT NULL, kind TEXT NOT NULL, bot_id TEXT NOT NULL, bot_name TEXT NOT NULL, room_id TEXT NOT NULL, room_name TEXT NOT NULL, steps INTEGER NOT NULL, text TEXT NOT NULL);
        CREATE INDEX finished_at ON finished (at);
        PRAGMA user_version = ${VERSION};`)
    }
    const COLUMNS = 'id, at, start, ms, kind, bot_id, bot_name, room_id, room_name, steps, text'
    const put = db.prepare(`INSERT OR REPLACE INTO finished (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const first = db.prepare(`SELECT ${COLUMNS} FROM finished ORDER BY at DESC LIMIT ?`)
    const byId = db.prepare(`SELECT ${COLUMNS} FROM finished WHERE at <= (SELECT at FROM finished WHERE id = ?) AND id != ? ORDER BY at DESC, id DESC LIMIT ?`)
    return {
      add: (row) => { put.run(row.id, row.at, row.start, row.ms, row.kind, row.botId, row.botName, row.roomId, row.roomName, row.steps, row.text) },
      page: ({ limit, before } = {}) => {
        const size = Math.min(Math.max(Number(limit) || 60, 1), 200)
        // One extra row says whether there is more to read, without a second query.
        const taken = typeof before === 'string' ? byId.all(before, size + 1) : first.all(size + 1)
        const page = taken.slice(0, size).map(toRow)
        return { rows: page, next: taken.length > size ? page[page.length - 1].id : null }
      },
      close: () => db.close(),
    }
  } catch (error) {
    try { db.close() } catch { /* already gone */ }
    throw error
  }
}

function toRow(raw) {
  return {
    id: raw.id, at: raw.at, start: raw.start, ms: raw.ms, kind: raw.kind,
    botId: raw.bot_id, botName: raw.bot_name, roomId: raw.room_id, roomName: raw.room_name,
    steps: raw.steps, text: raw.text,
  }
}

function memoryStore() {
  const rows = []
  return {
    add: (row) => {
      const at = rows.findIndex(item => item.id === row.id)
      if (at >= 0) rows[at] = row
      else rows.push(row)
      if (rows.length > MEMORY_ROWS) rows.splice(0, rows.length - MEMORY_ROWS)
    },
    page: options => pageOf(rows, options),
    close: () => {},
  }
}

export function install(rt) {
  const { ctx, home } = rt
  const path = join(home, 'finished.sqlite')
  let store
  let opening
  const early = []

  function open() {
    if (store !== undefined) return Promise.resolve(store)
    const job = opening ??= (async () => {
      let DatabaseSync
      try {
        ({ DatabaseSync } = await import('node:sqlite'))
        await mkdir(home, { recursive: true })
      } catch (error) {
        rt.warn('ds-bot: finished work is kept in memory only: %s', error)
        return memoryStore()
      }
      const damaged = error => /malformed|not a database|corrupt/i.test(String(error?.message ?? error))
      for (const fresh of [false, true]) {
        try {
          if (fresh) await unlink(path).catch(() => {})
          return sqliteStore(DatabaseSync, path)
        } catch (error) {
          if (fresh || !damaged(error)) {
            rt.warn('ds-bot: finished work is kept in memory only: %s', error)
            return memoryStore()
          }
        }
      }
      return memoryStore()
    })().then((opened) => {
      if (opening !== job) { opened.close(); return memoryStore() }
      for (const row of early.splice(0)) opened.add(row)
      return store = opened
    })
    return job
  }

  const ready = open()

  ctx.effect(() => () => {
    store?.close()
    store = undefined
    opening = undefined
  }, 'ds-bot: finished work')

  // One finished turn or round. Fire and forget: nothing waits on the record.
  rt.noteFinished = (input) => {
    const row = finishedRow({ at: Date.now(), ...input })
    if (row === undefined) return
    if (store === undefined) { early.push(row); return }
    try { store.add(row) } catch (error) { rt.warn('ds-bot: finished work not kept: %s', error) }
  }

  // The dashboard's history, newest first, and where to carry on from.
  rt.finishedPage = async (options = {}) => {
    await ready.catch(() => {})
    try { return store.page(options) } catch (error) { rt.warn('ds-bot: finished work not read: %s', error); return { rows: [], next: null } }
  }

  Object.assign(rt, { finishedDays: (rows, locale) => daysOf(rows, locale) })
}
