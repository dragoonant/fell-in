// Owner I: AI and co-op scenario layout and mechanics (docs/spec/17 s4, s4.1). Games come from createGame with the real data.
import { describe, expect, it } from 'vitest'
import { settingsFor } from '../../src/ai/official/objectives'
import { isRejection } from '../../src/engine/registry'
import { checkVictory, endOfRound, endOfTurn, scenario, upkeep } from '../../src/engine/scenario'
import { createGame } from '../../src/engine/setup'
import { distToShape, worldShape } from '../../src/engine/terrain'
import { rulerInches } from '../../src/engine/edition'
import { baseRadius, dist } from '../../src/engine/geometry'
import { exitedIds } from '../../src/engine/scenarios/rules'
import { view } from '../../src/engine/view'
import type { GameEvent, GameState, MarkerState, ModelState } from '../../src/engine/types'
import { loadBundle } from './helpers'

const bundle = loadBundle()
const game = (scenarioId: string, seed = 'sa', seats: string[] = scenarioId.startsWith('coop') ? ['ai', 'p1', 'p2'] : ['ai', 'p1']): GameState => ({
  ...createGame(bundle, { seed, scenarioId, seats, controllers: Object.fromEntries(seats.filter((x) => x !== 'ai').map((x) => [x, 'bot' as const])) }),
  phase: 'play', round: 1,
})
const models = (s: GameState, owner?: string): ModelState[] => Object.values(s.models).filter((m) => !owner || m.owner === owner)
const find = (s: GameState, profile: string): ModelState => models(s).find((m) => m.profileId === profile)!
const face = (s: GameState, f: string): MarkerState => s.markers.find((m) => m.face === f)!
const put = (s: GameState, id: string, x: number, z: number, patch: Partial<ModelState> = {}): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos: { x, z }, ...patch } } })
const patchMarker = (s: GameState, f: string, patch: Partial<MarkerState> & { props?: Record<string, unknown> }): GameState =>
  ({ ...s, markers: s.markers.map((m) => (m.face === f ? { ...m, ...patch, props: { ...m.props, ...(patch.props ?? {}) } } : m)) })
const withEvents = (s: GameState, ...ev: GameEvent[]): GameState => ({ ...s, events: [...s.events, ...ev] })
/** Every model except `keep` goes to a far corner, so a scene has room. */
const parked = (s: GameState, keep: string): GameState => {
  let out = s
  let i = 0
  for (const m of models(s)) if (m.id !== keep) out = put(out, m.id, -17 + (i++ % 12) * 2.8, 17)
  return out
}
const clear = (s: GameState): GameState => ({ ...s, terrain: s.terrain.filter((t) => t.id.startsWith('obj-')) })

describe('SCN-009 scenario layout comes from data', () => {
  it('SCN-009 AI-RR: diner Yellow from a corner, AI exactly Orange from it and Yellow apart, survivors in the opposite Blue x Blue, rocket in their zone', () => {
    const s = game('ai-rr')
    const diner = worldShape(s.terrain.find((t) => t.id === 'diner')!)
    const ai = models(s, 'ai')
    expect(ai).toHaveLength(5)
    for (const m of ai) expect(distToShape(m.pos, diner)).toBeCloseTo(rulerInches(bundle, 'orange'), 1)
    for (const a of ai) for (const b of ai) if (a.id < b.id) expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(rulerInches(bundle, 'yellow'))
    const half = s.scenario.table.w / 2
    const box = (p: { x: number; z: number }, r = 0): boolean => p.x >= half - rulerInches(bundle, 'blue') - 0.01 && p.z >= half - rulerInches(bundle, 'blue') - 0.01 && p.x <= half - r + 0.01 && p.z <= half - r + 0.01
    for (const m of models(s, 'p1')) expect(box(m.pos, baseRadius(m.base))).toBe(true)
    expect(box(face(s, 'red-rocket').pos)).toBe(true)
    expect(distToShape({ x: -half, z: -half }, diner)).toBeCloseTo(rulerInches(bundle, 'yellow') * Math.SQRT2, 0) // corner to diner corner: Yellow on each axis
  })

  it('SCN-009 the same seed gives the same layout and another seed another', () => {
    const key = (s: GameState): string => models(s).map((m) => `${m.pos.x.toFixed(3)},${m.pos.z.toFixed(3)}`).join('|')
    expect(key(game('ai-breakin', 'k1'))).toBe(key(game('ai-breakin', 'k1')))
    expect(key(game('ai-breakin', 'k1'))).not.toBe(key(game('ai-breakin', 'k2')))
  })
})

