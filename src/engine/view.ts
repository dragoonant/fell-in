// Hidden information: deciders only ever receive view(state, seat), never the raw state.
// TODO(M2): redact hidden cards (hands, decks, AI card piles) once the card model lands. Today nothing is hidden.
import type { GameState, PlayerView, SeatId } from './types'

export function view(state: GameState, seat: SeatId): PlayerView {
  return {
    seat,
    models: state.models,
    terrain: state.terrain,
    clouds: state.clouds,
    scenario: state.scenario,
    pending: state.pending,
  }
}
