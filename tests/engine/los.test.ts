import { describe, expect, it } from 'vitest'
import { losReport } from '../../src/engine/los'
import { mdl, ter, world } from './helpers'

describe('line of sight', () => {
  it('LOS-001 clear in the open; a model of at least the target size in the way blocks', () => {
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' })]), 'a', 'b').visible).toBe(true)
    const wide = world([mdl('a', 0, 0), mdl('m', 5, 0, { base: 80 }), mdl('b', 10, 0, { owner: 'B', base: 80 })])
    const r = losReport(wide, 'a', 'b')
    expect(r.visible).toBe(false)
    expect(r.reasons).toContain('model')
  })

  it('LOS-002 a tall building blocks and says why; a low wall does not', () => {
    const s = world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [ter('bld', 'building', 6, 0, 3, 12, 4)])
    const r = losReport(s, 'a', 'b')
    expect(r.visible).toBe(false)
    expect(r.blockers).toContain('bld')
    expect(r.why).toMatch(/terrain/)
    const wall = world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [ter('w', 'obstacle', 6, 0, 0.5, 12, 0.75)])
    expect(losReport(wall, 'a', 'b').visible).toBe(true)
  })

  it('LOS-003 forest blocks when both ends are outside it', () => {
    const forest = ter('f', 'forest', 6, 0, 2, 20, 4)
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [forest]), 'a', 'b').reasons).toContain('forestDepth')
  })
})
