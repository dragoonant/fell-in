// Campaign data access (spec 20 "Campaign records"). The campaign layer reads every number from data records through
// CampaignData, never from a literal; the only fallbacks below are the Campaign Handbook defaults used when a record kind
// is missing from the bundle, and each one is a logged RULING (src/campaign/rulings.ts).
import type { EditionBundle, ArmorDef, ItemDef, ModDef, UnitDef, WeaponDef, AiCardDef, LeaderDef, ScenarioDef } from '../data/types'

export type ItemClass = 'any' | 'junkGear' | 'weapon' | 'armor' | 'clothing' | 'foodDrink' | 'medical' | 'chem' | 'mod' | 'armorMod' | 'powerArmorMod' | 'robotMod' | 'creatureMod'
export type BoostType = 'practiced' | 'cunning' | 'tactical' | 'instinctive'
export type CodeRef = { code: string; args?: Record<string, unknown> }
type Source = string | string[]

export interface StructureRec {
  id: string; name: string; group: string; cost: number; questsAlt?: number
  power?: number; water?: number
  provides?: { power?: number; water?: number; slots?: number }
  requires?: { perks?: string[]; structures?: string[] }
  max?: number; starting?: number
  effect: Record<string, unknown> & { op?: string }
  /** Other use of the same Structure, chosen instead of `effect` (Armor Workbench: an Armor Boost token). */
  alternatives?: (Record<string, unknown> & { op?: string })[]
  /** Extra effects of the same use (Power Armor Station also repairs one suit). */
  extra?: (Record<string, unknown> & { op?: string })[]
  source?: Source
}
export interface PerkRec {
  id: string; name: string; text?: string; cost: number; settlementWide?: boolean
  requires?: { perks?: string[]; attrs?: Record<string, number>; skills?: Record<string, number>; abilities?: string[]; unique?: boolean; notTypes?: string[]; faction?: string }
  grants?: { structure: string }[]
  allowsMods?: string[]
  /** ModDef.fitsTo values the allowed Mods may have (Gun Nut (Rifle): rifle). */
  modFits?: string[]
  effects?: unknown[]; source?: Source
}
export interface BoostRec { id: string; name: string; type: BoostType | null; typeUnknown?: boolean; cost?: number; text?: string; timing?: string; effect?: unknown; source?: Source }
export interface EventRec { id: string; name: string; text?: string; flip?: boolean; persists?: boolean; consequence?: boolean; owner?: 'player'; effect?: unknown; source?: Source }
export interface QuestRec {
  id: string; name: string; title: string; part?: string; story?: string; task?: string; next?: string[]
  reward?: { caps?: number; items?: string[]; boosts?: number; consequence?: string; code?: CodeRef }[]
  repeatable?: boolean; noRetry?: boolean; source?: Source
}
export interface ExploreOutcome { when: 'pass' | 'fail' | 'pay' | 'always'; caps?: number; items?: number; itemClass?: ItemClass; damage?: number; consequence?: string; payCaps?: number; code?: CodeRef }
export interface ExploreRec { id: string; name: string; text?: string; test?: { skill?: string; attr?: string; mod?: number }; outcomes: ExploreOutcome[]; source?: Source }
export interface SideAwardRec { win?: number; major?: number; minor?: number }
export interface CapsAwardRec {
  id: string; scenarioId?: string; winner: number; loser: number; draw?: 'winner' | number
  bigForceBonus?: { from: number; each: number }; byLevel?: { major?: number; minor?: number }
  /** Per-side overrides keyed by the scenario's side id. */
  bySide?: Record<string, SideAwardRec>; effect?: CodeRef; source?: Source
}

