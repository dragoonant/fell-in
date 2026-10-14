// Terrain piece catalog. Mirrors public/assets/models/terrain/manifest.json (slug -> footprint w x d in inches, height,
// rules type). The engine must not import from public/, so keep this table in sync by hand when the manifest changes.
import type { TerrainInstance } from './types'

type RT = TerrainInstance['rulesType']
export interface TerrainPiece { w: number; d: number; h: number; rulesType: RT }

export const TERRAIN_CATALOG: Record<string, TerrainPiece> = {
  'ruined-brick-wall': { w: 6, d: 1, h: 3.5, rulesType: 'obstruction' },
  'collapsed-house-corner': { w: 7, d: 6, h: 5, rulesType: 'building' },
  'rusted-sedan-wreck': { w: 5, d: 2.4, h: 1.8, rulesType: 'obstacle' },
  'burnt-bus-wreck': { w: 10, d: 3, h: 3.2, rulesType: 'obstacle' },
  'oil-drum-cluster': { w: 2.5, d: 2.5, h: 1.4, rulesType: 'obstacle' },
  'wooden-crate-stack': { w: 3, d: 2, h: 2, rulesType: 'obstacle' },
  'concrete-jersey-barrier': { w: 4, d: 1, h: 1.2, rulesType: 'obstacle' },
  'scrap-metal-fence': { w: 6, d: 0.6, h: 2.5, rulesType: 'obstruction' },
  'shipping-container-rusted': { w: 8, d: 3.2, h: 3.2, rulesType: 'obstruction' },
  'junk-pile': { w: 4, d: 4, h: 1.8, rulesType: 'rough' },
  'tire-stack': { w: 2, d: 1.75, h: 1.6, rulesType: 'obstacle' },
  'fuel-pump-island': { w: 5, d: 2.5, h: 3, rulesType: 'obstacle' },
  'water-tower-short': { w: 4, d: 4, h: 7, rulesType: 'obstruction' },
  'dead-tree': { w: 3, d: 3, h: 5, rulesType: 'rough' },
  'sandbag-wall': { w: 4, d: 1.2, h: 1.2, rulesType: 'obstacle' },
  // Scenario pieces without a model (drawn procedurally): school walls (box-3 lengths come from the data) and flat hazard zones (GA-1).
  'school-wall': { w: 6, d: 0.6, h: 3, rulesType: 'obstruction' },
  'hazard-zone': { w: 6, d: 4, h: 0.1, rulesType: 'hazard' },
  // The Red Rocket scenario's roadside diner (a low flat-roofed building, no model yet: drawn procedurally).
  'diner': { w: 8, d: 6, h: 3.5, rulesType: 'building' },
}

/** [slug, x, z, rot] for one half of the table (z > 0); the other half is the 180 degree mirror. Deploy edges and the centre line stay clear. */
type Placement = [string, number, number, number]

const LAYOUTS: Record<string, Placement[]> = {
  street: [
    ['collapsed-house-corner', -9, 8.5, 0], ['rusted-sedan-wreck', 6, 7, 0.2], ['ruined-brick-wall', -1, 4.5, 0],
    ['concrete-jersey-barrier', 10.5, 4.5, 0.3], ['oil-drum-cluster', 2.5, 9.5, 0], ['tire-stack', 13, 9, 0],
  ],
  salvage: [
    ['shipping-container-rusted', -8, 7, 0], ['junk-pile', 5, 9, 0], ['wooden-crate-stack', -1, 4.5, 0.1],
    ['scrap-metal-fence', 7, 4.5, 0], ['tire-stack', 12.5, 6, 0], ['oil-drum-cluster', 13, 9.5, 0],
  ],
  quest: [
    ['water-tower-short', -10, 9, 0], ['dead-tree', -1, 9.5, 0], ['ruined-brick-wall', -6, 4.5, 0],
    ['scrap-metal-fence', 5, 4.5, 0], ['collapsed-house-corner', 11, 8.5, 0], ['sandbag-wall', 3, 7.5, 0],
  ],
  station: [
    ['burnt-bus-wreck', -6, 8, 0], ['fuel-pump-island', 7, 6.5, 0], ['concrete-jersey-barrier', -1, 4.5, 0],
    ['rusted-sedan-wreck', 12.5, 10.5, Math.PI / 2], ['oil-drum-cluster', 2, 10, 0], ['tire-stack', 5, 10.5, 0], ['sandbag-wall', -12, 4.5, 0],
  ],
  revenge: [
    ['collapsed-house-corner', -11, 9, 0], ['shipping-container-rusted', 7, 8, 0.1], ['junk-pile', -3, 6.5, 0],
    ['concrete-jersey-barrier', 2.5, 4.2, 0], ['oil-drum-cluster', -6.5, 4.5, 0], ['dead-tree', 13, 4.5, 0], ['ruined-brick-wall', 2, 11, 0],
  ],
}

const BY_SCENARIO: Record<string, string> = { 'box-1': 'street', 'box-2': 'salvage', 'box-3': 'quest', 'box-4': 'station', 'box-5': 'revenge' }

/** Themed, mirror-balanced terrain for a scenario (default: the ruined suburb street). */
export function themedTerrain(scenarioId: string): TerrainInstance[] {
  const half = LAYOUTS[BY_SCENARIO[scenarioId] ?? 'street']!
  const out: TerrainInstance[] = []
  for (const mirror of [false, true]) {
    half.forEach(([slug, x, z, rot], i) => {
      const p = TERRAIN_CATALOG[slug]!
      const id = `${slug}-${mirror ? 'f' : 'n'}${i + 1}`
      out.push({
        id, pieceId: slug, rulesType: p.rulesType, pos: mirror ? { x: -x, z: -z } : { x, z }, rot: mirror ? rot + Math.PI : rot,
        footprint: { rect: { w: p.w, d: p.d } }, height: p.h, props: {},
      })
    })
  }
  return out
}
