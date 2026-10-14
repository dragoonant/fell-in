// Manifest of generated models (public/assets/models/manifest.json). Only slugs listed there are ever requested, so a
// missing model stays procedural and never logs a 404. Unit slug = unit id; weapon slug = weapon id.
import { useEffect, useState } from 'react'
import { Euler, Matrix4, Vector3 } from 'three'
import type { WeaponClass } from './equipped'

type V3 = [number, number, number]
/** Unit overrides. `hand`: the grip point of the held weapon, in the FITTED figure frame (inches, origin at the base
 * centre on the table, y up, front +z, after `yaw` and the fit scale/lift in GlbBody). `rot`: weapon Euler (radians)
 * relative to "barrel along +z, level". `yaw`: radians about +y that turns the raw GLB so its head looks along +z.
 * A listed unit with no `hand` (beasts) holds nothing. `rightHand` is read as a legacy alias of `hand`. */
export interface PoseEntry { file: string; hand: V3; support: V3; yaw?: number; height?: number }
export interface UnitEntry { hand?: V3; rot?: V3; height?: number; yaw?: number; poses?: Partial<Record<WeaponClass, PoseEntry>> }
export interface WeaponEntry { length?: number }
/** Objective-object model: `file` relative to assets/models; `lengthIn` (longest horizontal side) or `heightIn` sets the
 * uniform fit (default longest side 1.2 in); `yaw` turns the raw model about +y. */
export interface ObjectEntry { file: string; lengthIn?: number; heightIn?: number; yaw?: number }
export interface Manifest {
  defaults: Record<string, { hand: V3; rot?: V3 }>
  units: Record<string, UnitEntry>
  weapons: Record<string, WeaponEntry>
  objects: Record<string, ObjectEntry>
}

const EMPTY: Manifest = { defaults: {}, units: {}, weapons: {}, objects: {} }
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i
const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
const CLASSES: readonly string[] = ['pistol', 'long', 'heavy', 'melee1', 'melee2', 'thrown']
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Parse a manifest body; anything malformed gives empty maps. Entries may be objects or `true`/null (no overrides). Pure. */
export function parseManifest(raw: unknown): Manifest {
  const r = rec(raw)
  const out: Manifest = { defaults: {}, units: {}, weapons: {}, objects: {} }
  for (const [k, v] of Object.entries(rec(rec(r.sockets).defaults))) {
    const e = rec(v)
    const hand = isV3(e.hand) ? e.hand : isV3(e.rightHand) ? e.rightHand : undefined
    if (hand) out.defaults[k] = { hand, ...(isV3(e.rot) ? { rot: e.rot } : {}) }
  }
  for (const [slug, v] of Object.entries(rec(r.units))) {
    if (!SLUG.test(slug)) continue
    const e = rec(v)
    const hand = isV3(e.hand) ? e.hand : isV3(e.rightHand) ? e.rightHand : undefined
    const poses: Partial<Record<WeaponClass, PoseEntry>> = {}
    for (const [cls, pv] of Object.entries(rec(e.poses))) {
      const pe = rec(pv)
      if (!CLASSES.includes(cls) || typeof pe.file !== 'string' || !/^[\w./@-]+\.glb$/i.test(pe.file) || pe.file.includes('..')) continue
      if (!isV3(pe.hand) || !isV3(pe.support)) continue
      poses[cls as WeaponClass] = {
        file: pe.file, hand: pe.hand, support: pe.support,
        ...(typeof pe.yaw === 'number' && Number.isFinite(pe.yaw) ? { yaw: pe.yaw } : {}),
        ...(typeof pe.height === 'number' && pe.height > 0 ? { height: pe.height } : {}),
      }
    }
    out.units[slug] = {
      ...(Object.keys(poses).length ? { poses } : {}),
      ...(hand ? { hand } : {}), ...(isV3(e.rot) ? { rot: e.rot } : {}),
      ...(typeof e.height === 'number' && e.height > 0 ? { height: e.height } : {}),
      ...(typeof e.yaw === 'number' && Number.isFinite(e.yaw) ? { yaw: e.yaw } : {}),
    }
  }
  for (const [slug, v] of Object.entries(rec(r.weapons))) {
    if (!SLUG.test(slug)) continue
    const e = rec(v)
    out.weapons[slug] = typeof e.length === 'number' && e.length > 0 ? { length: e.length } : {}
  }
  for (const [face, v] of Object.entries(rec(r.objects))) {
    if (!SLUG.test(face)) continue
    const e = rec(v)
    const file = typeof e.file === 'string' && /^[\w./-]+\.glb$/i.test(e.file) && !e.file.includes('..') ? e.file : `objects/${face}.glb`
    out.objects[face] = {
      file,
      ...(typeof e.lengthIn === 'number' && e.lengthIn > 0 ? { lengthIn: e.lengthIn } : {}),
      ...(typeof e.heightIn === 'number' && e.heightIn > 0 ? { heightIn: e.heightIn } : {}),
      ...(typeof e.yaw === 'number' && Number.isFinite(e.yaw) ? { yaw: e.yaw } : {}),
    }
  }
  return out
}

