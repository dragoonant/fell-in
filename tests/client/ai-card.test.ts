import { describe, expect, it } from 'vitest'
import { aiCardRows, latestAiDecision } from '../../src/client/ui/aiCardView'

describe('AI card panel view', () => {
  it('AI-015 shows column, die row, response and target of the latest decision', () => {
    const ev = { type: 'ai.decision', modelId: null, cell: { columnLabel: 'B', row: 2, response: 'O' }, performed: 'A', target: { id: 'm9', kind: 'marker' } }
    const feed = [{ id: 1, cue: { kind: 'note', event: ev } }] as never
    const row = aiCardRows(null, latestAiDecision(feed)!)!
    expect(row).toMatchObject({ column: 'B', row: '3', target: 'a marker' })
    expect(row.response).toContain('turned into')
    expect(latestAiDecision([])).toBeNull()
  })
})
