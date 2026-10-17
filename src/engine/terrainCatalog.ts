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
  // Themed board pieces (M5). Suburbs:
  'ruined-house-shell': { w: 8, d: 7, h: 6, rulesType: 'building' },
  'collapsed-garage': { w: 6, d: 5, h: 3.5, rulesType: 'building' },
  'picket-fence-run': { w: 6, d: 0.4, h: 1.3, rulesType: 'obstacle' },
  'mailbox-row': { w: 3, d: 0.6, h: 1.5, rulesType: 'obstacle' },
  'rusted-playground-frame': { w: 4, d: 3, h: 3, rulesType: 'obstruction' },
  'fallen-lamp-post': { w: 6, d: 1, h: 0.8, rulesType: 'obstacle' },
  // Red Rocket:
  'gas-pump-pair': { w: 2.5, d: 1.2, h: 2, rulesType: 'obstacle' },
  'service-bay-lift': { w: 4, d: 3, h: 2.5, rulesType: 'obstruction' },
  'roadside-billboard': { w: 6, d: 1, h: 5, rulesType: 'obstruction' },
  'tyre-mountain': { w: 4, d: 4, h: 2.2, rulesType: 'obstacle' },
  // Junkyard:
  'crushed-car-stack': { w: 5, d: 2.5, h: 4, rulesType: 'obstruction' },
  'scrap-press': { w: 4, d: 3, h: 3.5, rulesType: 'obstruction' },
  'scrap-wall-section': { w: 6, d: 0.8, h: 2.5, rulesType: 'obstruction' },
  'appliance-heap': { w: 3.5, d: 3, h: 2, rulesType: 'obstacle' },
  'rusted-crane-base': { w: 3, d: 3, h: 5, rulesType: 'obstruction' },
  // Flat pieces, always drawn procedurally (image-to-3D cannot make them). The roads are open ground (type 'rough' with
  // props.rough false: no rule applies); the rubble patch is difficult ground with cover; the puddle is difficult hazard ground.
  'asphalt-road-long': { w: 18, d: 3, h: 0.05, rulesType: 'rough' },
  'asphalt-road-short': { w: 8, d: 3, h: 0.05, rulesType: 'rough' },
  'rubble-patch': { w: 4, d: 3, h: 0.5, rulesType: 'rubble' },
  'radioactive-puddle': { w: 3.5, d: 2.8, h: 0.1, rulesType: 'hazard' },
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

// ---------- themed boards (M5) ----------
export type TerrainTheme = 'suburbs' | 'red-rocket' | 'junkyard'
export const TERRAIN_THEMES: readonly TerrainTheme[] = ['suburbs', 'red-rocket', 'junkyard']
export const asTerrainTheme = (v: unknown): TerrainTheme | null => (TERRAIN_THEMES.includes(v as TerrainTheme) ? (v as TerrainTheme) : null)

/** Half pieces are mirrored through the table centre; centre pieces are placed once, exactly as listed. */
interface ThemeLayout { half: Placement[]; centre: Placement[] }

// Half pieces keep every footprint inside |z| 3.2..11.8 (the edge strips, up to Red 6 in, stay clear) and |x| <= 16.5.
// Each quarter of the table holds at least one line-of-sight blocker. Centre pieces are flat or low, on the centre line.
export const THEME_LAYOUTS: Record<TerrainTheme, ThemeLayout> = {
  suburbs: {
    half: [
      ['ruined-house-shell', -10.5, 8.2, 0], ['collapsed-garage', 5.5, 9, -0.1], ['picket-fence-run', -2, 4.3, 0],
      ['rusted-playground-frame', 12.5, 6.5, 0.4], ['fallen-lamp-post', -11, 3.7, 0.04],
    ],
    centre: [['asphalt-road-long', 0, 0, 0], ['mailbox-row', -9, 2.2, 0], ['mailbox-row', 9, -2.2, Math.PI]],
  },
  'red-rocket': {
    half: [
      ['gas-pump-pair', 7, 4.6, 0], ['service-bay-lift', -9.5, 7, 0.1], ['roadside-billboard', 2, 10.5, 0],
      ['tyre-mountain', 12.5, 8.5, 0], ['concrete-jersey-barrier', -3, 4.6, 0.15],
    ],
    centre: [['asphalt-road-long', 0, 0, 0], ['radioactive-puddle', -12.5, 0.2, 0], ['radioactive-puddle', 12.5, -0.2, Math.PI]],
  },
  junkyard: {
    half: [
      ['crushed-car-stack', -8, 8.5, 0.12], ['scrap-press', 4, 6.8, -0.1], ['scrap-wall-section', -1.5, 4.2, 0],
      ['appliance-heap', 12, 4.8, 0.3], ['rusted-crane-base', 13, 10, 0], ['shipping-container-rusted', 5.5, 10.4, 0],
    ],
    centre: [['rubble-patch', -5, 0.3, 0.2], ['rubble-patch', 5, -0.3, 0.2 + Math.PI]],
  },
}

