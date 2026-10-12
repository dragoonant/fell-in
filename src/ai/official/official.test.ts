// Official AI scaffold tests (spec 18 s8). The response layer is stubbed at the M4b freeze, so activations fall back.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../../tests/engine/helpers'
import type { AiCardDef } from '../../data/types'
import { apply } from '../../engine/apply'
import { legalActions } from '../../engine/pending'
import { createGame } from '../../engine/setup'
import type { Action, GameState } from '../../engine/types'
import { view } from '../../engine/view'
import { createOfficialAiDecider, makeOfficialContext, newOfficialMemory } from './decider'
import { aiNumbers, blueFaceKey, findColumn, findRow, parseColumnWhen, readCell } from './procedure'
import { normalizeFactor } from './targeting'
import { AI_TRACE_FIELD, type AiTrace } from './types'

const bundle = loadBundle()

const card: AiCardDef = {
  id: 'ai-test', unitId: 'test', standardEquipment: [],
  columns: [{ label: '4+', when: { other: 'health:4+' } }, { label: '1-3', when: { other: 'health:1-3' } }],
  rows: [
    { blueIcons: ['BOT', 'BOT2', 'BOT+STAR'], cells: [{ response: 'O', reckless: false, stayEngaged: false }, { response: 'A', reckless: true, stayEngaged: true }], method: ['ranged'] },
    { blueIcons: ['STAR', 'STAR2'], cells: [{ response: 'A', reckless: false, stayEngaged: false }, { response: 'M', reckless: false, stayEngaged: false }], method: ['close'] },
    { blueIcons: ['BLAST'], cells: [{ response: 'A', reckless: true, stayEngaged: false }, { response: 'F', reckless: false, stayEngaged: false }], method: ['ranged', 'close'] },
  ],
  targetPriority: ['Nearest', 'Ready'], source: 'test fixture',
}

function run(seed: string, cap = 400) {
  let state: GameState = createGame(bundle, { seed, scenarioId: 'box-1' })
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createOfficialAiDecider(bundle, { seed: `${seed}:${s}`, accepts: (a: Action) => apply(state, bundle, a).ok, budgetMs: 200 })]))
  const log: Action[] = []
  for (let n = 0; n < cap && state.phase !== 'over'; n++) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const { action } = ds[seat]!.decideSync(view(state, seat), p, legalActions(state))
    const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
    if (!r.ok) throw new Error(`rejected ${action.type}: ${r.rejection.message}`)
    state = r.state; log.push(action)
  }
  return { state, log }
}

describe('official AI scaffold (spec 18 s8)', () => {
  it('AI-002 column predicates and blue-die rows', () => {
    expect(parseColumnWhen({ other: 'health:8+' })).toEqual({ kind: 'health', lo: 8, hi: null })
    expect(parseColumnWhen({ other: 'health:4-7' })).toEqual({ kind: 'health', lo: 4, hi: 7 })
    expect(parseColumnWhen({ damageTaken: [0, 2] })).toEqual({ kind: 'damageTaken', lo: 0, hi: 2 })
    expect(blueFaceKey(['BOT', 'STAR'])).toBe('BOT+STAR')
    expect(blueFaceKey(['STAR', 'STAR'])).toBe('STAR2')
    expect(findRow(card, { faceIndex: 0, face: 'BLAST', icons: ['BLAST'] })).toBe(2)
    const loose: AiCardDef = { ...card, rows: card.rows.map((r) => ({ ...r, blueIcons: r.blueIcons.filter((b) => b === 'BOT' || b === 'STAR' || b === 'BLAST') })) }
    expect(findRow(loose, { faceIndex: 0, face: 'STAR2', icons: ['STAR', 'STAR'] })).toBe(1) // R-8
  })

  it('AI-002 readCell is fixed by seed and key, column by Health left', () => {
    const state = createGame(bundle, { seed: 'cell', scenarioId: 'box-1' })
    const seat = state.seatOrder[0]!
    const v = view(state, seat)
    const ctx = makeOfficialContext(bundle, { seed: 'cell' }, newOfficialMemory(), v, state.pending, legalActions(state))
    const id = Object.values(v.models).find((m) => m.owner === seat)!.id
    expect(findColumn(ctx, card, id)).toBe(0) // undamaged models have 4+ Health left in box-1
    const a = readCell(ctx, card, id, `1:${id}`), b = readCell(ctx, card, id, `1:${id}`)
    expect(a).toEqual(b)
    expect(a.roll).not.toBeNull()
    expect(readCell(ctx, card, id, `1:${id}`, 'O')).toMatchObject({ roll: null, response: 'O', forced: 'O' })
  })

  it('AI-001 numbers, token draw, use all, lowest number first; AI-015 trace on every answer', () => {
    const { log } = run('order')
    const ready = log.filter((a) => a.type === 'turn.ready')
    expect(ready.length).toBeGreaterThan(0)
    expect(log.some((a) => a.type === 'turn.useNone')).toBe(false)
    for (const a of log) expect((a[AI_TRACE_FIELD] as AiTrace).decisionId).toBe(a.decisionId)
    const tok = (ready[0]![AI_TRACE_FIELD] as AiTrace).entries.find((e) => e.kind === 'token')
    expect(tok).toBeTruthy()
  })

  it('AI-015 determinism: same seed gives the same action log', () => {
    const a = run('det', 200).log.map((x) => JSON.stringify(x))
    const b = run('det', 200).log.map((x) => JSON.stringify(x))
    expect(a).toEqual(b)
  })

  it('AI-010 priority names normalise (Ready = Prepared, ERR p.18)', () => {
    expect(normalizeFactor('Ready')).toBe('prepared')
    expect(normalizeFactor('Best Chance')).toBe('bestChance')
    expect(normalizeFactor('Nearest')).toBe('nearest')
    expect(normalizeFactor('Mystery')).toBeNull()
    const state = createGame(bundle, { seed: 'n', scenarioId: 'box-1' })
    const nums = aiNumbers(view(state, state.seatOrder[0]!), state.seatOrder[0]!)
    expect(Object.values(nums).sort()).toEqual(Object.values(nums).map((_, i) => i + 1).sort())
  })
})
