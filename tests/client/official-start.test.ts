// Client wiring for the official AI opponent: start screen options, seating, the feed line and the ?seats hook.
import { beforeEach, describe, expect, it } from 'vitest'
import { readParams } from '../../src/client/params'
import { narrate } from '../../src/client/presentation/labels'
import { isBotDecision, isOfficialDecision, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { aiScenarios, buildOptions, officialSeats } from '../../src/client/ui/start/startView'

beforeEach(() => resetGameStore())

describe('official AI client wiring', () => {
  it('COOP-001 team toggle seats one or two people against the AI seat', () => {
    expect(officialSeats(1)).toEqual(['human', 'official'])
    expect(officialSeats(2)).toEqual(['human', 'human', 'official'])
    const o = buildOptions({ scenarioId: 'coop-sewer', mode: 'bot', seed: '', sides: 3, tier: 'official', team: 2 })
    expect(o.seats).toEqual(['human', 'human', 'official'])
  })

  it('SCN-001 the opponent filter keeps only AI and co-op scenarios', () => {
    const list = [
      { id: 'box-1', name: 'a', mode: 'versus', rounds: 6, sides: 2 }, { id: 'ai-rr', name: 'b', mode: 'ai', rounds: null, sides: 2 },
      { id: 'coop-sewer', name: 'c', mode: 'coop', rounds: null, sides: 3 }, { id: 'ga-1', name: 'd', mode: 'tutorial', rounds: null, sides: 1 },
    ]
    expect(aiScenarios(list).map((s) => s.id)).toEqual(['ai-rr', 'coop-sewer'])
  })

  it('AI-015 ?seats=human,official parses and defaults to a solo AI scenario in the store', () => {
    expect(readParams('?seats=human,official').seats).toEqual(['human', 'official'])
    expect(newGame({ seed: 'o1', scenarioId: 'ai-rr', seats: ['human', 'official'] })).toBeNull()
    const g = useGameStore.getState()
    expect(g.seatOrder).toEqual(['A', 'ai'])
    expect(g.controllers).toEqual({ A: 'human', ai: 'official' })
    expect(isBotDecision(g)).toBe(false)
    expect(isOfficialDecision(g)).toBe(false)
  })

  it('AI-015 the feed line names column, die row, response and target', () => {
    newGame({ seed: 'o2', scenarioId: 'ai-rr', seats: ['human', 'official'] })
    const st = useGameStore.getState().state!
    const target = Object.values(st.models).find((m) => m.owner === 'A')!
    const actor = Object.values(st.models).find((m) => m.owner === 'ai')!
    const line = narrate(st, {
      kind: 'note',
      event: { type: 'ai.decision', modelId: actor.id, cell: { columnLabel: 'Close', row: 1, response: 'A' }, performed: 'A', target: { id: target.id, kind: 'model' } },
    })
    expect(line).toMatch(/column Close, die row 2; response: attack; target: /)
  })
})
