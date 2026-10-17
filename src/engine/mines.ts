// Mines (WPN-003, RoP s5.3 p46; spec 14 s7, spec 15). Checklist: WPN-003.
// A mine is a weapon card with `mine: { trigger: Colour }` and an area `damage` entry (the blast diameter). A model places it
// with a Move Action (move.mine, owned by movement.ts) and the marker lives in the runtime bag on `state.scenario.mines`
// (the frozen ScenarioState type is not widened, like scenarios/rules.ts does). It arms at the start of its owner's next turn
// (the first 'turn.ready' of the owner's team in the action log after the placement) and then fires on any opposing model that
//  - ends an Action with its base partly inside the trigger area (hooks.ts calls `afterActionMines` for every finished Action), or
//  - moves through the area in a Move that would end outside it (movement.ts calls `minesCrossed`; the move pauses at the first
//    touching point, the blast resolves, and the move goes on if the model is still standing).
// The blast is an area effect centred on the marker: every model touched, friend or foe, takes the damage and rolls its own armor;
// terrain that blocks line of sight stops it and other cover adds 1 armor. Mines carry no dice, so no DMG/AR icons.
import type { Colour, EditionBundle, WeaponDef } from '../data/types'
import { applyHit } from './damage'
import { recordOf, rulerInches } from './edition'
import { baseRadius, dist, EPS, isOnTable, norm, sub, sweepCircleHit } from './geometry'
import { coverOf } from './attack'
import { hasLos } from './los'
import { modelsInCircle } from './measure'
import { withProbe } from './objects'
import { pushEvents } from './registry'
import { hostile, sameTeam } from './sides'
import type { CarriedItem, GameState, MarkerState, ModelId, ModelState, SeatId, Vec2 } from './types'

/** One mine on the table. `placedAt` is the action-log length when it was dropped. */
export interface MineState { id: string; owner: SeatId; pos: Vec2; weaponId: string; placedAt: number }

interface Bag { mines?: MineState[] }
const bag = (s: GameState): Bag => s.scenario as unknown as Bag

export const minesOf = (s: GameState): MineState[] => bag(s).mines ?? []
const withMines = (s: GameState, mines: MineState[]): GameState => ({ ...s, scenario: { ...s.scenario, mines } as unknown as GameState['scenario'] })
const defOf = (bundle: EditionBundle, mine: MineState): WeaponDef | undefined => recordOf(bundle, 'weapons', mine.weaponId)

/** Unspent mine cards a model carries. */
export function mineCards(state: GameState, bundle: EditionBundle, modelId: ModelId): CarriedItem[] {
  return (state.models[modelId]?.carried ?? []).filter((c) => c.kind === 'weapon' && !c.spent && !!recordOf(bundle, 'weapons', c.defId)?.mine)
}

/** Trigger radius in inches (the colour of the card's short-range bar, here `mine.trigger`). */
export const triggerInches = (bundle: EditionBundle, def: WeaponDef): number => rulerInches(bundle, def.mine!.trigger)

/** Blast diameter colour: the area colour on the mine's damage entry. */
const blastColour = (def: WeaponDef): Colour | null => def.damage.find((d) => d.area)?.area ?? null

/** WPN-003: active from the start of the owner's next turn, i.e. once the owner's team has Readied a model since the drop. */
export function isActive(state: GameState, mine: MineState): boolean {
  const log = state.log ?? []
  for (let i = mine.placedAt + 1; i < log.length; i++) {
    const a = log[i]!
    if (a.type === 'turn.ready' && sameTeam(state, a.seat, mine.owner)) return true
  }
  return false
}

const inArea = (bundle: EditionBundle, def: WeaponDef, mine: MineState, m: ModelState): boolean =>
  dist(m.pos, mine.pos) - baseRadius(m.base) <= triggerInches(bundle, def) + EPS

/** Place a mine from a carried card at `at` (the caller has already checked reach). The card is used up. */
export function dropMine(state: GameState, bundle: EditionBundle, modelId: ModelId, uid: string, at: Vec2): GameState {
  const m = state.models[modelId]
  const card = m?.carried.find((c) => c.uid === uid)
  if (!m || !card) return state
  const mine: MineState = { id: `mine:${uid}`, owner: m.owner, pos: { x: at.x, z: at.z }, weaponId: card.defId, placedAt: (state.log ?? []).length }
  let s = withMines(state, [...minesOf(state), mine])
  s = { ...s, models: { ...s.models, [modelId]: { ...m, carried: m.carried.map((c) => (c.uid === uid ? { ...c, spent: true } : c)) } } }
  return pushEvents(s, [{ type: 'minePlaced', mineId: mine.id, modelId, pos: mine.pos }])
}

