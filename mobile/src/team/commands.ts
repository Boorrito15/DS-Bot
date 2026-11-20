// The `/` commands the phone offers. They are the ones DS Bot adds to the desktop's
// menu (ds-bot/src/client/command-actions.js), not DSH's own commands: the host shields
// those in a Bot chat and a group chat, and the plugin gives no way for the phone to run
// them, so listing them here would promise something that cannot happen.

export interface CommandSpec { id: string; name: string; label: string; description: string }

export const COMMANDS: CommandSpec[] = [
  { id: 'scheduled-task', name: 'scheduled-task', label: 'Scheduled task', description: 'Open the scheduled tasks of this chat' },
  { id: 'goal', name: 'goal', label: 'Goal', description: 'Open the goal of this group chat' },
]

// `/goal` belongs to a group chat, as on the desktop.
export function commandsFor(kind: 'bot' | 'room'): CommandSpec[] {
  return kind === 'room' ? COMMANDS : COMMANDS.filter(command => command.id !== 'goal')
}

// A draft that starts with a command word. A slash followed by anything with a space or
// another slash is not one: "/etc/hosts is wrong" is a message, not a command.
export function parseCommand(text: string): { name: string; args: string } | undefined {
  const match = /^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (match === null || match[1].includes('/')) return undefined
  return { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() }
}

// The rows the menu shows while typing: a bare slash lists them all, and letters narrow it.
export function matchCommands(text: string, list: CommandSpec[]): CommandSpec[] {
  const draft = text.trimStart()
  if (!draft.startsWith('/') || /\s/.test(draft)) return []
  const query = draft.slice(1).toLowerCase()
  return list.filter(command => command.name.startsWith(query))
}

// The command a draft names, when it names one.
export function commandNamed(text: string, list: CommandSpec[]): CommandSpec | undefined {
  const parsed = parseCommand(text)
  return parsed === undefined ? undefined : list.find(command => command.name === parsed.name)
}

// A single slash word with no command behind it: the composer says so instead of sending
// it to the Bot, the way DSH answers an unknown command.
export function unknownCommand(text: string, list: CommandSpec[]): string | undefined {
  const draft = text.trim()
  if (!/^\/[a-z][\w-]*$/i.test(draft)) return undefined
  const name = draft.slice(1).toLowerCase()
  return list.some(command => command.name === name) ? undefined : name
}
