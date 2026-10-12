import { describe, expect, it } from 'vitest'
import { addCondition, conditionMoveSteps, conditionSvMods, endOfActivation, hasCondition, removeCondition, startOfActivation } from '../../src/engine/conditions'
import type { DiceRolled } from '../../src/engine/rng'
import type { GameState, ModelState, WastelandCondition } from '../../src/engine/types'
import { duel, loadBundle } from './helpers'

const bundle = loadBundle()
const withConds = (unit: string, conds: WastelandCondition[] = []) => {
  const d = duel({ target: { unit, count: 1, items: [] } })
  const s: GameState = { ...d.state, models: { ...d.state.models, [d.targetId]: { ...d.state.models[d.targetId]!, conditions: conds } as ModelState } }
  return { s, id: d.targetId }
}

describe('conditions', () => {
  it('COND-001 a model holds at most one of each condition', () => {
    const { s, id } = withConds('settler')
    const a = addCondition(s, bundle, id, 'poisoned')
    expect(a.added).toBe(true)
    const b = addCondition(a.state, bundle, id, 'poisoned')
    expect(b.added).toBe(false)
    expect(b.state.models[id]!.conditions).toEqual(['poisoned'])
  })

  it('COND-004 On Fire and Frozen replace each other', () => {
    const { s, id } = withConds('settler', ['frozen'])
    const fire = addCondition(s, bundle, id, 'onFire').state
    expect(fire.models[id]!.conditions).toEqual(['onFire'])
    expect(addCondition(fire, bundle, id, 'frozen').state.models[id]!.conditions).toEqual(['frozen'])
  })

  it('COND-005 robots are immune to Poisoned', () => {
    const robot = bundle.records.units.find((u) => u.types.includes('robot'))
    if (!robot) return
    const { s, id } = withConds(robot.id)
    expect(addCondition(s, bundle, id, 'poisoned').added).toBe(false)
  })

  it('COND-002/006 Frozen and Injured Arm give -2 SV; Frozen, Slow and Injured Leg shorten moves', () => {
    const { s, id } = withConds('settler', ['frozen', 'injuredArm'])
    expect(conditionSvMods(s, bundle, id).map((m) => m.value)).toEqual([-2, -2])
    expect(conditionMoveSteps(s, bundle, id)).toBe(1)
    const both = withConds('settler', ['frozen', 'injuredLeg', 'slow'])
    expect(conditionMoveSteps(both.s, bundle, both.id)).toBe(2)
    const none = withConds('settler')
    expect(conditionSvMods(none.s, bundle, none.id)).toEqual([])
  })

  it('COND-002 Frozen ends at the end of the activation', () => {
    const { s, id } = withConds('settler', ['frozen'])
    expect(hasCondition(endOfActivation(s, bundle, id).models[id]!, 'frozen')).toBe(false)
  })

  it('COND-003 On Fire: 1 damage at activation start, then a luck flip may extinguish', () => {
    const { s, id } = withConds('settler', ['onFire'])
    const out = startOfActivation(s, bundle, id)
    expect(out.models[id]!.damage).toBe(1)
    const flip = [...out.events].reverse().find((e): e is DiceRolled => e.type === 'DiceRolled' && e.purpose === 'onFire')!
    expect(hasCondition(out.models[id]!, 'onFire')).toBe(flip.dice[0] !== 1)
  })

  it('COND-003 Strong still blocks On Fire damage', () => {
    const { s, id } = withConds('deathclaw', ['onFire'])
    expect(startOfActivation(s, bundle, id).models[id]!.damage).toBe(0)
  })

  it('COND-005 Poisoned: 1 damage at activation start ignoring armor, and it persists', () => {
    const { s, id } = withConds('deathclaw', ['poisoned'])
    const out = startOfActivation(s, bundle, id)
    expect(out.models[id]!.damage).toBe(1)
    expect(hasCondition(out.models[id]!, 'poisoned')).toBe(true)
  })

  it('COND-006 removing a condition clears only that one', () => {
    const { s, id } = withConds('settler', ['injuredArm', 'poisoned'])
    expect(removeCondition(s, bundle, id, 'injuredArm').models[id]!.conditions).toEqual(['poisoned'])
  })
})
