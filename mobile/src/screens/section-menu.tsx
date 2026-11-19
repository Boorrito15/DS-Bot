import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SECTION_COLORS, SECTION_NAME_MAX, cleanSectionName, sectionInk, type Section } from '../team/sections.ts'
import { t } from '../ui/i18n.ts'
import { CheckIcon, FolderIcon, PlusIcon } from '../ui/icons.tsx'
import { radius, type as typeScale, useTheme } from '../ui/tokens.ts'

// Moving a chat into a folder, the way the desktop's section menu does it
// (ds-bot/src/client/context-menu.js): the folders the host has, "No folder" to take
// it out, and a way to make a new one without leaving the list.
export function FolderPicker({ visible, title, sections, current, error, onPick, onCreate, onClose }: {
  visible: boolean
  title: string
  sections: Section[]
  current?: string
  error?: string | null
  onPick: (sectionId: string | null) => void
  onCreate: () => void
  onClose: () => void
}) {
  const { p } = useTheme()
  const insets = useSafeAreaInsets()
  if (!visible) return null
  return (
    <SheetOverlay onClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.grab, { backgroundColor: p.line }]} />
        <Text style={[typeScale.caption, { color: p.ink3, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 }]}>{title}</Text>
        {error ? <Text style={[typeScale.small, { color: p.danger, paddingHorizontal: 16, paddingBottom: 4 }]} accessibilityRole="alert">{error}</Text> : null}
        <ScrollView style={{ maxHeight: 360 }}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: current === undefined }}
            onPress={() => onPick(null)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: p.hover }]}>
            <View style={styles.icon}><FolderIcon color={p.ink3} /></View>
            <Text style={[typeScale.settingsRow, { color: current === undefined ? p.ink : p.ink2, flex: 1 }]} numberOfLines={1}>{t('No folder')}</Text>
            {current === undefined ? <CheckIcon color={p.accent} /> : null}
          </Pressable>
          {sections.map(section => {
            const ink = sectionInk(section.color, false)
            const checked = current === section.id
            return (
              <Pressable key={section.id} accessibilityRole="radio" accessibilityState={{ checked }} onPress={() => onPick(section.id)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: p.hover }]}>
                <View style={styles.icon}><FolderIcon color={ink ?? p.ink2} /></View>
                <Text style={[typeScale.settingsRow, { color: p.ink, flex: 1 }]} numberOfLines={1}>{section.name}</Text>
                {checked ? <CheckIcon color={p.accent} /> : null}
              </Pressable>
            )
          })}
          <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [styles.row, pressed && { backgroundColor: p.hover }]}>
            <View style={styles.icon}><PlusIcon color={p.accent} /></View>
            <Text style={[typeScale.settingsRow, { color: p.accent, flex: 1 }]}>{t('New folder')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </SheetOverlay>
  )
}

// A folder's own menu: its name, its colour, and removing it. Deleting a folder in the
// host puts its chats back in the plain list, so the phone never moves them itself.
export function FolderEditor({ section, error, onSave, onDelete, onClose }: {
  section: Section
  error?: string | null
  onSave: (patch: { name?: string; color?: string | null }) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { p, dark } = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(section.name)
  useEffect(() => setName(section.name), [section.id, section.name])
  const cleaned = cleanSectionName(name)
  const save = () => {
    if (cleaned === '') { onClose(); return }
    if (cleaned !== section.name) onSave({ name: cleaned })
    else onClose()
  }
  return (
    <SheetOverlay onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 8 }]}>
          <View style={[styles.grab, { backgroundColor: p.line }]} />
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={styles.side}><Text style={[typeScale.settingsRow, { color: p.ink2 }]}>{t('Cancel')}</Text></Pressable>
            <Text style={[typeScale.headerTitle, { color: p.ink, flex: 1, textAlign: 'center' }]} numberOfLines={1}>{t('Folder')}</Text>
            <Pressable accessibilityRole="button" onPress={save} disabled={cleaned === ''} hitSlop={10} style={[styles.side, { alignItems: 'flex-end' }]}>
              <Text style={[typeScale.settingsRow, { color: cleaned === '' ? p.ink3 : p.accent, fontWeight: '600' }]}>{t('Save')}</Text>
            </Pressable>
          </View>
          {error ? <Text style={[typeScale.small, { color: p.danger, paddingHorizontal: 16, paddingBottom: 4 }]} accessibilityRole="alert">{error}</Text> : null}
          <View style={[styles.field, { borderColor: p.line }]}>
            <TextInput value={name} onChangeText={setName} placeholder={t('Folder name')} placeholderTextColor={p.ink3}
              maxLength={SECTION_NAME_MAX} autoFocus selectTextOnFocus accessibilityLabel={t('Folder name')}
              returnKeyType="done" onSubmitEditing={save}
              style={[typeScale.settingsRow, { color: p.ink, flex: 1 }]} />
          </View>
          <Text style={[typeScale.caption, { color: p.ink3, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }]}>{t('Colour')}</Text>
          <View style={styles.swatches}>
            {SECTION_COLORS.map(color => {
              const ink = sectionInk(color, dark)
              const picked = section.color === color
              return (
                <Pressable key={color} accessibilityRole="button" accessibilityLabel={color} accessibilityState={{ selected: picked }}
                  onPress={() => onSave({ color: picked ? null : color })}
                  style={[styles.swatch, { backgroundColor: ink ?? p.hover, borderColor: picked ? p.ink : 'transparent' }]}>
                  {picked ? <CheckIcon color="#fff" size={13} /> : null}
                </Pressable>
              )
            })}
            <Pressable accessibilityRole="button" accessibilityLabel={t('No colour')} onPress={() => onSave({ color: null })}
              style={[styles.swatch, { backgroundColor: 'transparent', borderColor: section.color === undefined ? p.ink : p.line }]}>
              <Text style={{ color: p.ink3, fontSize: 12 }}>—</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.row, { marginTop: 10 }, pressed && { backgroundColor: p.hover }]}>
            <Text style={[typeScale.settingsRow, { color: p.danger, flex: 1 }]}>{t('Remove folder')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SheetOverlay>
  )
}

// A sheet drawn in the app's own tree, not a native Modal: a Modal opened from the
// drawer is laid out at the drawer panel's width, which cut the sheet in half.
function SheetOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('Close')} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16 },
  icon: { width: 22, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, gap: 8 },
  side: { minWidth: 60, justifyContent: 'center', minHeight: 44 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, paddingHorizontal: 12, minHeight: 46 },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
})
