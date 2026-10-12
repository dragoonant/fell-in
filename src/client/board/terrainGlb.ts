// Terrain GLBs: public/assets/models/terrain/manifest.json (written by the terrain generator, read at runtime only)
// lists which pieces have a model. Tolerant of shapes: {pieces:{id:{file?}}}, {models:[...]}, {slugs:[...]},
// or a plain array of ids / {id|slug|pieceId, file?} entries. A piece matches by pieceId or pieceId minus "terrain.".
import { useEffect, useMemo, useState } from 'react'
import { Box3, Group } from 'three'
import { useGlbInstance } from '../figures/glbLoader'
import { planFit } from './terrainFit'
import type { Shape } from '../../engine/types'

export interface TerrainEntry { slug: string; file: string }
export type TerrainManifest = Map<string, TerrainEntry>

const dir = (): string => `${import.meta.env.BASE_URL}assets/models/terrain/`

/** Normalise any supported manifest shape to slug -> file name. Pure. */
export function parseTerrainManifest(raw: unknown): TerrainManifest {
  const out: TerrainManifest = new Map()
  const add = (slug: unknown, file: unknown) => {
    if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) return
    const f = typeof file === 'string' && /^[\w./-]+\.glb$/i.test(file) && !file.includes('..') ? file : `${slug}.glb`
    out.set(slug, { slug, file: f })
  }
  const list = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const e of v) {
        if (typeof e === 'string') add(e, undefined)
        else if (e && typeof e === 'object') { const o = e as Record<string, unknown>; add(o.slug ?? o.id ?? o.pieceId, o.file) }
      }
    } else if (v && typeof v === 'object') {
      for (const [k, e] of Object.entries(v)) {
        add(k, e && typeof e === 'object' ? (e as Record<string, unknown>).file : typeof e === 'string' ? e : undefined)
      }
    }
  }
  if (Array.isArray(raw)) list(raw)
  else if (raw && typeof raw === 'object') { const r = raw as Record<string, unknown>; list(r.pieces); list(r.models); list(r.slugs); list(r.terrain) }
  return out
}

/** The entry for an engine pieceId, or undefined (procedural piece). */
export function terrainEntryFor(m: TerrainManifest, pieceId: string): TerrainEntry | undefined {
  return m.get(pieceId) ?? m.get(pieceId.replace(/^terrain\./, ''))
}

let current: TerrainManifest = new Map()
let load: Promise<void> | undefined
function loadTerrainManifest(): Promise<void> {
  if (load) return load
  load = (async () => {
    try {
      if (typeof fetch !== 'undefined' && typeof location !== 'undefined') {
        const res = await fetch(`${dir()}manifest.json`, { cache: 'no-cache' })
        if (res.ok) current = parseTerrainManifest(await res.json())
      }
    } catch { /* none yet: everything stays procedural */ }
  })()
  return load
}

/** The terrain manifest (empty until loaded or if absent); re-renders once when it arrives. */
export function useTerrainManifest(): TerrainManifest {
  const [, tick] = useState(0)
  useEffect(() => { void loadTerrainManifest().then(() => tick((n) => n + 1)) }, [])
  return current
}

/** The model fitted to a footprint (local space: y up, bottom on the table), or null while loading / on failure. */
export function useFittedTerrain(entry: TerrainEntry | undefined, id: string, fp: Shape, rot: number, height: number): Group | null {
  const inst = useGlbInstance(entry ? dir() + entry.file : undefined)
  return useMemo(() => {
    if (!inst) return null
    inst.updateMatrixWorld(true)
    const b = new Box3().setFromObject(inst)
    if (b.isEmpty()) return null
    const size: [number, number, number] = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
    const plan = planFit(id, fp, rot, height, size)
    // inner: model bottom-centre to origin; mid: quarter turns (+ half-turn flip); outer: scale in the footprint frame
    const inner = new Group()
    inner.add(inst)
    inst.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    const mid = new Group()
    mid.add(inner)
    mid.rotation.y = (plan.turns + (plan.flip ? 2 : 0)) * (Math.PI / 2)
    const outer = new Group()
    outer.add(mid)
    outer.scale.set(plan.sx, plan.sy, plan.sz)
    outer.position.set(plan.cx, 0, plan.cz)
    return outer
  }, [inst, id, fp, rot, height])
}
