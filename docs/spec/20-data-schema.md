# 20 Data schema and M1 card list

**FROZEN at M1 (2026-10-11).** The TypeScript mirror is `src/data/types.ts`; the validator is
`npm run validate:data` (`tools/validate-data.ts`, core in `src/data/validate.ts`). A schema change
needs an edit here, the matching edit in `src/data/types.ts` and the validator, and a note in the
agent's `issues`. Amended after the dry run that encoded every Two Player Starter Set card
(drafts in `docs/sources/extract/dryrun/`, gitignored).

All game content is declarative JSON. Every record carries `id` and `source` (string or array)
naming the file key from `10` plus page/section, e.g. `"CARDS p.22; COST Assault Rifle"`; the literal
`"placeholder"` marks data still waiting for a source. Prose fields (`text`, ability and rule text) are
our own words, written from a one-line mechanical summary (IP rule). Validation rejects records
without `id` or `source`.

## 1. Edition-keyed layout (owner: 2nd edition ships ~Nov 2026, we migrate then)
```
data/
  editions.json                 # { "default": "1e", "editions": ["1e"] }
  1e/
    dice.json                   # DiceDef, face tables (13)
    rulers.json                 # RulersDef, colours, inches, order, colour-blind marks (14)
    rules.json                  # RulesDef, edition numbers: maxDicePerColour 4, actionsPerActivation 2,
                                # quickActionPenalty -2, coverPenalty -2, coverArmorBonus 1,
                                # speciality +2, strBonusThreshold 7, intoMeleeBonus 2,
                                # sharingRange "yellow", fallingTable, armorBoostMax 4, luckBonus 2
    heroic.json                 # HeroicDef
    units/ weapons/ armor/ items/ mods/ perks/ leaders/ factions/ ai/ scenarios/
```
- Each file inside a kind folder holds one record or an array of records of that kind (folder name =
  kind). Root files are singletons. Any file may be split or merged freely; only ids matter.
- Ids are kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`, e.g. `44-revolver`) and unique across the whole
  edition, so every cross-reference is a bare id.
- Caps costs live on each record's `cost` (source COST). There is no `costs.json`.
- The engine reads every edition-specific number through `edition` lookups (dice faces, ruler lengths,
  costs, rule constants). No such number is a literal in `src/engine`.
- Empty folders are legal (validation passes on an empty tree); singletons become required at M2.

### 2nd edition migration note (expected changes; confirm when rules release)
Likely to change: dice faces/icons and possibly die types, ruler set and lengths, caps costs and card
stats (all cards reissued), turn/activation structure details, AI system (2e previews describe a
Threat/Priority token AI with stealth and alarm markers instead of the response matrix), solo-first
scenario format, faction rules. Migration = new `data/2e/` tree + `rules.json` constants + an
`AiDecider` variant; 1e stays playable via `?edition=1e`.

## 2. Shared types
```ts
type Colour = 'orange'|'yellow'|'red'|'green'|'blue'|'black';        // ruler order, short to long
type DieColour = 'black'|'green'|'yellow'|'blue';
type Icon = 'DMG'|'AR'|'ACC1'|'ACC2'|'ACC3'|'BOT'|'STAR'|'BLAST'|'AP'|'CP'|'X';
type DamageType = 'physical'|'energy'|'radiation';
type Skill = 'melee'|'pistol'|'rifle'|'heavy'|'throw'|'search'|'lockpick'|'computers'|'presence'|'battleCry'|'resistBattleCry';
type Attr = 'str'|'per'|'end'|'cha'|'int'|'agi'|'luc';
type BaseMm = 25|32|40|50|80;                                        // = engine BaseMm (00 s2)
type UnitType = 'creature'|'dog'|'robot'|'synth';
type ApUse = 'movement'|'attack'|'expertise'|'prepare';
type UnitFlag = 'unimpeded'|'cannotClimb'|'battleCryImmune'|'fast';
type RulerStat = 'move'|'charge'|'awareness'|'presence'|'throw'|'battleCry';
type Range = 'short'|'long'|'melee';
type ArmorValue = { base: number; strong?: number } | 'none' | 'immune';   // "n", "n+s", "-", "X"
type DicePool = Partial<Record<DieColour, number>>;
type Source = string | string[];
type Code = { code: string; args?: Record<string, unknown> };          // escape hatch -> src/engine/hooks
```

### 2.1 Effects (one mechanism for every "does something" field)
Abilities, faction and scenario rules, items, mods, perks, leaders, chem stages and addictions all use
`Effect[]`, applied in array order (Mutant Hound Meat cooked: `healRad` then `heal`).
```ts
type EffectOp =
  | 'attrMod'      // attr, n          S.P.E.C.I.A.L. +/- n
  | 'skillMod'     // skill, n          SV +/- n for that skill only
  | 'armorMod'     // damageType|'all', n   flat armor, never strong (15 s1 step 4)
  | 'addDice'      // dice              extra effect dice on matching rolls
  | 'ensureDie'    // dice              add the die only if the pool lacks that colour (Stun Pack)
  | 'iconConvert'  // from, to, dieColours, n   e.g. blank -> BLAST on one die (Hardened Receiver)
  | 'heal' | 'healRad' | 'addRad'                  // n
  | 'gainAP'       // n, apUse?         apUse limits what the AP may buy (Jet: 'movement')
  | 'cureInjury'   // injury 'arm'|'leg'|'all'
  | 'rulerStep'    // stat, n           colour steps up (+) or down (-) the ruler order (Keen Eyes)
  | 'addSpecial'   // special           the weapon gains a WeaponSpecial (Stun Pack)
  | 'grantFlag'    // flag
  | 'choose';      // options: Effect[][]   user picks one list (Stimpak: heal 4 OR cure arm+leg)
