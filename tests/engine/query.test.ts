// query.* is what the UI shows; these check it agrees with the plan the roll resolves against (spec 13 s7).
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { attackPlan, rangeBandOf } from '../../src/engine/attack'
import { healthOf } from '../../src/engine/damage'
import { skillOdds } from '../../src/engine/dice'
import { baseDiameter } from '../../src/engine/geometry'
import * as query from '../../src/engine/query'
import { isRejection } from '../../src/engine/registry'
import { activationMenu } from '../../src/engine/turnflow'
import type { GameState, ModelId } from '../../src/engine/types'
import { duel, withPending } from './helpers'

const put = (s: GameState, id: ModelId, x: number, z: number): GameState =>
  ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos: { x, z } } } })
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('query', () => {
  it('SKILL-009 hitOdds is the attack plan: the same SV, pool and exact enumerated probability', () => {
    const d = duel({ distance: 10 })
    const odds = query.hitOdds(d.state, d.bundle, d.attackerId, d.targetId)
    const plan = attackPlan(d.state, d.bundle, d.attackerId, d.targetId)
    if (isRejection(plan)) throw new Error(plan.message)
    expect(odds.sv).toBe(plan.sv)
    expect(odds.pool).toEqual(plan.pool)
    expect(odds.pHit).toBeCloseTo(skillOdds(d.bundle, plan.sv, plan.pool).pHit, 12)
    expect(odds.pHit).toBeGreaterThan(0)
    expect(odds.pHit).toBeLessThan(1)
  })

  it('SKILL-009 the SV shown before a shot is the SV the shot rolls against', () => {
    const d = duel({ distance: 10 })
    const shown = query.hitOdds(d.state, d.bundle, d.attackerId, d.targetId)
    const menu = activationMenu(d.state, d.bundle, d.attackerId)
    let s = withPending(d.state, { seat: 'A', kind: 'turn.activation', context: {}, options: menu, canPass: false })
    const begin = s.pending.options.find((o) => o.action.type === 'shoot.begin')!
    let r = apply(s, d.bundle, begin.action)
    expect(r.ok).toBe(true)
    s = r.state
    const pick = s.pending.options.find((o) => o.action.targetId === d.targetId)!
    r = apply(s, d.bundle, pick.action)
    expect(r.ok).toBe(true)
    const ev = r.state.events.find((e) => e.type === 'attack') as unknown as { sv: number }
    expect(ev.sv).toBe(shown.sv)
  })

  it('SKILL-009 an attack that is not legal now shows no chance and no damage', () => {
    const d = duel({ distance: 10 })
    const far = put(d.state, d.targetId, 0, -17)
    const odds = query.hitOdds(far, d.bundle, d.attackerId, d.targetId, { weaponUid: `${d.attackerId}/baseball-bat`, band: 'melee' })
    expect(odds.pHit).toBe(0)
    expect(odds.band).toBeNull()
    expect(query.expectedDamage(far, d.bundle, d.attackerId, d.targetId, { band: 'melee' }).expected).toBe(0)
    expect(query.killOdds(far, d.bundle, d.attackerId, d.targetId, { band: 'melee' })).toBe(0)
  })

  it('RANGE-003 rangeBand measures the base-edge gap and agrees with the attack pipeline', () => {
    const d = duel({ distance: 10 })
    const info = query.rangeBand(d.state, d.bundle, d.attackerId, d.targetId)
    const a = d.state.models[d.attackerId]!, t = d.state.models[d.targetId]!
    expect(info.distance).toBeCloseTo(10 - baseDiameter(a.base) / 2 - baseDiameter(t.base) / 2, 5)
    expect(info).toEqual(rangeBandOf(d.state, d.bundle, d.attackerId, d.targetId, `${d.attackerId}/hunting-rifle`))
    expect(info.band).not.toBeNull()
  })

  it('COVER-003 an open table gives no cover and no armor bonus', () => {
    const d = duel({ distance: 10 })
    const c = query.coverFor(d.state, d.bundle, d.attackerId, d.targetId)
    expect(c).toMatchObject({ cover: false, count: 0, armorBonus: 0 })
  })

  it('DMG-001 expectedDamage is a distribution over applied damage given a hit', () => {
    const d = duel({ distance: 10 })
    const e = query.expectedDamage(d.state, d.bundle, d.attackerId, d.targetId)
    expect(sum(e.dist)).toBeCloseTo(1, 9)
    expect(e.expected).toBeCloseTo(e.dist.reduce((a, p, i) => a + p * i, 0), 9)
    expect(e.expected).toBeGreaterThan(0)
    expect(e.byType.map((b) => b.type)).toContain('physical')
  })

  it('DMG-003 killOdds is P(hit) times P(applied damage reaches the Health left)', () => {
    const d = duel({ distance: 10 })
    const odds = query.hitOdds(d.state, d.bundle, d.attackerId, d.targetId)
    const health = healthOf(d.state, d.bundle, d.targetId)
    const fresh = query.killOdds(d.state, d.bundle, d.attackerId, d.targetId)
    expect(fresh).toBeLessThanOrEqual(odds.pHit + 1e-12)
    const hurt: GameState = { ...d.state, models: { ...d.state.models, [d.targetId]: { ...d.state.models[d.targetId]!, damage: health - 1 } } }
    const dist = query.expectedDamage(hurt, d.bundle, d.attackerId, d.targetId).dist
    expect(query.killOdds(hurt, d.bundle, d.attackerId, d.targetId)).toBeCloseTo(odds.pHit * (1 - dist[0]!), 12)
    expect(query.killOdds(hurt, d.bundle, d.attackerId, d.targetId)).toBeGreaterThanOrEqual(fresh)
  })

  it('CC-001 models in base contact get close-combat odds (melee band)', () => {
    const d = duel({ distance: 10 })
    const a = d.state.models[d.attackerId]!, t = d.state.models[d.targetId]!
    const touch = baseDiameter(a.base) / 2 + baseDiameter(t.base) / 2
    const s = put(d.state, d.attackerId, 0, -5 + touch)
    const odds = query.hitOdds(s, d.bundle, d.attackerId, d.targetId, { weaponUid: `${d.attackerId}/baseball-bat` })
    expect(odds.band).toBe('melee')
    expect(odds.skill).toBe('melee')
    expect(odds.pHit).toBeGreaterThan(0)
  })
})