export interface CampaignData {
  edition: string
  structures: readonly StructureRec[]
  perks: readonly PerkRec[]
  boosts: readonly BoostRec[]
  events: readonly EventRec[]
  quests: readonly QuestRec[]
  explore: readonly ExploreRec[]
  awards: readonly CapsAwardRec[]
  units: readonly UnitDef[]
  weapons: readonly WeaponDef[]
  armor: readonly ArmorDef[]
  items: readonly ItemDef[]
  mods: readonly ModDef[]
  leaders: readonly LeaderDef[]
  ai: readonly AiCardDef[]
  scenarios: readonly ScenarioDef[]
  /** Skill die faces (value or 'X'), for Explore tests. */
  dieFaces: readonly (number | 'X')[]
  /** rules.armorBoostMax. */
  armorBoostMax: number
  /** Caps cost of a Heroic card (data/<edition>/heroic.json). */
  heroicCost: number
}

/** Campaign Handbook defaults, used only when caps-awards.json has no default record (RULING: caps fallback). */
export const FALLBACK_AWARD: CapsAwardRec = { id: 'default', winner: 200, loser: 120, draw: 'winner', bigForceBonus: { from: 1000, each: 50 }, source: 'CH p19; ERR p.10' }

type Loose = Record<string, unknown>
function kindList<T>(bundle: EditionBundle, name: string): readonly T[] {
  const rec = bundle.records as unknown as Loose
  const direct = rec[name]
  if (Array.isArray(direct)) return direct as T[]
  const nested = (rec.campaign as Loose | undefined)?.[name]
  return Array.isArray(nested) ? (nested as T[]) : []
}

/** Build CampaignData from an edition bundle. Campaign kinds missing from the bundle read as empty lists. */
export function campaignData(bundle: EditionBundle): CampaignData {
  const r = bundle.records
  const dice = bundle.singletons.dice
  const rules = bundle.singletons.rules?.constants as Record<string, unknown> | undefined
  const perks = kindList<PerkRec>(bundle, 'perks')
  return {
    edition: bundle.edition,
    structures: kindList<StructureRec>(bundle, 'structures'),
    perks,
    boosts: kindList<BoostRec>(bundle, 'boosts'),
    events: kindList<EventRec>(bundle, 'events'),
    quests: kindList<QuestRec>(bundle, 'quests'),
    explore: kindList<ExploreRec>(bundle, 'explore'),
    awards: kindList<CapsAwardRec>(bundle, 'caps-awards').concat(kindList<CapsAwardRec>(bundle, 'capsAwards')),
    units: r.units, weapons: r.weapons, armor: r.armor, items: r.items, mods: r.mods, leaders: r.leaders, ai: r.ai, scenarios: r.scenarios,
    dieFaces: dice ? dice.skill.faces.map((f) => f.value) : [],
    armorBoostMax: typeof rules?.armorBoostMax === 'number' ? rules.armorBoostMax : 4,
    heroicCost: bundle.singletons.heroic?.cost ?? 0,
  }
}

// ---------- lookups ----------
const byId = <T extends { id: string }>(list: readonly T[], id: string): T | undefined => list.find((x) => x.id === id)
export const structureRec = (d: CampaignData, id: string) => byId(d.structures, id)
export const perkRec = (d: CampaignData, id: string) => byId(d.perks, id)
export const boostRec = (d: CampaignData, id: string) => byId(d.boosts, id)
export const eventRec = (d: CampaignData, id: string) => byId(d.events, id)
export const questRec = (d: CampaignData, id: string) => byId(d.quests, id)
export const exploreRec = (d: CampaignData, id: string) => byId(d.explore, id)
export const unitRec = (d: CampaignData, id: string) => byId(d.units, id)

/** Power a Structure needs in Step 2: its record's `power`, default 1, 0 = "No Power required" (CH p20-21). */
export function powerNeed(s: StructureRec): number { return s.power ?? 1 }
export const waterNeed = (s: StructureRec): number => s.water ?? 0

// ---------- cards ----------
export interface CardInfo { kind: 'weapon' | 'armor' | 'item' | 'mod' | 'boost'; name: string; cost: number; unique: boolean }

