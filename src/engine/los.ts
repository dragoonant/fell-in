// LOS with an explaining verdict. Pure functions. TODO(M2): re-check the height and cover rules against the Wasteland spec.
// LOS = some straight line from any part of A's volume to any part of B's volume passes every test:
// terrain by height in 3D, intervening models in 2D, clouds in 2D.
import {
  angleOf, baseRadius, dist, edgeDistance, isOnTable, segPointDist, sub, volumeHeight,
} from './geometry'
import { modelDistance, within } from './measure'
import {
  circleInsideShape, distToShape, insideCoverOf, pointInShape, segmentInsideIntervals,
  terrainPieces, type CoverKind, type TerrainPiece, type WorldShape,
} from './terrain'
import type { Cloud, GameState, Id, LosReason, LosVerdict, ModelState, Mod, Vec2 } from './types'

export interface LosOptions {
  /** weapon RNG; sets verdict.inRange (LOS itself ignores range) */
  range?: number
  /** True Sight / Alchemical Mask */
  ignoreClouds?: boolean
  /** Arcing Fire, spray: intervening models never block */
  ignoreModels?: boolean
  /** Incorporeal and similar: this model is never an intervening model (cryx.md) */
  skipModel?: (m: ModelState) => boolean
  /** Treewalker: forests never block this viewer's line of sight (circle.md) */
  ignoreForest?: boolean
  /** viewer is the channelling arc node etc.: use this model as point of origin (default: the first arg) */
}

/** The verdict plus everything the LOS view needs to draw the answer. */
export interface LosReport extends LosVerdict {
  /** best line tried (the passing one if visible, else the least-blocked one) */
  line: { from: Vec2; to: Vec2; fromZ: number; toZ: number } | null
  terrainBlockers: Id[]
  modelBlockers: Id[]
  cloudBlockers: Id[]
  /** short human sentence for the UI */
  why: string
}

type Line = { a: Vec2; za: number; b: Vec2; zb: number }

function basePoints(c: Vec2, r: number, toward: Vec2): Vec2[] {
  const base = angleOf(sub(toward, c))
  const pts: Vec2[] = [c]
  for (const off of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) pts.push({ x: c.x + Math.cos(base + off) * r, z: c.z + Math.sin(base + off) * r })
  return pts
}

/** Candidate lines, centre-to-centre first. */
export function sampleLines(A: ModelState, B: ModelState): Line[] {
  const rA = baseRadius(A.base), rB = baseRadius(B.base)
  const hA = volumeHeight(A.base), hB = volumeHeight(B.base)
  const pa = basePoints(A.pos, rA, B.pos), pb = basePoints(B.pos, rB, A.pos)
  const zA = [A.elev + hA * 0.95, A.elev + hA * 0.5]
  const zB = [B.elev + hB * 0.95, B.elev + hB * 0.5, B.elev + 0.1]
  const out: Line[] = []
  for (const a of pa) for (const b of pb) for (const za of zA) for (const zb of zB) out.push({ a, za, b, zb })
  return out
}

function cloudBlocks(c: Cloud): boolean {
  return c.blocksLos ?? c.kind !== 'flare'
}
function cloudConceals(c: Cloud): boolean {
  return c.concealment ?? c.kind !== 'flare'
}
export const cloudShape = (c: Cloud): WorldShape => ({ kind: 'circle', c: c.pos, r: c.diameter / 2 })
const inCloud = (m: ModelState, c: Cloud): boolean => dist(m.pos, c.pos) < c.diameter / 2 + baseRadius(m.base) - 1e-9

/** True when the line is stopped by this terrain piece (height test; forests by depth are separate). */
function pieceBlocksLine(p: TerrainPiece, l: Line): boolean {
  if (!p.traits.blocksLos) return false
  if (pointInShape(l.a, p.shape) || pointInShape(l.b, p.shape)) return false // a model standing on it
  const top = (typeof p.t.props['baseElev'] === 'number' ? (p.t.props['baseElev'] as number) : 0) + p.traits.height
  for (const [t0, t1] of segmentInsideIntervals(l.a, l.b, p.shape)) {
    const z0 = l.za + (l.zb - l.za) * t0, z1 = l.za + (l.zb - l.za) * t1
    if (Math.min(z0, z1) < top - 1e-9) return true
  }
  return false
}
function forestBlocksLine(p: TerrainPiece, l: Line): boolean {
  const iv = segmentInsideIntervals(l.a, l.b, p.shape)
  if (!iv.length) return false
  const L = dist(l.a, l.b)
  const inside = iv.reduce((s, [t0, t1]) => s + (t1 - t0) * L, 0)
  const endInside = pointInShape(l.a, p.shape) || pointInShape(l.b, p.shape)
  return endInside ? inside > p.traits.losThrough + 1e-9 : inside > 1e-9
}

interface Ctx {
  state: GameState
  A: ModelState
  B: ModelState
  bHuge: boolean
  pieces: TerrainPiece[]
  clouds: Cloud[]
  interveners: ModelState[]
  ignoreForest?: boolean
}
interface LineResult { reasons: LosReason[]; terrain: Id[]; models: Id[]; clouds: Id[] }

