import { describe, expect, it } from 'vitest'
import { baseRadius, edgeDistance, findPlacementNear, isLegalPlacement, sweepStraight, validateAdvancePath } from '../../src/engine/geometry'
import { completelyWithin, within } from '../../src/engine/measure'
import { mdl, ter, world } from './helpers'

describe('geometry and measurement', () => {
  it('GEOM-001 edge distance is base edge to base edge; exactly-d counts as within', () => {
    const r = baseRadius(32)
    expect(edgeDistance({ x: 0, z: 0 }, 32, { x: 2 * r + 3, z: 0 }, 32)).toBeCloseTo(3, 9)
    const a = mdl('a', 0, 0), b = mdl('b', 2 * r + 3, 0)
    expect(within(a, b, 3)).toBe(true)
    expect(within(a, b, 2.99)).toBe(false)
    expect(completelyWithin(b, a, 3 + 2 * r)).toBe(true)
    expect(completelyWithin(b, a, 3 + 2 * r - 0.1)).toBe(false)
  })

  it('GEOM-002 a sweep stops at first contact with another base', () => {
    const s = world([mdl('m', 0, 0), mdl('t', 10, 0)])
    const r = sweepStraight(s, 'm', { x: 1, z: 0 }, 20)
    expect(r.stoppedBy).toEqual({ kind: 'model', id: 't' })
    expect(r.travelled).toBeCloseTo(10 - 2 * baseRadius(32), 6)
  })

  it('GEOM-003 a sweep stops on an obstacle unless it ignores obstacles; buildings always stop', () => {
    const s = world([mdl('m', 0, 0)], [ter('w', 'obstacle', 6, 0, 1, 10, 0.75)])
    expect(sweepStraight(s, 'm', { x: 1, z: 0 }, 12).stoppedBy.kind).toBe('obstacle')
    expect(sweepStraight(s, 'm', { x: 1, z: 0 }, 12, { obstacles: 'ignore' }).stoppedBy.kind).toBe('maxDist')
    const b = world([mdl('m', 0, 0)], [ter('b', 'building', 6, 0, 4, 4, 3)])
    expect(sweepStraight(b, 'm', { x: 1, z: 0 }, 12, { obstacles: 'ignore' }).stoppedBy.kind).toBe('obstruction')
  })

  it('GEOM-004 a sweep stops at the 36 in table edge', () => {
    const r = sweepStraight(world([mdl('m', 0, 0)]), 'm', { x: 1, z: 0 }, 40)
    expect(r.stoppedBy.kind).toBe('edge')
    expect(r.end.x).toBeCloseTo(18 - baseRadius(32), 6)
  })

  it('GEOM-005 advance paths are blocked by bases and placement avoids terrain', () => {
    const blocked = world([mdl('m', 0, 0), mdl('o', 3, 0)])
    expect(validateAdvancePath(blocked, 'm', [{ x: 6, z: 0 }], 8).code).toBe('E_PATH_BLOCKED')
    const s = world([mdl('m', 0, 0)], [ter('b', 'building', 5, 0, 4, 4, 3)])
    expect(isLegalPlacement(s, 'm', { x: 5, z: 0 }, 32).ok).toBe(false)
    const near = findPlacementNear(s, 'm', { x: 5, z: 0 })
    expect(near).not.toBeNull()
    expect(isLegalPlacement(s, 'm', near!, 32).ok).toBe(true)
  })
})
