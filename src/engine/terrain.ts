// Terrain prisms by rules type . Pure functions, inches.
// Self-contained on purpose (geometry.ts imports this file, not the other way round).
import type { DamageType, GameState, TerrainInstance, TerrainRulesType, Vec2 } from './types'

const EPS = 1e-9

// ---------- world shapes ----------
export type WorldShape = { kind: 'circle'; c: Vec2; r: number } | { kind: 'poly'; pts: Vec2[] }

/** Rotation convention: `rot` is radians about +y, so a local (x,z) maps to (x cos + z sin, -x sin + z cos). */
export function worldShape(t: TerrainInstance): WorldShape {
  const rot = (p: Vec2): Vec2 => {
    const c = Math.cos(t.rot), s = Math.sin(t.rot)
    return { x: t.pos.x + p.x * c + p.z * s, z: t.pos.z - p.x * s + p.z * c }
  }
  const f = t.footprint
  if ('circle' in f) return { kind: 'circle', c: { ...t.pos }, r: f.circle.r }
  if ('rect' in f) {
    const hw = f.rect.w / 2, hd = f.rect.d / 2
    return { kind: 'poly', pts: [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }].map(rot) }
  }
  return { kind: 'poly', pts: f.polygon.map(rot) }
}

const hyp = (dx: number, dz: number) => Math.hypot(dx, dz)

function segDistPt(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2))
  return hyp(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

export function pointInShape(p: Vec2, s: WorldShape): boolean {
  if (s.kind === 'circle') return hyp(p.x - s.c.x, p.z - s.c.z) <= s.r
  let inside = false
  const n = s.pts.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = s.pts[i]!, b = s.pts[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** Distance from a point to the shape (0 inside). */
export function distToShape(p: Vec2, s: WorldShape): number {
  if (pointInShape(p, s)) return 0
  if (s.kind === 'circle') return hyp(p.x - s.c.x, p.z - s.c.z) - s.r
  let d = Infinity
  for (let i = 0; i < s.pts.length; i++) d = Math.min(d, segDistPt(s.pts[i]!, s.pts[(i + 1) % s.pts.length]!, p))
  return d
}

/** Distance from an inside point to the boundary (0 outside). */
export function depthInShape(p: Vec2, s: WorldShape): number {
  if (!pointInShape(p, s)) return 0
  if (s.kind === 'circle') return s.r - hyp(p.x - s.c.x, p.z - s.c.z)
  let d = Infinity
  for (let i = 0; i < s.pts.length; i++) d = Math.min(d, segDistPt(s.pts[i]!, s.pts[(i + 1) % s.pts.length]!, p))
  return d
}

/** Circle (base) overlaps the shape with positive area (merely touching does not count). */
export function circleOverlapsShape(c: Vec2, r: number, s: WorldShape): boolean {
  return pointInShape(c, s) || distToShape(c, s) < r - 1e-7
}
/** Whole circle inside the shape. */
export function circleInsideShape(c: Vec2, r: number, s: WorldShape): boolean {
  return pointInShape(c, s) && depthInShape(c, s) >= r - 1e-7
}

/** Parameter intervals [t0,t1] within [0,1] of the segment a to b that lie inside the shape. */
export function segmentInsideIntervals(a: Vec2, b: Vec2, s: WorldShape): [number, number][] {
  const ts: number[] = [0, 1]
  const dx = b.x - a.x, dz = b.z - a.z
  if (s.kind === 'circle') {
    const fx = a.x - s.c.x, fz = a.z - s.c.z
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - s.r * s.r
    const disc = B * B - 4 * A * C
    if (A > EPS && disc > 0) {
      const q = Math.sqrt(disc)
      for (const t of [(-B - q) / (2 * A), (-B + q) / (2 * A)]) if (t > 0 && t < 1) ts.push(t)
    }
  } else {
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i]!, q = s.pts[(i + 1) % s.pts.length]!
      const ex = q.x - p.x, ez = q.z - p.z
      const den = dx * ez - dz * ex
      if (Math.abs(den) < EPS) continue
      const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den
      const u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
    }
  }
  ts.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!
    if (t1 - t0 < 1e-12) continue
    const tm = (t0 + t1) / 2
    if (pointInShape({ x: a.x + dx * tm, z: a.z + dz * tm }, s)) {
      const last = out[out.length - 1]
      if (last && Math.abs(last[1] - t0) < 1e-12) last[1] = t1
      else out.push([t0, t1])
    }
  }
  return out
}