describe('SCN-003 the Red Rocket may only leave past the diner', () => {
  it('SCN-003 the push data lives on the marker (reach, distance, departure edges)', () => {
    const p = face(game('ai-rr'), 'red-rocket').props
    expect([p.pushable, p.pushReach, p.pushDistance, p.departEdges]).toEqual([true, 'orange', 'yellow', ['n', 'w']])
    expect(p.health).toBe(10)
  })

  it('SCN-003 a shove that would take the rocket off the survivors own edges stops at the edge; one past the diner takes it off the table (major win)', () => {
    const shove = (rx: number, rz: number, px: number, pz: number): MarkerState => {
      for (let i = 0; i < 60; i++) {
        let s = game('ai-rr', `push${i}`)
        const pusher = models(s, 'p1')[0]!
        s = patchMarker(put(s, pusher.id, px, pz), 'red-rocket', { pos: { x: rx, z: rz } })
        s = { ...s, activation: { modelId: pusher.id, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
        const r = scenario.resolve(s, bundle, { type: 'scenario.push', decisionId: s.pending.id, seat: 'p1', modelId: pusher.id, markerId: face(s, 'red-rocket').id })
        if (isRejection(r)) throw new Error(r.message)
        const rocket = face(r.state, 'red-rocket')
        if (rocket.pos.x !== rx || rocket.pos.z !== rz) return rocket
      }
      throw new Error('no push succeeded in 60 seeds')
    }
    const own = shove(9, 9, 6, 6) // pushed towards the south-east corner: our own edges
    expect(own.props.offTable).toBeUndefined()
    expect(own.pos.x).toBeLessThanOrEqual(12)
    expect(own.pos.z).toBeLessThanOrEqual(12)
    const past = shove(-9, -9, -6, -6) // towards the diner's corner: off the north / west edge
    expect(past.props.offTable).toBe(true)
  })
})

describe('SCN-004 missile sled', () => {
  it('SCN-004 the sled rolls Red towards the exit each round, shoving a model out of its way', () => {
    let s = clear(game('ai-missile'))
    const sled = face(s, 'missile-sled')
    const blocker = models(s, 'ai')[0]!
    s = parked(s, blocker.id)
    s = put(s, blocker.id, sled.pos.x + 3, sled.pos.z + 0.3)
    const after = endOfRound(s, bundle)
    const moved = face(after, 'missile-sled')
    expect(moved.pos.x - sled.pos.x).toBeCloseTo(rulerInches(bundle, 'red'), 5)
    expect(after.terrain.find((t) => t.id === `obj-${sled.id}`)!.pos).toEqual(moved.pos) // its cover/impassable piece travels with it
    const b = after.models[blocker.id]!
    expect(b.life).toBe('active')
    expect(dist(b.pos, moved.pos)).toBeGreaterThanOrEqual(baseRadius(b.base) + 0.5 * 50 / 25.4 - 1e-6) // shoved clear of the sled's base
  })

  it('SCN-004 a model with no room to be shoved is run over', () => {
    let s = clear(game('ai-missile'))
    const sled = face(s, 'missile-sled')
    const victim = models(s, 'ai')[0]!
    s = parked(s, victim.id)
    s = put(s, victim.id, sled.pos.x + 3, sled.pos.z)
    // walls on both sides of the lane leave no room
    const wall = (id: string, z: number) => ({ id, pieceId: id, rulesType: 'obstruction' as const, pos: { x: sled.pos.x + 3, z }, rot: 0, footprint: { rect: { w: 12, d: 1 } }, height: 3, props: {} })
    s = { ...s, terrain: [...s.terrain, wall('w1', 2.2), wall('w2', -2.2)] }
    const after = endOfRound(s, bundle)
    expect(after.models[victim.id]!.life).toBe('dead')
  })

  it('SCN-004 the sled leaves at the exit edge: the AI side wins', () => {
    let s = clear(game('ai-missile'))
    s = patchMarker(s, 'missile-sled', { pos: { x: s.scenario.table.w / 2 - 3, z: 0 } })
    const after = endOfRound(s, bundle)
    expect(after.result?.reason).toMatch(/left the table/)
    expect(after.result?.winner).toBe('ai')
  })

  it('SCN-004 a missile hit rolls the armor die against earlier hits: the first never detonates, a fifth always does', () => {
    const shot = (s: GameState, target: string): GameState => withEvents(s, { type: 'attack', ns: 'shoot', attackerId: models(s, 'p1')[0]!.id, targetId: target, weaponId: 'combat-rifle', success: false, result: null })
    let s = game('ai-missile')
    const id = face(s, 'missile-sled').id
    s = upkeep(shot(s, id), bundle)
    expect(face(s, 'missile-sled').props.missileHits).toBe(1)
    expect(face(s, 'missile-sled').props.detonated).toBeUndefined()
    s = patchMarker(s, 'missile-sled', { props: { missileHits: 4 } })
    s = upkeep(shot(s, id), bundle)
    expect(face(s, 'missile-sled').props.detonated).toBe(true)
    expect(checkVictory(s, bundle)).toMatchObject({ winner: null, reason: 'The missile detonated' })
  })

  it('SCN-004 an ordinary miss (no X) or a shot far from the sled does not hit the missile', () => {
    const s0 = game('ai-missile')
    const id = face(s0, 'missile-sled').id
    const ev = (result: number | null, target: string): GameEvent => ({ type: 'attack', ns: 'shoot', attackerId: models(s0, 'p1')[0]!.id, targetId: target, weaponId: 'combat-rifle', success: false, result })
    const far = models(s0, 'p1')[0]!
    const s = upkeep(withEvents(put(s0, far.id, -15, -15), ev(7, id), ev(null, far.id)), bundle)
    expect(face(s, 'missile-sled').props.missileHits).toBeUndefined()
  })

  it('SCN-004 a lockpick success does 1 damage without an armor roll; five sabotage the sled', () => {
    let s = game('ai-missile')
    for (let i = 1; i <= 5; i++) {
      s = patchMarker(s, 'missile-sled', { props: { done: true } })
      const rolls = s.events.length
      s = upkeep(s, bundle)
      expect(s.events.slice(rolls).some((e) => e.type === 'DiceRolled')).toBe(false)
      expect(face(s, 'missile-sled').props.health).toBe(5 - i)
    }
    expect(face(s, 'missile-sled').props.destroyed).toBe(true)
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'p1', reason: 'The sled was sabotaged' })
  })
})

