// Changing several Bots to one model from Settings, the rules the desktop keeps in
// ds-bot/src/client/bot-model-batch.js. How a Bot runs belongs to the Bot, so one on
// a local agent keeps its own route and is reported as skipped rather than moved.

export type ModelBot = { id: string; name?: string; model?: string; appliedModel?: string }

export const SKIP_LOCAL_AGENT = 'local-agent'
export const SKIP_UNAVAILABLE = 'unavailable'

// What a Bot runs on: its pick, else the model it last ran on.
export const modelRefOf = (bot: ModelBot): string | undefined => bot.model ?? bot.appliedModel

// The host writes a local-agent route as `local-<cli>`, beside the provider/model
// refs of a DS Bot model.
export const runsOnLocalAgent = (ref: string | undefined): boolean => (ref ?? '').startsWith('local-')

export type PlanEntry = { bot: ModelBot; action: 'change' | 'keep' | 'skip'; reason?: string }

export function planModelChange(bots: ModelBot[], ref: string, served: string[]): PlanEntry[] {
  return (bots ?? []).map((bot) => {
    const current = modelRefOf(bot)
    if (runsOnLocalAgent(current)) return { bot, action: 'skip' as const, reason: SKIP_LOCAL_AGENT }
    if (!served.includes(ref)) return { bot, action: 'skip' as const, reason: SKIP_UNAVAILABLE }
    if (bot.model === ref) return { bot, action: 'keep' as const }
    return { bot, action: 'change' as const }
  })
}

export type ChangeResult = { id: string; name?: string; status: 'updated' | 'unchanged' | 'skipped' | 'failed'; reason?: string; message?: string }

// One Bot at a time, so two host calls never land at once, and one failure never
// stops the Bots after it.
export async function runModelChange({ bots, ref, served, updateBot }: {
  bots: ModelBot[]
  ref: string
  served: string[]
  updateBot: (id: string, model: string) => Promise<unknown>
}): Promise<ChangeResult[]> {
  const results: ChangeResult[] = []
  for (const entry of planModelChange(bots, ref, served)) {
    const { bot } = entry
    if (entry.action === 'skip') { results.push({ id: bot.id, name: bot.name, status: 'skipped', reason: entry.reason }); continue }
    if (entry.action === 'keep') { results.push({ id: bot.id, name: bot.name, status: 'unchanged' }); continue }
    try {
      await updateBot(bot.id, ref)
      results.push({ id: bot.id, name: bot.name, status: 'updated' })
    } catch (failure) {
      results.push({ id: bot.id, name: bot.name, status: 'failed', message: (failure as Error)?.message ?? String(failure) })
    }
  }
  return results
}

export function summarizeModelChange(results: ChangeResult[]) {
  const count = (status: ChangeResult['status']) => (results ?? []).filter(entry => entry.status === status).length
  return { total: (results ?? []).length, updated: count('updated'), unchanged: count('unchanged'), skipped: count('skipped'), failed: count('failed') }
}
