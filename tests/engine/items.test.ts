// Owner I: ITEM, EXP, SRCH and FORCE checklist groups (docs/spec/12-rules-test-checklist.md).
// Damage, conditions and the activation menu belong to other owners, so they are stubbed with small pure fakes.
import { describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../../src/data/types'
import { duel, loadBundle, patchBundle } from './helpers'

vi.mock('../../src/engine/damage', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return {
    ...real,
    healthOf: () => 10,
    heal: (s: any, _b: unknown, id: string, a: { regular?: number; rad?: number }) => {
      const m = s.models[id]
      return { ...s, models: { ...s.models, [id]: { ...m, damage: Math.max(0, m.damage - (a.regular ?? 0)), rad: Math.max(0, m.rad - (a.rad ?? 0)) } } }
    },
    removeModel: (s: any, _b: unknown, id: string) => ({ ...s, models: { ...s.models, [id]: { ...s.models[id], life: 'dead' } } }),
  }
})
vi.mock('../../src/engine/conditions', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return {
    ...real,
    conditionSvMods: () => [],
    removeCondition: (s: any, _b: unknown, id: string, c: string) => ({ ...s, models: { ...s.models, [id]: { ...s.models[id], conditions: s.models[id].conditions.filter((x: string) => x !== c) } } }),
  }
})
vi.mock('../../src/engine/turnflow', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return { ...real, activationMenu: () => [{ id: 'end', label: 'End', action: { type: 'turn.end', decisionId: '', seat: '' } }] }
})

import { items, itemMods, tickEffects, useItem } from '../../src/engine/items'
import { attrOf, forceCost, validateForce } from '../../src/engine/forces'
import { isRejection } from '../../src/engine/registry'
import { updateModel } from '../../src/engine/registry'
import type { Action, CarriedItem, GameState } from '../../src/engine/types'

const card = (defId: string, o: Partial<CarriedItem> = {}): CarriedItem => ({ uid: `t/${defId}`, defId, kind: 'item', starting: false, ...o })
function give(state: GameState, id: string, ...cs: CarriedItem[]): GameState {
  return updateModel(state, id, { carried: [...state.models[id]!.carried, ...cs] })
}
const ok = (r: unknown) => { if (isRejection(r)) throw new Error(`rejected: ${(r as { message: string }).message}`); return (r as { state: GameState }).state }
/** A bundle whose skill die has one face, and whose blue die always shows `icons`. */
function fixedDice(b: EditionBundle, skill: number | 'X', blue: ('BOT' | 'STAR' | 'BLAST')[] = []): EditionBundle {
  const d = b.singletons.dice!
  return patchBundle(b, { dice: { ...d, skill: { faces: [{ value: skill, icons: [] }] }, effect: { ...d.effect, blue: [{ icons: blue }] } } })
}
const act = (state: GameState, o: Partial<Action> & { type: string }): Action => ({ decisionId: state.pending.id, seat: 'A', ...o })

