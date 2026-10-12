// View helpers (spec 30 s1): the query shim built from a PlayerView, the worker's dry-run check, and small lookups.
// Nothing here computes a rules number; query.* does that against the shim.
import type { EditionBundle } from '../data/types'
import { matchesOption } from '../engine/apply'
import { isOnTable } from '../engine/geometry'
import { isRejection, moduleFor } from '../engine/registry'
import { seedRng } from '../engine/rng'
import { moveColour } from '../engine/movement'
import { gameDefaults } from '../engine/setup'
import { view as playerView } from '../engine/view'
import type { Action, GameState, ModelId, ModelState, SeatId, Vec2 } from '../engine/types'
import type { AiView } from './types'

/**
 * A read-only GameState for query.* built from the view: the view's models, terrain, clouds, scenario and pending,
 * game defaults for the rest, a throwaway rng, and an activation naming pending.context.modelId when there is one.
 */
export function queryState(view: AiView, bundle: EditionBundle): GameState {
  const modelId = (view.pending.context as { modelId?: unknown }).modelId
  const activeId = typeof modelId === 'string' && view.models[modelId] ? modelId : null
  const base = gameDefaults(bundle.edition)
  const st: GameState = {
    ...base,
    seed: 'ai-shim',
    rng: seedRng('ai-shim'),
    rollSeq: 0,
    decisionSeq: 0,
    models: view.models,
    terrain: view.terrain,
    clouds: view.clouds,
    scenario: view.scenario,
    pending: view.pending,
    log: [],
    phase: 'play',
    round: view.round ?? 1,
    maxRounds: view.maxRounds ?? null,
    scenarioId: view.scenarioId ?? null,
    markers: view.markers ?? [],
    activation: activeId ? { modelId: activeId, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } : null,
  }
  // A Quick Action move walks one colour shorter (AP-002): infer it from the colour the engine put in the decision.
  if (view.pending.kind === 'move.path' && activeId) {
    const colour = (view.pending.context as { colour?: unknown }).colour
    const quick = typeof colour === 'string' && moveColour(st, bundle, activeId, { quick: false }) !== colour
    return { ...st, action: { modelId: activeId, type: 'move.go', quick, reaction: false, free: false, itemUsed: false } }
  }
  return st
}

/**
 * The view plus the extras the AI reads (round, scenario, markers with hidden faces redacted for `seat`). Hosts that
 * hold the real state (client driver, bench) should pass this instead of a bare view(state, seat).
 */
export function aiViewOf(state: GameState, seat: SeatId): AiView {
  return {
    ...playerView(state, seat),
    round: state.round,
    maxRounds: state.maxRounds,
    scenarioId: state.scenarioId,
    markers: state.markers.map((m) => {
      if (m.revealed || m.seenBy.includes(seat)) return m
      const { face: _hidden, ...rest } = m
      return rest
    }),
  }
}

const BASES = new WeakMap<GameState, GameState>()
/** The decision's own shim a derived shim was built from (itself when not derived); odds.ts memoises per base. */
export const baseOf = (q: GameState): GameState => BASES.get(q) ?? q

/** The shim with one model moved (threat and move scoring ask query.* "what if it stood here"). */
export function withModelAt(q: GameState, modelId: ModelId, pos: Vec2): GameState {
  const m = q.models[modelId]
  if (!m) return q
  const out = { ...q, models: { ...q.models, [modelId]: { ...m, pos } } }
  BASES.set(out, baseOf(q))
  return out
}

/**
 * Worker dry-run (spec 30 s1): the answer matches a legal template and the owning module's resolve() accepts it on the
 * shim. Close to the real engine, not exact (no Quick Action allowance); the host re-validates.
 */
export function shimAccepts(view: AiView, bundle: EditionBundle): (action: Action) => boolean {
  let q: GameState | null = null
  return (action) => {
    if (!view.pending.options.some((o) => matchesOption(action, o.action))) return false
    const mod = moduleFor(view.pending.kind)
    if (!mod) return false
    try {
      q ??= queryState(view, bundle)
      return !isRejection(mod.resolve(q, bundle, action))
    } catch {
      return false
    }
  }
}

/** True when the answer matches one of the legal templates (extra fields are parameters). */
export const isLegalShape = (action: Action, legal: readonly Action[]): boolean => legal.some((t) => matchesOption(action, t))

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
export const live = (m: ModelState | undefined): m is ModelState => !!m && m.life === 'active' && isOnTable(m)
export const modelsOf = (view: AiView, seat: SeatId): ModelState[] => Object.values(view.models).filter((m) => m.owner === seat && live(m))
export const enemiesOf = (view: AiView, seat: SeatId): ModelState[] => Object.values(view.models).filter((m) => m.owner !== seat && live(m))
/** The model a decision is about (pending.context.modelId), if any. */
export const contextModel = (view: AiView): ModelState | undefined => {
  const id = (view.pending.context as { modelId?: unknown }).modelId
  return typeof id === 'string' ? view.models[id] : undefined
}

/** Round tracker per AiMemory: readiness seen last decision, and the inferred round. */
const rounds = new WeakMap<object, { round: number; seen: Map<ModelId, ModelState['readiness']> }>()

/**
 * Update the round count from what the view shows (call once per decision). The view has no round number yet
 * (ViewExtras.round when the engine adds it): a live model that was Ready or Used last time and is Unready now means
 * a new round started (readiness resets every round, TURN-001).
 */
export function observeRound(memory: object, view: AiView): void {
  let r = rounds.get(memory)
  if (!r) rounds.set(memory, (r = { round: 1, seen: new Map() }))
  let reset = false
  for (const m of Object.values(view.models)) {
    if (!live(m)) continue
    const before = r.seen.get(m.id)
    if ((before === 'used' || before === 'ready') && m.readiness === 'unready') reset = true
    r.seen.set(m.id, m.readiness)
  }
  if (reset) r.round++
}

/** The current round: the view's own number when present, else the tracked count. */
export function roundOf(memory: object, view: AiView): number {
  return view.round ?? rounds.get(memory)?.round ?? 1
}
