// Campaign layer types (spec 19 s7, spec 00 s11). A pure layer beside the engine: nothing here touches a frozen engine file.
// Plain JSON only, so a campaign saves to localStorage and replays from its log.

export type SeatKey = string

/** The CH between-battle sequence as named steps (spec 19 s7). */
export const STEP_IDS = [
  'afterBattle.caps', 'afterBattle.strip', 'afterBattle.retain', 'afterBattle.lockers', 'afterBattle.sell', 'afterBattle.leader',
  'build.market', 'build.structures', 'build.perks', 'build.power',
  'draw.structures', 'draw.explore',
  'select.stores', 'select.lockers', 'select.sell',
  'force.create', 'force.quest', 'toBattle',
] as const
export type StepId = typeof STEP_IDS[number]

export type CardKind = 'weapon' | 'armor' | 'item' | 'mod' | 'boost'

/** One physical card in a player's pool, hand or locker. Copies of the same record are separate cards (Counting Token rule). */
export interface PoolCard {
  uid: string
  defId: string
  kind: CardKind
  /** Unique items bypass the Maintenance Sheds and the Item Deck (ERR p.3). */
  unique?: boolean
  /** Where the card came from (display and tests). */
  from?: 'carried' | 'found' | 'drawn' | 'quest' | 'locker' | 'market' | 'explore' | 'retained' | 'hand' | 'linked'
  /** Limited-use item already used in the last battle; refreshed when the card is stripped (ERR p.17). */
  spent?: boolean
  /** Power Armor that ended the last battle flipped to its degraded side (CH p24). */
  degraded?: boolean
  /** Mods fitted to this weapon or armor card. */
  mods?: string[]
}

export interface StructureInst { id: string; defId: string }

export interface Injury { id: string; since: number }

/** A persistent model of the player's roster. CH has no injuries or experience, so those stay empty (RULING). */
export interface RosterModel {
  id: string
  unitId: string
  name?: string
  injuries: Injury[]
  xp: number
  /** Perk ids this model bought (not the settlement-wide ones). */
  perks: string[]
  /** Pool card uids assigned for the next battle (set by force.create). */
  equipped: string[]
  /** Armor Boost tokens added by an Armor Workbench (max rules.armorBoostMax). */
  armorBoost?: number
  /** Perk ids equipped for the next battle (subset of `perks`). */
  perksEquipped?: string[]
  /** Power Armor record ids (standard equipment) that ended the last battle degraded (CH p24). */
  degraded?: string[]
}

export interface QuestProgress {
  /** Quest title (shared by every part), e.g. 'thiefs-trail'. */
  title: string
  /** The card the player is on now (a part id). */
  card: string
  /** Card ids completed so far (each counts toward Land, CH p6). */
  completed: string[]
  /** Card ids attempted and failed (may be retried, CH p6). */
  failed: string[]
}

export interface CampaignLogEntry { round: number; seat: SeatKey | null; type: string; text: string; data?: Record<string, unknown> }

/** An Explore card drawn in Step 2 and not yet resolved. */
export interface ExploreDraw {
  structureId: string
  cardId: string
  tested: boolean
  /** Test outcome once rolled. */
  passed?: boolean
  /** Item uids committed to the test (food cannot prevent damage, EXPL-003). */
  committed: string[]
}

export interface DrawSpec { deck: 'item' | 'boost'; itemClass?: string; boostType?: string; draw: number; keep: number; perCropField?: boolean }

export interface PendingDraw {
  structureId: string
  /** Cards on the table for this draw-and-keep. */
  cards: PoolCard[]
  keep: number
  /** Brahmin modifier already applied to this draw, if any. */
  modified?: string
  spec: DrawSpec
}

