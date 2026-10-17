// TypeScript mirror of docs/spec/20-data-schema.md (FROZEN at M1).
// A change here needs the matching edit in spec 20 and in src/data/validate.ts.
import type { BaseMm } from '../engine/types'

export type { BaseMm }

// Enums are const arrays so the validator can check them at runtime.
export const COLOURS = ['orange', 'yellow', 'red', 'green', 'blue', 'black'] as const
export const DIE_COLOURS = ['black', 'green', 'yellow', 'blue'] as const
export const ICONS = ['DMG', 'AR', 'ACC1', 'ACC2', 'ACC3', 'BOT', 'STAR', 'BLAST', 'AP', 'CP', 'X'] as const
export const DAMAGE_TYPES = ['physical', 'energy', 'radiation'] as const
export const SKILLS = ['melee', 'pistol', 'rifle', 'heavy', 'throw', 'search', 'lockpick', 'computers', 'presence', 'battleCry', 'resistBattleCry'] as const
export const ATTRS = ['str', 'per', 'end', 'cha', 'int', 'agi', 'luc'] as const
export const BASE_MMS = [25, 32, 40, 50, 80] as const
export const UNIT_TYPES = ['creature', 'dog', 'robot', 'synth'] as const
export const AP_USES = ['movement', 'attack', 'expertise', 'prepare'] as const
export const UNIT_FLAGS = ['unimpeded', 'cannotClimb', 'battleCryImmune', 'fast', 'immobile'] as const
export const RULER_STATS = ['move', 'charge', 'awareness', 'presence', 'throw', 'battleCry'] as const
export const RANGES = ['short', 'long', 'melee'] as const
export const EFFECT_OPS = ['attrMod', 'skillMod', 'armorMod', 'addDice', 'ensureDie', 'iconConvert', 'heal', 'healRad', 'addRad', 'gainAP', 'cureInjury', 'rulerStep', 'addSpecial', 'grantFlag', 'choose'] as const
export const OUTCOMES = ['removeReaction', 'injuredArm', 'injuredLeg', 'stun', 'fire', 'poison', 'slow', 'push', 'throw', 'gainAP', 'armorDown', 'ignoreArmor', 'extraDamage', 'addIcon'] as const
export const ARMOR_KINDS = ['armor', 'clothing', 'powerArmor'] as const
export const ITEM_KINDS = ['chem', 'alcohol', 'food', 'gear', 'junk'] as const
export const ADDICTION_ICONS = ['BOT', 'STAR', 'BLAST'] as const
export const INJURIES = ['arm', 'leg', 'all'] as const
export const SCENARIO_MODES = ['tutorial', 'versus', 'ai', 'coop'] as const
export const AI_RESPONSES = ['A', 'M', 'O', 'F', 'D', 'S'] as const
export const AI_BLUE_ICONS = ['BOT', 'STAR', 'BLAST', 'BOT+STAR', 'BOT2', 'STAR2'] as const
export const PRIMED_GAINS = ['afterActionNonFriendlyInLos', 'afterAction'] as const

export type Colour = typeof COLOURS[number]
export type DieColour = typeof DIE_COLOURS[number]
export type Icon = typeof ICONS[number]
export type DamageType = typeof DAMAGE_TYPES[number]
export type Skill = typeof SKILLS[number]
export type Attr = typeof ATTRS[number]
export type UnitType = typeof UNIT_TYPES[number]
export type ApUse = typeof AP_USES[number]
export type UnitFlag = typeof UNIT_FLAGS[number]
export type RulerStat = typeof RULER_STATS[number]
export type Range = typeof RANGES[number]
export type EffectOp = typeof EFFECT_OPS[number]
export type Outcome = typeof OUTCOMES[number]
export type ArmorValue = { base: number; strong?: number } | 'none' | 'immune'
export type DicePool = Partial<Record<DieColour, number>>
export type Source = string | string[]
/** Escape hatch: named behaviour implemented in src/engine/hooks. */
export interface Code { code: string; args?: Record<string, unknown> }

