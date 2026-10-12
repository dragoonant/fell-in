import { describe, expect, it } from 'vitest'
import { formatError, validateBundle } from './validate'
import { emptyBundle } from './bundle'
import { validateDataDir } from '../../tools/validate-data'

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
})