// ---------- traits by rules type ----------
export type MoveBlock = 'none' | 'obstacle' | 'impassable'
export type CoverKind = 'none' | 'cover' | 'concealment'
export interface TerrainTraits {
  type: TerrainRulesType // effective type (scenario terrain resolves to props.baseType, default obstacle)
  move: MoveBlock
  rough: boolean
  blocksLos: boolean // by height against volumes; forests are handled by depth instead
  forest: boolean
  height: number
  /** surface elevation granted to models completely within (hill; props.elevation overrides) */
  elevation: number
  cover: CoverKind // granted within 1" along a line (obstacle/obstruction)
  insideCover: CoverKind // granted to a model completely inside (rubble, forest)
  hazard: boolean
  /** R9.8 hazard data (props.hazard); only on hazard pieces */
  hazardSpec?: { pow: number; damageType?: DamageType; on: ('enter' | 'endActivation')[] }
  /** forest: a line that starts or ends inside may cross this much; props.losThrough, default 3 */
  losThrough: number
  /** damage types a model completely inside resists (trench: blast; props.resistance) */
  resist: DamageType[]
}

export function effectiveType(t: TerrainInstance): TerrainRulesType {
  if (t.rulesType === 'scenarioTerrain') {
    const b = t.props['baseType']
    return typeof b === 'string' ? (b as TerrainRulesType) : 'obstacle'
  }
  return t.rulesType
}

/** First 'damage' node of props.hazard.effect: POW, optional damage type, and the triggers (default both). */
function hazardSpecOf(t: TerrainInstance): TerrainTraits['hazardSpec'] {
  const h = t.props['hazard'] as { effect?: Record<string, unknown>[]; on?: ('enter' | 'endActivation')[] } | undefined
  const node = h?.effect?.find((n) => n['op'] === 'damage')
  const pow = typeof node?.['pow'] === 'number' ? (node['pow'] as number) : 10
  const on = Array.isArray(h?.on) && h!.on!.length ? h!.on! : (['enter', 'endActivation'] as ('enter' | 'endActivation')[])
  return { pow, ...(typeof node?.['damageType'] === 'string' ? { damageType: node['damageType'] as DamageType } : {}), on }
}

/**
 * Traits by rules type, then the schema props overrides (terrain.schema.json): blocksLos, losThrough, cover, concealment,
 * rough, impassable, elevation, resistance, hazard. (feature, baseType and baseElev are read elsewhere.)
 */
