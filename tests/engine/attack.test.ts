import { describe, expect, it, vi } from 'vitest'
import type { DiceDef, DieColour, Icon } from '../../src/data/types'
import { attack, attackPlan, coverOf, rangeBandOf, rangedWeapons, victimSlots } from '../../src/engine/attack'
import { skillOdds } from '../../src/engine/dice'
import { isRejection, type StepResult } from '../../src/engine/registry'
import type { Action, GameState, ModelState } from '../../src/engine/types'
import { duel, loadBundle, mdl, patchBundle, ter, type DuelOpts } from './helpers'

// Other owners' modules may still be stubs: stand in for the calls attack.ts makes into them.
const mocks = vi.hoisted(() => ({ hits: [] as any[], direct: [] as any[], conds: [] as string[] }))
vi.mock('../../src/engine/damage', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/damage')>()),
  applyHit: (s: GameState, _b: unknown, hit: any) => {
    mocks.hits.push(hit)
    return { state: s, report: { targetId: hit.targetId, perType: [], applied: hit.damage[0]?.value ?? 0, tookDamage: true, removed: false } }
  },
  applyDirectDamage: (s: GameState, _b: unknown, id: string, n: number, o: any) => {
    mocks.direct.push({ id, n, ...o })
    return { state: s, applied: n, removed: false }
  },
}))
vi.mock('../../src/engine/conditions', () => ({
  hasCondition: (m: { conditions: string[] }, c: string) => m.conditions.includes(c),
  conditionSvMods: () => [],
  addCondition: (s: GameState, _b: unknown, id: string, c: string) => { mocks.conds.push(id + ':' + c); return { state: s, added: true } },
  conditions: { id: 'conditions', kinds: ['cond'], options: () => [], resolve: () => ({ code: 'E_TODO', message: 'mock' }) },
}))
vi.mock('../../src/engine/items', async (orig) => ({ ...(await orig<typeof import('../../src/engine/items')>()), itemMods: () => [] }))
vi.mock('../../src/engine/movement', async (orig) => ({ ...(await orig<typeof import('../../src/engine/movement')>()), pushBack: (s: GameState) => ({ state: s, inches: 0 }) }))

const base = loadBundle()
type Faces = Partial<Record<DieColour, Icon[]>>
/** Skill die with one face and every effect die with one face, so rolls are exact. */
function fixed(skill: { value: number | 'X'; icons: Icon[] }, effect: Faces = {}) {
  const d: DiceDef = structuredClone(base.singletons.dice!)
  d.skill.faces = [skill]
  for (const c of ['black', 'green', 'yellow', 'blue'] as DieColour[]) d.effect[c] = [{ icons: effect[c] ?? [] }]
  return patchBundle(base, { dice: d })
}
const sure = (effect: Faces = {}) => fixed({ value: 1, icons: [] }, effect)

const R = (mm: number) => mm / 25.4 / 2
const TOUCH_SS = R(32) * 2 // centre gap of two touching 32 mm bases
const TOUCH_SM = R(32) + R(40) // a 32 mm base touching the 40 mm target
const rifleOf = (id: string) => `${id}/hunting-rifle`
const act = (s: GameState, a: Omit<Action, 'decisionId' | 'seat'> & { seat?: string }): Action => ({ ...a, decisionId: s.pending.id, seat: a.seat ?? 'A' }) as Action
const ok = (r: StepResult) => { if (isRejection(r)) throw new Error(`rejected: ${r.code} ${r.message}`); return r }
const patch = (s: GameState, p: Record<string, Partial<ModelState>>): GameState =>
  ({ ...s, models: { ...s.models, ...Object.fromEntries(Object.entries(p).map(([id, v]) => [id, { ...s.models[id]!, ...v }])) } })
const add = (s: GameState, ...ms: ModelState[]): GameState => ({ ...s, models: { ...s.models, ...Object.fromEntries(ms.map((m) => [m.id, m])) } })

/** Begin a shot and pick the first offered target. */
function shoot(s: GameState, b: ReturnType<typeof sure>, attackerId: string, weaponUid: string, extra: Record<string, unknown> = {}) {
  const r1 = ok(attack.resolve(s, b, act(s, { type: 'shoot.begin', modelId: attackerId, weaponUid, ...extra })))
  const pick = r1.state.pending.options[0]!.action
  return ok(attack.resolve(r1.state, b, pick))
}

