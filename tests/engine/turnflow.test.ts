import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/engine/apply'
import { hasCondition } from '../../src/engine/conditions'
import { createGame } from '../../src/engine/setup'
import { activationMenu, gainAp, turnflow } from '../../src/engine/turnflow'
import type { Action, GameState, ModelState } from '../../src/engine/types'
import { duel, loadBundle } from './helpers'

vi.mock('../../src/engine/conditions', async (orig) => {
  const o = await orig<typeof import('../../src/engine/conditions')>()
  return { ...o, startOfActivation: (s: GameState) => s, endOfActivation: (s: GameState) => s, conditionSvMods: () => [], conditionMoveSteps: () => 0 }
})
vi.mock('../../src/engine/items', async (orig) => ({ ...(await orig<typeof import('../../src/engine/items')>()), tickEffects: (s: GameState) => s }))
vi.mock('../../src/engine/scenario', async (orig) => ({ ...(await orig<typeof import('../../src/engine/scenario')>()), checkVictory: () => null, endOfRound: (s: GameState) => s }))

const bundle = loadBundle()
const SMALL = { A: [{ unit: 'sole-survivor', count: 1, items: ['hunting-rifle'] }], B: [{ unit: 'super-mutant', count: 2, items: ['board'] }] }
const pickOpt = (s: GameState, type: string, match: Partial<Action> = {}): Action => {
  const o = s.pending.options.find((x) => x.action.type === type && Object.entries(match).every(([k, v]) => x.action[k] === v))
  if (!o) throw new Error(`no ${type} in ${s.pending.kind}: ${s.pending.options.map((x) => x.action.type).join(',')}`)
  return o.action
}
const step = (s: GameState, a: Action): GameState => {
  const r = apply(s, bundle, a)
  if (!r.ok) throw new Error(`${a.type}: ${r.rejection.code} ${r.rejection.message}`)
  return r.state
}
const set = (s: GameState, id: string, patch: Partial<ModelState>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })

function started() {
  let s = createGame(bundle, { seed: 'tf', forces: SMALL })
  s = step(s, pickOpt(s, 'turn.start'))
  return s
}

