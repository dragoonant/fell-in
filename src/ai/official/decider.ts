// The official AI card decider (spec 18 s8; FROZEN interface at M4b). Implements the engine Decider for the AI seat:
// turn.ready = draw a Number Token, turn.choose = always use all, turn.pick = lowest Number (CH p8); activation
// decisions follow the matrix and the activity lists (CH p10-16). Randomness only from deriveSeed(opts.seed, ...).
import type { Decider } from '../../engine/decider'
import { todo } from '../../engine/registry'
import type { Action, ModelId, PendingDecision, PlayerView } from '../../engine/types'
import type { AiView } from '../types'
import type { AiDecisionLog, OfficialAiOpts, OfficialDecision } from './types'

/** Decision kinds the official decider answers itself; anything else gets the first legal action and a log entry. */
export const OFFICIAL_KINDS = [
  'turn.ready', 'turn.choose', 'turn.pick', 'turn.activation', 'move.path', 'shoot.target', 'throw.target',
  'charge.marker', 'battleCry.push', 'melee.slide', 'react.offer', 'shoot.luck', 'throw.luck', 'melee.luck',
  'item.choose', 'search.found',
] as const
export type OfficialKind = typeof OFFICIAL_KINDS[number]

export interface OfficialAiDecider extends Decider {
  /** Synchronous core (tests, bench, worker). */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): OfficialDecision
  /** Every decision made so far, oldest first (AI-015). */
  readonly log: readonly AiDecisionLog[]
}

/** Number per AI model (CH p8): model.tokens.aiNumber when the engine set it, else a deriveSeed(seed,'ai-numbers') permutation of the sorted ids. */
export function aiNumbersOf(view: AiView, seed: string): Record<ModelId, number> {
  void view; void seed
  return todo('official.aiNumbersOf')
}

/** Blue-die face for this model's activation this round: deriveSeed(seed, 'ai-blue', round, modelId). */
export function blueFaceFor(seed: string, round: number, modelId: ModelId, faces: number): number {
  void seed; void round; void modelId; void faces
  return todo('official.blueFaceFor')
}

/** Number Token draw: one of the legal turn.ready options, uniform, deriveSeed(seed, 'ai-token', pending.id). */
export function drawToken(seed: string, pending: PendingDecision, legal: readonly Action[]): Action {
  void seed; void pending; void legal
  return todo('official.drawToken')
}

/** Build the official decider for one AI seat. Same seed and inputs -> same answers. */
export function createOfficialAiDecider(opts: OfficialAiOpts): OfficialAiDecider {
  const log: AiDecisionLog[] = []
  function decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): OfficialDecision {
    void view; void pending; void legal; void opts
    return todo('official.decideSync')
  }
  return {
    log,
    decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
