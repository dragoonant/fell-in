// Helpers for raising the single open PendingDecision. Pure.
import type { GameState, PendingDecision } from './types'

/** Stamp a fresh decision id (d:<n>) and store it as state.pending. */
export function raise(state: GameState, spec: Omit<PendingDecision, 'id'>): { state: GameState; pending: PendingDecision } {
  const seq = state.decisionSeq + 1
  const pending: PendingDecision = { ...spec, id: `d:${seq}` }
  return { state: { ...state, decisionSeq: seq, pending }, pending }
}

/** Legal actions for an open decision: never empty (a rule of the engine). */
export function legalActions(state: GameState) {
  return state.pending.options.map((o) => o.action)
}