describe('ITEM: using items', () => {
  it('ITEM-004 a food item heals and adds radiation without spending an Action', () => {
    const d = duel()
    let s = give(updateModel(d.state, d.attackerId, { damage: 5 }), d.attackerId, card('nuka-cola'))
    s = ok(useItem(s, d.bundle, d.attackerId, 't/nuka-cola'))
    const m = s.models[d.attackerId]!
    expect(m.damage).toBe(2)
    expect(m.rad).toBe(1)
    expect(m.carried.find((c) => c.uid === 't/nuka-cola')!.spent).toBe(true)
    expect(s.activation!.actionsTaken).toBe(0)
    expect(s.activation!.ap).toBe(1)
  })

  it('ITEM-001 only one limited-use item per Action', () => {
    const d = duel()
    let s = give(d.state, d.attackerId, card('radaway'), card('blood-pack'))
    s = { ...s, action: { modelId: d.attackerId, type: 'item.use', quick: false, reaction: false, free: false, itemUsed: false } }
    s = ok(useItem(s, d.bundle, d.attackerId, 't/radaway'))
    const r = useItem(s, d.bundle, d.attackerId, 't/blood-pack')
    expect(isRejection(r) && r.code).toBe('E_ITEM_USED')
  })

  it('ITEM-011 cooked effects need the card equipped at battle start', () => {
    const d = duel()
    const run = (starting: boolean) => ok(useItem(give(updateModel(d.state, d.attackerId, { damage: 6 }), d.attackerId, card('iguana-bits', { starting })), d.bundle, d.attackerId, 't/iguana-bits')).models[d.attackerId]!
    expect(run(true).damage).toBe(2)
    expect(run(true).rad).toBe(0)
    expect(run(false).damage).toBe(4)
    expect(run(false).rad).toBe(1)
  })

  it('ITEM-004 Stimpak asks which branch, then cures injuries', () => {
    const d = duel()
    let s = give(updateModel(d.state, d.attackerId, { conditions: ['injuredArm', 'injuredLeg'] }), d.attackerId, card('stimpak'))
    s = ok(useItem(s, d.bundle, d.attackerId, 't/stimpak'))
    expect(s.pending.kind).toBe('item.choose')
    expect(s.pending.options).toHaveLength(2)
    const pick = s.pending.options[1]!.action
    const r = ok(items.resolve(s, d.bundle, pick))
    expect(r.models[d.attackerId]!.conditions).toEqual([])
    expect(r.pending.kind).toBe('turn.activation')
  })

  it('ITEM-005/006 a fixed effect counts down and ends at the activation after it reaches 0', () => {
    const d = duel()
    let s = give(d.state, d.attackerId, card('stealth-boy', { starting: true }))
    s = ok(useItem(s, d.bundle, d.attackerId, 't/stealth-boy'))
    expect(s.models[d.attackerId]!.effects[0]!.counters).toBe(2)
    s = tickEffects(s, d.bundle, d.attackerId)
    s = tickEffects(s, d.bundle, d.attackerId)
    expect(s.models[d.attackerId]!.effects[0]!.counters).toBe(0)
    s = tickEffects(s, d.bundle, d.attackerId)
    expect(s.models[d.attackerId]!.effects).toHaveLength(0)
  })

  it('ITEM-007 diminishing columns hide one per activation and only one runs at a time', () => {
    const d = duel()
    const str = (st: GameState) => itemMods(st, d.bundle, d.attackerId, { purpose: 'attr', attr: 'str' }).reduce((a, m) => a + m.value, 0)
    let s = give(d.state, d.attackerId, card('buffout', { uid: 't/b1' }), card('psycho', { uid: 't/p1' }))
    s = ok(useItem(s, d.bundle, d.attackerId, 't/b1'))
    expect(str(s)).toBe(3)
    const second = useItem(s, d.bundle, d.attackerId, 't/p1')
    expect(isRejection(second) && second.code).toBe('E_ITEM_USED')
    s = tickEffects(s, d.bundle, d.attackerId)
    expect(str(s)).toBe(2)
    s = tickEffects(s, d.bundle, d.attackerId)
    s = tickEffects(s, d.bundle, d.attackerId)
    expect(s.models[d.attackerId]!.effects).toHaveLength(0)
  })

  it('ITEM-008 the blue die decides addiction; a bottle+star face counts as the star only', () => {
    const run = (blue: ('BOT' | 'STAR' | 'BLAST')[], defId: string) => {
      const base = duel()
      const b = fixedDice(base.bundle, 1, blue)
      let s = give(base.state, base.attackerId, card(defId))
      s = ok(useItem(s, b, base.attackerId, `t/${defId}`))
      for (let i = 0; i < 3; i++) s = tickEffects(s, b, base.attackerId)
      return s.models[base.attackerId]!.addictions
    }
    expect(run(['STAR'], 'buffout')).toEqual(['buffout'])
    expect(run(['BLAST'], 'buffout')).toEqual([])
    expect(run(['BOT', 'STAR'], 'bourbon')).toEqual([])
    expect(run(['BLAST'], 'bourbon')).toEqual(['bourbon'])
  })

  it('ITEM-008 an addicted model carries the withdrawal penalty into its attributes', () => {
    const d = duel()
    const s = updateModel(d.state, d.attackerId, { addictions: ['buffout'] })
    const base = attrOf(d.state, d.bundle, d.attackerId, 'end')
    expect(attrOf(s, d.bundle, d.attackerId, 'end')).toBe(Math.max(0, base - 1))
  })

  it('ITEM-002/003 a limited-use item is shared within Yellow and LoS, but never by an engaged model', () => {
    const d = duel({ distance: 12 })
    const a = d.state.models[d.attackerId]!
    const friend = { ...a, id: 'a-friend', carried: [card('radaway', { uid: 'f/radaway' })], pos: { x: 2.5, z: a.pos.z }, readiness: 'unready' as const }
    let s: GameState = { ...d.state, models: { ...d.state.models, [friend.id]: friend } }
    const shared = ok(useItem(s, d.bundle, d.attackerId, 'f/radaway'))
    expect(shared.models['a-friend']!.carried[0]!.spent).toBe(true)
    const near = duel({ distance: 1.2 })
    const a2 = near.state.models[near.attackerId]!
    const f2 = { ...a2, id: 'a-friend', carried: [card('radaway', { uid: 'f/radaway' })], pos: { x: 2, z: a2.pos.z } }
    s = { ...near.state, models: { ...near.state.models, [f2.id]: f2 } }
    const r = useItem(s, near.bundle, near.attackerId, 'f/radaway')
    expect(isRejection(r) && r.code).toBe('E_ENGAGED')
  })

  it('ITEM-010 starting items cannot be dropped; found items can be dropped and picked up again', () => {
    const d = duel()
    const s = give(d.state, d.attackerId, card('radaway', { uid: 't/found' }), card('stimpak', { uid: 't/start', starting: true }))
    const bad = items.resolve(s, d.bundle, act(s, { type: 'item.drop', modelId: d.attackerId, itemUid: 't/start' }))
    expect(isRejection(bad) && bad.code).toBe('E_NOT_LEGAL')
    const dropped = ok(items.resolve(s, d.bundle, act(s, { type: 'item.drop', modelId: d.attackerId, itemUid: 't/found' })))
    expect(dropped.models[d.attackerId]!.carried.some((c) => c.uid === 't/found')).toBe(false)
    expect(dropped.markers).toHaveLength(1)
    const back = ok(items.resolve(dropped, d.bundle, act(dropped, { type: 'item.pickup', modelId: d.attackerId, markerId: dropped.markers[0]!.id })))
    expect(back.models[d.attackerId]!.carried.some((c) => c.defId === 'radaway')).toBe(true)
    expect(back.markers).toHaveLength(0)
  })

  it('ITEM-009 armor cards add their attribute bonus through attrOf', () => {
    const d = duel()
    const s = give(d.state, d.attackerId, card('t-60-power-armor', { kind: 'armor', starting: true }))
    expect(attrOf(s, d.bundle, d.attackerId, 'end')).toBeGreaterThan(attrOf(d.state, d.bundle, d.attackerId, 'end'))
  })
})

