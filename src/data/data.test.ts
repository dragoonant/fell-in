import { describe, expect, it } from 'vitest'
import { formatError, validateBundle } from './validate'
import { emptyBundle } from './bundle'
import { checkBriefings, validateDataDir } from '../../tools/validate-data'
import type { ScenarioDef } from './types'

describe('data', () => {
  it('DATA-001 every record validates', () => {
    expect(validateDataDir().map(formatError)).toEqual([])
  })

  it('DATA-002 ids are unique', () => {
    const b = emptyBundle('fixture')
    const faction = { id: 'survivors', name: 'Survivors', rules: [], source: 'fixture' }
    b.records.factions.push(faction, { ...faction })
    b.origin.survivors = 'fixture/factions/a.json'
    const errs = validateBundle(b)
    expect(errs.map((e) => e.message)).toContain('duplicate id (2 records)')
  })

  it('DATA-003 every scenario has a briefing with a goal per side', () => {
    const scen = (briefing?: ScenarioDef['briefing']): ScenarioDef => ({
      id: 'fixture-scen', name: 'Fixture', mode: 'versus', tableIn: [36, 36], rounds: 6,
      sides: [{ id: 'a', deploy: {} }, { id: 'b', deploy: {} }], markers: [], rules: [], victory: [], briefing, source: 'fixture',
    })
    const b = emptyBundle('fixture')
    b.records.scenarios.push(scen())
    expect(checkBriefings(b).map((e) => e.path)).toEqual(['briefing'])
    b.records.scenarios[0] = scen({ story: 'S.', goals: { a: 'Win.', c: 'x' }, howToWin: ['One.'], tips: [] })
    expect(checkBriefings(b).map((e) => e.path).sort()).toEqual(['briefing.goals.b', 'briefing.goals.c', 'briefing.howToWin', 'briefing.tips'])
    b.records.scenarios[0] = scen({ story: 'S.', goals: { a: 'Win.', b: 'Win too.' }, howToWin: ['One.', 'Two.'], tips: ['Tip.'] })
    expect(checkBriefings(b)).toEqual([])
  })
})
