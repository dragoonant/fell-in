// Campaign test fixtures. The campaign records here are written from the spec 19 tables (CH p20-23) so the tests do not depend
// on the data stage; units, weapons, armor, items, mods and leaders come from the real data/1e tree through loadBundle().
import { campaignData, cardValue, type BoostRec, type CampaignData, type CapsAwardRec, type EventRec, type ExploreRec, type PerkRec, type QuestRec, type StructureRec } from '../../src/campaign/data'
import { newCampaign, reduce } from '../../src/campaign/reducer'
import { chosenStandard } from '../../src/campaign/rules'
import { autoAdvance } from '../../src/campaign/sequence'
import type { Campaign, CampaignAction, CampaignPlayer, PoolCard, StepId } from '../../src/campaign/types'
import type { ScenarioDef } from '../../src/data/types'
import { loadBundle } from '../engine/helpers'
import { toBattle, type BattleSetup, type ToBattleOpts } from '../../src/campaign/battle'
import { createGame } from '../../src/engine/setup'
import type { GameState } from '../../src/engine/types'
import type { EditionBundle } from '../../src/data/types'

const none = { op: 'none' }
const S = (id: string, name: string, group: string, cost: number, o: Partial<StructureRec> = {}): StructureRec => ({ id, name, group, cost, effect: none, source: 'CH p21', ...o })

const draw = (deck: 'item' | 'boost', draw: number, o: Record<string, unknown> = {}) => ({ op: 'draw', deck, draw, keep: 1, ...o })
const TIERS: [string, string, string[]][] = [
  ['scavenging', 'any', ['Scavenging Stand', 'Scavenging Stall', 'Scavenging Stores']], ['trading', 'junkGear', ['Trading Stand', 'Trading Shop', 'Trading Emporium']],
  ['weapons', 'weapon', ['Weapons Stand', 'Weapons Shop', 'Weapons Emporium']], ['armor', 'armor', ['Armor Stand', 'Armor Shop', 'Armor Emporium']],
  ['clothing', 'clothing', ['Clothing Stand', 'Clothing Shop', 'Clothing Emporium']], ['drink', 'foodDrink', ['Drink Stand', 'Bar', 'Restaurant']],
  ['aid', 'medical', ['First Aid Station', 'Clinic', 'Surgery Center']],
]

