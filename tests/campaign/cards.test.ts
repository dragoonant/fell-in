// BOOST-, QUEST-, EVENT- and EXPL- checklist IDs (spec 19 s2, s4.2).
import { describe, expect, it } from 'vitest'
import { beginBattle, fromBattle, questView, toBattle } from '../../src/campaign/battle'
import * as boosts from '../../src/campaign/boosts'
import { buildItemDeck } from '../../src/campaign/decks'
import * as ev from '../../src/campaign/events'
import { eventRules, fortunateDeflection, runHook, secondChance } from '../../src/campaign/hooks'
import { Stream, streamFor } from '../../src/campaign/rand'
import { exploreSv, newCampaign, reduce } from '../../src/campaign/reducer'
import { leaderHighestAttr } from '../../src/campaign/rules'
import { CampaignError, type CampaignAction } from '../../src/campaign/types'
import { SEAT, P, act, at, caps, card, finished, fresh, instOf, makeData, modelOf, planAll, readyFx, withPlayer, type Fx } from './fixtures'
import { deriveSeed } from '../../src/engine/rng'

const code = (f: () => unknown): string => { try { f(); return 'no error' } catch (e) { return e instanceof CampaignError ? e.code : String(e) } }
const run = (fx: Fx, a: CampaignAction): string => code(() => reduce(fx.c, a, fx.d))
const stream = (n = 0) => new Stream(deriveSeed('events', n))

describe('Boosts', () => {
  it('BOOST-001 without a settlement the hand holds up to half the Leader\'s highest attribute, rounded up', () => {
    const fx = fresh()
    const top = leaderHighestAttr(P(fx.c), fx.d)
    expect(top).toBe(7)
    expect(boosts.handLimitNoSettlement(7)).toBe(4)
    expect(boosts.handLimitNoSettlement(6)).toBe(3)
    expect(boosts.handLimit(P(fx.c), fx.d, false)).toBe(4)
    expect(boosts.handLimit(P(fx.c), fx.d, true)).toBe(7)
  })

  it('BOOST-002 the hand is hidden from other seats; its size is public', () => {
    const hand = [card('boost-p1', 'b1', 'boost'), card('boost-c1', 'b2', 'boost')]
    expect(boosts.handView('A', hand, 'A').cards).toHaveLength(2)
    const other = boosts.handView('A', hand, 'B')
    expect(other.cards).toBeNull()
    expect(other.size).toBe(2)
  })

  it('BOOST-003 at most one Boost resolves per Action; a used Boost is discarded', () => {
    let t: boosts.BoostTurn = { hand: [card('boost-p1', 'b1', 'boost'), card('boost-c1', 'b2', 'boost')], discard: [], usedThisAction: false }
    t = boosts.playBoost(t, 'b1')
    expect(t.discard.map((c) => c.uid)).toEqual(['b1'])
    expect(t.hand.map((c) => c.uid)).toEqual(['b2'])
    expect(() => boosts.playBoost(t, 'b2')).toThrow(/one Boost per Action/)
    expect(boosts.playBoost(boosts.newAction(t), 'b2').hand).toEqual([])
  })

  it('BOOST-004 Second Chance re-rolls an X result and the X+AP face without keeping the AP', () => {
    expect(secondChance({ value: 'X' }, { value: 6 })).toEqual({ face: { value: 6, ap: 0 }, allowed: true })
    const xap = secondChance({ value: 'X', ap: 1 }, { value: 9 })
    expect(xap.allowed).toBe(true)
    expect(xap.face).toEqual({ value: 9, ap: 0 }) // the old AP is gone
    expect(secondChance({ value: 4 }, { value: 1 }).allowed).toBe(false)
    expect(fortunateDeflection(3)).toBe(2) // one damage icon, not one point
  })

  it('BOOST-005 a Quest reward meant for settlements may be swapped for 2 random Boosts at the next battle\'s start', () => {
    let fx: Fx = readyFx()
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.quest = 'thiefs-trail-1' }) }
    fx = act(fx, { type: 'quest.complete', seat: SEAT, cardId: 'thiefs-trail-1', swapReward: true })
    expect(P(fx.c).boostsOwed).toBe(2)
    // the owed Boosts are drawn into the hand by a logged action at the end of the next settlement phase
    fx = act({ ...fx, c: at(fx.c, 'force.quest') }, { type: 'force.quest', seat: SEAT, questId: null })
    expect(P(fx.c).boostsOwed).toBe(0)
    expect(P(fx.c).hand).toHaveLength(2)
    const setup = toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    expect(setup.extras.hands[SEAT]).toHaveLength(2)
    expect(setup.extras.hands[SEAT]!.every((c) => c.kind === 'boost')).toBe(true)
    expect(toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' }).extras.hands[SEAT]!.map((c) => c.defId)).toEqual(setup.extras.hands[SEAT]!.map((c) => c.defId))
    const { state } = finished(fx, 'box-1', { winner: 'A', reason: 'x' })
    const after = fromBattle(fx.c, state, fx.d)
    expect(P(after).boostsOwed).toBe(0)
    expect(P(after).phase.gathered.filter((x) => x.kind === 'boost')).toHaveLength(2) // unused owed Boosts come back through the strip
  })
})

