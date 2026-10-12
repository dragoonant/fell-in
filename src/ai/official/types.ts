// Official AI card system contracts (FROZEN at M4b; docs/spec/18-ai-system.md section 8).
// Solo / co-op play against an AI force driven by AI cards: settings Objective [Subject], a matrix cell picked by a
// situation column and a blue-die row, a response letter resolved into one concrete activity per Action.
// The decider sees only view(state, seat), the open PendingDecision and legalActions (spec 18 s8.1).
import type { AI_BLUE_ICONS, AI_RESPONSES, AiCardDef } from '../../data/types'
import type { Action, ModelId, SeatId, Vec2 } from '../../engine/types'
import type { AiContext, AiMemory, AiView } from '../types'

// ---------- card vocabulary ----------
/** A matrix response letter: Attack, Move, Objective, Fall Back, Defend, Strike. */
export type ResponseCode = typeof AI_RESPONSES[number]
/** A blue-die face key (spec 18 s8.3): BOT, STAR, BLAST, BOT+STAR, BOT2, STAR2. */
export type BlueFace = typeof AI_BLUE_ICONS[number]
export type CombatMethod = 'ranged' | 'close'
/** Shaded cell = reckless, plain = careful. */
export type Attitude = 'careful' | 'reckless'

// ---------- settings (spec 18 s1, s8.2) ----------
export type AiObjective = 'defeat' | 'goTo' | 'use' | 'protect'
export interface AiSetting {
  objective: AiObjective
  /** Subject string, resolved by procedure.resolveSubject (e.g. 'any-enemy', a unit id, a marker id). */
  subject: string
  /** Completion limit (e.g. after N removals); then R-3 applies. */
  limit?: number
}
/** A resolved Subject: model ids and/or marker ids plus their positions now. Empty = nothing to pursue. */
export interface SubjectSet {
  models: ModelId[]
  markers: string[]
  points: Vec2[]
  /** True when the string was unknown and fell back to any-enemy (R-2). */
  fallback?: boolean
}
/** Dynamic Subject resolver for a named Subject string. */
export type SubjectHook = (ctx: OfficialContext, modelId: ModelId) => SubjectSet
/** Scenario switch predicate: returns the setting to use for this model now, or null to keep the base setting. */
export type SwitchHook = (ctx: OfficialContext, modelId: ModelId, base: AiSetting) => AiSetting | null

// ---------- matrix pick (spec 18 s8.3) ----------
/** Column predicate parsed from AiCardDef.columns[].when. */
export type ColumnPredicate =
  | { kind: 'damageTaken'; lo: number; hi: number }
  | { kind: 'health'; lo: number; hi: number | null }
  | { kind: 'code'; hook: string }
  | { kind: 'always' }
export type ColumnHook = (ctx: OfficialContext, modelId: ModelId) => boolean

/** One blue-die roll: face index into dice.json effect.blue (0..11) and its key. */
export interface BlueRoll { faceIndex: number; face: BlueFace; icons: string[] }

/** The cell read at activation start; fixed for the whole activation (R-7). */
export interface MatrixPick {
  cardId: string
  modelId: ModelId
  column: number
  columnLabel: string
  /** null when a scenario override skipped the roll (forced). */
  roll: BlueRoll | null
  row: number
  response: ResponseCode
  attitude: Attitude
  stayEngaged: boolean
  method: CombatMethod[]
  forced?: ResponseCode
}

/** Per-activation state, keyed `${round}:${modelId}`. */
export interface ActivationPlan {
  key: string
  modelId: ModelId
  number: number
  setting: AiSetting
  pick: MatrixPick
  /** Full Actions the procedure has started for this activation. */
  actionsStarted: number
  /** Quick Action already taken (Heroic V.A.T.S., R-24). */
  quickTaken: boolean
  /** The activity chosen for the Action in progress (sub-decisions read it). */
  activity: Activity | null
  /** Enemies pushed back without a follow-up by a Careful model (no base-contact attack on them, ERR p.16). */
  noContact: ModelId[]
}

// ---------- activities (spec 18 s8.5) ----------
export type ActivityKind =
  | 'closeCombat' | 'charge' | 'shoot' | 'throw'
  | 'moveEngage' | 'moveToCharge' | 'moveToMove' | 'moveToward' | 'moveToRange' | 'moveSafer'
  | 'disengage' | 'interact' | 'useExpertise' | 'peek' | 'pickup' | 'moveContact'
  | 'fallBack' | 'holdCover' | 'useItem' | 'prepare' | 'end'
/** What one Action does. `as` is the letter actually performed (S -> A or M; O -> A, D, M or Use). */
export interface Activity {
  kind: ActivityKind
  as: ResponseCode
  targetId?: ModelId
  subjectId?: string
  weaponUid?: string
  critical?: boolean
  /** Movement goal for move.path. */
  goal?: Vec2
  /** Quick Action variant (Heroic V.A.T.S.). */
  quick?: boolean
  reason: string
}

