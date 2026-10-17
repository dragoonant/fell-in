// Themed skirmish boards (M5): catalog sizes, placement, balance, flat piece rules and createGame wiring.
import { describe, expect, it } from 'vitest'
import { loadBundle } from './helpers'
import { createGame } from '../../src/engine/setup'
import { placementBlockers, terrainTraits } from '../../src/engine/terrain'
import { TERRAIN_CATALOG, TERRAIN_THEMES, themeFits, themedTerrain, type TerrainTheme } from '../../src/engine/terrainCatalog'
import type { TerrainInstance } from '../../src/engine/types'

const bundle = loadBundle()

const FROZEN: Record<string, [number, number, number, string]> = {
  'ruined-house-shell': [8, 7, 6, 'building'], 'collapsed-garage': [6, 5, 3.5, 'building'], 'picket-fence-run': [6, 0.4, 1.3, 'obstacle'],
  'mailbox-row': [3, 0.6, 1.5, 'obstacle'], 'rusted-playground-frame': [4, 3, 3, 'obstruction'], 'fallen-lamp-post': [6, 1, 0.8, 'obstacle'],
  'gas-pump-pair': [2.5, 1.2, 2, 'obstacle'], 'service-bay-lift': [4, 3, 2.5, 'obstruction'], 'roadside-billboard': [6, 1, 5, 'obstruction'],
  'tyre-mountain': [4, 4, 2.2, 'obstacle'], 'crushed-car-stack': [5, 2.5, 4, 'obstruction'], 'scrap-press': [4, 3, 3.5, 'obstruction'],
  'scrap-wall-section': [6, 0.8, 2.5, 'obstruction'], 'appliance-heap': [3.5, 3, 2, 'obstacle'], 'rusted-crane-base': [3, 3, 5, 'obstruction'],
}

/** Axis-aligned extent of a rotated rectangle piece. */
function extent(t: TerrainInstance): { x0: number; x1: number; z0: number; z1: number } {
  const f = (t.footprint as { rect: { w: number; d: number } }).rect
  const c = Math.abs(Math.cos(t.rot)), s = Math.abs(Math.sin(t.rot))
  const hx = (f.w * c + f.d * s) / 2, hz = (f.w * s + f.d * c) / 2
  return { x0: t.pos.x - hx, x1: t.pos.x + hx, z0: t.pos.z - hz, z1: t.pos.z + hz }
}
const overlap = (a: TerrainInstance, b: TerrainInstance): boolean => {
  const p = extent(a), q = extent(b)
  return p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1
}
const isFlat = (t: TerrainInstance): boolean => t.props['flat'] !== undefined