describe('Quests', () => {
  const quest = (fx: Fx, id: string): Fx => act({ ...fx, c: at(fx.c, 'force.quest') }, { type: 'force.quest', seat: SEAT, questId: id })

  it('QUEST-001 one Quest is chosen at battle start and cannot change; the opponent sees that one exists, not which', () => {
    let fx = quest(readyFx(), 'lost-journal')
    expect(P(fx.c).quest).toBe('lost-journal')
    const b = beginBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    expect(code(() => reduce(b.campaign, { type: 'force.quest', seat: SEAT, questId: null }, fx.d))).toBe('E_STEP')
    expect(b.setup.extras.quests[SEAT]).toBe('lost-journal')
    expect(questView(SEAT, 'lost-journal', 'B')).toEqual({ owner: SEAT, inPlay: true, id: null })
    expect(questView(SEAT, 'lost-journal', SEAT).id).toBe('lost-journal')
    fx = quest(fx, 'lost-journal')
  })

  it('QUEST-002 a multi-part Quest starts at Part 1 and advances only to the part the completed card names', () => {
    let fx = quest(readyFx(), 'thiefs-trail') // by title: Part 1
    expect(P(fx.c).quest).toBe('thiefs-trail-1')
    expect(run(fx, { type: 'quest.complete', seat: SEAT, cardId: 'thiefs-trail-1', next: 'lost-journal' })).toBe('E_QUEST')
    fx = act(fx, { type: 'quest.complete', seat: SEAT, cardId: 'thiefs-trail-1', next: 'thiefs-trail-2b' })
    expect(P(fx.c).quests[0]).toMatchObject({ title: 'thiefs-trail', card: 'thiefs-trail-2b', completed: ['thiefs-trail-1'] })
    fx = quest({ ...fx, c: at(fx.c, 'force.quest') }, 'thiefs-trail')
    expect(P(fx.c).quest).toBe('thiefs-trail-2b') // the part the card named
  })

  it('QUEST-003 rewards apply at battle end; after completing a card no second Quest starts that battle', () => {
    let fx = quest(readyFx(), 'thiefs-trail-1')
    const before = P(fx.c).caps
    fx = act(fx, { type: 'quest.complete', seat: SEAT, cardId: 'thiefs-trail-1' })
    expect(P(fx.c).caps).toBe(before + 50)
    expect(P(fx.c).quest).toBeNull()
    expect(run(fx, { type: 'quest.complete', seat: SEAT, cardId: 'thiefs-trail-2a' })).toBe('E_QUEST')
    // through fromBattle the reward is paid after the strip, so it reaches the next battle
    const q = quest(readyFx(), 'thiefs-trail-1')
    const { state } = finished(q, 'box-1', { winner: 'B', reason: 'x' })
    const after = fromBattle(q.c, state, q.d, { questsCompleted: { [SEAT]: { cardId: 'thiefs-trail-1' } } })
    expect(P(after).caps).toBe(120 + 50)
    expect(P(after).rewards.map((x) => x.defId)).toEqual(['laser-pistol'])
  })

  it('QUEST-004 a failed Quest may be retried in a later battle unless its card forbids it; each card completes once per player', () => {
    const q = quest(readyFx(), 'lost-journal')
    const { state } = finished(q, 'box-1', { winner: 'B', reason: 'x' })
    const failed = fromBattle(q.c, state, q.d)
    expect(P(failed).quests[0]).toMatchObject({ title: 'lost-journal', failed: ['lost-journal'], completed: [] })
    expect(P(failed).quest).toBeNull()
    const again = act({ d: q.d, c: at(failed, 'force.quest') }, { type: 'force.quest', seat: SEAT, questId: 'lost-journal' })
    expect(P(again.c).quest).toBe('lost-journal')
    // a no-retry card cannot come back
    const nr = quest(readyFx(), 'one-shot')
    const lost = fromBattle(nr.c, finished(nr, 'box-1', { winner: 'B', reason: 'x' }).state, nr.d)
    expect(run({ d: nr.d, c: at(lost, 'force.quest') }, { type: 'force.quest', seat: SEAT, questId: 'one-shot' })).toBe('E_QUEST')
    // a completed card cannot be run again
    const done = act(quest(readyFx(), 'lost-journal'), { type: 'quest.complete', seat: SEAT, cardId: 'lost-journal' })
    expect(run({ d: done.d, c: at(done.c, 'force.quest') }, { type: 'force.quest', seat: SEAT, questId: 'lost-journal' })).toBe('E_QUEST')
  })

  it('QUEST-005 reward items belong to the earning player only and never enter The Wasteland\'s Item Deck', () => {
    let fx = fresh()
    fx = { ...fx, c: newCampaign({ seed: 'two', players: [{ seat: 'A', faction: 'survivors' }, { seat: 'B', faction: 'super-mutants' }] }, fx.d) }
    fx = { ...fx, c: withPlayer(at(fx.c, 'force.quest'), (p) => { p.quest = 'thiefs-trail-1' }, 'A') }
    fx = act(fx, { type: 'quest.complete', seat: 'A', cardId: 'thiefs-trail-1' })
    expect(P(fx.c, 'A').rewards.map((x) => x.defId)).toEqual(['laser-pistol'])
    expect(P(fx.c, 'B').rewards).toEqual([])
    expect(buildItemDeck(fx.d, P(fx.c, 'A'))).not.toContain('laser-pistol')
    expect(buildItemDeck(fx.d, P(fx.c, 'B'))).toContain('laser-pistol') // the other player's deck is untouched
  })

  it('QUEST-006 Quest cards for the next battle bypass Stores and the pool, except Unique items, which count toward the force caps', () => {
    let fx = quest(fresh(), 'unique-prize')
    fx = act(fx, { type: 'quest.complete', seat: SEAT, cardId: 'unique-prize' })
    const reward = P(fx.c).rewards[0]!
    expect(P(fx.c).pool).toEqual([])
    fx = { ...fx, c: at(fx.c, 'force.create') }
    const plan = planAll(fx.c).plan
    const settler = modelOf(fx.c, 'settler').id
    const gap = (f: Fx) => act(f, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [settler]: [reward.uid] } } }).c.players[0]!.force!.value - act(f, { type: 'force.create', seat: SEAT, plan }).c.players[0]!.force!.value
    // a plain reward card is added after the force is built, so it is not costed (CH p6)
    expect(gap(fx)).toBe(0)
    const base = act(fx, { type: 'force.create', seat: SEAT, plan }).c.players[0]!.force!.value
    expect(act(fx, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [settler]: [reward.uid] }, capsLimit: base } }).c.players[0]!.force!.assign[settler]).toEqual([reward.uid])
    // a Unique reward must fit the force's caps total
    const unique = { ...fx, c: withPlayer(fx.c, (p) => { p.rewards[0]!.unique = true }) }
    expect(gap(unique)).toBe(fx.d.weapons.find((w) => w.id === 'laser-rifle')!.cost)
    expect(run(unique, { type: 'force.create', seat: SEAT, plan: { ...plan, assign: { [settler]: [reward.uid] }, capsLimit: base } })).toBe('E_FORCE')
  })

  it('QUEST-007 team players in co-op never run the same Quest', () => {
    let fx = fresh()
    fx = { ...fx, c: newCampaign({ seed: 'coop', players: [{ seat: 'A', faction: 'survivors', team: 't' }, { seat: 'B', faction: 'survivors', team: 't' }] }, fx.d) }
    fx = act({ ...fx, c: at(fx.c, 'force.quest') }, { type: 'force.quest', seat: 'A', questId: 'lost-journal' })
    expect(run({ ...fx, c: at(fx.c, 'force.quest') }, { type: 'force.quest', seat: 'B', questId: 'lost-journal' })).toBe('E_QUEST')
    expect(run({ ...fx, c: withPlayer(at(fx.c, 'force.quest'), () => {}, 'B') }, { type: 'force.quest', seat: 'B', questId: 'one-shot' })).toBe('no error')
  })
})