/** Figure height in inches by base size (the procedural formula, so GLB and stand-in match). */
export const figureHeight = (baseMm: number): number => 1.45 + (baseMm - 25) * 0.045

/** Hand socket for a unit, or undefined when it holds nothing. A unit listed in the manifest (it has a GLB) uses only
 * its own `hand`; an unlisted (procedural) unit uses the default of the nearest base size, else a computed one. `rot`
 * is undefined unless the manifest sets it (the caller then poses by weapon mode, see heldRotation). */
export function socketFor(m: Manifest, slug: string, baseMm: number): { hand: V3; rot: V3 | undefined } | undefined {
  const own = m.units[slug]
  if (own) return own.hand ? { hand: own.hand, rot: own.rot } : undefined
  const keys = Object.keys(m.defaults).map(Number).filter(Number.isFinite)
  const near = keys.length ? keys.reduce((a, b) => (Math.abs(b - baseMm) < Math.abs(a - baseMm) ? b : a)) : undefined
  const def = near !== undefined ? m.defaults[String(near)] : undefined
  const h = figureHeight(baseMm)
  const fallback: V3 = [baseMm / 25.4 * 0.27, 0.12 + h * 0.6, baseMm / 25.4 * 0.15]
  return { hand: def?.hand ?? fallback, rot: def?.rot }
}

/** Weapon pose in the hand: guns level with the barrel forward (+z); melee weapons raised up and forward like a club. */
const MELEE_PITCH = -0.95
export const MELEE_ROT: V3 = [MELEE_PITCH, 0, 0]
export function heldRotation(mode: 'ranged' | 'melee', rot: V3 | undefined): V3 {
  return rot ?? (mode === 'melee' ? MELEE_ROT : [0, 0, 0])
}

/** Hold transform by weapon class, relative to the fist socket (fitted figure frame: +x the weapon-side hand, +z front).
 * Poses are Euler pitch (negative = barrel up) and yaw (positive = barrel out toward +x, stock across the body), applied
 * yaw-after-pitch, then handed over as a plain XYZ Euler. `lift`/`push` nudge the grip up/forward from the fist. */
