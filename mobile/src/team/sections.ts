// Folders for the drawer, the same ones the desktop sidebar calls sections
// (ds-bot/src/client/sidebar.js). The host owns the list; the phone reads it from
// `state` and asks for changes with `section-save`, `section-order`,
// `section-delete` and `set-flags { id, sectionId }`.

export interface Section {
  id: string
  name: string
  collapsed?: boolean
  color?: string
}

// The host accepts these names only (ds-bot/src/host/constants.js).
export const SECTION_COLORS = ['blue', 'orange', 'green', 'violet', 'rose'] as const

// The same inks the desktop paints folders with, light and dark.
const INK: Record<string, [string, string]> = {
  blue: ['#2563EB', '#3B82F6'],
  orange: ['#FF6B1A', '#FF5E00'],
  green: ['#10B981', '#059669'],
  violet: ['#8B5CF6', '#7C3AED'],
  rose: ['#EC2F6B', '#FF5A7A'],
}

export function sectionInk(color: string | undefined, dark: boolean): string | undefined {
  const pair = color === undefined ? undefined : INK[color]
  return pair === undefined ? undefined : pair[dark ? 1 : 0]
}

export interface SectionGroup<T> {
  section: Section
  entries: T[]
}

export interface Grouped<T> {
  // Entries in no folder, or in one the host no longer has.
  loose: T[]
  // One group per folder, in the host's order. An empty folder keeps its place so it
  // can still be opened and filled.
  groups: SectionGroup<T>[]
}

export function groupBySection<T extends { sectionId?: string }>(entries: T[], sections: Section[]): Grouped<T> {
  const known = new Set(sections.map(section => section.id))
  const loose: T[] = []
  const inside = new Map<string, T[]>(sections.map(section => [section.id, []]))
  for (const entry of entries) {
    const bucket = entry.sectionId !== undefined && known.has(entry.sectionId) ? inside.get(entry.sectionId) : undefined
    if (bucket === undefined) loose.push(entry)
    else bucket.push(entry)
  }
  return { loose, groups: sections.map(section => ({ section, entries: inside.get(section.id) ?? [] })) }
}

// What a folder asks for when its header is tapped. The host stores `collapsed` as
// present-or-absent, and reads an explicit false as "delete the flag"; sending nothing
// at all would leave the folder as it was, so the state is always said out loud.
export function collapsedChange(section: Section, collapsed: boolean): { id: string; collapsed: boolean } {
  return { id: section.id, collapsed }
}

// A folder stops at the host's own limit (SECTION_NAME_MAX), counted the way a name
// is typed rather than in bytes.
export const SECTION_NAME_MAX = 32

export function cleanSectionName(name: string): string {
  return name.trim().slice(0, SECTION_NAME_MAX)
}

// The host takes the whole order at once (section-order { ids }), so a folder that
// moves up or down sends the list with itself one place nearer an end.
export function reordered(sections: Section[], id: string, delta: -1 | 1): string[] | null {
  const index = sections.findIndex(section => section.id === id)
  const target = index + delta
  if (index === -1 || target < 0 || target >= sections.length) return null
  const ids = sections.map(section => section.id)
  const [picked] = ids.splice(index, 1)
  ids.splice(target, 0, picked)
  return ids
}

// Where a dragged chat would land: the folder whose header sits under the finger.
// Only headers take a drop, like the desktop's section blocks; letting go anywhere
// else leaves the chat where it was.
export interface DropZone {
  id: string
  top: number
  bottom: number
}

export function folderAt(y: number, zones: DropZone[]): string | null {
  for (const zone of zones) if (y >= zone.top && y <= zone.bottom) return zone.id
  return null
}
