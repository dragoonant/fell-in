import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/engine/apply'
import { baseDiameter } from '../../src/engine/geometry'
import { chargeMove, moveColour, pushBack, resolveFall, validateMove } from '../../src/engine/movement'
import { activationMenu } from '../../src/engine/turnflow'
import { isRejection } from '../../src/engine/registry'
import type { GameState, ModelId, Vec2 } from '../../src/engine/types'
import { duel, loadBundle, ter, withPending } from './helpers'

const spies = vi.hoisted(() => ({
  applyHit: vi.fn(), removeModel: vi.fn(), applyDirectDamage: vi.fn(), freeAttack: vi.fn(),
}))
// Full factory (no orig spread): spreading the real module here loads the import cycle early and leaves movement
// bound to the real damage/melee modules instead of the spies below.
vi.mock('../../src/engine/conditions', () => {
  return {
    hasCondition: (m: { conditions: string[] }, c: string) => m.conditions.includes(c),
    addCondition: (s: GameState) => ({ state: s, added: false }),
    conditions: { id: 'conditions', kinds: ['cond'], options: () => [], resolve: () => ({ code: 'E_TODO', message: 'mock' }) },
    startOfActivation: (s: GameState) => s,
    endOfActivation: (s: GameState) => s,
    conditionSvMods: () => [],
    conditionMoveSteps: (s: GameState, _b: unknown, id: string) =>
      (s.models[id]?.conditions ?? []).filter((c) => ['slow', 'frozen', 'injuredLeg'].includes(c)).length,
    removeCondition: (s: GameState, _b: unknown, id: string, c: string) =>
      ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, conditions: s.models[id]!.conditions.filter((x) => x !== c) } } }),
  }
})
vi.mock('../../src/engine/damage', async (orig) => ({ ...(await orig<typeof import('../../src/engine/damage')>()), ...spies }))
vi.mock('../../src/engine/melee', () => ({
  freeAttack: spies.freeAttack,
  melee: { id: 'melee', kinds: ['charge', 'melee', 'battleCry'], options: () => [], resolve: () => ({ code: 'E_TODO', message: 'mock' }) },
}))
vi.mock('../../src/engine/items', async (orig) => ({ ...(await orig<typeof import('../../src/engine/items')>()), tickEffects: (s: GameState) => s }))
vi.mock('../../src/engine/scenario', async (orig) => ({ ...(await orig<typeof import('../../src/engine/scenario')>()), checkVictory: () => null, endOfRound: (s: GameState) => s }))

const bundle = loadBundle()
const RULER: Record<string, number> = Object.fromEntries(bundle.singletons.rulers!.rulers.map((r) => [r.colour, r.inches]))
const put = (s: GameState, id: ModelId, x: number, z: number, extra: object = {}): GameState =>
  ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos: { x, z }, ...extra } } })
const lim = (s: GameState, id: ModelId, opts = {}) => RULER[moveColour(s, bundle, id, opts)]! + baseDiameter(s.models[id]!.base)

/** Pick the move.go entry from the real activation menu and play it through apply(). */
function startMove(s: GameState) {
  const menu = activationMenu(s, bundle, s.activation!.modelId)
  const go = menu.find((o) => o.action.type === 'move.go')!
  const open = withPending(s, { seat: 'A', kind: 'turn.activation', context: {}, options: menu, canPass: false })
  const r = apply(open, bundle, open.pending.options.find((o) => o.id === go.id)!.action)
  if (!r.ok) throw new Error(r.rejection.message)
  return r.state
}
const moveTo = (s: GameState, path: Vec2[]) => {
  const to = s.pending.options.find((o) => o.action.type === 'move.to')!
  return apply(s, bundle, { ...to.action, path })
}

beforeEach(() => {
  spies.applyHit.mockReset().mockImplementation((s: GameState) => ({ state: s, report: {} }))
  spies.removeModel.mockReset().mockImplementation((s: GameState, _b: unknown, id: string) =>
    ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, life: 'dead' } } }))
  spies.applyDirectDamage.mockReset().mockImplementation((s: GameState) => ({ state: s, applied: 1, removed: false }))
  spies.freeAttack.mockReset().mockImplementation((s: GameState) => ({ state: s }))
})

