// Engine contract (FROZEN after M1; see docs/spec/00-architecture.md). Pure data, inches, y up, x/z ground plane.
// Origin = table centre. The table is 36 x 36 in (3 ft square). M2 additions are additive only (00 s10).
import type { DiceRolled } from './rng'

export type Id = string
export type ModelId = Id
export type SeatId = string
export interface Vec2 { x: number; z: number }

/** Base diameter in mm. Wasteland sculpts ship on 25, 32 and 40 mm round bases; larger creatures use 50+ later. */
export type BaseMm = 25 | 32 | 40 | 50 | 80
export type LifeState = 'active' | 'down' | 'dead'
/** Legacy wide alias kept for geometry/los/terrain. Rules code uses WastelandCondition (M2). */
export type ConditionId = string
/** Legacy wide alias kept for terrain resistances. Rules code uses WastelandDamageType (M2). */
export type DamageType = string
/** The 1st-edition conditions (spec 15 s5). At most one of each per model (COND-001). Injuries are injuredArm/injuredLeg. */
export const WASTELAND_CONDITIONS = ['frozen', 'injuredArm', 'injuredLeg', 'onFire', 'poisoned', 'slow', 'stunned'] as const
export type WastelandCondition = typeof WASTELAND_CONDITIONS[number]
/** Damage types (spec 15 s1); equal to the data schema's DamageType. */
export type WastelandDamageType = 'physical' | 'energy' | 'radiation'
/** Effect die colours (spec 13 s2); equal to the data schema's DieColour. */
export type EffectDieColour = 'black' | 'green' | 'yellow' | 'blue'

export type Shape = { circle: { r: number } } | { rect: { w: number; d: number } } | { polygon: Vec2[] }
export type TerrainRulesType = 'obstacle' | 'obstruction' | 'building' | 'forest' | 'shallowWater' | 'rough' | 'rubble' | 'hill' | 'trench' | 'hazard' | 'deepWater' | 'scenarioTerrain'

export interface ModelState {
  id: ModelId
  profileId: Id
  owner: SeatId
  unitId?: Id
  pos: Vec2
  elev: number // surface elevation in inches
  base: number // mm
  life: LifeState
  offTable?: boolean
  conditions: ConditionId[]
  inert?: boolean
  // ---- M2 rules state (additive). setup.ts modelDefaults() fills every field. ----
  /** Readiness token this round (TURN-001..009). */
  readiness: Readiness
  /** Regular damage tokens. Tokens (damage + rad) >= Health removes the model (spec 15 s1.7). */
  damage: number
  /** Radiation tokens (flipped or added, spec 15 s3); they count toward Health too. */
  rad: number
  /** Luck tokens left (LUCK-001: Luc at set-up for Luck units). */
  luck: number
  /** Holds a Reaction marker, i.e. Prepared (PREP-001; max one). */
  reaction: boolean
  /** Charge bonus markers waiting for the next Close Combat attack (CHG-001..006). */
  chargeBonus: ChargeMarker[]
  /** Armor boost icons held (max rules.armorBoostMax); one Strong bonus at most applies (spec 15 s1). */
  armorBoost: number
  /** Bonus-die tokens to add to the next test (max one per colour per test, DICE-009). */
  bonusDice: EffectDieColour[]
  /** Weapons, armor, consumables and mods this model carries (instances of data records). */
  carried: CarriedItem[]
  /** Running item effects with a duration (ITEM-005..009). */
  effects: ActiveEffect[]
  /** Item ids this model is addicted to (spec 11 s9). */
  addictions: Id[]
  /** Carries a Heroic card (V.A.T.S., +1 Health, Criticals, Luck). */
  heroic: boolean
  /** Leader card id when this model is the force leader. */
  leaderId?: Id
  /** Misc named counters (e.g. 'penaltyToken'); modules document the keys they use. */
  tokens: Record<string, number>
}

