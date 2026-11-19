import { CommonActions, StackActions, type NavigationAction, type NavigationState, type PartialState } from '@react-navigation/core'
import type { ChatTarget } from '../screens/TeamList.tsx'

type StateLike = NavigationState | PartialState<NavigationState> | undefined

// The team list is the first screen and a chat is pushed over it, so opening a chat
// goes back to the one already in the stack or pushes a new one. The notice banner
// sits outside the navigator and holds a container ref, which has no stack helpers,
// so the action is dispatched rather than called.
export function openChat(navigation: { dispatch: (action: NavigationAction) => void; getState?: () => StateLike }, target?: ChatTarget) {
  const state = navigation.getState?.()
  const open = state?.routes?.some(route => route.name === 'Chat') === true
  if (open) {
    navigation.dispatch(StackActions.popTo('Chat', target, target === undefined ? { merge: true } : undefined))
    return
  }
  navigation.dispatch(CommonActions.navigate({ name: 'Chat', params: target }))
}

// Which chat is visible on top of the stack, if any. The list is the screen below a
// chat, so this answers about the chat only while it is on top.
export function activeChatTarget(state: StateLike, fallbackBotId?: string): ChatTarget | undefined {
  const index = state?.index ?? 0
  const top = state?.routes?.[index]
  if (top?.name !== 'Chat') return undefined
  const params = top.params as Partial<ChatTarget> | undefined
  if ((params?.kind === 'bot' || params?.kind === 'room') && typeof params.id === 'string' && params.id !== '') {
    return { kind: params.kind, id: params.id }
  }
  return fallbackBotId ? { kind: 'bot', id: fallbackBotId } : undefined
}
