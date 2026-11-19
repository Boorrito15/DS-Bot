// The long-press menu of a chat row, grouped the way the desktop's context menu is
// (ds-bot/src/client/context-menu.js): read state and pinning first, then the folder,
// then the things that change the Bot itself, and a second page for the ids and the
// delete. The labels are built here so both the native sheet and its fallback show
// the same words in the same order.
import { t } from '../ui/i18n.ts'

export interface RowTarget {
  kind: 'bot' | 'room'
  id: string
  name: string
  pinned?: boolean
  // A Main Bot cannot be hidden, and it already sits on top of the list.
  main?: boolean
  role?: string
  instructions?: string
  // A private Bot cannot be copied, as on the desktop.
  private?: boolean
  // What "Copy ID" puts on the clipboard: the conversation on screen, as the desktop
  // copies it (text.js currentPart).
  copyId: string
}

export interface MenuItem {
  id: string
  label: string
  destructive?: boolean
}

export function rowMenuItems(target: RowTarget): MenuItem[] {
  const items: MenuItem[] = [{ id: 'unread', label: t('Mark as Unread') }]
  if (target.main !== true) items.push({ id: 'pin', label: target.pinned === true ? t('Unpin') : t('Pin') })
  items.push({ id: 'move', label: t('Move to…') })
  if (target.kind === 'bot') items.push({ id: 'template', label: t('Share as Template') })
  if (target.kind === 'bot' && target.private !== true) items.push({ id: 'duplicate', label: t('Duplicate') })
  if (target.main !== true) items.push({ id: 'hide', label: t('Hide from sidebar') })
  items.push({ id: 'more', label: t('More…') })
  return items
}

export function moreMenuItems(target: RowTarget): MenuItem[] {
  return [
    { id: 'copy-id', label: t('Copy ID') },
    { id: 'delete', label: target.kind === 'room' ? t('Delete group') : t('Delete'), destructive: true },
  ]
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