export interface PhaseState {
  /** True once any Step 2 draw has happened: Build is closed (CAMP-002). */
  drawn: boolean
  /** Structure instance ids already used this phase (SETT-010). */
  used: string[]
  /** Power Armor Stations that repaired a suit this phase: a repair is separate from the station's own draw (CH p21, p24). */
  repaired: string[]
  /** Structures the player chose to leave dark (SETT-008). */
  darkChoice: string[]
  /** Listening Post uses this phase. */
  listeningUses: number
  /** Draw counter: the n-th draw of the step feeds deriveSeed (CAMP-008). */
  n: number
  /** Cards remaining in each deck (record ids), built at the first draw. */
  decks: { item: string[]; boost: string[]; explore: string[] } | null
  pending: PendingDraw | null
  explore: ExploreDraw | null
  /** Cards drawn and not kept: sold at the end of the phase (SETT-012). */
  rejects: PoolCard[]
  /** After a battle: everything gathered (carried in + found), before retention. */
  gathered: PoolCard[]
  /** Perks bought this phase, keyed by model id ('settlement' for settlement-wide) (PERK-003). */
  perkBought: string[]
  /** The Leader was reassigned in this gap (CAMP-015). */
  leaderMoved: boolean
  /** Markets: the Mods on the table and who has resolved. */
  market: { structureId: string; cards: PoolCard[] } | null
  marketsDone: string[]
}

export interface ExploreEffect { source: string; damage: number }

export interface LinkedConsequence { scenarioId: string; applyTo: string; text: string; effect: unknown }

export interface ForcePlan {
  members: string[]
  assign: Record<string, string[]>
  equipPerks: Record<string, string[]>
  /**
   * Standard equipment each member takes into the battle (CH p24: any or all of it). A model left out takes all of its
   * standard equipment; each chosen item is costed (CH p26). Printed Equipped items are always carried and free (ERR p.15).
   */
  standard?: Record<string, string[]>
  heroic: string[]
  leader: { modelId: string; card: string } | null
  capsLimit: number
  value: number
}

export interface CampaignPlayer {
  seat: SeatKey
  /** Co-op team id: teammates never run the same Quest (QUEST-007). */
  team?: string
  faction: string
  caps: number
  pool: PoolCard[]
  structures: StructureInst[]
  roster: RosterModel[]
  /** Settlement-wide Perks owned (Armorer, Blacksmith, Gun Nut ..., Local Leader ...). */
  perks: string[]
  quests: QuestProgress[]
  land: number
  // ---- additive (spec 19 s7 notes) ----
  step: StepId
  phase: PhaseState
  /** The Leader: a roster model and the Leader card on it. */
  leader: { modelId: string; card: string } | null
  /** The Leader was removed in the last battle: Explore tests at -2 (CH p22). */
  leaderRemoved: boolean
  /** Boost hand for the next battle (public size, secret contents). */
  hand: PoolCard[]
  /** Item cards taken at Step 3 for the next battle. */
  selected: PoolCard[]
  /** Quest reward cards earned for the next battle (QUEST-006). */
  rewards: PoolCard[]
  /** Items parked in Lockers during the last Step 3. */
  lockers: PoolCard[]
  /** Consequence card ids waiting for the next Event Deck (EVENT-007). */
  consequences: string[]
  /** Explore damage to assign to models at set-up (EXPL-004). */
  exploreEffects: ExploreEffect[]
  /** Completed Quest cards already spent on Land. */
  questsSpent: number
  /** The Quest chosen for the coming battle (QUEST-001). */
  quest: string | null
  /** Force plan used by toBattle. */
  force: ForcePlan | null
  /** Force value recorded for the last battle (the 1,000-caps bonus, CAMP-004). */
  lastForceValue: number
  /** Linked-scenario consequences waiting to apply (CAMP-016). */
  linked: LinkedConsequence[]
  /** Random Boosts owed at the next battle's start (BOOST-005). */
  boostsOwed: number
  /** Linked-scenario Caps-limit change for the next force, earned at the end of the last battle (CAMP-016). */
  capsLimitDelta?: number
  /** Counter for minted card uids. */
  uidSeq: number
}

export interface Campaign {
  id: string
  edition: string
  name: string
  createdAt: number
  players: CampaignPlayer[]
  /** Battle number the next battle will be (1 for the first). */
  round: number
  log: CampaignLogEntry[]
  /** The battle in progress: scenario, seats, and the roster-to-engine model id map per seat (set by toBattle's caller). */
  current?: { scenarioId: string; seats: SeatKey[]; models?: Record<SeatKey, Record<string, string>>; opponentForceValue?: number }
  /** Save version (the storage key is versioned too). */
  version: 1
}

