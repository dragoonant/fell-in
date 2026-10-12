// Bench round 3 fixes (spec 30 s6): move cuts that survive difficult ground, and stuck spots retried each round.
import { describe, expect, it } from 'vitest'
import { createAiDecider, makeContext } from '../../src/ai/decider'
import { cutAccepted, navRoute } from '../../src/ai/moves'
import { pathLength } from '../../src/ai/nav'
import { newMemory, type AiView } from '../../src/ai/types'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()

function toMovePath(state: GameState): GameState {
  let s = state
  for (let i = 0; i < 40 && s.pending.kind !== 'move.path'; i++) {
    const legal = legalActions(s)
    const pick = legal.find((a) => a.type === 'move.go') ?? legal.find((a) => a.type !== 'turn.end') ?? legal[0]!
    const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
    const r = apply(s, bundle, s.pending.seat === 'all' ? { ...pick, seat } : pick)
    if (!r.ok) break
    s = r.state
  }
  return s
}

describe('AI bench round 3', () => {
  it('NAV-006 cutAccepted finds a shorter accepted cut when the long ones and a middle one are refused', () => {
    const s = toMovePath(createGame(bundle, { seed: 'cut1', scenarioId: 'box-1' }))
    expect(s.pending.kind).toBe('move.path')
    const seat = s.pending.seat as string
    const legal = legalActions(s)
    const id = (s.pending.context as { modelId: string }).modelId
    const from = s.models[id]!.pos
    const to = { x: from.x, z: from.z + 5 }
    // Refuse anything longer than 3 in and a band around 2.6 to 3 in (a cut ending inside an obstacle).
    const accepts = (a: Action) => {
      const p = a.path as { x: number; z: number }[]
      const l = pathLength(from, p)
      return l <= 3 && !(l > 2.5 && l < 3)
    }
    const ctx = makeContext('normal', view(s, seat), s.pending, legal, { seed: 'c', bundle, accepts, budgetMs: 10_000 }, newMemory())
    const tpl = legal.find((a) => a.type === 'move.to')!
    const cut = cutAccepted(ctx, tpl, from, [to])
    expect(cut).not.toBeNull()
    const l = pathLength(from, cut!)
    expect(l).toBeLessThanOrEqual(2.5 + 1e-9)
    expect(l).toBeGreaterThan(1.5)
    expect(cutAccepted({ ...ctx, accepts: () => false }, tpl, from, [to])).toBeNull()
  })

  it('NAV-007 navRoute paths are accepted by the engine and a stuck spot is retried in a later round', () => {
    const s = toMovePath(createGame(bundle, { seed: 'cut2', scenarioId: 'box-1' }))
    const seat = s.pending.seat as string
    const legal = legalActions(s)
    const ctx = makeContext('normal', view(s, seat), s.pending, legal, { seed: 'n', bundle, accepts: (a: Action) => apply(s, bundle, a).ok, budgetMs: 10_000 }, newMemory())
    const tpl = legal.find((a) => a.type === 'move.to')!
    const id = (s.pending.context as { modelId: string }).modelId
    const route = navRoute(ctx, tpl, id, 5.5)
    if (route) expect(apply(s, bundle, { ...tpl, path: route }).ok).toBe(true)
    // The decider forgets stuck spots when the round changes.
    const memory = newMemory()
    const d = createAiDecider('normal', { seed: 'st', bundle, memory, accepts: (a: Action) => apply(s, bundle, a).ok, budgetMs: 10_000 })
    memory.stuck.add('ghost:0.00,0.00')
    const v1: AiView = { ...view(s, seat), round: 1 }
    d.decideSync(v1, s.pending, legal)
    memory.stuck.add('ghost:0.00,0.00')
    d.decideSync(v1, s.pending, legal)
    expect(memory.stuck.has('ghost:0.00,0.00')).toBe(true)
    const v2: AiView = { ...v1, round: 2 }
    d.decideSync(v2, s.pending, legal)
    expect(memory.stuck.has('ghost:0.00,0.00')).toBe(false)
  })
})
