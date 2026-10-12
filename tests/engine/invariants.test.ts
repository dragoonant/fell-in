// Engine invariants (spec 60 s2) on whole random games, no mocks: the same checks tools/sim.ts runs at scale.
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { createRandomDecider } from '../../src/engine/decider'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from './helpers'

const bundle = loadBundle()

/** Random play to the end. move.to needs a path: the bot heads for the table centre, or cancels when that is blocked. */
async function play(seed: string, scenarioId?: string): Promise<{ state: GameState; probes: number }> {
  let s = createGame(bundle, { seed, ...(scenarioId ? { scenarioId } : {}) })
  const bot = createRandomDecider(seed)
  let probes = 0
  for (let n = 0; s.phase !== 'over' && n < 6000; n++) {
    const legal = legalActions(s)
    expect(legal.length).toBeGreaterThan(0)
    // every legal option (but the parameterised move.to) is accepted
    if (n % 3 === 0) for (const o of legal) if (o.type !== 'move.to') { probes++; expect(apply(s, bundle, o).ok, `${o.type} at ${s.pending.id}`).toBe(true) }
    const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
    let a: Action = await bot.decide(view(s, seat), s.pending, legal)
    if (a.type === 'move.to') {
      const ctx = s.pending.context as { modelId?: string; inches?: number }
      const m = s.models[String(ctx.modelId)]!
      const len = Math.hypot(m.pos.x, m.pos.z) || 1
      const step = Math.min(len, (ctx.inches ?? 1) * 0.9)
      const moved = apply(s, bundle, { ...a, path: [{ x: m.pos.x - (m.pos.x / len) * step, z: m.pos.z - (m.pos.z / len) * step }] })
      if (moved.ok) { s = moved.state; continue }
      a = legal.find((x) => x.type === 'move.cancel')!
    }
    const r = apply(s, bundle, a)
    expect(r.ok, `${a.type} at ${s.pending.id}`).toBe(true)
    s = r.state
  }
  return { state: s, probes }
}

describe('engine invariants', () => {
  it('SCN-001 random games end at the round limit or on a victory, and every legal option is accepted', async () => {
    for (const seed of ['inv-1', 'inv-2']) {
      const { state, probes } = await play(seed)
      expect(state.phase).toBe('over')
      expect(state.result).not.toBeNull()
      expect(state.round).toBeLessThanOrEqual(state.maxRounds ?? Infinity)
      expect(probes).toBeGreaterThan(50)
    }
  })

  it('SCN-001 a scored scenario (box-4, tower contact at round 6) also finishes with a result', async () => {
    const { state } = await play('inv-tower', 'box-4')
    expect(state.phase).toBe('over')
    expect(state.round).toBe(state.maxRounds)
  })

  it('RNG-001 replaying the seed and the action log reproduces the final state', async () => {
    const { state } = await play('inv-replay')
    let s = createGame(bundle, { seed: 'inv-replay' })
    for (const a of state.log) {
      const r = apply(s, bundle, a)
      expect(r.ok).toBe(true)
      s = r.state
    }
    expect(s).toEqual(state)
  })

  it('DECIDER-001 a malformed or stale action is rejected and leaves the same state', () => {
    const s = createGame(bundle, { seed: 'inv-bad' })
    for (const bad of [{ type: 'nonsense', decisionId: s.pending.id, seat: 'A' }, { type: 'turn.start', decisionId: 'd:999', seat: 'A' }, { type: 'turn.start', decisionId: s.pending.id, seat: 'B' }] as Action[]) {
      const r = apply(s, bundle, bad)
      expect(r.ok).toBe(false)
      expect(r.state).toBe(s)
    }
  })
})