describe('EXP and SRCH: expertise and scavenging', () => {
  const setup = (props: Record<string, unknown> = {}, dice: number | 'X' = 1, dist = 12) => {
    const d = duel({ distance: dist })
    const a = d.state.models[d.attackerId]!
    const marker = { id: 'mk', kind: 'searchable' as const, pos: { x: 1, z: a.pos.z }, revealed: false, seenBy: [], props: { item: 'radaway', ...props } }
    return { d, bundle: fixedDice(d.bundle, dice), state: { ...d.state, markers: [marker] } as GameState }
  }

  it('EXP-001/SRCH-004 a successful Search in contact offers the found item, and keeping it adds it to the model', () => {
    const { d, bundle, state } = setup()
    const r = ok(items.resolve(state, bundle, act(state, { type: 'search.interact', modelId: d.attackerId, markerId: 'mk' })))
    expect(r.pending.kind).toBe('search.found')
    const kept = items.resolve(r, bundle, r.pending.options[0]!.action)
    expect(isRejection(kept)).toBe(false)
    const out = kept as { state: GameState; done?: unknown }
    expect(out.done).toBeTruthy()
    expect(out.state.models[d.attackerId]!.carried.some((c) => c.defId === 'radaway' && !c.starting)).toBe(true)
    expect(out.state.markers).toHaveLength(0)
  })

  it('SRCH-008 a found item left behind stays tied to the marker for the next finder', () => {
    const { d, bundle, state } = setup()
    const r = ok(items.resolve(state, bundle, act(state, { type: 'search.interact', modelId: d.attackerId, markerId: 'mk' })))
    const left = ok(items.resolve(r, bundle, r.pending.options[1]!.action))
    expect(left.models[d.attackerId]!.carried.some((c) => c.defId === 'radaway')).toBe(false)
    expect(left.markers).toHaveLength(1)
    expect((left.markers[0]!.props.dropped as CarriedItem).defId).toBe('radaway')
  })

  it('SRCH-006 a trapped lock that fails draws a Danger and still yields an item', () => {
    const { d, bundle, state } = setup({ trapped: true }, 'X')
    const r = ok(items.resolve(state, bundle, act(state, { type: 'search.interact', modelId: d.attackerId, markerId: 'mk' })))
    expect(r.events.some((e) => e.type === 'danger')).toBe(true)
    expect(r.pending.kind).toBe('search.found')
  })

  it('SRCH-006 a plain failed Search leaves the marker for another try', () => {
    const { d, bundle, state } = setup({}, 'X')
    const r = items.resolve(state, bundle, act(state, { type: 'search.interact', modelId: d.attackerId, markerId: 'mk' })) as { state: GameState; done?: unknown }
    expect(r.done).toBeTruthy()
    expect(r.state.markers).toHaveLength(1)
  })

  it('EXP-001 engaged models cannot interact, and out-of-contact markers are refused', () => {
    const near = setup({}, 1, 1.2)
    const r = items.resolve(near.state, near.bundle, act(near.state, { type: 'search.interact', modelId: near.d.attackerId, markerId: 'mk' }))
    expect(isRejection(r) && r.code).toBe('E_ENGAGED')
    const far = setup()
    const m = { ...far.state.markers[0]!, pos: { x: 10, z: 0 } }
    const s = { ...far.state, markers: [m] }
    const r2 = items.resolve(s, far.bundle, act(s, { type: 'search.interact', modelId: far.d.attackerId, markerId: 'mk' }))
    expect(isRejection(r2) && r2.code).toBe('E_OUT_OF_RANGE')
  })

  it('EXP-002 a Computers X locks that terminal for the rest of the turn', () => {
    const { d, bundle, state } = setup({ skill: 'computers' }, 'X')
    const s0 = { ...state, markers: [{ ...state.markers[0]!, kind: 'object' as const }] }
    const r = ok(items.resolve(s0, bundle, act(s0, { type: 'expertise.use', modelId: d.attackerId, markerId: 'mk' })))
    expect(r.markers[0]!.props.lockedSeat).toBe('A')
    const again = items.resolve(r, bundle, act(r, { type: 'expertise.use', modelId: d.attackerId, markerId: 'mk' }))
    expect(isRejection(again) && again.code).toBe('E_NOT_LEGAL')
  })

  it('EXP-004 a model without the required skill cannot make the test', () => {
    const { d, bundle, state } = setup()
    const noSkill = updateModel(state, d.attackerId, { profileId: 'mutant-hound' })
    const r = items.resolve(noSkill, bundle, act(noSkill, { type: 'search.interact', modelId: d.attackerId, markerId: 'mk' }))
    expect(isRejection(r) && r.code).toBe('E_NO_SKILL')
  })

  it('SRCH-001/002/003 peeking needs Awareness and LoS, is barred mid-move, and may repeat', () => {
    const d = duel()
    const inv = { id: 'inv', kind: 'investigation' as const, pos: { x: 0, z: 0 }, revealed: false, seenBy: [], props: {} }
    const s = { ...d.state, markers: [inv] }
    const p = ok(items.resolve(s, d.bundle, act(s, { type: 'search.peek', modelId: d.attackerId, markerId: 'inv' })))
    expect(p.markers[0]!.seenBy).toEqual(['A'])
    const again = ok(items.resolve(p, d.bundle, act(p, { type: 'search.peek', modelId: d.attackerId, markerId: 'inv' })))
    expect(again.markers[0]!.seenBy).toEqual(['A'])
    const moving = { ...s, action: { modelId: d.attackerId, type: 'move.step', quick: false, reaction: false, free: false, itemUsed: false } }
    const r = items.resolve(moving, d.bundle, act(moving, { type: 'search.peek', modelId: d.attackerId, markerId: 'inv' }))
    expect(isRejection(r) && r.code).toBe('E_NOT_LEGAL')
    const faraway = { ...s, markers: [{ ...inv, pos: { x: 17, z: -17 } }] }
    const r2 = items.resolve(faraway, d.bundle, act(faraway, { type: 'search.peek', modelId: d.attackerId, markerId: 'inv' }))
    expect(isRejection(r2)).toBe(true)
  })
})

