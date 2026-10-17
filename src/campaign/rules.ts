// Read-only settlement rules: slots, requirements, Power and Water, retention and Stores capacity, Leader attributes, force
// value. The reducer calls these to refuse an illegal action; the client calls them to grey out a control.
import type { Attr, LeaderDef, ScenarioForce, UnitDef } from '../data/types'
import { ATTRS } from '../data/types'
import { cardInfo, cardValue, perkRec, powerNeed, standardEquipment, structureRec, unitRec, waterNeed, type CampaignData, type StructureRec } from './data'
import type { CampaignPlayer, ForcePlan, PoolCard, RosterModel, StructureInst } from './types'

/** Structures a new settlement has room for (CH p18). RULING: the base room is a rules constant, not a data record. */
export const BASE_SLOTS = 15
/** Slots one Land adds when the Land record names none (CH p18). */
export const LAND_SLOTS = 10
export const LAND_ID = 'land'

export const isLand = (s: StructureRec): boolean => s.id === LAND_ID || s.group === 'land'

export const structuresOf = (p: CampaignPlayer, defId: string): StructureInst[] => p.structures.filter((s) => s.defId === defId)
export const countOf = (p: CampaignPlayer, defId: string): number => structuresOf(p, defId).length

/** Force limits in caps (CH p26): small, regular, large. The settlement screen and the reducer both read these. */
export const FORCE_LIMITS: readonly { id: 'small' | 'regular' | 'large'; label: string; caps: number }[] = [
  { id: 'small', label: 'Small', caps: 500 }, { id: 'regular', label: 'Regular', caps: 750 }, { id: 'large', label: 'Large', caps: 1000 },
]
/** The limit used when none was picked (the regular force). */
export const DEFAULT_FORCE_LIMIT: number = FORCE_LIMITS.find((z) => z.id === 'regular')!.caps

/** Caps a scrapped Structure pays back: half its price, rounded down (CH p20). */
export const scrapRefund = (rec: StructureRec | undefined): number => Math.floor((rec?.cost ?? 0) / 2)

export function landSlots(d: CampaignData): number { return structureRec(d, LAND_ID)?.provides?.slots ?? LAND_SLOTS }
export const slotsTotal = (p: CampaignPlayer, d: CampaignData): number => BASE_SLOTS + p.land * landSlots(d)
export const slotsUsed = (p: CampaignPlayer): number => p.structures.length

/** Completed Quest cards not yet spent on Land (CH p18, p22). */
export const questCredit = (p: CampaignPlayer): number => p.quests.reduce((n, q) => n + q.completed.length, 0) - p.questsSpent

export const hasPerk = (p: CampaignPlayer, perkId: string): boolean => p.perks.includes(perkId) || p.roster.some((m) => m.perks.includes(perkId))

/** Why a Structure cannot be bought now, or null when it can (CAMP-014). Caps are checked by the caller. */
export function buyBlocker(p: CampaignPlayer, d: CampaignData, rec: StructureRec): string | null {
  if (!isLand(rec) && slotsUsed(p) >= slotsTotal(p, d)) return 'the settlement has no free slot (buy Land)'
  const rq = rec.requires
  if (rq?.perks?.length && !rq.perks.some((id) => hasPerk(p, id))) return `needs one of the Perks ${rq.perks.join(', ')}`
  for (const sid of rq?.structures ?? []) if (!countOf(p, sid)) return `needs a ${structureRec(d, sid)?.name ?? sid} first`
  if (rec.max !== undefined && countOf(p, rec.id) >= rec.max) return `at most ${rec.max} per settlement`
  return null
}

/** Dependants of a Structure: built Structures that require it (scrapping it takes them too, CH p20). */
export function dependants(p: CampaignPlayer, d: CampaignData, defId: string, removing: ReadonlySet<string> = new Set()): StructureInst[] {
  return p.structures.filter((s) => !removing.has(s.id) && (structureRec(d, s.defId)?.requires?.structures ?? []).includes(defId))
}