describe('range bands', () => {
  const at = (distance: number, items = ['hunting-rifle']) => {
    const d = duel({ distance, attacker: { unit: 'sole-survivor', count: 1, items } })
    return { ...d, uid: rifleOf(d.attackerId) }
  }
  it('RANGE-003 distances are base-edge gaps and a target inside the short ruler is in the short band', () => {
    const d = at(8)
    const r = rangeBandOf(d.state, d.bundle, d.attackerId, d.targetId, d.uid)
    expect(r.band).toBe('short')
    expect(r.distance).toBeCloseTo(8 - 32 / 25.4 / 2 - 40 / 25.4 / 2, 5)
  })
  it('RANGE-004 long starts where short ends; RANGE-005 a base straddling the line lets the attacker choose; RANGE-006 no long band means out of range', () => {
    expect(rangeBandOf(at(12).state, base, at(12).attackerId, at(12).targetId, at(12).uid).band).toBe('long')
    const both = at(10.9)
    expect(rangeBandOf(both.state, base, both.attackerId, both.targetId, both.uid).band).toBe('both')
    const far = at(25)
    expect(rangeBandOf(far.state, base, far.attackerId, far.targetId, far.uid).band).toBeNull()
    const pistol = at(12, ['10mm-pistol'])
    expect(rangeBandOf(pistol.state, base, pistol.attackerId, pistol.targetId, `${pistol.attackerId}/10mm-pistol`).band).toBeNull()
  })
  it('RANGE-007 a thrown weapon reaches the thrower Throw colour', () => {
    const ok8 = duel({ distance: 9, attacker: { unit: 'sole-survivor', count: 1, items: ['fragmentation-grenade'] } })
    const uid = `${ok8.attackerId}/fragmentation-grenade`
    expect(rangeBandOf(ok8.state, base, ok8.attackerId, ok8.targetId, uid).band).toBe('short') // gap 7.6 <= 8
    const far = duel({ distance: 11, attacker: { unit: 'sole-survivor', count: 1, items: ['fragmentation-grenade'] } })
    expect(rangeBandOf(far.state, base, far.attackerId, far.targetId, `${far.attackerId}/fragmentation-grenade`).band).toBeNull()
  })
})

describe('cover', () => {
  const d = duel()
  const wall = (id: string, z: number, w = 6, depth = 0.5) => ter(id, 'obstacle', 0, z, w, depth, 1)
  const withTerrain = (...t: ReturnType<typeof ter>[]): GameState => ({ ...d.state, terrain: t })
  it('COVER-001 each object fully crossed by the line gives -2 SV, COVER-003 the armor bonus is once', () => {
    const c = coverOf(withTerrain(wall('w1', 0)), base, d.attackerId, d.targetId)
    expect(c.cover).toBe(true)
    expect(c.svMods.map((m) => m.value)).toEqual([-2])
    const two = coverOf(withTerrain(wall('w1', 1), wall('w2', -1)), base, d.attackerId, d.targetId)
    expect(two.count).toBe(2)
    expect(two.svMods.reduce((a, m) => a + m.value, 0)).toBe(-4)
    expect(two.armorBonus).toBe(1)
  })
  it('COVER-002 cover touching the shooter is ignored; a target standing on the object gets none', () => {
    expect(coverOf(withTerrain(wall('touch', 3.6)), base, d.attackerId, d.targetId).cover).toBe(false)
    expect(coverOf(withTerrain(wall('under', -4, 6, 2)), base, d.attackerId, d.targetId).cover).toBe(false)
  })
  it('COVER-004 area terrain only needs to be entered', () => {
    const rubble = ter('r', 'rubble', 0, -2.5, 6, 3, 0.6)
    expect(coverOf(withTerrain(rubble), base, d.attackerId, d.targetId).cover).toBe(true)
  })
  it('COVER-005 opposing models on the line give cover, friendly ones do not', () => {
    const foe = mdl('foe', 0, 0, { owner: 'B' })
    const friend = mdl('friend', 0, 0, { owner: 'A' })
    expect(coverOf(add(d.state, foe), base, d.attackerId, d.targetId).sources).toEqual(['foe'])
    expect(coverOf(add(d.state, friend), base, d.attackerId, d.targetId).cover).toBe(false)
  })
})

