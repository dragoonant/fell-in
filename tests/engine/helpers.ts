// Shared engine test fixtures. Node only (reads data/ from disk like tools/validate-data.ts; no Vite glob).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBundles, type RawFile } from '../../src/data/bundle'
import type { EditionBundle, ScenarioForce } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import type { Decider } from '../../src/engine/decider'
import { legalActions } from '../../src/engine/pending'
import { raiseDecision } from '../../src/engine/registry'
import { createGame, modelDefaults } from '../../src/engine/setup'
import type { DecisionOption, GameState, ModelId, ModelState, PendingDecision, Rejection, SeatId, TerrainInstance, TerrainRulesType } from '../../src/engine/types'
import { view } from '../../src/engine/view'

// ---------- geometry fixtures (M0) ----------
export function mdl(id: string, x: number, z: number, o: Partial<ModelState> = {}): ModelState {
  return { ...modelDefaults(), id, profileId: 'p', owner: 'A', pos: { x, z }, elev: 0, base: 32, life: 'active', conditions: [], ...o }
}
export function ter(
  id: string, rulesType: TerrainRulesType, x: number, z: number, w: number, d: number, height: number, props: Record<string, unknown> = {},
): TerrainInstance {
  return { id, pieceId: id, rulesType, pos: { x, z }, rot: 0, footprint: { rect: { w, d } }, height, props }
}
export function world(models: ModelState[], terrain: TerrainInstance[] = [], clouds: GameState['clouds'] = []): GameState {
  return {
    models: Object.fromEntries(models.map((m) => [m.id, m])), terrain, clouds,
    scenario: { table: { w: 36, d: 36 } },
  } as unknown as GameState
}

// ---------- data ----------
export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data')
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}
const bundles = new Map<string, EditionBundle>()
/** The edition bundle read from data/ on disk (cached). Treat it as read-only; clone before patching. */
export function loadBundle(edition = '1e'): EditionBundle {
  const hit = bundles.get(edition)
  if (hit) return hit
  const files: RawFile[] = []
  for (const abs of walk(DATA_DIR)) {
    const path = relative(DATA_DIR, abs).split('\\').join('/')
    if (path === 'editions.json') continue
    files.push({ path, json: JSON.parse(readFileSync(abs, 'utf8')) })
  }
  const built = buildBundles(files).bundles
  for (const [k, b] of Object.entries(built)) bundles.set(k, b)
  const b = bundles.get(edition)
  if (!b) throw new Error(`loadBundle: no edition ${edition} under data/`)
  return b
}
/** A deep copy of the bundle with singletons patched (e.g. a one-face skill die for exact tests). */
export function patchBundle(bundle: EditionBundle, patch: Partial<EditionBundle['singletons']>): EditionBundle {
  const copy = structuredClone(bundle)
  return { ...copy, singletons: { ...copy.singletons, ...patch } }
}

// ---------- game fixtures ----------
/** Raise an arbitrary decision (stamps ids into the options). */
export function withPending(state: GameState, spec: Omit<PendingDecision, 'id'>): GameState {
  return raiseDecision(state, spec)
}

export interface DuelOpts {
  seed?: string
  attacker?: ScenarioForce
  target?: ScenarioForce
  /** Base-centre distance along z, attacker at +z/2, target at -z/2. Default 8 in. */
  distance?: number
}
export interface Duel { state: GameState; bundle: EditionBundle; attackerId: ModelId; targetId: ModelId }

/**
 * Two models alone on an empty 36 x 36 table, round 1, in play: seat A's attacker (default Sole Survivor with Hunting
 * Rifle and Baseball Bat) is mid-activation; seat B's target (default Super Mutant with Board) is Unready. The open
 * decision is a 'turn.activation' menu with one 'turn.end' option, so module tests can call their functions directly
 * or raise their own decision with withPending().
 */
export function duel(o: DuelOpts = {}): Duel {
  const bundle = loadBundle()
  const attacker = o.attacker ?? { unit: 'sole-survivor', count: 1, items: ['hunting-rifle', 'baseball-bat'] }
  const target = o.target ?? { unit: 'super-mutant', count: 1, items: ['board'] }
  const g = createGame(bundle, { seed: o.seed ?? 'duel', forces: { A: [{ ...attacker, count: 1 }], B: [{ ...target, count: 1 }] } })
  const [attackerId] = Object.values(g.models).filter((m) => m.owner === 'A').map((m) => m.id)
  const [targetId] = Object.values(g.models).filter((m) => m.owner === 'B').map((m) => m.id)
  const half = (o.distance ?? 8) / 2
  const models = {
    [attackerId!]: { ...g.models[attackerId!]!, pos: { x: 0, z: half }, readiness: 'ready' as const },
    [targetId!]: { ...g.models[targetId!]!, pos: { x: 0, z: -half } },
  }
  const base: GameState = {
    ...g, models, terrain: [], markers: [], phase: 'play', round: 1, advantage: 'A',
    turn: { seat: 'A', step: 'use', readied: attackerId!, firstSeat: 'A' },
    activation: { modelId: attackerId!, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
  }
  const end: DecisionOption = { id: 'end', label: 'End activation', action: { type: 'turn.end', decisionId: '', seat: 'A' } }
  const state = withPending(base, { seat: 'A', kind: 'turn.activation', context: { modelId: attackerId }, options: [end], canPass: false })
  return { state, bundle, attackerId: attackerId!, targetId: targetId! }
}

export interface RunResult { state: GameState; steps: number; rejections: Rejection[]; stoppedBy: 'over' | 'maxSteps' | 'rejected' }

/**
 * Drive a game with one decider per seat until it is over, maxSteps is hit, or an action is rejected (returned in
 * `rejections`; E_TODO while modules are stubs). Seat 'all' decisions go to the first seat in seatOrder. Deterministic.
 */
export async function runDeciders(state: GameState, bundle: EditionBundle, deciders: Record<SeatId, Decider>, opts: { maxSteps?: number } = {}): Promise<RunResult> {
  let s = state
  const rejections: Rejection[] = []
  for (let steps = 0; steps < (opts.maxSteps ?? 500); steps++) {
    if (s.phase === 'over') return { state: s, steps, rejections, stoppedBy: 'over' }
    const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
    const decider = deciders[seat]
    if (!decider) throw new Error(`runDeciders: no decider for seat ${seat}`)
    const action = await decider.decide(view(s, seat), s.pending, legalActions(s))
    const r = apply(s, bundle, action)
    if (!r.ok) { rejections.push(r.rejection); return { state: s, steps, rejections, stoppedBy: 'rejected' } }
    s = r.state
  }
  return { state: s, steps: opts.maxSteps ?? 500, rejections, stoppedBy: 'maxSteps' }
}
