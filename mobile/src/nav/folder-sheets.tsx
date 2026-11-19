import { createContext, useContext, useState, type ReactNode } from 'react'
import { collapsedChange, reordered, type Section } from '../team/sections.ts'
import { useTeam } from '../team/context.tsx'
import { FolderEditor, FolderPicker } from '../screens/section-menu.tsx'
import { confirmDanger } from './sheet.tsx'
import { t } from '../ui/i18n.ts'

// The drawer's folder sheets live above the drawer, not inside it: a Modal rendered
// inside the sliding panel is clipped to its width, so the sheet would stop halfway
// across the screen.
export interface FolderMoveTarget {
  id: string
  name: string
  sectionId?: string
}

interface FolderSheets {
  move: (target: FolderMoveTarget) => void
  edit: (section: Section) => void
  create: () => void
}

const noop = () => {}
const Ctx = createContext<FolderSheets>({ move: noop, edit: noop, create: noop })
export const useFolderSheets = () => useContext(Ctx)

export function FolderSheetsProvider({ children }: { children: ReactNode }) {
  const { team, call } = useTeam()
  const folders: Section[] = team?.sections ?? []
  const [moving, setMoving] = useState<FolderMoveTarget | null>(null)
  const [editing, setEditing] = useState<Section | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = (endpoint: string, payload: unknown, done?: (value: unknown) => void) => {
    setError(null)
    void call(endpoint, payload).then(
      value => { if (done !== undefined) done(value) },
      (failure: Error) => setError(failure?.message ?? String(failure)),
    )
  }

  const create = () => {
    act('section-save', {}, saved => {
      const section = saved as Section | undefined
      setMoving(null)
      if (section?.id !== undefined) setEditing(section)
    })
  }

  const choose = (sectionId: string | null) => {
    const target = moving
    if (target === null) return
    setMoving(null)
    act('set-flags', { id: target.id, sectionId })
    // Landing in a closed folder would hide what was just moved.
    const folder = folders.find(entry => entry.id === sectionId)
    if (folder?.collapsed === true) act('section-save', collapsedChange(folder, false))
  }

  const save = (section: Section, patch: { name?: string; color?: string | null }) => {
    setEditing(null)
    act('section-save', { id: section.id, ...patch })
  }

  // The host takes the whole order, so a folder that moves sends the list with
  // itself one place nearer an end.
  const move = (section: Section, delta: -1 | 1) => {
    const ids = reordered(folders, section.id, delta)
    if (ids === null) return
    setEditing(null)
    act('section-order', { ids })
  }

  const remove = (section: Section) => {
    setEditing(null)
    confirmDanger(t('Remove {name}?', { name: section.name }), t('Remove'),
      () => act('section-delete', { id: section.id }),
      t('Its chats go back to the list. Nothing is deleted.'))
  }

  return (
    <Ctx.Provider value={{ move: setMoving, edit: setEditing, create }}>
      {children}
      <FolderPicker visible={moving !== null} title={moving === null ? '' : t('Move {name} to', { name: moving.name })}
        sections={folders} current={moving?.sectionId} error={error}
        onClose={() => { setMoving(null); setError(null) }}
        onPick={choose} onCreate={create} />
      {editing === null ? null : (
        <FolderEditor section={editing} error={error}
          index={folders.findIndex(folder => folder.id === editing.id)} count={folders.length}
          onClose={() => { setEditing(null); setError(null) }}
          onSave={patch => save(editing, patch)} onMove={delta => move(editing, delta)} onDelete={() => remove(editing)} />
      )}
    </Ctx.Provider>
  )
}
