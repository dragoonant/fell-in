# 20 Data schema and M1 card list

All game content is declarative JSON. Every record carries `source` (string or array) naming the file
key from `10` plus page/section, e.g. `"CARDS p.22; COST Assault Rifle"`. Prose fields (`text`,
`flavor`) are our own words. Validation (`npm run validate:data`) rejects records without `source`.

## 1. Edition-keyed layout (owner: 2nd edition ships ~Nov 2026, we migrate then)
```
data/
  editions.json                 # { "default": "1e", "editions": ["1e"] }
  1e/
    dice.json                   # face tables (13); per die: faces[1..N] -> icons + value
    rulers.json                 # colours, inches, order, colour-blind marks (14)
    rules.json                  # edition numbers: maxDicePerColour 4, actionsPerActivation 2,
                                # quickActionPenalty -2, coverPenalty -2, coverArmorBonus 1,
                                # speciality +2, strBonusThreshold 7, intoMeleeBonus 2,
                                # sharingRange "Yellow", fallingTable, armorBoostMax 4, luckBonus 2
    costs.json                  # caps per unit/item/leader/heroic/perk (COST)
    units/*.json  weapons/*.json  armor/*.json  items/*.json  mods/*.json
    perks/*.json  leaders/*.json  heroic.json  factions/*.json  ai/*.json  scenarios/*.json
```
The engine reads every edition-specific number through `edition` lookups (dice faces, ruler lengths,
costs, rule constants). No such number is a literal in `src/engine`.

### 2nd edition migration note (expected changes; confirm when rules release)
Likely to change: dice faces/icons and possibly die types, ruler set and lengths, caps costs and card
stats (all cards reissued), turn/activation structure details, AI system (2e previews describe a
Threat/Priority token AI with stealth and alarm markers instead of the response matrix), solo-first
scenario format, faction rules. Migration = new `data/2e/` tree + `rules.json` constants + an
`AiDecider` variant; 1e stays playable via `?edition=1e`.

## 2. Shared types
```ts
type Colour = 'orange'|'yellow'|'red'|'green'|'blue'|'black';
type DieColour = 'black'|'green'|'yellow'|'blue';
type Icon = 'DMG'|'AR'|'ACC1'|'ACC2'|'ACC3'|'BOT'|'STAR'|'BLAST'|'AP'|'CP'|'X';
type DamageType = 'physical'|'energy'|'radiation';
type Skill = 'melee'|'pistol'|'rifle'|'heavy'|'throw'|'search'|'lockpick'|'computers'|'presence'|'battleCry'|'resistBattleCry';
type Attr = 'str'|'per'|'end'|'cha'|'int'|'agi'|'luc';
type ArmorValue = { base: number; strong?: number } | 'none' | 'immune';   // "-" and "X"
type DicePool = Partial<Record<DieColour, number>>;
type Source = string | string[];
```

