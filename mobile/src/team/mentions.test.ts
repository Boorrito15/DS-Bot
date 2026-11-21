import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setLang } from '../ui/i18n.ts'
import { afterDelete, draftMentions, insertMention, mentionDraft, mentionRows, narrowMentions } from './mentions.ts'

setLang('en')

const bots = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo Lin' }, { id: 'c', name: 'Cy' }]

test("a Bot's chat offers every other Bot, never itself", () => {
  assert.deepEqual(mentionRows({ bots, selfId: 'a' }).map(row => row.label), ['Bo Lin', 'Cy'])
  assert.deepEqual(mentionRows({ bots, selfId: 'a' })[0].insert, '@Bo Lin ')
})

test('a group chat offers its own members and the word for everyone', () => {
  const rows = mentionRows({ bots, room: true })
  assert.deepEqual(rows.map(row => row.label), ['Ada', 'Bo Lin', 'Cy', 'Everyone'])
  assert.equal(rows.at(-1)?.insert, '@Everyone ')
})

test('one Bot in a room is no group, so there is nobody to call all of', () => {
  assert.deepEqual(mentionRows({ bots: [bots[0]], room: true }).map(row => row.label), ['Ada'])
})

test('letters narrow the rows, and "everyone" is found by its own word', () => {
  const rows = mentionRows({ bots, room: true })
  assert.deepEqual(narrowMentions(rows, 'b').map(row => row.label), ['Bo Lin'])
  assert.deepEqual(narrowMentions(rows, 'every').map(row => row.label), ['Everyone'])
  assert.deepEqual(narrowMentions(rows, 'all').map(row => row.label), ['Everyone'])
  assert.deepEqual(narrowMentions(rows, ''), rows)
  assert.deepEqual(narrowMentions(rows, 'zz'), [])
})

test('an "@" at the end of the draft is the one being typed', () => {
  assert.deepEqual(mentionDraft('hi @'), { start: 3, query: '' })
  assert.deepEqual(mentionDraft('hi @bo'), { start: 3, query: 'bo' })
  assert.deepEqual(mentionDraft('@ad'), { start: 0, query: 'ad' })
  // Finished mentions and addresses are ordinary text.
  assert.equal(mentionDraft('hi @Bo '), undefined)
  assert.equal(mentionDraft('mail a@b.com'), undefined)
  assert.equal(mentionDraft('nothing here'), undefined)
})

test('picking a row replaces the word typed so far and keeps the rest', () => {
  const draft = mentionDraft('see @bo')!
  assert.equal(insertMention('see @bo', draft, '@Bo Lin '), 'see @Bo Lin ')
  assert.equal(insertMention('@', mentionDraft('@')!, '@Everyone '), '@Everyone ')
})

test('a draft marks the mentions the host will read', () => {
  const words = draftMentions('ask @Bo Lin and @Ada about it', bots)
  assert.deepEqual(words.map(word => word.id), ['b', 'a'])
  assert.equal('ask @Bo Lin and @Ada about it'.slice(words[0].start, words[0].end), '@Bo Lin')
  // A name that is not one of the chats, and an address, stay ordinary text.
  assert.deepEqual(draftMentions('ask @Nobody at a@b.com', bots), [])
  assert.deepEqual(draftMentions('@everyone', bots).map(word => word.id), ['everyone'])
})

test('deleting into a mention takes the whole word', () => {
  const text = 'ask @Bo Lin about it'
  const words = draftMentions(text, bots)
  // One backspace at the end of the name, and one in the middle of it.
  assert.equal(afterDelete(text, 'ask @Bo Lin about i', words), 'ask @Bo Lin about i')
  assert.equal(afterDelete(text, 'ask @Bo Li about it', words), 'ask about it')
  assert.equal(afterDelete('ask @Bo Lin', 'ask @Bo Li', draftMentions('ask @Bo Lin', bots)), 'ask ')
  // Ordinary letters still go one at a time, and typing over a mention is left alone.
  assert.equal(afterDelete(text, 'ask @Bo Lin about i', []), 'ask @Bo Lin about i')
  assert.equal(afterDelete(text, 'ask @Bo Lin abouX it', words), 'ask @Bo Lin abouX it')
})
