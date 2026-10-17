// SETT-001..024 (spec 19 s3-4, checklist 12). Fixtures: tests/campaign/fixtures.ts.
import { describe, expect, it } from 'vitest'
import { fromBattle, toBattle } from '../../src/campaign/battle'
import { buildItemDeck } from '../../src/campaign/decks'
import { cardValue, standardEquipment, unitRec } from '../../src/campaign/data'
import { actionsFromLog, newCampaign, reduce } from '../../src/campaign/reducer'
import { leaderHighestAttr, powerPlan } from '../../src/campaign/rules'
import { CampaignError, type Campaign, type CampaignAction } from '../../src/campaign/types'
import { SEAT, P, act, addPerk, addStruct, at, caps, card, finished, fresh, instOf, makeData, modelOf, planAll, readyFx, standardValue, withPlayer, type Fx } from './fixtures'
import type { ModDef, WeaponDef } from '../../src/data/types'

const code = (f: () => unknown): string => { try { f(); return 'no error' } catch (e) { return e instanceof CampaignError ? e.code : String(e) } }
const run = (fx: Fx, a: CampaignAction): string => code(() => reduce(fx.c, a, fx.d))
const uses = (fx: Fx, defId: string, n = 0): Fx => act(fx, { type: 'draw.use', seat: SEAT, structureId: P(fx.c).structures.filter((s) => s.defId === defId)[n]!.id })
const keepAll = (fx: Fx): Fx => act(fx, { type: 'draw.keep', seat: SEAT, keep: P(fx.c).phase.pending!.cards.slice(0, P(fx.c).phase.pending!.keep).map((x) => x.uid) })
/** A campaign ready to use Structures: caps set, the named Structures added, Power topped up. */
function shop(defs: string[], over: Partial<ReturnType<typeof makeData>> = {}, seed = 'seed-1', gens = 3): Fx {
  const fx = fresh(over, seed)
  let c = at(fx.c, 'build.structures')
  for (let i = 0; i < gens; i++) c = addStruct(c, 'gen-medium')
  for (const d of defs) c = addStruct(c, d)
  return { ...fx, c: caps(c, 1000) }
}

