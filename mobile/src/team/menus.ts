// The long-press menu of a chat row, as the desktop's context menu groups it
// (ds-bot/src/client/context-menu.js): read state and pinning, the folder, the things
// that change the Bot itself, and a second page for the id and the delete. The native
// menu draws these, so the list says what the words are and where the folder
// submenu's ticks go.
import type { MenuAction } from '@react-native-menu/menu'
import type { Section } from './sections.ts'
import { t } from '../ui/i18n.ts'

export interface RowTarget {
  kind: 'bot' | 'room'
  id: string
  name: string
  pinned?: boolean
  // A Main Bot cannot be hidden, and it already sits on top of the list.
  main?: boolean
  // A private Bot cannot be copied.
  private?: boolean
  role?: string
  instructions?: string
  sectionId?: string
  // What "Copy ID" puts on the clipboard: the conversation on screen, as the desktop
  // copies it (text.js currentPart).
  copyId: string
}

// A submenu pick is the folder's id after this prefix; "none" means no folder and
// "new" asks for the picker, which can make one on the way.
export const MOVE_PREFIX = 'move:'
export const MOVE_NEW = `${MOVE_PREFIX}new`

export function rowMenuActions(target: RowTarget, folders: Section[]): MenuAction[] {
  const move: MenuAction[] = [
    { id: `${MOVE_PREFIX}none`, title: t('No folder'), state: target.sectionId === undefined ? 'on' as const : 'off' as const },
    ...folders.map(folder => ({ id: `${MOVE_PREFIX}${folder.id}`, title: folder.name, state: target.sectionId === folder.id ? 'on' as const : 'off' as const })),
    { id: MOVE_NEW, title: t('New folder…') },
  ]
  const actions: MenuAction[] = [{ id: 'unread', title: t('Mark as Unread') }]
  if (target.main !== true) actions.push({ id: 'pin', title: target.pinned === true ? t('Unpin') : t('Pin') })
  actions.push({ id: 'move', title: t('Move to…'), subactions: move })
  if (target.kind === 'bot') {
    actions.push({ id: 'template', title: t('Share as Template') })
    if (target.private !== true) actions.push({ id: 'duplicate', title: t('Duplicate') })
  }
  if (target.main !== true) actions.push({ id: 'hide', title: t('Hide from sidebar') })
  actions.push({
    id: 'more',
    title: t('More…'),
    subactions: [
      { id: 'copy-id', title: t('Copy ID') },
      { id: 'delete', title: target.kind === 'room' ? t('Delete group') : t('Delete'), attributes: { destructive: true } },
    ],
  })
  return actions
}

// The folder a submenu pick names, `undefined` for the plain list, and `null` when the
// action was not a folder pick at all.
export function pickedFolder(actionId: string, folders: Section[]): string | null | undefined {
  if (!actionId.startsWith(MOVE_PREFIX)) return null
  const id = actionId.slice(MOVE_PREFIX.length)
  if (id === 'none') return undefined
  return folders.some(folder => folder.id === id) ? id : null
}

// What "Share as Template" sends: the parts another person needs to set up the same
// Bot. Nothing here is secret; the instructions are what the user wrote for it.
export function templateText(target: RowTarget): string {
  const lines = [`${t('Name')}: ${target.name}`]
  if (target.role !== undefined && target.role !== '') lines.push(`${t('Role')}: ${target.role}`)
  if (target.instructions !== undefined && target.instructions.trim() !== '') {
    lines.push('', `${t('Instructions')}:`, target.instructions.trim())
  }
  return lines.join('\n')
}