interface OpEffect { op: EffectOp; n?: number; attr?: Attr; skill?: Skill;
  damageType?: DamageType|'all'; dice?: DicePool; dieColours?: DieColour[]; from?: Icon|'blank';
  to?: Icon; stat?: RulerStat; apUse?: ApUse; injury?: 'arm'|'leg'|'all'; flag?: UnitFlag;
  special?: WeaponSpecial; options?: Effect[][]; when?: Condition }
type Effect = OpEffect | (Code & { when?: Condition });
interface Condition { faction?: string; notFaction?: string; skills?: Skill[]; ranges?: Range[];
  damageTypes?: DamageType[]; targetTypes?: UnitType[]; code?: string }   // all keys AND-ed
```
Required fields per op are checked by the validator (`OP_FIELDS` in `src/data/validate.ts`).

### 2.2 Abilities and restrictions
```ts
interface Ability { id: string; name: string; text: string; aura?: boolean; glyph?: string;
  effects?: Effect[] }
interface Restriction { units?: string[]; types?: UnitType[]; factions?: string[];
  notFactions?: string[]; assignedOnly?: boolean; setsArmor?: boolean }
```
- `aura: true` exactly when the aura glyph is printed beside the ability (units and leaders); aura
  range is the holder's Presence colour and needs LoS (16).
- `glyph` records a printed icon that belongs to the ability (Sole Survivor's dog silhouette is the
  Dog Handler glyph).
- Every ability has `text` (validator). Behaviour the ops cannot say goes in a `Code` effect.

## 3. Records
```ts
interface DiceDef { id: 'dice'; skill: { faces: {value: number|'X'; icons: Icon[]}[] };   // 20 faces
  effect: Record<DieColour, {icons: Icon[]}[]>;  armor: number[];  source: Source }         // 12 faces
interface RulersDef { id: 'rulers'; rulers: { colour: Colour; inches: number; mark: string }[];  // ruler order
  source: Source }
interface RulesDef { id: 'rules'; constants: Record<string, number|string|object>; source: Source }