export function structureRecords(): StructureRec[] {
  const out: StructureRec[] = [
    S('gen-small', 'Generator - Small', 'infrastructure', 100, { power: 0, provides: { power: 3 }, starting: 2 }),
    S('gen-medium', 'Generator - Medium', 'infrastructure', 200, { power: 0, provides: { power: 7 } }),
    S('gen-large', 'Generator - Large', 'infrastructure', 300, { power: 0, provides: { power: 12 } }),
    S('water-pump', 'Water Pump', 'infrastructure', 50, { power: 0, provides: { water: 3 } }),
    S('water-purifier', 'Water Purifier', 'infrastructure', 100, { provides: { water: 12 } }),
    S('crop-field', 'Crop Field', 'infrastructure', 30, { power: 0, water: 1, max: 5 }),
    S('weapons-workbench', 'Weapons Workbench', 'crafting', 100, { requires: { perks: ['blacksmith', 'gun-nut-rifle', 'gun-nut-pistol'] }, effect: draw('item', 1, { itemClass: 'mod' }) }),
    S('armor-workbench', 'Armor Workbench', 'crafting', 100, { requires: { perks: ['armorer'] }, alternatives: [{ op: 'armorBoost', n: 1 }], effect: draw('item', 1, { itemClass: 'armorMod' }) }),
    S('power-armor-station', 'Power Armor Station', 'crafting', 100, { requires: { perks: ['armorer'] }, extra: [{ op: 'repairPowerArmor', suits: 1 }], effect: draw('item', 1, { itemClass: 'powerArmorMod' }) }),
    S('chem-station', 'Chemistry Station', 'crafting', 100, { effect: draw('item', 1, { itemClass: 'chem' }) }),
    S('cooking-station', 'Cooking Station', 'crafting', 100, { requires: { structures: ['crop-field'] }, effect: { op: 'drawPerCropField', itemClass: 'foodDrink', maxDraw: 5, keep: 1 } }),
    S('robot-workbench', 'Robot Workbench', 'crafting', 100, { requires: { perks: ['robotics-expert'] }, effect: draw('item', 1, { itemClass: 'robotMod' }) }),
    S('creature-pen', 'Creature Pen', 'crafting', 100, { requires: { perks: ['creature-trainer'] }, effect: draw('item', 1, { itemClass: 'creatureMod' }) }),
    S('stores', 'Stores', 'other', 150, { starting: 1, effect: { op: 'stores', items: 1, boosts: 2 } }),
    S('maintenance-shed', 'Maintenance Shed', 'other', 60, { starting: 1, effect: { op: 'retain', items: 1, boosts: 2 } }),
    S('lockers', 'Lockers', 'other', 70, { effect: { op: 'locker', items: 1 } }),
    S('brahmin-pen', 'Brahmin Pen', 'other', 300, { requires: { perks: ['local-leader'] }, effect: { op: 'modifyDraw', how: 'redrawAll' } }),
    S('brahmin-troughs', 'Brahmin Troughs', 'other', 200, { requires: { perks: ['local-leader'] }, effect: { op: 'modifyDraw', how: 'drawExtra', n: 1 } }),
    S('brahmin-ranch', 'Brahmin Ranch', 'other', 250, { requires: { perks: ['local-leader-ii'] }, max: 1, effect: { op: 'modifyDraw', how: 'keepExtra', n: 1 } }),
    S('operations-room', 'Operations Room', 'other', 400, { requires: { perks: ['local-leader-ii'] }, max: 1, effect: { op: 'reuse' } }),
    S('leaders-office', "Leader's Office", 'other', 500, { requires: { perks: ['local-leader-ii'] }, max: 1, effect: { op: 'nameItem' } }),
    S('robot-market', 'Robot Market', 'other', 250, { max: 1, effect: { op: 'market', itemClass: 'robotMod', draw: 4 } }),
    S('creature-market', 'Creature Market', 'other', 250, { max: 1, effect: { op: 'market', itemClass: 'creatureMod', draw: 4 } }),
    S('land', 'Land', 'land', 500, { power: 0, questsAlt: 5, provides: { slots: 10 } }),
    S('listening-post', 'Listening Post', 'exploration', 0, { starting: 1, max: 1, effect: { op: 'explore', capsPerUse: 50, repeatable: true } }),
    S('ranger-outpost', 'Ranger Outpost', 'exploration', 100, { effect: { op: 'explore' } }),
    S('scout-camp', 'Scout Camp', 'exploration', 200, { effect: { op: 'exploreRedraw' } }),
  ]
  for (const [key, cls, names] of TIERS) {
    const cost = key === 'scavenging' ? [50, 100, 150] : key === 'trading' || key === 'weapons' || key === 'armor' || key === 'clothing' ? [100, 150, 200] : [100, 150, 200]
    names.forEach((n, i) => out.push(S(`${key}-${i}`, n, 'item', cost[i]!, { effect: draw('item', i + 1, { itemClass: cls }) })))
  }
  const racks: [string, string | undefined, number[], string[]][] = [
    ['bugle', undefined, [35, 55, 75], ['Boston Bugle', 'Boston Bugle', 'Boston Bugle']], ['practiced', 'practiced', [50, 75, 100], ['Grognak', 'Grognak', 'Grognak']],
    ['instinctive', 'instinctive', [50, 75, 100], ['Survival Guide', 'Survival Guide', 'Survival Guide']], ['tactical', 'tactical', [50, 75, 100], ['Covert Ops Manual', 'Covert Ops Manual', 'Covert Ops Manual']],
    ['cunning', 'cunning', [50, 75, 100], ['Awesome Tales', 'Awesome Tales', 'Awesome Tales']],
  ]
  for (const [key, type, costs, names] of racks) costs.forEach((c, i) => out.push(S(`${key}-${i}`, `${names[i]} ${['small', 'medium', 'large'][i]}`, 'boost', c, { power: 0, effect: draw('boost', i + 1, { boostType: type }) })))
  return out
}

