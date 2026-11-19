import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOVE_NEW, MOVE_PREFIX, pickedFolder, rowMenuActions, templateText, type RowTarget } from './menus.ts'
import type { Section } from './sections.ts'

const work: Section = { id: 'sec-work', name: 'Work' }
const launch: Section = { id: 'sec-launch', name: 'Launch week' }

const coder: RowTarget = { kind: 'bot', id: 'b-coder', name: 'Coder', copyId: 's-coder', role: 'Builds and fixes', sectionId: work.id }
const plan: RowTarget = { kind: 'room', id: 'r-launch', name: 'Launch plan', copyId: 's-launch' }

const ids = (target: RowTarget) => rowMenuActions(target, [work, launch]).map(action => action.id)

test('a Bot offers read state, pin, folder, template, copy, hide, and the ids', () => {
  assert.deepEqual(ids(coder), ['unread', 'pin', 'move', 'template', 'duplicate', 'rename', 'hide', 'more'])
})

test('a pinned chat offers to unpin instead of pin', () => {
  const action = rowMenuActions({ ...coder, pinned: true }, []).find(entry => entry.id === 'pin')
  assert.equal(action?.title, 'Unpin')
})

test('a Main Bot has nothing to pin or hide: it already sits on top and cannot be hidden', () => {
  assert.deepEqual(ids({ ...coder, main: true }), ['unread', 'move', 'template', 'duplicate', 'rename', 'more'])
})

test('a private Bot offers no copy, as on the desktop', () => {
  assert.equal(ids({ ...coder, private: true }).includes('duplicate'), false)
})

test('a group chat has no template of its own', () => {
  assert.deepEqual(ids(plan), ['unread', 'pin', 'move', 'hide', 'more'])
})

test('the folder submenu lists each folder and ticks the one the chat sits in', () => {
  const move = rowMenuActions(coder, [work, launch]).find(action => action.id === 'move')
  assert.deepEqual(move?.subactions?.map(action => action.id), [`${MOVE_PREFIX}none`, `${MOVE_PREFIX}sec-work`, `${MOVE_PREFIX}sec-launch`, MOVE_NEW])
  assert.deepEqual(move?.subactions?.map(action => action.state), ['off', 'on', 'off', undefined])
})

test('a submenu pick names its folder, or no folder, and says when it was something else', () => {
  assert.equal(pickedFolder(`${MOVE_PREFIX}sec-work`, [work, launch]), 'sec-work')
  assert.equal(pickedFolder(`${MOVE_PREFIX}none`, [work, launch]), undefined)
  assert.equal(pickedFolder(`${MOVE_PREFIX}sec-gone`, [work, launch]), null)
  assert.equal(pickedFolder('pin', [work, launch]), null)
})

test('the second page deletes with the right word for the kind', () => {
  const more = rowMenuActions(plan, []).find(action => action.id === 'more')
  assert.deepEqual(more?.subactions?.map(action => action.title), ['Copy ID', 'Delete group'])
  assert.equal(more?.subactions?.[1].attributes?.destructive, true)
})

test('a shared template carries what another person needs, and no empty fields', () => {
  const full = templateText({ ...coder, instructions: '  Read the diff before you push.  ' })
  assert.equal(full, 'Name: Coder\nRole: Builds and fixes\n\nInstructions:\nRead the diff before you push.')
  assert.equal(templateText(coder), 'Name: Coder\nRole: Builds and fixes')
  assert.equal(templateText({ ...coder, role: undefined }), 'Name: Coder')
})
