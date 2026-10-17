import { describe, expect, it, vi } from 'vitest'
import type { DiceDef, DieColour, Icon } from '../../src/data/types'
import { improvisedUid } from '../../src/engine/attack'
import { ccWeapons, freeAttack, melee, meleePlan } from '../../src/engine/melee'
import { isRejection, type StepResult } from '../../src/engine/registry'
import type { Action, GameState, ModelState } from '../../src/engine/types'
import { duel, loadBundle, mdl, patchBundle, type DuelOpts } from './helpers'

// Other owners' modules may still be stubs: stand in for the calls melee.ts makes into them.
const mocks = vi.hoisted(() => ({ hits: [] as any[], pushes: [] as any[], svPenalty: {} as Record<string, number> }))
vi.mock('../../src/engine/damage', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/damage')>()),
  applyHit: (s: GameState, _b: unknown, hit: any) => {
    mocks.hits.push(hit)
    return { state: s, report: { targetId: hit.targetId, perType: [], applied: 1, tookDamage: true, removed: false } }
  },
}))
vi.mock('../../src/engine/conditions', () => ({
  hasCondition: (m: { conditions: string[] }, c: string) => m.conditions.includes(c),
  conditionSvMods: (_s: unknown, _b: unknown, id: string) => (mocks.svPenalty[id] ? [{ source: 'test', label: 'test', value: mocks.svPenalty[id], mode: 'add' }] : []),
  addCondition: (s: unknown) => ({ state: s, added: true }),
  conditionMoveSteps: () => 0,
  removeCondition: (s: unknown) => s,
  startOfActivation: (s: unknown) => s,
  endOfActivation: (s: unknown) => s,
  conditions: { id: 'conditions', kinds: ['cond'], options: () => [], resolve: () => ({ code: 'E_TODO', message: 'mock' }) },
}))
vi.mock('../../src/engine/items', async (orig) => ({ ...(await orig<typeof import('../../src/engine/items')>()), itemMods: () => [] }))
// Full factory: spreading orig() here loads the import cycle early and can leave melee bound to the real movement.
vi.mock('../../src/engine/movement', () => ({
  movement: { id: 'movement', kinds: ['move'], options: () => [], resolve: () => ({ code: 'E_TODO', message: 'mock' }) },
  pushBack: (s: GameState, _b: unknown, id: string, from: unknown, colour: string) => { mocks.pushes.push({ id, from, colour }); return { state: s, inches: 0 } },
  // BC-006: a stand-in break-away that walks the defender 4 in. along -z.
  retreatPath: (s: GameState, _b: unknown, id: string) => [{ x: s.models[id]!.pos.x, z: s.models[id]!.pos.z - 4 }],
  breakContact: (s: GameState, _b: unknown, id: string, _foe: string, path?: { x: number; z: number }[]) => {
    const m = s.models[id]!
    return { state: { ...s, models: { ...s.models, [id]: { ...m, pos: path?.[path.length - 1] ?? { x: m.pos.x, z: m.pos.z - 4 } } } } }
  },
  validateMove: (_s: GameState, _b: unknown, _id: string, path: { x: number; z: number }[]) => ({ end: path[path.length - 1], inches: 1 }),
  // Put the charger in base contact with the target, on the near side.
  chargeMines: (s: GameState) => ({ state: s, stopped: false }),
  chargeMove: (s: GameState, _b: unknown, id: string, targetId: string) => {
    const m = s.models[id]!, t = s.models[targetId]!
    const gap = (m.base + t.base) / 25.4 / 2
    return { state: { ...s, models: { ...s.models, [id]: { ...m, pos: { x: t.pos.x, z: t.pos.z + gap } } } } }
  },
}))

const base = loadBundle()
type Faces = Partial<Record<DieColour, Icon[]>>
function fixed(skill: { value: number | 'X'; icons: Icon[] }, effect: Faces = {}) {
  const d: DiceDef = structuredClone(base.singletons.dice!)
  d.skill.faces = [skill]
  for (const c of ['black', 'green', 'yellow', 'blue'] as DieColour[]) d.effect[c] = [{ icons: effect[c] ?? [] }]
  return patchBundle(base, { dice: d })
}
const sure = (effect: Faces = {}) => fixed({ value: 1, icons: [] }, effect)
const R = (mm: number) => mm / 25.4 / 2
const act = (s: GameState, a: Omit<Action, 'decisionId' | 'seat'> & { seat?: string }): Action => ({ ...a, decisionId: s.pending.id, seat: a.seat ?? 'A' }) as Action
const ok = (r: StepResult) => { if (isRejection(r)) throw new Error(`rejected: ${r.code} ${r.message}`); return r }
const patch = (s: GameState, p: Record<string, Partial<ModelState>>): GameState =>
  ({ ...s, models: { ...s.models, ...Object.fromEntries(Object.entries(p).map(([id, v]) => [id, { ...s.models[id]!, ...v }])) } })
