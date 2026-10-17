// CAMP-001..017 (spec 19, checklist 12). Fixtures: tests/campaign/fixtures.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { fromBattle, toBattle } from '../../src/campaign/battle'
import { capsAward, newCampaign, reduce, tryReduce } from '../../src/campaign/reducer'
import { slotsTotal, slotsUsed } from '../../src/campaign/rules'
import { SEQUENCE, autoAdvance } from '../../src/campaign/sequence'
import { clearCampaign, loadCampaign, saveCampaign, startNewCampaign, STORE_KEY } from '../../src/campaign/store'
import { readRaw } from '../../src/client/store/storage'
import { CampaignError, type CampaignAction } from '../../src/campaign/types'
import { SEAT, P, act, addStruct, at, caps, card, fresh, makeData, modelOf, finished, planAll, readyFx, standardValue, withPlayer } from './fixtures'

const code = (f: () => unknown): string => { try { f(); return 'no error' } catch (e) { return e instanceof CampaignError ? e.code : String(e) } }

describe('campaign start and sequence', () => {
  it('CAMP-001 a new campaign starts at 0 caps with the free starting settlement', () => {
    const { c, d } = fresh()
    const p = P(c)
    expect(p.caps).toBe(0)
    const count = (id: string) => p.structures.filter((s) => s.defId === id).length
    expect([count('gen-small'), count('stores'), count('maintenance-shed'), count('listening-post')]).toEqual([2, 1, 1, 1])
    expect(slotsTotal(p, d)).toBe(15)
    expect(p.land).toBe(0)
    expect(slotsUsed(p)).toBe(5)
  })

  it('CAMP-002 the sequence runs After a Battle, Build, Draw, Select, force, and never returns to Build after a Step 2 draw', () => {
    const groups = SEQUENCE.map((s) => s.group)
    expect([...new Set(groups)]).toEqual(['afterBattle', 'build', 'draw', 'select', 'force', 'battle'])
    expect(SEQUENCE.map((s) => s.id)).toEqual([
      'afterBattle.caps', 'afterBattle.strip', 'afterBattle.retain', 'afterBattle.lockers', 'afterBattle.sell', 'afterBattle.leader',
      'build.market', 'build.structures', 'build.perks', 'build.power', 'draw.structures', 'draw.explore',
      'select.stores', 'select.lockers', 'select.sell', 'force.create', 'force.quest', 'toBattle',
    ])
    let fx = fresh()
    fx = { ...fx, c: caps(addStruct(at(fx.c, 'build.structures'), 'chem-station'), 300) }
    fx = act(fx, { type: 'draw.use', seat: SEAT, structureId: P(fx.c).structures.find((s) => s.defId === 'chem-station')!.id })
    expect(P(fx.c).phase.drawn).toBe(true)
    expect(code(() => reduce(fx.c, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'gen-small' }, fx.d))).toBe('E_BUILD_CLOSED')
    expect(code(() => reduce(fx.c, { type: 'build.perks', seat: SEAT, op: 'buy', perkId: 'gun-nut-rifle' }, fx.d))).toBe('E_BUILD_CLOSED')
  })

  it('CAMP-003 the winner gains 200 caps and the loser 120; a draw pays both 200', () => {
    const { d } = fresh()
    expect(capsAward(d, { outcome: 'win' })).toBe(200)
    expect(capsAward(d, { outcome: 'lose' })).toBe(120)
    expect(capsAward(d, { outcome: 'draw' })).toBe(200)
    const fx = fresh()
    const after = reduce(withPlayer(at(fx.c, 'afterBattle.caps'), (p) => { p.caps = 177 }), { type: 'afterBattle.caps', seat: SEAT, outcome: 'lose' }, fx.d)
    expect(P(after).caps).toBe(297)
  })

  it('CAMP-004 both players gain 50 extra caps when both forces were 1,000 caps or more', () => {
    const { d } = fresh()
    expect(capsAward(d, { outcome: 'win', bigForce: true })).toBe(250)
    expect(capsAward(d, { outcome: 'lose', bigForce: true })).toBe(170)
    expect(capsAward(d, { outcome: 'lose', bigForce: false })).toBe(120)
  })

  it('CAMP-005 a scenario caps award replaces the default only for the outcomes it names', () => {
    const { d } = fresh()
    expect(capsAward(d, { outcome: 'win', scenarioId: 'police-defense' })).toBe(150)
    expect(capsAward(d, { outcome: 'lose', scenarioId: 'police-defense' })).toBe(120) // unnamed -> default
    expect(capsAward(d, { outcome: 'win', scenarioId: 'no-such-record' })).toBe(200)
    expect(capsAward(d, { outcome: 'win', scenarioCaps: 500 })).toBe(500)
  })

  it('CAMP-006 fromBattle reads GameResult.caps first and the default table second', () => {
    const fx = readyFx()
    const won = finished(fx, 'box-1', { winner: 'A', level: 'major', reason: 'test', caps: 333 })
    expect(P(fromBattle(fx.c, won.state, fx.d)).caps).toBe(333)
    const noCaps = finished(fx, 'box-1', { winner: 'A', reason: 'test' })
    expect(P(fromBattle(fx.c, noCaps.state, fx.d)).caps).toBe(200)
    const lost = finished(fx, 'box-1', { winner: 'B', reason: 'test', caps: 999 })
    expect(P(fromBattle(fx.c, lost.state, fx.d)).caps).toBe(120)
  })

  it('CAMP-007 a removed model returns with all its Perks; nothing is eliminated, injured or given experience', () => {
    let fx = readyFx()
    const settler = modelOf(fx.c, 'settler')
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.roster.find((m) => m.id === settler.id)!.perks.push('mysterious-stranger') }) }
    const { state } = finished(fx, 'box-1', { winner: 'B', reason: 'test' }, (s) => {
      const m = Object.values(s.models).find((x) => x.profileId === 'settler' && x.owner === SEAT)!
      m.life = 'dead'
    })
    const after = fromBattle(fx.c, state, fx.d)
    const back = P(after).roster.find((m) => m.id === settler.id)!
    expect(back.perks).toEqual(['mysterious-stranger'])
    expect(back.injuries).toEqual([])
    expect(back.xp).toBe(0)
    expect(P(after).roster.length).toBe(P(fx.c).roster.length)
  })

  it('CAMP-008 draws derive from the campaign seed, round, step and index, so a replay gives the same cards', () => {
    const run = (seed: string) => {
      let fx = fresh({}, seed)
      fx = { ...fx, c: caps(addStruct(at(fx.c, 'build.structures'), 'scavenging-2'), 0) }
      fx = act(fx, { type: 'draw.use', seat: SEAT, structureId: P(fx.c).structures.find((s) => s.defId === 'scavenging-2')!.id })
      return P(fx.c).phase.pending!.cards.map((x) => x.defId)
    }
    expect(run('seed-1')).toEqual(run('seed-1'))
    expect(run('seed-1')).not.toEqual(run('seed-2'))
    expect(run('seed-1')).toHaveLength(3)
  })
})