describe('movement', () => {
  it('MOVE-001 a straight move may displace the base by colour plus base diameter', () => {
    const d = duel({ distance: 30 })
    const inches = lim(d.state, d.attackerId)
    const a = d.state.models[d.attackerId]!.pos
    expect(isRejection(validateMove(d.state, bundle, d.attackerId, [{ x: a.x + inches - 0.01, z: a.z }]))).toBe(false)
    const far = validateMove(d.state, bundle, d.attackerId, [{ x: a.x + inches + 0.2, z: a.z }])
    expect(isRejection(far) && far.code).toBe('E_TOO_FAR')
  })

  it('MOVE-002 opposing bases block the path', () => {
    const d = duel({ distance: 6 })
    const r = validateMove(d.state, bundle, d.attackerId, [{ x: 0, z: -4 }])
    expect(isRejection(r) && r.code).toBe('E_PATH_BLOCKED')
  })

  it('MOVE-003 a model may pass through a friend but not end on one', () => {
    const d = duel({ distance: 30 })
    const friend = { ...d.state.models[d.attackerId]!, id: 'friend', pos: { x: 0, z: 12 } }
    const s: GameState = { ...d.state, models: { ...d.state.models, friend } }
    const a = s.models[d.attackerId]!.pos
    expect(isRejection(validateMove(s, bundle, d.attackerId, [{ x: 0, z: a.z - 4.5 }]))).toBe(false)
    expect(isRejection(validateMove(s, bundle, d.attackerId, [{ x: 0, z: 12.2 }]))).toBe(true)
  })

  it('MOVE-004 difficult ground shortens the whole move by one colour; MOVE-005 unimpeded models ignore it', () => {
    const d = duel({ distance: 30 })
    const inches = lim(d.state, d.attackerId)
    const a = d.state.models[d.attackerId]!.pos
    const s: GameState = { ...d.state, terrain: [ter('mud', 'rough', 0, a.z - 2, 4, 2, 0.2)] }
    const path: Vec2[] = [{ x: 0, z: a.z - (inches - 0.5) }]
    expect(isRejection(validateMove(d.state, bundle, d.attackerId, path))).toBe(false)
    const r = validateMove(s, bundle, d.attackerId, path)
    expect(isRejection(r) && r.code).toBe('E_TOO_FAR')
    const dc = duel({ distance: 30, attacker: { unit: 'deathclaw', count: 1, items: [] } })
    const cl = lim(dc.state, dc.attackerId)
    const ca = dc.state.models[dc.attackerId]!.pos
    const s2: GameState = { ...dc.state, terrain: [ter('mud', 'rough', 0, ca.z - 2, 4, 2, 0.2)] }
    expect(isRejection(validateMove(s2, bundle, dc.attackerId, [{ x: 0, z: ca.z - (cl - 0.5) }]))).toBe(false)
  })

  it('MOVE-006 Slow applies with the Quick Action step and nothing drops below Orange', () => {
    const d = duel()
    expect(moveColour(d.state, bundle, d.attackerId)).toBe('yellow')
    const slow = put(d.state, d.attackerId, 0, 4, { conditions: ['slow'] })
    expect(moveColour(slow, bundle, d.attackerId)).toBe('orange')
    expect(moveColour(slow, bundle, d.attackerId, { quick: true })).toBe('orange')
    expect(moveColour(d.state, bundle, d.attackerId, { quick: true })).toBe('orange')
  })

  it('MOVE-012 a model cannot end on a marker', () => {
    const d = duel({ distance: 30 })
    const a = d.state.models[d.attackerId]!.pos
    const s: GameState = { ...d.state, markers: [{ id: 'm1', kind: 'object', pos: { x: 0, z: a.z - 3 }, revealed: false, seenBy: [], props: {} }] }
    expect(isRejection(validateMove(s, bundle, d.attackerId, [{ x: 0, z: a.z - 3 }]))).toBe(true)
  })

  it('MOVE-008 falling: a jump counts one colour lower and Orange or less is free', () => {
    const d = duel()
    resolveFall(d.state, bundle, d.attackerId, 4, true)
    expect(spies.applyHit).not.toHaveBeenCalled()
    resolveFall(d.state, bundle, d.attackerId, 6, true)
    expect(spies.applyHit).toHaveBeenCalledTimes(1)
    expect(spies.applyHit.mock.calls[0]![2].damage[0].value).toBe(bundle.singletons.rules!.constants['fallingTable'] && (bundle.singletons.rules!.constants['fallingTable'] as Record<string, number>)['yellow'])
    resolveFall(d.state, bundle, d.attackerId, 6, false)
    expect(spies.applyHit.mock.calls[1]![2].damage[0].value).toBe((bundle.singletons.rules!.constants['fallingTable'] as Record<string, number>)['red'])
    resolveFall(d.state, bundle, d.attackerId, 40, false)
    expect(spies.removeModel).toHaveBeenCalledTimes(1)
  })

  it('MOVE-009 Power Armor negates falling damage and removal', () => {
    const d = duel()
    const carried = [{ uid: 'pa', defId: 't-60-power-armor', kind: 'armor' as const, starting: true }]
    const s = put(d.state, d.attackerId, 0, 4, { carried })
    resolveFall(s, bundle, d.attackerId, 40, false)
    expect(spies.applyHit).not.toHaveBeenCalled()
    expect(spies.removeModel).not.toHaveBeenCalled()
  })

  it('MOVE-010 pushed over the table edge: stays on and takes 1 damage ignoring armor', () => {
    const d = duel()
    const s = put(d.state, d.targetId, 0, 16.5)
    const r = pushBack(s, bundle, d.targetId, { x: 0, z: 10 }, 'yellow')
    expect(r.state.models[d.targetId]!.pos.z).toBeLessThanOrEqual(18)
    expect(spies.applyDirectDamage).toHaveBeenCalledTimes(1)
    expect(spies.applyDirectDamage.mock.calls[0]![3]).toBe(1)
    const free = pushBack(put(d.state, d.targetId, 0, 0), bundle, d.targetId, { x: 0, z: 10 }, 'yellow')
    expect(free.inches).toBeCloseTo(RULER['yellow']!, 5)
    expect(spies.applyDirectDamage).toHaveBeenCalledTimes(1)
  })

  it('MOVE-011 a base crossing the table edge by its own move leaves the battlefield', () => {
    const d = duel()
    const s = put(put(d.state, d.attackerId, 0, 16.5), d.targetId, 12, 0)
    const done = moveTo(startMove(s), [{ x: 0, z: 19 }])
    expect(done.ok).toBe(true)
    expect(spies.removeModel).toHaveBeenCalledTimes(1)
  })

  it('CC-009 withdrawing gives each left enemy that is engaged with nobody else a free attack', () => {
    const d = duel()
    const touch = baseDiameter(32) / 2 + baseDiameter(40) / 2
    const s = put(put(d.state, d.attackerId, 0, 0), d.targetId, 0, -touch)
    const r = moveTo(startMove(s), [{ x: 0, z: 3 }])
    expect(r.ok).toBe(true)
    expect(spies.freeAttack).toHaveBeenCalledTimes(1)
    expect(spies.freeAttack.mock.calls[0]!.slice(2)).toEqual([d.targetId, d.attackerId])
  })

  it('MOVE-007 a model with the inability-to-climb icon cannot climb', () => {
    const d = duel({ attacker: { unit: 'dogmeat', count: 1, items: [] }, distance: 30 })
    const s: GameState = { ...d.state, terrain: [ter('rise', 'hill', 0, 12, 6, 6, 3)] }
    const r = moveTo(startMove(put(s, d.attackerId, 0, 9)), [{ x: 0, z: 11.5 }])
    expect(!r.ok && r.rejection.message).toMatch(/cannot climb/)
  })

  it('CHG-002 a charge runs at the target and stops on base contact', () => {
    const d = duel({ distance: 6 })
    const r = chargeMove(d.state, bundle, d.attackerId, d.targetId, [])
    expect(isRejection(r)).toBe(false)
    if (isRejection(r)) return
    const a = r.state.models[d.attackerId]!.pos, t = r.state.models[d.targetId]!.pos
    expect(Math.hypot(a.x - t.x, a.z - t.z)).toBeCloseTo(baseDiameter(32) / 2 + baseDiameter(40) / 2, 4)
    const far = duel({ distance: 25 })
    const tooFar = chargeMove(far.state, bundle, far.attackerId, far.targetId, [])
    expect(isRejection(tooFar) && tooFar.code).toBe('E_TOO_FAR')
  })

  it('ACT-001 cancelling a move gives the Action back', () => {
    const d = duel({ distance: 20 })
    const a1 = startMove(d.state)
    expect(a1.pending.kind).toBe('move.path')
    expect(a1.activation!.actionsTaken).toBe(1)
    const a2 = apply(a1, bundle, a1.pending.options.find((o) => o.action.type === 'move.cancel')!.action)
    if (!a2.ok) throw new Error(a2.rejection.message)
    expect(a2.state.pending.kind).toBe('turn.activation')
    expect(a2.state.activation!.actionsTaken).toBe(0)
  })
})
