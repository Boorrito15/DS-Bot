// Browser grants: a Bot may post, upload, download or delete on a site, for a while.
// The rules are the desktop's (ds-bot/src/client/browser-settings.js), kept free of
// React so they can be tested.

export interface BrowserGrant { site?: string; kinds?: string[]; until?: number }

export const BROWSER_ACTIONS = [['post', 'Post'], ['upload', 'Upload'], ['download', 'Download'], ['delete', 'Delete']] as const
export const BROWSER_DURATIONS = [['hour', '1 hour'], ['today', 'Today'], ['week', '7 days'], ['permanent', 'Permanent']] as const

export type BrowserDuration = typeof BROWSER_DURATIONS[number][0]

// A site is stored as a bare host: no scheme, no path, no port, and "*" for all.
export function siteValue(value: string): string {
  return value.trim().toLowerCase()
    .replace(/^[a-z][a-z\d+.-]*:\/\//, '')
    .split(/[/?#]/, 1)[0]
    .replace(/:\d+$/, '') || '*'
}

export const grantExpired = (grant: BrowserGrant, now = Date.now()): boolean => Number.isFinite(grant.until) && Number(grant.until) <= now

// The moment a grant stops, or undefined for a permanent one.
export function untilOf(duration: BrowserDuration, now = Date.now()): number | undefined {
  if (duration === 'hour') return now + 60 * 60 * 1000
  if (duration === 'today') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return end.getTime()
  }
  if (duration === 'week') return now + 7 * 24 * 60 * 60 * 1000
  return undefined
}

// Adding drops the grants that already ran out, the way the desktop prunes on save.
export function addGrant(grants: BrowserGrant[], grant: BrowserGrant, now = Date.now()): BrowserGrant[] {
  return [...(grants ?? []).filter(entry => !grantExpired(entry, now)), grant]
}

// Removing keeps the others and drops the expired ones; null means "clear the field".
export function removeGrant(grants: BrowserGrant[], index: number, now = Date.now()): BrowserGrant[] | null {
  const next = (grants ?? []).filter((entry, position) => position !== index && !grantExpired(entry, now))
  return next.length > 0 ? next : null
}

export const aGrant = (grant: BrowserGrant): BrowserGrant => grant
