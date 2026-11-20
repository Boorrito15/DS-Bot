// Plan usage of the signed-in accounts (ds-bot/src/host/subscriptions.js): the windows
// a provider reports, in the order the rings are drawn. A source that is not signed in
// or cannot be read carries a state and no windows, so nothing is drawn as if it were
// empty rather than unread.

export interface PlanWindow { id?: string; label?: string; used?: number; resetsAt?: number }
export interface PlanSource { id: string; name?: string; state?: string; plan?: string; windows?: PlanWindow[]; error?: string }
export interface PlanView { at?: number; sources?: PlanSource[] }

export const WINDOW_ORDER = ['session', 'week', 'month'] as const

export const planPercent = (used?: number): string => `${Math.round(Math.max(0, Math.min(1, used ?? 0)) * 100)}%`

// How long a window has left, short enough for a legend line: "3h", "2d", "now".
export function planReset(resetsAt?: number, now = Date.now()): string {
  if (resetsAt === undefined || !Number.isFinite(resetsAt)) return ''
  const left = resetsAt - now
  if (left <= 0) return 'now'
  const minutes = Math.round(left / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

// The windows in ring order, so the innermost arc is always the same window.
export function planWindows(source?: PlanSource): PlanWindow[] {
  const windows = source?.windows ?? []
  return WINDOW_ORDER
    .map(id => windows.find(window => window.id === id))
    .filter(window => window !== undefined) as PlanWindow[]
}

// Why a source has no numbers, in the words the page shows.
export function planReason(source: PlanSource): 'signed-out' | 'unknown-shape' | 'error' | undefined {
  if (source.state === 'signed-out') return 'signed-out'
  if (source.state === 'unknown-shape') return 'unknown-shape'
  if (source.state === 'error') return 'error'
  return undefined
}