const add = (s: GameState, ...ms: ModelState[]): GameState => ({ ...s, models: { ...s.models, ...Object.fromEntries(ms.map((m) => [m.id, m])) } })
const mm = (s: GameState, id: string) => s.models[id]!.base

/** A duel whose models touch (A above B). */
function scrum(o: Omit<DuelOpts, 'distance'> = {}) {
  const probe = duel(o)
  return duel({ ...o, distance: R(mm(probe.state, probe.attackerId)) + R(mm(probe.state, probe.targetId)) })
}
const plan = (d: ReturnType<typeof scrum>, opts = {}) => {
  const p = meleePlan(d.state, base, d.attackerId, d.targetId, opts)
  if (isRejection(p)) throw new Error(`${p.code} ${p.message}`)
  return p
}

describe('close combat plan', () => {
  it('CC-013 only models in base contact fight; contact is the engagement test', () => {
    const apart = duel()
    expect(meleePlan(apart.state, base, apart.attackerId, apart.targetId)).toMatchObject({ code: 'E_NOT_ENGAGED' })
    const d = scrum()
    expect(isRejection(meleePlan(d.state, base, d.attackerId, d.targetId))).toBe(false)
  })
  it('CC-001 every model has the Improvised Weapon (melee, one green die, one physical damage)', () => {
    const d = scrum({ attacker: { unit: 'settler', count: 1, items: [] } })
    expect(ccWeapons(d.state, base, d.attackerId)).toEqual([improvisedUid(d.attackerId)])
    const p = plan(d)
    expect(p.pool).toEqual({ green: 1 })
    expect(p.damage).toEqual([{ type: 'physical', value: 1 }])
    expect(p.band).toBe('melee')
  })
  it('CC-002 Str 7 or more adds a black die to melee weapons; CC-003 an outnumbered target adds a green die', () => {
    const strong = scrum({ attacker: { unit: 'super-mutant', count: 1, items: ['board'] }, target: { unit: 'settler', count: 1, items: [] } })
    expect(plan(strong, { weaponUid: `${strong.attackerId}/board` }).pool).toEqual({ black: 2 })
    const weak = scrum({ attacker: { unit: 'settler', count: 1, items: ['pipe-wrench'] }, target: { unit: 'settler', count: 1, items: [] } })
    expect(plan(weak, { weaponUid: `${weak.attackerId}/pipe-wrench` }).pool).toEqual({ yellow: 1 })
    // a second model of the attacker's side touching the target outnumbers it
    const helper = mdl('helper', R(32) + R(32), weak.state.models[weak.targetId]!.pos.z, { owner: 'A', base: 32 })
    const crowded = add(weak.state, helper)
    const p = meleePlan(crowded, base, weak.attackerId, weak.targetId, { weaponUid: `${weak.attackerId}/pipe-wrench` })
    if (isRejection(p)) throw new Error(p.message)
    expect(p.pool).toEqual({ yellow: 1, green: 1 })
  })
  it('CC-004/005/006 ranged weapons in melee count as one cover; a non-zero minimum rules them out; Super Mutants use Melee SV', () => {
    const rifle = scrum({ attacker: { unit: 'sole-survivor', count: 1, items: ['hunting-rifle'] } })
    const p = plan(rifle, { weaponUid: `${rifle.attackerId}/hunting-rifle` })
    expect(p.sv).toBe(5) // Per 7, -2 cover
    expect(p.cover).toMatchObject({ cover: true, armorBonus: 1 })
    expect(p.pool).toEqual({ yellow: 2 }) // short band dice
    const clone = structuredClone(base)
    clone.records.weapons.find((w) => w.id === 'hunting-rifle')!.minShortZero = false
    expect(ccWeapons(rifle.state, clone, rifle.attackerId)).not.toContain(`${rifle.attackerId}/hunting-rifle`)
    const sm = scrum({ attacker: { unit: 'super-mutant', count: 1, items: ['bolt-action-pipe-rifle'] }, target: { unit: 'settler', count: 1, items: [] } })
    expect(plan(sm, { weaponUid: `${sm.attackerId}/bolt-action-pipe-rifle` }).sv).toBe(5) // Melee (Str 7), not Rifle (Per 4); -2 cover
  })
  it('COND-008 a stunned target is +2 SV', () => {
    const d = scrum()
    const plain = plan(d).sv
    const stunned = patch(d.state, { [d.targetId]: { conditions: ['stunned'] } })
    const p = meleePlan(stunned, base, d.attackerId, d.targetId)
    if (isRejection(p)) throw new Error(p.message)
    expect(p.sv).toBe(plain + 2)
  })
})

