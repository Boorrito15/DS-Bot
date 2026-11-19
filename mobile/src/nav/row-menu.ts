import { ActionSheetIOS, Platform } from 'react-native'
import { t } from '../ui/i18n.ts'
import type { MenuItem } from '../team/menus.ts'

// iOS draws these menus with the system's own action sheet: the real blur, the system
// type, and a red row for a destructive choice. Anywhere else there is no such
// control, and presentMenu says so instead of faking one.
export function presentMenu(title: string, items: MenuItem[], onPick: (id: string) => void): boolean {
  if (Platform.OS !== 'ios' || items.length === 0) return false
  const destructive = items.map((item, index) => (item.destructive === true ? index : -1)).filter(index => index >= 0)
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...items.map(item => item.label), t('Cancel')],
      cancelButtonIndex: items.length,
      ...(destructive.length > 0 ? { destructiveButtonIndex: destructive } : {}),
    },
    index => {
      if (index === undefined || index < 0 || index >= items.length) return
      onPick(items[index].id)
    },
  )
  return true
}
