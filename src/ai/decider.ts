// The AI decider (spec 30 s3, s8; FROZEN at M4a). createAiDecider(tier, opts) implements the engine Decider: it builds
// an AiContext from the view, dispatches on pending.kind to POLICIES, checks the answer (legal template + ctx.accepts
// for parameterised answers) and falls back to the random policy on null, a bad answer or a throw.
import type { Decider } from '../engine/decider'
import { deriveSeed, nextFloat } from '../engine/rng'
import type { Action, PendingDecision, PlayerView } from '../engine/types'
import { ACCEPT_COST, oddsStats } from './budget'
import { POLICIES } from './policies'
import { PARAMETERISED, randomPolicy } from './random'
import { aiBudgetMs, newMemory, TIERS, MISS_PER_MS, WORK_PER_MS, type AiContext, type AiMemory, type AiOpts, type AiView, type DecisionKind, type Tier, type TierParams } from './types'
import { isLegalShape, observeRound, queryState, roundOf, shimAccepts } from './world'

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Seeded stream for one decision: deriveSeed(seed, decisionId, tier); never state.rng. */
export function rngFor(seed: string, decisionId: string, tier: Tier): () => number {
  let st = deriveSeed(seed, decisionId, tier)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

/** Build the context a policy sees. The random tier runs with normal's parameters (it reads none of them). */
export function makeContext(tier: Tier, view: PlayerView, pending: PendingDecision, legal: Action[], opts: AiOpts, memory: AiMemory): AiContext {
  const now = opts.now ?? clock
  const v = view as AiView
  const hostAccepts = opts.accepts
  // Every dry run is a whole engine step: it counts against the decision's cost budget (budget.ts) like a query miss does.
  const dry = hostAccepts ? (a: Action) => hostAccepts(a, v) : shimAccepts(v, opts.bundle)
  const accepts = (a: Action): boolean => { oddsStats.misses += ACCEPT_COST; return dry(a) }
  const params: TierParams = tier === 'random' ? TIERS.normal : TIERS[tier]
  let q: AiContext['q'] | null = null
  const budget = opts.budgetMs ?? aiBudgetMs()
  const t0 = now()
  return {
    tier: params, seat: view.seat, bundle: opts.bundle, view: v, pending, legal,
    get q() { return (q ??= queryState(v, opts.bundle)) },
    rng: rngFor(opts.seed, pending.id, tier),
    accepts,
    now, deadline: t0 + budget, memory,
    work: { n: 0, cap: Math.max(8, Math.ceil(budget * WORK_PER_MS)), hardDeadline: t0 + budget * 4, hard: false, miss0: oddsStats.misses, missCap: Math.max(40, Math.ceil(budget * MISS_PER_MS)) },
  }
}

/** A usable answer: matches a legal template and, when parameterised, is accepted by the dry run. */
export function answerOk(ctx: AiContext, a: Action | null): a is Action {
  if (!a || !isLegalShape(a, ctx.legal)) return false
  return !PARAMETERISED.has(a.type) || ctx.accepts(a)
}

const stuckRound = new WeakMap<AiMemory, number>()

export interface AiDecider extends Decider {
  readonly tier: Tier
  readonly memory: AiMemory
  /** Synchronous core (bench, worker, tests). */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): { action: Action; fallback: boolean }
}

/** The AI decider for a tier ('random' = the random policy only). Same inputs and seed -> same answer. */
export function createAiDecider(tier: Tier, opts: AiOpts): AiDecider {
  const memory = opts.memory ?? newMemory()
  function decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): { action: Action; fallback: boolean } {
    if (legal.length === 0) throw new Error(`ai decider: no legal actions for ${pending.id}`)
    observeRound(memory, view as AiView)
    // A spot that had no accepted move last round may have one now (enemies and friends moved): retry each round.
    const round = roundOf(memory, view as AiView)
    if (tier !== 'random' && stuckRound.get(memory) !== round) { stuckRound.set(memory, round); memory.stuck.clear() }
    const ctx = makeContext(tier, view, pending, legal, opts, memory)
    const t0 = ctx.now()
    let action: Action | null = null
    let fallback = false
    if (tier !== 'random') {
      try {
        const policy = POLICIES[pending.kind as DecisionKind]
        const a = policy ? policy(ctx) : null
        if (answerOk(ctx, a)) action = a
      } catch {
        memory.stats.errors++
      }
    }
    if (!action) {
      fallback = tier !== 'random'
      action = randomPolicy(ctx)
    }
    const ms = ctx.now() - t0
    const st = memory.stats
    st.decisions++; st.ms += ms; st.maxMs = Math.max(st.maxMs, ms)
    const hard = ctx.work?.hard === true
    if (fallback) st.fallbacks++
    if (hard) st.hardStops++
    const k = (st.byKind[pending.kind] ??= { n: 0, ms: 0, max: 0, fallbacks: 0, hard: 0 })
    k.n++; k.ms += ms; k.max = Math.max(k.max, ms); if (fallback) k.fallbacks++; if (hard) k.hard++
    return { action, fallback }
  }
  return {
    tier, memory, decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
