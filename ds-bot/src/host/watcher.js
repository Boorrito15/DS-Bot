// The watcher: it reads the work the team already publishes and says out loud what goes
// wrong with it, so a Bot does not sit still for ten minutes without the user knowing.
// Three things are worth saying — a Bot stuck on one step, something waiting on the user
// that has waited long enough, and a long job reaching its end — and nothing else. The
// user reads them in a strip above the chat, not in a Bot's conversation: this is the
// house speaking, and a Bot's chat is the Bot's.
//
// What counts as "too long" is the user's to set, per group of notices, stored with the
// team's other preferences so every device reads the same settings.

export const WATCHER_DEFAULTS = { stuck: true, stuckMinutes: 5, waiting: true, waitingMinutes: 2, finished: true, finishedMinutes: 10 }

// The strip keeps the newest few; older ones are gone by the time the next arrives.
const KEPT = 5

// Numbers stored by hand or by an older window: anything unusable falls back to the
// default rather than turning a switch off by accident.
export function readWatcherPrefs(raw) {
  const value = raw !== null && typeof raw === 'object' ? raw : {}
  const minutes = (input, fallback) => {
    const number = Number(input)
    return Number.isFinite(number) && number >= 1 && number <= 120 ? Math.round(number) : fallback
  }
  const on = (input, fallback) => (typeof input === 'boolean' ? input : fallback)
  return {
    stuck: on(value.stuck, WATCHER_DEFAULTS.stuck),
    stuckMinutes: minutes(value.stuckMinutes, WATCHER_DEFAULTS.stuckMinutes),
    waiting: on(value.waiting, WATCHER_DEFAULTS.waiting),
    waitingMinutes: minutes(value.waitingMinutes, WATCHER_DEFAULTS.waitingMinutes),
    finished: on(value.finished, WATCHER_DEFAULTS.finished),
    finishedMinutes: minutes(value.finishedMinutes, WATCHER_DEFAULTS.finishedMinutes),
  }
}

// One Bot's work as the host publishes it: `{ since, tool, label, note, target, steps }`,
// absent when the Bot is idle. A Bot whose newest step has not finished for longer than
// the limit is stuck on it, whatever the step is. A step's own start time comes from the
// window that watched it; the host stamps only the turn's.
export function stuckSince(entry, now, limitMs, stepAt = 0) {
  if (entry === undefined || entry === null) return 0
  const steps = Array.isArray(entry.steps) ? entry.steps : []
  const newest = steps.at(-1)
  if (newest === undefined || newest.done === true) return 0
  const at = stepAt > 0 ? stepAt : (Number.isFinite(entry.since) ? entry.since : 0)
  if (at <= 0) return 0
  return now - at >= limitMs ? at : 0
}

// A notice the server makes: `kind` stuck | waiting | finished, the Bot, what to say, and
// which piece of work it is about, so a second poll over the same work says nothing twice.
export function makeNotice({ kind, bot, key, text, at, time }) {
  return { id: `${kind}:${bot.id}:${key}`, kind, botId: bot.id, name: bot.name, text, at, time }
}

export function install(rt) {
  const { ctx, state } = rt

  const prefs = () => {
    const stored = readWatcherPrefs(state.prefs.watcher)
    state.prefs.watcher = stored
    return stored
  }

  // What the user said was already worth saying. Kept per window of the host, in memory:
  // a restart says the whole picture again rather than nothing.
  const said = new Map()
  const latest = []

  const addNotice = (notice) => {
    latest.push(notice)
    if (latest.length > KEPT) latest.splice(0, latest.length - KEPT)
    rt.publishFeed?.('watch', notice)
  }

  // Take the findings of one look, one Bot at a time.
  function note(entry) {
    if (entry === null || entry === undefined) return
    const seen = said.get(entry.botId) ?? { waiting: new Set(), finished: new Set(), stuckAt: 0 }
    if (entry.kind === 'stuck') {
      if (seen.stuckAt === entry.at) return
      seen.stuckAt = entry.at
    } else {
      const set = seen[entry.kind]
      if (set === undefined || set.has(entry.key)) return
      set.add(entry.key)
    }
    said.set(entry.botId, seen)
    addNotice(entry)
  }

  // A Bot that left the team leaves nothing to say about it.
  const forgetWatch = (botId) => { said.delete(botId) }

  // The client's strip: what the host noticed, and when it looked last.
  const watchView = () => ({ notices: latest, checkedAt: Date.now() })

  // A window reports what it saw of each Bot's work and the host decides what is worth
  // saying. The window owns nothing but the reading; the host keeps the record, so two
  // windows open on two machines do not say the same thing twice.
  async function watchCheck(body) {
    await rt.load()
    const settings = prefs()
    const now = Date.now()
    const bots = body && typeof body.bots === 'object' && body.bots !== null ? body.bots : {}
    const work = rt.workView?.() ?? {}
    const approvals = rt.approvalsView?.() ?? []
    const waiting = rt.waitingView?.() ?? {}
    for (const [botId, look] of Object.entries(bots)) {
      const bot = rt.botOf(botId)
      if (bot === undefined) continue
      const going = work[botId]
      // Stuck on a step: one notice per step, however many polls see it still running.
      // `entry` is what this window saw; the host's own copy says whether the turn is
      // still the one it saw, so a look that crossed the turn's end says nothing.
      if (settings.stuck && going !== undefined && look?.entry != null && going.since === look.entry.since) {
        const at = stuckSince(look.entry, now, settings.stuckMinutes * 60_000, Number(look.stepAt) || 0)
        if (at > 0) note(makeNotice({ kind: 'stuck', bot, key: String(at), at, time: now,
          text: look.step === undefined || look.step === '' ? '' : String(look.step).slice(0, 160) }))
      }
      const waitingSince = (approvals.find(item => item.botId === botId)?.at ?? waiting[botId]?.since
        ?? ((look?.waiting === true && Number.isFinite(look.waitingAt)) ? look.waitingAt : undefined))
      if (settings.waiting && typeof waitingSince === 'number' && now - waitingSince >= settings.waitingMinutes * 60_000) {
        note(makeNotice({ kind: 'waiting', bot, key: String(waitingSince), at: waitingSince, time: now, text: look?.askText ?? '' }))
      }
      // A long job over: the turn it ran is gone and how long it ran is worth saying.
      if (settings.finished && look?.going === false && Number.isFinite(look.ran) && look.ran >= settings.finishedMinutes * 60_000) {
        const at = Number.isFinite(look.finishedAt) ? look.finishedAt : now
        note(makeNotice({ kind: 'finished', bot, key: String(at), at, time: now, text: '', ran: look.ran }))
      }
    }
    return watchView()
  }

  ctx.effect(() => () => { said.clear(); latest.length = 0 }, 'ds-bot: watcher record')

  Object.assign(rt, { watchCheck, watchView, forgetWatch })
}
