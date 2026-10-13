// AI contracts (FROZEN at M4a; docs/spec/30-ai-bot.md). Pure types plus the tier table and the time budget.
// The AI only ever sees view(state, seat), the open PendingDecision and legalActions; numbers come from engine query.
import type { EditionBundle } from '../data/types'
import type { Action, GameState, MarkerState, ModelId, PendingDecision, PlayerView, SeatId, Vec2 } from '../engine/types'

export type Tier = 'random' | 'easy' | 'normal'
export const TIER_IDS: readonly Tier[] = ['random', 'easy', 'normal']

/** Decision kinds the engine raises today (spec 30 s3). Unknown kinds fall back to the random policy. */
export type DecisionKind =
  | 'turn.start' | 'turn.first' | 'turn.ready' | 'turn.choose' | 'turn.pick' | 'turn.activation'
  | 'move.path' | 'shoot.target' | 'throw.target' | 'shoot.luck' | 'throw.luck' | 'melee.luck'
  | 'charge.marker' | 'battleCry.push' | 'battleCry.follow' | 'melee.slide' | 'react.offer' | 'item.choose' | 'search.found'

export interface TierParams {
  id: Exclude<Tier, 'random'>
  /** Score noise: sigma as a fraction of the candidate score spread (0 = always the best). */
  noise: number
  /** Weight of enemy threat at a destination (0 = no lookahead). */
  wThreat: number
  /** Weight of cover against the nearest threats. */
  wCover: number
  /** Weight of kill odds over plain expected damage in attackValue. */
  wKill: number
  /** Weight of scenario objectives. */
  wObjective: number
  /** Weight of keeping damaged models alive. */
  wSurvival: number
  /** Value of Prepare per expected trigger. */
  wPrepare: number
  /** Move destination candidates per decision. */
  moveSamples: number
  /** Luck policy: 'smart' (spec 30 s7.4) or 'always' (any failed attack). */
  luck: 'smart' | 'always'
  /** Reactions: 'smart' (value vs holding) or 'attacks' (take any attack reaction). */
  reactions: 'smart' | 'attacks'
  /** Approach weights (model worth per full move of engagement gap closed): guns, melee-only, plain pull. */
  wApproach?: number
  wApproachMelee?: number
  wPull?: number
  /**
   * Late-game caution from the points race (0 = off): from LATE_ROUND on, threat weighs (1 + wLead) times as much
   * while this side has more surviving unit cost, and 1 / (1 + wLead) as much while behind.
   */
  wLead?: number
}

export const TIERS: Record<TierParams['id'], TierParams> = {
  easy: { id: 'easy', noise: 0.2, wThreat: 0, wCover: 0.3, wKill: 1, wObjective: 2, wSurvival: 0.2, wPrepare: 0.2, moveSamples: 16, luck: 'always', reactions: 'attacks' },
  normal: { id: 'normal', noise: 0, wThreat: 0.3, wCover: 0.3, wKill: 2, wObjective: 4, wSurvival: 0.6, wPrepare: 0.5, moveSamples: 40, luck: 'smart', reactions: 'smart' },
}

/** Bench tuning hook (node only): AI_TUNE="normal.wThreat=0.8,easy.noise=0.3". */
export function applyTuning(spec: string | undefined): void {
  if (!spec) return
  for (const part of spec.split(',')) {
    const m = /^(easy|normal)\.(\w+)=(.+)$/.exec(part.trim())
    if (!m) continue
    const t = TIERS[m[1] as TierParams['id']] as unknown as Record<string, unknown>
    const v = m[3]!
    t[m[2]!] = v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v
  }
}

/**
 * Additive view fields the AI reads when the engine provides them (spec 30 s1). PlayerView does not carry these yet;
 * until it does, objective scoring returns 0. Marker faces the seat may not see must be redacted by view().
 */
export interface ViewExtras {
  round?: number
  maxRounds?: number | null
  scenarioId?: string | null
  markers?: MarkerState[]
  scores?: Record<SeatId, number>
}
export type AiView = PlayerView & ViewExtras

/** One scored candidate. `parts` (damage, kill, threat, cover, objective, survival, tempo) is for debugging only. */
export interface Score {
  value: number
  parts: Partial<Record<ScorePart, number>>
}
export type ScorePart = 'damage' | 'kill' | 'threat' | 'cover' | 'objective' | 'survival' | 'tempo'
export interface Scored<T = Action> { action: T; score: Score }