describe('Events', () => {
  const D = makeData()
  const build = (rounds: number, cons: { seat: string; id: string }[] = [], n = 0) => ev.buildEventDeck(D, { rounds, consequences: cons }, stream(n))

  it('EVENT-001 the Event Deck holds rounds - 1 random Events plus every Consequence, shuffled, Events face down and Consequences face up', () => {
    const deck = build(5, [{ seat: 'A', id: 'mercenary' }, { seat: 'B', id: 'raiders' }])
    expect(deck.cards).toHaveLength(4 + 2)
    expect(deck.cards.filter((c) => c.consequence).map((c) => c.id).sort()).toEqual(['mercenary', 'raiders'])
    expect(deck.cards.filter((c) => !c.consequence)).toHaveLength(4)
    expect(build(5, [], 1).cards.map((c) => c.id)).not.toEqual(build(5, [], 2).cards.map((c) => c.id)) // random mix
    expect(ev.revealedTop({ ...deck, cards: [{ id: 'x', consequence: false, flip: false, persists: false }, ...deck.cards] })).toBeNull() // an Event is face down
  })

  it('EVENT-002 from round 2 the round starts by drawing the top Event when none is in play; it is discarded at round end unless it stays', () => {
    let deck = build(6)
    const top = deck.cards[0]!
    expect(ev.startRound(deck, 1).inPlay).toBeNull()
    deck = ev.startRound(deck, 2)
    expect(deck.inPlay?.id).toBe(top.id)
    const same = ev.startRound(deck, 3)
    expect(same.inPlay?.id).toBe(top.id) // an Event in play blocks the next draw
    deck = ev.endRound(deck, stream())
    if (!top.persists) { expect(deck.inPlay).toBeNull(); expect(deck.discard[0]!.id).toBe(top.id) }
    const stay: ev.EventDeck = { cards: [{ id: 'ev-blank-1', consequence: false, flip: false, persists: false }], inPlay: { id: 'ev-stay', consequence: false, flip: false, persists: true }, discard: [], resolved: [], waiting: [] }
    const kept = ev.endRound(stay, stream())
    expect(kept.inPlay?.id).toBe('ev-stay')
    expect(ev.startRound(kept, 3).cards).toHaveLength(1) // still blocked
  })

  it('EVENT-003 a Flip-icon card on top is turned face up for all seats and takes effect only when drawn', () => {
    const flipCard = { id: 'dust-cloud', consequence: false, flip: true, persists: false }
    const deck: ev.EventDeck = { cards: [flipCard, { id: 'ev-blank-1', consequence: false, flip: false, persists: false }], inPlay: null, discard: [], resolved: [], waiting: [] }
    expect(ev.revealedTop(deck)).toBe('dust-cloud')
    expect(deck.inPlay).toBeNull() // visible, not yet in play
    expect(ev.startRound(deck, 2).inPlay?.id).toBe('dust-cloud')
  })

  it('EVENT-004 a Consequence on top is drawn and resolved at once and does not count as the round\'s Event', () => {
    const cons = { id: 'mercenary', consequence: true, owner: 'A', flip: false, persists: false }
    const deck: ev.EventDeck = { cards: [cons, { id: 'ev-blank-1', consequence: false, flip: false, persists: false }, { id: 'ev-blank-2', consequence: false, flip: false, persists: false }], inPlay: null, discard: [], resolved: [], waiting: [] }
    const r = ev.startRound(deck, 2)
    expect(r.resolved.map((c) => c.id)).toEqual(['mercenary'])
    expect(r.inPlay?.id).toBe('ev-blank-1') // the round's Event is the next card
  })

  it('EVENT-005 no player adds the same Consequence twice; a duplicate from two players picks its owner at random', () => {
    const deck = build(4, [{ seat: 'A', id: 'raiders' }, { seat: 'A', id: 'raiders' }, { seat: 'B', id: 'raiders' }])
    expect(deck.cards.filter((c) => c.id === 'raiders')).toHaveLength(1)
    const owners = new Set(Array.from({ length: 30 }, (_, i) => build(4, [{ seat: 'A', id: 'raiders' }, { seat: 'B', id: 'raiders' }], i).cards.find((c) => c.id === 'raiders')!.owner))
    expect(owners).toEqual(new Set(['A', 'B']))
    const added = ev.addMidBattle(D, deck, 'raiders', 'A')
    expect(added.waiting).toHaveLength(0) // already in the deck
  })

  it('EVENT-006 a Consequence gained mid-battle enters the deck at round end under the kept top card', () => {
    const base = build(6)
    const top = base.cards[0]!.id
    const next = ev.addMidBattle(D, base, 'mercenary', 'A')
    expect(next.waiting.map((c) => c.id)).toEqual(['mercenary'])
    expect(next.cards).toHaveLength(base.cards.length) // not yet in
    const filed = ev.endRound({ ...next, inPlay: null }, stream(3))
    expect(filed.cards[0]!.id).toBe(top) // the kept top card stays on top
    expect(filed.cards.slice(1).map((c) => c.id)).toContain('mercenary')
    expect(filed.waiting).toEqual([])
  })

  it('EVENT-007 an undrawn Consequence carries to its owner\'s next battle', () => {
    let fx = readyFx()
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.consequences = ['mercenary', 'raiders'] }) }
    const setup = toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    const deck = setup.extras.eventDeck
    expect(deck.cards.filter((c) => c.consequence)).toHaveLength(2)
    const drawn: ev.EventDeck = { ...deck, cards: deck.cards.filter((c) => c.id !== 'mercenary') } // mercenary was drawn and used up
    const { state } = finished(fx, 'box-1', { winner: 'A', reason: 'x' })
    expect(P(fromBattle(fx.c, state, fx.d, { eventDeck: drawn })).consequences).toEqual(['raiders'])
    expect(P(fromBattle(fx.c, state, fx.d)).consequences).toEqual(['mercenary', 'raiders']) // no deck given: nothing was drawn
  })

  it('EVENT-008 Dust Cloud blocks long-range attacks for its round and is a Flip card', () => {
    const dust = D.events.find((e) => e.id === 'dust-cloud')!
    expect(eventRules(dust)).toEqual({ blocksLongRange: true, flip: true, persists: false })
    expect(eventRules(D.events.find((e) => e.id === 'ev-blank-1')!).blocksLongRange).toBe(false)
  })
})