export const PERKS: PerkRec[] = [
  { id: 'gun-nut-rifle', name: 'Gun Nut (Rifle)', cost: 3, settlementWide: true, allowsMods: ['mod'], modFits: ['rifle'], grants: [{ structure: 'weapons-workbench' }], source: 'COST PERKS' },
  { id: 'gun-nut-pistol', name: 'Gun Nut (Pistol)', cost: 3, settlementWide: true, allowsMods: ['mod'], modFits: ['pistol'], grants: [{ structure: 'weapons-workbench' }], source: 'COST PERKS' },
  { id: 'blacksmith', name: 'Blacksmith', cost: 3, settlementWide: true, allowsMods: ['mod'], modFits: ['melee'], grants: [{ structure: 'weapons-workbench' }], source: 'COST PERKS' },
  { id: 'armorer', name: 'Armorer', cost: 3, settlementWide: true, allowsMods: ['armorMod', 'powerArmorMod'], modFits: ['armor', 'powerArmor'], grants: [{ structure: 'armor-workbench' }], source: 'COST PERKS' },
  { id: 'local-leader', name: 'Local Leader', cost: 5, settlementWide: true, source: 'COST PERKS' },
  { id: 'local-leader-ii', name: 'Local Leader II', cost: 8, settlementWide: true, requires: { perks: ['local-leader'] }, source: 'ERR p.10' },
  { id: 'robotics-expert', name: 'Robotics Expert', cost: 4, settlementWide: true, allowsMods: ['robotMod'], source: 'ERR p.10' },
  { id: 'creature-trainer', name: 'Creature Trainer', cost: 4, settlementWide: true, allowsMods: ['creatureMod'], source: 'ERR p.10' },
  { id: 'mysterious-stranger', name: 'Mysterious Stranger', cost: 4, source: 'COST PERKS' },
  { id: 'nerd-rage', name: 'Nerd Rage', cost: 6, requires: { attrs: { int: 8 } }, source: 'COST PERKS' },
  { id: 'hack-robot', name: 'Hack Robot', cost: 4, requires: { skills: { computers: 5 } }, source: 'fixture' },
  { id: 'lone-wanderer', name: 'Lone Wanderer', cost: 5, requires: { perks: ['mysterious-stranger'] }, source: 'fixture' },
  { id: 'unique-only', name: 'Unique Only', cost: 2, requires: { unique: true }, source: 'fixture' },
]

const B = (id: string, name: string, type: BoostRec['type']): BoostRec => ({ id, name, type, cost: 0, source: 'fixture' })
export const BOOSTS: BoostRec[] = [
  B('boost-p1', 'Practiced One', 'practiced'), B('boost-p2', 'Practiced Two', 'practiced'), B('boost-c1', 'Cunning One', 'cunning'), B('boost-c2', 'Second Chance', 'cunning'),
  B('boost-t1', 'Tactical One', 'tactical'), B('boost-i1', 'Instinctive One', 'instinctive'), B('boost-i2', 'Instinctive Two', 'instinctive'),
]

export const EVENTS: EventRec[] = [
  { id: 'dust-cloud', name: 'Dust Cloud', flip: true, effect: { code: 'dustCloud' }, source: 'CH p4' },
  { id: 'ev-blank-1', name: 'Quiet', effect: { code: 'none' }, source: 'fixture' }, { id: 'ev-blank-2', name: 'Calm', effect: { code: 'none' }, source: 'fixture' },
  { id: 'ev-blank-3', name: 'Still', effect: { code: 'none' }, source: 'fixture' }, { id: 'ev-stay', name: 'Lingering Fog', persists: true, effect: { code: 'none' }, source: 'fixture' },
  { id: 'ev-blank-4', name: 'Hush', effect: { code: 'none' }, source: 'fixture' }, { id: 'ev-blank-5', name: 'Lull', effect: { code: 'none' }, source: 'fixture' },
  { id: 'mercenary', name: 'Mercenary', consequence: true, owner: 'player', effect: { code: 'none' }, source: 'fixture' },
  { id: 'raiders', name: 'Raiders', consequence: true, owner: 'player', effect: { code: 'none' }, source: 'fixture' },
  { id: 'cons-flip', name: 'Warning Flare', consequence: true, flip: true, owner: 'player', effect: { code: 'none' }, source: 'fixture' },
]

