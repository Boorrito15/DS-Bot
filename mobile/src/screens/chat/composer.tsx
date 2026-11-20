import { MenuView, type MenuComponentRef } from '@react-native-menu/menu'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import DocumentScanner from 'react-native-document-scanner-plugin'
import { useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from '../../ui/i18n.ts'
import { commandNamed, matchCommands, parseCommand, unknownCommand, type CommandSpec } from '../../team/commands.ts'
import { ArrowUpIcon, CloseIcon, PlusIcon, StopIcon } from '../../ui/icons.tsx'
import { radius, shadow, type as typeScale, type Palette } from '../../ui/tokens.ts'

// A photo ready to send: shown from `uri`, sent as base64 JPEG.
export interface Photo { uri: string; mediaType: string; data: string }

// Photos are made smaller on the phone before they go: the long side at most
// 2048 px as JPEG, which keeps one photo well under what the link carries in a
// message and is as much as the models look at.
const LONG_SIDE = 2048
interface Picked { uri: string; width?: number; height?: number }
async function prepare(asset: Picked): Promise<Photo> {
  const long = Math.max(asset.width ?? 0, asset.height ?? 0)
  const resize = long > LONG_SIDE ? [{ resize: (asset.width ?? 0) >= (asset.height ?? 0) ? { width: LONG_SIDE } : { height: LONG_SIDE } }] : []
  const out = await manipulateAsync(asset.uri, resize, { compress: 0.82, format: SaveFormat.JPEG, base64: true })
  return { uri: out.uri, mediaType: 'image/jpeg', data: out.base64 ?? '' }
}

// The computer takes photos in a message, so a video or a PDF has no way to travel
// yet; the menu still offers the picker and this says what happened.
const NOT_SENDABLE = 'Only photos can be sent to the computer for now.'

// The composer card: min height 44, radius 22 (18 when multi-line), level-1
// shadow; send is a 36px accent circle. While the Bot runs and the draft is
// empty a stop button shows instead of send. "+" adds photos when the
// computer takes them.
export function Composer({ name, running, canStop, canAttach, onSend, onStop, p, commands = [], onCommand }: {
  name: string; running: boolean; canStop: boolean; canAttach: boolean
  onSend: (text: string, photos: Photo[]) => Promise<void>; onStop: () => void; p: Palette
  // The `/` commands of this chat (team/commands.ts), with what a pick should do.
  commands?: CommandSpec[]; onCommand?: (command: CommandSpec, args: string) => void
}) {
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [preparing, setPreparing] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  // A slash word nobody knows: said here rather than sent to the Bot.
  const [note, setNote] = useState<string | null>(null)
  // Float above the home indicator (iOS) or the gesture bar (Android, drawn edge to
  // edge). The matching negative keyboardVerticalOffset in ChatView keeps the card
  // hugging the keyboard.
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 10)
  const draft = text.trim()
  const ready = (draft !== '' || photos.length > 0) && !preparing
  // `/file` opens the choices behind the "+" button, so the whole chat has one attach menu.
  const attachMenu = useRef<MenuComponentRef>(null)
  const choices = [
    { id: 'library', title: t('Photo or Video') },
    { id: 'camera', title: t('Take Photo') },
    { id: 'scan', title: t('Scan Document') },
    { id: 'file', title: t('Choose File') },
  ]
  // The button raises its menu when pressed; a row has to raise the same choices from
  // code. On iOS only a press opens that menu, so there the row opens the system sheet,
  // over the same four choices and the same handler.
  const openAttach = () => {
    if (Platform.OS !== 'ios') { attachMenu.current?.show(); return }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...choices.map(choice => choice.title), t('Cancel')], cancelButtonIndex: choices.length },
      index => { const choice = choices[index]; if (choice !== undefined) void attach(choice.id) },
    )
  }
  // Without attachment rights there is no sheet to open, so the row goes away with them.
  const offered = canAttach ? commands : commands.filter(command => command.id !== 'file')
  // The message shows in the chat at once; the composer is free for the next one.
  const menuRows = matchCommands(text, offered)
  const run = (command: CommandSpec, args: string) => {
    setText(''); setNote(null)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (command.id === 'file') { openAttach(); return }
    onCommand?.(command, args)
  }
  const send = () => {
    // A command runs rather than being sent, as in the desktop's `/` menu.
    const command = commandNamed(draft, offered)
    if (command !== undefined && photos.length === 0) {
      run(command, parseCommand(draft)?.args ?? '')
      return
    }
    const unknown = unknownCommand(draft, offered)
    if (unknown !== undefined) { setNote(t('No command called /{name}', { name: unknown })); return }
    if (!ready) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const sending = photos
    setText(''); setPhotos([])
    void onSend(draft, sending)
  }
  const add = async (picked: Picked[], refused = 0) => {
    if (picked.length === 0) {
      if (refused > 0) setPickError(t(NOT_SENDABLE))
      return
    }
    setPreparing(true)
    try {
      const ready = await Promise.all(picked.map(prepare))
      setPhotos(prev => [...prev, ...ready.filter(photo => photo.data !== '')])
      if (refused > 0) setPickError(t(NOT_SENDABLE))
    } catch (failure) {
      setPickError(failure instanceof Error ? failure.message : String(failure))
    } finally { setPreparing(false) }
  }
  // The attach button asks what to add, the way the system does: the library, the
  // camera, a scan, or a file the phone can reach.
  const attach = async (choice: string) => {
    setPickError(null)
    try {
      if (choice === 'library') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 0, quality: 1, orderedSelection: true })
        if (result.canceled) return
        const photos = result.assets.filter(asset => asset.type !== 'video')
        await add(photos, result.assets.length - photos.length)
        return
      }
      if (choice === 'camera') {
        const granted = await ImagePicker.requestCameraPermissionsAsync()
        if (!granted.granted) { setPickError(t('Camera access is off for DS Bot. Turn it on in Settings.')); return }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        if (result.canceled) return
        await add(result.assets)
        return
      }
      if (choice === 'scan') {
        const result = await DocumentScanner.scanDocument({ maxNumDocuments: 1, croppedImageQuality: 90 })
        if (result.status !== 'success') return
        await add((result.scannedImages ?? []).map(uri => ({ uri })))
        return
      }
      if (choice === 'file') {
        // Only what can make the trip: an image file from Files or iCloud Drive.
        const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true })
        if (result.canceled) return
        await add(result.assets.map(asset => ({ uri: asset.uri })))
      }
    } catch (failure) {
      setPickError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const multi = text.includes('\n') || text.length > 80 || photos.length > 0
  return (
    <View style={{ marginBottom: bottom }}>
      {pickError !== null ? <Text style={[typeScale.small, { color: p.danger, textAlign: 'center', marginBottom: 4 }]}>{pickError}</Text> : null}
      <View style={[styles.card, { backgroundColor: p.card, borderRadius: multi ? radius.composerLong : radius.composer, borderColor: p.line2 }]}>
        {photos.length > 0 || preparing ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.photos} keyboardShouldPersistTaps="handled">
            {photos.map(photo => (
              <View key={photo.uri}>
                <Image source={{ uri: photo.uri }} style={[styles.photo, { backgroundColor: p.hover }]} />
                <Pressable accessibilityRole="button" accessibilityLabel={t('Remove')} hitSlop={8} onPress={() => setPhotos(prev => prev.filter(entry => entry !== photo))}
                  style={[styles.unpick, { backgroundColor: p.ink }]}>
                  <CloseIcon size={10} color={p.main} />
                </Pressable>
              </View>
            ))}
            {preparing ? <View style={[styles.photo, { backgroundColor: p.hover, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={p.ink3} /></View> : null}
          </ScrollView>
        ) : null}
        {menuRows.length > 0 ? (
          <View style={[styles.menu, { borderTopColor: p.line }]}>
            {menuRows.map(command => (
              <Pressable key={command.id} accessibilityRole="button" accessibilityLabel={`/${command.name}`} onPress={() => run(command, '')}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8 }, pressed && { backgroundColor: p.hover }]}>
                <Text style={{ color: p.ink, fontSize: 13, fontWeight: '600' }}>/{command.name}</Text>
                <Text style={{ color: p.ink3, fontSize: 12, flex: 1 }} numberOfLines={1}>{t(command.description)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {note !== null ? <Text style={{ color: p.ink3, fontSize: 12, paddingHorizontal: 10, paddingBottom: 4 }} accessibilityRole="alert">{note}</Text> : null}
        <View style={styles.line}>
          {canAttach ? (
            <MenuView ref={attachMenu} onPressAction={({ nativeEvent }) => void attach(nativeEvent.event)} actions={choices}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Add photos')} hitSlop={6} style={styles.attach}>
                <PlusIcon size={20} color={p.ink2} />
              </Pressable>
            </MenuView>
          ) : null}
          <TextInput value={text} onChangeText={next => { setText(next); setNote(null) }} placeholder={t('Message {name}', { name })} placeholderTextColor={p.ink3}
            multiline style={[styles.input, { color: p.ink, paddingLeft: canAttach ? 2 : 6 }]} accessibilityLabel={t('Message {name}', { name })} />
          {running && canStop && !ready
            ? <Pressable accessibilityRole="button" accessibilityLabel={t('Stop')} onPress={onStop} hitSlop={6}
                style={[styles.send, { backgroundColor: p.accent }]}>
                <StopIcon size={14} />
              </Pressable>
            : <Pressable accessibilityRole="button" accessibilityLabel={t('Send')} disabled={!ready} onPress={send} hitSlop={6}
                style={[styles.send, { backgroundColor: p.accent, opacity: ready ? 1 : 0.35 }]}>
                <ArrowUpIcon size={18} />
              </Pressable>}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, paddingHorizontal: 7.5, paddingVertical: 7.5, borderWidth: 0.5, ...shadow(1) },
  line: { flexDirection: 'row', alignItems: 'flex-end' },
  photos: { gap: 8, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  unpick: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attach: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  menu: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  input: { flex: 1, fontSize: 16, lineHeight: 22, paddingTop: 7, paddingBottom: 7, paddingRight: 6, maxHeight: 130 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
