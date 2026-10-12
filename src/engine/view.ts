// Hidden information: deciders only ever receive view(state, seat), never the raw state.
// M4b: the view also carries round, maxRounds, scenarioId and the scenario markers, with hidden faces removed. A marker's
// face stays hidden from a seat until the marker is revealed or someone on that seat's team has peeked at it (SRCH-001,
// COOP s4). Objects and shootable targets are open information. TODO(M2): hands and decks when the card model lands.
import { sameTeam } from './sides'
import type { GameState, MarkerState, PlayerView, SeatId } from './types'

/** Props that stay visible on a face-down marker (they say where it is, not what it is). */
const PUBLIC_PROPS = ['offTable', 'destroyed'] as const

function redactMarker(state: GameState, seat: SeatId, m: MarkerState): MarkerState {
  if (m.kind === 'object' || m.revealed || m.props['shootable'] === true || m.props['public'] === true) return m
  if (m.seenBy.some((x) => sameTeam(state, x, seat))) return m
  const { face: _hidden, ...rest } = m
  const props: Record<string, unknown> = {}
  for (const k of PUBLIC_PROPS) if (k in m.props) props[k] = m.props[k]
  return { ...rest, props }
}

export function view(state: GameState, seat: SeatId): PlayerView {
  return {
    seat,
    models: state.models,
    terrain: state.terrain,
    clouds: state.clouds,
    scenario: state.scenario,
    pending: state.pending,
    round: state.round,
    maxRounds: state.maxRounds,
    scenarioId: state.scenarioId,
    markers: (state.markers ?? []).map((m) => redactMarker(state, seat, m)),
  }
}
