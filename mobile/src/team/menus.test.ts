import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moreMenuItems, rowMenuItems, templateText, type RowTarget } from './menus.ts'

const coder: RowTarget = { kind: 'bot', id: 'b-coder', name: 'Coder', copyId: 's-coder', role: 'Builds and fixes' }
const launch: RowTarget = { kind: 'room', id: 'r-launch', name: 'Launch plan', copyId: 's-launch' }

test('a Bot offers read state, pin, folder, template, hide, and a second page', () => {
  assert.deepEqual(rowMenuItems(coder).map(item => item.id), ['unread', 'pin', 'move', 'template', 'duplicate', 'hide', 'more'])
})

test('a pinned chat offers to unpin instead of pin', () => {
  assert.equal(rowMenuItems({ ...coder, pinned: true }).find(item => item.id === 'pin')?.label, 'Unpin')
})

test('a Main Bot has nothing to pin or hide: it already sits on top and cannot be hidden', () => {
  assert.deepEqual(rowMenuItems({ ...coder, main: true }).map(item => item.id), ['unread', 'move', 'template', 'duplicate', 'more'])
})

test('a private Bot offers no copy, as on the desktop', () => {
  assert.equal(rowMenuItems({ ...coder, private: true }).some(item => item.id === 'duplicate'), false)
})

test('a group chat has no template of its own', () => {
  assert.deepEqual(rowMenuItems(launch).map(item => item.id), ['unread', 'pin', 'move', 'hide', 'more'])
})

test('the second page copies the id and deletes, with the right word for the kind', () => {
  assert.deepEqual(moreMenuItems(coder), [{ id: 'copy-id', label: 'Copy ID' }, { id: 'delete', label: 'Delete', destructive: true }])
  assert.equal(moreMenuItems(launch)[1].label, 'Delete group')
  assert.equal(moreMenuItems(launch)[1].destructive, true)
})

test('a shared template carries what another person needs, and no empty fields', () => {
  const full = templateText({ ...coder, instructions: '  Read the diff before you push.  ' })
  assert.equal(full, 'Name: Coder\nRole: Builds and fixes\n\nInstructions:\nRead the diff before you push.')
  assert.equal(templateText(coder), 'Name: Coder\nRole: Builds and fixes')
  assert.equal(templateText({ ...coder, role: undefined }), 'Name: Coder')
})
