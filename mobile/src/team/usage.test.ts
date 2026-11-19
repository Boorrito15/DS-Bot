import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RANGES, bucketsOf, compact, mondayOf, percent, summarize, type UsageRow, type UsageView } from './usage.ts'

const range = (id: string) => RANGES.find(entry => entry.id === id)!

const row = (hour: string, owner: number, model: number, input: number, cacheRead: number, output: number): UsageRow =>
  [hour, owner, model, 0, input, cacheRead, 0, output, 1]

const view = (now: string, rows: UsageRow[]): UsageView => ({
  now,
  owners: [{ name: 'Chief', kind: 'bot' }, { name: 'Launch plan', kind: 'room' }],
  models: [{ name: 'DeepSeek v4.1' }, { name: 'DeepSeek Flash' }],
  rows,
})

test('the last 24 hours count the rows inside them and the ones before as the comparison', () => {
  const summary = summarize(view('2026-11-20 10', [
    row('2026-11-20 09', 0, 0, 100, 50, 10),
    row('2026-11-20 03', 1, 1, 20, 0, 5),
    row('2026-11-19 05', 0, 0, 7, 0, 1),
  ]), range('24h'))
  assert.equal(summary.buckets.length, 24)
  assert.equal(summary.total.total, 185)
  assert.equal(summary.total.input, 120)
  assert.equal(summary.total.cacheRead, 50)
  assert.equal(summary.total.output, 15)
  assert.equal(summary.previous, 8)
})

test('a row in a later hour than the clock is not counted', () => {
  const summary = summarize(view('2026-11-20 10', [row('2026-11-20 23', 0, 0, 900, 0, 0)]), range('24h'))
  assert.equal(summary.total.total, 0)
})

test('the days of a range land in their own buckets, oldest first', () => {
  const summary = summarize(view('2026-11-20 10', [row('2026-11-20 09', 0, 0, 10, 0, 0), row('2026-11-18 09', 0, 0, 30, 0, 0)]), range('7d'))
  assert.equal(summary.buckets.length, 7)
  assert.equal(summary.buckets.at(-1)?.key, '2026-11-20')
  assert.equal(summary.buckets.at(-1)?.total, 10)
  assert.equal(summary.buckets.at(-3)?.total, 30)
})

test('a week starts on Monday and a month bucket is its year and month', () => {
  assert.equal(mondayOf(Date.UTC(2026, 10, 20)), Date.UTC(2026, 10, 16))
  assert.equal(bucketsOf(range('12m'), '2026-11-20 10').at(-1)?.key, '2026-11')
})

test('owners and models are ranked by what they used', () => {
  const summary = summarize(view('2026-11-20 10', [row('2026-11-20 09', 0, 0, 10, 0, 0), row('2026-11-20 08', 1, 1, 90, 0, 0)]), range('24h'))
  assert.deepEqual(summary.owners.map(entry => entry.index), [1, 0])
  assert.deepEqual(summary.models.map(entry => entry.total.total), [90, 10])
})

test('a count shrinks to K, M and B, and a share reads as a whole percent', () => {
  assert.equal(compact(999), '999')
  assert.equal(compact(1200), '1.2K')
  assert.equal(compact(999_999), '1M')
  assert.equal(compact(2_500_000), '2.5M')
  assert.equal(percent(1, 4), '25')
  assert.equal(percent(1, 400), '<1')
  assert.equal(percent(0, 400), '0')
})