interface UnitDef { id: string; name: string; faction: string|null; unique: boolean;
  versionGroup?: string;            // Dogmeat / Sole Survivor variants share one unique group
  types: UnitType[]; baseMm: BaseMm;
  move: Colour; charge: Colour; awareness: Colour;
  attrs: Record<Attr, number>;
  skills: { skill: Skill; attr: Attr; colour?: Colour; white?: boolean }[];
  healthAttr: Attr; armor: Record<DamageType, ArmorValue>;
  apUse: ApUse[];                   // required; [] = no AP-use icon at all (Deathclaw: no Prepare)
  critical?: boolean; luck?: boolean; flags: UnitFlag[];
  abilities: Ability[]; equipped: string[];          // ids of weapons/armor/items
  specialities: { target: string; bonus: number; extra?: string }[];
  provenance?: Record<string, Source>;   // per-field source for values not printed on the card
  cost: number; source: Source }
```
- Skills sit on the row of the attribute they use: a skill may use any attribute (Brute: Presence
  on STR). A skill absent from `skills` cannot be tested (Settler: no Throw).
- `baseMm` is not printed on any card. It comes from the model's base (box contents, store photos or
  fan sources); `provenance.baseMm` names that source. With no source, the data agent picks the
  closest engine size from the model's footprint and logs a RULING (Unsourced).

### 3.1 Icon legend (how card glyphs map to fields)
| Glyph | Field |
|---|---|
| Boot with a crossed-out difficult-terrain (mountain) mark | `flags: 'unimpeded'` |
| Ladder or wall crossed out | `flags: 'cannotClimb'` |
| Battle Cry icon crossed out | `flags: 'battleCryImmune'` |
| Aura ring beside an ability name | `Ability.aura` |
| Glyph tied to an ability (dog silhouette = Dog Handler) | `Ability.glyph` |
| Shield / lightning bolt / trefoil next to a damage number | `damage[].type` physical / energy / radiation |
| `!N` box on the critical meter | `critical.rating` = N |
| First range bar / second range bar | `short` / `long` |
| White skill-die bar instead of a colour bar | `short: 'throw'` (range = model's Throw colour) |
| Target (aimed) icon | `targetExtra` |
| Red down arrow + phys/energy armor icons | `damage.lowerOfPhysEnergy` |
| Target : damage icon | `targetExtra.damage` 1 |
Every glyph mapping not stated in a rulebook is logged as a RULING (Unsourced) in
`docs/needs-rules-check.md`.

```ts
type Outcome = 'removeReaction'|'injuredArm'|'injuredLeg'|'stun'|'fire'|'poison'|'slow'
  | 'push'          // colour: push directly away
  | 'throw'         // colour: target is thrown (Deathclaw Crush)
  | 'gainAP'        // n
  | 'armorDown'     // n, damageType?: the target's armor is n lower for this hit
  | 'ignoreArmor'   // n: n damage ignores armor
  | 'extraDamage'   // n, damageType?
  | 'addIcon';      // icon, n: count as n extra icons for the specials
interface WeaponSpecial { cost?: Icon[];     // icons spent; absent = automatic (crit/target/primed)
  max?: number; outcome: Outcome | Code; n?: number; colour?: Colour; icon?: Icon;
  damageType?: DamageType }

interface WeaponDef { id: string; name: string; skill: Skill; restriction?: Restriction;
  skillRoll?: { attr: Attr; minusTargetAttr?: Attr };   // overrides the SV (Crush: STR - target AGI)
  short?: Colour | 'throw'; long?: Colour; minShortZero?: boolean;
  dice: { short?: DicePool; long?: DicePool; melee?: DicePool };
  damage: { type: DamageType; value: number; area?: Colour; lowerOfPhysEnergy?: boolean }[];
  targetExtra?: { damage?: number; specials?: WeaponSpecial[] };    // target icon (Frag/Missile: damage 1)
  specials: WeaponSpecial[];        // each needs cost
  critical?: { rating: number; damage?: WeaponDef['damage']; extraDice?: DicePool;
    restriction?: 'shortOnly'|'longOnly'; effects?: WeaponSpecial[] };
  slowFiring?: boolean; noEmpty?: boolean; unique?: boolean;
  primed?: { tokens: number; gain: 'afterActionNonFriendlyInLos'|'afterAction'|Code;
    use: 'attack'; onUse: WeaponSpecial[]; spend: 'all'|number };
  walkedFire?: { shots: number; colour: Colour }; scatter?: { failBy: [number, number|null]; colour: Colour }[];
  grenade?: boolean; mine?: { trigger: Colour }; limitedUse?: boolean; heavy?: boolean;
  cost: number; source: Source }
