import { describe, expect, it } from 'vitest'
import type { DiceDef } from '../../src/data/types'
import { appliedDist, applyDirectDamage, applyHit, armorOf, damageDistribution, healthOf, heal, lowerOf, type ArmorRating, type Hit } from '../../src/engine/damage'
import type { GameState, ModelState } from '../../src/engine/types'
import { duel, loadBundle, patchBundle } from './helpers'

const base = loadBundle()
/** A bundle whose red armor die has the given faces, for exact tests. */
const armorDie = (faces: number[]) => { const d: DiceDef = structuredClone(base.singletons.dice!); d.armor = faces; return patchBundle(base, { dice: d }) }
const unit = (u: string) => duel({ target: { unit: u, count: 1, items: [] } })
const patch = (s: GameState, id: string, p: Partial<ModelState>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...p } } })
const hit = (targetId: string, o: Partial<Hit> = {}): Hit => ({ targetId, damage: [{ type: 'physical', value: 3 }], dmg: 0, ar: 0, cover: false, ...o })

describe('armor rolls', () => {
  it('DMG-001/ARM-001 base plus DMG icons; a roll at or under the rating blocks the rolled amount', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(state, armorDie([1]), hit(targetId, { dmg: 1 }))
    expect(r.report.perType[0]).toMatchObject({ total: 4, rating: 1, roll: 1, blocked: 1, applied: 3 })
    expect(r.state.models[targetId]!.damage).toBe(3)
  })

  it('ARM-001 a roll above the rating blocks nothing', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(state, armorDie([4]), hit(targetId))
    expect(r.report.perType[0]).toMatchObject({ roll: 4, blocked: 0, applied: 3 })
  })

  it('ARM-002 Strong always blocks its fixed amount', () => {
    const { state, targetId } = unit('deathclaw')
    const r = applyHit(state, armorDie([4]), hit(targetId))
    expect(r.report.perType[0]!.applied).toBe(2)
  })

  it('ARM-003 only one Strong bonus applies, whatever the boost count', () => {
    const { state, targetId } = unit('settler')
    const boosted = patch(state, targetId, { armorBoost: 3 })
    expect(armorOf(boosted, base, targetId, 'physical').strong).toBe(1)
    expect(applyHit(boosted, armorDie([4]), hit(targetId)).report.perType[0]!.applied).toBe(2)
  })

  it('ARM-004 each AR icon lowers the rating; at 0 no roll is made', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(state, armorDie([1]), hit(targetId, { ar: 1 }))
    expect(r.report.perType[0]).toMatchObject({ rating: 0, roll: null, applied: 3 })
    expect(r.state.rollSeq).toBe(state.rollSeq)
  })

  it('ARM-004 cover adds to the rating', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(state, armorDie([2]), hit(targetId, { cover: true }))
    expect(r.report.perType[0]).toMatchObject({ rating: 2, roll: 2, blocked: 2, applied: 1 })
  })

  it('ARM-005 one armor boost is spent after every hit, even a useless one', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(patch(state, targetId, { armorBoost: 2 }), armorDie([4]), hit(targetId, { damage: [{ type: 'radiation', value: 1 }] }))
    expect(r.state.models[targetId]!.armorBoost).toBe(1)
  })

  it('ARM-006 "X" is immune and "-" gets no roll', () => {
    const mutant = unit('super-mutant')
    const rad = applyHit(mutant.state, base, hit(mutant.targetId, { damage: [{ type: 'radiation', value: 3 }] }))
    expect(rad.report.applied).toBe(0)
    expect(rad.state.models[mutant.targetId]!.rad).toBe(0)
    const settler = unit('settler')
    const none = applyHit(settler.state, base, hit(settler.targetId, { damage: [{ type: 'radiation', value: 2 }], cover: true }))
    expect(none.report.perType[0]).toMatchObject({ rating: 0, roll: null, applied: 2 })
  })

  it('DMG-008 lower-of weapons compare the ratings without Strong; ties keep the better Strong', () => {
    const r = (b: number, strong = 0): ArmorRating => ({ base: b, strong, immune: false, has: true })
    expect(lowerOf(r(3), r(1))).toEqual(r(1))
    expect(lowerOf(r(2), r(2, 1))).toEqual(r(2, 1))
  })

  it('DMG-002 each damage type resolves against its own armor', () => {
    const { state, targetId } = unit('sole-survivor')
    const r = applyHit(state, armorDie([4]), hit(targetId, { damage: [{ type: 'physical', value: 3 }, { type: 'radiation', value: 2 }] }))
    expect(r.report.perType.map((t) => [t.type, t.rating])).toEqual([['physical', 3], ['radiation', 1]])
  })
})

