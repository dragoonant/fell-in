// Pure figure helpers: facing, tint, pips, pose. Cosmetic only; the engine owns every rules number.
import type { GameState, ModelId, ModelState, Vec2 } from '../../engine/types'

/** Figures have their front on +Z, so a world direction (dx, dz) is a yaw of atan2(dx, dz) about +Y. */
export function facingYaw(state: GameState | null | undefined, id: ModelId, pos: Vec2): number | null {
  const m = state?.models[id]
  if (!state || !m) return null
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const o of Object.values(state.models)) {
    if (o.owner === m.owner || o.offTable || o.life === 'dead') continue
    const d = (o.pos.x - pos.x) ** 2 + (o.pos.z - pos.z) ** 2
    if (d < bestD && d > 1e-6) { bestD = d; best = o.pos }
  }
  if (best) return Math.atan2(best.x - pos.x, best.z - pos.z)
  // nobody to face: look across the table from the owner's side (seat 0 stands on +z)
  const i = state.seatOrder.indexOf(m.owner)
  return i === 0 ? Math.PI : i === 1 ? 0 : null
}

/** Step `from` toward `to` along the shorter arc by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return Math.abs(d) <= maxStep ? to : from + Math.sign(d) * maxStep
}

/** Damage tokens and radiation tokens as shown on the base (display counts of the model's own tokens). */
export function pipCounts(m: Pick<ModelState, 'damage' | 'rad'>): { damage: number; rad: number } {
  return { damage: Math.max(0, m.damage | 0), rad: Math.max(0, m.rad | 0) }
}

/** Pip positions on an arc in front of the base, local to the figure (x, z), spread over `span` radians. */
export function pipSlots(n: number, radius: number, span = Math.PI * 0.9): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)
    out.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius })
  }
  return out
}

export type FigureLook = 'standing' | 'down' | 'gone'
export function lookOf(m: Pick<ModelState, 'life' | 'offTable'>): FigureLook {
  return m.life === 'dead' || m.offTable ? 'gone' : m.life === 'down' ? 'down' : 'standing'
}

/** Faction tint by seat order (body, accent): seat 0 teal, seat 1 rust, then sand and dark teal. */
export const SEAT_TINTS: [string, string][] = [['#4f8a82', '#d8c49a'], ['#a4502c', '#5c5f5e'], ['#c9ad7c', '#6d3319'], ['#2f5a55', '#ece3d0']]
export const tintFor = (seatIndex: number): [string, string] => SEAT_TINTS[Math.max(0, seatIndex) % SEAT_TINTS.length]!