describe('shoot plan', () => {
  it('SHOT-001 needs range, line of sight and not being engaged', () => {
    const near = duel()
    expect(isRejection(attackPlan(near.state, base, near.attackerId, near.targetId))).toBe(false)
    const far = duel({ distance: 30 })
    expect(attackPlan(far.state, base, far.attackerId, far.targetId)).toMatchObject({ code: 'E_OUT_OF_RANGE' })
    const blocked = { ...near.state, terrain: [ter('b', 'building', 0, 0, 6, 2, 4)] }
    expect(attackPlan(blocked, base, near.attackerId, near.targetId)).toMatchObject({ code: 'E_NO_LOS' })
    const engaged = add(near.state, mdl('pal', 0, 4 - TOUCH_SS, { owner: 'B', base: 32 }))
    expect(attackPlan(engaged, base, near.attackerId, near.targetId)).toMatchObject({ code: 'E_ENGAGED' })
  })
  it('SHOT-002 the pool is the dice of the chosen band; SKILL-009 the shown odds are the exact enumeration', () => {
    const d = duel({ distance: 10.9 })
    const short = attackPlan(d.state, base, d.attackerId, d.targetId, { band: 'short' })
    const long = attackPlan(d.state, base, d.attackerId, d.targetId, { band: 'long' })
    if (isRejection(short) || isRejection(long)) throw new Error('rejected')
    expect(short.pool).toEqual({ yellow: 2 })
    expect(long.pool).toEqual({ green: 2 })
    expect(short.pHit).toBeCloseTo(skillOdds(base, short.sv, short.pool).pHit, 12)
    expect(short.breakdown[0]).toMatchObject({ source: 'base', value: 7 })
  })
  it('SHOT-006 shooting at an engaged model is +2 SV; quick actions are -2; cover is listed in the breakdown', () => {
    const d = duel()
    const plain = attackPlan(d.state, base, d.attackerId, d.targetId)
    const scrum = add(d.state, mdl('pal', 0, -4 + TOUCH_SM, { owner: 'A', base: 32 }))
    const into = attackPlan(scrum, base, d.attackerId, d.targetId)
    const quick = attackPlan(d.state, base, d.attackerId, d.targetId, { quick: true })
    const covered = attackPlan({ ...d.state, terrain: [ter('w', 'obstacle', 0, 0, 6, 0.5, 1)] }, base, d.attackerId, d.targetId)
    if ([plain, into, quick, covered].some(isRejection)) throw new Error('rejected')
    const sv = (p: unknown) => (p as { sv: number }).sv
    expect(sv(plain)).toBe(7)
    expect(sv(into)).toBe(9)
    expect(sv(quick)).toBe(5)
    expect(sv(covered)).toBe(5)
  })
  it('SHOT-007 a hit into melee numbers the target first, then models in contact with it, looping to four slots', () => {
    const d = duel()
    const pal = mdl('pal', 0, -4 + TOUCH_SM, { owner: 'A', base: 32 })
    const slots = victimSlots(add(d.state, pal), base, d.attackerId, d.targetId)
    expect(slots).toEqual([d.targetId, 'pal', d.targetId, 'pal'])
    expect(victimSlots(d.state, base, d.attackerId, d.targetId)).toEqual(Array(4).fill(d.targetId))
  })
  it('SHOT-004/005 heavy weapons fire once per activation and slow-firing ones need to be loaded; engaged models cannot shoot', () => {
    const d = duel({ attacker: { unit: 'super-mutant', count: 1, items: ['missile-launcher'] } })
    const uid = `${d.attackerId}/missile-launcher`
    expect(rangedWeapons(d.state, base, d.attackerId)).toEqual([uid])
    const spent = patch(d.state, { [d.attackerId]: { carried: d.state.models[d.attackerId]!.carried.map((c) => (c.uid === uid ? { ...c, loaded: false } : c)) } })
    expect(rangedWeapons(spent, base, d.attackerId)).toEqual([])
    const fired = { ...d.state, activation: { ...d.state.activation!, heavyFired: true } }
    expect(rangedWeapons(fired, base, d.attackerId)).toEqual([])
    const stuck = add(d.state, mdl('pal', 0, 4 - TOUCH_SS, { owner: 'B', base: 32 }))
    expect(rangedWeapons(stuck, base, d.attackerId)).toEqual([])
  })
})

