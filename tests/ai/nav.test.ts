// Navigation grid and move planning (spec 30 s6): routes go round terrain and the engine accepts them.
import { describe, expect, it } from 'vitest'
import { makeContext } from '../../src/ai/decider'
import { engageGap, freeSpot, navRoute } from '../../src/ai/moves'
import { fieldAt, navField, navGrid, pathLength, routeDown } from '../../src/ai/nav'
import { activationMenu } from '../../src/ai/policies'
import { newMemory } from '../../src/ai/types'
import { observeRound, roundOf } from '../../src/ai/world'
import { apply } from '../../src/engine/apply'
import { baseRadius } from '../../src/engine/geometry'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()

/** Step the game with the first legal answer until a move.path decision is open. */
function toMovePath(state: GameState): GameState {
  let s = state
  for (let i = 0; i < 40 && s.pending.kind !== 'move.path'; i++) {
    const legal = legalActions(s)
    const pick = legal.find((a) => a.type === 'move.go') ?? legal.find((a) => a.type !== 'turn.end') ?? legal[0]!
    const seat = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
    const r = apply(s, bundle, s.pending.seat === 'all' ? { ...pick, seat } : pick)
    if (!r.ok) break
    s = r.state
  }
  return s
}

describe('AI navigation (spec 30 s6)', () => {
  it('NAV-001 the walking field is finite on open ground and the route stays inside its length', () => {
    for (const scenarioId of ['box-1', 'box-3', 'box-4']) {
      const s = createGame(bundle, { seed: 'nav1', scenarioId })
      const me = Object.values(s.models).find((m) => m.owner === s.seatOrder[0])!
      const foes = Object.values(s.models).filter((m) => m.owner !== me.owner).map((m) => m.pos)
      const g = navGrid(s, baseRadius(me.base))
      const f = navField(g, foes)
      const d = fieldAt(f, me.pos)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeGreaterThan(0)
      const route = routeDown(f, me.pos, 6)
      expect(route).not.toBeNull()
      expect(pathLength(me.pos, route!)).toBeLessThanOrEqual(6 + 1e-6)
      // Every waypoint gets closer to the enemy by walking distance.
      expect(fieldAt(f, route![route!.length - 1]!)).toBeLessThan(d)
    }
  })

  it('NAV-002 navRoute answers a move.path decision with a path the engine accepts', () => {
    let checked = 0
    for (const scenarioId of ['box-1', 'box-2', 'box-3', 'box-4', 'box-5']) {
      const s = toMovePath(createGame(bundle, { seed: `nav2:${scenarioId}`, scenarioId }))
      if (s.pending.kind !== 'move.path') continue
      const seat = s.pending.seat as string
      const legal = legalActions(s)
      const ctx = makeContext('normal', view(s, seat), s.pending, legal, { seed: 'n', bundle, accepts: (a: Action) => apply(s, bundle, a).ok, budgetMs: 10_000 }, newMemory())
      const tpl = legal.find((a) => a.type === 'move.to')!
      const id = (s.pending.context as { modelId: string }).modelId
      const c = s.pending.context as { inches?: number; baseInches?: number }
      const route = navRoute(ctx, tpl, id, (c.inches ?? 0) + (c.baseInches ?? 0))
      if (!route) continue
      expect(apply(s, bundle, { ...tpl, path: route }).ok).toBe(true)
      expect(engageGap(ctx, id, route[route.length - 1]!)).toBeLessThanOrEqual(engageGap(ctx, id, s.models[id]!.pos) + 1e-6)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('NAV-003 a move never ends on or touching another base', () => {
    const s = toMovePath(createGame(bundle, { seed: 'nav3', scenarioId: 'box-1' }))
    const seat = s.pending.seat as string
    const ctx = makeContext('normal', view(s, seat), s.pending, legalActions(s), { seed: 'n', bundle, budgetMs: 10_000 }, newMemory())
    const id = (s.pending.context as { modelId: string }).modelId
    const other = Object.values(s.models).find((m) => m.id !== id)!
    expect(freeSpot(ctx, id, other.pos)).toBe(false)
    expect(freeSpot(ctx, id, { x: other.pos.x + baseRadius(other.base) + baseRadius(s.models[id]!.base) + 0.3, z: other.pos.z })).toBe(true)
  })

  it('NAV-004 the round tracker counts a new round when a Used model is Unready again', () => {
    const s = createGame(bundle, { seed: 'nav4', scenarioId: 'box-1' })
    const mem = newMemory()
    const v = view(s, s.seatOrder[0]!)
    observeRound(mem, v)
    expect(roundOf(mem, v)).toBe(1)
    const id = Object.keys(s.models)[0]!
    const used = { ...v, models: { ...v.models, [id]: { ...v.models[id]!, readiness: 'used' as const } } }
    observeRound(mem, used)
    expect(roundOf(mem, used)).toBe(1)
    observeRound(mem, v)
    expect(roundOf(mem, v)).toBe(2)
  })

  it('NAV-005 the bounce guard never repeats a menu pick when the same menu comes back (cancelled move)', () => {
    let s = createGame(bundle, { seed: 'nav5', scenarioId: 'box-1' })
    for (let i = 0; i < 40 && s.pending.kind !== 'turn.activation'; i++) {
      const legal = legalActions(s)
      const r = apply(s, bundle, legal[0]!)
      if (!r.ok) break
      s = r.state
    }
    expect(s.pending.kind).toBe('turn.activation')
    const seat = s.pending.seat as string
    const mem = newMemory()
    const ask = () => activationMenu(makeContext('normal', view(s, seat), s.pending, legalActions(s), { seed: 'b', bundle, accepts: (a: Action) => apply(s, bundle, a).ok, budgetMs: 10_000 }, mem))
    const first = ask()!
    const second = ask()!
    if (first.type !== 'turn.end') expect(second.type === first.type && second.targetId === first.targetId && second.weaponUid === first.weaponUid).toBe(false)
  })
})

