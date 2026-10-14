// AI scoring and threat map (spec 30 s7, s9). Uses the real engine bundle; positions are moved on the query shim.
import { describe, expect, it } from 'vitest'
import { makeContext } from '../../src/ai/decider'
import { activationValue, attackValue, bestAttackFrom, coverValue, healthLeft, modelValue, objectiveValue, positionValue } from '../../src/ai/eval'
import { buildThreatMap, reachOf, threatAt, threatsInReach } from '../../src/ai/threat'
import { newMemory, type AiContext, type AiView } from '../../src/ai/types'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { MarkerState, ModelState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()
const state = createGame(bundle, { seed: 'eval', scenarioId: 'box-1' })
const seat = state.seatOrder[0]!

function ctxWith(patch?: (models: Record<string, ModelState>) => void, extras: Partial<AiView> = {}): AiContext {
  const v = view(state, seat)
  const models = Object.fromEntries(Object.entries(v.models).map(([k, m]) => [k, { ...m, carried: [...m.carried] }]))
  patch?.(models)
  return makeContext('normal', { ...v, models, ...extras } as typeof v, state.pending, legalActions(state), { seed: 'e', bundle, budgetMs: 5000 }, newMemory())
}
const armed = (m: ModelState) => m.carried.some((c) => c.kind === 'weapon')
const mine = (c: AiContext) => Object.values(c.view.models).filter((m) => m.owner === seat)
const foes = (c: AiContext) => Object.values(c.view.models).filter((m) => m.owner !== seat)
const place = (gap: number, tweak?: (a: ModelState, b: ModelState) => void) =>
  ctxWith((ms) => {
    const a = Object.values(ms).find((m) => m.owner === seat && armed(m))!
    const b = Object.values(ms).find((m) => m.owner !== seat)!
    a.pos = { x: 0, z: 0 }; b.pos = { x: gap, z: 0 }
    for (const o of Object.values(ms)) if (o.owner !== seat && o.id !== b.id) o.pos = { x: 5000, z: 5000 } // only the duel partner is in reach
    tweak?.(a, b)
  })
const duel = (gap: number) => place(gap)
const shooter = (c: AiContext) => mine(c).find(armed)!

describe('AI evaluation (spec 30 s7, s9)', () => {
  it('AI-E01 model value and health come from the bundle and shrink with damage', () => {
    const c = ctxWith()
    const m = foes(c)[0]!
    const left = healthLeft(c, m.id)
    expect(left).toBeGreaterThan(0)
    const full = modelValue(c, m.id)
    expect(full).toBeGreaterThan(0)
    const hurt = ctxWith((ms) => { ms[m.id]!.damage = left - 1 })
    expect(healthLeft(hurt, m.id)).toBe(1)
    expect(modelValue(hurt, m.id)).toBeLessThan(full)
  })

  it('AI-E02 an attack in range scores positive and an out-of-range one scores zero', () => {
    const c = duel(6)
    const far = duel(200)
    const near = bestAttackFrom(c, shooter(c).id)
    expect(near.targetId).not.toBeNull()
    expect(near.score.value).toBeGreaterThan(0)
    expect(attackValue(c, shooter(c).id, near.targetId!, { weaponUid: near.weaponUid! }).value).toBeCloseTo(near.score.value, 9)
    expect(bestAttackFrom(far, shooter(far).id).score.value).toBe(0)
  })

  it('AI-E03 a damaged target is a better attack than a healthy one (focus fire)', () => {
    const base = duel(6)
    const a = shooter(base)
    const best = bestAttackFrom(base, a.id)
    const opts = { weaponUid: best.weaponUid! }
    const left = healthLeft(base, best.targetId!)
    const hurt = place(6, (_x, y) => { y.damage = Math.max(0, left - 1) })
    expect(attackValue(hurt, a.id, best.targetId!, opts).value).toBeGreaterThan(attackValue(base, a.id, best.targetId!, opts).value)
  })

  it('AI-E04 threat map: reach is pre-checked, threatAt is memoised and zero when nothing can reach', () => {
    const c = duel(8)
    const me = shooter(c)
    const map = buildThreatMap(c)
    const foe = foes(c)[0]!
    expect(reachOf(c, foe.id).move).toBeGreaterThan(0)
    expect(threatsInReach(c, map, me.pos)).toContain(foe.id)
    const t1 = threatAt(c, map, me.id, me.pos)
    expect(threatAt(c, map, me.id, me.pos)).toBe(t1)
    expect(map.memo.size).toBe(1)
    expect(t1.exp).toBeGreaterThanOrEqual(0)
    const far = { x: -1000, z: -1000 }
    expect(threatsInReach(c, map, far)).toEqual([])
    expect(threatAt(c, map, me.id, far).exp).toBe(0)
  })

  it('AI-E05 position value carries a threat penalty only where the enemy reaches; cover is in 0..1', () => {
    const c = duel(8)
    const me = shooter(c)
    const map = buildThreatMap(c)
    expect(threatAt(c, map, me.id, me.pos).exp).toBeGreaterThan(0)
    expect(positionValue(c, me.id, me.pos, map).parts.threat ?? 0).toBeLessThan(0)
    expect(positionValue(c, me.id, { x: -500, z: 0 }, map).parts.threat ?? 0).toBeCloseTo(0, 9)
    const cv = coverValue(c, me.id, me.pos, map)
    expect(cv).toBeGreaterThanOrEqual(0)
    expect(cv).toBeLessThanOrEqual(1)
    expect(Number.isFinite(activationValue(c, me.id, map).value)).toBe(true)
  })

  it('AI-E06 objective value is 0 without markers and rises near an unseen marker', () => {
    const c = ctxWith(undefined, { markers: [] }) // the engine view now carries markers (M4b); this case is the empty list
    const me = mine(c)[0]!
    expect(objectiveValue(c, me.id, me.pos)).toBe(0)
    const marker: MarkerState = { id: 'k1', kind: 'searchable', pos: { x: 3, z: 3 }, revealed: false, seenBy: [], props: {} }
    const withMarker = ctxWith(undefined, { markers: [marker] })
    expect(objectiveValue(withMarker, me.id, { x: 3, z: 3 })).toBeGreaterThan(objectiveValue(withMarker, me.id, { x: 30, z: 30 }))
  })
})
