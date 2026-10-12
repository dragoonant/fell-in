// Manifest of generated models (public/assets/models/manifest.json). Only slugs listed there are ever requested, so a
// missing model stays procedural and never logs a 404. Unit slug = unit id; weapon slug = weapon id.
import { useEffect, useState } from 'react'

type V3 = [number, number, number]
/** Unit overrides. `hand`: the grip point of the held weapon, in the FITTED figure frame (inches, origin at the base
 * centre on the table, y up, front +z, after `yaw` and the fit scale/lift in GlbBody). `rot`: weapon Euler (radians)
 * relative to "barrel along +z, level". `yaw`: radians about +y that turns the raw GLB so its head looks along +z.
 * A listed unit with no `hand` (beasts) holds nothing. `rightHand` is read as a legacy alias of `hand`. */
export interface UnitEntry { hand?: V3; rot?: V3; height?: number; yaw?: number }
export interface WeaponEntry { length?: number }
export interface Manifest {
  defaults: Record<string, { hand: V3; rot?: V3 }>
  units: Record<string, UnitEntry>
  weapons: Record<string, WeaponEntry>
}

const EMPTY: Manifest = { defaults: {}, units: {}, weapons: {} }
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i
const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Parse a manifest body; anything malformed gives empty maps. Entries may be objects or `true`/null (no overrides). Pure. */
export function parseManifest(raw: unknown): Manifest {
  const r = rec(raw)
  const out: Manifest = { defaults: {}, units: {}, weapons: {} }
  for (const [k, v] of Object.entries(rec(rec(r.sockets).defaults))) {
    const e = rec(v)
    const hand = isV3(e.hand) ? e.hand : isV3(e.rightHand) ? e.rightHand : undefined
    if (hand) out.defaults[k] = { hand, ...(isV3(e.rot) ? { rot: e.rot } : {}) }
  }
  for (const [slug, v] of Object.entries(rec(r.units))) {
    if (!SLUG.test(slug)) continue
    const e = rec(v)
    const hand = isV3(e.hand) ? e.hand : isV3(e.rightHand) ? e.rightHand : undefined
    out.units[slug] = {
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
export const MELEE_ROT: V3 = [-0.95, 0, 0]
export function heldRotation(mode: 'ranged' | 'melee', rot: V3 | undefined): V3 {
  return rot ?? (mode === 'melee' ? MELEE_ROT : [0, 0, 0])
}

const base = (): string => import.meta.env.BASE_URL
export const unitGlbUrl = (slug: string): string => `${base()}assets/models/units/${slug}.glb`
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