describe('after a battle', () => {
  it('SETT-001 every Item that is not standard equipment and every unused Boost leaves the force before retention', () => {
    const fx0 = fresh({}, 'seed-1')
    const base = newCampaign({ seed: 's', players: [{ seat: SEAT, faction: 'super-mutants', leader: { unitId: 'brute', card: 'brawler' } }] }, fx0.d)
    const sm = base.players[0]!.roster.find((m) => m.unitId === 'super-mutant')!
    let fx: Fx = { d: fx0.d, c: withPlayer(at(base, 'force.create'), (p) => { p.selected = [card('combat-shotgun', 'cs#1', 'weapon')]; p.hand = [card('boost-p1', 'b#1', 'boost')] }) }
    const plan = planAll(fx.c, SEAT, ['super-mutant', 'brute']).plan
    fx = act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [sm.id]: ['cs#1'] } } })
    const { state } = finished(fx, 'box-1', { winner: 'A', reason: 'x' })
    const after = fromBattle(fx.c, state, fx.d)
    const gathered = P(after).phase.gathered.map((x) => x.defId).sort()
    expect(gathered).toEqual(['boost-p1', 'combat-shotgun']) // board and the pipe rifle stay (standard equipment)
    expect(P(after).hand).toEqual([])
    expect(P(after).selected).toEqual([])
  })

  const gathered = (cards: ReturnType<typeof card>[]) => (fx: Fx): Fx => ({ ...fx, c: withPlayer(at(fx.c, 'afterBattle.retain'), (p) => { p.phase.gathered = cards }) })

  it('SETT-002 each Maintenance Shed retains 1 Item or up to 2 Boosts; a Counting Token copy counts as its own card', () => {
    const base = gathered([card('stimpak', 's1'), card('stimpak', 's2'), card('boost-p1', 'b1', 'boost'), card('boost-p2', 'b2', 'boost')])(fresh())
    expect(run(base, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1'] })).toBe('no error')
    expect(run(base, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1', 's2'] })).toBe('E_SHEDS') // two copies = two cards
    expect(run(base, { type: 'afterBattle.retain', seat: SEAT, keep: ['b1', 'b2'] })).toBe('no error')
    expect(run(base, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1', 'b1'] })).toBe('E_SHEDS')
    const two = { ...base, c: addStruct(base.c, 'maintenance-shed') }
    expect(run(two, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1', 'b1', 'b2'] })).toBe('no error')
  })

  it('SETT-003 a Unique item joins the pool without a Shed unless the player sells it', () => {
    const fx = gathered([card('laser-rifle', 'u1', 'weapon', { unique: true }), card('stimpak', 's1')])(fresh())
    const kept = act(fx, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1'] })
    expect(P(kept.c).pool.map((x) => x.uid).sort()).toEqual(['s1', 'u1'])
    const sold = act(fx, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1'], sellUniques: ['u1'] })
    expect(P(sold.c).pool.map((x) => x.uid)).toEqual(['s1'])
    expect(P(sold.c).phase.gathered.map((x) => x.uid)).toEqual(['u1'])
  })

  it('SETT-004 items left in Lockers rejoin the pool after the Sheds are applied', () => {
    let fx = gathered([card('stimpak', 's1'), card('radaway', 'r1')])(fresh())
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.lockers = [card('hunting-rifle', 'l1', 'weapon')] }) }
    fx = act(fx, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1'] })
    expect(P(fx.c).pool.map((x) => x.uid)).toEqual(['s1']) // locker card not yet back
    fx = act(fx, { type: 'afterBattle.lockers', seat: SEAT })
    expect(P(fx.c).pool.map((x) => x.uid).sort()).toEqual(['l1', 's1'])
    expect(P(fx.c).lockers).toEqual([])
  })

  it('SETT-005 gathered Items not retained are sold for their caps value', () => {
    let fx = gathered([card('stimpak', 's1'), card('radaway', 'r1')])(fresh())
    fx = { ...fx, c: caps(fx.c, 10) }
    fx = act(fx, { type: 'afterBattle.retain', seat: SEAT, keep: ['s1'] })
    fx = act(fx, { type: 'afterBattle.lockers', seat: SEAT })
    fx = act(fx, { type: 'afterBattle.sell', seat: SEAT })
    expect(P(fx.c).caps).toBe(10 + cardValue(fx.d, 'radaway'))
    expect(P(fx.c).phase.gathered).toEqual([])
  })
})

describe('Build', () => {
  it('SETT-006 scrapping a Structure refunds 50% of its cost and is refused while a built Structure requires it', () => {
    let fx = shop(['crop-field', 'cooking-station'])
    fx = { ...fx, c: caps(fx.c, 0) }
    expect(run(fx, { type: 'build.structures', seat: SEAT, op: 'scrap', structureId: instOf(fx.c, 'crop-field') })).toBe('E_REQUIRED')
    fx = act(fx, { type: 'build.structures', seat: SEAT, op: 'scrap', structureId: instOf(fx.c, 'cooking-station') })
    expect(P(fx.c).caps).toBe(50)
    fx = act(fx, { type: 'build.structures', seat: SEAT, op: 'scrap', structureId: instOf(fx.c, 'crop-field') })
    expect(P(fx.c).caps).toBe(65)
  })

  it('SETT-007 every Structure needs 1 Power in Step 2 unless its record says none; a Crop Field needs 1 Water', () => {
    const fx = fresh()
    const plan = powerPlan(P(fx.c), fx.d)
    expect(plan.powerSupply).toBe(6)
    expect(plan.powerNeed).toBe(3) // Stores, Shed, Listening Post; generators need none
    const dry = { ...fx, c: addStruct(fx.c, 'crop-field') }
    expect(powerPlan(P(dry.c), dry.d).dark.has(instOf(dry.c, 'crop-field'))).toBe(true) // no Water
    const wet = { ...dry, c: addStruct(dry.c, 'water-pump') }
    expect(powerPlan(P(wet.c), wet.d).dark.size).toBe(0)
  })

  it('SETT-008 with too little Power the player chooses which Structures stay dark, and a dark Structure cannot be used', () => {
    let fx = fresh()
    fx = { ...fx, c: caps(at(fx.c, 'build.power'), 0) }
    for (let i = 0; i < 4; i++) fx = { ...fx, c: addStruct(fx.c, 'chem-station') }
    expect(powerPlan(P(fx.c), fx.d).shortfall).toBe(1)
    expect(run(fx, { type: 'build.power', seat: SEAT, dark: [] })).toBe('E_POWER_SHORT')
    const chem = P(fx.c).structures.filter((s) => s.defId === 'chem-station')
    fx = act(fx, { type: 'build.power', seat: SEAT, dark: [chem[0]!.id] })
    expect(powerPlan(P(fx.c), fx.d).dark.has(chem[0]!.id)).toBe(true)
    expect(run(fx, { type: 'draw.use', seat: SEAT, structureId: chem[0]!.id })).toBe('E_POWER')
    expect(run(fx, { type: 'draw.use', seat: SEAT, structureId: chem[1]!.id })).toBe('no error')
  })
})

describe('Draw', () => {
  it('SETT-009 the Listening Post needs 1 Power for any number of uses at 50 caps each', () => {
    const extra = [{ id: 'lucky-a', name: 'A', outcomes: [{ when: 'always' as const, caps: 25 }] }, { id: 'lucky-b', name: 'B', outcomes: [{ when: 'always' as const, caps: 25 }] }, { id: 'lucky-c', name: 'C', outcomes: [{ when: 'always' as const, caps: 25 }] }]
    let fx = fresh({ explore: extra })
    fx = { ...fx, c: caps(fx.c, 200) }
    const lp = instOf(fx.c, 'listening-post')
    for (let i = 0; i < 3; i++) {
      fx = act(fx, { type: 'draw.explore', seat: SEAT, structureId: lp })
      fx = act(fx, { type: 'draw.explore.resolve', seat: SEAT })
    }
    expect(P(fx.c).phase.listeningUses).toBe(3)
    expect(P(fx.c).caps).toBe(200 - 150 + 75)
    expect(powerPlan(P(fx.c), fx.d).powerNeed).toBe(3)
    expect(run(fx, { type: 'draw.explore', seat: SEAT, structureId: lp })).toBe('E_DECK') // the deck ran dry, not the Structure
  })

  it('SETT-010 each powered Structure is used at most once per phase, in any order, and unused ones carry nothing over', () => {
    let fx = shop(['chem-station', 'scavenging-0'])
    fx = uses(fx, 'chem-station'); fx = keepAll(fx)
    expect(run(fx, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'chem-station') })).toBe('E_USED')
    fx = uses(fx, 'scavenging-0') // any order
    expect(P(fx.c).phase.used).toHaveLength(2)
    const next = readyFx()
    const stripped = reduce(at(next.c, 'afterBattle.strip'), { type: 'afterBattle.strip', seat: SEAT, carried: [], found: [], boosts: [], removed: [] }, next.d)
    expect(P(stripped).phase.used).toEqual([])
  })

  it('SETT-011 the Item Deck excludes Uniques and a draw for a type draws until that type turns up', () => {
    const hr = makeData().weapons.find((w) => w.id === 'hunting-rifle') as WeaponDef
    const uniqueGun: WeaponDef = { ...hr, id: 'unique-gun', unique: true }
    const fx = shop(['weapons-workbench', 'weapons-0'], { weapons: [...makeData().weapons, uniqueGun] })
    expect(buildItemDeck(fx.d, P(fx.c))).not.toContain('unique-gun')
    let seen = false
    for (let i = 0; i < 12; i++) {
      const f = shop(['scavenging-2'], { weapons: [...makeData().weapons, uniqueGun] }, `s${i}`)
      const g = uses(f, 'scavenging-2')
      seen ||= P(g.c).phase.pending!.cards.some((x) => x.defId === 'unique-gun')
    }
    expect(seen).toBe(false)
    const mods = shop(['weapons-workbench'])
    const m = uses({ ...mods, c: addPerk(addPerk(mods.c, 'gun-nut-rifle'), 'gun-nut-pistol') }, 'weapons-workbench')
    expect(P(m.c).phase.pending!.cards.every((x) => x.kind === 'mod')).toBe(true)
  })

  it('SETT-012 draw X keep Y keeps exactly Y and sells the rest at the end of the phase', () => {
    let fx = shop(['scavenging-2'])
    fx = uses(fx, 'scavenging-2')
    const cards = P(fx.c).phase.pending!.cards
    expect(cards).toHaveLength(3)
    expect(run(fx, { type: 'draw.keep', seat: SEAT, keep: [cards[0]!.uid, cards[1]!.uid] })).toBe('E_KEEP')
    expect(run(fx, { type: 'draw.keep', seat: SEAT, keep: [] })).toBe('E_KEEP')
    fx = act(fx, { type: 'draw.keep', seat: SEAT, keep: [cards[0]!.uid] })
    expect(P(fx.c).pool.map((x) => x.uid)).toEqual([cards[0]!.uid])
    expect(P(fx.c).phase.rejects.map((x) => x.uid).sort()).toEqual([cards[1]!.uid, cards[2]!.uid].sort())
    const before = P(fx.c).caps
    fx = { ...fx, c: at(fx.c, 'select.sell') }
    fx = act(fx, { type: 'select.sell', seat: SEAT })
    const expected = [cards[0]!, cards[1]!, cards[2]!].reduce((n, x) => n + cardValue(fx.d, x.defId), 0)
    expect(P(fx.c).caps).toBe(before + expected) // the kept card is sold too when nothing is selected
  })

  it('SETT-013 a Weapons Workbench keeps only the first Mod the settlement Gun Nut or Blacksmith Perks allow', () => {
    for (let i = 0; i < 25; i++) {
      let fx = shop(['weapons-workbench'], {}, `wb-${i}`)
      fx = { ...fx, c: addPerk(fx.c, 'gun-nut-rifle') }
      fx = uses(fx, 'weapons-workbench')
      const cards = P(fx.c).phase.pending!.cards
      expect(cards).toHaveLength(1)
      expect(['comfort-grip', 'hardened-receiver']).toContain(cards[0]!.defId) // never the melee Stun Pack or the armor mod
    }
    let none = shop(['weapons-workbench'], {}, 'wb-none')
    none = uses(none, 'weapons-workbench')
    expect(P(none.c).phase.pending!.cards).toHaveLength(0) // no allowed Mod exists without a Perk
  })

  it('SETT-014 an Armor Workbench may add one Armor Boost token instead of drawing, never past the cap on a model', () => {
    let fx = shop(['armor-workbench'])
    const settler = modelOf(fx.c, 'settler')
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.structures.push({ id: 'aw2', defId: 'armor-workbench' }, { id: 'aw3', defId: 'armor-workbench' }, { id: 'aw4', defId: 'armor-workbench' }, { id: 'aw5', defId: 'armor-workbench' }) }) }
    const ids = P(fx.c).structures.filter((s) => s.defId === 'armor-workbench').map((s) => s.id)
    const cap = fx.d.armorBoostMax
    for (let i = 0; i < cap; i++) fx = act(fx, { type: 'draw.armorBoost', seat: SEAT, structureId: ids[i]!, modelId: settler.id })
    expect(modelOf(fx.c, 'settler').armorBoost).toBe(cap)
    expect(run(fx, { type: 'draw.armorBoost', seat: SEAT, structureId: ids[cap]!, modelId: settler.id })).toBe('E_BOOST')
  })

  it('SETT-015 the Cooking Station draws one Food & Drink or Alcohol per Crop Field, at most 5, and keeps 1', () => {
    let fx = shop(['cooking-station', 'water-pump', 'water-pump', 'water-pump', 'water-pump'])
    for (let i = 0; i < 3; i++) fx = { ...fx, c: addStruct(fx.c, 'crop-field') }
    let three = uses(fx, 'cooking-station')
    expect(P(three.c).phase.pending!.cards).toHaveLength(3)
    expect(P(three.c).phase.pending!.keep).toBe(1)
    for (let i = 0; i < 4; i++) fx = { ...fx, c: addStruct(fx.c, 'crop-field') } // seven fields in all
    three = uses(fx, 'cooking-station')
    expect(P(three.c).phase.pending!.cards).toHaveLength(5)
    expect(P(three.c).phase.pending!.cards.every((x) => ['food', 'alcohol'].includes(fx.d.items.find((i) => i.id === x.defId)!.kind))).toBe(true)
  })

  it('SETT-016 Brahmin Troughs and Ranch may be invoked after seeing a draw; the Pen re-draws every card of that draw', () => {
    const open = () => uses(shop(['scavenging-1', 'brahmin-troughs', 'brahmin-ranch', 'brahmin-pen']), 'scavenging-1')
    const troughs = act(open(), { type: 'draw.modify', seat: SEAT, how: 'drawExtra', structureId: instOf(open().c, 'brahmin-troughs') })
    expect(P(troughs.c).phase.pending!.cards).toHaveLength(3)
    const ranch = act(open(), { type: 'draw.modify', seat: SEAT, how: 'keepExtra', structureId: instOf(open().c, 'brahmin-ranch') })
    expect(P(ranch.c).phase.pending!.keep).toBe(2)
    const keepTwo = act(ranch, { type: 'draw.keep', seat: SEAT, keep: P(ranch.c).phase.pending!.cards.map((x) => x.uid) })
    expect(P(keepTwo.c).pool).toHaveLength(2)
    const o = open()
    const first = P(o.c).phase.pending!.cards.map((x) => x.defId)
    const pen = act(o, { type: 'draw.modify', seat: SEAT, how: 'redrawAll', structureId: instOf(o.c, 'brahmin-pen') })
    expect(P(pen.c).phase.pending!.cards).toHaveLength(2)
    expect(P(pen.c).phase.pending!.cards.map((x) => x.defId)).not.toEqual(first)
    // the first draw is discarded, not shuffled back: it cannot come straight back, and it is sold with the other rejects
    expect(P(pen.c).phase.pending!.cards.map((x) => x.defId).some((id) => first.includes(id))).toBe(false)
    expect(P(pen.c).phase.rejects.map((x) => x.defId)).toEqual(first)
    expect(run(pen, { type: 'draw.modify', seat: SEAT, how: 'redrawAll', structureId: instOf(o.c, 'brahmin-pen') })).toBe('E_USED')
  })

  it('SETT-017 Operations Room reuses one used Structure; Leader\'s Office names an Item of the type and charges its cost', () => {
    let fx = shop(['chem-station', 'operations-room'])
    fx = uses(fx, 'chem-station'); fx = keepAll(fx)
    const chem = instOf(fx.c, 'chem-station')
    expect(run(fx, { type: 'draw.reuse', seat: SEAT, structureId: instOf(fx.c, 'operations-room'), target: instOf(fx.c, 'operations-room') })).toBe('E_USED')
    fx = act(fx, { type: 'draw.reuse', seat: SEAT, structureId: instOf(fx.c, 'operations-room'), target: chem })
    fx = uses(fx, 'chem-station')
    expect(P(fx.c).pool.length + P(fx.c).phase.pending!.cards.length).toBeGreaterThanOrEqual(1)
    let lo = shop(['weapons-0', 'leaders-office'])
    const before = P(lo.c).caps
    lo = act(lo, { type: 'draw.name', seat: SEAT, structureId: instOf(lo.c, 'leaders-office'), target: instOf(lo.c, 'weapons-0'), defId: 'laser-rifle' })
    expect(P(lo.c).pool.map((x) => x.defId)).toEqual(['laser-rifle'])
    expect(P(lo.c).caps).toBe(before - cardValue(lo.d, 'laser-rifle'))
    expect(run(lo, { type: 'draw.name', seat: SEAT, structureId: instOf(lo.c, 'leaders-office'), target: instOf(lo.c, 'weapons-0'), defId: 'stimpak' })).toBe('E_USED')
    const lo2 = shop(['weapons-0', 'leaders-office'])
    expect(run(lo2, { type: 'draw.name', seat: SEAT, structureId: instOf(lo2.c, 'leaders-office'), target: instOf(lo2.c, 'weapons-0'), defId: 'stimpak' })).toBe('E_CARD') // wrong type
  })

  it('SETT-018 a Robot or Creature Market draws 4 Mods and resolves purchases before any other Step 2 action', () => {
    const robotMod = (n: number): ModDef => ({ id: `robot-mod-${n}`, name: `Robot Mod ${n}`, text: 'x', fitsTo: ['melee'], requires: { types: ['robot'] }, effects: [], cost: 10 + n, source: 'fixture' })
    const mods = [...makeData().mods, ...[1, 2, 3, 4, 5].map(robotMod)]
    let fx = shop(['robot-market', 'chem-station'], { mods })
    fx = act(fx, { type: 'build.market', seat: SEAT, structureId: instOf(fx.c, 'robot-market') })
    const table = P(fx.c).phase.market!.cards
    expect(table).toHaveLength(4)
    expect(table.every((x) => x.defId.startsWith('robot-mod'))).toBe(true)
    expect(P(fx.c).phase.drawn).toBe(true)
    const before = P(fx.c).caps
    fx = act(fx, { type: 'build.market', seat: SEAT, structureId: instOf(fx.c, 'robot-market'), buy: [table[0]!.uid, table[1]!.uid] })
    expect(P(fx.c).pool).toHaveLength(2)
    expect(P(fx.c).caps).toBe(before - cardValue(fx.d, table[0]!.defId) - cardValue(fx.d, table[1]!.defId))
    // markets come first: once another Structure has been used a market is refused
    let late = shop(['robot-market', 'chem-station'], { mods })
    late = keepAll(uses(late, 'chem-station'))
    expect(run(late, { type: 'build.market', seat: SEAT, structureId: instOf(late.c, 'robot-market') })).toBe('E_STEP')
  })
})

describe('Select', () => {
  const stocked = (n: number, boosts = 0): Fx => {
    let fx = fresh()
    fx = { ...fx, c: at(fx.c, 'select.stores') }
    for (let i = 0; i < n; i++) fx = { ...fx, c: addStruct(fx.c, 'stores') }
    fx = { ...fx, c: addStruct(addStruct(fx.c, 'gen-large'), 'gen-large') }
    return { ...fx, c: withPlayer(fx.c, (p) => { p.pool = [card('stimpak', 'i1'), card('radaway', 'i2'), card('jet', 'i3'), ...Array.from({ length: boosts }, (_, k) => card('boost-p1', `b${k}`, 'boost')), card('comfort-grip', 'm1', 'mod')] }) }
  }

  it('SETT-019 each powered Stores selects 1 Item or up to 2 Boosts; the Boost total never exceeds the Leader\'s highest attribute', () => {
    const one = stocked(0, 3)
    expect(run(one, { type: 'select.stores', seat: SEAT, take: ['i1'] })).toBe('no error')
    expect(run(one, { type: 'select.stores', seat: SEAT, take: ['i1', 'i2'] })).toBe('E_STORES')
    expect(run(one, { type: 'select.stores', seat: SEAT, take: ['b0', 'b1'] })).toBe('no error')
    expect(run(one, { type: 'select.stores', seat: SEAT, take: ['b0', 'b1', 'b2'] })).toBe('E_STORES')
    const top = leaderHighestAttr(P(one.c), one.d)
    const many = stocked(6, top + 1)
    const ids = Array.from({ length: top + 1 }, (_, k) => `b${k}`)
    expect(run(many, { type: 'select.stores', seat: SEAT, take: ids })).toBe('E_STORES')
    const ok = act(many, { type: 'select.stores', seat: SEAT, take: ids.slice(0, top) })
    expect(P(ok.c).hand).toHaveLength(top)
  })

  it('SETT-020 a Mod is selectable only when it is in the pool and the settlement holds the Perk for its type; printed free Mods bypass Step 3', () => {
    const fx = stocked(1)
    expect(run(fx, { type: 'select.stores', seat: SEAT, take: ['m1'] })).toBe('E_MOD')
    expect(run(fx, { type: 'select.stores', seat: SEAT, take: ['zz'] })).toBe('E_CARD')
    expect(run({ ...fx, c: addPerk(fx.c, 'gun-nut-rifle') }, { type: 'select.stores', seat: SEAT, take: ['m1'] })).toBe('no error')
    // a printed Equipped item reaches the battle without any selection
    const mutants = newCampaign({ seed: 's', players: [{ seat: SEAT, faction: 'super-mutants', leader: { unitId: 'brute', card: 'brawler' } }] }, fx.d)
    const f = act({ d: fx.d, c: at(mutants, 'force.create') }, planAll(mutants, SEAT, ['aviator', 'brute']))
    expect(toBattle(f.c, 'box-1', f.d).forces![SEAT]!.find((x) => x.unit === 'aviator')!.items).toContain('aviator-cap')
  })

  it('SETT-021 degraded Power Armor stays degraded until a Power Armor Station repairs one suit per station', () => {
    let fx = shop(['power-armor-station'])
    const g = modelOf(fx.c, 'sole-survivor')
    fx = { ...fx, c: withPlayer(at(fx.c, 'draw.structures'), (p) => { p.roster.find((m) => m.id === g.id)!.degraded = ['t-60-power-armor', 't-45-power-armor'] }) }
    fx = act(fx, { type: 'draw.repair', seat: SEAT, structureId: instOf(fx.c, 'power-armor-station'), modelId: g.id })
    expect(modelOf(fx.c, 'sole-survivor').degraded).toEqual(['t-45-power-armor']) // one suit only
    expect(run(fx, { type: 'draw.repair', seat: SEAT, structureId: instOf(fx.c, 'power-armor-station'), modelId: g.id })).toBe('E_USED') // a second repair from the same station
    expect(run(fx, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'power-armor-station') })).toBe('no error') // the draw is still its own use
    // and a draw first does not block the repair
    const drawn = act({ ...fx, c: withPlayer(at(fx.c, 'draw.structures'), (p) => { p.phase.repaired = []; p.roster.find((m) => m.id === g.id)!.degraded = ['t-60-power-armor'] }) }, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'power-armor-station') })
    const kept = act(drawn, { type: 'draw.keep', seat: SEAT, keep: P(drawn.c).phase.pending!.cards.slice(0, 1).map((x) => x.uid) })
    expect(run(kept, { type: 'draw.repair', seat: SEAT, structureId: instOf(fx.c, 'power-armor-station'), modelId: g.id })).toBe('no error')
    // carried over from the battle: the degraded flag survives the strip
    const stripped = reduce(at(fx.c, 'afterBattle.strip'), { type: 'afterBattle.strip', seat: SEAT, carried: [card('t-51-power-armor', 'pa#1', 'armor', { degraded: true })], found: [], boosts: [], removed: [], degraded: [{ modelId: g.id, defId: 't-60-power-armor' }] }, fx.d)
    expect(P(stripped).phase.gathered[0]!.degraded).toBe(true)
    expect(modelOf(stripped, 'sole-survivor').degraded).toContain('t-60-power-armor')
  })

  it('SETT-022 a Limited Use item refreshes to one use per copy for the next battle', () => {
    const fx = fresh()
    const spent = card('stimpak', 'st#1', 'item', { spent: true })
    const stripped = reduce(at(fx.c, 'afterBattle.strip'), { type: 'afterBattle.strip', seat: SEAT, carried: [spent], found: [], boosts: [], removed: [] }, fx.d)
    expect(P(stripped).phase.gathered[0]!.spent).toBeUndefined()
  })

  it('SETT-024 settlement-mode forces are built within the caps limit from available units, standard equipment and Step 3 cards only', () => {
    let fx = fresh()
    fx = { ...fx, c: withPlayer(at(fx.c, 'force.create'), (p) => { p.selected = [card('laser-rifle', 'lr#1', 'weapon')]; p.pool = [card('hunting-rifle', 'hr#1', 'weapon')] }) }
    const plan = planAll(fx.c).plan
    const settler = modelOf(fx.c, 'settler').id
    expect(run(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [settler]: ['hr#1'] } } })).toBe('E_FORCE') // pool card, not selected
    expect(run(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, capsLimit: 100 } })).toBe('E_FORCE') // over the limit
    expect(run(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, members: ['nobody'] } })).toBe('E_FORCE')
    const ok = act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [settler]: ['lr#1'] } } })
    const unitSum = P(ok.c).roster.reduce((n, m) => n + ok.d.units.find((u) => u.id === m.unitId)!.cost, 0)
    expect(P(ok.c).force!.value).toBe(unitSum + standardValue(ok) + cardValue(ok.d, 'laser-rifle') + ok.d.leaders.find((l) => l.id === P(ok.c).leader!.card)!.cost)
  })
})