// ---- effects ----
export interface Condition {
  faction?: string; notFaction?: string; skills?: Skill[]; ranges?: Range[]
  damageTypes?: DamageType[]; targetTypes?: UnitType[]; code?: string
}
export interface OpEffect {
  op: EffectOp; n?: number; attr?: Attr; skill?: Skill
  damageType?: DamageType | 'all'; dice?: DicePool; dieColours?: DieColour[]; from?: Icon | 'blank'
  to?: Icon; stat?: RulerStat; apUse?: ApUse; injury?: typeof INJURIES[number]; flag?: UnitFlag
  special?: WeaponSpecial; options?: Effect[][]; when?: Condition
}
export type CodeEffect = Code & { when?: Condition }
export type Effect = OpEffect | CodeEffect

export interface Ability { id: string; name: string; text: string; aura?: boolean; glyph?: string; effects?: Effect[] }
export interface Restriction {
  units?: string[]; types?: UnitType[]; factions?: string[]; notFactions?: string[]
  assignedOnly?: boolean; setsArmor?: boolean
}

// ---- records ----
export interface DiceDef {
  id: 'dice'; skill: { faces: { value: number | 'X'; icons: Icon[] }[] }
  effect: Record<DieColour, { icons: Icon[] }[]>; armor: number[]; source: Source
}
export interface RulersDef { id: 'rulers'; rulers: { colour: Colour; inches: number; mark: string }[]; source: Source }
export interface RulesDef { id: 'rules'; constants: Record<string, number | string | object>; source: Source }

export interface UnitSkill { skill: Skill; attr: Attr; colour?: Colour; white?: boolean }
export interface UnitDef {
  id: string; name: string; faction: string | null; unique: boolean; versionGroup?: string
  types: UnitType[]; baseMm: BaseMm
  move: Colour; charge: Colour; awareness: Colour
  attrs: Record<Attr, number>; skills: UnitSkill[]
  healthAttr: Attr; armor: Record<DamageType, ArmorValue>
  apUse: ApUse[]; critical?: boolean; luck?: boolean; flags: UnitFlag[]
  abilities: Ability[]; equipped: string[]
  specialities: { target: string; bonus: number; extra?: string }[]
  provenance?: Record<string, Source>
  cost: number; source: Source
}

export interface WeaponSpecial {
  cost?: Icon[]; max?: number; outcome: Outcome | Code; n?: number; colour?: Colour; icon?: Icon
  damageType?: DamageType
}
export interface DamageEntry { type: DamageType; value: number; area?: Colour; lowerOfPhysEnergy?: boolean }
export interface WeaponDef {
  id: string; name: string; skill: Skill; restriction?: Restriction
  skillRoll?: { attr: Attr; minusTargetAttr?: Attr }
  short?: Colour | 'throw'; long?: Colour; minShortZero?: boolean
  dice: { short?: DicePool; long?: DicePool; melee?: DicePool }
  damage: DamageEntry[]
  targetExtra?: { damage?: number; specials?: WeaponSpecial[] }
  specials: WeaponSpecial[]
  critical?: {
    rating: number; damage?: DamageEntry[]; extraDice?: DicePool
    restriction?: 'shortOnly' | 'longOnly'; effects?: WeaponSpecial[]
  }
  slowFiring?: boolean; noEmpty?: boolean; unique?: boolean
  primed?: {
    tokens: number; gain: typeof PRIMED_GAINS[number] | Code; use: 'attack'
    onUse: WeaponSpecial[]; spend: 'all' | number
  }
  walkedFire?: { shots: number; colour: Colour }
  scatter?: { failBy: [number, number | null]; colour: Colour }[]
  grenade?: boolean; mine?: { trigger: Colour }; limitedUse?: boolean; heavy?: boolean
  cost: number; source: Source
}

export interface PowerArmorSide { attrBonus: Partial<Record<Attr, number>>; armor: Record<DamageType, ArmorValue> }
export interface ArmorDef {
  id: string; name: string; kind: typeof ARMOR_KINDS[number]; text?: string
  sets?: Partial<Record<DamageType, ArmorValue>>; modifies?: Partial<Record<DamageType, number>>
  attrBonus?: Partial<Record<Attr, number>>; restriction?: Restriction; abilities?: Ability[]
  powerArmor?: { green: PowerArmorSide; yellow: PowerArmorSide }
  cost: number; source: Source
}

export type Duration = 'instant' | { fixed: number } | { diminishing: Effect[][] }
export interface ItemDef {
  id: string; name: string; kind: typeof ITEM_KINDS[number]; text: string
  limitedUse: boolean; duration: Duration; effects: Effect[]; cooked?: Effect[]
  addictive?: { icon: typeof ADDICTION_ICONS[number]; addicted: Effect[] }
  shareable?: boolean; restriction?: Restriction; cost: number; source: Source
}

