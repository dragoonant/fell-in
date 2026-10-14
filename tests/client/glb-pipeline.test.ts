import { describe, expect, it } from 'vitest'
import { modeOfWeapon, pickEquipped, weaponClassOf } from '../../src/client/figures/equipped'
import { aimedPose, heldPose, parseManifest, poseFor, socketFor } from '../../src/client/figures/glbModels'
import { fitFigure } from '../../src/client/figures/GlbBody'
import { parseTerrainManifest, terrainEntryFor } from '../../src/client/board/terrainGlb'
import { objectKind } from '../../src/client/figures/ObjectModels'
import { proceduralLook } from '../../src/client/figures/Procedural'
import { planFit } from '../../src/client/board/terrainFit'

describe('glb pipeline', () => {
  it('manifest parsing lists only valid slugs and picks sockets by base size', () => {
    const m = parseManifest({ sockets: { defaults: { '25': { rightHand: [1, 2, 3] }, '40': { rightHand: [4, 5, 6] } } }, units: { 'a-b': { height: 2 }, 'bad slug!': {} }, weapons: { laser: {} } })
    expect(Object.keys(m.units)).toEqual(['a-b'])
    expect(socketFor(m, 'x', 38)?.hand).toEqual([4, 5, 6])
    expect(socketFor(m, 'a-b', 32)).toBeUndefined() // listed GLB unit without a hand holds nothing
    expect(socketFor(parseManifest(null), 'x', 25)?.hand).toHaveLength(3)
    expect(fitFigure([-1, 2, -1], [1, 4, 1], 1.5).scale).toBeCloseTo(0.75)
  })
  it('equips ranged unless engaged, falling back to whatever is carried', () => {
    const c = [{ uid: 'a', defId: 'knife', kind: 'weapon' }, { uid: 'b', defId: 'rifle', kind: 'weapon' }] as never
    const modeOf = (d: string) => modeOfWeapon(d === 'knife' ? { dice: { melee: {} } } : { dice: { long: {} } })
    expect(pickEquipped(c, modeOf, 'ranged')).toBe('rifle')
    expect(pickEquipped(c, modeOf, 'melee')).toBe('knife')
    expect(pickEquipped([], modeOf, 'ranged')).toBeUndefined()
    const beast = [{ uid: 'a', defId: 'deathclaw-swipe', kind: 'weapon' }, { uid: 'b', defId: 'dog-bite', kind: 'weapon' }] as never
    expect(pickEquipped(beast, modeOf, 'melee')).toBeUndefined() // natural attacks draw nothing
  })
  it('terrain manifest matches pieceId with or without the terrain. prefix and fits within the footprint', () => {
    const tm = parseTerrainManifest({ pieces: { wall: { file: 'wall-v2.glb' } } })
    expect(terrainEntryFor(tm, 'terrain.wall')?.file).toBe('wall-v2.glb')
    expect(terrainEntryFor(tm, 'terrain.rock')).toBeUndefined()
    const p = planFit('w1', { rect: { w: 4, d: 2 } }, 0, 1, [10, 5, 3])
    expect(p.size[0]).toBeLessThanOrEqual(4.01)
    expect(p.size[2]).toBeLessThanOrEqual(2.01)
    expect(p.sx).toBe(p.sy)
    expect(p.sz).toBe(p.sy)
    const tire = planFit('t1', { circle: { r: 1 } }, 0, 1.4, [2, 1, 2])
    expect(tire.sx).toBe(tire.sy) // uniform: a tire stack is never stretched
  })
  it('objects manifest key and face kinds', () => {
    const m = parseManifest({ objects: { 'red-rocket': { file: 'objects/red-rocket.glb', lengthIn: 4, yaw: 1 }, 'bad slug!': {} } })
    expect(m.objects['red-rocket']).toEqual({ file: 'objects/red-rocket.glb', lengthIn: 4, yaw: 1 })
    expect(Object.keys(m.objects)).toEqual(['red-rocket'])
    expect(objectKind('red-rocket')).toBe('red-rocket')
    expect(objectKind('power-armor')).toBe('power-armor-suit')
    expect(objectKind('nuke')).toBe('mini-nuke')
    expect(objectKind('zzz')).toBe('unknown')
    expect(proceduralLook('paladin')).toBe('power')
    expect(proceduralLook('knight')).toBe('armor')
    expect(proceduralLook('turret')).toBe('turret')
    expect(proceduralLook('settler')).toBe('plain')
  })
  it('classifies weapons into hold classes', () => {
    expect(weaponClassOf('10mm-pistol', { short: 'blue' })).toBe('pistol')
    expect(weaponClassOf('pipe-pistol', { short: 'black' })).toBe('pistol')
    expect(weaponClassOf('44-revolver', { short: 'blue' })).toBe('pistol')
    expect(weaponClassOf('hunting-rifle', { short: 'blue', long: 'black' })).toBe('long')
    expect(weaponClassOf('combat-shotgun', { short: 'red', long: 'blue' })).toBe('long')
    expect(weaponClassOf('laser-rifle', { short: 'black', long: 'black' })).toBe('long')
    expect(weaponClassOf('missile-launcher', { short: 'black', long: 'black', heavy: true })).toBe('heavy')
    expect(weaponClassOf('minigun')).toBe('heavy')
    expect(weaponClassOf('fragmentation-grenade', { short: 'throw', grenade: true })).toBe('thrown')
    expect(weaponClassOf('sledgehammer', { dice: { melee: {} } })).toBe('melee2')
    expect(weaponClassOf('board', { dice: { melee: {} } })).toBe('melee2')
    expect(weaponClassOf('machete', { dice: { melee: {} } })).toBe('melee1')
    expect(weaponClassOf('baseball-bat', { dice: { melee: {} } })).toBe('melee1')
    expect(weaponClassOf('laser-rifle')).toBe('long') // no record: name fallback
  })
  it('hold poses: pistol unchanged, long gun braced level and forward (muzzle never raised), manifest rot wins', () => {
    const hand: [number, number, number] = [0.4, 1.3, 0.25]
    const pp = heldPose('pistol', hand, undefined)
    expect(pp.position).toEqual(hand)
    pp.rotation.forEach((r) => expect(Math.abs(r)).toBeLessThan(1e-9))
    const lg = heldPose('long', hand, undefined)
    expect(lg.position[0]).toBeLessThan(hand[0]) // stock side pulled toward the body
    expect(Math.abs(lg.rotation[0])).toBeLessThan(0.1) // barrel level, not pitched up
    expect(lg.position[1]).toBeLessThanOrEqual(hand[1]) // held at the chest or hip, not raised past the face
    expect(heldPose('long', hand, [1, 2, 3])).toEqual({ position: hand, rotation: [1, 2, 3] })
  })
})

