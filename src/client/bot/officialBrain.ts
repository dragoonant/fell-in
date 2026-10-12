// Brain for seats run by the official AI cards (CH p8-16). Runs the deterministic decider on the main thread: it is a
// table lookup plus target ranking, so it needs no worker, and the bot driver's watchdog still guards every answer.
// Each answer carries the decision log as `aiLog`; the engine turns it into an 'ai.decision' event for the feed.
import { createOfficialAiDecider, type OfficialAiDecider } from '../../ai/official/decider'
import type { Action } from '../../engine/types'
import { preview, useGameStore } from '../store/gameStore'
import type { BotBrain } from './randomBot'

const deciders = new Map<string, OfficialAiDecider>()

/** Forget cached deciders (new game, tests). */
export function resetOfficialBrain(): void { deciders.clear() }

export const officialBrain: BotBrain = (view, pending, legal, ctx) => {
  const bundle = useGameStore.getState().bundle
  if (!bundle) throw new Error('official ai: no bundle')
  const key = `${ctx.seed}:${view.seat}`
  let d = deciders.get(key)
  if (!d) {
    // Keep only the current game's deciders.
    if (deciders.size > 4) deciders.clear()
    d = createOfficialAiDecider({ seed: ctx.seed, bundle, accepts: (a: Action) => preview(a).ok })
    deciders.set(key, d)
  }
  const out = d.decideSync(view, pending, legal)
  return out.log && !('aiLog' in out.action) ? { ...out.action, aiLog: out.log } : out.action
}