describe('SCN-012 patrols and awareness (The Break-in)', () => {
  it('SCN-012 each AI pair starts at its own route marker and walks it; touching the marker sends it on, looping at the end', () => {
    let s = clear(game('ai-breakin'))
    const patrollers = models(s, 'ai')
    expect(patrollers.every((m) => m.tokens.aiRouteId !== undefined && m.tokens.aiRoute === 1)).toBe(true)
    const m = patrollers.find((x) => x.tokens.aiRouteId === 2)!
    const route = s.markers.filter((k) => (k.props.route as { id: number } | undefined)?.id === 2)
    expect(route).toHaveLength(2)
    const target = route.find((k) => (k.props.route as { step: number }).step === 2)!
    s = upkeep(put(s, m.id, target.pos.x, target.pos.z, { tokens: { ...m.tokens } }), bundle)
    expect(s.models[m.id]!.tokens.aiRoute).toBe(0) // loops back to the first marker
  })

  it('SCN-012 patrolling uses the Objective response on the next route marker, and a model that sees a player hands back to its matrix and hunts', () => {
    let s = clear(game('ai-breakin'))
    const sm = find(s, 'super-mutant')
    const before = settingsFor(view(s, 'ai'), bundle, sm)
    expect(before).toMatchObject({ objective: 'goTo', subject: 'next-route-marker', forceResponse: 'O' })
    const p = models(s, 'p1')[0]!
    s = put(put(s, p.id, 0, 0), sm.id, 4, 0)
    s = upkeep(s, bundle)
    expect(s.models[sm.id]!.tokens.aiAware).toBe(1)
    const after = settingsFor(view(s, 'ai'), bundle, s.models[sm.id]!)
    expect(after.objective).toBe('defeat')
    expect(after.forceResponse).toBeUndefined()
  })

  it('SCN-012 a player model that is out of sight and far away does not alert a patrol', () => {
    let s = game('ai-breakin')
    const sm = find(s, 'super-mutant')
    const p = models(s, 'p1')[0]!
    s = upkeep(put(put(s, p.id, 17, 17), sm.id, -17, -17), bundle)
    expect(s.models[sm.id]!.tokens.aiAware).toBeUndefined()
  })

  it('SCN-012 the valve is an Interact for player models only, and the win needs half the team out as well', () => {
    let s = clear(game('ai-breakin'))
    const valve = face(s, 'valve')
    expect(valve.props.interactBy).toBe('players')
    s = patchMarker(s, 'valve', { props: { done: true } })
    expect(checkVictory(s, bundle)).toBeNull()
    const [a, b] = models(s, 'p1')
    s = { ...s, events: [...s.events, { type: 'removed', modelId: a!.id, reason: 'left the table' }, { type: 'removed', modelId: b!.id, reason: 'left the table' }] }
    s = upkeep({ ...s, models: { ...s.models, [a!.id]: { ...a!, life: 'dead', offTable: true }, [b!.id]: { ...b!, life: 'dead', offTable: true } } }, bundle)
    expect(exitedIds(s)).toEqual([a!.id, b!.id])
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'p1' })
  })
})