describe('shoot resolution', () => {
  it('SHOT-001 a hit offers targets, rolls, and calls applyHit with the dice icons and base damage', () => {
    mocks.hits.length = 0
    const b = sure({ yellow: ['DMG', 'AR'] })
    const d = duel()
    const r = shoot(d.state, b, d.attackerId, rifleOf(d.attackerId))
    expect(r.done?.type).toBe('shoot.fire')
    expect(r.done?.triggers.map((t) => t.kind)).toEqual(['action', 'hit', 'damaged'])
    expect(mocks.hits).toHaveLength(1)
    expect(mocks.hits[0]).toMatchObject({ targetId: d.targetId, dmg: 2, ar: 2, cover: false, damage: [{ type: 'physical', value: 2 }] })
  })
  it('SKILL-005 a miss applies nothing but still pays the AP faces of the skill die, and AP is ignored on a Quick Action', () => {
    mocks.hits.length = 0
    const b = fixed({ value: 'X', icons: ['AP'] }, { yellow: ['DMG'] })
    const d = duel()
    const r = shoot(d.state, b, d.attackerId, rifleOf(d.attackerId))
    expect(mocks.hits).toHaveLength(0)
    expect(r.state.activation!.ap).toBe(1)
    const q = shoot({ ...d.state, action: { modelId: d.attackerId, type: 'shoot.begin', quick: true, reaction: false, free: false, itemUsed: false } }, b, d.attackerId, rifleOf(d.attackerId))
    expect(q.state.activation!.ap).toBe(0)
  })
  it('CRIT-002/004 a hit on an enemy adds 1 CP plus 1 per CP face, capped at the rating; CRIT-001 needs a Critical icon', () => {
    const b = fixed({ value: 1, icons: ['CP'] })
    const d = duel()
    const heroic = patch(d.state, { [d.attackerId]: { heroic: true } })
    const r = shoot(heroic, b, d.attackerId, rifleOf(d.attackerId))
    const cp = (s: GameState) => s.models[d.attackerId]!.carried.find((c) => c.uid === rifleOf(d.attackerId))!.cp
    expect(cp(r.state)).toBe(2)
    const again = shoot(r.state, b, d.attackerId, rifleOf(d.attackerId)) // pending is stale but the module does not read it for begin
    expect(cp(again.state)).toBe(3)
    expect(cp(shoot(d.state, b, d.attackerId, rifleOf(d.attackerId)).state)).toBe(0)
  })
  it('CRIT-005 a Critical Attack needs a full meter, skips the skill die, uses the critical damage and empties the meter', () => {
    mocks.hits.length = 0
    const b = fixed({ value: 'X', icons: [] }) // the skill die would auto-fail; a critical never rolls it
    const d = duel({ distance: 12 })
    const uid = rifleOf(d.attackerId)
    const full = (rating: number) => patch(d.state, { [d.attackerId]: { heroic: true, carried: d.state.models[d.attackerId]!.carried.map((c) => (c.uid === uid ? { ...c, cp: rating } : c)) } })
    const empty = patch(d.state, { [d.attackerId]: { heroic: true } })
    expect(attackPlan(empty, b, d.attackerId, d.targetId, { critical: true })).toMatchObject({ code: 'E_NOT_LEGAL' })
    const r = shoot(full(3), b, d.attackerId, uid, { critical: true })
    expect(mocks.hits[0]).toMatchObject({ critical: true, damage: [{ type: 'physical', value: 4 }] })
    expect(r.state.models[d.attackerId]!.carried.find((c) => c.uid === uid)!.cp).toBe(0)
    // longOnly: the rifle critical is refused in the short band
    const close = duel()
    const closeFull = patch(close.state, { [close.attackerId]: { heroic: true, carried: close.state.models[close.attackerId]!.carried.map((c) => (c.uid === uid.replace(d.attackerId, close.attackerId) ? { ...c, cp: 3 } : c)) } })
    expect(attackPlan(closeFull, b, close.attackerId, close.targetId, { critical: true })).toMatchObject({ code: 'E_NOT_LEGAL' })
  })
})

