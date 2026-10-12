// Interaction helpers (owner I): pickable models, drag clamping, ruler readout.
import { describe, expect, it } from 'vitest'
import { clampAlong, pathModelId, pathOption, pickables, readoutText } from '../../src/client/interaction/helpers'
import type { Action, DecisionOption, PendingDecision } from '../../src/engine/types'

const opt = (id: string, type: string, extra: Record<string, unknown> = {}): DecisionOption => ({ id, label: id, action: { type, decisionId: 'd:1', seat: 'A', ...extra } as Action })
const pend = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}): PendingDecision => ({ id: 'd:1', seat: 'A', kind, context, options, canPass: false })

describe('interaction helpers', () => {
  it('I-001 turn.ready options make models clickable and answer on one click', () => {
    const m = pickables(pend('turn.ready', [opt('ready:a1', 'turn.ready', { modelId: 'a1' }), opt('ready:a2', 'turn.ready', { modelId: 'a2' })]))
    expect([...m.keys()]).toEqual(['a1', 'a2'])
    expect(m.get('a1')).toMatchObject({ role: 'select', immediate: true })
  })

  it('I-002 target options group per model; menu entries need a confirm, shoot targets do not', () => {
    const shoot = pickables(pend('shoot.target', [
      opt('b1:short', 'shoot.target', { targetId: 'b1', band: 'short' }), opt('b1:long', 'shoot.target', { targetId: 'b1', band: 'long' }), opt('b2:short', 'shoot.target', { targetId: 'b2' }),
    ]))
    expect(shoot.get('b1')!.options).toHaveLength(2)
    expect(shoot.get('b2')).toMatchObject({ role: 'target', immediate: true })
    const menu = pickables(pend('turn.activation', [opt('charge:b1', 'charge.go', { targetId: 'b1' }), opt('end', 'turn.end'), opt('sh', 'shoot.begin', { weaponUid: 'w' })]))
    expect([...menu.keys()]).toEqual(['b1'])
    expect(menu.get('b1')!.immediate).toBe(false)
    expect(pickables(pend('charge.marker', [opt('black', 'charge.marker', { targetId: 'b1' })])).size).toBe(0)
  })

  it('I-003 clampAlong returns the farthest accepted point on the line', () => {
    const from = { x: 0, z: 0 }, to = { x: 10, z: 0 }
    const c = clampAlong(from, to, (p) => p.x <= 4, 12)
    expect(c.full).toBe(false)
    expect(c.pos.x).toBeGreaterThan(3.9)
    expect(c.pos.x).toBeLessThanOrEqual(4)
    expect(clampAlong(from, to, () => true).full).toBe(true)
    expect(clampAlong(from, to, () => false).moved).toBe(false)
  })

  it('I-004 path options and readout text come from the decision and edition names', () => {
    const p = pend('move.path', [opt('to', 'move.to'), opt('cancel', 'move.cancel')], { modelId: 'a1', colour: 'blue', inches: 8 })
    expect(pathOption(p)?.id).toBe('to')
    expect(pathModelId(p, pathOption(p))).toBe('a1')
    expect(readoutText({ travel: 5.26, colourNeeded: 'yellow', limitColour: 'blue', limitInches: 8, ok: true })).toBe('5.3 in: Yellow ruler of Blue (8.0 in)')
    expect(readoutText({ travel: 20, colourNeeded: null, limitColour: null, limitInches: null, ok: false })).toContain('blocked')
  })
})
