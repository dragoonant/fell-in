// Campaign record types (M6, additive; spec 19, spec 20 "Campaign records"). Pure types and enums: no data and no fs.
// Files live under data/<edition>/campaign/<kind>.json as an envelope { kind, sources, hooks, rulings?, records }.
import type { Attr, Code, Effect, PerkDef, Skill, Source, UnitType } from './types'

export const CAMPAIGN_KINDS = ['structures', 'perks', 'boosts', 'events', 'quests', 'explore', 'injuries', 'caps-awards'] as const
export type CampaignKind = typeof CAMPAIGN_KINDS[number]

export const BOOST_TYPES = ['practiced', 'cunning', 'tactical', 'instinctive'] as const
export const ITEM_CLASSES = ['any', 'junkGear', 'weapon', 'armor', 'clothing', 'foodDrink', 'medical', 'chem', 'mod', 'armorMod', 'powerArmorMod', 'robotMod', 'creatureMod'] as const
export const STRUCTURE_GROUPS = ['infrastructure', 'crafting', 'item', 'boost', 'other', 'exploration'] as const
export const EXPLORE_WHEN = ['pass', 'fail', 'pay', 'always'] as const
export type BoostType = typeof BOOST_TYPES[number]
export type ItemClass = typeof ITEM_CLASSES[number]
export type StructureGroup = typeof STRUCTURE_GROUPS[number]

/** Placeholder marker: the card's name is known but no local source shows its text (spec 20). */
export const PLACEHOLDER = 'placeholder'
/** Kinds that may carry a placeholder source (the known card-text gaps, spec 20). */
export const PLACEHOLDER_KINDS: readonly CampaignKind[] = ['boosts', 'events', 'quests', 'explore']

export type StructureEffect =
  | { op: 'draw'; deck: 'item' | 'boost'; itemClass?: ItemClass; boostType?: BoostType; draw: number; keep: number; perStructure?: boolean }
  | { op: 'drawPerCropField'; itemClass: 'foodDrink'; maxDraw: 5; keep: 1 }
  | { op: 'retain'; items: 1; boosts: 2 }
  | { op: 'stores'; items: 1; boosts: 2 }
  | { op: 'locker'; items: 1 }
  | { op: 'explore'; capsPerUse?: number; repeatable?: boolean }
  | { op: 'exploreRedraw' }
  | { op: 'modifyDraw'; how: 'redrawAll' | 'drawExtra' | 'keepExtra'; n?: number }
  | { op: 'reuse' } | { op: 'nameItem' }
  | { op: 'market'; itemClass: ItemClass; draw: 4 }
  | { op: 'repairPowerArmor'; suits: 1 }
  | { op: 'armorBoost'; n: 1 }
  | { op: 'none' }

export interface StructureDef {
  id: string; name: string; group: StructureGroup; cost: number
  /** Land only: it can also be bought by completing this many Quests (CH p18, p22). */
  questsAlt?: number
  /** Power needed in Step 2; default 1; 0 = "No Power required". */
  power?: number
  water?: number
  provides?: { power?: number; water?: number; slots?: number }
  /** perks: any-of (the Gun Nut family); structures: all-of. */
  requires?: { perks?: string[]; structures?: string[] }
  max?: number
  /** Copies a new settlement gets free (CH p18). */
  starting?: number
  /** Faction name for the same Structure (Crop Field is a Meat Bag for Super Mutants). */
  altName?: string
  text: string
  effect: StructureEffect | Code
  /** Other use of the same Structure, chosen instead of `effect` (Armor Workbench: Armor Boost token). */
  alternatives?: StructureEffect[]
  /** Extra effects of the same use (Power Armor Station also repairs one suit). */
  extra?: StructureEffect[]
  source: Source
}

/** PerkDef (types.ts) plus the campaign fields of spec 20; unknown optional fields are additive. */
export interface CampaignPerkDef extends PerkDef {
  requires?: {
    perks?: string[]; attrs?: Partial<Record<Attr, number>>; skills?: Partial<Record<Skill, number>>
    abilities?: string[]; unique?: boolean; notTypes?: UnitType[]; faction?: string
  }
  grants?: { structure: string }[]
  allowsMods?: ItemClass[]
  /** ModDef.fitsTo values the allowed Mods may have (Gun Nut (Rifle): rifle). */
  modFits?: string[]
  deck?: string
}

export interface BoostDef {
  id: string; name: string
  /** null only while the card's type is unsourced (typeUnknown true). */
  type: BoostType | null; typeUnknown?: boolean
  text: string | null; cost?: number
  timing: string | null
  effect: Effect[] | Code
  partial?: boolean; deck?: string; source: Source
}
export interface EventDef {
  id: string; name: string; text: string | null
  /** null = unknown (placeholder or partial); reads as no Flip. */
  flip: boolean | null; persists?: boolean
  consequence?: boolean; owner?: 'player'
  effect: Effect[] | Code
  partial?: boolean; deck?: string; source: Source
}
export interface QuestDef {
  id: string; name: string; title: string; part?: string
  story: string | null; task: string | null; next?: string[]
  reward: { caps?: number; items?: string[]; boosts?: number; consequence?: string; code?: Code }[]
  repeatable?: boolean; deck?: string; source: Source
}
export interface ExploreOutcome {
  when: typeof EXPLORE_WHEN[number]
  /** Caps gained (pass, fail, always). */
  caps?: number
  /** Caps the player pays to take this outcome (when 'pay'). */
  payCaps?: number
  items?: number; itemClass?: ItemClass; damage?: number; consequence?: string; code?: Code
}
export interface ExploreDef {
  id: string; name: string; text: string | null
  test?: { skill?: Skill; attr?: Attr; mod?: number }
  outcomes: ExploreOutcome[]
  /** An Item card that turns into this Explore resolution when drawn during Explore (Hand-Written Note). */
  viaItem?: string
  partial?: boolean; deck?: string; source: Source
}
export interface InjuryDef { id: string; name: string; text: string; effects: Effect[]; source: Source }
export interface SideAward { win?: number; major?: number; minor?: number }
export interface CapsAwardDef {
  id: string; name: string
  /** Absent = the default table (CH p19). */
  scenarioId?: string
  /** True while the scenario record is not entered yet (validator skips the existence check). */
  scenarioPending?: boolean
  winner: number; loser: number; draw?: 'winner' | number
  bigForceBonus?: { from: number; each: number }
  byLevel?: { major?: number; minor?: number }
  /** Per-side overrides keyed by the scenario's side id (additive). */
  bySide?: Record<string, SideAward>
  effect?: Code; notes?: string; source: Source
}

export interface CampaignKindMap {
  structures: StructureDef; perks: CampaignPerkDef; boosts: BoostDef; events: EventDef
  quests: QuestDef; explore: ExploreDef; injuries: InjuryDef; 'caps-awards': CapsAwardDef
}

/** One data/<edition>/campaign/<kind>.json file. `hooks` names every {"code"} used inside `records`. */
export interface CampaignFile<K extends CampaignKind = CampaignKind> {
  kind: K
  /** Source tag (the first word of a source string) -> the file it names and how pages are counted. */
  sources: Record<string, string>
  hooks: Record<string, string>
  /** RULING lines for docs/needs-rules-check.md, written by the data stage. */
  rulings?: string[]
  records: CampaignKindMap[K][]
}

export type CampaignRecords = { [K in CampaignKind]: CampaignKindMap[K][] }
/** The parsed envelopes of one edition's data/<edition>/campaign/ folder, keyed by kind; a missing file is undefined. */
export type CampaignFiles = Partial<Record<CampaignKind, unknown>>