describe('pose pilot', () => {
  it('parses poses and tolerates malformed entries', () => {
    const m = parseManifest({ units: { a: { hand: [0, 1, 0], poses: {
      long: { file: 'units/a@long.glb', hand: [0.3, 1, 0.2], support: [0.1, 1, 0.8], yaw: 0.5 },
      heavy: { file: '../x.glb', hand: [0, 0, 0], support: [0, 0, 1] },
      melee2: { file: 'units/a@m.glb', hand: [0, 0] },
      bogus: { file: 'units/b.glb', hand: [0, 0, 0], support: [0, 0, 1] } } }, b: { poses: 5 } } })
    expect(poseFor(m, 'a', 'long')).toEqual({ file: 'units/a@long.glb', hand: [0.3, 1, 0.2], support: [0.1, 1, 0.8], yaw: 0.5 })
    expect(poseFor(m, 'a', 'heavy')).toBeUndefined()
    expect(poseFor(m, 'a', 'melee2')).toBeUndefined()
    expect(m.units.b?.poses).toBeUndefined()
    expect(poseFor(m, 'a', undefined)).toBeUndefined()
  })
  it('aimedPose points +z from hand to support with up kept up', () => {
    const p = aimedPose([0, 1, 0], [0, 1, 2])
    expect(p.position).toEqual([0, 1, 0])
    p.rotation.forEach((r) => expect(Math.abs(r)).toBeLessThan(1e-9))
    const q = aimedPose([0, 1, 0], [1, 1, 0]) // aim along +x: yaw +90 degrees
    expect(q.rotation[1]).toBeCloseTo(Math.PI / 2)
    const up = aimedPose([0, 0, 0], [0, 1, 1]) // aim up-forward: pitch barrel up (negative x rotation)
    expect(up.rotation[0]).toBeCloseTo(-Math.PI / 4)
  })
})
