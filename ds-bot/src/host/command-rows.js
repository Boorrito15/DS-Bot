// The `/` rows a phone chat offers, which is not the desktop's list.
//
// On the desktop the menu is DSH's own commands plus the two rows DS Bot adds in
// ds-bot/src/client/command-actions.js, and `agent-commands.js` makes every DSH command
// refuse in a Bot chat and in a group chat. A phone has no way to run any of those, so
// it offers only the rows it can act on. This module is the one place that says which
// rows a given chat has, so the phone asks instead of carrying that rule itself and
// drifting from the desktop the next time a row is added.

export const CHAT_ROWS = ['file', 'scheduled-task', 'goal']

// `/file` is the composer's attach sheet, the phone's form of the desktop's file picker.
// `/goal` is DS Bot's group goal, as on the desktop, so only a group chat has it.
export function commandRows(kind) {
  return CHAT_ROWS
    .filter(id => id !== 'goal' || kind === 'room')
    .map(id => ({ id, name: id }))
}