describe('Explore', () => {
  const explorer = (cardId: string, over = {}): Fx => {
    const fx = fresh(over)
    return { ...fx, c: withPlayer(at(fx.c, 'draw.explore'), (p) => { p.phase.drawn = true; p.phase.explore = { structureId: instOf(fx.c, 'listening-post'), cardId, tested: false, committed: [] }; p.caps = 100 }) }
  }

  it('EXPL-001 Explore cards are drawn and resolved at once in Step 2 and never enter the pool', () => {
    let fx = fresh({ explore: makeData().explore.filter((e) => e.id === 'lucky-find') })
    fx = { ...fx, c: caps(fx.c, 100) }
    fx = act(fx, { type: 'draw.explore', seat: SEAT, structureId: instOf(fx.c, 'listening-post') })
    expect(P(fx.c).phase.explore!.cardId).toBe('lucky-find')
    expect(P(fx.c).phase.decks!.explore).toEqual([]) // the card left the deck
    expect(run(fx, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'stores') })).toBe('E_DRAW') // resolve it first
    fx = act(fx, { type: 'draw.explore.resolve', seat: SEAT })
    expect(P(fx.c).pool).toEqual([])
    expect(P(fx.c).phase.explore).toBeNull()
    expect(P(fx.c).caps).toBe(100 - 50 + 25)
  })

  it('EXPL-002 Explore tests use the Leader\'s skills and attributes, at -2 when the Leader was removed', () => {
    const fx = fresh()
    const p = P(fx.c)
    const search = { skill: 'search' }
    expect(exploreSv(p, fx.d, search, [])).toBe(5) // Sole Survivor: Search uses INT 5
    expect(exploreSv({ ...p, leaderRemoved: true }, fx.d, search, [])).toBe(3)
    expect(exploreSv(p, fx.d, { attr: 'per' }, [])).toBe(7)
    expect(exploreSv({ ...p, leader: { modelId: modelOf(fx.c, 'dogmeat').id, card: 'hunter' } }, fx.d, { skill: 'lockpick' }, [])).toBeNull() // the Leader lacks the skill
  })

  it('EXPL-003 pool items for an Explore test are committed before the draw; food cannot prevent its damage', () => {
    let fx = fresh({ explore: makeData().explore.filter((e) => e.id === 'lucky-find') })
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.caps = 100; p.pool = [card('mentats', 'mt#1')] }) }
    expect(run(fx, { type: 'draw.explore', seat: SEAT, structureId: instOf(fx.c, 'listening-post'), commit: ['nope'] })).toBe('E_CARD')
    const committed = act(fx, { type: 'draw.explore', seat: SEAT, structureId: instOf(fx.c, 'listening-post'), commit: ['mt#1'] })
    expect(P(committed.c).phase.explore!.committed).toEqual(['mt#1'])
    // damage stands whatever food is committed
    const dmg = explorer('rad-storm', { dieFaces: ['X'] })
    const withFood = { ...dmg, c: withPlayer(dmg.c, (p) => { p.pool = [card('nuka-cola', 'nc#1')]; p.phase.explore!.committed = ['nc#1'] }) }
    const tested = act(withFood, { type: 'draw.explore.test', seat: SEAT })
    const done = act(tested, { type: 'draw.explore.resolve', seat: SEAT })
    expect(P(done.c).exploreEffects).toEqual([{ source: 'rad-storm', damage: 2 }])
  })

  it('EXPL-004 Explore damage and effects are allocated to models at the next set-up, after the force is chosen', () => {
    let fx = readyFx()
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.exploreEffects = [{ source: 'rad-storm', damage: 2 }] }) }
    expect(P(fx.c).roster.every((m) => m.xp === 0 && m.injuries.length === 0)).toBe(true) // nothing dealt yet
    const setup = toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' })
    const firstId = setup.extras.models[SEAT]![P(fx.c).force!.members[0]!]!
    expect(setup.campaign!.damage).toEqual({ [firstId]: 2 })
  })

  it('EXPL-005 Scout Camp re-draws an Explore card only before any test on it', () => {
    let fx = explorer('hand-written-note')
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.structures.push({ id: 'sc1', defId: 'scout-camp' }, { id: 'sc2', defId: 'scout-camp' }); p.phase.decks = { item: [], boost: [], explore: ['lucky-find', 'rad-storm'] } }) }
    const redrawn = act(fx, { type: 'draw.explore.redraw', seat: SEAT, structureId: 'sc1' })
    expect(['lucky-find', 'rad-storm']).toContain(P(redrawn.c).phase.explore!.cardId)
    const tested = act(fx, { type: 'draw.explore.test', seat: SEAT })
    expect(run(tested, { type: 'draw.explore.redraw', seat: SEAT, structureId: 'sc2' })).toBe('E_TESTED')
  })

  it('EXPL-006 Gun for Hire: paying 30 caps adds a mercenary Consequence to the next battle\'s deck', () => {
    const fx = explorer('gun-for-hire')
    const paid = act(fx, { type: 'draw.explore.resolve', seat: SEAT, pay: true })
    expect(P(paid.c).caps).toBe(70)
    expect(P(paid.c).consequences).toEqual(['mercenary'])
    const declined = act(fx, { type: 'draw.explore.resolve', seat: SEAT })
    expect(P(declined.c).caps).toBe(100)
    expect(P(declined.c).consequences).toEqual([])
    const broke = { ...fx, c: caps(fx.c, 10) }
    expect(run(broke, { type: 'draw.explore.resolve', seat: SEAT, pay: true })).toBe('E_CAPS')
    const ready = { ...paid, c: withPlayer(paid.c, (p) => { p.force = readyFx().c.players[0]!.force }) }
    expect(toBattle(ready.c, 'box-1', ready.d, { opponent: 'bot' }).extras.eventDeck.cards.map((c) => c.id)).toContain('mercenary')
  })

  it('EXPL-007 Hand-Written Note on Explore gives a Search test and 2 Items on success', () => {
    const pass = explorer('hand-written-note', { dieFaces: [1] })
    const won = act(act(pass, { type: 'draw.explore.test', seat: SEAT }), { type: 'draw.explore.resolve', seat: SEAT })
    expect(P(won.c).phase.explore).toBeNull()
    expect(P(won.c).pool).toHaveLength(2)
    expect(P(won.c).pool.every((x) => x.from === 'explore')).toBe(true)
    expect(run(pass, { type: 'draw.explore.resolve', seat: SEAT })).toBe('E_TEST') // test first
    const lose = explorer('hand-written-note', { dieFaces: ['X'] })
    const lost = act(act(lose, { type: 'draw.explore.test', seat: SEAT }), { type: 'draw.explore.resolve', seat: SEAT })
    expect(P(lost.c).pool).toHaveLength(0)
  })
})

describe('hooks', () => {
  it('a hook the data names but the code lacks is a no-op that logs a RULING line', () => {
    const fx = fresh()
    const c = structuredClone(fx.c)
    const ok = runHook('doesNotExist', { campaign: c, player: P(c), data: fx.d, args: {}, stream: streamFor(c, SEAT, 'x', 0), source: 'test', log: () => {} })
    expect(ok).toBe(false)
    expect(c.log[c.log.length - 1]!.text).toMatch(/^RULING: hook doesNotExist/)
    expect(runHook('capsChange', { campaign: c, player: P(c), data: fx.d, args: { n: 12 }, stream: streamFor(c, SEAT, 'x', 0), source: 'test', log: () => {} })).toBe(true)
    expect(P(c).caps).toBe(12)
  })
})