describe('SCN-013 keys, locks and the hatch (Into the Sewer)', () => {
  it('SCN-013 a looked-at blank is discarded; a numbered marker becomes a box that needs Lockpick or Computers', () => {
    let s = game('coop-sewer')
    const n = s.markers.length
    s = { ...s, markers: s.markers.map((m) => (m.kind === 'investigation' ? { ...m, seenBy: ['p1'] } : m)) }
    s = upkeep(s, bundle)
    expect(s.markers).toHaveLength(n - 3) // the three blanks are gone
    const boxes = s.markers.filter((m) => m.face === 'protocol-box')
    expect(boxes).toHaveLength(2)
    for (const b of boxes) expect(['computers', 'lockpick']).toContain(b.props.skill)
  })

  it('SCN-013 an opened box gives its key; a key-holder at the hatch removes a lock; both gone, player models walk out, the SS plus two win', () => {
    let s = game('coop-sewer')
    const hatch = face(s, 'hatch')
    const [ss, tech] = [find(s, 'sole-survivor'), find(s, 'enslaved-tech')]
    const sm = models(s, 'p2')[0]!
    s = put(put(put(s, ss.id, 8, 8), tech.id, 10, 8), sm.id, 12, 8) // away from the hatch while the keys are found
    s = { ...s, markers: s.markers.map((m) => (m.face === 'key-1' || m.face === 'key-2' ? { ...m, seenBy: ['p1'] } : m)) }
    s = upkeep(s, bundle)
    for (const holder of [ss, tech]) {
      s = { ...s, activation: { modelId: holder.id, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
      const box = s.markers.find((m) => m.face === 'protocol-box')!
      s = upkeep({ ...s, markers: s.markers.map((m) => (m.id === box.id ? { ...m, props: { ...m.props, done: true } } : m)) }, bundle)
      expect(s.models[holder.id]!.tokens.key).toBe(1)
    }
    s = { ...s, activation: null }
    s = upkeep(put(s, ss.id, hatch.pos.x + 1.6, hatch.pos.z), bundle)
    expect(exitedIds(s)).toEqual([]) // one lock gone, the hatch is still shut
    expect(face(s, 'hatch').props.locks).toBe(1)
    s = upkeep(put(s, tech.id, hatch.pos.x - 1.6, hatch.pos.z), bundle)
    expect(face(s, 'hatch').props.locks).toBe(0)
    expect(face(s, 'hatch').props.open).toBe(true)
    expect(exitedIds(s)).toEqual([]) // open, but nobody has acted yet: leaving happens when a model's Action ends beside the hatch
    for (const id of [ss.id, tech.id, sm.id]) {
      s = { ...s, activation: { modelId: id, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
      s = upkeep(put(s, id, hatch.pos.x, hatch.pos.z + 1.6), bundle)
    }
    expect(exitedIds(s).sort()).toEqual([ss.id, tech.id, sm.id].sort())
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'p1', level: 'major' })
  })

  it('SCN-013 without both locks open nobody leaves, and the SS alone out at round 8 is the minor win', () => {
    let s = game('coop-sewer')
    const ss = find(s, 'sole-survivor')
    const hatch = face(s, 'hatch')
    s = { ...s, activation: { modelId: ss.id, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
    s = upkeep(put(s, ss.id, hatch.pos.x + 1.6, hatch.pos.z), bundle)
    expect(exitedIds(s)).toEqual([]) // both locks still on
    s = patchMarker(s, 'hatch', { props: { locks: 0, open: true } })
    s = upkeep(s, bundle)
    expect(exitedIds(s)).toEqual([ss.id])
    expect(checkVictory({ ...s, round: 8, maxRounds: 8 }, bundle)).toBeNull() // only judged at round end
    expect(endOfRound({ ...s, round: 8 }, bundle).result).toMatchObject({ winner: 'p1', level: 'minor' })
  })

  it('SCN-013 the Deathclaw: at most once, only when the flip shows luck at the start of rounds 4 to 6', () => {
    const counts = { early: 0, once: true, claws: 0 }
    for (let i = 0; i < 40; i++) {
      let s = game('coop-sewer', `dc${i}`)
      let seen = 0
      for (let r = 1; r <= 7; r++) {
        s = endOfRound({ ...s, round: r }, bundle)
        const claws = models(s).filter((m) => m.profileId === 'deathclaw').length
        if (r < 3 && claws) counts.early++
        if (claws > 1) counts.once = false
        seen = claws
      }
      counts.claws += seen
    }
    expect(counts.early).toBe(0)
    expect(counts.once).toBe(true)
    expect(counts.claws).toBeGreaterThan(0)
    expect(counts.claws).toBeLessThan(40)
  })
})

describe('SCN-014 Blood Cage', () => {
  it('SCN-014 the chain: stretching past Black pulls the other player towards its hole', () => {
    let s = game('coop-cage')
    const [p1, p2] = [models(s, 'p1')[0]!, models(s, 'p2')[0]!]
    const [h1, h2] = [face(s, 'hole-1').pos, face(s, 'hole-2').pos]
    s = put(clear(s), p2.id, h2.x - 8, h2.z) // 8 in from its hole: 4 in of slack left for the other
    s = { ...s, activation: { modelId: p1.id, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
    s = upkeep(put(s, p1.id, h1.x + 8, h1.z), bundle)
    const d = (m: string, h: { x: number; z: number }): number => dist(s.models[m]!.pos, h)
    expect(d(p1.id, h1) + d(p2.id, h2)).toBeCloseTo(rulerInches(bundle, 'black'), 5)
    expect(d(p1.id, h1)).toBeCloseTo(8, 5) // the mover keeps where it went; the other gave the slack
    expect(d(p2.id, h2)).toBeCloseTo(4, 5)
  })

  it('SCN-014 a broken chain frees the players', () => {
    let s = clear(game('coop-cage'))
    const [p1, p2, h1, h2] = [models(s, 'p1')[0]!, models(s, 'p2')[0]!, face(s, 'hole-1').pos, face(s, 'hole-2').pos]
    s = patchMarker(put(s, p2.id, h2.x - 9, h2.z), 'chain', { props: { destroyed: true } })
    s = { ...s, activation: { modelId: p1.id, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] } }
    s = upkeep(put(s, p1.id, h1.x + 9, h1.z), bundle)
    expect(s.models[p2.id]!.pos.x).toBeCloseTo(h2.x - 9, 5)
  })

  it('SCN-014 AI waves wait off the table: wave 1 arrives for round 2, wave 2 on the armor die, and waiting models keep their side alive', () => {
    let s = game('coop-cage')
    const ai = models(s, 'ai')
    expect(ai.every((m) => m.offTable === true)).toBe(true)
    expect(checkVictory(s, bundle)).toBeNull()
    s = endOfRound({ ...s, round: 1 }, bundle)
    expect(models(s, 'ai').filter((m) => !m.offTable).map((m) => m.profileId).sort()).toEqual(['aviator', 'mutant-hound'])
    let arrivals = 0
    for (let i = 0; i < 40; i++) {
      let g = endOfRound({ ...game('coop-cage', `w${i}`), round: 1 }, bundle)
      let first = 0
      for (let r = 2; r <= 5; r++) {
        g = endOfRound({ ...g, round: r }, bundle)
        if (!first && models(g, 'ai').some((m) => m.profileId === 'brute' && !m.offTable)) first = r + 1
      }
      expect(first).toBeGreaterThanOrEqual(3)
      expect(first).toBeLessThanOrEqual(6) // the armor die is below round - 1 for certain by round 6
      if (first) arrivals++
      expect(models(g, 'ai').filter((m) => m.profileId === 'brute' || m.profileId === 'super-mutant').every((m) => !m.offTable)).toBe(true) // both of wave 2 come together
    }
    expect(arrivals).toBe(40)
  })

  it('SCN-014 found ranged weapons run dry after three uses', () => {
    let s = game('coop-cage')
    const p = models(s, 'p1')[0]!
    s = { ...s, models: { ...s.models, [p.id]: { ...p, carried: [...p.carried, { uid: `${p.id}/laser-pistol#1`, defId: 'laser-pistol', kind: 'weapon', starting: false }] } } }
    const shoot = { type: 'attack', ns: 'shoot', attackerId: p.id, targetId: 'x', weaponId: 'laser-pistol', success: false, result: 9 }
    s = upkeep(withEvents(s, shoot, shoot), bundle)
    expect(s.models[p.id]!.carried.some((c) => c.defId === 'laser-pistol')).toBe(true)
    s = upkeep(withEvents(s, shoot), bundle)
    expect(s.models[p.id]!.carried.some((c) => c.defId === 'laser-pistol')).toBe(false)
  })
})

describe('SCN-016 Dangerous Munitions', () => {
  it('SCN-016 a non-dog AI model free and touching the token at round end wins for the AI; a hound does not', () => {
    let s = clear(game('coop-munitions'))
    const bomb = face(s, 'munitions')
    const hound = models(s, 'ai').find((m) => m.profileId === 'mutant-hound')!
    const brute = models(s, 'ai').find((m) => m.profileId === 'brute')!
    s = put(s, hound.id, bomb.pos.x - 1.2, bomb.pos.z)
    expect(endOfRound({ ...s, round: 3 }, bundle).result).toBeNull()
    const lost = endOfRound({ ...put(s, brute.id, bomb.pos.x, bomb.pos.z - 1.2), round: 3 }, bundle)
    expect(lost.result).toMatchObject({ winner: 'ai', reason: 'The munitions went up' })
  })

  it('SCN-016 the players win by surviving round 8, or by removing every AI model', () => {
    let s = clear(game('coop-munitions'))
    expect(endOfRound({ ...s, round: 7 }, bundle).result).toBeNull()
    expect(endOfRound({ ...s, round: 8 }, bundle).result).toMatchObject({ winner: 'p1' })
    for (const m of models(s, 'ai')) s = { ...s, models: { ...s.models, [m.id]: { ...m, life: 'dead', offTable: true } } }
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'p1' })
  })
})

describe('SCN-017 The Escaped Tech', () => {
  it('SCN-017 phase 1: hounds always take O and Use the nearest marker, Super Mutants Protect a hound', () => {
    const s = game('ai-tech')
    const hound = find(s, 'mutant-hound'), sm = find(s, 'super-mutant')
    expect(settingsFor(view(s, 'ai'), bundle, hound)).toMatchObject({ objective: 'use', subject: 'nearest-investigation-marker', forceResponse: 'O' })
    expect(settingsFor(view(s, 'ai'), bundle, sm)).toMatchObject({ objective: 'protect', subject: 'mutant-hound' })
  })

  it('SCN-017 eight markers, one the Tech, none in the two marked squares; a hound looking turns it up and the AI Tech heads for the exit near the players', () => {
    let s = game('ai-tech')
    const mk = s.markers.filter((m) => m.kind === 'investigation')
    expect(mk).toHaveLength(8)
    expect(mk.filter((m) => m.face === 'tech')).toHaveLength(1)
    const tech = mk.find((m) => m.face === 'tech')!
    s = { ...s, markers: s.markers.map((m) => (m.id === tech.id ? { ...m, seenBy: ['ai'] } : m)) }
    s = upkeep(s, bundle)
    const t = find(s, 'enslaved-tech')
    expect(t.owner).toBe('ai')
    expect(t.carried.filter((c) => c.kind === 'weapon')).toHaveLength(0) // unarmed
    expect(models(s, 'ai').every((m) => m.tokens.aiPhase === 2)).toBe(true)
    expect(settingsFor(view(s, 'ai'), bundle, t)).toMatchObject({ objective: 'goTo', subject: 'exit-near-players' })
    expect(settingsFor(view(s, 'ai'), bundle, find(s, 'mutant-hound'))).toMatchObject({ objective: 'protect', subject: 'enslaved-tech', forceResponse: 'O' })
    const exit = face(s, 'exit-near-players')
    s = upkeep(put(s, t.id, exit.pos.x, exit.pos.z - 1), bundle)
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'ai' })
  })

  it('SCN-017 a Tech a player finds is the player seat: it wins by reaching the exit near the AI corner', () => {
    let s = game('ai-tech')
    const tech = s.markers.find((m) => m.face === 'tech')!
    s = { ...s, markers: s.markers.map((m) => (m.id === tech.id ? { ...m, seenBy: ['p1'] } : m)) }
    s = upkeep(s, bundle)
    const t = find(s, 'enslaved-tech')
    expect(t.owner).toBe('p1')
    const exit = face(s, 'exit-near-ai')
    s = upkeep(put(s, t.id, exit.pos.x, exit.pos.z + 1), bundle)
    expect(checkVictory(s, bundle)).toMatchObject({ winner: 'p1' })
  })
})

// keep the endOfTurn export exercised: a sled set to move per turn moves at a turn's end, not a round's
describe('SCN-004 timing is data', () => {
  it('SCN-004 movesAt "turn" moves the sled at the end of a turn and not again at the round end', () => {
    let s = clear(game('ai-missile'))
    s = patchMarker(s, 'missile-sled', { props: { movesAt: 'turn' } })
    const x0 = face(s, 'missile-sled').pos.x
    const t = endOfTurn(s, bundle)
    expect(face(t, 'missile-sled').pos.x - x0).toBeCloseTo(6, 5)
    const r = endOfRound(s, bundle)
    expect(face(r, 'missile-sled').pos.x).toBeCloseTo(x0, 5)
  })
})