describe('health, tokens and removal', () => {
  it('DMG-003 tokens at Health remove the model; DMG-006 tookDamage needs applied damage', () => {
    const { state, targetId } = unit('settler')
    expect(healthOf(state, base, targetId)).toBe(4)
    const down = applyHit(patch(state, targetId, { damage: 1 }), base, hit(targetId, { ignoreArmor: true }))
    expect(down.report).toMatchObject({ applied: 3, tookDamage: true, removed: true })
    expect(down.state.models[targetId]!.life).toBe('dead')
    const blocked = applyHit(state, armorDie([1]), hit(targetId, { damage: [{ type: 'physical', value: 1 }] }))
    expect(blocked.report.tookDamage).toBe(false)
  })

  it('DMG-004 radiation flips regular tokens first, then adds radiation tokens', () => {
    const { state, targetId } = unit('settler')
    const r = applyHit(patch(state, targetId, { damage: 1 }), base, hit(targetId, { damage: [{ type: 'radiation', value: 2 }] }))
    expect(r.state.models[targetId]).toMatchObject({ damage: 0, rad: 2 })
  })

  it('RAD-001/002 healing removes regular tokens only; radiation flips back to regular', () => {
    const { state, targetId } = unit('settler')
    const s2 = patch(state, targetId, { damage: 1, rad: 2 })
    expect(heal(s2, base, targetId, { regular: 5 }).models[targetId]).toMatchObject({ damage: 0, rad: 2 })
    expect(heal(s2, base, targetId, { rad: 1 }).models[targetId]).toMatchObject({ damage: 2, rad: 1 })
  })

  it('PA-001 damage fills the Power Armor card, then it degrades and the rest goes to the model', () => {
    const { state, targetId } = unit('aspirant-goddard')
    expect(state.models[targetId]!.carried.some((c) => c.defId === 't-60-power-armor')).toBe(true)
    expect(healthOf(state, base, targetId)).toBe(8)
    const r = applyHit(state, base, hit(targetId, { damage: [{ type: 'physical', value: 5 }], ignoreArmor: true }))
    const after = r.state.models[targetId]!
    expect(after.carried.find((c) => c.defId === 't-60-power-armor')).toMatchObject({ degraded: true, paDamage: 0 })
    expect(after.damage).toBe(1)
    expect(healthOf(r.state, base, targetId)).toBe(4)
  })

  it('PA-005 poison goes to the model, not the card; ARM-007 On Fire is blocked by Strong only', () => {
    const pa = unit('aspirant-goddard')
    const p = applyDirectDamage(pa.state, base, pa.targetId, 1, { reason: 'poison' })
    expect(p.state.models[pa.targetId]!.damage).toBe(1)
    const claw = unit('deathclaw')
    expect(applyDirectDamage(claw.state, base, claw.targetId, 1, { strongBlocks: true, reason: 'onFire' }).applied).toBe(0)
  })
})

describe('exact odds', () => {
  it('ARM-001 applied-damage distribution matches the die', () => {
    const d = appliedDist(base, 3, { base: 2, strong: 0, immune: false, has: true }, 0, false)
    // faces 1 (4/12) and 2 (3/12) block themselves; the other 5/12 apply all 3
    expect(d[3]).toBeCloseTo(5 / 12)
    expect(d[2]).toBeCloseTo(4 / 12)
    expect(d[1]).toBeCloseTo(3 / 12)
  })

  it('DMG-001 damageDistribution is conditioned on a hit and sums to 1', () => {
    const { state, targetId } = unit('settler')
    const exact = damageDistribution(state, armorDie([1]), targetId, { damage: [{ type: 'physical', value: 3 }], onHit: [{ dmg: 0, ar: 0, p: 0.25 }], cover: false })
    expect(exact).toEqual([0, 0, 1, 0])
    const mixed = damageDistribution(state, base, targetId, { damage: [{ type: 'physical', value: 3 }], onHit: [{ dmg: 0, ar: 0, p: 0.1 }, { dmg: 1, ar: 1, p: 0.3 }], cover: false })
    expect(mixed.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})