const HOLDS: Record<WeaponClass, { pitch: number; yaw: number; dx: number; dy: number; dz: number }> = {
  pistol: { pitch: 0, yaw: 0, dx: 0, dy: 0, dz: 0 },
  thrown: { pitch: -0.3, yaw: 0, dx: 0, dy: 0.05, dz: 0.05 },
  // Rifles and shotguns: braced across the chest, stock near the body centre, barrel level and pointing forward (muzzle never raised).
  long: { pitch: 0.02, yaw: -0.1, dx: -0.2, dy: -0.12, dz: 0.02 },
  heavy: { pitch: -0.12, yaw: 0.05, dx: -0.2, dy: 0.3, dz: -0.15 },
  melee1: { pitch: MELEE_PITCH, yaw: 0, dx: 0, dy: 0, dz: 0 },
  melee2: { pitch: -2.3, yaw: 0, dx: 0, dy: 0, dz: 0 },
}
export function heldPose(cls: WeaponClass, hand: V3, rot: V3 | undefined): { position: V3; rotation: V3 } {
  if (rot) return { position: hand, rotation: rot } // a per-unit manifest override always wins
  const h = HOLDS[cls]
  const e = new Euler().setFromRotationMatrix(new Matrix4().makeRotationFromEuler(new Euler(h.pitch, h.yaw, 0, 'YXZ')), 'XYZ')
  return { position: [hand[0] + h.dx, hand[1] + h.dy, hand[2] + h.dz], rotation: [e.x, e.y, e.z] }
}

let posesOn = true
/** Review hook (?gallery&nopose): turn pose selection off to compare with the default pose. */
export function setPosesEnabled(on: boolean): void { posesOn = on }

/** Pose entry for a unit holding a weapon of class `cls`, if the manifest defines one. */
export function poseFor(m: Manifest, slug: string | undefined, cls: WeaponClass | undefined): PoseEntry | undefined {
  if (!posesOn) return undefined
  return slug && cls ? m.units[slug]?.poses?.[cls] : undefined
}

/** Weapon placement for a two-hand pose: grip at `hand`, barrel (+z) pointing from hand through `support`, weapon up
 * kept as close to figure up (+y) as the aim allows. Rotation is an XYZ Euler. Pure. */
export function aimedPose(hand: V3, support: V3): { position: V3; rotation: V3 } {
  const z = new Vector3(support[0] - hand[0], support[1] - hand[1], support[2] - hand[2])
  if (z.lengthSq() < 1e-9) z.set(0, 0, 1)
  z.normalize()
  let x = new Vector3(0, 1, 0).cross(z)
  if (x.lengthSq() < 1e-9) x = new Vector3(1, 0, 0) // straight up or down: any side axis
  x.normalize()
  const y = z.clone().cross(x)
  const e = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z), 'XYZ')
  return { position: [hand[0], hand[1], hand[2]], rotation: [e.x, e.y, e.z] }
}

const base = (): string => import.meta.env.BASE_URL
export const unitGlbUrl = (slug: string): string => `${base()}assets/models/units/${slug}.glb`
export const objectGlbUrl = (file: string): string => `${base()}assets/models/${file}`
export const poseGlbUrl = (file: string): string => `${base()}assets/models/${file}`
export const weaponGlbUrl = (slug: string): string => `${base()}assets/models/weapons/${slug}.glb`

let current: Manifest = EMPTY
let load: Promise<void> | undefined
let subs: Array<() => void> = []

/** Fetch the manifest once (never throws). Listeners fire when it settles. */
export function loadManifest(): Promise<void> {
  if (load) return load
  load = (async () => {
    try {
      if (typeof fetch !== 'undefined' && typeof location !== 'undefined') {
        const res = await fetch(`${base()}assets/models/manifest.json`, { cache: 'no-cache' })
        if (res.ok) current = parseManifest(await res.json())
      }
    } catch { /* offline or malformed: everything stays procedural */ }
    const l = subs; subs = []; l.forEach((f) => f())
  })()
  return load
}

/** The manifest (empty until loaded); re-renders the caller once when it arrives. */
export function useManifest(): Manifest {
  const [, tick] = useState(0)
  useEffect(() => { void loadManifest().then(() => tick((n) => n + 1)) }, [])
  return current
}

/** Test hook. */
export function setManifestForTest(m: Manifest): void { current = m; load = Promise.resolve() }
