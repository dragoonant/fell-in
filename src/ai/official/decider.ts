// Official AI decider (spec 18 s8.1; FROZEN at M4b). createOfficialAiDecider(bundle, opts) implements the engine
// Decider for an AI-card-driven seat. It sees only the view, the open decision and the legal actions; all rolls come
// from deriveSeed(opts.seed, purpose, key); every answer carries an `aiTrace` so the client can show each AI roll.
// Kinds the procedure leaves open fall back to the M4a normal policy, then to random.
import type { AiCardDef, EditionBundle } from '../../data/types'
import { recordOf } from '../../engine/edition'
import type { Decider } from '../../engine/decider'
import { deriveSeed, nextFloat } from '../../engine/rng'
import type { Action, ModelId, PendingDecision, PlayerView } from '../../engine/types'
import { answerOk, createAiDecider, makeContext } from '../decider'
import { newMemory, type AiView } from '../types'
import { observeRound } from '../world'
import { step } from './procedure'
import { AI_TRACE_FIELD, type AiTrace, type OfficialAiOpts, type OfficialContext, type OfficialMemory } from './types'

/** Id of the generic fallback card in data/1e/ai/reference.json (spec 18 s8.9). */
export const GENERIC_CARD_ID = 'ai-generic'

export const newOfficialMemory = (): OfficialMemory => ({
  base: newMemory(), plans: {}, settings: {}, deploy: {}, seen: {},
  stats: { decisions: 0, fallbacks: 0, errors: 0, byKind: {} }, aware: false, route: {},
})

/** Seeded stream for one purpose and key: deriveSeed(seed, 'official', purpose, key); never state.rng. */
export function officialRng(seed: string, purpose: string, key: string): () => number {
  let st = deriveSeed(seed, 'official', purpose, key)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

/** Card for a unit PROFILE id: opts.cards, then `ai-<id>`, then a card naming the unit (never the generic one), then the generic card. */
export function cardFor(bundle: EditionBundle, unitId: string | undefined, override?: Record<string, string>): AiCardDef | null {
  if (!unitId) return recordOf(bundle, 'ai', GENERIC_CARD_ID) ?? null
  const id = override?.[unitId]
  return (id ? recordOf(bundle, 'ai', id) : undefined)
    ?? recordOf(bundle, 'ai', `ai-${unitId}`)
    ?? bundle.records.ai.find((c) => c.unitId === unitId && c.id !== GENERIC_CARD_ID)
    ?? recordOf(bundle, 'ai', GENERIC_CARD_ID) ?? null
}

/** Build the official context for one decision on top of the M4a context. */
export function makeOfficialContext(bundle: EditionBundle, opts: OfficialAiOpts, memory: OfficialMemory, view: PlayerView, pending: PendingDecision, legal: Action[]): OfficialContext {
  const base = makeContext('normal', view, pending, legal, { seed: opts.seed, bundle, accepts: opts.accepts, budgetMs: opts.budgetMs, now: opts.now }, memory.base)
  const trace: AiTrace = { decisionId: pending.id, seat: view.seat, entries: [] }
  const v = view as AiView
  return Object.assign(base, {
    opts, official: memory, trace,
    roll: (purpose: string, key: string) => officialRng(opts.seed, purpose, key),
    cardOf: (modelId: ModelId) => {
      const m = v.models[modelId]
      return cardFor(bundle, m?.profileId ?? m?.unitId, opts.cards)
    },
  })
}

export interface OfficialAiDecider extends Decider {
  readonly memory: OfficialMemory
  /** Synchronous core (bench, worker, tests). `action` carries `aiTrace`. */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): { action: Action; fallback: boolean; trace: AiTrace }
}

/** The official AI-card decider for one seat. Same inputs and seed -> same answers and rolls. */
export function createOfficialAiDecider(bundle: EditionBundle, opts: OfficialAiOpts): OfficialAiDecider {
  const memory = opts.memory ?? newOfficialMemory()
  const fallbackTier = opts.fallback ?? 'normal'
  const fallback = createAiDecider(fallbackTier, { seed: `${opts.seed}:fallback`, bundle, accepts: opts.accepts, budgetMs: opts.budgetMs, now: opts.now, memory: memory.base })
  function decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]) {
    if (legal.length === 0) throw new Error(`official ai: no legal actions for ${pending.id}`)
    observeRound(memory.base, view as AiView)
    for (const m of Object.values(view.models)) if (m.owner === view.seat && !memory.deploy[m.id]) memory.deploy[m.id] = { ...m.pos } // R-13
    const ctx = makeOfficialContext(bundle, opts, memory, view, pending, legal)
    let action: Action | null = null
    try {
      const a = step(ctx)
      if (answerOk(ctx, a)) action = a
    } catch (e) {
      memory.stats.errors++
      ctx.trace.entries.push({ kind: 'note', text: `procedure error: ${e instanceof Error ? e.message : String(e)}` })
    }
    const fell = !action
    if (!action) {
      const r = fallback.decideSync(view, pending, legal)
      action = r.action
      ctx.trace.entries.push({ kind: 'fallback', decisionKind: pending.kind, to: r.fallback || fallbackTier === 'random' ? 'random' : 'normal', why: 'procedure had no answer' })
    }
    const st = memory.stats
    st.decisions++
    if (fell) st.fallbacks++
    st.byKind[pending.kind] = (st.byKind[pending.kind] ?? 0) + 1
    return { action: { ...action, [AI_TRACE_FIELD]: ctx.trace }, fallback: fell, trace: ctx.trace }
  }
  return {
    memory, decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