// ---------- targeting (spec 18 s8.7) ----------
export const TARGET_FACTORS = [
  'nearest', 'vulnerable', 'leader', 'importance', 'prepared', 'wounded', 'weakest', 'healthiest', 'largest',
  'highest', 'capable', 'bestChance',
] as const
export type TargetFactor = typeof TARGET_FACTORS[number]
/** Printed names that map onto a factor (ERR p.18: Ready became Prepared). */
export const FACTOR_ALIASES: Readonly<Record<string, TargetFactor>> = {
  ready: 'prepared', 'best chance': 'bestChance', bestchance: 'bestChance', most_damaged: 'wounded',
}
export interface RankOpts {
  /** Rank as if the attacker stood here (Defend, s8.5). */
  from?: Vec2
  /** Subject for Importance; also excluded from Importance. */
  subjectId?: string
  /** Resolved Subject: Importance = distance to its nearest point; its models are excluded (ERR p.16). */
  subject?: SubjectSet
  weaponUid?: string
  /** Restrict to these ids first (preferFirst set), then the rest. */
  preferred?: ModelId[]
}
export interface TargetRanking {
  factors: TargetFactor[]
  ignored: string[]
  ranked: { id: ModelId; keys: number[]; preferred: boolean }[]
  /** Ids tied after every factor; broken by the seeded RNG. */
  tie: ModelId[] | null
}

// ---------- visibility (spec 18 s8.1) ----------
/** Field name stamped on every Action the official AI returns. */
export const AI_TRACE_FIELD = 'aiTrace'
export type AiTraceEntry =
  | { kind: 'token'; round: number; drawn: ModelId; number: number; pool: ModelId[] }
  | { kind: 'order'; picked: ModelId; number: number }
  | { kind: 'setting'; modelId: ModelId; setting: AiSetting; switched: boolean }
  | { kind: 'matrix'; pick: MatrixPick }
  | { kind: 'activity'; modelId: ModelId; action: number; activity: Activity }
  | { kind: 'ranking'; modelId: ModelId; ranking: TargetRanking }
  | { kind: 'coin'; purpose: string; heads: boolean }
  | { kind: 'tie'; purpose: string; among: string[]; picked: string }
  | { kind: 'fallback'; decisionKind: string; to: 'normal' | 'random'; why: string }
  | { kind: 'note'; text: string }
export interface AiTrace { decisionId: string; seat: SeatId; entries: AiTraceEntry[] }

// ---------- decider plumbing ----------
export interface OfficialStats { decisions: number; fallbacks: number; errors: number; byKind: Record<string, number> }
/** Per-seat memory across decisions (the instance holds it; resumable from the action log). */
export interface OfficialMemory {
  /** M4a memory reused by the nav/move helpers and the fallback policy. */
  base: AiMemory
  /** Plans by activation key. */
  plans: Record<string, ActivationPlan>
  /** Current setting per model after switches. */
  settings: Record<ModelId, AiSetting>
  /** First position seen per model: its deployment point (R-13). */
  deploy: Record<ModelId, Vec2>
  /** Enemies seen per round (for 'seen this or last round' Subjects). */
  seen: Record<number, ModelId[]>
  stats: OfficialStats
  /** Break-in style alert latch: true once the force is aware of a trigger or sees a player model (AIH s4). */
  aware: boolean
  /** Next route marker index per model (patrol loops advance on contact). */
  route: Record<ModelId, number>
}

export interface OfficialAiOpts {
  /** Seed for every AI roll: deriveSeed(seed, purpose, key). */
  seed: string
  /** Scenario whose `sides[].ai` gives the settings. */
  scenarioId?: string | null
  /** Scenario side this seat plays (default: the side whose `ai` is set). */
  side?: string
  /** Override settings: force-wide, or per model id. */
  settings?: AiSetting | Record<ModelId, AiSetting>
  /** Override card per unit id (AiCardDef id). */
  cards?: Record<string, string>
  /** Override AI marker numbers (R-4). */
  numbers?: Record<ModelId, number>
  /** Fallback for unanswered kinds (default 'normal'). */
  fallback?: 'normal' | 'random'
  /** Dry-run legality of parameterised answers (as M4a AiOpts.accepts). */
  accepts?: (action: Action, view: AiView) => boolean
  budgetMs?: number
  now?: () => number
  memory?: OfficialMemory
}

/** Everything the procedure may use for one decision: the M4a context plus the official AI state. */
export interface OfficialContext extends AiContext {
  opts: OfficialAiOpts
  official: OfficialMemory
  /** Seeded stream keyed by purpose and key: deriveSeed(opts.seed, purpose, key). */
  roll: (purpose: string, key: string) => () => number
  /** Trace for the answer being built. */
  trace: AiTrace
  /** Card for a model (opts.cards, then ai-<unitId>, then the generic card), or null. */
  cardOf: (modelId: ModelId) => AiCardDef | null
}