export function cardInfo(d: CampaignData, defId: string): CardInfo | null {
  const w = byId(d.weapons, defId); if (w) return { kind: 'weapon', name: w.name, cost: w.cost, unique: !!w.unique }
  const a = byId(d.armor, defId); if (a) return { kind: 'armor', name: a.name, cost: a.cost, unique: !!(a as { unique?: boolean }).unique }
  const i = byId(d.items, defId); if (i) return { kind: 'item', name: i.name, cost: i.cost, unique: !!(i as { unique?: boolean }).unique }
  const m = byId(d.mods, defId); if (m) return { kind: 'mod', name: m.name, cost: m.cost, unique: false }
  const b = byId(d.boosts, defId); if (b) return { kind: 'boost', name: b.name, cost: b.cost ?? 0, unique: false }
  return null
}
/** Caps value of a card: sold for this, and counted per model in a force (CH p19, p24). */
export const cardValue = (d: CampaignData, defId: string): number => cardInfo(d, defId)?.cost ?? 0

/** Every class a card belongs to. A chem that heals is both chem and medical (CH p21). */
export function classesOf(d: CampaignData, defId: string): Set<ItemClass> {
  const out = new Set<ItemClass>(['any'])
  const info = cardInfo(d, defId)
  if (!info) return out
  if (info.kind === 'weapon') out.add('weapon')
  else if (info.kind === 'armor') {
    const k = byId(d.armor, defId)!.kind
    if (k === 'clothing') out.add('clothing')
    else if (k === 'armor') out.add('armor') // Power Armor suits are not in the Item Deck (RULING)
  }
  else if (info.kind === 'item') {
    const it = byId(d.items, defId)!
    if (it.kind === 'chem') out.add('chem')
    else if (it.kind === 'food' || it.kind === 'alcohol') out.add('foodDrink')
    else out.add('junkGear')
    const heals = it.effects.some((e) => 'op' in e && (e.op === 'heal' || e.op === 'healRad' || e.op === 'cureInjury'))
    if (heals && it.kind !== 'food' && it.kind !== 'alcohol') out.add('medical')
  } else if (info.kind === 'mod') {
    const m = byId(d.mods, defId)!
    const fits = m.fitsTo as readonly string[]
    if (fits.includes('powerArmor')) out.add('powerArmorMod')
    else if (fits.includes('armor') || fits.includes('clothing')) out.add('armorMod')
    else if (m.requires?.types?.includes('robot')) out.add('robotMod')
    else if (m.requires?.types?.some((t) => t === 'creature' || t === 'dog')) out.add('creatureMod')
    else out.add('mod')
  }
  return out
}

/** Standard equipment of a unit: the black list on its AI card plus its printed Equipped items (CH p24; ERR p.4). */
export function standardEquipment(d: CampaignData, unitId: string): string[] {
  const card = d.ai.find((c) => c.unitId === unitId)
  return card ? [...card.standardEquipment] : []
}
export function printedEquipment(d: CampaignData, unitId: string): string[] {
  return [...(unitRec(d, unitId)?.equipped ?? [])]
}

/**
 * Which Mods a set of settlement Perks lets a workbench keep (SETT-013, SETT-020). A Perk allows a Mod when one of its
 * `allowsMods` classes (or a ModDef.fitsTo value, the older spelling) fits and, if it names `modFits`, the Mod fits one of them.
 */
export function modAllowed(d: CampaignData, modId: string, perkIds: readonly string[]): boolean {
  const m = byId(d.mods, modId)
  if (!m) return false
  const fits = m.fitsTo as readonly string[]
  const cls = classesOf(d, modId)
  return perkIds.some((id) => {
    const p = perkRec(d, id)
    if (!p?.allowsMods?.length) return false
    const classOk = p.allowsMods.some((a) => a === 'any' || cls.has(a as ItemClass) || fits.includes(a))
    return classOk && (!p.modFits?.length || p.modFits.some((f) => fits.includes(f)))
  })
}