describe('forces from the roster', () => {
  it('CAMP-009 toBattle builds forces from the roster, standard equipment, Step 3 selections and equipped Perks only', () => {
    let fx = fresh({}, 'seed-1')
    const ss = modelOf(fx.c, 'sole-survivor')
    fx = { ...fx, c: withPlayer(at(fx.c, 'force.create'), (p) => {
      p.roster.find((m) => m.id === ss.id)!.perks.push('mysterious-stranger')
      p.selected = [card('combat-shotgun', 'cs#1', 'weapon')]
      p.pool = [card('laser-rifle', 'lr#1', 'weapon')] // in the pool but not selected
    }) }
    const plan = planAll(fx.c).plan
    fx = act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [ss.id]: ['cs#1'] }, equipPerks: { [ss.id]: ['mysterious-stranger'] } } })
    const setup = toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    const f = setup.forces![SEAT]!.find((x) => x.unit === 'sole-survivor') as { items: string[]; perks: string[]; leader?: string }
    expect(f.items).toContain('combat-shotgun')
    expect(f.items).not.toContain('laser-rifle')
    expect(f.perks).toEqual(['mysterious-stranger'])
    expect(setup.forces![SEAT]!.every((x) => x.count === 1)).toBe(true)
    expect(setup.seats).toEqual([SEAT, 'B'])
  })

  it('CAMP-010 equipped items printed on a unit card are always carried and cost nothing in a settlement force', () => {
    let fx = fresh({}, 'seed-1')
    fx = { ...fx, c: newCampaign({ seed: 's', players: [{ seat: SEAT, faction: 'super-mutants', leader: { unitId: 'brute', card: 'brawler' } }] }, fx.d) }
    fx = { ...fx, c: at(fx.c, 'force.create') }
    const av = modelOf(fx.c, 'aviator')
    const plan = planAll(fx.c, SEAT, ['aviator', 'brute']).plan
    fx = act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, leader: P(fx.c).leader } })
    const unitCost = fx.d.units.find((u) => u.id === 'aviator')!.cost + fx.d.units.find((u) => u.id === 'brute')!.cost
    expect(P(fx.c).force!.value).toBe(unitCost + standardValue(fx) + fx.d.leaders.find((l) => l.id === 'brawler')!.cost) // printed Equipped is free; chosen standard gear is costed
    const setup = toBattle(fx.c, 'box-1', fx.d)
    expect(setup.forces![SEAT]!.find((x) => x.unit === 'aviator')!.items).toContain('aviator-cap')
    expect(av.unitId).toBe('aviator')
  })

  it('CAMP-011 standard equipment is never shared between units and ignores item minimum requirements', () => {
    let fx = fresh({}, 'seed-1')
    fx = { ...fx, c: newCampaign({ seed: 's', players: [{ seat: SEAT, faction: 'super-mutants', leader: { unitId: 'brute', card: 'brawler' } }] }, fx.d) }
    fx = act({ ...fx, c: at(fx.c, 'force.create') }, { type: 'roster.add', seat: SEAT, unitId: 'super-mutant' })
    const plan = planAll(fx.c, SEAT, ['super-mutant', 'brute']).plan
    fx = act(fx, { type: 'force.create', seat: SEAT, plan })
    const mutants = toBattle(fx.c, 'box-1', fx.d).forces![SEAT]!.filter((x) => x.unit === 'super-mutant')
    expect(mutants).toHaveLength(2)
    for (const m of mutants) expect(m.items).toEqual(expect.arrayContaining(['board', 'bolt-action-pipe-rifle']))
  })

  it('CAMP-012 the caps balance persists between battles and never goes below 0', () => {
    const fx = fresh()
    const f = caps(at(fx.c, 'build.structures'), 40)
    const r = tryReduce(f, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'gen-small' }, fx.d)
    expect(r.ok).toBe(false)
    expect(P(f).caps).toBe(40)
    const rf = readyFx()
    const kept = finished({ ...rf, c: caps(rf.c, 77) }, 'box-1', { winner: 'B', reason: 'x' })
    expect(P(fromBattle(caps(rf.c, 77), kept.state, rf.d)).caps).toBe(77 + 120)
  })

  it('CAMP-013 Land costs 500 caps or five completed Quest cards (parts count separately) and adds 10 slots', () => {
    let fx = fresh()
    fx = { ...fx, c: caps(at(fx.c, 'build.structures'), 600) }
    fx = act(fx, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'land' })
    expect(P(fx.c).land).toBe(1)
    expect(P(fx.c).caps).toBe(100)
    expect(slotsTotal(P(fx.c), fx.d)).toBe(25)
    const q = withPlayer(fx.c, (p) => { p.quests = [{ title: 'a', card: 'a-2', completed: ['a-1', 'a-2a', 'a-2b'], failed: [] }, { title: 'b', card: 'b', completed: ['b'], failed: [] }] })
    expect(code(() => reduce(q, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'land', pay: 'quests' }, fx.d))).toBe('E_LAND') // 4 cards
    const q5 = withPlayer(q, (p) => { p.quests[1]!.completed.push('b-2') })
    const done = reduce(q5, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'land', pay: 'quests' }, fx.d)
    expect(P(done).land).toBe(2)
    expect(P(done).caps).toBe(100)
    expect(P(done).questsSpent).toBe(5)
  })

  it('CAMP-014 a Structure purchase is refused when slots are full or a required Perk or Structure is missing', () => {
    const fx = fresh()
    const base = caps(at(fx.c, 'build.structures'), 5000)
    expect(code(() => reduce(base, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'weapons-workbench' }, fx.d))).toBe('E_BUY') // no Gun Nut
    expect(code(() => reduce(base, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'cooking-station' }, fx.d))).toBe('E_BUY') // no Crop Field
    expect(code(() => reduce(base, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'listening-post' }, fx.d))).toBe('E_BUY') // max 1
    let full = base
    for (let i = 0; i < 10; i++) full = addStruct(full, 'water-pump')
    expect(slotsUsed(P(full))).toBe(15)
    expect(code(() => reduce(full, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'gen-small' }, fx.d))).toBe('E_BUY')
    const withLand = reduce(full, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'land' }, fx.d)
    expect(code(() => reduce(withLand, { type: 'build.structures', seat: SEAT, op: 'buy', defId: 'gen-small' }, fx.d))).toBe('no error')
  })

  it('CAMP-015 a Leader removed in the last battle may be reassigned once, before the Settlement Phase, never during it', () => {
    const fx = fresh()
    const settler = modelOf(fx.c, 'settler')
    const strip: Extract<CampaignAction, { type: 'afterBattle.strip' }> = { type: 'afterBattle.strip', seat: SEAT, carried: [], found: [], boosts: [], removed: [P(fx.c).leader!.modelId], leaderRemoved: true }
    let c = reduce(at(fx.c, 'afterBattle.strip'), strip, fx.d)
    expect(P(c).leaderRemoved).toBe(true)
    c = reduce(c, { type: 'afterBattle.leader', seat: SEAT, modelId: settler.id, card: 'hunter' }, fx.d)
    expect(P(c).leader).toEqual({ modelId: settler.id, card: 'hunter' })
    expect(code(() => reduce(c, { type: 'afterBattle.leader', seat: SEAT, modelId: modelOf(fx.c, 'dogmeat').id }, fx.d))).toBe('E_LEADER')
    const during = at(c, 'build.structures')
    expect(code(() => reduce(during, { type: 'afterBattle.leader', seat: SEAT, modelId: modelOf(fx.c, 'dogmeat').id }, fx.d))).toBe('E_STEP')
    // a Leader who was not removed cannot be moved
    const kept = reduce(at(fx.c, 'afterBattle.strip'), { ...strip, removed: [], leaderRemoved: false }, fx.d)
    expect(code(() => reduce(kept, { type: 'afterBattle.leader', seat: SEAT, modelId: settler.id }, fx.d))).toBe('E_LEADER')
  })

  it('CAMP-016 linked scenario results store a Campaign Consequence that the named later scenario applies', () => {
    const fx = readyFx()
    const { state } = finished(fx, 'farm', { winner: 'A', level: 'major', reason: 'test' })
    const after = fromBattle(fx.c, state, fx.d)
    const linked = P(after).linked
    expect(linked.map((l) => l.scenarioId).sort()).toEqual(['fort', 'newshound'])
    const next = toBattle({ ...after, players: after.players.map((p) => ({ ...p, force: fx.c.players[0]!.force })) }, 'newshound', fx.d, { opponent: 'bot' })
    expect(next.extras.linked[SEAT]!.map((x) => x.freeCards).flat().filter(Boolean)).toEqual(['10mm-pistol'])
    const fin = toBattle({ ...after, players: after.players.map((p) => ({ ...p, force: fx.c.players[0]!.force })) }, 'fort', fx.d, { opponent: 'bot' })
    expect(fin.extras.linked[SEAT]![0]!.capsLimitDelta).toBe(-50)
    // the free cards and the Caps change take effect for the force built after the battle that makes their scenario next
    expect(P(after).rewards.map((x) => x.defId)).toEqual(['10mm-pistol'])
    expect(P(after).capsLimitDelta ?? 0).toBe(0)
    const second = { ...fx, c: { ...after, players: after.players.map((p) => ({ ...p, force: fx.c.players[0]!.force })) } }
    const afterSecond = fromBattle(second.c, finished(second, 'newshound', { winner: 'A', level: 'major', reason: 'test' }).state, fx.d)
    expect(P(afterSecond).capsLimitDelta).toBe(-50)
    const roomy = { ...fx, c: at(afterSecond, 'force.create') }
    const plan = planAll(roomy.c).plan
    const low = P(act(roomy, { type: 'force.create', seat: SEAT, plan }).c).force!.value
    expect(code(() => reduce(roomy.c, { type: 'force.create', seat: SEAT, plan: { ...plan, capsLimit: low + 49 } }, fx.d))).toBe('E_FORCE') // the limit is 50 lower
    expect(P(act(roomy, { type: 'force.create', seat: SEAT, plan: { ...plan, capsLimit: low + 50 } }).c).force!.capsLimit).toBe(low)
    // a minor result stores nothing for this table
    const minor = finished(fx, 'farm', { winner: 'A', level: 'minor', reason: 'test' })
    expect(P(fromBattle(fx.c, minor.state, fx.d)).linked).toEqual([])
  })
})

