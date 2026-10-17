// Carry-off victories: a model that walks off the table with a scenario object takes it with it (MOVE-011, BOX-2 / BOX-3).
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { activationMenu } from '../../src/engine/turnflow'
import { checkVictory } from '../../src/engine/scenario'
import { createGame } from '../../src/engine/setup'
import { withPending, loadBundle } from './helpers'
import type { GameState, Vec2 } from '../../src/engine/types'

const bundle = loadBundle()

/** A box scenario in play, the first model of `seat` ready, activated and next to the south edge, carrying the first `face` marker. */
function carrierAtEdge(scenarioId: string, seat: string, face: string, otherEdge = false): { s: GameState; id: string } {
  const g = createGame(bundle, { seed: 'carry', scenarioId })
  const mk = g.markers.find((m) => m.face === face)!
  const m = Object.values(g.models).find((x) => x.owner === seat && x.life === 'active' && !x.offTable)!
  const z = otherEdge ? -16.5 : 16.5
  const models = Object.fromEntries(Object.entries(g.models).map(([k, v]) => [k, k === m.id ? { ...v, pos: { x: 0, z }, readiness: 'ready' as const } : { ...v, pos: { x: v.pos.x > 0 ? 12 : -12, z: v.pos.z > 0 ? 8 : -8 } }]))
  const base: GameState = {
    ...g, models, phase: 'play', round: 1, advantage: seat, terrain: [],
    markers: g.markers.map((k) => (k.id === mk.id ? { ...k, carriedBy: m.id, pos: { x: 0, z } } : k)),
    turn: { seat, step: 'use', readied: m.id, firstSeat: seat },
    activation: { modelId: m.id, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
  }
  const menu = activationMenu(base, bundle, m.id)
  const go = menu.find((o) => o.action.type === 'move.go')!
  const open = withPending(base, { seat, kind: 'turn.activation', context: {}, options: menu, canPass: false })
  const r = apply(open, bundle, open.pending.options.find((o) => o.id === go.id)!.action)
  if (!r.ok) throw new Error(r.rejection.message)
  return { s: r.state, id: m.id }
}
const exit = (s: GameState, path: Vec2[]) => {
  const to = s.pending.options.find((o) => o.action.type === 'move.to')!
  const r = apply(s, bundle, { ...to.action, path })
  if (!r.ok) throw new Error(r.rejection.message)
  return r.state
}

describe('carry-off', () => {
  it('MOVE-011 a model walking off the table takes the nuke it carries: the marker is flagged off the table with the carrying seat and the attacker wins box-2', () => {
    const seat = Object.entries(createGame(bundle, { seed: 'carry', scenarioId: 'box-2' }).seats).find(([, v]) => v.side === 'attacker')![0]
    const { s, id } = carrierAtEdge('box-2', seat, 'mini-nuke')
    const after = exit(s, [{ x: 0, z: 19 }])
    expect(after.models[id]!.life).toBe('dead')
    const nuke = after.markers.find((m) => m.face === 'mini-nuke')!
    expect(nuke.props.offTable).toBe(true)
    expect(nuke.props.offTableBy).toBe(seat)
    expect(after.result?.winner ?? checkVictory(after, bundle)?.winner).toBe(seat)
  })

  it('MOVE-011 a model that only walks along the edge keeps what it carries', () => {
    const seat = Object.entries(createGame(bundle, { seed: 'carry', scenarioId: 'box-2' }).seats).find(([, v]) => v.side === 'attacker')![0]
    const { s, id } = carrierAtEdge('box-2', seat, 'mini-nuke')
    const after = exit(s, [{ x: 2, z: 16.5 }])
    expect(after.models[id]!.life).toBe('active')
    const nuke = after.markers.find((m) => m.face === 'mini-nuke')!
    expect(nuke.carriedBy).toBe(id)
    expect(nuke.props.offTable).not.toBe(true)
  })
})
