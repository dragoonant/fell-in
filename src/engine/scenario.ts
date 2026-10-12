// Checklist (owner I): SCN. Spec 17.
// Owns 'scenario.*' (scenario-specific Actions such as picking up an objective) and 'deploy.*' (interactive deployment,
// TURN-013, when a scenario asks for it). setup.ts already places forces, terrain and markers automatically.
import type { EditionBundle, ScenarioDef } from '../data/types'
import { recordOf } from './edition'
import { baseRadius, dist } from './geometry'
import { isEngaged } from './attack'
import { option, pushEvents, reject, type ModuleDef, type StepResult } from './registry'
import type { Action, DecisionOption, GameResult, GameState, MarkerState, ModelId, ModelState, SeatId } from './types'

/** Geometry tolerance for "token touching a base" (a table fact, not an edition rule). */
const MARKER_REACH_IN = 0.5

/** Foundations-implemented: the scenario record this game was built from. */
export function scenarioDefOf(state: GameState, bundle: EditionBundle): ScenarioDef | undefined {
  return state.scenarioId ? recordOf(bundle, 'scenarios', state.scenarioId) : undefined
}

// ---------- verdicts ----------
interface Verdict { side: string | null; level?: 'major' | 'minor'; reason: string }
type Phase = 'action' | 'roundEnd'
interface Ctx { state: GameState; bundle: EditionBundle; def: ScenarioDef; phase: Phase }

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Pull a count out of the scenario's own victory text, so numbers live in the data ("Three or more", "round 9", "4 or more"). */
function numberIn(text: string, after: RegExp): number | null {
  const m = text.match(after)
  if (!m) return null
  const raw = m[1]!.toLowerCase()
  return NUMBER_WORDS[raw] ?? (Number.isFinite(Number(raw)) ? Number(raw) : null)
}
const victoryText = (def: ScenarioDef, side: string, level?: string): string =>
  def.victory.find((v) => v.side === side && (!level || v.level === level))?.when ?? ''

const alive = (m: ModelState): boolean => m.life !== 'dead'
const onTable = (m: ModelState): boolean => alive(m) && !m.offTable
const seatOfSide = (state: GameState, side: string): SeatId | undefined => state.seatOrder.find((s) => state.seats[s]?.side === side)
const sideOfSeat = (state: GameState, seat: SeatId): string => state.seats[seat]?.side ?? seat
const markersOf = (state: GameState, face: string): MarkerState[] => state.markers.filter((m) => m.face === face)

/** True when a marker has left the table: flagged, or carried by a model that left it. */
function markerGone(state: GameState, mk: MarkerState): boolean {
  if (mk.props.offTable === true) return true
  const c = mk.carriedBy ? state.models[mk.carriedBy] : undefined
  return !!c && alive(c) && !!c.offTable
}
/** Seat whose live model holds the marker, if any. */
function holderSeat(state: GameState, mk: MarkerState): SeatId | null {
  const c = mk.carriedBy ? state.models[mk.carriedBy] : undefined
  return c && onTable(c) ? c.owner : null
}

