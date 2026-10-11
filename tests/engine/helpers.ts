import type { GameState, ModelState, TerrainInstance, TerrainRulesType } from '../../src/engine/types'

export function mdl(id: string, x: number, z: number, o: Partial<ModelState> = {}): ModelState {
  return { id, profileId: 'p', owner: 'A', pos: { x, z }, elev: 0, base: 32, life: 'active', conditions: [], ...o }
}
export function ter(
  id: string, rulesType: TerrainRulesType, x: number, z: number, w: number, d: number, height: number, props: Record<string, unknown> = {},
): TerrainInstance {
  return { id, pieceId: id, rulesType, pos: { x, z }, rot: 0, footprint: { rect: { w, d } }, height, props }
}
export function world(models: ModelState[], terrain: TerrainInstance[] = [], clouds: GameState['clouds'] = []): GameState {
  return {
    models: Object.fromEntries(models.map((m) => [m.id, m])), terrain, clouds,
    scenario: { table: { w: 36, d: 36 } },
  } as unknown as GameState
}