// ---------- M2 rules state ----------
export type Readiness = 'unready' | 'ready' | 'used'
export type ChargeMarker = 'black' | 'green'
export type CarriedKind = 'weapon' | 'armor' | 'item' | 'mod'

/** One carried card instance. `defId` points at the data record of `kind` in the EditionBundle. */
export interface CarriedItem {
  /** Instance id, unique in the game (e.g. 'a-settler-1/laser-rifle'). */
  uid: Id
  defId: Id
  kind: CarriedKind
  /** Starting items cannot be dropped or passed (ITEM-010). */
  starting: boolean
  /** Limited-use item already used up. */
  spent?: boolean
  /** Critical meter points on this weapon (CRIT-002..006). */
  cp?: number
  /** Slow-firing state: true = Loaded (SHOT-005). */
  loaded?: boolean
  /** Primed tokens on this weapon. */
  primed?: number
  /** Power Armor: damage tokens on the card, and whether it has flipped to its degraded side (PA-*). */
  paDamage?: number
  degraded?: boolean
  /** Mod record ids fitted to this weapon/armor. */
  mods?: Id[]
}

/** A running item effect. Fixed: `counters` counting tokens left (0 = until next activation). Diminishing: `step` columns hidden. */
export interface ActiveEffect {
  id: Id
  /** Item record id that created it. */
  defId: Id
  duration: 'fixed' | 'diminishing'
  counters: number
  step: number
}

export type GamePhase = 'setup' | 'play' | 'over'

export interface SeatState {
  id: SeatId
  /** Scenario side id this seat plays. */
  side: string
  faction: string | null
  /** True once every model of this seat is Used this round (TURN-008). */
  done: boolean
  /** Victory points / scenario score. */
  score: number
}

export interface TurnState {
  /** Seat taking the current turn. */
  seat: SeatId
  /** Free-form step name owned by turnflow (e.g. 'ready', 'choose', 'use'). */
  step: string
  /** Model readied at the start of this turn (TURN-002). */
  readied: ModelId | null
  /** Seat that took the first turn of this round (TURN-012). */
  firstSeat: SeatId
}

/** The model being Used right now (one at a time, TURN-006). */
export interface ActivationState {
  modelId: ModelId
  /** Full Actions taken (max rules.actionsPerActivation, ACT-001). */
  actionsTaken: number
  /** Action Points held; lost at activation end (AP-006). */
  ap: number
  /** AP-use icons already bought this activation (AP-007: each icon once). */
  apIconsUsed: string[]
  /** A heavy weapon was fired this activation (max one). */
  heavyFired: boolean
  /** Once-per-activation "Test" cards already used (ACT-006). */
  testsUsed: string[]
}

/** The Action or Quick Action being resolved now; may belong to a reacting model outside the activation. */
export interface ActionContext {
  modelId: ModelId
  /** Action type, e.g. 'shoot.fire' (namespace = owning module). */
  type: string
  /** Quick Action: -2 SV or one colour shorter (AP-001/002); AP from the skill die ignored (AP-005). */
  quick: boolean
  /** A Reaction (PREP-010); also ignores skill-die AP. */
  reaction: boolean
  /** A free attack from withdrawal (CC-009); not a trigger. */
  free: boolean
  /** A limited-use item was already used during this Action (ITEM-001). */
  itemUsed: boolean
}

/** A scenario marker on the table (spec 17). `face` stays hidden from views once VIEW redaction lands. */
export interface MarkerState {
  id: Id
  kind: 'investigation' | 'searchable' | 'object'
  face?: string
  pos: Vec2
  revealed: boolean
  /** Seats that have peeked at it (SRCH-001..003). */
  seenBy: SeatId[]
  /** Carried by a model (scenario objects), else on the table. */
  carriedBy?: ModelId
  props: Record<string, unknown>
}

export interface GameResult {
  /** Winning seat, or null for a draw / nobody. */
  winner: SeatId | null
  level?: 'major' | 'minor'
  reason: string
  caps?: number
}