export function terrainTraits(t: TerrainInstance): TerrainTraits {
  const type = effectiveType(t)
  const p = t.props
  const hedge = p['feature'] === 'hedge' || p['concealment'] === true
  const base: TerrainTraits = {
    type, move: 'none', rough: false, blocksLos: false, forest: false, height: t.height, elevation: 0,
    cover: 'none', insideCover: 'none', hazard: false, losThrough: 3, resist: [],
  }
  let r: TerrainTraits
  switch (type) {
    case 'obstacle': r = { ...base, move: 'obstacle', blocksLos: true, cover: hedge ? 'concealment' : 'cover' }; break
    case 'obstruction':
    case 'building': r = { ...base, move: 'impassable', blocksLos: true, cover: 'cover' }; break
    case 'forest': r = { ...base, rough: true, forest: true, insideCover: 'concealment' }; break
    case 'shallowWater': r = { ...base, rough: true }; break
    case 'rough': r = { ...base, rough: true }; break
    case 'rubble': r = { ...base, rough: true, insideCover: 'cover' }; break
    case 'hill': r = { ...base, blocksLos: true, elevation: typeof p['elevation'] === 'number' ? (p['elevation'] as number) : t.height }; break
    case 'hazard': r = { ...base, hazard: true, hazardSpec: hazardSpecOf(t) }; break
    case 'deepWater': r = { ...base, move: 'impassable' }; break
    // RULING (G2): a trench is open ground; a model completely inside has cover and Resistance: Blast (20 section 9)
    case 'trench': r = { ...base, insideCover: 'cover', resist: ['blast'] }; break
    default: r = base
  }
  // props overrides (G3)
  if (typeof p['blocksLos'] === 'boolean') r.blocksLos = p['blocksLos']
  if (typeof p['losThrough'] === 'number') r.losThrough = p['losThrough']
  if (typeof p['rough'] === 'boolean') r.rough = p['rough']
  if (typeof p['impassable'] === 'boolean') r.move = p['impassable'] ? 'impassable' : r.move === 'impassable' ? 'none' : r.move
  if (typeof p['elevation'] === 'number' && type !== 'hill') r.elevation = p['elevation']
  if (Array.isArray(p['resistance'])) r.resist = p['resistance'] as DamageType[]
  if (p['hazard'] && type !== 'hazard') { r.hazard = true; r.hazardSpec = hazardSpecOf(t) }
  const lineKind = r.move !== 'none' // walls, buildings and obstructions grant cover along a line; the rest only completely inside
  if (p['cover'] === false) { r.cover = 'none'; r.insideCover = 'none' }
  else if (p['cover'] === true) { if (lineKind) r.cover = 'cover'; else r.insideCover = 'cover' }
  else if (p['concealment'] === true && type !== 'obstacle') { if (lineKind) r.cover = 'concealment'; else if (r.insideCover !== 'cover') r.insideCover = 'concealment' }
  return r
}

export interface TerrainPiece { t: TerrainInstance; shape: WorldShape; traits: TerrainTraits }
const cache = new WeakMap<readonly TerrainInstance[], TerrainPiece[]>()
export function terrainPieces(state: Pick<GameState, 'terrain'>): TerrainPiece[] {
  let r = cache.get(state.terrain)
  if (!r) {
    r = state.terrain.map((t) => ({ t, shape: worldShape(t), traits: terrainTraits(t) }))
    cache.set(state.terrain, r)
  }
  return r
}

/** Rough pieces a base overlaps. */
export function roughUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.rough && circleOverlapsShape(pos, r, p.shape))
}

/** Surface elevation for a base placed at pos: the tallest hill it is completely within. */
export function elevationAt(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): number {
  let e = 0
  for (const p of terrainPieces(state)) {
    if (p.traits.elevation > e && circleInsideShape(pos, r, p.shape)) e = p.traits.elevation
  }
  return e
}

/** Pieces a base may not overlap when placed: obstructions, buildings, deep water, obstacles. */
export function placementBlockers(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.move !== 'none' && circleOverlapsShape(pos, r, p.shape))
}

/** Cover/concealment from terrain a base is completely inside (rubble, forest). Cover wins. */
export function insideCoverOf(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): CoverKind {
  let best: CoverKind = 'none'
  for (const p of terrainPieces(state)) {
    if (p.traits.insideCover === 'none' || !circleInsideShape(pos, r, p.shape)) continue
    if (p.traits.insideCover === 'cover') return 'cover'
    best = 'concealment'
  }
  return best
}

/** Damage types a base completely inside terrain resists (trench: blast; props.resistance). */
export function terrainResistance(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): DamageType[] {
  const out: DamageType[] = []
  for (const p of terrainPieces(state)) if (p.traits.resist.length && circleInsideShape(pos, r, p.shape)) out.push(...p.traits.resist)
  return out
}

/** Hazard pieces a base overlaps. */
export function hazardsUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.hazard && circleOverlapsShape(pos, r, p.shape))
}