describe('the campaign save', () => {
  afterEach(() => clearCampaign())

  it('CAMP-017 the store key fell-in.campaign.v1 holds one campaign; starting a new one asks before replacing', () => {
    expect(STORE_KEY).toBe('fell-in.campaign.v1')
    const d = makeData()
    const a = newCampaign({ seed: 'one', players: [{ seat: SEAT, faction: 'survivors' }] }, d)
    const b = newCampaign({ seed: 'two', players: [{ seat: SEAT, faction: 'survivors' }] }, d)
    expect(startNewCampaign(a, () => false)).toBe(true) // nothing saved yet: no question
    expect(startNewCampaign(b, () => false)).toBe(false) // a save exists and the answer was no
    expect((loadCampaign('1e') as { campaign: { id: string } }).campaign.id).toBe(a.id)
    expect(startNewCampaign(b, () => true)).toBe(true)
    expect((loadCampaign('1e') as { campaign: { id: string } }).campaign.id).toBe(b.id)
    expect(readRaw(STORE_KEY)).not.toBeNull()
    // a save from another edition or version is refused with a message, never migrated silently
    expect(loadCampaign('2e')).toMatchObject({ ok: false, reason: 'edition' })
    saveCampaign({ ...b, version: 2 as unknown as 1 })
    expect(loadCampaign()).toMatchObject({ ok: false, reason: 'version' })
  })
})

describe('auto-advance', () => {
  it('CAMP-002 steps with nothing to decide advance on their own and stop at the first decision', () => {
    const fx = fresh()
    const c = autoAdvance(fx.c, SEAT, fx.d)
    expect(P(c).step).toBe('force.create')
  })
})