/** Scenario-specific end conditions, keyed by scenario id. Each reads only state; none rolls. */
const EVALUATORS: Record<string, (c: Ctx) => Verdict | null> = {
  'ga-2': (c) => tutorialAll(c, 'hit', 'every target was hit'),
  'ga-3': (c) => tutorialAll(c, 'hit', 'every target was hit'),
  'ga-4': (c) => tutorialAll(c, 'damaged', 'every mound took damage'),
  'box-2': (c) => {
    const nuke = markersOf(c.state, 'nuke')[0]
    if (!nuke) return null
    if (nuke.props.exploded === true) return { side: null, reason: 'The nuke went off and took both forces with it' }
    if (markerGone(c.state, nuke)) return { side: 'attacker', reason: 'The nuke was carried off the table' }
    const hold = numberIn(victoryText(c.def, 'defender'), /round (\d+)/i)
    if (c.phase === 'roundEnd' && hold !== null && c.state.round >= hold && holderSeat(c.state, nuke) === seatOfSide(c.state, 'defender')) {
      return { side: 'defender', reason: 'The defenders still hold the nuke' }
    }
    return null
  },
  'box-3': (c) => {
    const need = numberIn(victoryText(c.def, 'attacker'), /(\w+) or more/i)
    const out = markersOf(c.state, 'book').filter((b) => markerGone(c.state, b)).length
    return need !== null && out >= need ? { side: 'attacker', reason: 'Enough books left the table' } : null
  },
  'box-4': (c) => {
    if (c.phase !== 'roundEnd' || c.state.maxRounds === null || c.state.round < c.state.maxRounds) return null
    const tower = markersOf(c.state, 'tower')[0]
    if (!tower) return null
    const tally: Record<string, { n: number; pts: number }> = {}
    for (const m of Object.values(c.state.models)) {
      if (!onTable(m)) continue
      const t = (tally[m.owner] ??= { n: 0, pts: 0 })
      t.pts += recordOf(c.bundle, 'units', m.profileId)?.cost ?? 0
      if (dist(m.pos, tower.pos) - baseRadius(m.base) <= MARKER_REACH_IN) t.n++
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1].n - a[1].n || b[1].pts - a[1].pts)
    const [first, second] = ranked
    if (!first || (second && first[1].n === second[1].n && first[1].pts === second[1].pts)) return { side: null, reason: 'The tower is shared evenly' }
    const side = sideOfSeat(c.state, first[0])
    return { side, level: side === 'attacker' ? 'major' : 'minor', reason: 'Most models at the tower when time ran out' }
  },
  'ai-rr': (c) => {
    const rocket = markersOf(c.state, 'red-rocket')[0]
    if (!rocket) return null
    const hp = typeof rocket.props.health === 'number' ? rocket.props.health : null
    if (hp !== null && hp <= 0) return { side: 'super-mutants', reason: 'The rocket was wrecked' }
    if (markerGone(c.state, rocket)) return { side: 'survivors', level: 'major', reason: 'The rocket was shoved off the far corner' }
    const keep = numberIn(victoryText(c.def, 'survivors', 'minor'), /(\d+) or more/i)
    if (c.phase === 'roundEnd' && c.state.maxRounds !== null && c.state.round >= c.state.maxRounds && hp !== null && keep !== null && hp >= keep) {
      return { side: 'survivors', level: 'minor', reason: 'The rocket survived with health to spare' }
    }
    return null
  },
  'ai-missile': (c) => {
    const sled = markersOf(c.state, 'missile-sled')[0]
    if (!sled) return null
    if (sled.props.detonated === true) return { side: null, reason: 'The missile detonated' }
    if (sled.props.sabotaged === true) return { side: 'player', reason: 'The sled was sabotaged' }
    if (markerGone(c.state, sled)) return { side: 'super-mutants', reason: 'The sled left the table' }
    return null
  },
}

function tutorialAll(c: Ctx, flag: string, reason: string): Verdict | null {
  const targets = c.state.markers.filter((m) => m.kind === 'investigation')
  if (targets.length === 0) return null
  const done = targets.every((m) => (typeof m.props[flag] === 'number' ? (m.props[flag] as number) > 0 : m.props[flag] === true))
  return done ? { side: c.def.victory[0]?.side ?? null, reason } : null
}

/** Fallback for every scenario: a group with nobody left on the table loses. Co-op seats pool as "players" against the AI. */
function lastGroupStanding(c: Ctx): Verdict | null {
  const group = (s: SeatId): string => (c.def.mode === 'coop' ? (sideOfSeat(c.state, s) === 'ai' ? 'ai' : 'players') : s)
  const groups = new Set(c.state.seatOrder.map(group))
  if (groups.size < 2) return null
  const standing = new Set<string>()
  for (const m of Object.values(c.state.models)) if (onTable(m) && !m.inert) standing.add(group(m.owner))
  if (standing.size >= groups.size) return null
  if (standing.size === 0) return { side: null, reason: 'Nobody is left standing' }
  if (standing.size > 1) return null
  const g = [...standing][0]!
  const seat = c.state.seatOrder.find((s) => group(s) === g)!
  return { side: sideOfSeat(c.state, seat), reason: 'The other side was wiped out' }
}

function toResult(c: Ctx, v: Verdict): GameResult {
  if (v.side === null) return { winner: null, reason: v.reason, caps: 0 }
  const entry = c.def.victory.find((e) => e.side === v.side && (!v.level || e.level === v.level)) ?? c.def.victory.find((e) => e.side === v.side)
  const seat = seatOfSide(c.state, v.side) ?? c.state.seatOrder.find((s) => c.state.seats[s]?.side === v.side) ?? null
  return { winner: seat, ...(entry?.level ? { level: entry.level } : v.level ? { level: v.level } : {}), reason: v.reason, ...(entry?.caps !== undefined ? { caps: entry.caps } : {}) }
}

function evaluate(state: GameState, bundle: EditionBundle, phase: Phase): GameResult | null {
  const def = scenarioDefOf(state, bundle)
  if (!def) return null
  const c: Ctx = { state, bundle, def, phase }
  const v = EVALUATORS[def.id]?.(c) ?? lastGroupStanding(c)
  return v ? toResult(c, v) : null
}