## 3. Records
```ts
interface DiceDef { edition: string; skill: { faces: {value: number|'X'; icons: Icon[]}[] };
  effect: Record<DieColour, {icons: Icon[]}[]>; armor: number[]; source: Source }

interface UnitDef { id: string; name: string; faction: string|null; unique: boolean;
  versionGroup?: string;            // Dogmeat variants share one unique group
  types: ('creature'|'dog'|'robot'|'synth')[]; baseMm: 32|40|50|60;
  move: Colour; charge: Colour; awareness: Colour;
  attrs: Record<Attr, number>;
  skills: { skill: Skill; attr: Attr; colour?: Colour; white?: boolean }[]; // throw/presence/battleCry colours
  healthAttr: Attr; armor: Record<DamageType, ArmorValue>;
  apUse?: ('movement'|'attack'|'expertise'|'prepare')[]; critical?: boolean; luck?: boolean;
  flags?: ('unimpeded'|'cannotClimb'|'battleCryImmune'|'fast')[];
  abilities: { id: string; name: string; aura?: boolean; text: string; hook?: string }[];
  equipped: string[]; specialities?: { target: string; bonus: 2; extra?: string }[];
  cost: number; source: Source }

interface WeaponDef { id: string; name: string; skill: Skill; restriction?: string;
  short?: Colour | 'throw'; long?: Colour; minShortZero?: boolean;
  dice: { short?: DicePool; long?: DicePool; melee?: DicePool };
  damage: { type: DamageType; value: number; area?: Colour; lowerOfPhysEnergy?: boolean }[];
  targetExtra?: { damage?: number; effect?: string };
  specials: { cost: Icon[]; max?: number; outcome: string; hook?: string; criticalOnly?: boolean }[];
  critical?: { rating: number; damage?: {type: DamageType; value: number}[]; extraDice?: DicePool;
    restriction?: 'shortOnly'|'longOnly'; effects?: string[] };
  slowFiring?: boolean; noEmpty?: boolean; unique?: boolean; primed?: { tokens: number; gain: string; use: string };
  walkedFire?: { shots: number; colour: Colour }; scatter?: { failBy: [number, number|null]; colour: Colour }[];
  grenade?: boolean; mine?: { trigger: Colour }; limitedUse?: boolean; heavy?: boolean;
  cost: number; source: Source }

interface ArmorDef { id: string; name: string; kind: 'armor'|'clothing'|'powerArmor';
  sets?: Partial<Record<DamageType, ArmorValue>>; modifies?: Partial<Record<DamageType, number>>;
  attrBonus?: Partial<Record<Attr, number>>; restriction?: string; abilities?: string[];
  powerArmor?: { green: { attrBonus: Partial<Record<Attr,number>>; armor: Record<DamageType, ArmorValue>; endBonus: number };
                 yellow: { attrBonus: Partial<Record<Attr,number>>; armor: Record<DamageType, ArmorValue> } };
  cost: number; source: Source }

interface ItemDef { id: string; name: string; kind: 'chem'|'alcohol'|'food'|'gear'|'junk';
  limitedUse: boolean; duration: 'instant'|{fixed: number}|{diminishing: Partial<Record<Attr|'ap'|'armorAll', number>>[]};
  effects: { op: string; args?: object }[]; cooked?: { effects: object[] };
  addictive?: { icon: 'BOT'|'STAR'|'BLAST'; addicted: object[] }; shareable?: boolean;
  restriction?: string; cost: number; source: Source }

interface ModDef { id: string; name: string; fitsTo: (Skill|'armor'|'powerArmor')[]; altName?: string;
  effects: object[]; cost: number; source: Source }

interface PerkDef { id: string; name: string; effects: object[]; settlementWide?: boolean; cost: number; source: Source }
interface LeaderDef { id: string; name: string; factionLock?: string; abilities: UnitDef['abilities']; cost: number; source: Source }
interface HeroicDef { id: 'heroic'; vats: 'BOT'; healthBonus: 1; critical: true; luck: true;
  apUse: ('movement'|'attack'|'expertise')[]; cost: number; source: Source }
interface FactionDef { id: string; name: string; rules: { id: string; text: string; hook: string }[]; source: Source }

interface AiCardDef { unitId: string; standardEquipment: string[];
  columns: { label: string; when: { damageTaken?: [number, number]; other?: string } }[];
  rows: { blueIcons: ('BOT'|'STAR'|'BLAST'|'BOT+STAR'|'BOT2'|'STAR2')[];
    cells: { response: 'A'|'M'|'O'|'F'|'D'|'S'; reckless: boolean; stayEngaged: boolean }[];
    method: ('ranged'|'close')[] }[];
  targetPriority: ('nearest'|'vulnerable'|'leader'|'importance'|'prepared'|'mostDamaged'|'highestHealth'|string)[];
  preferFirst?: string; notes?: string[]; source: Source }   // source "placeholder" until real cards are entered

interface ScenarioDef { id: string; name: string; mode: 'tutorial'|'versus'|'ai'|'coop';
  tableIn: [number, number]; rounds: number|null;
  sides: { id: string; faction?: string; forces?: { unit: string; count: number; items: string[]; heroic?: boolean; leader?: string }[];
    deploy: object; capsBonusPct?: number; ai?: { objective: 'defeat'|'goTo'|'use'|'protect'; subject: string;
    switches?: { when: string; set: object }[] } }[];
  markers: { kind: 'investigation'|'searchable'|'object'; face?: string; place: object; props?: object }[];
  terrain?: object[]; wastelandDecks?: { items?: string[] };
  rules: { id: string; text: string; hook?: string }[];
  victory: { side: string; level?: 'major'|'minor'; when: string; caps?: number }[];
  source: Source }
```
Special or one-off behaviour uses `hook` names (escape hatches) implemented in `src/engine/hooks`.

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
- Gear (3): Stealth Boy, Stimpak, RadAway (CARDS p.44, p.49-50).
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
