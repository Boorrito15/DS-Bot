import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanSectionName, collapsedChange, folderAt, groupBySection, sectionInk, type Section } from './sections.ts'

const work: Section = { id: 'sec-work', name: 'Work' }
const home: Section = { id: 'sec-home', name: 'Home', collapsed: true, color: 'green' }

const entry = (id: string, sectionId?: string) => ({ id, sectionId })

test('a chat with no folder stays loose', () => {
  const { loose, groups } = groupBySection([entry('a'), entry('b')], [work])
  assert.deepEqual(loose.map(item => item.id), ['a', 'b'])
  assert.deepEqual(groups.map(group => group.entries.length), [0])
})

test('a chat goes to the folder its sectionId names, keeping the order it arrived in', () => {
  const { loose, groups } = groupBySection([entry('a', work.id), entry('b'), entry('c', work.id)], [work, home])
  assert.deepEqual(loose.map(item => item.id), ['b'])
  assert.deepEqual(groups[0].entries.map(item => item.id), ['a', 'c'])
  assert.deepEqual(groups[1].entries, [])
})

test('a folder the host no longer has leaves its chats loose instead of losing them', () => {
  const { loose, groups } = groupBySection([entry('a', 'sec-gone'), entry('b', work.id)], [work])
  assert.deepEqual(loose.map(item => item.id), ['a'])
  assert.deepEqual(groups[0].entries.map(item => item.id), ['b'])
})

test('folders keep the host order, and an empty one keeps its place', () => {
  const { groups } = groupBySection([entry('a', home.id)], [work, home])
  assert.deepEqual(groups.map(group => group.section.id), [work.id, home.id])
  assert.equal(groups[0].entries.length, 0)
})

test('reopening a folder drops the collapsed flag rather than storing false', () => {
  assert.deepEqual(collapsedChange(home, true), { id: home.id, collapsed: true })
  assert.deepEqual(collapsedChange(home, false), { id: home.id })
})

test('a folder name is trimmed and stops at the host limit', () => {
  assert.equal(cleanSectionName('  Work  '), 'Work')
  assert.equal(cleanSectionName('x'.repeat(40)).length, 32)
})

test('a colour draws only when the host knows it, in the mode asked for', () => {
  assert.equal(sectionInk('green', false), '#10B981')
  assert.equal(sectionInk('green', true), '#059669')
  assert.equal(sectionInk(undefined, false), undefined)
  assert.equal(sectionInk('chartreuse', false), undefined)
})

test('a drop lands on the folder header under the finger, and nowhere else', () => {
  const zones = [{ id: 'sec-work', top: 100, bottom: 144 }, { id: 'sec-home', top: 200, bottom: 244 }]
  assert.equal(folderAt(120, zones), 'sec-work')
  assert.equal(folderAt(144, zones), 'sec-work')
  assert.equal(folderAt(230, zones), 'sec-home')
  assert.equal(folderAt(60, zones), null)
  assert.equal(folderAt(170, zones), null)
  assert.equal(folderAt(300, zones), null)
})

test('no folders means no drop target', () => {
  assert.equal(folderAt(120, []), null)
})