describe('luck', () => {
  const seeds = Array.from({ length: 24 }, (_, i) => `luck-${i}`)

  it('LUCK-002 Accurate after a failed non-X test: a luck face gives -2, the token is spent either way', () => {
    const outcomes = seeds.map((seed) => {
      mocks.hits.length = 0
      const d = duel({ seed })
      const b = fixed({ value: 8, icons: [] }) // 8 vs SV 7: fails by one
      const s = patch(d.state, { [d.attackerId]: { luck: 2 } })
      const t1 = ok(attack.resolve(s, b, act(s, { type: 'shoot.begin', modelId: d.attackerId, weaponUid: rifleOf(d.attackerId) })))
      const t2 = ok(attack.resolve(t1.state, b, t1.state.pending.options[0]!.action))
      expect(t2.state.pending.kind).toBe('shoot.luck')
      expect(t2.state.pending.seat).toBe('A')
      const t3 = ok(attack.resolve(t2.state, b, act(t2.state, { type: 'shoot.luck', ask: 'accurate', use: true })))
      const lucky = (t3.state.events.find((e) => e.type === 'luck') as unknown as { lucky: boolean }).lucky
      expect(t3.state.models[d.attackerId]!.luck).toBe(1)
      expect(mocks.hits.length > 0).toBe(lucky)
      return lucky
    })
    expect(outcomes).toContain(true)
    expect(outcomes).toContain(false)
  })
  it('LUCK-002 an X result gets no Accurate offer; declining keeps the token', () => {
    const d = duel({ seed: 'x' })
    const s = patch(d.state, { [d.attackerId]: { luck: 2 } })
    const b = fixed({ value: 'X', icons: [] })
    const t1 = ok(attack.resolve(s, b, act(s, { type: 'shoot.begin', modelId: d.attackerId, weaponUid: rifleOf(d.attackerId) })))
    const t2 = ok(attack.resolve(t1.state, b, t1.state.pending.options[0]!.action))
    expect(t2.done).toBeTruthy()
    const b8 = fixed({ value: 8, icons: [] })
    const u1 = ok(attack.resolve(s, b8, act(s, { type: 'shoot.begin', modelId: d.attackerId, weaponUid: rifleOf(d.attackerId) })))
    const u2 = ok(attack.resolve(u1.state, b8, u1.state.pending.options[0]!.action))
    const u3 = ok(attack.resolve(u2.state, b8, act(u2.state, { type: 'shoot.luck', ask: 'accurate', use: false })))
    expect(u3.done).toBeTruthy()
    expect(u3.state.models[d.attackerId]!.luck).toBe(2)
  })
  it('LUCK-003/006 Dodge: the target is asked after a hit, a luck face adds 2 and can turn it into a miss; the attacker then has no luck', () => {
    const outcomes = seeds.map((seed) => {
      mocks.hits.length = 0
      const d = duel({ seed })
      const b = fixed({ value: 6, icons: [] }) // 6 vs SV 7 hits by one; +2 misses
      const s = patch(d.state, { [d.attackerId]: { luck: 2 }, [d.targetId]: { luck: 1 } })
      const t1 = ok(attack.resolve(s, b, act(s, { type: 'shoot.begin', modelId: d.attackerId, weaponUid: rifleOf(d.attackerId) })))
      const t2 = ok(attack.resolve(t1.state, b, t1.state.pending.options[0]!.action))
      expect(t2.state.pending.kind).toBe('shoot.luck')
      expect(t2.state.pending.seat).toBe('B')
      const t3 = ok(attack.resolve(t2.state, b, act(t2.state, { type: 'shoot.luck', ask: 'dodge', use: true, seat: 'B' })))
      const lucky = (t3.state.events.find((e) => e.type === 'luck') as unknown as { lucky: boolean }).lucky
      expect(t3.state.models[d.targetId]!.luck).toBe(0)
      expect(t3.done).toBeTruthy() // a successful Dodge shuts the attacker's luck, and a failed one still leaves only Extra Critical (no meter on a non-hero)
      expect(mocks.hits.length === 0).toBe(lucky)
      return lucky
    })
    expect(outcomes).toContain(true)
    expect(outcomes).toContain(false)
  })
})

