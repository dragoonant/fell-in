// Objective status for the HUD: derived from the PlayerView only (owner feedback, scenario clarity).
import { describe, expect, it } from 'vitest'
import { objectiveStatus } from '../../src/engine/query'
import { createGame } from '../../src/engine/setup'
import { view } from '../../src/engine/view'
import type { GameState } from '../../src/engine/types'
import { loadBundle } from './helpers'

const bundle = loadBundle()
const game = (scenarioId: string, seats: string[]): GameState => ({
  ...createGame(bundle, { seed: 'os', scenarioId, seats, controllers: Object.fromEntries(seats.filter((x) => x !== 'ai').map((x) => [x, 'bot' as const])) }),
  phase: 'play', round: 2,
})

describe('OBJ-001 objectiveStatus', () => {
  it('OBJ-001 box-1: name, round, model counts, power armor markers', () => {
    const s = game('box-1', ['A', 'B'])
    const st = objectiveStatus(view(s, 'A'))!
    expect(st.name).toBe('Ad Victoriam')
    expect(st.round).toBe(2)
    expect(st.rounds).toBe(6)
    const yours = st.lines.find((l) => l.id === 'yours')!
    expect(yours.value).toBeGreaterThan(0)
    expect(st.lines.find((l) => l.id === 'enemy')!.value).toBeGreaterThan(0)
    expect(st.markers.filter((m) => m.label === 'Power armor')).toHaveLength(3)
    expect(st.lines.find((l) => l.id === 'suits')!.value).toBe(3)
  })

  it('OBJ-002 ai-rr: rocket Health drops after damage and a wrecked rocket reads done', () => {
    const s = game('ai-rr', ['ai', 'p1'])
    const before = objectiveStatus(view(s, 'p1'))!.lines.find((l) => l.id === 'red-rocket-health')!
    expect(before.value).toBe(10)
    expect(before.max).toBe(10)
    const hit: GameState = { ...s, markers: s.markers.map((m) => (m.face === 'red-rocket' ? { ...m, props: { ...m.props, health: 7 } } : m)) }
    const after = objectiveStatus(view(hit, 'p1'))!
    expect(after.lines.find((l) => l.id === 'red-rocket-health')!.value).toBe(7)
    expect(after.markers.find((m) => m.label === 'Red Rocket')).toBeTruthy()
    expect(after.markers.find((m) => m.label === 'Diner')).toBeTruthy()
    const dead: GameState = { ...s, markers: s.markers.map((m) => (m.face === 'red-rocket' ? { ...m, props: { ...m.props, health: 0, destroyed: true } } : m)) }
    expect(objectiveStatus(view(dead, 'p1'))!.lines.find((l) => l.id === 'red-rocket-health')!.done).toBe(true)
  })

  it('OBJ-003 coop-sewer: locks, escapes and rounds; hidden marker faces do not leak', () => {
    const s = game('coop-sewer', ['ai', 'p1', 'p2'])
    const st = objectiveStatus(view(s, 'p1'))!
    expect(st.rounds).toBe(8)
    expect(st.lines.find((l) => l.id === 'locks')!.value).toBe(2)
    expect(st.lines.find((l) => l.id === 'escaped')!.value).toBe(0)
    expect(st.markers.some((m) => m.label === 'Sewer hatch')).toBe(true)
    expect(st.markers.some((m) => m.label === 'Key')).toBe(false)
    expect(st.markers.some((m) => m.label === 'Unknown marker')).toBe(false)
    expect(st.markers.filter((m) => m.label === 'Emergency box').length).toBeGreaterThan(0)
    const hero = Object.values(s.models).find((m) => m.owner !== 'ai')!
    const out: GameState = { ...s, scenario: { ...s.scenario, exited: [hero.id] } as GameState['scenario'] }
    expect(objectiveStatus(view(out, 'p1'))!.lines.find((l) => l.id === 'escaped')!.value).toBe(1)
  })

  it('OBJ-004 no scenario gives null', () => {
    const s = game('box-1', ['A', 'B'])
    expect(objectiveStatus({ ...view(s, 'A'), scenarioId: null })).toBeNull()
  })
})