// ---------- actions (one per between-battle step, spec 19 s7) ----------
export type BattleOutcome = 'win' | 'lose' | 'draw'

export type CampaignAction =
  | { type: 'afterBattle.caps'; seat: SeatKey; outcome: BattleOutcome; scenarioCaps?: number; bigForce?: boolean; scenarioId?: string; level?: 'major' | 'minor'; side?: string
      /** Set when a real battle just ended: closes the battle, moves the campaign to this round and opens a fresh Settlement Phase. */
      newRound?: number }
  | { type: 'afterBattle.strip'; seat: SeatKey; carried: PoolCard[]; found: PoolCard[]; boosts: PoolCard[]; removed: string[]; leaderRemoved?: boolean; degraded?: { modelId: string; defId: string }[] }
  | { type: 'afterBattle.result'; seat: SeatKey; scenarioId: string; nextScenarioId: string | null; forceValue: number; questFailed: string | null; consequencesLeft: string[] | null; linked: LinkedConsequence[] }
  | { type: 'afterBattle.retain'; seat: SeatKey; keep: string[]; sellUniques?: string[] }
  | { type: 'afterBattle.lockers'; seat: SeatKey }
  | { type: 'afterBattle.sell'; seat: SeatKey }
  | { type: 'afterBattle.leader'; seat: SeatKey; modelId?: string; card?: string }
  | { type: 'build.market'; seat: SeatKey; structureId: string; buy?: string[] }
  | { type: 'build.structures'; seat: SeatKey; op: 'buy'; defId: string; pay?: 'caps' | 'quests' }
  | { type: 'build.structures'; seat: SeatKey; op: 'scrap'; structureId: string }
  | { type: 'build.perks'; seat: SeatKey; op: 'buy'; perkId: string; modelId?: string }
  | { type: 'build.perks'; seat: SeatKey; op: 'remove'; perkId: string; modelId?: string }
  | { type: 'build.power'; seat: SeatKey; dark: string[] }
  | { type: 'draw.use'; seat: SeatKey; structureId: string }
  | { type: 'draw.modify'; seat: SeatKey; how: 'redrawAll' | 'drawExtra' | 'keepExtra'; structureId: string }
  | { type: 'draw.keep'; seat: SeatKey; keep: string[] }
  | { type: 'draw.reuse'; seat: SeatKey; structureId: string; target: string }
  | { type: 'draw.name'; seat: SeatKey; structureId: string; target: string; defId: string }
  | { type: 'draw.armorBoost'; seat: SeatKey; structureId: string; modelId: string }
  | { type: 'draw.repair'; seat: SeatKey; structureId: string; uid?: string; modelId?: string }
  | { type: 'draw.explore'; seat: SeatKey; structureId: string; commit?: string[] }
  | { type: 'draw.explore.redraw'; seat: SeatKey; structureId: string }
  | { type: 'draw.explore.test'; seat: SeatKey }
  | { type: 'draw.explore.resolve'; seat: SeatKey; pay?: boolean }
  | { type: 'select.stores'; seat: SeatKey; take: string[] }
  | { type: 'select.lockers'; seat: SeatKey; park: string[] }
  | { type: 'select.sell'; seat: SeatKey }
  | { type: 'force.create'; seat: SeatKey; plan: Omit<ForcePlan, 'value'> }
  | { type: 'force.quest'; seat: SeatKey; questId: string | null }
  | { type: 'roster.add'; seat: SeatKey; unitId: string; name?: string }
  | { type: 'roster.remove'; seat: SeatKey; modelId: string }
  | { type: 'quest.complete'; seat: SeatKey; cardId: string; outcome?: number; next?: string; swapReward?: boolean }
  | { type: 'step.next'; seat: SeatKey }

export type CampaignActionType = CampaignAction['type']

export class CampaignError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.name = 'CampaignError'; this.code = code }
}
