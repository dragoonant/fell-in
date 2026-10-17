// When the human seat should hear "your turn": the first decision of each round that is theirs. Pure so it can be tested.
import type { SeatId } from '../../engine/types'

export interface TurnView {
  round: number
  phase: string
  /** The seat that answers the open decision (store.ownerSeat), null when none. */
  seat: SeatId | null
}

/** Returns the round to remember when the line should play now, else null. `lastRound` is the round already announced. */
export function yourTurnRound(v: TurnView, controllers: Record<SeatId, string>, lastRound: number): number | null {
  if (v.phase === 'over' || v.round < 1 || v.round === lastRound) return null
  return v.seat !== null && controllers[v.seat] === 'human' ? v.round : null
}
