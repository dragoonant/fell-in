// Pure view helpers for the board and figures (owner P).
import { describe, expect, it } from 'vitest'
import { cameraPose, clampTooltipLeft, deployZones, easeInOut } from '../../src/client/board/layout'
import { terrainInfo } from '../../src/client/board/terrainInfo'
import { facingYaw, lookOf, pipCounts, pipSlots, turnToward } from '../../src/client/figures/view'
import { createDemoGame } from '../../src/engine/setup'

describe('board layout', () => {
  it('draws own-edge strips for seats 0 and 1 and nothing for other deploy records', () => {
    const z = deployZones({ w: 36, d: 36 }, [{ within: 'yellow', of: 'own edge' }, { within: 'yellow', of: 'own edge' }], () => 6)
    expect(z).toEqual([{ seatIndex: 0, x0: -18, x1: 18, z0: 12, z1: 18 }, { seatIndex: 1, x0: -18, x1: 18, z0: -18, z1: -12 }])
    expect(deployZones({ w: 36, d: 36 }, [{ zone: 'edge' }, { within: 'red', of: 'any edge' }], () => 6)).toEqual([])
  })
  it('camera poses scale with the table and ease stays in range', () => {
    expect(cameraPose('near', { w: 72, d: 72 }).pos[2]).toBeCloseTo(60)
    expect(easeInOut(0)).toBe(0); expect(easeInOut(1)).toBe(1); expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(clampTooltipLeft(1200, 1280)).toBe(1280 - 272)
  })
})

describe('figure view', () => {
  it('faces the nearest enemy and turns along the short arc', () => {
    const s = createDemoGame('p')
    const [a] = Object.values(s.models).filter((m) => m.owner === s.seatOrder[0])
    const yaw = facingYaw(s, a!.id, a!.pos)!
    expect(Number.isFinite(yaw)).toBe(true)
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1)
    expect(turnToward(0, 0.2, 0.5)).toBe(0.2)
  })
  it('pips, slots, looks and terrain tooltips', () => {
    expect(pipCounts({ damage: 2, rad: 1 })).toEqual({ damage: 2, rad: 1 })
    expect(pipSlots(3, 1)).toHaveLength(3)
    expect(lookOf({ life: 'down' })).toBe('down'); expect(lookOf({ life: 'active', offTable: true })).toBe('gone')
    const t = createDemoGame('p').terrain[0]!
    expect(terrainInfo(t).lines.length).toBeGreaterThan(0)
  })
})
