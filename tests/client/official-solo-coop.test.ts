// Solo and Co-op against the official AI: start screen mapping, brain wiring, traces and the AI card panel view model.
import { afterEach, describe, expect, it } from 'vitest'
import { createOfficialBrain } from '../../src/client/bot/officialBrain'
import { launchOfficial } from '../../src/client/bot/botDriver'
import { useAiPanelStore } from '../../src/client/bot/aiPanelStore'
import { applyTrace, describeActivity, describePick, emptyPanel, traceOf } from '../../src/client/bot/officialView'
import { dispatch, isBotDecision, legalFor, newGame, ownerSeat, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { aiViewOf } from '../../src/ai/world'
import type { ScenarioChoice } from '../../src/client/store/launch'
import { buildOptions, modeForScenario, scenarioForMode, seatsFor } from '../../src/client/ui/start/startView'
import type { AiTrace, MatrixPick } from '../../src/ai/official/types'

const sc = (id: string, mode: string): ScenarioChoice => ({ id, name: id, mode, rounds: null, sides: 2 })
const pick: MatrixPick = {
  cardId: 'ai-super-mutant', modelId: 'm-1', column: 1, columnLabel: 'health:5+', roll: { faceIndex: 3, face: 'BOT', icons: ['BOT'] },
  row: 2, response: 'A', attitude: 'reckless', stayEngaged: true, method: ['close'],
}
const trace: AiTrace = {
  decisionId: 'd:1', seat: 'A',
  entries: [
    { kind: 'matrix', pick },
    { kind: 'activity', modelId: 'm-1', action: 1, activity: { kind: 'charge', as: 'A', targetId: 'p-1', reason: 'nearest enemy' } },
  ],
}

afterEach(() => { resetGameStore(); useAiPanelStore.getState().reset() })

describe('Solo and Co-op (official AI)', () => {
  it('COOP-101 start screen modes seat the AI first and flag the official brain', () => {
    expect(seatsFor('solo')).toEqual(['bot', 'human'])
    expect(seatsFor('coop', 3)).toEqual(['bot', 'human', 'human'])
    expect(buildOptions({ scenarioId: 'ai-rr', mode: 'solo', seed: '', sides: 2 })).toEqual({ official: true, scenarioId: 'ai-rr', seats: ['bot', 'human'] })
    expect('official' in buildOptions({ scenarioId: 'box-1', mode: 'bot', seed: '', sides: 2 })).toBe(false)
    const list = [sc('box-1', 'versus'), sc('ai-rr', 'ai'), sc('coop-cage', 'coop')]
    expect(modeForScenario(list[1])).toBe('solo')
    expect(scenarioForMode(list, 'coop', 'box-1')).toBe('coop-cage')
    expect(scenarioForMode(list, 'bot', 'ai-rr')).toBe('box-1')
  })

  it('AI-101 the trace becomes plain-words panel lines', () => {
    const panel = applyTrace(emptyPanel(), trace)
    expect(panel.pick?.modelId).toBe('m-1')
    expect(panel.activities).toHaveLength(1)
    const lines = describePick(pick, () => 'Super Mutant')
    expect(lines.unit).toBe('Super Mutant')
    expect(lines.response).toBe('A: Attack')
    expect(lines.roll).toContain('BOT')
    expect(describeActivity(panel.activities[0]!.activity, () => 'Settler')).toContain('charges Settler')
    expect(traceOf({ type: 'x', aiTrace: trace } as never)).toBe(trace)
    expect(traceOf({ type: 'x' } as never)).toBeNull()
  })

  it('AI-102 the official brain answers an AI scenario decision with a trace and feeds the panel', async () => {
    expect(newGame({ seed: 'official-1', seats: ['bot', 'human'], scenarioId: 'ai-rr' })).toBeNull()
    expect(launchOfficial()).toBe(true)
    const brain = createOfficialBrain()
    let answered = 0
    for (let i = 0; i < 60 && useGameStore.getState().state?.phase !== 'over'; i++) {
      const s = useGameStore.getState()
      const p = s.state!.pending
      const seat = ownerSeat(p, s)!
      const legal = legalFor(s.state)
      if (isBotDecision(s)) {
        const a = await brain(aiViewOf(s.state!, seat), p, legal, { seed: s.seed, budgetMs: 500, accepts: () => true })
        expect(traceOf(a)).not.toBeNull()
        expect(dispatch(p.seat === 'all' ? { ...a, seat } : a, 'bot')).toBeNull()
        answered++
      } else {
        expect(dispatch(legal.find((x) => x.type !== 'move.to') ?? legal[0]!, 'human')).toBeNull()
      }
    }
    brain.dispose()
    expect(answered).toBeGreaterThan(0)
    expect(useAiPanelStore.getState().panel.rev).toBeGreaterThan(0)
  })
})
