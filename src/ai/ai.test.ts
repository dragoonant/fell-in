// AI scaffold tests (spec 30). The policies are stubs at M4a, so non-random tiers fall back to the random policy.
import { afterEach, describe, expect, it } from 'vitest'
import { loadBundle } from '../../tests/engine/helpers'
import { apply } from '../engine/apply'
import { legalActions } from '../engine/pending'
import * as query from '../engine/query'
import { createGame } from '../engine/setup'
import type { Action, GameState, SeatId } from '../engine/types'
import { view } from '../engine/view'
import { createAiDecider, makeContext } from './decider'
import { pickBest, POLICIES } from './policies'
import { aiBudgetMs, newMemory, type DecisionKind, type Tier } from './types'
import { handleRequest } from './worker'
import { queryState, shimAccepts } from './world'

const bundle = loadBundle()

function play(seed: string, tiers: Record<SeatId, Tier>, cap = 3000, stopAt?: (s: GameState) => boolean) {
  let state = createGame(bundle, { seed, scenarioId: 'box-1' })
  const accepts = (a: Action) => apply(state, bundle, a).ok
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider(tiers[s]!, { seed: `${seed}:${s}`, bundle, accepts, budgetMs: 1000 })]))
  let rejected = 0, n = 0
  while (state.phase !== 'over' && n < cap) {
    if (stopAt?.(state)) break
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const { action } = ds[seat]!.decideSync(view(state, seat), p, legalActions(state))
    const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
    if (!r.ok) { rejected++; break }
    state = r.state; n++
  }
  return { state, rejected, n, ds }
}

describe('AI scaffold (spec 30)', () => {
  const saved = process.env.AI_MS
  afterEach(() => { if (saved === undefined) delete process.env.AI_MS; else process.env.AI_MS = saved })

  it('AI-001 time budget comes from AI_MS, default 150 ms', () => {
    delete process.env.AI_MS
    expect(aiBudgetMs()).toBe(150)
    process.env.AI_MS = '40'
    expect(aiBudgetMs()).toBe(40)
  })

  it('AI-002 the query shim built from the view gives the same hit odds as the real state', () => {
    const s = createGame(bundle, { seed: 'shim', scenarioId: 'box-1' })
    const [a, b] = s.seatOrder
    const me = Object.values(s.models).find((m) => m.owner === a)!
    const foe = Object.values(s.models).find((m) => m.owner === b)!
    const q = queryState(view(s, a!), bundle)
    expect(query.hitOdds(q, bundle, me.id, foe.id).pHit).toBeCloseTo(query.hitOdds(s, bundle, me.id, foe.id).pHit, 10)
    expect(query.killOdds(q, bundle, me.id, foe.id)).toBeCloseTo(query.killOdds(s, bundle, me.id, foe.id), 10)
  })

  it('AI-003 random vs random makes no rejected answers and replays identically from the seed', () => {
    const r1 = play('det', { A: 'random', B: 'random' }, 150)
    const r2 = play('det', { A: 'random', B: 'random' }, 150)
    expect(r1.rejected).toBe(0)
    expect(r1.n).toBeGreaterThan(50)
    expect(r2.state.log).toEqual(r1.state.log)
  }, 120000)

  it('AI-004 normal vs easy makes no rejected answers (stub policies fall back and are counted)', () => {
    const r = play('tiers', { A: 'normal', B: 'easy' }, 200)
    expect(r.rejected).toBe(0)
    expect(r.ds.A!.memory.stats.decisions).toBeGreaterThan(0)
    expect(r.ds.A!.memory.stats.errors).toBe(0)
  }, 120000)

  it('AI-005 the policy table covers every decision kind the engine raises in a game', () => {
    const seen = new Set<string>()
    play('kinds', { A: 'random', B: 'random' }, 400, (s) => { seen.add(s.pending.kind); return false })
    expect(seen.has('turn.activation')).toBe(true)
    for (const k of seen) expect(POLICIES[k as DecisionKind], k).toBeTypeOf('function')
  }, 120000)

  it('AI-006 the worker dry run agrees with the engine on move destinations', () => {
    const { state } = play('move', { A: 'random', B: 'random' }, 3000, (s) => s.pending.kind === 'move.path')
    expect(state.pending.kind).toBe('move.path')
    const p = state.pending
    const seat = p.seat as SeatId
    const ok = shimAccepts(view(state, seat), bundle)
    const m = state.models[(p.context as { modelId: string }).modelId]!
    const tmpl = legalActions(state).find((a) => a.type === 'move.to')!
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [30, 0], [0, 30]] as const) {
      const a = { ...tmpl, path: [{ x: m.pos.x + dx, z: m.pos.z + dz }] }
      expect(ok(a), `${dx},${dz}`).toBe(apply(state, bundle, a).ok)
    }
  }, 120000)

  it('AI-007 the worker core answers init and decide requests', () => {
    expect(handleRequest({ type: 'init' }, bundle)).toEqual({ type: 'ready' })
    const s = createGame(bundle, { seed: 'w', scenarioId: 'box-1' })
    const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
    const res = handleRequest({ type: 'decide', id: 7, view: view(s, seat), pending: s.pending, legal: legalActions(s), tier: 'normal', seed: 'w', memoryKey: 'g1' }, bundle)
    expect(res?.type).toBe('action')
    if (res?.type === 'action') {
      expect(res.id).toBe(7)
      expect(apply(s, bundle, res.action).ok).toBe(true)
    }
  })

  it('AI-008 pickBest takes the top score with no noise and is deterministic per decision', () => {
    const s = createGame(bundle, { seed: 'pb', scenarioId: 'box-1' })
    const seat = s.pending.seat as SeatId
    const ctx = () => makeContext('normal', view(s, seat), s.pending, legalActions(s), { seed: 'x', bundle }, newMemory())
    const cands = [1, 5, 3].map((v) => ({ action: v, score: { value: v, parts: {} } }))
    expect(pickBest(ctx(), cands)?.action).toBe(5)
    const tied = [1, 2, 3].map((v) => ({ action: v, score: { value: 0, parts: {} } }))
    expect(pickBest(ctx(), tied)?.action).toBe(pickBest(ctx(), tied)?.action)
  })
})
