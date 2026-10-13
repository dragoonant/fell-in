// Scenario briefing view helpers, tracker model, start-screen preview and turn-flow tips.
import { describe, expect, it } from 'vitest'
import { buildBriefing, fallbackBriefing, roundsText, trackerView } from '../../src/client/ui/briefingView'
import { TURN_TIPS, promptView } from '../../src/client/ui/promptView'
import { scenarioPreview } from '../../src/client/ui/start/startView'
import type { PendingDecision } from '../../src/engine/types'

const brief = { story: 'A tense standoff.', goals: { a: 'Keep it standing.', b: 'Knock it down.' }, howToWin: ['Score more.'], tips: ['Use cover.'] }
const input = { name: 'Test Scenario', rounds: 4, sideIds: ['a', 'b'], briefing: brief, rules: [{ id: 'r1', text: 'A rule.' }] }
const nm = (s: string) => `Player ${s}`

describe('briefing view', () => {
  it('BRF-001 solo: one "Your goal" row and one enemy row for the AI', () => {
    const m = buildBriefing(input, ['a', 'b'], { a: 'human', b: 'official' }, nm)
    expect(m.goals.map((g) => [g.label, g.text])).toEqual([['Your goal', 'Keep it standing.']])
    expect(m.enemy[0]!.label).toBe('The Wasteland AI will...')
    expect(m.enemy[0]!.text).toBe('Knock it down.')
    expect(m.rounds).toBe('4 rounds')
    expect(m.rules).toHaveLength(1)
  })
  it('BRF-002 hot-seat shows a goal per human seat and a bot as the enemy', () => {
    const m = buildBriefing(input, ['a', 'b'], { a: 'human', b: 'human' }, nm)
    expect(m.goals.map((g) => g.label)).toEqual(["Player a's goal", "Player b's goal"])
    const v = buildBriefing(input, ['a', 'b'], { a: 'human', b: 'bot' }, nm)
    expect(v.enemy[0]!.label).toBe('Enemy goal')
  })
  it('BRF-008 goals follow the engine seat-to-side map, not array index (AI side listed first)', () => {
    const m = buildBriefing({ ...input, sideIds: ['b', 'a'] }, ['H', 'AI'], { H: 'human', AI: 'official' }, nm, { H: 'a', AI: 'b' })
    expect(m.goals[0]!.text).toBe('Keep it standing.')
    expect(m.enemy[0]!.text).toBe('Knock it down.')
  })
  it('BRF-009 preview skips the AI side goal', () => {
    const p = scenarioPreview({ id: 's', name: 'S', mode: 'ai', rounds: 4, sides: 2, sideIds: ['b', 'a'], aiSideId: 'b', briefing: brief })
    expect(p.goal).toBe('Keep it standing.')
  })
  it('BRF-003 a scenario without a briefing gets a fallback built from name and rounds', () => {
    const f = fallbackBriefing('Dust Bowl', 6)
    expect(f.howToWin.join(' ')).toContain('6 rounds')
    const m = buildBriefing({ name: 'Dust Bowl', rounds: null, sideIds: ['a', 'b'] }, ['a', 'b'], { a: 'human', b: 'bot' }, nm)
    expect(m.goals[0]!.text.length).toBeGreaterThan(5)
    expect(m.rounds).toBe(roundsText(null))
    expect(m.rounds).toContain('No round limit')
  })
})

describe('objective tracker view', () => {
  it('BRF-004 bar, check and value lines; round 0 reads as setting up', () => {
    const t = trackerView({
      scenarioId: 'x', name: 'X', round: 0, rounds: 4, markers: [],
      lines: [{ id: 'hp', text: 'Red Rocket Health', value: 7, max: 10 }, { id: 'esc', text: 'Tech escaped', done: true }, { id: 'vp', text: 'Victory points', value: 3 }],
    })
    expect(t.round).toBe('Setting up · 4 rounds')
    expect(t.lines.map((l) => l.kind)).toEqual(['bar', 'check', 'value'])
    expect(t.lines[0]!.pct).toBe(70)
  })
  it('BRF-005 no round limit omits "of n"', () => {
    expect(trackerView({ scenarioId: 'x', name: 'X', round: 3, rounds: 0, markers: [], lines: [] }).round).toBe('Round 3')
  })
})

describe('start preview and prompt tips', () => {
  it('BRF-006 preview uses the first side goal and falls back without a briefing', () => {
    const p = scenarioPreview({ id: 's', name: 'S', mode: 'ai', rounds: 4, sides: 2, sideIds: ['a', 'b'], briefing: brief })
    expect(p).toEqual({ story: 'A tense standoff.', goal: 'Keep it standing.', rounds: '4 rounds' })
    const q = scenarioPreview({ id: 's', name: 'S', mode: 'versus', rounds: null, sides: 2 })
    expect(q.goal.length).toBeGreaterThan(5)
    expect(q.rounds).toContain('No round limit')
  })
  it('BRF-007 turn-flow decisions carry a plain-words tip', () => {
    const n = { name: (s: string) => s, seat: (s: string) => s, humanise: (s: string) => s }
    for (const kind of Object.keys(TURN_TIPS)) {
      const p = { id: 'd', kind, seat: 'A', context: {}, options: [], canPass: false } as unknown as PendingDecision
      expect(promptView(p, n).tip).toBe(TURN_TIPS[kind])
    }
    expect(promptView({ id: 'd', kind: 'react.offer', seat: 'A', context: {}, options: [], canPass: true } as unknown as PendingDecision, n).tip).toBeUndefined()
  })
})