describe('throw and advanced weapons', () => {
  const grenadier = (extra: Partial<DuelOpts> = {}) => duel({ attacker: { unit: 'sole-survivor', count: 1, items: ['fragmentation-grenade'] }, ...extra })
  it('THR-001/WPN-006 a grenade hit damages the target (with its target extra) and everyone touched by the blast, then is used up', () => {
    mocks.hits.length = 0
    const d = grenadier()
    const near = mdl('near', 0.4, -4.9, { owner: 'A', base: 32 }) // inside the orange blast around the target
    const far = mdl('far', 5, -4, { owner: 'B', base: 32 })
    const s = add(d.state, near, far)
    const uid = `${d.attackerId}/fragmentation-grenade`
    const r = ok(attack.resolve(s, sure({ black: ['DMG'] }), act(s, { type: 'throw.begin', modelId: d.attackerId, weaponUid: uid })))
    const t = ok(attack.resolve(r.state, sure({ black: ['DMG'] }), r.state.pending.options[0]!.action))
    expect(t.done?.type).toBe('throw.fire')
    expect(mocks.hits.map((h) => h.targetId)).toEqual([d.targetId, 'near'])
    expect(mocks.hits[0]).toMatchObject({ dmg: 1 + 1 }) // DMG icon + the target extra
    expect(mocks.hits[1]).toMatchObject({ dmg: 1 }) // the blast has no target extra
    expect(t.state.models[d.attackerId]!.carried.find((c) => c.uid === uid)!.spent).toBe(true)
  })
  it('THR-002/WPN-001 a failed throw scatters by the fail-margin band (X uses the largest) from the target centre', () => {
    mocks.hits.length = 0
    const d = grenadier()
    const uid = `${d.attackerId}/fragmentation-grenade`
    const b = fixed({ value: 'X', icons: [] })
    const r = ok(attack.resolve(d.state, b, act(d.state, { type: 'throw.begin', modelId: d.attackerId, weaponUid: uid })))
    const t = ok(attack.resolve(r.state, b, r.state.pending.options[0]!.action))
    const ev = t.state.events.find((e) => e.type === 'scatter') as unknown as { from: { x: number; z: number }; to: { x: number; z: number }; colour: string }
    expect(ev.colour).toBe('yellow')
    expect(Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z)).toBeCloseTo(4, 5)
    expect(mocks.hits.every((h) => h.targetId !== d.targetId) || Math.hypot(ev.to.x - 0, ev.to.z - -4) < 1.2).toBe(true)
  })
  it('THR-003 a throw by an engaged model is not a Shoot (it must go through close combat)', () => {
    const d = grenadier()
    const stuck = add(d.state, mdl('pal', 0, 4 - TOUCH_SS, { owner: 'B', base: 32 }))
    expect(attackPlan(stuck, base, d.attackerId, d.targetId, { weaponUid: `${d.attackerId}/fragmentation-grenade` })).toMatchObject({ code: 'E_ENGAGED' })
  })
  it('WPN-007 icons pay each special once: Laser Rifle BOT sends 1 damage past armor, and the 2-bottle effect is not affordable', () => {
    mocks.hits.length = 0
    mocks.direct.length = 0
    mocks.conds.length = 0
    const d = duel({ attacker: { unit: 'sole-survivor', count: 1, items: ['laser-rifle'] } })
    const b = sure({ blue: ['BOT', 'BOT'] })
    const r = shoot(d.state, b, d.attackerId, `${d.attackerId}/laser-rifle`)
    expect(r.done).toBeTruthy()
    expect(mocks.hits[0]).toMatchObject({ damage: [{ type: 'energy', value: 1 }] })
    expect(mocks.direct).toEqual([expect.objectContaining({ id: d.targetId, n: 1, reason: 'ignoreArmor' })])
    expect(mocks.conds).toEqual([]) // 'fire' costs two bottles, one pair is already spent
  })
})