export const QUESTS: QuestRec[] = [
  { id: 'thiefs-trail-1', name: "Thief's Trail, Part 1", title: 'thiefs-trail', part: '1', next: ['thiefs-trail-2a', 'thiefs-trail-2b'], reward: [{ caps: 50, items: ['laser-pistol'] }, { caps: 20 }], source: 'fixture' },
  { id: 'thiefs-trail-2a', name: "Thief's Trail, Part 2a", title: 'thiefs-trail', part: '2a', reward: [{ caps: 100 }], source: 'fixture' },
  { id: 'thiefs-trail-2b', name: "Thief's Trail, Part 2b", title: 'thiefs-trail', part: '2b', reward: [{ caps: 80, consequence: 'raiders' }], source: 'fixture' },
  { id: 'lost-journal', name: 'Lost Journal', title: 'lost-journal', reward: [{ boosts: 2, consequence: 'raiders' }], source: 'fixture' },
  { id: 'one-shot', name: 'One Shot', title: 'one-shot', noRetry: true, reward: [{ caps: 10 }], source: 'fixture' },
  { id: 'unique-prize', name: 'Unique Prize', title: 'unique-prize', reward: [{ items: ['laser-rifle'] }], source: 'fixture' },
]

export const EXPLORE: ExploreRec[] = [
  { id: 'gun-for-hire', name: 'Gun for Hire', outcomes: [{ when: 'pay', payCaps: 30, consequence: 'mercenary' }], source: 'fixture' },
  { id: 'hand-written-note', name: 'Hand-Written Note', test: { skill: 'search' }, outcomes: [{ when: 'pass', items: 2, itemClass: 'any' }], source: 'ERR p.14' },
  { id: 'rad-storm', name: 'Rad Storm', test: { skill: 'search', mod: -20 }, outcomes: [{ when: 'fail', damage: 2 }], source: 'fixture' },
  { id: 'lucky-find', name: 'Lucky Find', outcomes: [{ when: 'always', caps: 25 }], source: 'fixture' },
]

export const AWARDS: CapsAwardRec[] = [
  { id: 'default', winner: 200, loser: 120, draw: 'winner', bigForceBonus: { from: 1000, each: 50 }, source: 'CH p19' },
  { id: 'police', scenarioId: 'police-defense', winner: 150, loser: undefined as unknown as number, source: 'CH p29' },
]

/** Linked scenarios for CAMP-016: Defend the Farm -> Newshound -> Hold the Fort. */
export function linkedScenarios(): ScenarioDef[] {
  const base = loadBundle().records.scenarios.find((s) => s.id === 'box-1')!
  const mk = (id: string, campaign: unknown): ScenarioDef => ({ ...structuredClone(base), id, campaign } as unknown as ScenarioDef)
  return [
    mk('farm', { linkedId: 'newshound', order: 1, consequences: [
      { side: 'brotherhood', level: 'major', applyTo: 'final', effect: { code: 'fewerCaps', args: { n: -50 } }, text: 'The defender spends 50 fewer caps in the final scenario.' },
      { side: 'brotherhood', level: 'major', applyTo: 'next', effect: { code: 'freeCards', args: { defIds: ['10mm-pistol'] } }, text: 'A free pistol for the next scenario.' },
    ] }),
    mk('newshound', { linkedId: 'fort', order: 2, consequences: [] }),
    mk('fort', { order: 3, consequences: [] }),
  ]
}

export function makeData(over: Partial<CampaignData> = {}): CampaignData {
  const bundle = loadBundle()
  const base = campaignData(bundle)
  return {
    ...base, structures: structureRecords(), perks: PERKS, boosts: BOOSTS, events: EVENTS, quests: QUESTS, explore: EXPLORE, awards: AWARDS,
    scenarios: [...base.scenarios, ...linkedScenarios()], ...over,
  }
}

export const SEAT = 'A'

