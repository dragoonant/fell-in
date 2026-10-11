// Base-edge measurement . All distances in inches, never rounded.
import { baseRadius, dist, edgeDistance, isOnTable } from './geometry'
import type { GameState, Id, ModelState, Vec2 } from './types'

const TOL = 1e-6

/** Nearest base edge to nearest base edge (0 when touching or overlapping). */
export function modelDistance(a: ModelState, b: ModelState): number {
  return edgeDistance(a.pos, a.base, b.pos, b.base)
}
export function distanceBetween(state: GameState, aId: Id, bId: Id): number {
  return modelDistance(state.models[aId]!, state.models[bId]!)
}
/** Base edge to a point. */
export function modelToPoint(a: ModelState, p: Vec2): number {
  return Math.max(0, dist(a.pos, p) - baseRadius(a.base))
}
/** "within d": nearest edges at most d apart (exactly d counts). */
export function within(a: ModelState, b: ModelState, d: number): boolean {
  return modelDistance(a, b) <= d + TOL
}
/** "completely within d" of the anchor's edge: every part of the base is within d. */
export function completelyWithin(m: ModelState, anchor: ModelState, d: number): boolean {
  return dist(m.pos, anchor.pos) + baseRadius(m.base) - baseRadius(anchor.base) <= d + TOL
}
/** Range from the point of origin's edge to the target's edge. */
export function rangeTo(origin: ModelState, target: ModelState): number {
  return modelDistance(origin, target)
}
export function inRange(origin: ModelState, target: ModelState, rng: number): boolean {
  return rangeTo(origin, target) <= rng + TOL
}
/** Melee range check from the base edge. TODO(M2): Wasteland reach is its own ruler colour. */
export function inMeleeRange(attacker: ModelState, target: ModelState, reach = 1): boolean {
  return within(attacker, target, reach)
}

/** Models (on the table) within d of the anchor, nearest first. */
export function modelsWithin(
  state: GameState, anchorId: Id, d: number, filter: (m: ModelState) => boolean = () => true,
): ModelState[] {
  const a = state.models[anchorId]!
  return Object.values(state.models)
    .filter((m) => m.id !== anchorId && isOnTable(m) && within(a, m, d) && filter(m))
    .sort((x, y) => modelDistance(a, x) - modelDistance(a, y))
}
/** Models whose base overlaps a circle (clouds, AOEs: any part of the base counts). */
export function modelsInCircle(state: GameState, centre: Vec2, radius: number): ModelState[] {
  return Object.values(state.models).filter((m) => isOnTable(m) && dist(m.pos, centre) < radius + baseRadius(m.base) - 1e-9)
}