// ---------- Power and Water (CH p20-21) ----------
export interface PowerPlan {
  powerSupply: number; powerNeed: number; waterSupply: number; waterNeed: number
  /** Structure instance ids that do nothing this phase. */
  dark: Set<string>
  /** Power still missing after the player's choice (before the automatic fill). */
  shortfall: number
}

/**
 * Allot Power and Water. The player's choice (`darkChoice`) goes dark first; if supply is still short, the most recently built
 * Structures that need it go dark until it fits (the player is meant to choose; this is the fallback, SETT-008).
 */
export function powerPlan(p: CampaignPlayer, d: CampaignData): PowerPlan {
  const dark = new Set(p.phase.darkChoice.filter((id) => p.structures.some((s) => s.id === id)))
  const rec = (s: StructureInst) => structureRec(d, s.defId)
  const needsPower = (s: StructureInst): number => { const r = rec(s); return r ? powerNeed(r) : 0 }
  const live = (s: StructureInst) => !dark.has(s.id)
  const sum = (f: (s: StructureInst) => number) => p.structures.filter(live).reduce((n, s) => n + f(s), 0)
  const supply = (k: 'power' | 'water') => sum((s) => (needsPower(s) > 0 && !live(s) ? 0 : rec(s)?.provides?.[k] ?? 0))
  const needP = () => sum((s) => needsPower(s))
  let shortfall = needP() - supply('power')
  const pending = [...p.structures].reverse()
  for (const s of pending) {
    if (needP() <= supply('power')) break
    if (live(s) && needsPower(s) > 0) dark.add(s.id)
  }
  const needW = () => sum((s) => (rec(s) ? waterNeed(rec(s)!) : 0))
  for (const s of pending) {
    if (needW() <= supply('water')) break
    if (live(s) && rec(s) && waterNeed(rec(s)!) > 0) dark.add(s.id)
  }
  shortfall = Math.max(0, shortfall)
  return { powerSupply: supply('power'), powerNeed: needP(), waterSupply: supply('water'), waterNeed: needW(), dark, shortfall }
}

/** True when the Structure was not left dark and so works in Step 2 (SETT-007, SETT-008). */
export const isPowered = (p: CampaignPlayer, d: CampaignData, instId: string): boolean => !powerPlan(p, d).dark.has(instId)

/** Count of working Structures whose record has `effect.op === op`. */
export function working(p: CampaignPlayer, d: CampaignData, op: string): StructureInst[] {
  const plan = powerPlan(p, d)
  return p.structures.filter((s) => structureRec(d, s.defId)?.effect.op === op && !plan.dark.has(s.id))
}
/** Maintenance Sheds are used straight after a battle, before Power is allotted: all of them count (CH p19). */
export const allOf = (p: CampaignPlayer, d: CampaignData, op: string): StructureInst[] => p.structures.filter((s) => structureRec(d, s.defId)?.effect.op === op)

/** Retention: items + ceil(boosts / boostsPerShed) must fit the Sheds (SETT-002). */
export function retainFits(p: CampaignPlayer, d: CampaignData, items: number, boosts: number, op: 'retain' | 'stores'): boolean {
  const list = op === 'retain' ? allOf(p, d, op) : working(p, d, op)
  const per = (n: 'items' | 'boosts') => structureRec(d, list[0]?.defId ?? '')?.effect[n] as number | undefined
  const boostsPer = per('boosts') ?? 2
  return items + Math.ceil(boosts / boostsPer) <= list.length * Math.max(1, per('items') ?? 1)
}

// ---------- Leader ----------
export function leaderOf(p: CampaignPlayer): RosterModel | undefined { return p.leader ? p.roster.find((m) => m.id === p.leader!.modelId) : undefined }