export interface Fx { c: Campaign; d: CampaignData }
/** A fresh one-player Survivors campaign. */
export function fresh(over: Partial<CampaignData> = {}, seed = 'seed-1'): Fx {
  const d = makeData(over)
  return { d, c: newCampaign({ seed, createdAt: 1, players: [{ seat: SEAT, faction: 'survivors' }] }, d) }
}
export const P = (c: Campaign, seat = SEAT): CampaignPlayer => c.players.find((p) => p.seat === seat)!
export const act = (fx: Fx, a: CampaignAction): Fx => ({ ...fx, c: reduce(fx.c, a, fx.d) })
export const withPlayer = (c: Campaign, f: (p: CampaignPlayer) => void, seat = SEAT): Campaign => { const n = structuredClone(c); f(P(n, seat)); return n }
export const at = (c: Campaign, step: StepId): Campaign => withPlayer(c, (p) => { p.step = step })
export const caps = (c: Campaign, n: number): Campaign => withPlayer(c, (p) => { p.caps = n })
export const card = (defId: string, uid = `${defId}#x`, kind: PoolCard['kind'] = 'item', extra: Partial<PoolCard> = {}): PoolCard => ({ uid, defId, kind, ...extra })
export const instOf = (c: Campaign, defId: string, seat = SEAT): string => P(c, seat).structures.find((s) => s.defId === defId)!.id
export const addStruct = (c: Campaign, defId: string, seat = SEAT): Campaign => withPlayer(c, (p) => { p.structures.push({ id: `t-${defId}-${p.structures.length}`, defId }) }, seat)
export const addPerk = (c: Campaign, perkId: string, seat = SEAT): Campaign => withPlayer(c, (p) => { p.perks.push(perkId) }, seat)
export const modelOf = (c: Campaign, unitId: string, seat = SEAT) => P(c, seat).roster.find((m) => m.unitId === unitId)!
export const advance = (fx: Fx): Fx => ({ ...fx, c: autoAdvance(fx.c, SEAT, fx.d) })

/** The real edition bundle with the fixture's scenarios (adds the linked ones). */
export function bundleFor(d: CampaignData): EditionBundle { const b = loadBundle(); return { ...b, records: { ...b.records, scenarios: [...d.scenarios] } } }

/** A force plan of the whole roster (or the named units), the current Leader, no extras. */
export function planAll(c: Campaign, seat = SEAT, units?: string[]): Extract<CampaignAction, { type: 'force.create' }> {
  const p = P(c, seat)
  const members = p.roster.filter((m) => !units || units.includes(m.unitId)).map((m) => m.id)
  if (p.leader && !members.includes(p.leader.modelId)) members.push(p.leader.modelId)
  return { type: 'force.create', seat, plan: { members, assign: {}, equipPerks: {}, heroic: [], leader: p.leader, capsLimit: 750 } }
}

/** A campaign at the toBattle step with a force built, ready for toBattle. */
export function readyFx(over: Partial<CampaignData> = {}, seed = 'seed-1', units?: string[]): Fx {
  const fx = fresh(over, seed)
  return act({ ...fx, c: at(fx.c, 'force.create') }, planAll(fx.c, SEAT, units))
}

/** createGame from a campaign setup, with the result forced (a finished battle without playing it). */
export function finished(fx: Fx, scenarioId: string, result: GameState['result'], tweak: (s: GameState) => void = () => {}, o: ToBattleOpts = { opponent: 'bot' }): { setup: BattleSetup; state: GameState } {
  const setup = toBattle(fx.c, scenarioId, fx.d, o)
  const game = createGame(bundleFor(fx.d), setup)
  const state: GameState = { ...structuredClone(game), phase: 'over', result }
  tweak(state)
  return { setup, state }
}

/** Caps value of the standard equipment the force's models carry, leaving out printed Equipped items (CH p26, ERR p.15). */
export function standardValue(fx: Fx, seat = SEAT): number {
  const p = P(fx.c, seat)
  return p.force!.members.reduce((n, id) => {
    const m = p.roster.find((x) => x.id === id)!
    const printed = new Set(fx.d.units.find((u) => u.id === m.unitId)?.equipped ?? [])
    return n + chosenStandard(fx.d, p.force!, id, m.unitId).filter((x) => !printed.has(x)).reduce((k, x) => k + cardValue(fx.d, x), 0)
  }, 0)
}
