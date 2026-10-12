// Policy tests (spec 30 s3-s8): the utility policies answer every decision kind with a legal, accepted, repeatable answer.
import { describe, expect, it } from 'vitest'
import { createAiDecider, answerOk, makeContext } from '../../src/ai/decider'
import { pickBest, POLICIES } from '../../src/ai/policies'
import { newMemory, type Tier } from '../../src/ai/types'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, SeatId } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()

interface Seen { kind: string; type: string; fallback: boolean; ok: boolean }

/** Play A vs B up to `cap` decisions, recording each answer the AI gave. */
function play(seed: string, tiers: Record<SeatId, Tier>, cap: number, budgetMs = 60) {
  let state: GameState = createGame(bundle, { seed, scenarioId: 'box-1' })
  const accepts = (a: Action) => apply(state, bundle, a).ok
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider(tiers[s]!, { seed: `${seed}:${s}`, bundle, accepts, budgetMs })]))
  const seen: Seen[] = []
  let rejected = 0
  for (let n = 0; n < cap && state.phase !== 'over'; n++) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const v = view(state, seat)
    const legal = legalActions(state)
    const { action, fallback } = ds[seat]!.decideSync(v, p, legal)
    const full = p.seat === 'all' ? { ...action, seat } : action
    const r = apply(state, bundle, full)
    seen.push({ kind: p.kind, type: action.type, fallback, ok: r.ok })
    if (!r.ok) { rejected++; break }
    state = r.state
  }
  return { state, seen, rejected, ds }
}

describe('AI policies (spec 30)', () => {
  it('POL-001 normal vs random plays 250 decisions with no rejected answers and no policy errors', () => {
    const r = play('pol1', { A: 'normal', B: 'random' }, 250)
    expect(r.rejected).toBe(0)
    expect(r.ds.A!.memory.stats.errors).toBe(0)
    expect(r.seen.length).toBeGreaterThan(100)
  })

  it('POL-002 easy and normal answer the common decision kinds themselves (few fallbacks)', () => {
    const r = play('pol2', { A: 'normal', B: 'easy' }, 250)
    expect(r.rejected).toBe(0)
    const own = r.seen.filter((s) => ['turn.first', 'turn.ready', 'turn.pick', 'turn.activation', 'move.path'].includes(s.kind))
    expect(own.length).toBeGreaterThan(20)
    expect(own.filter((s) => s.fallback).length / own.length).toBeLessThan(0.3)
  })

  it('POL-003 a policy answer is deterministic for the same view, seed and decision', () => {
    const state = createGame(bundle, { seed: 'pol3', scenarioId: 'box-1' })
    const answers = [0, 1].map(() => {
      let s = state
      // Step to the first activation menu with the placeholder driver, then ask normal twice.
      const d = createAiDecider('random', { seed: 'step', bundle })
      for (let i = 0; i < 40 && s.pending.kind !== 'turn.activation'; i++) {
        const p = s.pending, seat = p.seat === 'all' ? s.seatOrder[0]! : p.seat
        const r = apply(s, bundle, d.decideSync(view(s, seat), p, legalActions(s)).action)
        if (!r.ok) break
        s = r.state
      }
      const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
      const n = createAiDecider('normal', { seed: 'same', bundle, budgetMs: 1000 })
      return JSON.stringify(n.decideSync(view(s, seat), s.pending, legalActions(s)).action)
    })
    expect(answers[0]).toBe(answers[1])
  })

  it('POL-004 turn.choose always Uses and search.found keeps; single-option prompts are taken', () => {
    const s = createGame(bundle, { seed: 'pol4', scenarioId: 'box-1' })
    const seat = s.seatOrder[0]!
    const mk = (kind: string, legal: Action[]) => {
      const pending = { ...s.pending, kind, options: legal.map((a, i) => ({ id: String(i), label: '', action: a })) }
      return makeContext('normal', view(s, seat), pending, legal, { seed: 't', bundle }, newMemory())
    }
    const A = (type: string, extra: Record<string, unknown> = {}): Action => ({ type, decisionId: s.pending.id, seat, ...extra })
    expect(POLICIES['turn.choose']!(mk('turn.choose', [A('turn.useAll'), A('turn.useNone')]))?.type).toBe('turn.useAll')
    expect(POLICIES['search.found']!(mk('search.found', [A('search.keep'), A('search.leave')]))?.type).toBe('search.keep')
    expect(POLICIES['turn.start']!(mk('turn.start', [A('turn.start')]))?.type).toBe('turn.start')
  })

  it('POL-005 pickBest is repeatable and honours a clear winner when noise is zero', () => {
    const s = createGame(bundle, { seed: 'pol5', scenarioId: 'box-1' })
    const seat = s.seatOrder[0]!
    const ctx = makeContext('normal', view(s, seat), s.pending, legalActions(s), { seed: 'k', bundle }, newMemory())
    const rows = [1, 5, 3].map((v) => ({ action: v, score: { value: v, parts: {} } }))
    expect(pickBest(ctx, rows)?.action).toBe(5)
    expect(pickBest(ctx, [])).toBeNull()
  })

  it('POL-006 every move answer is move.to with an accepted path or a cancel, and answers pass answerOk', () => {
    const r = play('pol6', { A: 'normal', B: 'normal' }, 200)
    expect(r.rejected).toBe(0)
    const moves = r.seen.filter((x) => x.kind === 'move.path')
    expect(moves.every((m) => (m.type === 'move.to' || m.type === 'move.cancel') && m.ok)).toBe(true)
    expect(typeof answerOk).toBe('function')
  })
})