/** Per-seat memory across decisions (lives in the decider instance; the worker keys it by memoryKey). */
export interface AiMemory {
  /** The activation plan: the model and the intended remaining menu picks (action types), re-planned when stale. */
  plan: { modelId: ModelId; decisionSeq: number; steps: string[] } | null
  /** Models whose move found no accepted path, keyed `${modelId}:${x},${z}`. */
  stuck: Set<string>
  stats: AiStats
}
export interface AiStats {
  decisions: number
  ms: number
  maxMs: number
  fallbacks: number
  errors: number
  byKind: Record<string, { n: number; ms: number; max: number; fallbacks: number }>
}

/** Host options for createAiDecider. */
export interface AiOpts {
  /** Seed for the AI's own stream: deriveSeed(seed, pending.id, tier). */
  seed: string
  bundle: EditionBundle
  /** Per-decision budget in ms (default aiBudgetMs()). */
  budgetMs?: number
  /**
   * Dry-run legality of an answer (parameterised ones included). Main thread: gameStore.preview; bench: apply(...).ok;
   * worker: shimAccepts. Default: shimAccepts over the view.
   */
  accepts?: (action: Action, view: AiView) => boolean
  /** Clock (tests). */
  now?: () => number
  memory?: AiMemory
}

/** Everything a policy may use for one decision. */
export interface AiContext {
  tier: TierParams
  seat: SeatId
  bundle: EditionBundle
  view: AiView
  pending: PendingDecision
  legal: Action[]
  /** Query shim built from the view (world.ts queryState); read-only, never applied. */
  q: GameState
  /** Seeded stream for tie breaks and noise. */
  rng: () => number
  accepts: (action: Action) => boolean
  now: () => number
  deadline: number
  /**
   * Deterministic anytime cutoff (spec 30 s10): timeUp counts calls against `cap` (derived once from the budget), so
   * answers do not depend on machine speed. The wall clock is only a hard safety stop at `hardDeadline` (4x budget).
   */
  work?: { n: number; cap: number; hardDeadline: number; hard: boolean }
  memory: AiMemory
}

/** A policy answers one decision kind; null = no opinion (the decider uses the random policy). */
export type Policy = (ctx: AiContext) => Action | null
export type PolicyTable = Partial<Record<DecisionKind, Policy>>

/** A threat entry: what the enemy could do to `targetId` standing at `at` during its next turn. */
export interface ThreatReport { exp: number; pKill: number; attackers: ModelId[] }
export interface Reach { move: number; charge: number; range: number; melee: boolean }
export interface ThreatMap {
  seat: SeatId
  /** Per enemy model: inches it can cover next turn and its longest ranged reach. */
  reach: Record<ModelId, Reach>
  /** Memo of threatAt results keyed `${targetId}@${x},${z}`. */
  memo: Map<string, ThreatReport>
}

export interface MoveCandidate { to: Vec2; path: Vec2[]; score: Score }

const DEFAULT_AI_MS = 150
/** Per-decision AI budget: AI_MS (node) or VITE_AI_MS (browser), default 150 ms (spec 30 s10). */
export function aiBudgetMs(): number {
  const fromNode = typeof process !== 'undefined' ? Number(process.env?.AI_MS) : NaN
  if (Number.isFinite(fromNode) && fromNode > 0) return fromNode
  const env = (import.meta as { env?: Record<string, unknown> }).env
  const fromVite = Number(env?.VITE_AI_MS)
  return Number.isFinite(fromVite) && fromVite > 0 ? fromVite : DEFAULT_AI_MS
}

export const newMemory = (): AiMemory => ({
  plan: null, stuck: new Set(),
  stats: { decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, errors: 0, byKind: {} },
})

/** Work units (timeUp calls) allowed per millisecond of budget: the search cap is a pure function of the budget. */
export const WORK_PER_MS = 2
/** True once the decision's work cap is spent (or, as a safety stop only, the hard wall-clock limit); searches return their best so far. */
export const timeUp = (ctx: Pick<AiContext, 'now' | 'deadline'> & { work?: AiContext['work'] }): boolean => {
  const w = ctx.work
  if (!w) return ctx.now() >= ctx.deadline
  if (++w.n > w.cap) return true
  if (ctx.now() >= w.hardDeadline) { w.hard = true; return true }
  return false
}
