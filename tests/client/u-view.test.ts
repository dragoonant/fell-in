// HUD view helpers (owner U): prompt copy per decision kind, feed grouping, formatting.
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../src/client/contract'
import { groupFeed } from '../../src/client/ui/feedView'
import { humaniseLabel, menuGroup, num, pct } from '../../src/client/ui/format'
import { promptView, type Namers } from '../../src/client/ui/promptView'
import { pickedOption } from '../../src/client/ui/uiStore'
import type { DecisionOption, PendingDecision } from '../../src/engine/types'

const names: Record<string, string> = { 'a-1': 'Settler', 'b-1': 'Super Mutant' }
const n: Namers = { name: (id) => names[id] ?? id, seat: (s) => `Player ${s}`, humanise: (l) => humaniseLabel(l, names) }
const o = (id: string, label: string, type: string, extra: Record<string, unknown> = {}): DecisionOption =>
  ({ id, label, action: { type, decisionId: 'd:1', seat: 'A', ...extra } })
const pending = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}): PendingDecision =>
  ({ id: 'd:1', seat: 'A', kind, context, options, canPass: false })

describe('HUD view helpers', () => {
  it('UI-001 every engine decision kind has readable copy and no raw ids', () => {
    const ready = promptView(pending('turn.ready', [o('ready:a-1', 'Ready a-1', 'turn.ready', { modelId: 'a-1' })]), n)
    expect(ready.options[0]!.label).toBe('Ready Settler')
    const first = promptView(pending('turn.first', [o('first:B', 'Seat B takes the first turn', 'turn.first', { firstSeat: 'B' })]), n)
    expect(first.options[0]!.label).toBe('Player B goes first')
    const react = promptView(pending('react.offer', [o('pass', 'Do not react', 'react.pass')], { modelId: 'a-1' }), n)
    expect(react.title).toBe('Settler may react')
    const luck = promptView(pending('shoot.luck', [o('use', 'x', 'shoot.luck', { use: true }), o('keep', 'y', 'shoot.luck', { use: false })], { ask: 'dodge', targetId: 'b-1' }), n)
    expect(luck.options.map((x) => x.label)).toEqual(['Spend the token', 'Keep the token'])
    expect(luck.hint).toContain('Super Mutant')
    const unknown = promptView(pending('weird.kind', [o('x', 'Pick b-1', 'weird')]), n)
    expect(unknown.title).toBe('Weird kind')
    expect(unknown.options[0]!.label).toBe('Pick Super Mutant')
  })

  it('UI-002 target and path decisions pick the matching form; move.to is hidden from the path form', () => {
    const t = promptView(pending('shoot.target', [o('b-1:short', 'Fire', 'shoot.target', { targetId: 'b-1' })], { modelId: 'a-1' }), n)
    expect(t.form).toBe('targets')
    const p = promptView(pending('move.path', [o('to', 'Move here', 'move.to'), o('cancel', 'Cancel', 'move.cancel')], { modelId: 'a-1', inches: 6, colour: 'green' }), n)
    expect(p.form).toBe('path')
    expect(p.options.map((x) => x.id)).toEqual(['cancel'])
    expect(p.hint).toContain('6 in')
    expect(menuGroup('quick:move', 'move.go')).toBe('quick')
    expect(menuGroup('end', 'turn.end')).toBe('end')
  })

  it('UI-003 the feed folds dice and damage under their attack', () => {
    const e = (id: number, cue: FeedEntry['cue'], text: string | null): FeedEntry => ({ id, seq: id, cue, text })
    const rows = groupFeed([
      e(1, { kind: 'move', modelId: 'a-1', points: [] }, 'Settler moves.'),
      e(2, { kind: 'attack', attackerId: 'a-1', targetId: 'b-1', weaponId: 'laser', ns: 'shoot', success: true, critical: false, sv: 9, result: null }, 'Settler hits.'),
      e(3, { kind: 'dice', purpose: 'shoot:a-1', ownerId: 'a-1', dice: [{ role: 'skill', sides: 20, face: 4, reroll: false, rollId: 'r' }], rolls: [] }, null),
      e(4, { kind: 'damage', targetId: 'b-1', applied: 3, removed: true, direct: false }, 'Super Mutant takes 3 damage.'),
    ], { name: (id) => names[id] ?? id, roll: () => 'Ranged attack', data: (id) => id })
    expect(rows).toHaveLength(2)
    expect(rows[1]!.tone).toBe('loss')
    expect(rows[1]!.lines).toEqual(['laser against SV 9', 'Ranged attack: 1 die', 'Super Mutant takes 3 damage.'])
  })

  it('UI-004 number words and target pick fallback', () => {
    expect(pct(0.004)).toBe('<1%')
    expect(pct(0.996)).toBe('99%')
    expect(pct(0.5)).toBe('50%')
    expect(num(2.04)).toBe('2')
    expect(pickedOption(null, 'd:1', ['a', 'b'])).toBe('a')
    expect(pickedOption({ decisionId: 'd:1', optionId: 'b' }, 'd:1', ['a', 'b'])).toBe('b')
    expect(pickedOption({ decisionId: 'd:0', optionId: 'b' }, 'd:1', ['a', 'b'])).toBe('a')
  })
})