function leaderCardMod(card: LeaderDef | undefined, attr: Attr): number {
  let n = 0
  for (const a of card?.abilities ?? []) for (const e of a.effects ?? []) if ('op' in e && e.op === 'attrMod' && e.attr === attr && !e.when) n += e.n ?? 0
  return n
}
/** The Leader's attribute, with its Leader card's flat bonuses (a Leader card such as Charming adds to CHA). */
export function leaderAttr(p: CampaignPlayer, d: CampaignData, attr: Attr): number {
  const m = leaderOf(p); const u = m ? unitRec(d, m.unitId) : undefined
  if (!u) return 0
  return Math.max(0, u.attrs[attr] + leaderCardMod(d.leaders.find((l) => l.id === p.leader!.card), attr))
}
/** The Leader's highest attribute: the Boost cap in Step 3 and the basis of the no-settlement hand (CH p5, p24). */
export function leaderHighestAttr(p: CampaignPlayer, d: CampaignData): number { return Math.max(0, ...ATTRS.map((a) => leaderAttr(p, d, a))) }

// ---------- force ----------
export function unitCost(u: UnitDef | undefined): number { return u?.cost ?? 0 }

/** Standard equipment a member carries: the plan's choice, else all of it (CH p24: any or all). Printed Equipped items are separate. */
export function chosenStandard(d: CampaignData, plan: Pick<ForcePlan, 'standard'>, modelId: string, unitId: string): string[] {
  const all = standardEquipment(d, unitId)
  const pick = plan.standard?.[modelId]
  return pick ? all.filter((x) => pick.includes(x)) : all
}

/**
 * Caps value of a force plan: units, every Item on every model including chosen standard equipment, equipped Perks, Heroic and Leader
 * cards (CH p24, p26). Printed Equipped items are free (ERR p.15). A Quest reward card is added after the force is built, so only a
 * Unique reward counts towards the limit (CH p6; spec 19 s2.5).
 */
export function forceValue(p: CampaignPlayer, d: CampaignData, plan: Omit<ForcePlan, 'value'>): number {
  let v = 0
  const cards = new Map<string, { card: PoolCard; counts: boolean }>([
    ...p.rewards.map((c): [string, { card: PoolCard; counts: boolean }] => [c.uid, { card: c, counts: !!c.unique || !!cardInfo(d, c.defId)?.unique }]),
    ...p.selected.map((c): [string, { card: PoolCard; counts: boolean }] => [c.uid, { card: c, counts: true }]),
  ])
  for (const id of plan.members) {
    const m = p.roster.find((x) => x.id === id)
    v += unitCost(m ? unitRec(d, m.unitId) : undefined)
    if (m) {
      const printed = new Set(unitRec(d, m.unitId)?.equipped ?? [])
      for (const item of chosenStandard(d, plan, id, m.unitId)) if (!printed.has(item)) v += cardValue(d, item)
    }
    for (const uid of plan.assign[id] ?? []) { const c = cards.get(uid); if (c?.counts) v += cardValue(d, c.card.defId) }
    for (const perk of plan.equipPerks[id] ?? []) v += perkRec(d, perk)?.cost ?? 0
  }
  v += plan.heroic.length * (d.heroicCost ?? 0)
  if (plan.leader) v += d.leaders.find((l) => l.id === plan.leader!.card)?.cost ?? 0
  return v
}

/** Every item a model can return to the force without it being a Step 3 card: printed Equipped items and the AI card's standard list. */
export function freeEquipment(d: CampaignData, unitId: string): string[] {
  return [...new Set([...(unitRec(d, unitId)?.equipped ?? []), ...standardEquipment(d, unitId)])]
}

/**
 * Caps value of a scenario's own force for one side (units and non-standard items), used as the other side's force value for
 * the 1,000-caps bonus (CH p19). Standard equipment is free, as it is for a settlement force.
 */
export function scenarioForceValue(d: CampaignData, forces: readonly ScenarioForce[] | undefined): number {
  let v = 0
  for (const f of forces ?? []) {
    const free = new Set(freeEquipment(d, f.unit))
    const each = unitCost(unitRec(d, f.unit)) + f.items.filter((id) => !free.has(id)).reduce((n, id) => n + cardValue(d, id), 0)
    v += each * Math.max(1, f.count)
    v += (f.heroic ? (d.heroicCost ?? 0) : 0) * Math.max(1, f.count)
    for (const perk of f.perks ?? []) v += (perkRec(d, perk)?.cost ?? 0) * Math.max(1, f.count)
  }
  return v
}