describe('terrain themes', () => {
  it('TERRAIN-001 the frozen GLB batch is in the catalog with exactly those sizes and rules types', () => {
    for (const [slug, [w, d, h, rt]] of Object.entries(FROZEN)) expect(TERRAIN_CATALOG[slug], slug).toEqual({ w, d, h, rulesType: rt })
  })

  it('TERRAIN-002 each board has 10 to 14 pieces from the catalog, the same sizes and a theme tag', () => {
    for (const theme of TERRAIN_THEMES) {
      const t = themedTerrain('box-1', theme)
      expect(t.length, theme).toBeGreaterThanOrEqual(10)
      expect(t.length, theme).toBeLessThanOrEqual(14)
      expect(new Set(t.map((x) => x.id)).size).toBe(t.length)
      for (const x of t) {
        const c = TERRAIN_CATALOG[x.pieceId]!
        expect(c, x.pieceId).toBeDefined()
        expect(x.footprint).toEqual({ rect: { w: c.w, d: c.d } })
        expect(x.props['theme']).toBe(theme)
      }
    }
  })

  it('TERRAIN-003 no piece reaches a deploy zone (Red, 6 in, of either long edge) or the table edge, and solid pieces never overlap', () => {
    for (const theme of TERRAIN_THEMES) {
      const t = themedTerrain('box-1', theme)
      for (const x of t) {
        const e = extent(x)
        expect(Math.max(Math.abs(e.z0), Math.abs(e.z1)), `${theme} ${x.id}`).toBeLessThanOrEqual(12)
        expect(Math.max(Math.abs(e.x0), Math.abs(e.x1)), `${theme} ${x.id}`).toBeLessThanOrEqual(17.5)
      }
      const solid = t.filter((x) => !isFlat(x))
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) expect(overlap(solid[i]!, solid[j]!), `${theme} ${solid[i]!.id} / ${solid[j]!.id}`).toBe(false)
    }
  })

  it('TERRAIN-004 the board is balanced for both seats: every half piece has a point-mirrored twin, and each quarter has a LOS blocker', () => {
    for (const theme of TERRAIN_THEMES) {
      const t = themedTerrain('box-1', theme)
      const n = t.filter((x) => /-n\d+$/.test(x.id)), f = t.filter((x) => /-f\d+$/.test(x.id))
      expect(n.length).toBe(f.length)
      for (const a of n) {
        const twin = f.find((b) => b.pieceId === a.pieceId && Math.abs(b.pos.x + a.pos.x) < 1e-9 && Math.abs(b.pos.z + a.pos.z) < 1e-9)
        expect(twin, `${theme} ${a.id}`).toBeDefined()
      }
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const hit = t.some((x) => Math.sign(x.pos.x) === sx && Math.sign(x.pos.z) === sz && terrainTraits(x).blocksLos)
        expect(hit, `${theme} quarter ${sx},${sz}`).toBe(true)
      }
    }
  })

  it('TERRAIN-005 placementBlockers: solid pieces block bases, flat pieces and the centre line objects do not', () => {
    for (const theme of TERRAIN_THEMES) {
      const state = { terrain: themedTerrain('box-1', theme) }
      for (const x of state.terrain) {
        const solid = terrainTraits(x).move !== 'none'
        expect(placementBlockers(state, x.pos, 0.5).some((b) => b.t.id === x.id), `${theme} ${x.id}`).toBe(solid)
      }
      for (const p of [{ x: -8, z: 0 }, { x: 0, z: 0 }, { x: 8, z: 0 }, { x: -6, z: 16 }, { x: 6, z: -16 }]) expect(placementBlockers(state, p, 0.8), `${theme} ${p.x},${p.z}`).toHaveLength(0)
    }
  })

  it('TERRAIN-006 flat pieces use existing rules types: roads are open ground, rubble is difficult cover, the puddle is difficult hazard', () => {
    const all = TERRAIN_THEMES.flatMap((th) => themedTerrain('box-1', th))
    const road = terrainTraits(all.find((x) => x.pieceId === 'asphalt-road-long')!)
    expect(road).toMatchObject({ rough: false, move: 'none', blocksLos: false, hazard: false, insideCover: 'none', cover: 'none' })
    const rubble = terrainTraits(all.find((x) => x.pieceId === 'rubble-patch')!)
    expect(rubble).toMatchObject({ rough: true, insideCover: 'cover', hazard: false, move: 'none' })
    const puddle = terrainTraits(all.find((x) => x.pieceId === 'radioactive-puddle')!)
    expect(puddle).toMatchObject({ rough: true, hazard: true, move: 'none', hazardSpec: { pow: 6, damageType: 'radiation' } })
    expect(TERRAIN_CATALOG['asphalt-road-short']).toMatchObject({ w: 8, d: 3 })
  })

  it('TERRAIN-007 createGame dresses the open skirmish with the theme; scenarios with their own terrain ignore it', () => {
    for (const theme of TERRAIN_THEMES as readonly TerrainTheme[]) {
      const g = createGame(bundle, { seed: 's', scenarioId: 'box-1', theme })
      expect(g.terrain.filter((t) => t.props['theme'] === theme).length).toBe(themedTerrain('box-1', theme).length)
      expect(g.terrain.some((t) => t.pieceId === 'collapsed-house-corner')).toBe(false)
      expect(g.markers.filter((m) => m.face === 'power-armor-suit').map((m) => m.pos.x).sort((a, b) => a - b)).toEqual([-8, 0, 8])
      for (const m of Object.values(g.models)) expect(placementBlockers(g, m.pos, 0.5), m.id).toHaveLength(0)
    }
    const plain = createGame(bundle, { seed: 's', scenarioId: 'box-1' })
    expect(plain.terrain.filter((t) => t.rulesType === 'building')).toHaveLength(6)
    const own = createGame(bundle, { seed: 's', scenarioId: 'box-3', theme: 'junkyard' })
    expect(own.terrain.some((t) => t.props['theme'])).toBe(false)
    expect(own.terrain.some((t) => t.pieceId === 'school-wall')).toBe(true)
    expect(themeFits(bundle.records.scenarios.find((s) => s.id === 'box-1')!)).toBe(true)
    expect(themeFits(bundle.records.scenarios.find((s) => s.id === 'ga-1')!)).toBe(false)
  })

  it('TERRAIN-008 the same seed and theme give identical terrain', () => {
    const a = createGame(bundle, { seed: 'x', scenarioId: 'box-1', theme: 'suburbs' })
    const b = createGame(bundle, { seed: 'x', scenarioId: 'box-1', theme: 'suburbs' })
    expect(a.terrain).toEqual(b.terrain)
  })
})
