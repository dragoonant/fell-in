// Official AI regression tests: card lookup, marker Subjects, close-ladder targets, confirmed photo cards (spec 18 s8).
import { describe, expect, it } from 'vitest'
import { cardFor } from '../../src/ai/official/decider'
import { forcedResponse, markerName, resolveSubject } from '../../src/ai/official/procedure'
import type { OfficialContext } from '../../src/ai/official/types'
import { newOfficialMemory } from '../../src/ai/official/decider'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()
const mkCtx = (scenarioId: string, markers: unknown[], models: Record<string, unknown> = {}): OfficialContext =>
  ({ bundle, seat: 'A', opts: { seed: 's', scenarioId }, official: newOfficialMemory(), trace: { entries: [] }, view: { models, markers, scenarioId } }) as unknown as OfficialContext

describe('official AI fixes', () => {
  it('AI-020 a Settler gets its own card, not the generic one', () => {
    expect(cardFor(bundle, 'settler')?.id).toBe('ai-settler')
    expect(cardFor(bundle, 'no-such-unit')?.id).toBe('ai-generic')
  })

  it('AI-021 the photo cards carry the confirmed cells and gear', () => {
    const ss = cardFor(bundle, 'sole-survivor')!
    expect(ss.standardEquipment).toEqual(['hunting-rifle'])
    expect(ss.rows[2]!.cells[1]).toMatchObject({ response: 'F', reckless: true, stayEngaged: true })
    const dc = cardFor(bundle, 'deathclaw')!
    expect(dc.rows.every((r) => r.method.length === 1 && r.method[0] === 'close')).toBe(true)
    expect(dc.rows[1]!.cells.map((c) => c.response)).toEqual(['A', 'F', 'F'])
  })

  it('AI-022 object markers resolve by their scenario face even though the view hides it', () => {
    const k = { id: 'marker-1', kind: 'object', pos: { x: 0, z: 0 }, revealed: false, seenBy: [], props: {} }
    const ctx = mkCtx('ai-missile', [k])
    expect(markerName(ctx, k as never)).toBe('missile-sled')
    expect(resolveSubject(ctx, 'x', 'missile-sled').markers).toEqual(['marker-1'])
  })

  it('AI-023 nearest-investigation-marker finds unrevealed investigation markers', () => {
    const me = { id: 'm1', owner: 'A', pos: { x: 0, z: 0 }, life: 'active' }
    const ks = [1, 2].map((i) => ({ id: `marker-${i}`, kind: 'investigation', pos: { x: i * 3, z: 0 }, revealed: false, seenBy: [], props: {} }))
    const set = resolveSubject(mkCtx('ai-tech', ks, { m1: me }), 'm1', 'nearest-investigation-marker')
    expect(set.markers).toEqual(['marker-1'])
  })

  it('AI-024 Tech-scenario hounds always answer O without a roll', () => {
    const hound = { id: 'h1', owner: 'A', profileId: 'mutant-hound', pos: { x: 0, z: 0 }, life: 'active' }
    expect(forcedResponse(mkCtx('ai-tech', [], { h1: hound }), 'h1')).toBe('O')
  })
})
