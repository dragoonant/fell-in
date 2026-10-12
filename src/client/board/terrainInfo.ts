// Terrain tooltip text, in our own words, from the engine's own traits for the piece (no rules number of ours is computed).
import type { TerrainInstance } from '../../engine/types'
import { terrainTraits } from '../../engine/terrain'

export interface TerrainInfo { kind: string; lines: string[] }

const KIND: Record<string, string> = {
  obstacle: 'Obstacle', obstruction: 'Obstruction', building: 'Building', forest: 'Forest', shallowWater: 'Shallow water', deepWater: 'Deep water',
  rough: 'Rough ground', rubble: 'Rubble', hill: 'Hill', trench: 'Trench', hazard: 'Hazard', scenarioTerrain: 'Scenario terrain',
}

export function terrainInfo(t: TerrainInstance): TerrainInfo {
  const tr = terrainTraits(t)
  const lines: string[] = []
  if (tr.move === 'impassable') lines.push('Nobody can walk through it.')
  else if (tr.move === 'obstacle') lines.push('Low enough to climb over, at a cost in movement.')
  if (tr.rough) lines.push('Rough going: crossing it slows a model down.')
  if (tr.blocksLos) lines.push(`Blocks sight to anything it stands taller than (${tr.height}" high).`)
  if (tr.forest) lines.push('Thick growth: sight fades out with depth.')
  if (tr.cover !== 'none') lines.push(tr.cover === 'cover' ? 'A model tucked against it can fight from cover.' : 'A model tucked against it is partly hidden.')
  if (tr.insideCover !== 'none') lines.push(tr.insideCover === 'cover' ? 'A model standing wholly inside it has cover.' : 'A model standing wholly inside it is partly hidden.')
  if (tr.elevation > 0) lines.push(`Standing on top raises a model ${tr.elevation}".`)
  if (tr.hazard) lines.push('Dangerous ground: a model that enters or stays in it risks harm.')
  if (tr.resist.length) lines.push(`Models wholly inside resist ${tr.resist.join(', ')}.`)
  if (!lines.length) lines.push('Open ground.')
  if (t.rulesType === 'scenarioTerrain') lines.push('The scenario gives this piece a job of its own.')
  return { kind: KIND[t.rulesType] ?? 'Terrain', lines }
}
