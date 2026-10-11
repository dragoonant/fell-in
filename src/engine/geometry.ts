// Geometry primitives, straight-line sweeps, placement and least disturbance.
// Pure functions over GameState; all distances in inches; x/z plane, origin at table centre.
import type { BaseMm, GameState, Id, ModelState, RejectionCode, Vec2 } from './types'
import {
  circleOverlapsShape, elevationAt, placementBlockers, roughUnder, terrainPieces, type TerrainPiece,
} from './terrain'

export const MM_PER_INCH = 25.4
export const EPS = 1e-6

// ---------- vectors ----------
export const vec = (x: number, z: number): Vec2 => ({ x, z })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z
export const len = (a: Vec2): number => Math.hypot(a.x, a.z)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
export function norm(a: Vec2): Vec2 {
  const l = len(a)
  return l < 1e-12 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l }
}
export const angleOf = (a: Vec2): number => Math.atan2(a.z, a.x)
export const fromAngle = (ang: number, r = 1): Vec2 => ({ x: Math.cos(ang) * r, z: Math.sin(ang) * r })

// ---------- bases ----------
export const baseRadius = (mm: number): number => mm / MM_PER_INCH / 2
export const baseDiameter = (mm: number): number => mm / MM_PER_INCH
/** Volume height by base size, in inches. TODO(M2): confirm against the Wasteland scale (mildly stylized heroic figures). */
export function volumeHeight(mm: number): number {
  if (mm <= 25) return 1.5
  if (mm <= 32) return 1.75
  if (mm <= 40) return 2.25
  if (mm <= 50) return 3
  return 4.5
}
export type BaseClass = 'small' | 'medium' | 'large' | 'huge'
export function baseClass(mm: number): BaseClass {
  return mm <= 25 ? 'small' : mm <= 32 ? 'medium' : mm <= 40 ? 'large' : 'huge'
}

export const isOnTable = (m: ModelState): boolean => !m.offTable && m.life === 'active'
export function tableBounds(state: Pick<GameState, 'scenario'>): { w: number; d: number } {
  return state.scenario.table
}
/** The whole base is on the table. */
export function baseOnTable(state: Pick<GameState, 'scenario'>, pos: Vec2, r: number): boolean {
  const { w, d } = state.scenario.table
  return Math.abs(pos.x) <= w / 2 - r + EPS && Math.abs(pos.z) <= d / 2 - r + EPS
}
export function clampToTable(state: Pick<GameState, 'scenario'>, pos: Vec2, r: number): Vec2 {
  const { w, d } = state.scenario.table
  return {
    x: Math.max(-(w / 2 - r), Math.min(w / 2 - r, pos.x)),
    z: Math.max(-(d / 2 - r), Math.min(d / 2 - r, pos.z)),
  }
}

/** Edge-to-edge distance between two circles (0 when touching or overlapping). */
export function edgeDistance(aPos: Vec2, aMm: number, bPos: Vec2, bMm: number): number {
  return Math.max(0, dist(aPos, bPos) - baseRadius(aMm) - baseRadius(bMm))
}

// ---------- segment helpers ----------
export function segPointDist(a: Vec2, b: Vec2, p: Vec2): { d: number; t: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return { d: dist(p, lerp(a, b, t)), t }
}

/** Smallest s in [0,maxS] where a circle of radius r1 moving from p along unit dir first touches a circle (c,R). null if none. */
export function sweepCircleHit(p: Vec2, dir: Vec2, maxS: number, r1: number, c: Vec2, R: number): number | null {
  const f = sub(p, c)
  const rr = r1 + R
  const B = 2 * dot(f, dir), C = dot(f, f) - rr * rr
  if (C < -1e-7) return null // already overlapping: ignored by callers
  const disc = B * B - 4 * C
  if (disc < 0) return null
  const s = (-B - Math.sqrt(disc)) / 2
  return s >= -1e-7 && s <= maxS + 1e-7 ? Math.max(0, s) : null
}