describe('close combat resolution', () => {
  it('CC-007/008 the attack is followed by an optional slide that must keep every engagement; the Action ends after it', () => {
    mocks.hits.length = 0
    const d = scrum({ attacker: { unit: 'sole-survivor', count: 1, items: ['baseball-bat'] } })
    const b = sure({ black: ['DMG'], yellow: ['BOT'] })
    const uid = `${d.attackerId}/baseball-bat`
    const r = ok(melee.resolve(d.state, b, act(d.state, { type: 'melee.attack', modelId: d.attackerId, weaponUid: uid, targetId: d.targetId })))
    expect(mocks.hits).toHaveLength(1)
    expect(mocks.hits[0]).toMatchObject({ dmg: 1, ar: 1, damage: [{ type: 'physical', value: 1 }] }) // BOT pays the Bat's armor-down
    expect(r.state.pending.kind).toBe('melee.slide')
    expect(r.done).toBeUndefined()
    const stay = ok(melee.resolve(r.state, b, act(r.state, { type: 'melee.slide', modelId: d.attackerId })))
    expect(stay.done).toMatchObject({ type: 'melee.attack', modelId: d.attackerId })
    expect(stay.done!.triggers.map((t) => t.kind)).toEqual(['action', 'hit', 'damaged'])
    // a slide that leaves contact is refused; one that stays in contact is applied
    const away = melee.resolve(r.state, b, act(r.state, { type: 'melee.slide', modelId: d.attackerId, path: [{ x: 6, z: 6 }] }))
    expect(away).toMatchObject({ code: 'E_NOT_LEGAL' })
    const t = d.state.models[d.targetId]!.pos, a = d.state.models[d.attackerId]!.pos
    const around = { x: t.x + (a.z - t.z), z: t.z } // swing round to the side, still touching
    const slid = ok(melee.resolve(r.state, b, act(r.state, { type: 'melee.slide', modelId: d.attackerId, path: [{ x: around.x * (R(32) + R(40)) / Math.hypot(around.x - t.x, 0) + t.x, z: t.z }] })))
    expect(slid.state.models[d.attackerId]!.pos.z).toBeCloseTo(t.z)
  })
  it('CC-009..011 a free attack hits at -2 for a model engaged with only the leaver, is not a trigger, and a stunned or crowded model gets none', () => {
    mocks.hits.length = 0
    const d = scrum({ attacker: { unit: 'sole-survivor', count: 1, items: ['baseball-bat'] } })
    const b = sure()
    const r = freeAttack(d.state, b, d.attackerId, d.targetId)
    expect(mocks.hits).toHaveLength(1)
    const ev = r.state.events.find((e) => e.type === 'attack') as unknown as { sv: number }
    expect(ev.sv).toBe(plan(d, { quick: true }).sv)
    expect(ev.sv).toBe(plan(d).sv - 2)
    expect(r.state.pending.kind).toBe('turn.activation') // no decision raised
    mocks.hits.length = 0
    freeAttack(patch(d.state, { [d.attackerId]: { conditions: ['stunned'] } }), b, d.attackerId, d.targetId)
    const other = mdl('other', 5, d.state.models[d.attackerId]!.pos.z, { owner: 'B', base: 32 })
    const crowdedPos = { x: R(32) * 2, z: d.state.models[d.attackerId]!.pos.z }
    freeAttack(add(d.state, { ...other, pos: crowdedPos }), b, d.attackerId, d.targetId)
    expect(mocks.hits).toHaveLength(0)
  })
})