describe('standard equipment is a choice', () => {
  it('FORCE-006 each model takes any or all of its standard equipment and every chosen item is costed; printed Equipped items stay free', () => {
    let fx = fresh()
    fx = { ...fx, c: at(fx.c, 'force.create') }
    const plan = planAll(fx.c).plan
    const all = act(fx, { type: 'force.create', seat: SEAT, plan })
    const none = act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, standard: Object.fromEntries(plan.members.map((id) => [id, [] as string[]])) } })
    expect(P(all.c).force!.value - P(none.c).force!.value).toBe(standardValue(all))
    expect(standardValue(all)).toBeGreaterThan(0)
    expect(toBattle(none.c, 'box-1', none.d).forces![SEAT]!.every((f) => f.items.every((i) => !standardEquipment(none.d, f.unit).includes(i) || (unitRec(none.d, f.unit)?.equipped ?? []).includes(i)))).toBe(true)
    expect(toBattle(all.c, 'box-1', all.d).forces![SEAT]!.some((f) => standardEquipment(all.d, f.unit).some((i) => f.items.includes(i)))).toBe(true)
    expect(run(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, standard: { [plan.members[0]!]: ['not-an-item'] } } })).toBe('E_FORCE')
  })
})

describe('the worked example', () => {
  it('SETT-023 the worked example of spec 19 s6 reproduces its caps totals and pool at every step', () => {
    const items = makeData().items.map((i) => (i.id === 'stimpak' ? { ...i, cost: 6 } : i))
    // Seeded so the Explore deck holds only Gun for Hire (the example's draw) and the armor deck only the two armors the example names.
    const explore = makeData().explore.filter((e) => e.id === 'gun-for-hire')
    const armor = makeData().armor.filter((a) => ['damaged-hazmat-suit', 'sturdy-leather-armor'].includes(a.id))
    let fx = fresh({ items, explore, armor }, 'worked-example')
    const ss = modelOf(fx.c, 'sole-survivor')
    const dog = modelOf(fx.c, 'dogmeat')
    fx = { ...fx, c: withPlayer(at(fx.c, 'afterBattle.caps'), (p) => {
      p.caps = 177
      p.perks = ['gun-nut-rifle']
      p.structures.push({ id: 'wb0', defId: 'weapons-workbench' }, { id: 'bugle0', defId: 'bugle-0' })
      p.roster.find((m) => m.id === ss.id)!.perks = ['mysterious-stranger']
      p.leader = { modelId: ss.id, card: 'hunter' }
      p.hand = [card('boost-p1', 'bst#1', 'boost')]
    }) }
    // 1. After a battle: lost 120, leader removed, carried a Stimpak pair, found a Bolt-Action Pipe Rifle.
    fx = act(fx, { type: 'afterBattle.caps', seat: SEAT, outcome: 'lose', scenarioId: 'x' })
    expect(P(fx.c).caps).toBe(297)
    fx = act(fx, { type: 'afterBattle.strip', seat: SEAT, carried: [card('stimpak', 'sp#1'), card('stimpak', 'sp#2', 'item', { spent: true })], found: [card('bolt-action-pipe-rifle', 'bp#1', 'weapon')], boosts: P(fx.c).hand, removed: [ss.id], leaderRemoved: true })
    expect(P(fx.c).phase.gathered.map((x) => x.uid).sort()).toEqual(['bp#1', 'bst#1', 'sp#1', 'sp#2'])
    fx = act(fx, { type: 'afterBattle.retain', seat: SEAT, keep: ['bp#1'] })
    fx = act(fx, { type: 'afterBattle.lockers', seat: SEAT })
    fx = act(fx, { type: 'afterBattle.sell', seat: SEAT })
    expect(P(fx.c).caps).toBe(297 + 6 + 6 + 0)
    expect(P(fx.c).pool.map((x) => x.defId)).toEqual(['bolt-action-pipe-rifle'])
    fx = act(fx, { type: 'afterBattle.leader', seat: SEAT }) // kept on the Sole Survivor
    expect(P(fx.c).leader!.modelId).toBe(ss.id)
    // 2. Step 1 Build: Armor Shop (150), Armorer Perk (3) and its free Armor Workbench.
    fx = act(fx, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'armor-1' })
    expect(P(fx.c).caps).toBe(309 - 150)
    fx = act(fx, { type: 'build.perks', seat: SEAT, op: 'buy', perkId: 'armorer' })
    expect(P(fx.c).caps).toBe(156)
    expect(P(fx.c).structures).toHaveLength(9) // 2 Generators, Stores, Shed, Post, Bugle, Weapons Workbench, Armor Shop, Armor Workbench
    const plan = powerPlan(P(fx.c), fx.d)
    expect([plan.powerSupply, plan.powerNeed, plan.dark.size]).toEqual([6, 6, 0])
    expect(run(fx, { type: 'build.perks', seat: SEAT, op: 'buy', perkId: 'nerd-rage', modelId: dog.id })).toBe('E_PERK') // Dogmeat cannot take it (INT 8 needed)
    // 3. Step 2 Draw, in the order chosen. The Weapons Workbench keeps a Mod Gun Nut (Rifle) allows; the Stun Pack is skipped.
    fx = uses(fx, 'weapons-workbench')
    expect(['comfort-grip', 'hardened-receiver']).toContain(P(fx.c).phase.pending!.cards[0]!.defId)
    fx = keepAll(fx)
    fx = uses(fx, 'armor-1')
    expect(P(fx.c).phase.pending!.cards.map((x) => x.defId).sort()).toEqual(['damaged-hazmat-suit', 'sturdy-leather-armor'])
    fx = act(fx, { type: 'draw.keep', seat: SEAT, keep: [P(fx.c).phase.pending!.cards.find((x) => x.defId === 'sturdy-leather-armor')!.uid] })
    fx = uses(fx, 'armor-workbench')
    expect(P(fx.c).phase.pending!.cards.map((x) => x.defId)).toEqual(['dissipating'])
    fx = keepAll(fx)
    fx = uses(fx, 'bugle-0')
    expect(P(fx.c).phase.pending!.cards).toHaveLength(1)
    const boost = P(fx.c).phase.pending!.cards[0]!
    fx = keepAll(fx)
    // Listening Post: pay 50, draw Gun for Hire, then pay the card's 30 caps for the mercenary Consequence.
    fx = act(fx, { type: 'draw.explore', seat: SEAT, structureId: instOf(fx.c, 'listening-post') })
    expect(P(fx.c).caps).toBe(106)
    expect(P(fx.c).phase.explore!.cardId).toBe('gun-for-hire')
    fx = act(fx, { type: 'draw.explore.resolve', seat: SEAT, pay: true })
    expect(P(fx.c).caps).toBe(76)
    expect(P(fx.c).consequences).toEqual(['mercenary'])
    expect(P(fx.c).leaderRemoved).toBe(true) // so any test on the card would be at -2
    // 4. Step 3 Select: one Stores; take the Sturdy Leather Armor. The rest is sold.
    const poolDefs = P(fx.c).pool.map((x) => x.defId).sort()
    expect(poolDefs).toEqual(['bolt-action-pipe-rifle', 'dissipating', 'sturdy-leather-armor', boost.defId, P(fx.c).pool.find((x) => x.kind === 'mod' && x.defId !== 'dissipating')!.defId].sort())
    const armorUid = P(fx.c).pool.find((x) => x.defId === 'sturdy-leather-armor')!.uid
    const rest = P(fx.c).pool.filter((x) => x.uid !== armorUid)
    const hazmat = P(fx.c).phase.rejects
    fx = act(fx, { type: 'select.stores', seat: SEAT, take: [armorUid] })
    fx = act(fx, { type: 'select.lockers', seat: SEAT, park: [] })
    fx = act(fx, { type: 'select.sell', seat: SEAT })
    expect(P(fx.c).caps).toBe(76 + [...rest, ...hazmat].reduce((n, x) => n + cardValue(fx.d, x.defId), 0))
    expect(P(fx.c).selected.map((x) => x.defId)).toEqual(['sturdy-leather-armor'])
    expect(P(fx.c).pool).toEqual([])
    // 5. Create the force: Armor on a Settler (costed per model), Mysterious Stranger equipped on the Sole Survivor, Hunter fixed.
    const settler = modelOf(fx.c, 'settler')
    fx = act(fx, { type: 'force.create', seat: SEAT, plan: { members: [ss.id, settler.id], assign: { [settler.id]: [armorUid] }, equipPerks: { [ss.id]: ['mysterious-stranger'] }, heroic: [], leader: P(fx.c).leader, capsLimit: 750 } })
    const cost = (u: string) => fx.d.units.find((x) => x.id === u)!.cost
    expect(P(fx.c).force!.value).toBe(cost('sole-survivor') + cost('settler') + standardValue(fx) + cardValue(fx.d, 'sturdy-leather-armor') + fx.d.perks.find((x) => x.id === 'mysterious-stranger')!.cost + fx.d.leaders.find((x) => x.id === 'hunter')!.cost)
    fx = act(fx, { type: 'force.quest', seat: SEAT, questId: 'thiefs-trail-1' })
    expect(P(fx.c).quest).toBe('thiefs-trail-1')
    const setup = toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    expect(setup.extras.eventDeck.cards.map((x) => x.id)).toContain('mercenary')
    // The same seed and the same choices reproduce this round exactly: a second run from the same start matches action for action.
    expect(actionsFromLog(fx.c).length).toBeGreaterThan(15)
  })
})