const STEP = 0.1
/** Distance intervals along p + dir*s (s in [0,maxS]) during which a circle of radius r overlaps the piece. */
export function overlapIntervals(piece: TerrainPiece, p: Vec2, dir: Vec2, maxS: number, r: number): [number, number][] {
  const out: [number, number][] = []
  const at = (s: number) => circleOverlapsShape(add(p, scale(dir, s)), r, piece.shape)
  const bisect = (lo: number, hi: number, loVal: boolean): number => {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (at(mid) === loVal) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  let prev = at(0)
  let start = prev ? 0 : -1
  let s = 0
  while (s < maxS - 1e-12) {
    const n = Math.min(maxS, s + STEP)
    const cur = at(n)
    if (cur !== prev) {
      const edge = bisect(s, n, prev)
      if (cur) start = edge
      else { out.push([start, edge]); start = -1 }
    }
    prev = cur
    s = n
  }
  if (prev && start >= 0) out.push([start, maxS])
  return out
}

// ---------- sweeps ----------
export interface SweepOptions {
  /** 'smaller': pass through strictly smaller bases (slam/throw/trample). 'none': any base stops the mover. */
  passThrough?: 'none' | 'smaller'
  /** 'stop' (default): contact with an obstacle stops the mover (charge, push, slam). 'ignore': Pathfinder. */
  obstacles?: 'stop' | 'ignore'
  /** Flight or Incorporeal: obstructions/buildings/deep water are ignored. */
  ignoreObstructions?: boolean
  ignoreIds?: Id[]
  /** Stop at the table edge (default true). */
  clampTable?: boolean
}
export type StopKind = 'model' | 'obstacle' | 'obstruction' | 'edge' | 'maxDist'
export interface SweepResult {
  end: Vec2
  travelled: number
  stoppedBy: { kind: StopKind; id?: Id }
  /** smaller bases the path crossed (passThrough: 'smaller') before stopping */
  passedThrough: Id[]
  /** the model stopped on, if any */
  contacted: Id | null
  roughEntered: boolean
}

/** Straight-line move of a model by up to maxDist toward `dir`; stops at first contact. */
export function sweepStraight(state: GameState, modelId: Id, dir: Vec2, maxDist: number, opts: SweepOptions = {}): SweepResult {
  const m = state.models[modelId]
  if (!m) throw new Error(`sweepStraight: unknown model ${modelId}`)
  return sweepFrom(state, m, m.pos, dir, maxDist, opts)
}

export function sweepFrom(state: GameState, m: ModelState, from: Vec2, dirIn: Vec2, maxDist: number, opts: SweepOptions = {}): SweepResult {
  const dir = norm(dirIn)
  const r = baseRadius(m.base)
  const ignore = new Set(opts.ignoreIds ?? [])
  let stopS = maxDist
  let stopped: { kind: StopKind; id?: Id } = { kind: 'maxDist' }
  if (len(dirIn) < 1e-12) return { end: { ...from }, travelled: 0, stoppedBy: { kind: 'maxDist' }, passedThrough: [], contacted: null, roughEntered: false }

  // table edge
  if (opts.clampTable !== false) {
    const { w, d } = state.scenario.table
    for (const [pos, dv, lim] of [[from.x, dir.x, w / 2 - r], [from.z, dir.z, d / 2 - r]] as const) {
      if (Math.abs(dv) < 1e-12) continue
      const s = ((dv > 0 ? lim : -lim) - pos) / dv
      if (s < stopS - 1e-12) { stopS = Math.max(0, s); stopped = { kind: 'edge' } }
    }
  }
  // terrain
  for (const p of terrainPieces(state)) {
    const mv = p.traits.move
    if (mv === 'none') continue
    if (mv === 'obstacle' && opts.obstacles === 'ignore') continue
    if (mv === 'impassable' && opts.ignoreObstructions) continue
    const iv = overlapIntervals(p, from, dir, stopS, r)
    const first = iv[0]
    if (!first || first[0] <= 1e-9) continue // already inside at the start: ignored
    if (first[0] < stopS) { stopS = first[0]; stopped = { kind: mv === 'obstacle' ? 'obstacle' : 'obstruction', id: p.t.id } }
  }
  // models
  const hits: { id: Id; s: number; passes: boolean }[] = []
  for (const o of Object.values(state.models)) {
    if (o.id === m.id || ignore.has(o.id) || !isOnTable(o)) continue
    const R = baseRadius(o.base)
    const s = sweepCircleHit(from, dir, stopS, r, o.pos, R)
    if (s === null) continue
    hits.push({ id: o.id, s, passes: opts.passThrough === 'smaller' && o.base < m.base })
  }
  hits.sort((a, b) => a.s - b.s)
  const passedThrough: Id[] = []
  let contacted: Id | null = null
  for (const h of hits) {
    if (h.s > stopS + 1e-9) break
    if (h.passes) { passedThrough.push(h.id); continue }
    if (h.s < stopS) { stopS = h.s; stopped = { kind: 'model', id: h.id }; contacted = h.id }
    break
  }
  const end = add(from, scale(dir, stopS))
  // rough terrain entered along the sweep (for callers that need it)
  let roughEntered = roughUnder(state, from, r).length > 0
  if (!roughEntered) {
    for (const p of terrainPieces(state)) {
      if (p.traits.rough && overlapIntervals(p, from, dir, stopS, r).length) { roughEntered = true; break }
    }
  }
  return { end, travelled: stopS, stoppedBy: stopped, passedThrough: passedThrough.filter((id) => {
    const o = state.models[id]!
    return dist(from, o.pos) <= stopS + r + baseRadius(o.base) + 1e-6
  }), contacted, roughEntered }
}

// ---------- placement legality ----------
export interface PlacementCheck { ok: boolean; code?: RejectionCode; message?: string }
export interface Occupant { pos: Vec2; r: number }

export function isLegalPlacement(
  state: GameState, modelId: Id | null, pos: Vec2, mm: BaseMm | number,
  opts: { ignoreIds?: Id[]; extra?: Occupant[]; ignoreTerrain?: boolean } = {},
): PlacementCheck {
  const r = baseRadius(mm)
  if (!baseOnTable(state, pos, r)) return { ok: false, code: 'E_PLACEMENT', message: 'base would leave the table' }
  const ignore = new Set(opts.ignoreIds ?? [])
  if (modelId) ignore.add(modelId)
  for (const o of Object.values(state.models)) {
    if (ignore.has(o.id) || !isOnTable(o)) continue
    if (dist(pos, o.pos) < r + baseRadius(o.base) - EPS) return { ok: false, code: 'E_BASE_OVERLAP', message: `overlaps ${o.id}` }
  }
  for (const e of opts.extra ?? []) {
    if (dist(pos, e.pos) < r + e.r - EPS) return { ok: false, code: 'E_BASE_OVERLAP', message: 'overlaps a placed model' }
  }
  if (!opts.ignoreTerrain) {
    const b = placementBlockers(state, pos, r)[0]
    if (b) return { ok: false, code: 'E_PLACEMENT', message: `overlaps terrain ${b.t.id}` }
  }
  return { ok: true }
}

/** Nearest legal spot to `target` (spiral search). null if none within maxSearch. */
export function findPlacementNear(
  state: GameState, modelId: Id, target: Vec2,
  opts: { ignoreIds?: Id[]; extra?: Occupant[]; accept?: (p: Vec2) => boolean; maxSearch?: number } = {},
): Vec2 | null {
  const m = state.models[modelId]!
  const ok = (p: Vec2) => isLegalPlacement(state, modelId, p, m.base, opts).ok && (opts.accept ? opts.accept(p) : true)
  if (ok(target)) return { ...target }
  const max = opts.maxSearch ?? 8
  for (let rad = 0.25; rad <= max; rad += 0.25) {
    const n = Math.max(12, Math.ceil((2 * Math.PI * rad) / 0.25))
    let best: Vec2 | null = null
    for (let i = 0; i < n; i++) {
      const p = add(target, fromAngle((i / n) * 2 * Math.PI, rad))
      if (ok(p)) { best = p; break }
    }
    if (best) return best
  }
  return null
}

/**
 * Place models within `distIn` (base edge; "completely" = whole base) of the anchor, simultaneously.
 * Each goes to the legal spot closest to its preferred position (default: where it stands now).
 * `visible(pos, id)` is the optional LOS test to the anchor. Failed ids are returned in `failed` (they are destroyed by R5.8).
 */
export function placeWithin(
  state: GameState, anchorId: Id, moverIds: Id[],
  opts: { dist?: number; completely?: boolean; preferred?: Record<Id, Vec2>; visible?: (pos: Vec2, id: Id) => boolean } = {},
): { placed: Record<Id, Vec2>; failed: Id[] } {
  const anchor = state.models[anchorId]!
  const d = opts.dist ?? 2
  const ra = baseRadius(anchor.base)
  const placed: Record<Id, Vec2> = {}
  const failed: Id[] = []
  const extra: Occupant[] = [{ pos: anchor.pos, r: ra }]
  for (const id of moverIds) {
    const m = state.models[id]!
    const rm = baseRadius(m.base)
    const want = opts.preferred?.[id] ?? m.pos
    const maxC = opts.completely ? ra + d - rm : ra + d + rm // centre distance limit
    const minC = ra + rm
    let best: Vec2 | null = null
    let bestD = Infinity
    const consider = (p: Vec2) => {
      const dd = dist(p, want)
      if (dd >= bestD) return
      if (dist(p, anchor.pos) > maxC + EPS) return
      if (!isLegalPlacement(state, id, p, m.base, { ignoreIds: moverIds, extra }).ok) return
      if (opts.visible && !opts.visible(p, id)) return
      best = p; bestD = dd
    }
    consider(want)
    if (!best) {
      for (let c = minC; c <= maxC + EPS; c += 0.2) {
        const n = Math.max(24, Math.ceil((2 * Math.PI * c) / 0.3))
        for (let i = 0; i < n; i++) consider(add(anchor.pos, fromAngle((i / n) * 2 * Math.PI, c)))
      }
    }
    if (best) { placed[id] = best; extra.push({ pos: best, r: rm }) } else failed.push(id)
  }
  return { placed, failed }
}

// ---------- least disturbance ----------
/**
 * The mover keeps its spot; overlapped models are shifted the least distance (fewest models, then least total).
 * If an overlapped model is larger, can't be shifted legally or is in `immovable`, the mover is moved instead.
 * `tie(n)` picks an index among n equal candidates (use the seeded rng).
 */
export function leastDisturbance(
  state: GameState, moverId: Id,
  opts: { immovable?: Id[]; tie?: (n: number) => number } = {},
): { moves: Record<Id, Vec2>; moverMoved: boolean } {
  const mover = state.models[moverId]!
  const rm = baseRadius(mover.base)
  const tie = opts.tie ?? (() => 0)
  const overlapped = Object.values(state.models)
    .filter((o) => o.id !== moverId && isOnTable(o) && dist(o.pos, mover.pos) < rm + baseRadius(o.base) - EPS)
    .sort((a, b) => dist(a.pos, mover.pos) - dist(b.pos, mover.pos))
  if (!overlapped.length) return { moves: {}, moverMoved: false }

  const moveMover = (): { moves: Record<Id, Vec2>; moverMoved: boolean } => {
    const p = findPlacementNear(state, moverId, mover.pos, { ignoreIds: [] , maxSearch: 12 })
    return { moves: p ? { [moverId]: p } : {}, moverMoved: true }
  }
  const moves: Record<Id, Vec2> = {}
  const extra: Occupant[] = [{ pos: mover.pos, r: rm }]
  const movedIds = overlapped.map((o) => o.id)
  for (const o of overlapped) {
    if (o.base > mover.base || opts.immovable?.includes(o.id)) return moveMover()
    const gap = rm + baseRadius(o.base) + 0.01
    const away = norm(sub(o.pos, mover.pos))
    const baseAng = len(away) < 1e-9 ? 0 : angleOf(away)
    const cands: { p: Vec2; d: number }[] = []
    for (let i = 0; i < 72; i++) {
      const ang = baseAng + (i === 0 ? 0 : ((i + 1) >> 1) * (Math.PI / 36) * (i % 2 ? 1 : -1))
      const p = add(mover.pos, fromAngle(ang, gap))
      cands.push({ p, d: dist(p, o.pos) })
    }
    cands.sort((a, b) => a.d - b.d)
    const legal = cands.filter((c) =>
      isLegalPlacement(state, o.id, c.p, o.base, { ignoreIds: movedIds.filter((x) => x !== o.id), extra }).ok)
    const first = legal[0]
    if (!first) return moveMover()
    const ties = legal.filter((c) => c.d - first.d < 1e-6)
    const pick = ties[Math.max(0, Math.min(ties.length - 1, tie(ties.length)))]!
    moves[o.id] = pick.p
    extra.push({ pos: pick.p, r: baseRadius(o.base) })
  }
  return { moves, moverMoved: false }
}

// ---------- advance path validation ----------
export interface PathCheck {
  ok: boolean
  code?: RejectionCode
  message?: string
  length: number
  /** movement allowance after the rough-terrain penalty */
  allowance: number
  rough: boolean
  end: Vec2
}

/**
 * Validate a free (non-straight) advance along waypoints starting at the model's position.
 * Bases can't cross other bases or obstructions; non-charging models cross an obstacle only when they have
 * movement left to end completely past it. Rough terrain reduces the whole advance by 2" (min 1"). TODO(M2): Wasteland movement is ruler-based; replace.
 */
export function validateAdvancePath(
  state: GameState, modelId: Id, waypoints: Vec2[], maxMove: number,
  opts: { pathfinder?: boolean; flying?: boolean; ignoreIds?: Id[]; passModels?: boolean | Id[] } = {},
): PathCheck {
  const m = state.models[modelId]!
  const r = baseRadius(m.base)
  const pts = [m.pos, ...waypoints]
  const end = pts[pts.length - 1]!
  let length = 0
  for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1]!, pts[i]!)
  // rough
  let rough = roughUnder(state, m.pos, r).length > 0
  if (!rough) {
    outer: for (let i = 1; i < pts.length; i++) {
      const d = norm(sub(pts[i]!, pts[i - 1]!))
      const l = dist(pts[i - 1]!, pts[i]!)
      for (const p of terrainPieces(state)) {
        if (p.traits.rough && overlapIntervals(p, pts[i - 1]!, d, l, r).length) { rough = true; break outer }
      }
    }
  }
  const allowance = rough && !opts.pathfinder ? Math.max(1, maxMove - 2) : maxMove
  const fail = (code: RejectionCode, message: string): PathCheck => ({ ok: false, code, message, length, allowance, rough, end })
  if (length > allowance + 1e-6) return fail('E_TOO_FAR', `path ${length.toFixed(2)}" exceeds ${allowance}"`)

  const ignore = new Set(opts.ignoreIds ?? [])
  let travelled = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const l = dist(a, b)
    if (l < 1e-9) continue
    const d = norm(sub(b, a))
    if (!baseOnTable(state, b, r)) return fail('E_PLACEMENT', 'path leaves the table')
    // ghostly movers pass through every base on the way (the end point is still checked below)
    const sweepIgnore = opts.passModels === true ? [...ignore, ...Object.keys(state.models)] : Array.isArray(opts.passModels) ? [...ignore, ...opts.passModels] : [...ignore]
    const sw = sweepFrom(state, m, a, d, l, { passThrough: 'none', obstacles: 'ignore', ignoreObstructions: opts.flying, ignoreIds: sweepIgnore, clampTable: false })
    if (sw.stoppedBy.kind === 'model') return fail('E_PATH_BLOCKED', `blocked by ${sw.stoppedBy.id}`)
    if (sw.stoppedBy.kind === 'obstruction') return fail('E_PATH_BLOCKED', `blocked by ${sw.stoppedBy.id}`)
    if (!opts.pathfinder) {
      for (const p of terrainPieces(state)) {
        if (p.traits.move !== 'obstacle') continue
        for (const [s, e] of overlapIntervals(p, a, d, l, r)) {
          if (s <= 1e-9) continue // starts on/against it
          // must clear it completely; the leg's own end counts if it ends past the obstacle
          if (e >= l - 1e-9) return fail('E_PATH_BLOCKED', `cannot stop on obstacle ${p.t.id}`)
          if (travelled + e > allowance + 1e-6) return fail('E_PATH_BLOCKED', `not enough movement to clear ${p.t.id}`)
        }
      }
    }
    travelled += l
  }
  const fin = isLegalPlacement(state, modelId, end, m.base, { ignoreIds: [...ignore] })
  if (!fin.ok) return fail(fin.code ?? 'E_PLACEMENT', fin.message ?? 'illegal end position')
  return { ok: true, length, allowance, rough, end }
}

/** Surface elevation a model of this base would have at pos (hills it is completely within). */
export function surfaceElevation(state: GameState, pos: Vec2, mm: number): number {
  return elevationAt(state, pos, baseRadius(mm))
}