/** Victory check after every Action and at round end (SCN-001); null = play on. */
export function checkVictory(state: GameState, bundle: EditionBundle): GameResult | null {
  if (state.result) return state.result
  return evaluate(state, bundle, 'action')
}

/** A carrier who died drops the marker where they fell (BOX-2 pickup rules). */
function dropDeadCarriers(state: GameState): GameState {
  let changed = false
  const markers = state.markers.map((mk) => {
    const c = mk.carriedBy ? state.models[mk.carriedBy] : undefined
    if (!c || alive(c)) return mk
    changed = true
    const { carriedBy: _gone, ...rest } = mk
    return { ...rest, pos: { ...c.pos } }
  })
  return changed ? { ...state, markers } : state
}

/** Round end: scenario timers, round limit -> result, phase 'over' (SCN-001). Called by turnflow. */
export function endOfRound(state: GameState, bundle: EditionBundle): GameState {
  if (state.phase === 'over') return state
  const s = dropDeadCarriers(state)
  let result = evaluate(s, bundle, 'roundEnd')
  if (!result && s.maxRounds !== null && s.round >= s.maxRounds) result = { winner: null, reason: 'The round limit was reached with no winner', caps: 0 }
  if (!result) return s
  return pushEvents({ ...s, phase: 'over', result }, [{ type: 'gameOver', winner: result.winner, reason: result.reason }])
}

// ---------- scenario Actions: carry an objective ----------
/** Faces that a model may pick up and carry, by scenario (BOX-2 nuke, BOX-3 books). A marker may also opt in with props.carry. */
const CARRIED_FACES: Record<string, string[]> = { 'box-2': ['nuke'], 'box-3': ['book'] }

function carriable(state: GameState, mk: MarkerState): boolean {
  return !mk.carriedBy && (mk.props.carry === true || (!!state.scenarioId && !!mk.face && (CARRIED_FACES[state.scenarioId] ?? []).includes(mk.face)))
}
const touching = (m: ModelState, mk: MarkerState): boolean => dist(m.pos, mk.pos) - baseRadius(m.base) <= MARKER_REACH_IN

export const scenario: ModuleDef = {
  id: 'scenario',
  kinds: ['scenario', 'deploy'],
  options(state: GameState, _bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m || !onTable(m) || isEngaged(state, modelId)) return []
    const out: DecisionOption[] = []
    const carried = state.markers.filter((mk) => mk.carriedBy === modelId)
    for (const mk of state.markers) if (carriable(state, mk) && touching(m, mk)) out.push(option(`take:${mk.id}`, `Pick up the ${mk.face}`, 'scenario.pickup', { modelId, markerId: mk.id }))
    for (const mk of carried) out.push(option(`drop:${mk.id}`, `Put down the ${mk.face}`, 'scenario.drop', { modelId, markerId: mk.id }))
    return out
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    if (state.phase === 'over') return reject('E_GAME_OVER', 'The game is over')
    if (action.type.startsWith('deploy.')) return reject('E_NOT_LEGAL', 'Interactive deployment is not offered in this build')
    const modelId = (state.activation?.modelId ?? action.modelId) as string
    const m = state.models[modelId]
    const mk = state.markers.find((x) => x.id === action.markerId)
    if (!m || !mk) return reject('E_BAD_TARGET', 'Unknown model or marker')
    if (action.type === 'scenario.pickup') {
      if (!carriable(state, mk)) return reject('E_BAD_TARGET', 'That cannot be carried')
      if (isEngaged(state, modelId)) return reject('E_ENGAGED', 'Engaged models cannot pick things up')
      if (!touching(m, mk)) return reject('E_OUT_OF_RANGE', 'Not in contact with the marker')
      const s = { ...state, markers: state.markers.map((x) => (x.id === mk.id ? { ...x, carriedBy: modelId, pos: { ...m.pos } } : x)) }
      return { state: s, done: { modelId, type: action.type, triggers: [] } }
    }
    if (action.type === 'scenario.drop') {
      if (mk.carriedBy !== modelId) return reject('E_BAD_TARGET', 'You are not carrying that')
      const { carriedBy: _gone, ...rest } = mk
      const s = { ...state, markers: state.markers.map((x) => (x.id === mk.id ? { ...rest, pos: { ...m.pos } } : x)) }
      return { state: s, done: { modelId, type: action.type, triggers: [] } }
    }
    return reject('E_UNKNOWN_KIND', `scenario does not handle ${action.type}`)
  },
}
