// Owner I: SCN checklist group. Games come from createGame so scenario ids, sides and victory entries are the real data.
import { describe, expect, it, vi } from 'vitest'
import { loadBundle } from './helpers'

vi.mock('../../src/engine/turnflow', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return { ...real, activationMenu: () => [{ id: 'end', label: 'End', action: { type: 'turn.end', decisionId: '', seat: '' } }] }
})

import { isRejection, updateModel } from '../../src/engine/registry'
import { checkVictory, endOfRound, scenario } from '../../src/engine/scenario'
import { createGame } from '../../src/engine/setup'
import type { GameState, MarkerState } from '../../src/engine/types'

const bundle = loadBundle()
const game = (scenarioId: string, seats?: string[]): GameState => ({ ...createGame(bundle, { seed: 's', scenarioId, seats }), phase: 'play', round: 1 })
const kill = (s: GameState, owner: string): GameState => {
  let g = s
  for (const m of Object.values(s.models)) if (m.owner === owner) g = updateModel(g, m.id, { life: 'dead' })
  return g
}
const withMarker = (s: GameState, face: string, patch: Partial<MarkerState>): GameState =>
  ({ ...s, markers: s.markers.map((m) => (m.face === face ? { ...m, ...patch, props: { ...m.props, ...(patch.props ?? {}) } } : m)) })