describe('FORCE: force building', () => {
  const b = loadBundle()
  const codes = (f: Parameters<typeof validateForce>[1], o?: Parameters<typeof validateForce>[2]) => validateForce(b, f, o).map((p) => p.code)

  it('FORCE-001 only one model per unique version group', () => {
    expect(codes([{ unit: 'sole-survivor', count: 1, items: [], leader: 'brawler' }, { unit: 'sole-survivor-day-one', count: 1, items: [] }])).toContain('unique')
    expect(codes([{ unit: 'sole-survivor', count: 1, items: [], leader: 'brawler' }])).not.toContain('unique')
  })

  it('FORCE-002 exactly one leader per force', () => {
    expect(codes([{ unit: 'settler', count: 1, items: [] }])).toContain('leader-count')
    expect(codes([{ unit: 'settler', count: 1, items: [], leader: 'brawler' }, { unit: 'settler', count: 1, items: [], leader: 'hunter' }])).toContain('leader-count')
    expect(codes([{ unit: 'settler', count: 2, items: ['laser-rifle'], leader: 'brawler' }])).toEqual([])
  })

  it('FORCE-005 Heroic only on a single-model unit', () => {
    expect(codes([{ unit: 'settler', count: 2, items: [], heroic: true, leader: 'brawler' }])).toContain('heroic-single')
    expect(codes([{ unit: 'settler', count: 1, items: [], heroic: true, leader: 'brawler' }])).not.toContain('heroic-single')
  })

  it('FORCE-007/010 units of another faction are refused, neutral ones are not', () => {
    expect(codes([{ unit: 'settler', count: 1, items: [], leader: 'brawler' }, { unit: 'super-mutant', count: 1, items: [] }])).toContain('faction')
  })

  it('FORCE-011 force cost sums units, items, heroic and leader; equipped items are free', () => {
    const settler = b.records.units.find((u) => u.id === 'settler')!
    const rifle = b.records.weapons.find((w) => w.id === 'laser-rifle')!
    const leader = b.records.leaders.find((l) => l.id === 'brawler')!
    const heroic = b.singletons.heroic!
    expect(forceCost(b, [{ unit: 'settler', count: 2, items: ['laser-rifle'] }])).toBe(2 * (settler.cost + rifle.cost))
    expect(forceCost(b, [{ unit: 'settler', count: 1, items: [], heroic: true, leader: 'brawler' }])).toBe(settler.cost + heroic.cost + leader.cost)
    expect(codes([{ unit: 'settler', count: 2, items: ['laser-rifle'], leader: 'brawler' }], { caps: 100 })).toContain('over-caps')
  })

  it('FORCE-012 dogs take food and drink only', () => {
    expect(codes([{ unit: 'dogmeat', count: 1, items: ['stimpak'], leader: 'brawler' }])).toContain('dog-items')
    expect(codes([{ unit: 'dogmeat', count: 1, items: ['blood-pack'], leader: 'brawler' }])).not.toContain('dog-items')
  })

  it('ITEM-009 one mod per matching item and one clothing per model', () => {
    const two = codes([{ unit: 'settler', count: 1, items: ['laser-rifle', 'comfort-grip', 'hardened-receiver'], leader: 'brawler' }])
    expect(two).toContain('mod-host')
    expect(codes([{ unit: 'settler', count: 1, items: ['aviator-cap', 'patched-three-piece-suit'], leader: 'brawler' }])).toContain('clothing-max')
  })
})
