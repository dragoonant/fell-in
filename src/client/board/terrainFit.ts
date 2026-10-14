// Pure helpers that fit a terrain GLB to an engine footprint (adapted from an earlier port).
// Everything is in the piece's LOCAL space (the engine's pos and rot are applied to the group afterwards).
// Model contract: y up, origin at the bottom-face centre, long horizontal side along +x (any unit: it is scaled).
import type { Shape, Vec2 } from '../../engine/types'

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number; w: number; d: number }

/** Bounding box of a rect, circle or polygon footprint (local space, centred on the piece origin). */
export function localBounds(fp: Shape): Bounds {
  let minX: number, maxX: number, minZ: number, maxZ: number
  if ('circle' in fp) { minX = minZ = -fp.circle.r; maxX = maxZ = fp.circle.r }
  else if ('rect' in fp) { maxX = fp.rect.w / 2; maxZ = fp.rect.d / 2; minX = -maxX; minZ = -maxZ }
  else {
    minX = minZ = Infinity; maxX = maxZ = -Infinity
    for (const p of fp.polygon) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: Math.max(maxX - minX, 0.01), d: Math.max(maxZ - minZ, 0.01) }
}

/** Rule: a quarter turn when the model's long side is not the footprint's long side. Circles use 0. */
export function simpleTurns(modelSize: readonly [number, number, number], b: Bounds, fp?: Shape): number {
  if (fp && 'circle' in fp) return 0
  const modelLongX = modelSize[0] >= modelSize[2]
  const footLongX = b.w >= b.d
  return modelLongX === footLongX ? 0 : 1
}

/** Small integer from a piece id: trailing digits when present (so "f1" and "f2" differ), else a string hash. */
export function idVariant(id: string): number {
  const m = /(\d+)\D*$/.exec(id)
  if (m) return parseInt(m[1]!, 10)
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  return h
}

const close = (a: Vec2, b: Vec2, eps: number): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps

/** True when the footprint looks the same after a half turn about its bbox centre (rect, circle, point-symmetric polygon). */
export function looksSameAfterHalfTurn(fp: Shape): boolean {
  if ('circle' in fp || 'rect' in fp) return true
  const b = localBounds(fp)
  const eps = Math.max(b.w, b.d) * 0.01
  return fp.polygon.every((p) => fp.polygon.some((q) => close({ x: 2 * b.cx - p.x, z: 2 * b.cz - p.z }, q, eps)))
}

export interface FitPlan {
  /** Quarter turns about +y applied to the model first (flip adds two). */
  turns: number
  flip: boolean
  /** Scale (always uniform: sx = sy = sz), applied after the turn, in the footprint's frame. */
  sx: number; sy: number; sz: number
  /** Footprint bbox centre the fitted model is centred on (local space). */
  cx: number; cz: number
  /** Fitted model size in the footprint's frame. */
  size: [number, number, number]
}

/**
 * Plan the fit of a model of `modelSize` onto a footprint. x and z scale to the footprint bbox; when the two factors
 * differ by more than 15% the smaller is used for both (no squashed trees) and the model stays centred. y scales to
 * the piece's visual height. `rot` (the engine rotation) only decides the twin-variation flip: the final half-turn
 * count has the parity of the id's trailing number, so two copies of a piece never face the same way.
 */
export function planFit(id: string, fp: Shape, rot: number, visualHeight: number, modelSize: readonly [number, number, number]): FitPlan {
  const b = localBounds(fp)
  const turns = simpleTurns(modelSize, b, fp)
  const flip = looksSameAfterHalfTurn(fp) && (idVariant(id) + Math.round(rot / Math.PI)) % 2 !== 0
  const odd = turns % 2 === 1
  const ex = Math.max(odd ? modelSize[2] : modelSize[0], 1e-6)
  const ez = Math.max(odd ? modelSize[0] : modelSize[2], 1e-6)
  // ONE uniform scale: fit the footprint (the tighter axis, so nothing overhangs), then let height follow. If that would
  // make the piece more than 1.6x taller or shorter than its catalog height, pull the scale toward the height fit.
  const sFoot = Math.min(b.w / ex, b.d / ez)
  const sHeight = visualHeight / Math.max(modelSize[1], 1e-6)
  const s = Math.min(Math.max(sFoot, sHeight / 1.6), sHeight * 1.6)
  const sx = s, sy = s, sz = s
  return { turns, flip, sx, sy, sz, cx: b.cx, cz: b.cz, size: [ex * sx, modelSize[1] * sy, ez * sz] }
}
