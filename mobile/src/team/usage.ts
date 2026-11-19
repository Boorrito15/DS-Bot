// The usage numbers, summed the way the desktop's usage page sums them
// (ds-bot/src/client/usage-data.js): the host keeps hourly rows and the page adds
// them up over a preset range, comparing it with the span just before.
//
// Hour keys are wall-clock times in the user's zone; reading them as UTC keeps every
// calendar step exact whatever daylight saving does.

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

// [hour, owner, model, kind, input, cacheRead, cacheWrite, output, calls]
export type UsageRow = [string, number, number, number, number, number, number, number, number]

export interface UsageView {
  // The host's clock as an hour key, "YYYY-MM-DD HH" in the user's zone.
  now: string
  owners: { name: string; kind: string; deleted?: boolean }[]
  models: { name: string }[]
  rows: UsageRow[]
}

export interface Range {
  id: '24h' | '7d' | '30d' | '12w' | '12m'
  unit: 'hour' | 'day' | 'week' | 'month'
  count: number
}

export const RANGES: Range[] = [
  { id: '24h', unit: 'hour', count: 24 },
  { id: '7d', unit: 'day', count: 7 },
  { id: '30d', unit: 'day', count: 30 },
  { id: '12w', unit: 'week', count: 12 },
  { id: '12m', unit: 'month', count: 12 },
]

export const hourMs = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), Number(key.slice(11, 13)) || 0)
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13).replace('T', ' ')
// Weeks start on Monday.
export const mondayOf = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS

interface Bucket { start: number; key: string }

// The buckets of a preset range, with as many before it again for the comparison.
export function bucketsOf(range: Range, now: string): Bucket[] {
  const end = hourMs(now)
  const today = end - (end % DAY_MS)
  const buckets: Bucket[] = []
  for (let back = range.count * 2 - 1; back >= 0; back -= 1) {
    let start: number
    if (range.unit === 'hour') start = end - back * HOUR_MS
    else if (range.unit === 'day') start = today - back * DAY_MS
    else if (range.unit === 'week') start = mondayOf(today) - back * 7 * DAY_MS
    else start = Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth() - back, 1)
    const key = range.unit === 'hour' ? hourKey(start) : range.unit === 'month' ? dayKey(start).slice(0, 7) : dayKey(start)
    buckets.push({ start, key })
  }
  return buckets
}

export interface Totals { input: number; cacheRead: number; output: number; calls: number; total: number }
const blank = (): Totals => ({ input: 0, cacheRead: 0, output: 0, calls: 0, total: 0 })

export const tokensOf = (row: UsageRow) => row[4] + row[5] + row[6] + row[7]

// Cache writes are billed as input, so they show as input.
function addRow(sum: Totals, row: UsageRow) {
  sum.input += row[4] + row[6]
  sum.cacheRead += row[5]
  sum.output += row[7]
  sum.calls += row[8]
  sum.total += tokensOf(row)
  return sum
}

export interface Summary {
  buckets: (Bucket & Totals)[]
  total: Totals
  // Tokens in the same span just before this one.
  previous: number
  owners: { index: number; total: Totals }[]
  models: { index: number; total: Totals }[]
}

export function summarize(view: UsageView, range: Range): Summary {
  const all = bucketsOf(range, view.now)
  const current = all.slice(range.count)
  const from = current[0]?.key ?? ''
  const before = all[0]?.key ?? ''
  const index = new Map(current.map((bucket, at) => [bucket.key, at]))
  const weeks = new Map<string, string>()
  const keyOf = (hour: string) => {
    if (range.unit === 'hour') return hour
    if (range.unit === 'day') return hour.slice(0, 10)
    if (range.unit === 'month') return hour.slice(0, 7)
    const day = hour.slice(0, 10)
    let week = weeks.get(day)
    if (week === undefined) weeks.set(day, week = dayKey(mondayOf(hourMs(day))))
    return week
  }
  const owners = new Map<number, Totals>()
  const models = new Map<number, Totals>()
  const result: Summary = {
    buckets: current.map(bucket => ({ ...bucket, ...blank() })),
    total: blank(),
    previous: 0,
    owners: [],
    models: [],
  }
  for (const row of view.rows) {
    const hour = String(row[0])
    if (hour < before) continue
    if (hour < from) { result.previous += tokensOf(row); continue }
    const at = index.get(keyOf(hour))
    if (at === undefined) continue
    addRow(result.total, row)
    addRow(result.buckets[at], row)
    owners.set(row[1], addRow(owners.get(row[1]) ?? blank(), row))
    models.set(row[2], addRow(models.get(row[2]) ?? blank(), row))
  }
  result.owners = [...owners.entries()].map(([index, total]) => ({ index, total })).sort((a, b) => b.total.total - a.total.total)
  result.models = [...models.entries()].map(([index, total]) => ({ index, total })).sort((a, b) => b.total.total - a.total.total)
  return result
}

function trimmed(value: number) {
  const text = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

// 999,999 reads 1M, not 1000K.
export function compact(count: number): string {
  for (const [size, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as [number, string][]) {
    if (count >= size * 0.9995) return `${trimmed(count / size)}${unit}`
  }
  return String(Math.round(count))
}

export function percent(part: number, whole: number): string {
  if (!(whole > 0) || !(part > 0)) return '0'
  const value = (part / whole) * 100
  return value < 1 ? '<1' : String(Math.round(value))
}