function buildCtx(state: GameState, A: ModelState, B: ModelState, opts: LosOptions): Ctx {
  const interveners: ModelState[] = []
  if (!opts.ignoreModels) {
    for (const o of Object.values(state.models)) {
      if (o.id === A.id || o.id === B.id || !isOnTable(o)) continue
      if (o.conditions.includes('prone')) continue
      if (A.unitId && o.unitId === A.unitId) continue
      if (opts.skipModel?.(o)) continue
      if (o.base < B.base) continue // only bases >= the target's can block (TODO(M2): confirm)
      interveners.push(o)
    }
  }
  // Veil of Mists: a cloud that is transparent to its owner's side only (c.friendlyTransparent)
  const clouds = opts.ignoreClouds || B.base >= 80 ? [] : state.clouds.filter((c) => cloudBlocks(c) && !inCloud(A, c) && !inCloud(B, c) && !(false))
  return { state, A, B, bHuge: B.base >= 80, pieces: terrainPieces(state), clouds, interveners, ignoreForest: !!opts.ignoreForest }
}

function evalLine(ctx: Ctx, l: Line): LineResult {
  const r: LineResult = { reasons: [], terrain: [], models: [], clouds: [] }
  let forest = false, terr = false
  for (const p of ctx.pieces) {
    if (p.traits.forest) {
      if (!ctx.bHuge && !ctx.ignoreForest && forestBlocksLine(p, l)) { forest = true; r.terrain.push(p.t.id) }
    } else if (pieceBlocksLine(p, l)) { terr = true; r.terrain.push(p.t.id) }
  }
  if (terr) r.reasons.push('terrain')
  if (forest) r.reasons.push('forestDepth')
  const { A, B } = ctx
  for (const o of ctx.interveners) {
    if (segPointDist(l.a, l.b, o.pos).d >= baseRadius(o.base) - 1e-9) continue
    if (A.elev - o.elev >= 1 && edgeDistance(o.pos, o.base, B.pos, B.base) > 1) continue // elevated viewer
    if (B.elev - A.elev >= 1 && o.elev <= B.elev - 1) continue // lower viewer ignores models below the target
    r.models.push(o.id)
  }
  if (r.models.length) r.reasons.push('model')
  for (const c of ctx.clouds) {
    if (segmentInsideIntervals(l.a, l.b, cloudShape(c)).length) r.clouds.push(c.id)
  }
  if (r.clouds.length) r.reasons.push('cloud')
  return r
}

const score = (r: LineResult) => r.terrain.length * 4 + r.models.length * 2 + r.clouds.length

function sentence(reasons: LosReason[], blockers: Id[]): string {
  if (reasons.includes('self')) return 'A model cannot target itself.'
  if (reasons.includes('outOfTable')) return 'One of the models is not on the table.'
  if (reasons.includes('clear')) return 'Clear line of sight.'
  const parts: string[] = []
  if (reasons.includes('terrain')) parts.push('terrain blocks the line')
  if (reasons.includes('forestDepth')) parts.push('too much forest in the way')
  if (reasons.includes('model')) parts.push('a model in the way is at least as big as the target')
  if (reasons.includes('cloud')) parts.push('a cloud is in the way')
  return `Blocked: ${parts.join('; ')}${blockers.length ? ` (${blockers.join(', ')})` : ''}.`
}

/** Full LOS report from the point of origin to the target. */
export function losReport(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosReport {
  const A = state.models[originId], B = state.models[targetId]
  const mk = (visible: boolean, reasons: LosReason[], d: number, extra: Partial<LosReport> = {}): LosReport => ({
    visible, reasons, blockers: [], inRange: false, distance: d, line: null,
    terrainBlockers: [], modelBlockers: [], cloudBlockers: [], why: sentence(reasons, []), ...extra,
  })
  if (!A || !B) return mk(false, ['outOfTable'], Infinity)
  if (A.id === B.id) return mk(false, ['self'], 0)
  const d = modelDistance(A, B)
  const rangeOk = opts.range === undefined || d <= opts.range + 1e-6
  if (!isOnTable(A) || !isOnTable(B)) return mk(false, ['outOfTable'], d, { inRange: rangeOk })

  const ctx = buildCtx(state, A, B, opts)
  let best: { l: Line; r: LineResult } | null = null
  for (const l of sampleLines(A, B)) {
    const r = evalLine(ctx, l)
    if (!r.reasons.length) {
      return mk(true, ['clear'], d, {
        inRange: rangeOk, line: { from: l.a, to: l.b, fromZ: l.za, toZ: l.zb }, why: 'Clear line of sight.',
      })
    }
    if (!best || score(r) < score(best.r)) best = { l, r }
  }
  const { l, r } = best!
  const blockers = [...r.terrain, ...r.models, ...r.clouds]
  return {
    visible: false, reasons: r.reasons, blockers, inRange: rangeOk, distance: d,
    line: { from: l.a, to: l.b, fromZ: l.za, toZ: l.zb },
    terrainBlockers: r.terrain, modelBlockers: r.models, cloudBlockers: r.clouds, why: sentence(r.reasons, blockers),
  }
}

/** Frozen-contract verdict (what AttackContext.losVerdict holds). */
export function losVerdict(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosVerdict {
  const { visible, reasons, blockers, inRange, distance } = losReport(state, originId, targetId, opts)
  return { visible, reasons, blockers, inRange, distance }
}
export const hasLos = (state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): boolean =>
  losReport(state, originId, targetId, opts).visible

/** LOS from a model to an arbitrary pose (placement checks: a trooper placed at pos must see the anchor). */
export function hasLosFromPose(state: GameState, moverId: Id, pos: Vec2, targetId: Id, opts: LosOptions = {}): boolean {
  const m = state.models[moverId]!
  const probe: GameState = { ...state, models: { ...state.models, [moverId]: { ...m, pos } } }
  return hasLos(probe, moverId, targetId, opts)
}

// TODO(M2): Wasteland cover, engagement and ruler-colour range queries go here (the Warmachine DEF-modifier pipeline was removed).
