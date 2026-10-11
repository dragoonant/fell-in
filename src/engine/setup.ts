// Game setup. For M0 this builds a demo table only: 4 placeholder models and a few terrain pieces.
// TODO(M1/M2): createGame(bundle, scenario, seats, seed) from the data bundle and scenario files.
import { seedRng } from './rng'
import type { GameState, ModelState, SeatId, TerrainInstance } from './types'

export const TABLE_IN = 36 // 3 ft square

const model = (id: string, owner: SeatId, x: number, z: number, base: number): ModelState => ({
  id, profileId: `placeholder-${base}`, owner, pos: { x, z }, elev: 0, base, life: 'active', conditions: [],
})
const rect = (id: string, rulesType: TerrainInstance['rulesType'], x: number, z: number, w: number, d: number, height: number, rot = 0): TerrainInstance =>
  ({ id, pieceId: id, rulesType, pos: { x, z }, rot, footprint: { rect: { w, d } }, height, props: {} })

export function createDemoGame(seed = 'demo'): GameState {
  return {
    seed,
    rng: seedRng(seed),
    rollSeq: 0,
    decisionSeq: 1,
    models: Object.fromEntries([
      model('p1', 'A', -9, 13, 25),
      model('p2', 'A', -3, 14, 32),
      model('e1', 'B', 6, -13, 40),
      model('e2', 'B', 12, -11, 40),
    ].map((m) => [m.id, m])),
    terrain: [
      rect('crates', 'obstacle', -8, 2, 4, 3, 2.5, 0.3),
      rect('wall', 'obstacle', 5, 0, 10, 1.2, 4, -0.2),
      rect('wreck', 'obstruction', -2, -7, 6, 2.6, 2.4, 0.5),
      { id: 'barrels', pieceId: 'barrels', rulesType: 'obstacle', pos: { x: 11, z: 8 }, rot: 0, footprint: { circle: { r: 1.6 } }, height: 2.2, props: {} },
      rect('rubble', 'rubble', -13, -9, 6, 5, 0.8),
    ],
    clouds: [],
    scenario: { table: { w: TABLE_IN, d: TABLE_IN } },
    pending: { id: 'd:1', seat: 'A', kind: 'idle', context: {}, options: [{ id: 'pass', label: 'Pass', action: { type: 'pass', decisionId: 'd:1', seat: 'A' } }], canPass: true },
    log: [],
  }
}
