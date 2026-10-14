// Oriented footprint of a long scenario object (the Red Rocket lying on its side, the missile sled). An object with
// props.lengthIn and props.widthIn is a rectangle, not a round base: props.rotDeg turns its long axis from +x towards +z
// (default 0). Objects without those props keep the round stand-in from props.baseMm. Pure geometry, no state.
import type { MarkerState, Vec2 } from '../types'

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

export interface ObjectRect { c: Vec2; hl: number; hw: number; cos: number; sin: number }

/** The object's rectangle, or null when it has none (a round stand-in or a bare token). */
export function objectRect(mk: Pick<MarkerState, 'pos' | 'props'>): ObjectRect | null {
  const l = num(mk.props.lengthIn), w = num(mk.props.widthIn)
  if (l === undefined || w === undefined) return null
  const a = ((num(mk.props.rotDeg) !== undefined || mk.props.rotDeg === 0 ? Number(mk.props.rotDeg) : 0) * Math.PI) / 180
  return { c: mk.pos, hl: l / 2, hw: w / 2, cos: Math.cos(a), sin: Math.sin(a) }
}

/** Distance from a point to the rectangle's edge (0 inside). */
export function rectEdgeDist(r: ObjectRect, p: Vec2): number {
  const dx = p.x - r.c.x, dz = p.z - r.c.z
  const lx = dx * r.cos + dz * r.sin, lz = -dx * r.sin + dz * r.cos
  return Math.hypot(Math.max(Math.abs(lx) - r.hl, 0), Math.max(Math.abs(lz) - r.hw, 0))
}

/** Half-extent of the rectangle along the table axes (for keeping it on the table). */
export function rectExtent(r: ObjectRect): { hx: number; hz: number } {
  return { hx: Math.abs(r.cos) * r.hl + Math.abs(r.sin) * r.hw, hz: Math.abs(r.sin) * r.hl + Math.abs(r.cos) * r.hw }
}

/** Distance from a model's base edge to the object's edge when the object has a rectangle, else null (callers keep their round maths). */
export function rectGapToBase(mk: Pick<MarkerState, 'pos' | 'props'>, at: Vec2, baseRadiusIn: number): number | null {
  const r = objectRect(mk)
  return r ? Math.max(0, rectEdgeDist(r, at) - baseRadiusIn) : null
}