describe('charge and battle cry', () => {
  const charger = (unit = 'brute', target = 'settler') =>
    duel({ distance: 4, attacker: { unit, count: 1, items: ['sledgehammer'] }, target: { unit: target, count: 1, items: [] } })
  const go = (d: ReturnType<typeof charger>, b: ReturnType<typeof sure>) => ok(melee.resolve(d.state, b, act(d.state, { type: 'charge.go', modelId: d.attackerId, targetId: d.targetId })))

  it('CHG-001/002 a charge ends in base contact; an engaged model cannot start one', () => {
    const d = charger()
    expect(melee.options(d.state, base, d.attackerId).map((o) => o.action.type)).toContain('charge.go')
    const r = go(d, sure())
    expect(r.state.pending.kind).toBe('charge.marker')
    const stuck = scrum()
    expect(melee.resolve(stuck.state, base, act(stuck.state, { type: 'charge.go', modelId: stuck.attackerId, targetId: stuck.targetId }))).toMatchObject({ code: 'E_ENGAGED' })
    expect(melee.options(stuck.state, base, stuck.attackerId).every((o) => o.action.type !== 'charge.go')).toBe(true)
  })
  it('CHG-003/004/006 the chosen marker adds its die only against the charged model, and the attack uses it up', () => {
    const d = charger('sole-survivor', 'super-mutant') // a white Battle Cry icon never starts one
    const b = sure()
    const m = ok(melee.resolve(go(d, b).state, b, act(d.state, { type: 'charge.marker', modelId: d.attackerId, targetId: d.targetId, colour: 'green' }) as Action))
    expect(m.done?.type).toBe('charge.go')
    expect(m.state.models[d.attackerId]!.chargeBonus).toEqual(['green'])
    const s = m.state
    const withBonus = meleePlan(s, base, d.attackerId, d.targetId, { weaponUid: improvisedUid(d.attackerId) })
    if (isRejection(withBonus)) throw new Error(withBonus.message)
    expect(withBonus.pool).toEqual({ green: 2 }) // improvised green + the marker
    const bystander = mdl('bystander', 0, s.models[d.attackerId]!.pos.z + R(32) * 2, { owner: 'B', base: 32 })
    const other = meleePlan(add(s, bystander), base, d.attackerId, 'bystander', { weaponUid: improvisedUid(d.attackerId) })
    if (isRejection(other)) throw new Error(other.message)
    expect(other.pool).toEqual({ green: 1 }) // not the charged model
    const swing = ok(melee.resolve(s, b, act(s, { type: 'melee.attack', modelId: d.attackerId, weaponUid: improvisedUid(d.attackerId), targetId: d.targetId })))
    expect(swing.state.models[d.attackerId]!.chargeBonus).toEqual([])
  })
  it('BC-002/003/004/005 a tie goes to the charger: second marker, no trigger for the charged model, optional push', () => {
    mocks.pushes.length = 0
    mocks.svPenalty = {}
    const d = charger() // Brute (coloured Battle Cry, Str 8) charges a Settler (white icon, Cha 4 to resist)
    const b = fixed({ value: 2, icons: [] }) // both succeed with the same result
    const m = ok(melee.resolve(go(d, b).state, b, act(d.state, { type: 'charge.marker', modelId: d.attackerId, targetId: d.targetId, colour: 'black' }) as Action))
    expect(m.state.models[d.attackerId]!.chargeBonus).toEqual(['black', 'green'])
    expect(m.state.pending.kind).toBe('battleCry.push')
    const pushed = ok(melee.resolve(m.state, b, act(m.state, { type: 'battleCry.push', modelId: d.attackerId, targetId: d.targetId, push: true })))
    expect(mocks.pushes).toEqual([expect.objectContaining({ id: d.targetId, colour: 'yellow' })])
    expect(pushed.state.pending.kind).toBe('battleCry.follow') // CH p15: the follow-up is its own choice
    const held = ok(melee.resolve(pushed.state, b, act(pushed.state, { type: 'battleCry.follow', modelId: d.attackerId, targetId: d.targetId, follow: false })))
    expect(held.state.models[d.attackerId]!.tokens[`noFollow:${d.targetId}`]).toBe(1) // ERR p.16
    const followed = ok(melee.resolve(pushed.state, b, act(pushed.state, { type: 'battleCry.follow', modelId: d.attackerId, targetId: d.targetId, follow: true })))
    expect((followed.done!.triggers[0] as unknown as { exempt: string[] }).exempt).toEqual([d.targetId])
    const stay = ok(melee.resolve(m.state, b, act(m.state, { type: 'battleCry.push', modelId: d.attackerId, targetId: d.targetId, push: false })))
    expect(stay.done).toBeTruthy()
  })
  it('BC-001/006 a defender that out-rolls the charger strips the marker, the charge stays a trigger, and the defender may back away for free', () => {
    mocks.svPenalty = {}
    mocks.hits.length = 0
    const d0 = charger()
    const d = { ...d0, state: patch(d0.state, { [d0.targetId]: { reaction: true } }) } // RoP p41: a Reaction needs a marker
    mocks.svPenalty = { [d.attackerId]: -7 } // charger SV 1: a 2 fails, the Settler (Cha 4) succeeds
    const b = fixed({ value: 2, icons: [] })
    const m = ok(melee.resolve(go(d, b).state, b, act(d.state, { type: 'charge.marker', modelId: d.attackerId, targetId: d.targetId, colour: 'black' }) as Action))
    mocks.svPenalty = {}
    expect(m.state.models[d.attackerId]!.chargeBonus).toEqual([])
    expect(m.state.events.find((e) => e.type === 'battleCry')).toMatchObject({ winner: 'defender' })
    // BC-006: the defender is asked at once (stay is listed first so a bot that declines everything stays put)
    expect(m.state.pending.kind).toBe('battleCry.escape')
    expect(m.state.pending.seat).toBe('B')
    expect(m.state.pending.options.map((o) => o.action.go)).toEqual([false, true])
    const stay = ok(melee.resolve(m.state, b, act(m.state, { type: 'battleCry.escape', seat: 'B', modelId: d.targetId, go: false })))
    expect(stay.done!.triggers[0]).not.toHaveProperty('exempt') // the charge is still a trigger for the defender
    const before = m.state.models[d.targetId]!.pos
    const left = ok(melee.resolve(m.state, b, act(m.state, { type: 'battleCry.escape', seat: 'B', modelId: d.targetId, go: true })))
    expect(left.state.models[d.targetId]!.pos).not.toEqual(before)
    expect(left.state.events.some((e) => e.type === 'battleCryEscape')).toBe(true)
    expect(left.state.models[d.targetId]!.reaction).toBe(false) // the marker is spent (RoP p41)
    expect(mocks.hits).toHaveLength(0) // no free attack for the charger
    expect(left.done!.triggers[0]).toMatchObject({ exempt: [d.targetId] }) // the free Reaction is the defender's one answer to the charge
    expect(left.state.models[d.attackerId]!.chargeBonus).toEqual([]) // the charger gains nothing
    // BC-006: no Reaction marker, no break-away offer
    mocks.svPenalty = { [d.attackerId]: -7 }
    const bare = { ...d, state: patch(d.state, { [d.targetId]: { reaction: false } }) }
    const nb = ok(melee.resolve(go(bare, b).state, b, act(bare.state, { type: 'charge.marker', modelId: d.attackerId, targetId: d.targetId, colour: 'black' }) as Action))
    mocks.svPenalty = {}
    expect(nb.state.pending.kind).not.toBe('battleCry.escape')
    expect(nb.done).toBeTruthy()
    // a Stunned defender cannot take the Reaction
    mocks.svPenalty = { [d.attackerId]: -7 }
    const stunned = { ...d.state, models: { ...d.state.models, [d.targetId]: { ...d.state.models[d.targetId]!, conditions: ['stunned' as const] } } }
    const sd = { ...d, state: stunned }
    const st = ok(melee.resolve(go(sd, b).state, b, act(sd.state, { type: 'charge.marker', modelId: d.attackerId, targetId: d.targetId, colour: 'black' }) as Action))
    mocks.svPenalty = {}
    expect(st.done).toBeTruthy()
  })
  it('BC-001 immune models are not tested', () => {
    const b = fixed({ value: 2, icons: [] })
    const claw = charger('brute', 'deathclaw')
    const n = ok(melee.resolve(go(claw, b).state, b, act(claw.state, { type: 'charge.marker', modelId: claw.attackerId, targetId: claw.targetId, colour: 'green' }) as Action))
    expect(n.state.events.some((e) => e.type === 'battleCry')).toBe(false)
    expect(n.state.models[claw.attackerId]!.chargeBonus).toEqual(['green'])
  })
})
