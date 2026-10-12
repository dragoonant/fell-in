// Brain for AI seats in Solo and Co-op: the official AI-card decider (spec 18 s8), run on the main thread (cheap, no
// search). It sees only view(state, seat), the open decision and the legal actions; every answer carries aiTrace,
// which is also pushed to the AI card panel store.
import { createOfficialAiDecider, type OfficialAiDecider } from '../../ai/official/decider'
import { recordOf } from '../../engine/edition'
import { preview, useGameStore } from '../store/gameStore'
import { useAiPanelStore } from './aiPanelStore'
import { traceOf } from './officialView'
import type { BotBrain } from './randomBot'

/** True when the running scenario is an AI or co-op scenario (its AI force is driven by AI cards). */
export function isOfficialScenario(): boolean {
  const s = useGameStore.getState()
  if (!s.scenarioId || !s.bundle) return false
  const sc = recordOf(s.bundle, 'scenarios', s.scenarioId)
  return sc?.mode === 'ai' || sc?.mode === 'coop'
}

export function createOfficialBrain(): BotBrain & { dispose(): void } {
  const deciders = new Map<string, OfficialAiDecider>()
  const brain: BotBrain = (view, pending, legal, ctx) => {
    const st = useGameStore.getState()
    if (!st.bundle) throw new Error('official ai: no bundle')
    const key = `${ctx.seed}:${st.scenarioId ?? ''}:${view.seat}`
    let d = deciders.get(key)
    if (!d) {
      d = createOfficialAiDecider(st.bundle, {
        seed: ctx.seed, scenarioId: st.scenarioId, accepts: (a) => preview(a).ok,
        budgetMs: ctx.budgetMs > 0 ? ctx.budgetMs * 0.5 : undefined,
      })
      deciders.set(key, d)
    }
    const { action } = d.decideSync(view, pending, legal)
    const t = traceOf(action)
    if (t) useAiPanelStore.getState().push(t)
    return action
  }
  const out = brain as BotBrain & { dispose(): void }
  out.dispose = () => { deciders.clear() }
  return out
}