describe('turn flow', () => {
  it('TURN-010 round 1 Advantage goes to the side with fewer models, which picks who goes first (TURN-012)', () => {
    const s = started()
    expect(s.round).toBe(1)
    expect(s.advantage).toBe('A')
    expect(s.pending.kind).toBe('turn.first')
    expect(s.pending.seat).toBe('A')
    expect(Object.values(s.models).every((m) => m.readiness === 'unready')).toBe(true) // TURN-001
  })

  it('TURN-002 a turn starts by readying exactly one Unready model; TURN-003 then use or pass', () => {
    let s = started()
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'B' }))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('B')
    expect(s.pending.options).toHaveLength(2)
    s = step(s, pickOpt(s, 'turn.ready'))
    expect(s.pending.kind).toBe('turn.choose')
    expect(s.pending.options.map((o) => o.action.type).sort()).toEqual(['turn.useAll', 'turn.useNone'])
  })

  it('TURN-007 using none flips the Ready model to Used; TURN-008 turns alternate', () => {
    let s = started()
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'B' }))
    const readied = pickOpt(s, 'turn.ready')
    s = step(s, readied)
    s = step(s, pickOpt(s, 'turn.useNone'))
    expect(s.models[String(readied.modelId)]!.readiness).toBe('used')
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('A')
  })

  it('TURN-004 the last Unready model is forced into use', () => {
    let s = started()
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'A' }))
    s = step(s, pickOpt(s, 'turn.ready'))
    expect(s.pending.kind).toBe('turn.activation')
    expect(s.activation!.modelId).toBe('a-sole-survivor-1')
  })

  it('TURN-008 a side with every model Used takes no more turns; TURN-009 the round ends when all are Used', () => {
    let s = started()
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'A' }))
    s = step(s, pickOpt(s, 'turn.ready')) // A's only model, activation opens
    s = step(s, pickOpt(s, 'turn.end'))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('B')
    s = step(s, pickOpt(s, 'turn.ready'))
    s = step(s, pickOpt(s, 'turn.useNone')) // B's first model: skipped
    expect(s.pending.seat).toBe('B') // A has nothing left, B continues alone
    s = step(s, pickOpt(s, 'turn.ready')) // B's last Unready model: forced into use (TURN-004)
    s = step(s, pickOpt(s, 'turn.end'))
    expect(s.round).toBe(2) // new round: everyone Unready again
    expect(Object.values(s.models).every((m) => m.readiness === 'unready')).toBe(true)
    expect(s.pending.kind).toBe('turn.first')
  })

  it('ACT-007 an activation starts by discarding the Reaction marker; the menu offers Prepare, Move and End', () => {
    let s = started()
    s = set(s, 'a-sole-survivor-1', { reaction: true })
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'A' }))
    s = step(s, pickOpt(s, 'turn.ready'))
    expect(s.models['a-sole-survivor-1']!.reaction).toBe(false)
    const types = s.pending.options.map((o) => o.action.type)
    expect(types).toContain('prepare.go')
    expect(types).toContain('move.go')
    expect(types).toContain('turn.end')
  })

  it('PREP-001 Prepare gives one Reaction marker and survives the activation; it is not offered twice', () => {
    let s = started()
    s = step(s, pickOpt(s, 'turn.first', { firstSeat: 'A' }))
    s = step(s, pickOpt(s, 'turn.ready'))
    s = step(s, pickOpt(s, 'prepare.go'))
    expect(s.models['a-sole-survivor-1']!.reaction).toBe(true)
    expect(s.activation!.actionsTaken).toBe(1)
    expect(s.pending.options.map((o) => o.action.type)).not.toContain('prepare.go')
  })

  it('PREP-006 a Frozen model cannot Prepare', () => {
    const d = duel()
    const frozen = set(d.state, d.attackerId, { conditions: ['frozen'] })
    expect(hasCondition(frozen.models[d.attackerId]!, 'frozen')).toBe(true)
    expect(turnflow.options(frozen, bundle, d.attackerId)).toEqual([])
    expect(turnflow.options(d.state, bundle, d.attackerId).map((o) => o.action.type)).toEqual(['prepare.go'])
  })

  it('ACT-001 two Actions, then only End; AP-007 a Quick Action needs AP and an unused icon', () => {
    const d = duel()
    const spent = { ...d.state, activation: { ...d.state.activation!, actionsTaken: 2 } }
    expect(activationMenu(spent, bundle, d.attackerId).map((o) => o.action.type)).toEqual(['turn.end'])
    const withAp = { ...spent, activation: { ...spent.activation!, ap: 1 } }
    const menu = activationMenu(withAp, bundle, d.attackerId)
    // the Sole Survivor card has only a Prepare icon: Prepare is the single Quick Action on offer
    expect(menu.map((o) => `${o.action.type}${o.action.quick ? '*' : ''}`)).toEqual(['prepare.go*', 'turn.end'])
    const used = { ...withAp, activation: { ...withAp.activation!, apIconsUsed: ['prepare' as const] } }
    expect(activationMenu(used, bundle, d.attackerId).map((o) => o.action.type)).toEqual(['turn.end'])
  })

  it('AP-006 AP are lost at activation end; AP-005 none are gained in Quick Actions or reactions', () => {
    const d = duel()
    expect(gainAp(d.state, 2).activation!.ap).toBe(2)
    const quick = { ...d.state, action: { modelId: d.attackerId, type: 'move.go', quick: true, reaction: false, free: false, itemUsed: false } }
    expect(gainAp(quick, 2).activation!.ap).toBe(0)
    const react = { ...d.state, action: { ...quick.action, quick: false, reaction: true } }
    expect(gainAp(react, 2).activation!.ap).toBe(0)
    const ended = step(d.state, d.state.pending.options[0]!.action)
    expect(ended.activation).toBeNull()
  })

  it('PREP-007..010 a Prepared model within Awareness may react to an opposing Action after it completes', () => {
    const d = duel({ distance: 8 })
    const s = set(d.state, d.targetId, { reaction: true })
    const trigger = { kind: 'action' as const, sourceId: d.attackerId, movement: true }
    const next = turnflow.afterAction(s, bundle, { modelId: d.attackerId, type: 'move.to', triggers: [trigger] })
    expect(next.pending.kind).toBe('react.offer')
    expect(next.pending.seat).toBe('B')
    expect(next.pending.options.map((o) => o.action.type)).toContain('react.pass')
    // declining returns to the activating model's menu with the marker kept
    const back = step(next, pickOpt(next, 'react.pass'))
    expect(back.pending.kind).toBe('turn.activation')
    expect(back.models[d.targetId]!.reaction).toBe(true)
    // taking a reaction spends the marker (PREP-005) and runs it as a Quick Action (PREP-004)
    const took = step(next, next.pending.options.find((o) => o.action.type === 'react.take')!.action)
    expect(took.models[d.targetId]!.reaction).toBe(false)
    expect(took.action?.reaction).toBe(true)
    expect(took.action?.quick).toBe(true)
  })

  it('PREP-008 a trigger outside the Awareness range is not noticed, and unprepared models never react', () => {
    const far = duel({ distance: 34 })
    const trigger = { kind: 'action' as const, sourceId: far.attackerId, attack: true }
    const a = turnflow.afterAction(set(far.state, far.targetId, { reaction: true }), bundle, { modelId: far.attackerId, type: 'shoot.fire', triggers: [trigger] })
    expect(a.pending.kind).toBe('turn.activation')
    const near = duel({ distance: 8 })
    const b = turnflow.afterAction(near.state, bundle, { modelId: near.attackerId, type: 'shoot.fire', triggers: [trigger] })
    expect(b.pending.kind).toBe('turn.activation')
  })
})
