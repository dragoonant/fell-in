// Scenario layout data (docs/spec/17-scenarios.md s4.1): rulers, points and zones read from scenario JSON.
// Every distance in the data is a ruler colour (or a sum such as "black + orange") or a plain number of inches for
// table facts (terrain sizes); the engine owns the colour-to-inches table (rulers.json).
import type { EditionBundle } from '../../data/types'
import { rulerInches } from '../edition'
import { baseRadius } from '../geometry'
import { distToShape, pointInShape, type WorldShape } from '../terrain'
import { deriveSeed, nextFloat } from '../rng'
import type { GameState, TerrainInstance, Vec2 } from '../types'

export type Col = string | number
export type Edge = 'n' | 's' | 'e' | 'w'
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** A point on the table. Corners are named by compass (north = far edge, -z; south = the human seat's near edge, +z). */
export interface PointSpec {
  at?: 'centre'
  corner?: Corner
  edge?: Edge
  /** Move inward from the corner or edge: one distance for both axes, or [x, z]. */
  inset?: Col | [Col, Col]
  /** Move inward along the corner's diagonal. */
  diag?: Col
  /** Fraction along an edge (0 = the low coordinate end, 1 = the high one); default 0.5. */
  along?: number
  /** Another piece (terrain id or marker id/face), with an optional offset in inches. */
  of?: string
  dx?: number
  dz?: number
}

/** An area of the table that models or markers are put in. */
export interface ZoneSpec {
  kind: 'corner' | 'box' | 'triangle' | 'edges' | 'ring' | 'disc' | 'table'
  /** corner / box: which corner. */
  corner?: Corner
  /** corner / disc: how far from the corner or centre (a ruler colour); the area is a quarter disc at a corner. */
  reach?: Col
  /** box: width (x) and depth (z) measured inward from the corner. triangle: the two legs along the edges from the corner (w along x, d along z). */
  w?: Col
  d?: Col
  /** edges: which edges ("any" = all four) and how deep. */
  edges?: Edge[] | 'any'
  within?: Col
  /** ring: exactly this far from the base of a terrain piece (`of`). disc: centred on a marker or terrain piece (`of`) or a point. */
  of?: string
  gap?: Col
  centre?: PointSpec
  /** table: stay this far from every edge. */
  margin?: Col
  /** Models or markers in the zone keep at least this far apart (base edge to base edge). */
  apart?: Col
  /** Zones this one must stay out of. */
  except?: ZoneSpec[]
}

export interface Frame { w: number; d: number }

export const frameOf = (state: Pick<GameState, 'scenario'>): Frame => ({ w: state.scenario.table.w, d: state.scenario.table.d })

/** Inches for a ruler colour, a number, or a "+" sum of those ("black + orange"). */
export function inchesOf(bundle: EditionBundle, c: Col | undefined): number {
  if (c === undefined) return 0
  if (typeof c === 'number') return c
  return c.split('+').reduce((n, part) => {
    const p = part.trim().toLowerCase()
    return n + (Number.isFinite(Number(p)) ? Number(p) : rulerInches(bundle, p as never))
  }, 0)
}

const west = (c: Corner): boolean => c[1] === 'w'
const north = (c: Corner): boolean => c[0] === 'n'

export function cornerPoint(f: Frame, c: Corner): Vec2 {
  return { x: west(c) ? -f.w / 2 : f.w / 2, z: north(c) ? -f.d / 2 : f.d / 2 }
}
/** The corner diagonally across the table. */
export const oppositeCorner = (c: Corner): Corner => `${north(c) ? 's' : 'n'}${west(c) ? 'e' : 'w'}` as Corner

/** Where a named piece (terrain id, marker id or face) stands, if present. */
export type Lookup = (name: string) => Vec2 | null

export function pointOf(bundle: EditionBundle, f: Frame, spec: PointSpec, lookup: Lookup): Vec2 {
  const ins = (axis: 0 | 1): number => {
    if (spec.diag !== undefined) return inchesOf(bundle, spec.diag) / Math.SQRT2
    const i = spec.inset
    return Array.isArray(i) ? inchesOf(bundle, i[axis]) : inchesOf(bundle, i)
  }
  if (spec.of) {
    const base = lookup(spec.of) ?? { x: 0, z: 0 }
    return { x: base.x + (spec.dx ?? 0), z: base.z + (spec.dz ?? 0) }
  }
  if (spec.corner) {
    const b = cornerPoint(f, spec.corner)
    return { x: b.x + (west(spec.corner) ? 1 : -1) * ins(0), z: b.z + (north(spec.corner) ? 1 : -1) * ins(1) }
  }
  if (spec.edge) {
    const a = spec.along ?? 0.5, e = spec.edge, k = ins(0)
    if (e === 'n') return { x: -f.w / 2 + a * f.w, z: -f.d / 2 + k }
    if (e === 's') return { x: -f.w / 2 + a * f.w, z: f.d / 2 - k }
    if (e === 'w') return { x: -f.w / 2 + k, z: -f.d / 2 + a * f.d }
    return { x: f.w / 2 - k, z: -f.d / 2 + a * f.d }
  }
  return { x: spec.dx ?? 0, z: spec.dz ?? 0 }
}

/** Seeded stream for layout draws (never the game rng: set-up must not disturb it). */
export function stream(...parts: (string | number)[]): () => number {
  let st = deriveSeed(...parts)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

const centreOf = (bundle: EditionBundle, f: Frame, z: ZoneSpec, lookup: Lookup): Vec2 =>
  z.centre ? pointOf(bundle, f, z.centre, lookup) : (z.of ? lookup(z.of) : null) ?? { x: 0, z: 0 }

/** Is the point inside the zone (ring zones: within a thin band around the gap distance). */
export function inZone(bundle: EditionBundle, f: Frame, z: ZoneSpec, p: Vec2, lookup: Lookup, shapeOf?: (id: string) => WorldShape | null): boolean {
  if (z.except?.some((x) => inZone(bundle, f, x, p, lookup, shapeOf))) return false
  switch (z.kind) {
    case 'table': {
      const m = inchesOf(bundle, z.margin)
      return Math.abs(p.x) <= f.w / 2 - m && Math.abs(p.z) <= f.d / 2 - m
    }
    case 'corner': {
      const c = cornerPoint(f, z.corner!)
      return Math.hypot(p.x - c.x, p.z - c.z) <= inchesOf(bundle, z.reach) && Math.abs(p.x) <= f.w / 2 && Math.abs(p.z) <= f.d / 2
    }
    case 'box': {
      const c = cornerPoint(f, z.corner!)
      const w = inchesOf(bundle, z.w), d = inchesOf(bundle, z.d ?? z.w)
      const dx = (west(z.corner!) ? 1 : -1) * (p.x - c.x), dz = (north(z.corner!) ? 1 : -1) * (p.z - c.z)
      return dx >= 0 && dx <= w && dz >= 0 && dz <= d
    }
    case 'triangle': {
      const c = cornerPoint(f, z.corner!)
      const w = inchesOf(bundle, z.w), d = inchesOf(bundle, z.d ?? z.w)
      const dx = (west(z.corner!) ? 1 : -1) * (p.x - c.x), dz = (north(z.corner!) ? 1 : -1) * (p.z - c.z)
      return dx >= 0 && dz >= 0 && w > 0 && d > 0 && dx / w + dz / d <= 1
    }
    case 'edges': {
      const k = inchesOf(bundle, z.within)
      const es: Edge[] = z.edges === 'any' || !z.edges ? ['n', 's', 'e', 'w'] : z.edges
      const d: Record<Edge, number> = { n: p.z + f.d / 2, s: f.d / 2 - p.z, w: p.x + f.w / 2, e: f.w / 2 - p.x }
      return es.some((e) => d[e] >= 0 && d[e] <= k)
    }
    case 'disc': {
      const c = centreOf(bundle, f, z, lookup)
      return Math.hypot(p.x - c.x, p.z - c.z) <= inchesOf(bundle, z.within ?? z.reach)
    }
    case 'ring': {
      const sh = z.of ? shapeOf?.(z.of) : null
      if (!sh) return false
      return Math.abs(distToShape(p, sh) - inchesOf(bundle, z.gap)) <= 0.05 && !pointInShape(p, sh)
    }
  }
}

/** A bounding box to draw candidate points from. */
export function zoneBounds(bundle: EditionBundle, f: Frame, z: ZoneSpec, lookup: Lookup, shapeOf?: (id: string) => WorldShape | null): { x0: number; x1: number; z0: number; z1: number } {
  const full = { x0: -f.w / 2, x1: f.w / 2, z0: -f.d / 2, z1: f.d / 2 }
  switch (z.kind) {
    case 'corner': {
      const c = cornerPoint(f, z.corner!), r = inchesOf(bundle, z.reach)
      return { x0: Math.min(c.x, c.x + (west(z.corner!) ? r : -r)), x1: Math.max(c.x, c.x + (west(z.corner!) ? r : -r)), z0: Math.min(c.z, c.z + (north(z.corner!) ? r : -r)), z1: Math.max(c.z, c.z + (north(z.corner!) ? r : -r)) }
    }
    case 'box':
    case 'triangle': {
      const c = cornerPoint(f, z.corner!), w = inchesOf(bundle, z.w), d = inchesOf(bundle, z.d ?? z.w)
      const x = c.x + (west(z.corner!) ? w : -w), zz = c.z + (north(z.corner!) ? d : -d)
      return { x0: Math.min(c.x, x), x1: Math.max(c.x, x), z0: Math.min(c.z, zz), z1: Math.max(c.z, zz) }
    }
    case 'disc': {
      const c = centreOf(bundle, f, z, lookup), r = inchesOf(bundle, z.within ?? z.reach)
      return { x0: c.x - r, x1: c.x + r, z0: c.z - r, z1: c.z + r }
    }
    case 'ring': {
      const sh = z.of ? shapeOf?.(z.of) : null
      if (!sh) return full
      const pts = sh.kind === 'circle' ? [{ x: sh.c.x - sh.r, z: sh.c.z - sh.r }, { x: sh.c.x + sh.r, z: sh.c.z + sh.r }] : sh.pts
      const g = inchesOf(bundle, z.gap)
      return { x0: Math.min(...pts.map((p) => p.x)) - g, x1: Math.max(...pts.map((p) => p.x)) + g, z0: Math.min(...pts.map((p) => p.z)) - g, z1: Math.max(...pts.map((p) => p.z)) + g }
    }
    default: return full
  }
}

/** One point on a ring zone: walk out along a ray from the piece's centre until the gap distance is reached. */
function ringPoint(bundle: EditionBundle, z: ZoneSpec, sh: WorldShape, angle: number): Vec2 {
  const c = sh.kind === 'circle' ? sh.c : { x: sh.pts.reduce((a, p) => a + p.x, 0) / sh.pts.length, z: sh.pts.reduce((a, p) => a + p.z, 0) / sh.pts.length }
  const gap = inchesOf(bundle, z.gap)
  const dir = { x: Math.cos(angle), z: Math.sin(angle) }
  let lo = 0, hi = 60
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const d = distToShape({ x: c.x + dir.x * mid, z: c.z + dir.z * mid }, sh)
    if (d < gap) lo = mid; else hi = mid
  }
  return { x: c.x + dir.x * hi, z: c.z + dir.z * hi }
}

export interface SampleOpts {
  /** Radius of the thing being placed (inches). */
  r: number
  /** Positions already taken (centre + radius). */
  taken: { pos: Vec2; r: number }[]
  /** Minimum gap between base edges. */
  gap: number
  /** Extra legality test (terrain, markers). */
  ok?: (p: Vec2) => boolean
}

/**
 * Draw one point in a zone: uniform candidates (or ray angles on a ring), table-edge margin for the radius, a gap to the
 * points already taken, then the caller's test. Gives up after many tries and returns null.
 */
export function sampleZone(bundle: EditionBundle, f: Frame, z: ZoneSpec, next: () => number, o: SampleOpts, lookup: Lookup, shapeOf?: (id: string) => WorldShape | null): Vec2 | null {
  const b = zoneBounds(bundle, f, z, lookup, shapeOf)
  const sh = z.kind === 'ring' && z.of ? shapeOf?.(z.of) ?? null : null
  for (let tries = 0; tries < 2500; tries++) {
    const p = sh ? ringPoint(bundle, z, sh, next() * Math.PI * 2) : { x: b.x0 + next() * (b.x1 - b.x0), z: b.z0 + next() * (b.z1 - b.z0) }
    if (Math.abs(p.x) > f.w / 2 - o.r || Math.abs(p.z) > f.d / 2 - o.r) continue
    if (!sh && !inZone(bundle, f, z, p, lookup, shapeOf)) continue
    if (sh && z.except?.some((x) => inZone(bundle, f, x, p, lookup, shapeOf))) continue
    if (o.taken.some((t) => Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < t.r + o.r + o.gap)) continue
    if (o.ok && !o.ok(p)) continue
    return p
  }
  return null
}

/** Build a terrain instance from a data entry (explicit sizes in inches; walls by length and thickness). */
export interface TerrainEntry {
  id: string
  /** Catalog slug the client draws (or any id for a plain procedural block). */
  piece: string
  rulesType: TerrainInstance['rulesType']
  at: PointSpec
  /** Footprint in inches. */
  w?: number
  d?: number
  h?: number
  /** Rotation in degrees about the vertical axis. */
  rot?: number
  /** A straight wall: length (ruler sum) from `at` towards `dir`, thickness in inches. */
  length?: Col
  dir?: 'n' | 's' | 'e' | 'w'
  thick?: number
  props?: Record<string, unknown>
}

export function terrainFrom(bundle: EditionBundle, f: Frame, e: TerrainEntry, lookup: Lookup): TerrainInstance {
  const at = pointOf(bundle, f, e.at, lookup)
  let w = e.w ?? 4, d = e.d ?? 4, pos = at
  if (e.length !== undefined) {
    const len = inchesOf(bundle, e.length), t = e.thick ?? 1
    const horiz = e.dir === 'e' || e.dir === 'w'
    w = horiz ? len : t; d = horiz ? t : len
    const sx = e.dir === 'e' ? 1 : e.dir === 'w' ? -1 : 0, sz = e.dir === 's' ? 1 : e.dir === 'n' ? -1 : 0
    pos = { x: at.x + (sx * len) / 2, z: at.z + (sz * len) / 2 }
  }
  return {
    id: e.id, pieceId: e.piece, rulesType: e.rulesType, pos, rot: ((e.rot ?? 0) * Math.PI) / 180,
    footprint: { rect: { w, d } }, height: e.h ?? 3, props: { ...(e.props ?? {}) },
  }
}

/** Radius that keeps a base clear of the table edge: base radius plus a quarter inch. */
export const clearOf = (mm: number): number => baseRadius(mm) + 0.25