/** Props for the flat pieces. Roads are open ground; the puddle is difficult ground that hurts (radiation, POW 6). */
function pieceProps(slug: string, theme: TerrainTheme | null): Record<string, unknown> {
  const t = theme ? { theme } : {}
  if (slug.startsWith('asphalt-road')) return { ...t, rough: false, cover: false, flat: 'road' }
  if (slug === 'radioactive-puddle') return { ...t, rough: true, flat: 'puddle', hazard: { effect: [{ op: 'damage', pow: 6, damageType: 'radiation' }], on: ['enter', 'endActivation'] } }
  if (slug === 'rubble-patch') return { ...t, flat: 'rubble' }
  return t
}

const instance = (slug: string, id: string, x: number, z: number, rot: number, theme: TerrainTheme | null): TerrainInstance => {
  const p = TERRAIN_CATALOG[slug]!
  return { id, pieceId: slug, rulesType: p.rulesType, pos: { x, z }, rot, footprint: { rect: { w: p.w, d: p.d } }, height: p.h, props: pieceProps(slug, theme) }
}

/** Themed, mirror-balanced terrain: a named board theme, else the scenario's default street layout. */
export function themedTerrain(scenarioId: string, theme?: TerrainTheme | null): TerrainInstance[] {
  const out: TerrainInstance[] = []
  if (theme) {
    const lay = THEME_LAYOUTS[theme]
    for (const mirror of [false, true]) {
      lay.half.forEach(([slug, x, z, rot], i) => {
        out.push(instance(slug, `${slug}-${mirror ? 'f' : 'n'}${i + 1}`, mirror ? -x : x, mirror ? -z : z, mirror ? rot + Math.PI : rot, theme))
      })
    }
    lay.centre.forEach(([slug, x, z, rot], i) => out.push(instance(slug, `${slug}-c${i + 1}`, x, z, rot, theme)))
    return out
  }
  const half = LAYOUTS[BY_SCENARIO[scenarioId] ?? 'street']!
  for (const mirror of [false, true]) {
    half.forEach(([slug, x, z, rot], i) => {
      out.push(instance(slug, `${slug}-${mirror ? 'f' : 'n'}${i + 1}`, mirror ? -x : x, mirror ? -z : z, mirror ? rot + Math.PI : rot, null))
    })
  }
  return out
}

/**
 * True when a themed board can replace a scenario's own terrain: a 36 x 36 skirmish whose sides all deploy from named table
 * edges (or have no zone data), so the themed pieces never sit in a deploy zone. Scenarios with disc/box zones, tutorials,
 * AI and co-op scenarios keep their own terrain (their rules and objectives are laid out against it).
 */
export function themeFits(sc: { mode: string; tableIn: [number, number]; sides: { deploy: object }[]; terrain?: object[] }): boolean {
  if (sc.mode !== 'versus' || sc.tableIn[0] !== 36 || sc.tableIn[1] !== 36) return false
  return sc.sides.every((s) => {
    const z = (s.deploy as { zone?: { kind?: string; edges?: unknown } }).zone
    return !z || (z.kind === 'edges' && Array.isArray(z.edges))
  })
}