/** A logged engine event for the client (dice rolled, damage dealt, model removed, ...). Append-only. */
export interface EngineEvent { type: string; [k: string]: unknown }
export type GameEvent = DiceRolled | EngineEvent

export interface TerrainInstance {
  id: Id
  pieceId: Id
  rulesType: TerrainRulesType
  pos: Vec2
  rot: number // radians about +y
  footprint: Shape
  height: number
  props: Record<string, unknown>
}

/** A drifting cloud or gas template. Kept for radiation clouds and smoke (TODO(M2): confirm against the rules). */
export interface Cloud { id: Id; pos: Vec2; diameter: number; owner: SeatId; kind?: 'cloud' | 'hazard' | 'flare'; blocksLos?: boolean; concealment?: boolean }

export type RngState = [number, number, number, number]
export type RollPurpose = string

export interface ScenarioState { table: { w: number; d: number } }

export interface GameState {
  seed: string
  rng: RngState
  rollSeq: number
  decisionSeq: number
  models: Record<ModelId, ModelState>
  terrain: TerrainInstance[]
  clouds: Cloud[]
  scenario: ScenarioState
  pending: PendingDecision
  log: Action[]
  // ---- M2 rules state (additive) ----
  /** Data edition the game was built from (EditionBundle.edition). */
  edition: string
  scenarioId: string | null
  phase: GamePhase
  /** Current round, 0 before the first round starts. */
  round: number
  /** Scenario round limit (null = until a side wins). */
  maxRounds: number | null
  seats: Record<SeatId, SeatState>
  /** Seat order as created (index 0 = the near edge, +z). */
  seatOrder: SeatId[]
  /** Advantage holder (TURN-010..012). */
  advantage: SeatId | null
  turn: TurnState | null
  activation: ActivationState | null
  /** The Action being resolved now (activation model or a reacting model). */
  action: ActionContext | null
  markers: MarkerState[]
  events: GameEvent[]
  result: GameResult | null
}

// ---------- decisions and actions (decider plumbing) ----------
export type RejectionCode = 'E_PLACEMENT' | 'E_BASE_OVERLAP' | 'E_TOO_FAR' | 'E_PATH_BLOCKED' | 'E_NOT_LEGAL' | 'E_STALE_DECISION'
  // M2 additions
  | 'E_WRONG_SEAT' | 'E_GAME_OVER' | 'E_UNKNOWN_KIND' | 'E_BAD_PARAM' | 'E_NO_ACTIONS_LEFT' | 'E_NO_AP'
  | 'E_NO_SKILL' | 'E_OUT_OF_RANGE' | 'E_NO_LOS' | 'E_ENGAGED' | 'E_NOT_ENGAGED' | 'E_CONDITION' | 'E_NO_ITEM'
  | 'E_ITEM_USED' | 'E_BAD_TARGET' | 'E_TODO'
export interface Rejection { code: RejectionCode; message: string; detail?: Record<string, unknown> }

export interface Action { type: string; decisionId: Id; seat: SeatId; [k: string]: unknown }
export interface DecisionOption { id: string; label: string; action: Action }

/** Exactly one open decision at a time. `seat` may be 'all' for simultaneous choices. */
export interface PendingDecision {
  id: Id
  seat: SeatId | 'all'
  kind: string
  context: Record<string, unknown>
  options: DecisionOption[]
  canPass: boolean
}

/** What a decider (human or bot) is allowed to see: never the raw state. */
export interface PlayerView {
  seat: SeatId
  models: Record<ModelId, ModelState>
  terrain: TerrainInstance[]
  clouds: Cloud[]
  scenario: ScenarioState
  pending: PendingDecision
}

export type LosReason = 'clear' | 'terrain' | 'model' | 'cloud' | 'forestDepth' | 'outOfTable' | 'self'
export interface LosVerdict { visible: boolean; reasons: LosReason[]; blockers: Id[]; inRange: boolean; distance: number }
export interface Mod { source: string; label: string; value: number; mode: 'add' | 'set' }
