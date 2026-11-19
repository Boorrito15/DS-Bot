import { BlurView } from 'expo-blur'
import { useEffect, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { t } from '../ui/i18n.ts'
import { CloseIcon, GearIcon, SearchIcon } from '../ui/icons.tsx'
import { useTheme } from '../ui/tokens.ts'

// The search field sits over the bottom of the team list, in a glass capsule, with the
// gear beside it. Tapping it is the search: the gear slides away, a Close takes its
// place at the far right, the capsule widens, and the whole bar rides up on the
// keyboard. Nothing is drawn while the app first opens over a still-empty list.
export function TeamSearchBar({ query, onChange, onSettings, dimmed }: {
  query: string
  onChange: (next: string) => void
  onSettings: () => void
  dimmed: boolean
}) {
  const { p, dark } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [keyboard, setKeyboard] = useState(0)
  const spin = useSharedValue(0)

  useEffect(() => { spin.value = withTiming(open ? 1 : 0, { duration: 220 }) }, [open, spin])
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const change = Keyboard.addListener('keyboardWillChangeFrame', event => {
      setKeyboard(Math.max(0, event.endCoordinates.height))
    })
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0))
    return () => { change.remove(); hide.remove() }
  }, [insets.bottom])

  const gear = useAnimatedStyle(() => ({ opacity: 1 - spin.value, width: (1 - spin.value) * 44, transform: [{ translateX: -spin.value * 12 }] }))
  const closer = useAnimatedStyle(() => ({ opacity: spin.value, width: spin.value * 44, transform: [{ translateX: (1 - spin.value) * 12 }] }))

  const close = () => { onChange(''); setOpen(false); Keyboard.dismiss() }
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: (keyboard > 0 ? keyboard : insets.bottom) + 8 }]}>
      <Animated.View style={[styles.slot, gear]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Settings')} onPress={onSettings} hitSlop={4} style={[styles.round, { borderColor: p.line, backgroundColor: p.card }]}>
          <GearIcon size={18} color={p.ink2} />
        </Pressable>
      </Animated.View>
      <BlurView intensity={dark ? 40 : 55} tint={dark ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
        style={[styles.field, { borderColor: p.line2, opacity: dimmed ? 0.4 : 1 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(28,28,30,0.45)' : 'rgba(255,255,255,0.55)' }]} />
        <View style={styles.fieldRow}>
          <SearchIcon size={16} color={p.ink3} />
          <TextInput value={query} onChangeText={onChange} onFocus={() => setOpen(true)}
            onBlur={() => { if (query === '') setOpen(false) }}
            placeholder={t('Search the team')} placeholderTextColor={p.ink3} autoCapitalize="none" autoCorrect={false}
            returnKeyType="search" clearButtonMode="never" accessibilityLabel={t('Search the team')}
            style={[styles.input, { color: p.ink }]} />
        </View>
      </BlurView>
      <Animated.View style={[styles.slot, closer]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel')} onPress={close} hitSlop={6} style={[styles.round, { borderColor: p.line, backgroundColor: p.card }]}>
          <CloseIcon size={16} color={p.ink2} />
        </Pressable>
      </Animated.View>
    </View>
  )
}

// How much of the list the bar covers, so the last row can be scrolled clear of it.
export const TEAM_SEARCH_INSET = 68

const styles = StyleSheet.create({
  slot: { overflow: 'hidden' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  field: { flex: 1, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  fieldRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
})