/** Explode a mine now: it leaves the table and the blast hits everything it touches (WPN-003, DMG-007). */
export function detonate(state: GameState, bundle: EditionBundle, mine: MineState): GameState {
  const def = defOf(bundle, mine)
  let s = withMines(state, minesOf(state).filter((x) => x.id !== mine.id))
  s = pushEvents(s, [{ type: 'mineDetonated', mineId: mine.id, pos: { ...mine.pos } }])
  const colour = def ? blastColour(def) : null
  if (!def || !colour) return s
  const marker: MarkerState = { id: mine.id, kind: 'object', pos: mine.pos, revealed: true, seenBy: [], props: { baseMm: 25 } }
  const probed = withProbe(s, marker)
  const radius = rulerInches(bundle, colour) / 2
  const hit = modelsInCircle(s, mine.pos, radius)
    .sort((a, b) => dist(a.pos, mine.pos) - dist(b.pos, mine.pos) || a.id.localeCompare(b.id))
  for (const o of hit) {
    if (!isOnTable(s.models[o.id]!)) continue
    if (!hasLos(probed.state, probed.probeId, o.id)) continue // blockers stop the blast
    const cover = coverOf(probed.state, bundle, probed.probeId, o.id).cover // other cover adds 1 armor
    s = applyHit(s, bundle, { targetId: o.id, damage: def.damage.map((d) => ({ type: d.type, value: d.value, ...(d.lowerOfPhysEnergy ? { lowerOfPhysEnergy: true } : {}) })), dmg: 0, ar: 0, cover }).state
  }
  return s
}

/** A model just finished an Action: every active enemy mine whose area it stands in goes off (one after another). */
export function afterActionMines(state: GameState, bundle: EditionBundle, modelId: ModelId): GameState {
  let s = state
  for (let guard = 0; guard < 32; guard++) {
    const m = s.models[modelId]
    if (!m || !isOnTable(m) || !minesOf(s).length) return s
    const hit = minesOf(s).find((mine) => {
      const def = defOf(bundle, mine)
      return !!def?.mine && isActive(s, mine) && hostile(s, mine.owner, m.owner) && inArea(bundle, def, mine, m)
    })
    if (!hit) return s
    s = detonate(s, bundle, hit)
  }
  return s
}

/**
 * Enemy mines a Move passes through without ending inside, in path order, each with the point where the base first touches
 * the trigger area (the start point when it already stands in it). A move that ends inside is handled by `afterActionMines`.
 */
export function minesCrossed(state: GameState, bundle: EditionBundle, moverId: ModelId, from: Vec2, path: readonly Vec2[], end: Vec2): { mine: MineState; point: Vec2 }[] {
  const m = state.models[moverId]
  if (!m || !minesOf(state).length) return []
  const r = baseRadius(m.base)
  const found: { mine: MineState; point: Vec2; at: number }[] = []
  for (const mine of minesOf(state)) {
    const def = defOf(bundle, mine)
    if (!def?.mine || !isActive(state, mine) || !hostile(state, mine.owner, m.owner)) continue
    const T = triggerInches(bundle, def)
    if (dist(end, mine.pos) <= T + r + EPS) continue // ends inside: the end-of-Action rule fires it
    const pts = [from, ...path]
    let travelled = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!
      const l = dist(a, b)
      if (i === 0 && dist(a, mine.pos) <= T + r + EPS) { found.push({ mine, point: { ...a }, at: 0 }); break }
      const s = l < EPS ? null : sweepCircleHit(a, norm(sub(b, a)), l, r, mine.pos, T)
      if (s !== null) {
        const d = norm(sub(b, a))
        found.push({ mine, point: { x: a.x + d.x * s, z: a.z + d.z * s }, at: travelled + s })
        break
      }
      travelled += l
    }
  }
  return found.sort((x, y) => x.at - y.at).map(({ mine, point }) => ({ mine, point }))
}