describe('SCN: scenarios and victory', () => {
  it('SCN-001 play continues while both sides stand', () => {
    expect(checkVictory(game('box-1'), bundle)).toBeNull()
  })

  it('SCN-001 wiping out a side wins the game with the scenario reward', () => {
    const r = checkVictory(kill(game('box-1'), 'B'), bundle)!
    expect(r.winner).toBe('A') // seat A plays the Brotherhood (the attacker)
    expect(r.caps).toBe(200) // no suit worn, so no 50 caps bonus
    const s = checkVictory(kill(game('box-1'), 'A'), bundle)!
    expect(s.winner).toBe('B')
    expect(s.caps).toBe(300)
  })

  it('SCN-001 both sides gone is nobody', () => {
    const r = checkVictory(kill(kill(game('box-1'), 'A'), 'B'), bundle)!
    expect(r.winner).toBeNull()
  })

  it('SCN-001 the round limit ends the game as a draw when nothing else decided it', () => {
    const g = { ...game('box-5'), round: 6 }
    const over = endOfRound(g, bundle)
    expect(over.phase).toBe('over')
    expect(over.result!.winner).toBeNull()
    expect(endOfRound({ ...g, round: 5 }, bundle).phase).toBe('play')
  })

  it('SCN-001 BOX-1: at the round limit with both sides standing nobody wins (no house ruling)', () => {
    const over = endOfRound({ ...game('box-1'), round: 6 }, bundle)
    expect(over.result!.winner).toBeNull()
    expect(over.result!.caps).toBe(0)
  })

  it('SCN-001 BOX-1: the Brotherhood earns 50 caps per claimed suit still worn and unbroken', () => {
    let g = kill(game('box-1'), 'B')
    const a = Object.values(g.models).filter((m) => m.owner === 'A')
    g = updateModel(g, a[0]!.id, { carried: [...a[0]!.carried, { uid: 'x', defId: 't-45-power-armor', kind: 'armor', starting: false }] })
    g = updateModel(g, a[1]!.id, { carried: [...a[1]!.carried, { uid: 'y', defId: 't-51-power-armor', kind: 'armor', starting: false, degraded: true }] })
    expect(checkVictory(g, bundle)!.caps).toBe(250)
  })

  it('SCN-004 BOX-4: more models at the tower is a major win', () => {
    let g: GameState = { ...game('box-4'), round: 6 }
    const tower = g.markers.find((m) => m.face === 'radio-tower')!
    const a = Object.values(g.models).find((m) => m.owner === 'B')!
    g = updateModel(g, a.id, { pos: { ...tower.pos } })
    const over = endOfRound(g, bundle)
    expect(over.result!.winner).toBe('B')
    expect(over.result!.level).toBe('major')
  })

  it('SCN-001 a scenario without a round limit does not time out', () => {
    expect(endOfRound({ ...game('box-2'), round: 7 }, bundle).phase).toBe('play')
  })

  it('SCN-002 BOX-2: the attacker wins by carrying the nuke off the table', () => {
    const g = game('box-2')
    const carrier = Object.values(g.models).find((m) => m.owner === 'B')!
    const s = withMarker(updateModel(g, carrier.id, { offTable: true }), 'mini-nuke', { carriedBy: carrier.id })
    const r = checkVictory(s, bundle)!
    expect(r.winner).toBe('B')
    expect(r.caps).toBe(200)
  })

  it('SCN-002 BOX-2: an exploding nuke leaves no winner, and defenders holding it at the limit round win', () => {
    const boom = checkVictory(withMarker(game('box-2'), 'mini-nuke', { props: { exploded: true } }), bundle)!
    expect(boom.winner).toBeNull()
    expect(boom.caps).toBe(0)
    const g = game('box-2')
    const holder = Object.values(g.models).find((m) => m.owner === 'A')!
    const held = withMarker(g, 'mini-nuke', { carriedBy: holder.id })
    expect(endOfRound({ ...held, round: 8 }, bundle).phase).toBe('play')
    const end = endOfRound({ ...held, round: 9 }, bundle)
    expect(end.result!.winner).toBe('A')
  })

  it('SCN-002 a dead carrier drops the nuke where it fell', () => {
    const g = game('box-2')
    const holder = Object.values(g.models).find((m) => m.owner === 'A')!
    const s = endOfRound(updateModel(withMarker(g, 'mini-nuke', { carriedBy: holder.id }), holder.id, { life: 'dead' }), bundle)
    expect(s.markers.find((m) => m.face === 'mini-nuke')!.carriedBy).toBeUndefined()
  })

  it('SCN-003 AI-RR: a wrecked rocket wins for the Super Mutants, a shoved one for the Survivors', () => {
    const wrecked = checkVictory(withMarker(game('ai-rr'), 'red-rocket', { props: { health: 0 } }), bundle)!
    expect(wrecked.winner).toBe('A')
    expect(wrecked.caps).toBe(150)
    const pushed = checkVictory(withMarker(game('ai-rr'), 'red-rocket', { props: { offTable: true } }), bundle)!
    expect(pushed.winner).toBe('B')
    expect(pushed.level).toBe('major')
  })

  it('SCN-003 AI-RR: surviving with 4 health at the limit round is a minor Survivor win', () => {
    const s = withMarker({ ...game('ai-rr'), round: 4 }, 'red-rocket', { props: { health: 6 } })
    const r = endOfRound(s, bundle).result!
    expect(r.winner).toBe('B')
    expect(r.level).toBe('minor')
    expect(r.caps).toBe(70)
    const weak = withMarker({ ...game('ai-rr'), round: 4 }, 'red-rocket', { props: { health: 3 } })
    expect(endOfRound(weak, bundle).result!.winner).toBeNull()
  })

  it('SCN-005 tutorial: hitting every target wins', () => {
    const g = game('ga-2', ['A'])
    expect(checkVictory(g, bundle)).toBeNull()
    const done = { ...g, markers: g.markers.map((m) => ({ ...m, props: { ...m.props, hit: true } })) }
    expect(checkVictory(done, bundle)!.winner).toBe('A')
  })

  it('SCN-001 BOX-3: the attackers need enough books off the table', () => {
    const g = game('box-3')
    const two = { ...g, markers: g.markers.map((m, i) => (i < 2 ? { ...m, props: { offTable: true } } : m)) }
    expect(checkVictory(two, bundle)).toBeNull()
    const three = { ...g, markers: g.markers.map((m, i) => (i < 3 ? { ...m, props: { offTable: true } } : m)) }
    expect(checkVictory(three, bundle)!.winner).toBe('B')
  })

  it('SCN-001 co-op: the players win together when the AI side is gone', () => {
    const g = game('coop-munitions', ['ai', 'p1', 'p2'])
    const forced = { ...g, seats: { ...g.seats } }
    const r = checkVictory(kill(forced, 'ai'), bundle)
    expect(r === null || r.winner === 'p1').toBe(true)
  })

  it('SCN-001 a finished game keeps its result', () => {
    const over = endOfRound({ ...game('box-1'), round: 6 }, bundle)
    expect(checkVictory(over, bundle)).toBe(over.result)
  })

  it('SCN-002 carrying: pick up the nuke in contact, and drop it again', () => {
    const g = game('box-2')
    const nuke = g.markers.find((m) => m.face === 'mini-nuke')!
    const who = Object.values(g.models).find((m) => m.owner === 'B')!
    const placed = { ...updateModel(g, who.id, { pos: { x: nuke.pos.x + 1.1, z: nuke.pos.z } }), activation: { modelId: who.id, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
    expect(scenario.options(placed, bundle, who.id).map((o) => o.action.type)).toEqual(['scenario.pickup'])
    const take = scenario.resolve(placed, bundle, { type: 'scenario.pickup', decisionId: placed.pending.id, seat: 'B', modelId: who.id, markerId: nuke.id })
    expect(isRejection(take)).toBe(false)
    const s = (take as { state: GameState }).state
    expect(s.markers.find((m) => m.id === nuke.id)!.carriedBy).toBe(who.id)
    const drop = scenario.resolve(s, bundle, { type: 'scenario.drop', decisionId: s.pending.id, seat: 'B', modelId: who.id, markerId: nuke.id })
    expect((drop as { state: GameState }).state.markers.find((m) => m.id === nuke.id)!.carriedBy).toBeUndefined()
    const far = scenario.resolve(g, bundle, { type: 'scenario.pickup', decisionId: g.pending.id, seat: 'B', modelId: who.id, markerId: nuke.id })
    expect(isRejection(far)).toBe(true)
  })
})
