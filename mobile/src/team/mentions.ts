// The "@" rows the composer offers: the Bots a message there can call, and the one word
// that calls the whole group.
//
// The desktop draws the same rows (ds-bot/src/client/at-menu.js) and the host reads the
// names by the same rule (ds-bot/src/shared/mentions.js), so a row is only a shortcut for
// typing "@Name" by hand: nothing is sent but the text.
import { isChinese } from '../ui/i18n.ts'

export interface MentionBot { id: string; name: string }
export interface MentionRow { id: string; label: string; insert: string }

// The word that calls everyone. The phone already uses "Everyone" for a group's reply
// mode, so the mention carries its own word; the host reads both as everyone, and so it
// does the English one (ds-bot/src/shared/mentions.js).
export const everyoneWord = () => (isChinese() ? '所有人' : 'Everyone')

export function mentionRows({ bots, selfId, room = false }: {
  bots: MentionBot[]
  selfId?: string
  room?: boolean
}): MentionRow[] {
  const rows = bots
    .filter(bot => bot.id !== selfId)
    .map(bot => ({ id: bot.id, label: bot.name, insert: `@${bot.name} ` }))
  // One Bot answering itself is not a call, and a group of one has no "everyone" to say.
  if (room && bots.length > 1) {
    const word = everyoneWord()
    rows.push({ id: 'everyone', label: word, insert: `@${word} ` })
  }
  return rows
}

// The rows left once letters have been typed after the "@".
export function narrowMentions(rows: MentionRow[], query: string): MentionRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows
  return rows.filter(row => row.label.toLowerCase().includes(needle)
    // "Everyone" is also what people type in English whatever the phone shows.
    || (row.id === 'everyone' && ['everyone', 'all'].some(word => word.startsWith(needle))))
}

// The "@" being typed at the end of a draft: where it starts and what follows it. An
// address ("a@b.com") or an "@" with a space after it is ordinary text.
export function mentionDraft(text: string): { start: number; query: string } | undefined {
  const match = /(^|\s)@([^\s@]*)$/.exec(text)
  if (match === null) return undefined
  return { start: match.index + match[1].length, query: match[2] }
}

// What the draft becomes when a row is picked: the word replaces the part typed so far.
export function insertMention(text: string, draft: { start: number }, insert: string): string {
  return `${text.slice(0, draft.start)}${insert}`
}
