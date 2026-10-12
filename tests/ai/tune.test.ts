// Bench round 2 fixes (spec 30 s6, s7.1): no shooting into a scrum with a friend in it, no walking off the table,
// and routes that go round friendly bases instead of into their backs.
import { describe, expect, it } from 'vitest'
import { makeContext } from '../../src/ai/decider'
import { attackValue } from '../../src/ai/eval'
import { freeSpot } from '../../src/ai/moves'
import { navGrid, withBlockers } from '../../src/ai/nav'
import { newMemory, type AiContext } from '../../src/ai/types'
import { baseRadius } from '../../src/engine/geometry'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { ModelState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()
const state = createGame(bundle, { seed: 'tune', scenarioId: 'box-1' })
const seat = state.seatOrder[0]!

function ctxWith(patch: (models: Record<string, ModelState>) => void): AiContext {
  const v = view(state, seat)
  const models = Object.fromEntries(Object.entries(v.models).map(([k, m]) => [k, { ...m, carried: [...m.carried] }]))
  patch(models)
  return makeContext('normal', { ...v, models } as typeof v, state.pending, legalActions(state), { seed: 't', bundle, budgetMs: 5000 }, newMemory())
}
const ranged = (m: ModelState) => m.carried.some((c) => c.kind === 'weapon' && (bundle.records.weapons.find((w) => w.id === c.defId)?.skill ?? 'melee') !== 'melee')

/** A shooter at the origin, an enemy 6" away and (optionally) a friend of the shooter in base contact with it. */
function scrum(withFriend: boolean): { c: AiContext; a: string; b: string } {
  let a = '', b = ''
  const c = ctxWith((ms) => {
    const all = Object.values(ms)
    const shooter = all.find((m) => m.owner === seat && ranged(m))!
    const friend = all.find((m) => m.owner === seat && m.id !== shooter.id)!
    const foe = all.find((m) => m.owner !== seat)!
    for (const m of all) if (m !== shooter && m !== friend && m !== foe) m.pos = { x: m.owner === seat ? -15 : 15, z: m.pos.z }
    shooter.pos = { x: 0, z: 0 }
    foe.pos = { x: 6, z: 0 }
    friend.pos = withFriend ? { x: 6, z: baseRadius(foe.base) + baseRadius(friend.base) } : { x: -14, z: 10 }
    a = shooter.id; b = foe.id
  })
  return { c, a, b }
}

describe('AI bench round 2 fixes', () => {
  it('AI-R2-01 a shot into a melee with a friend in it is worth less than the same shot in the clear', () => {
    const clear = scrum(false), busy = scrum(true)
    const v0 = attackValue(clear.c, clear.a, clear.b).value
    const v1 = attackValue(busy.c, busy.a, busy.b).value
    expect(v0).toBeGreaterThan(0)
    expect(v1).toBeLessThan(v0)
  })

  it('AI-R2-02 a move end off the table is never a free spot', () => {
    const c = ctxWith(() => {})
    const m = Object.values(c.view.models).find((x) => x.owner === seat)!
    const { w, d } = c.q.scenario.table
    expect(freeSpot(c, m.id, { x: 0, z: d / 2 + 1 })).toBe(false)
    expect(freeSpot(c, m.id, { x: w / 2, z: 0 })).toBe(false)
    expect(freeSpot(c, m.id, { x: 0, z: 0 })).toBe(true)
  })

  it('AI-R2-03 withBlockers marks friendly bases blocked but keeps the mover\'s own spot free', () => {
    const g = navGrid(state, 0.8)
    const at = { x: 0, z: 0 }
    const b = withBlockers(g, [{ at, r: 1.5 }])
    const idx = (p: { x: number; z: number }) => Math.round((p.z - g.z0)) * g.nx + Math.round((p.x - g.x0))
    expect(b.cell[idx(at)]).toBe(2)
    expect(b.cell[idx({ x: 5, z: 5 })]).toBe(g.cell[idx({ x: 5, z: 5 })])
    const kept = withBlockers(g, [{ at, r: 1.5 }], { x: 1, z: 0 }, 1.1)
    expect(kept.cell[idx({ x: 1, z: 0 })]).toBe(g.cell[idx({ x: 1, z: 0 })])
    expect(g.cell[idx(at)]).not.toBe(2) // the cached terrain grid is untouched
  })
})
