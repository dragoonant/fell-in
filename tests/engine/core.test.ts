import { describe, expect, it } from 'vitest'
import { createRandomDecider } from '../../src/engine/decider'
import { rollD12, rollD20, seedRng } from '../../src/engine/rng'
import { createDemoGame } from '../../src/engine/setup'
import { legalActions } from '../../src/engine/pending'
import { view } from '../../src/engine/view'

describe('engine core', () => {
  it('RNG-001 the seeded rng is deterministic and dice stay in range', () => {
    const a = seedRng('s'), b = seedRng('s')
    expect(a).toEqual(b)
    let s = a
    for (let i = 0; i < 500; i++) {
      const [d20, n1] = rollD20(s)
      const [d12, n2] = rollD12(n1)
      s = n2
      expect(d20).toBeGreaterThanOrEqual(1)
      expect(d20).toBeLessThanOrEqual(20)
      expect(d12).toBeGreaterThanOrEqual(1)
      expect(d12).toBeLessThanOrEqual(12)
    }
  })

  it('SETUP-001 the demo table is 36 in square with models on 25/32/40 mm bases', () => {
    const g = createDemoGame()
    expect(g.scenario.table).toEqual({ w: 36, d: 36 })
    expect(new Set(Object.values(g.models).map((m) => m.base))).toEqual(new Set([25, 32, 40]))
    expect(legalActions(g).length).toBeGreaterThan(0)
  })

  it('VIEW-001 a view carries the seat and the open decision', () => {
    const g = createDemoGame()
    const v = view(g, 'A')
    expect(v.seat).toBe('A')
    expect(v.pending.id).toBe(g.pending.id)
  })

  it('DECIDER-001 the random decider is reproducible per decision', async () => {
    const g = createDemoGame()
    const legal = legalActions(g)
    const d1 = await createRandomDecider('x').decide(view(g, 'A'), g.pending, legal)
    const d2 = await createRandomDecider('x').decide(view(g, 'A'), g.pending, legal)
    expect(d1).toEqual(d2)
  })
})
