// Pure helpers for scenario markers and deploy zones on the table.
import { describe, expect, it } from 'vitest'
import { isRouteFlag, markerHidden, markerRect, objectEntryFor } from '../../src/client/board/markerLook'
import { zonePolys } from '../../src/client/board/zoneShapes'
import { parseManifest } from '../../src/client/figures/glbModels'
import { loadBundle } from '../engine/helpers'

const manifest = parseManifest({ objects: { 'power-armor': {}, nuke: {}, tower: {}, 'red-rocket': { lengthIn: 4 } } })

describe('board markers', () => {
  it('maps scenario faces to manifest object keys through aliases', () => {
    for (const f of ['power-armor-suit', 'mini-nuke', 'radio-tower', 'red-rocket']) expect(objectEntryFor(manifest, f)).toBeDefined()
    expect(objectEntryFor(manifest, 'book')).toBeUndefined()
    expect(objectEntryFor(manifest, undefined)).toBeUndefined()
  })
  it('hides destroyed, off-table, freed and claimed markers', () => {
    for (const k of ['destroyed', 'offTable', 'freed', 'claimed']) expect(markerHidden({ props: { [k]: true } })).toBe(true)
    expect(markerHidden({ props: { claimed: false } })).toBe(false)
  })
  it('turns the long axis the engine way and flags route waypoints', () => {
    const r = markerRect({ props: { lengthIn: 4, widthIn: 1.5, rotDeg: 90 } })!
    expect(r.length).toBe(4)
    expect(r.yaw).toBeCloseTo(-Math.PI / 2)
    expect(markerRect({ props: { baseMm: 40 } })).toBeNull()
    expect(isRouteFlag({ props: { route: { id: 1, step: 2 } } })).toBe(true)
    expect(isRouteFlag({ props: {} })).toBe(false)
  })
})

describe('board zone shapes', () => {
  const bundle = loadBundle()
  const f = { w: 36, d: 36 }
  const none = () => null
  it('draws boxes, triangles, edge strips and discs inside the table', () => {
    const box = zonePolys(bundle, f, { kind: 'box', corner: 'nw', w: 24, d: 'orange' }, none, none)[0]!
    expect(box.pts).toHaveLength(4)
    expect(Math.min(...box.pts.map((p) => p.x))).toBe(-18)
    expect(zonePolys(bundle, f, { kind: 'triangle', corner: 'se', w: 'blue', d: 'blue' }, none, none)[0]!.pts).toHaveLength(3)
    expect(zonePolys(bundle, f, { kind: 'edges', edges: ['n', 's'], within: 'yellow' }, none, none)).toHaveLength(2)
    const disc = zonePolys(bundle, f, { kind: 'disc', centre: { corner: 'sw', inset: [1, 1] }, within: 0.4 }, none, none)[0]!
    expect(disc.fill).toBe(true)
    expect(zonePolys(bundle, f, { kind: 'table' }, none, none)).toEqual([])
  })
  it('draws a ring zone as an outline around a piece', () => {
    const sh = { kind: 'poly' as const, pts: [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 2 }, { x: -3, z: 2 }] }
    const ring = zonePolys(bundle, f, { kind: 'ring', of: 'diner', gap: 3 }, none, () => sh)[0]!
    expect(ring.fill).toBe(false)
    expect(ring.pts.length).toBeGreaterThan(30)
    expect(zonePolys(bundle, f, { kind: 'ring', of: 'missing', gap: 3 }, none, none)).toEqual([])
  })
})