```
Deathclaw Crush: `skillRoll {attr:'str', minusTargetAttr:'agi'}`, `primed {tokens:3,
gain:'afterActionNonFriendlyInLos', use:'attack', onUse:[stun, throw yellow], spend:'all'}`.

```ts
interface ArmorDef { id: string; name: string; kind: 'armor'|'clothing'|'powerArmor'; text?: string;
  sets?: Partial<Record<DamageType, ArmorValue>>; modifies?: Partial<Record<DamageType, number>>;
  attrBonus?: Partial<Record<Attr, number>>; restriction?: Restriction; abilities?: Ability[];
  powerArmor?: { green: { attrBonus: Partial<Record<Attr,number>>; armor: Record<DamageType, ArmorValue> };
                 yellow: { attrBonus: Partial<Record<Attr,number>>; armor: Record<DamageType, ArmorValue> } };
  cost: number; source: Source }
```
Power armor End bonus is `attrBonus.end` on the green side (no separate `endBonus`).

```ts
type Duration = 'instant' | { fixed: number } | { diminishing: Effect[][] };
interface ItemDef { id: string; name: string; kind: 'chem'|'alcohol'|'food'|'gear'|'junk'; text: string;
  limitedUse: boolean; duration: Duration;
  effects: Effect[];                // on use (instant) or for the whole duration (fixed)
  cooked?: Effect[];                // replaces effects when cooked
  addictive?: { icon: 'BOT'|'STAR'|'BLAST'; addicted: Effect[] };
  shareable?: boolean; restriction?: Restriction; cost: number; source: Source }
```
- Diminishing: the `diminishing` lists are the card's printed columns, raw (not summed), listed in the order they
  are hidden (first entry hidden at the first activation start). While active, the effect is the
  sum of all columns not yet hidden (RoP p33-34, spec 15 s6); it ends when all are hidden. The grid's
  attribute rows become `attrMod`, the special row becomes `armorMod`/`addDice` (with `when.skills`
  for "melee only")/`gainAP`/`rulerStep awareness`.
- Addiction tables printed upside down are read after rotating the rendered page 180 degrees, so
  attribute names and values stay paired. `addicted` is a set; order does not matter.

```ts
type ModTarget = Skill | 'armor'|'clothing'|'powerArmor';
interface ModDef { id: string; name: string; text: string; fitsTo: ModTarget[];   // weapon skill or card kind
  requires?: Restriction;           // e.g. { setsArmor: true } for Dissipating
  altName?: { name: string; whenDamage: DamageType };   // Boosted Capacitor on energy weapons
  effects: Effect[]; cost: number; source: Source }
interface PerkDef { id: string; name: string; text: string; effects: Effect[]; settlementWide?: boolean;
  cost: number; source: Source }
interface LeaderDef { id: string; name: string; factionLock?: string; abilities: Ability[]; cost: number; source: Source }
interface HeroicDef { id: 'heroic'; vats: 'BOT'; healthBonus: number; critical: true; luck: true;
  apUse: ApUse[]; cost: number; source: Source }
interface FactionDef { id: string; name: string; rules: { id: string; text: string; effects: Effect[] }[]; source: Source }

interface AiCardDef { id: string; unitId: string; standardEquipment: string[];
  columns: { label: string; when: { damageTaken?: [number, number]; other?: string } }[];
  rows: { blueIcons: ('BOT'|'STAR'|'BLAST'|'BOT+STAR'|'BOT2'|'STAR2')[];
    cells: { response: 'A'|'M'|'O'|'F'|'D'|'S'; reckless: boolean; stayEngaged: boolean }[];
    method: ('ranged'|'close')[] }[];
  targetPriority: string[];   // 'nearest'|'vulnerable'|'leader'|'importance'|'prepared'|'mostDamaged'|'highestHealth'|...
  preferFirst?: string; notes?: string[]; source: Source }   // source "placeholder" until real cards are entered

