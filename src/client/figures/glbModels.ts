// Manifest of generated models (public/assets/models/manifest.json). Only slugs listed there are ever requested, so a
// missing model stays procedural and never logs a 404. Unit slug = unit id; weapon slug = weapon id.
import { useEffect, useState } from 'react'

type V3 = [number, number, number]
export interface UnitEntry { rightHand?: V3; rot?: V3; height?: number }
export interface WeaponEntry { length?: number }
export interface Manifest {
  defaults: Record<string, { rightHand: V3; rot: V3 }>
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
    if (isV3(e.rightHand)) out.defaults[k] = { rightHand: e.rightHand, rot: isV3(e.rot) ? e.rot : [0, 0, 0] }
  }
  for (const [slug, v] of Object.entries(rec(r.units))) {
    if (!SLUG.test(slug)) continue
    const e = rec(v)
    out.units[slug] = { ...(isV3(e.rightHand) ? { rightHand: e.rightHand } : {}), ...(isV3(e.rot) ? { rot: e.rot } : {}), ...(typeof e.height === 'number' && e.height > 0 ? { height: e.height } : {}) }
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

/** Hand socket for a unit: its manifest entry, else the default of the nearest base size, else a computed one. */
export function socketFor(m: Manifest, slug: string, baseMm: number): { rightHand: V3; rot: V3 } {
  const own = m.units[slug]
  const keys = Object.keys(m.defaults).map(Number).filter(Number.isFinite)
  const near = keys.length ? keys.reduce((a, b) => (Math.abs(b - baseMm) < Math.abs(a - baseMm) ? b : a)) : undefined
  const def = near !== undefined ? m.defaults[String(near)] : undefined
  const h = figureHeight(baseMm)
  const fallback: V3 = [baseMm / 25.4 * 0.27, 0.12 + h * 0.6, baseMm / 25.4 * 0.15]
  return { rightHand: own?.rightHand ?? def?.rightHand ?? fallback, rot: own?.rot ?? def?.rot ?? [0, 0, 0] }
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
