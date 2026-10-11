// Engine contract (FROZEN after M1; see docs/spec/00-architecture.md). Pure data, inches, y up, x/z ground plane.
// Origin = table centre. The table is 36 x 36 in (3 ft square).

export type Id = string
export type ModelId = Id
export type SeatId = string
export interface Vec2 { x: number; z: number }

/** Base diameter in mm. Wasteland sculpts ship on 25, 32 and 40 mm round bases; larger creatures use 50+ later. */
export type BaseMm = 25 | 32 | 40 | 50 | 80
export type LifeState = 'active' | 'down' | 'dead'
/** TODO(M2): the Wasteland condition list (poisoned, burning, irradiated, ...). Strings until the rules spec freezes. */
export type ConditionId = string
/** TODO(M2): the Wasteland damage types (ballistic, energy, radiation, ...). */
export type DamageType = string

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
}

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
}

// ---------- decisions and actions (decider plumbing) ----------
export type RejectionCode = 'E_PLACEMENT' | 'E_BASE_OVERLAP' | 'E_TOO_FAR' | 'E_PATH_BLOCKED' | 'E_NOT_LEGAL' | 'E_STALE_DECISION'
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
