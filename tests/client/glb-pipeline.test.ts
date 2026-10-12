import { describe, expect, it } from 'vitest'
import { modeOfWeapon, pickEquipped } from '../../src/client/figures/equipped'
import { parseManifest, socketFor } from '../../src/client/figures/glbModels'
import { fitFigure } from '../../src/client/figures/GlbBody'
import { parseTerrainManifest, terrainEntryFor } from '../../src/client/board/terrainGlb'
import { planFit } from '../../src/client/board/terrainFit'

describe('glb pipeline', () => {
  it('manifest parsing lists only valid slugs and picks sockets by base size', () => {
    const m = parseManifest({ sockets: { defaults: { '25': { rightHand: [1, 2, 3] }, '40': { rightHand: [4, 5, 6] } } }, units: { 'a-b': { height: 2 }, 'bad slug!': {} }, weapons: { laser: {} } })
    expect(Object.keys(m.units)).toEqual(['a-b'])
    expect(socketFor(m, 'x', 38).rightHand).toEqual([4, 5, 6])
    expect(socketFor(parseManifest(null), 'x', 25).rightHand).toHaveLength(3)
    expect(fitFigure([-1, 2, -1], [1, 4, 1], 1.5).scale).toBeCloseTo(0.75)
  })
  it('equips ranged unless engaged, falling back to whatever is carried', () => {
    const c = [{ uid: 'a', defId: 'knife', kind: 'weapon' }, { uid: 'b', defId: 'rifle', kind: 'weapon' }] as never
    const modeOf = (d: string) => modeOfWeapon(d === 'knife' ? { dice: { melee: {} } } : { dice: { long: {} } })
    expect(pickEquipped(c, modeOf, 'ranged')).toBe('rifle')
    expect(pickEquipped(c, modeOf, 'melee')).toBe('knife')
    expect(pickEquipped([], modeOf, 'ranged')).toBeUndefined()
  })
  it('terrain manifest matches pieceId with or without the terrain. prefix and fits within the footprint', () => {
    const tm = parseTerrainManifest({ pieces: { wall: { file: 'wall-v2.glb' } } })
    expect(terrainEntryFor(tm, 'terrain.wall')?.file).toBe('wall-v2.glb')
    expect(terrainEntryFor(tm, 'terrain.rock')).toBeUndefined()
    const p = planFit('w1', { rect: { w: 4, d: 2 } }, 0, 1, [10, 5, 3])
    expect(p.size[0]).toBeLessThanOrEqual(4.01)
    expect(p.size[2]).toBeLessThanOrEqual(2.01)
  })
})