interface ScenarioDef { id: string; name: string; mode: 'tutorial'|'versus'|'ai'|'coop';
  tableIn: [number, number]; rounds: number|null;
  sides: { id: string; faction?: string; forces?: { unit: string; count: number; items: string[]; heroic?: boolean; leader?: string }[];
    deploy: object; capsBonusPct?: number; ai?: { objective: 'defeat'|'goTo'|'use'|'protect'; subject: string;
    switches?: { when: string; set: object }[] } }[];
  markers: { kind: 'investigation'|'searchable'|'object'; face?: string; place: object; props?: object }[];
  terrain?: object[]; wastelandDecks?: { items?: string[] };
  rules: { id: string; text: string; effects?: Effect[] }[];
  victory: { side: string; level?: 'major'|'minor'; when: string; caps?: number }[];
  source: Source }
```
`Code` names are implemented in `src/engine/hooks` (M2). An unknown code is a runtime error, not a
validation error, until the hook registry exists.

### 3.2 Validator checks (`npm run validate:data`)
Every record has `id` + `source`; ids are kebab-case and unique per edition; cross-references resolve
(unit faction/equipped/versionGroup peers, leader factionLock, restriction units/factions, AI unitId
and equipment, scenario forces); enum fields hold listed values; `Effect` ops carry their required
fields; prose fields (`name`, ability/rule `text`, item/mod/perk `text`) are non-empty. Exit code 1
with one readable line per error.

## 4. M1 card list (Two Player Starter Set, names only)
Sources: CARDS (free print-and-play selection), RoP, COST. "Physical only" = in the boxed set but not
in any free PDF; needs the owner's cards or a later free reissue.
- Units (11): Sole Survivor, Sole Survivor Day One, Settler, Enslaved Tech, Dogmeat, Mutant Hound,
  Super Mutant, Brute, Aviator, Deathclaw, Aspirant Goddard (CARDS p.2-12).
- Factions/reference (3): Survivors, Super Mutants, General Reference (CARDS p.13-15); Dogs, Creatures
  reference text from ERR p.19.
- Weapons (21 + 1): Hunting Rifle, 10mm Pistol, Dog Bite, Baseball Bat, Pipe Pistol, Assault Rifle,
  Sledgehammer, Combat Shotgun, Bolt-Action Pipe Rifle, Board, Hound Bite, Deathclaw Swipe, Deathclaw
  Crush, Laser Rifle, Fragmentation Grenade, Missile Launcher, Combat Rifle, Laser Pistol, .44 Revolver,
  Plasma Rifle, Pipe Wrench (CARDS p.17-37); Improvised Weapon (RoP p24).
- Food and drink (5): Nuka-Cola, Nuka-Cherry, Iguana Bits, Mutant Hound Meat, Blood Pack (CARDS p.39-43).
- Gear (1): Stealth Boy; Chems: Stimpak, RadAway + 4 (CARDS p.44, p.49-50).
- Armor (2): Damaged Hazmat Suit, Sturdy Leather Armor (CARDS p.45-46).
- Clothing (2): Aviator Cap, Patched Three-Piece Suit (CARDS p.47-48).
- Mods (4): Comfort Grip, Hardened Receiver (Boosted Capacitor on energy weapons), Stun Pack,
  Dissipating (CARDS p.51-54).
- Alcohol (1): Bourbon. Chems (4): Psycho, Jet, Mentats, Buffout (CARDS p.56-60).
- Power Armor (1): T-60 Power Armor (CARDS p.62).
- Leaders (4): Brawler (Charming, Dirty Fighter), Hunter (Keen Eyes, Marksman), Wasteland Searcher
  (Forager, Persistent), Warden (Distraction, Resilient) (CARDS p.64-67).
- Heroic (1) (CARDS p.69; RoP p50).
- Physical only: AI cards for the 11 units, Perk, Boost, Event, Explore, Quest, Danger, Creature and
  Stranger cards, Campaign Handbook content.
- Dice and rulers: ruler inches from DICE text (orange 2, yellow 4, red 6, green 8, blue 10, black 12);
  die faces from spec 13 (the dice sheet is an icon sheet with no machine-readable faces).