export type ModTarget = Skill | 'armor' | 'clothing' | 'powerArmor'
export interface ModDef {
  id: string; name: string; text: string; fitsTo: ModTarget[]; requires?: Restriction
  altName?: { name: string; whenDamage: DamageType }
  effects: Effect[]; cost: number; source: Source
}
export interface PerkDef { id: string; name: string; text: string; effects: Effect[]; settlementWide?: boolean; cost: number; source: Source }
export interface LeaderDef { id: string; name: string; factionLock?: string; abilities: Ability[]; cost: number; source: Source }
export interface HeroicDef {
  id: 'heroic'; vats: 'BOT'; healthBonus: number; critical: true; luck: true
  apUse: ApUse[]; cost: number; source: Source
}
export interface FactionDef { id: string; name: string; rules: { id: string; text: string; effects: Effect[] }[]; source: Source }

export interface AiCardDef {
  id: string; unitId: string; standardEquipment: string[]
  columns: { label: string; when: { damageTaken?: [number, number]; other?: string } }[]
  rows: {
    blueIcons: typeof AI_BLUE_ICONS[number][]
    cells: { response: typeof AI_RESPONSES[number]; reckless: boolean; stayEngaged: boolean }[]
    method: ('ranged' | 'close')[]
  }[]
  targetPriority: string[]; preferFirst?: string; notes?: string[]; source: Source
}

/** Player-facing scenario briefing (M4c). goals: one sentence per side id, addressed to that side's player. */
export interface ScenarioBriefing { story: string; goals: Record<string, string>; howToWin: string[]; tips: string[] }
/** perks (M6, additive): ids of campaign PerkDef records equipped on every model of the entry (spec 19 s7, spec 20 "Campaign records"). */
export interface ScenarioForce { unit: string; count: number; items: string[]; heroic?: boolean; leader?: string; perks?: string[] }
export interface ScenarioCampaign {
  linkedId?: string; order?: number
  consequences?: { side: string; level: 'major' | 'minor'; applyTo: 'next' | 'final'; effect: Effect[] | Code; text: string }[]
}
export interface ScenarioDef {
  id: string; name: string; mode: typeof SCENARIO_MODES[number]
  tableIn: [number, number]; rounds: number | null
  sides: {
    id: string; faction?: string; forces?: ScenarioForce[]
    deploy: object; capsBonusPct?: number
    ai?: { objective: 'defeat' | 'goTo' | 'use' | 'protect'; subject: string; switches?: { when: string; set: object }[] }
  }[]
  markers: { kind: 'investigation' | 'searchable' | 'object'; face?: string; place: object; props?: object }[]
  terrain?: object[]; wastelandDecks?: { items?: string[] }
  rules: { id: string; text: string; effects?: Effect[] }[]
  victory: { side: string; level?: 'major' | 'minor'; when: string; caps?: number }[]
  briefing?: ScenarioBriefing
  /** M6 (additive): the five linked scenarios of the Campaign Handbook and the consequences each result carries forward (CH p35-39). */
  campaign?: ScenarioCampaign
  source: Source
}

// ---- bundle ----
/** Folder name under data/<edition>/ -> record type. */
export interface KindMap {
  units: UnitDef; weapons: WeaponDef; armor: ArmorDef; items: ItemDef; mods: ModDef; perks: PerkDef
  leaders: LeaderDef; factions: FactionDef; ai: AiCardDef; scenarios: ScenarioDef
}
export type Kind = keyof KindMap
export const KINDS: readonly Kind[] = ['units', 'weapons', 'armor', 'items', 'mods', 'perks', 'leaders', 'factions', 'ai', 'scenarios']
/** Root files under data/<edition>/ -> singleton type. */
export interface SingletonMap { dice: DiceDef; rulers: RulersDef; rules: RulesDef; heroic: HeroicDef }
export type SingletonName = keyof SingletonMap
export const SINGLETONS: readonly SingletonName[] = ['dice', 'rulers', 'rules', 'heroic']

export interface EditionsFile { default: string; editions: string[] }
export interface EditionBundle {
  edition: string
  records: { [K in Kind]: KindMap[K][] }
  singletons: Partial<SingletonMap>
  /** record id -> the file it came from (for error messages). */
  origin: Record<string, string>
}
