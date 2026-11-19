import { useMemo, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react'
import { Pressable, StyleSheet, Text, View, SectionList } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import type { Bot, Room } from '../connection.ts'
import { useTeam } from '../team/context.tsx'
import { botHasPending, roomHasPending } from '../nav/pending.ts'
import { isUnread, seenVersion, subscribeSeen } from '../team/seen.ts'
import { collapsedChange, folderAt, groupBySection, sectionInk, type DropZone, type Section } from '../team/sections.ts'
import { useFolderSheets } from '../nav/folder-sheets.tsx'
import { t } from '../ui/i18n.ts'
import { ArrowDownIcon, ChevronRightIcon, FolderIcon, PlusIcon } from '../ui/icons.tsx'
import { radius, type as typeScale, useTheme } from '../ui/tokens.ts'
import { Avatar, RoomAvatar } from '../ui/marks.tsx'
import { PinMarkIcon } from '../ui/icons.tsx'
import { workPhrase } from '../ui/phrases.ts'
import { cleanPreview } from './chat/settled.ts'

export interface ChatTarget { kind: 'bot' | 'room'; id: string }

type Entry = { kind: 'bot'; item: Bot } | { kind: 'room'; item: Room }

// The drawer's team list, laid out like the desktop sidebar (sidebar.js): every Main
// Bot as a tile on top, then the other Bots and groups as rows, pinned first, then
// by their latest message, and each folder after the plain rows with its own chats
// inside it.
export function TeamList({ onOpen, query = '', current }: { onOpen: (target: ChatTarget) => void; query?: string; current?: string }) {
  const { team, error, computer, call } = useTeam()
  const { p, dark } = useTheme()
  const hostId = computer?.hostDeviceId ?? ''
  useSyncExternalStore(subscribeSeen, seenVersion)

  const bots = Array.isArray(team?.bots) ? team.bots : []
  const mains = new Set(team?.mainBotIds ?? [])
  const needle = query.trim().toLowerCase()
  const mainList = bots.filter(bot => mains.has(bot.id) && bot.hidden !== true && (needle === '' || (bot.name ?? '').toLowerCase().includes(needle)))
  const workBots = team?.work?.bots ?? {}
  const workRooms = team?.work?.rooms ?? {}
  const waiting = team?.work?.waiting ?? {}
  const questions = team?.questions ?? {}
  const approvals = (Array.isArray(team?.work?.approvals) ? team.work.approvals : []).filter(a => a?.answerable !== false)
  const folders: Section[] = team?.sections ?? []

  // A folder change is the host's to make; the phone shows what comes back and any
  // refusal under the list, like the desktop does.
  const [actionError, setActionError] = useState<string | null>(null)
  const sheets = useFolderSheets()
  // A held chat can be dragged onto a folder header. The same hold, let go without
  // moving, opens the folder picker instead.
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const held = useRef<string | null>(null)
  const dragKey = useRef<string | null>(null)
  const moved = useRef(false)
  const startY = useRef(Number.NaN)
  const zones = useRef<DropZone[]>([])
  const hovered = useRef<string | null>(null)
  const heads = useRef(new Map<string, ComponentRef<typeof View> | null>())
  const act = (endpoint: string, payload: unknown) => {
    setActionError(null)
    void call(endpoint, payload).catch((failure: Error) => setActionError(failure?.message ?? String(failure)))
  }

  const entries = useMemo<Entry[]>(() => {
    const rooms = Array.isArray(team?.rooms) ? team.rooms : []
    const list: Entry[] = [
      ...bots.filter(bot => !mains.has(bot.id) && bot.hidden !== true).map(bot => ({ kind: 'bot' as const, item: bot })),
      ...rooms.filter(room => room.hidden !== true).map(room => ({ kind: 'room' as const, item: room })),
    ]
    return list
      .filter(entry => needle === '' || (entry.item.name ?? '').toLowerCase().includes(needle))
      .sort((a, b) => Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned)) || (b.item.lastAt ?? b.item.createdAt ?? 0) - (a.item.lastAt ?? a.item.createdAt ?? 0))
  }, [bots, team?.rooms, team?.mainBotIds, needle])

  const listSections = useMemo<{ key: string; section: Section | undefined; total: number; data: Entry[] }[]>(() => {
    const grouped = groupBySection(entries.map(entry => ({ ...entry, sectionId: entry.item.sectionId })), folders)
    return [
      { key: 'plain', section: undefined, total: grouped.loose.length, data: grouped.loose as Entry[] },
      ...grouped.groups
        // While searching, a folder with nothing matching only adds noise.
        .filter(group => needle === '' || group.entries.length > 0)
        .map(group => ({
          key: group.section.id,
          section: group.section,
          total: group.entries.length,
          data: (group.section.collapsed === true ? [] : group.entries) as Entry[],
        })),
    ]
  }, [entries, folders, needle])

  const folderNameOf = (entry: Entry): string | undefined => folders.find(folder => folder.id === entry.item.sectionId)?.name

  const preview = (bot: Bot): string | undefined => {
    const sessionId = bot.sessionId ?? bot.id
    if (questions[sessionId] !== undefined || team?.views?.[sessionId] !== undefined) return t('Waiting for your answer')
    if (approvals.some(a => a?.botId === bot.id)) return t('Waiting for your approval')
    const doing = workBots[bot.id] ?? team?.activity?.[bot.id]
    if (doing !== undefined) return `${workPhrase(doing)}…`
    const groupWork = Object.entries(workRooms).find(([, list]) => Array.isArray(list) && list.some(e => e?.botId === bot.id))
    const workingEntry = groupWork?.[1]?.find(e => e?.botId === bot.id)
    if (groupWork && workingEntry !== undefined) {
      const room = team?.rooms?.find(r => r.id === groupWork[0])
      return `${room?.name ?? t('a group chat')} · ${workPhrase(workingEntry)}…`
    }
    const waits = waiting[bot.id]
    if (waits !== undefined && (waits.bots?.length || waits.rooms?.length)) return t('Waiting for your answer')
    return cleanPreview(bot.preview) ?? bot.role
  }
  const roomPreview = (room: Room): string | undefined => {
    if (approvals.some(a => a?.roomId === room.id)) return t('Waiting for your approval')
    const members = Array.isArray(workRooms[room.id]) ? workRooms[room.id] : []
    if (members.length > 0) {
      const name = bots.find(b => b.id === members[0]?.botId)?.name ?? ''
      return `${name} · ${workPhrase(members[0])}…${members.length > 1 ? ` +${members.length - 1}` : ''}`
    }
    return room.preview
  }

  const entryOf = (key: string): Entry | undefined => entries.find(entry => `${entry.kind}-${entry.item.id}` === key)
  const moveEntry = (entry: Entry) => sheets.move({ id: entry.item.id, name: entry.item.name, sectionId: entry.item.sectionId })

  const beginDrag = (key: string) => {
    dragKey.current = key
    held.current = key
    moved.current = false
    startY.current = Number.NaN
    hovered.current = null
    setDragging(key)
    setDropTarget(null)
    // A folder takes a drop anywhere in its block, not only on its short header.
    const measured: { id: string; top: number }[] = []
    for (const [id, node] of heads.current) {
      node?.measureInWindow((left, top, width, height) => {
        measured.push({ id, top: top - 6 })
        const sorted = [...measured].sort((a, b) => a.top - b.top)
        zones.current = sorted.map((zone, index) => ({ id: zone.id, top: zone.top, bottom: (sorted[index + 1]?.top ?? Number.MAX_SAFE_INTEGER) }))
      })
    }
  }

  const trackDrag = (y: number) => {
    // A held finger always shakes a little; only a real move counts as a drag.
    if (Number.isNaN(startY.current)) { startY.current = y; return }
    if (!moved.current && Math.abs(y - startY.current) < 8) return
    moved.current = true
    const id = folderAt(y, zones.current)
    if (id === hovered.current) return
    hovered.current = id
    setDropTarget(id)
  }

  const endDrag = () => {
    const key = dragKey.current
    const entry = key === null ? undefined : entryOf(key)
    const target = hovered.current
    dragKey.current = null
    hovered.current = null
    setDragging(null)
    setDropTarget(null)
    // The row's own press must not also open the chat after the hold.
    setTimeout(() => { if (held.current === key) held.current = null }, 400)
    if (entry === undefined) return
    if (target !== null) sheets.move({ id: entry.item.id, name: entry.item.name, sectionId: target })
    else if (!moved.current) moveEntry(entry)
  }

  const openRow = (entry: Entry) => {
    if (held.current !== null) return
    onOpen({ kind: entry.kind, id: entry.item.id })
  }

  const rowGesture = (key: string) => Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => { 'worklet'; runOnJS(beginDrag)(key) })
    .onUpdate(event => { 'worklet'; runOnJS(trackDrag)(event.absoluteY) })
    .onEnd(() => { 'worklet'; runOnJS(endDrag)() })

  return (
    <View style={styles.root}>
      {error ? <Text style={[typeScale.small, { color: p.danger, paddingHorizontal: 20, paddingBottom: 4 }]} accessibilityRole="alert">{error}</Text> : null}
      {actionError ? <Text style={[typeScale.small, { color: p.danger, paddingHorizontal: 20, paddingBottom: 4 }]} accessibilityRole="alert">{actionError}</Text> : null}
      <SectionList
        sections={listSections}
        keyExtractor={entry => `${entry.kind}-${entry.item.id}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={mainList.length > 0 ? (
          <View style={styles.tiles}>
            {mainList.map(main => (
              <Pressable key={main.id} accessibilityRole="button" accessibilityLabel={`${main.name}, ${t('Main Bot')}`} onPress={() => onOpen({ kind: 'bot', id: main.id })}
                style={({ pressed }) => [styles.tile, { backgroundColor: pressed || current === main.id ? p.active : p.hover }]}>
                <Avatar bot={main} dark={dark} size={52} ring={p.hover} main working={workBots[main.id] !== undefined} waiting={botHasPending(team, main)} />
                <Text style={[typeScale.small, { color: p.ink, fontWeight: '600', marginTop: 6 }]} numberOfLines={1}>{main.name}</Text>
                {main.role ? <View style={[styles.tag, { backgroundColor: p.active }]}><Text style={{ fontSize: 11, lineHeight: 15, color: p.ink2 }} numberOfLines={1}>{main.role}</Text></View> : null}
              </Pressable>
            ))}
          </View>
        ) : undefined}
        renderSectionHeader={({ section }) => {
          const folder = section.section
          if (folder === undefined) return null
          return (
            <FolderHead section={folder} count={section.total} highlighted={dropTarget === folder.id}
              headRef={node => { heads.current.set(folder.id, node) }}
              onToggle={() => act('section-save', collapsedChange(folder, folder.collapsed !== true))}
              onMenu={() => sheets.edit(folder)} />
          )
        }}
        renderItem={({ item: entry }) => {
          const folder = folderNameOf(entry)
          const label = folder === undefined ? undefined : `${entry.item.name}, ${folder}`
          const key = `${entry.kind}-${entry.item.id}`
          return (
            <GestureDetector gesture={rowGesture(key)}>
              <View>
                {entry.kind === 'bot' ? (
                  <BotRow bot={entry.item} p={p} dark={dark} mains={mains} waiting={botHasPending(team, entry.item)} workBots={workBots} preview={preview(entry.item)} selected={current === entry.item.id} unread={isUnread(hostId, entry.item.id, entry.item.lastAt, current === entry.item.id)} label={label} dimmed={dragging === key} onPress={() => openRow(entry)} />
                ) : (
                  <RoomRow room={entry.item} bots={bots} p={p} dark={dark} waiting={roomHasPending(team, entry.item)} preview={roomPreview(entry.item)} selected={current === entry.item.id} unread={isUnread(hostId, entry.item.id, entry.item.lastAt, current === entry.item.id)} working={(workRooms[entry.item.id] ?? []).length > 0} label={label} dimmed={dragging === key} onPress={() => openRow(entry)} />
                )}
              </View>
            </GestureDetector>
          )
        }}
        ListEmptyComponent={<Text style={[typeScale.small, { color: p.ink3, textAlign: 'center', marginTop: 40 }]}>{team === null ? t('Connecting…') : ''}</Text>}
        ListFooterComponent={(
          <Pressable accessibilityRole="button" onPress={() => sheets.create()} style={({ pressed }) => [styles.footer, pressed && { backgroundColor: p.hover }]}>
            <PlusIcon color={p.ink3} />
            <Text style={[typeScale.small, { color: p.ink2 }]}>{t('New folder')}</Text>
          </Pressable>
        )}
      />
    </View>
  )
}

function FolderHead({ section, count, highlighted, headRef, onToggle, onMenu }: {
  section: Section; count: number; highlighted: boolean; headRef: (node: ComponentRef<typeof View> | null) => void
  onToggle: () => void; onMenu: () => void
}) {
  const { p, dark } = useTheme()
  const ink = sectionInk(section.color, dark)
  return (
    <Pressable ref={headRef} accessibilityRole="button" accessibilityState={{ expanded: section.collapsed !== true }}
      accessibilityLabel={section.name} onPress={onToggle} onLongPress={onMenu} delayLongPress={350}
      style={({ pressed }) => [styles.folderHead, highlighted ? { backgroundColor: p.active } : pressed ? { backgroundColor: p.hover } : null]}>
      {section.collapsed === true ? <ChevronRightIcon size={16} color={p.ink3} /> : <ArrowDownIcon size={16} color={p.ink3} />}
      <FolderIcon size={17} color={ink ?? p.ink2} />
      <Text style={[typeScale.rowName, { color: p.ink, flexShrink: 1 }]} numberOfLines={1}>{section.name}</Text>
      {section.collapsed === true && count > 0 ? <Text style={[typeScale.caption, { color: p.ink3 }]}>{count}</Text> : null}
    </Pressable>
  )
}

function BotRow({ bot, p, dark, mains, waiting, workBots, preview, unread, selected, label, dimmed, onPress }: {
  bot: Bot; p: ReturnType<typeof useTheme>['p']; dark: boolean; mains: Set<string>
  waiting: boolean; workBots: Record<string, unknown>; preview?: string; unread?: boolean; selected?: boolean
  label?: string; dimmed: boolean; onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.row, (pressed || selected) && { backgroundColor: p.hover }, dimmed && { opacity: 0.45 }]}>
      <Avatar bot={bot} dark={dark} size={36} ring={p.sidebar} main={mains.has(bot.id)} working={workBots[bot.id] !== undefined} waiting={waiting} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={[typeScale.rowName, { color: p.ink, flexShrink: 1 }]} numberOfLines={1}>{bot.name}</Text>
          {bot.pinned === true ? <PinMarkIcon size={12} /> : null}
          {unread === true ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent, marginLeft: 'auto' }} /> : null}
        </View>
        {preview ? <Text style={[typeScale.rowPreview, { color: p.ink2 }]} numberOfLines={1}>{preview}</Text> : null}
      </View>
    </Pressable>
  )
}

function RoomRow({ room, bots, p, dark, waiting, preview, unread, working, selected, label, dimmed, onPress }: {
  room: Room; bots: Bot[]; p: ReturnType<typeof useTheme>['p']; dark: boolean
  waiting: boolean; preview?: string; unread?: boolean; working: boolean; selected?: boolean
  label?: string; dimmed: boolean; onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.row, (pressed || selected) && { backgroundColor: p.hover }, dimmed && { opacity: 0.45 }]}>
      <View>
        <RoomAvatar room={room} bots={bots} dark={dark} size={36} ring={p.sidebar} />
        {waiting ? <View style={[styles.waitDot, { borderColor: p.main }]}>
          <View style={[styles.waitIn, { backgroundColor: p.accent }]}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 11 }}>?</Text></View>
        </View> : working ? <View style={[styles.waitDot, { borderColor: p.main }]}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.green }} /></View> : null}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={[typeScale.rowName, { color: p.ink, flexShrink: 1 }]} numberOfLines={1}>{room.name}</Text>
          {room.pinned === true ? <PinMarkIcon size={12} /> : null}
          {unread === true ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent, marginLeft: 'auto' }} /> : null}
        </View>
        {preview ? <Text style={[typeScale.rowPreview, { color: p.ink2 }]} numberOfLines={1}>{preview}</Text> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 },
  tile: { width: 104, alignItems: 'center', borderRadius: radius.card, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 6 },
  tag: { marginTop: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6, paddingHorizontal: 10, marginHorizontal: 8, borderRadius: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 10, marginHorizontal: 8, marginTop: 6, borderRadius: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, marginHorizontal: 8, marginTop: 8, marginBottom: 12, borderRadius: 10 },
  waitDot: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  waitIn: { width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
})
