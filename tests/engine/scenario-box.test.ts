// Box scenarios and Getting Acclimated tutorials as set up from data (M4d audit fixes): forces, zones, terrain, objects and
// the mechanics the sources name. Games come from createGame so the real records are what is tested.
import { describe, expect, it } from 'vitest'
import { loadBundle } from './helpers'
import { isRejection, updateModel } from '../../src/engine/registry'
import { checkVictory, endOfTurn, scenario, upkeep } from '../../src/engine/scenario'
import { createGame } from '../../src/engine/setup'
import { isShootable } from '../../src/engine/objects'
import { terrainTraits } from '../../src/engine/terrain'
import type { GameState, MarkerState, ModelState } from '../../src/engine/types'

const bundle = loadBundle()
const game = (scenarioId: string, seats?: string[], seed = 's'): GameState => ({ ...createGame(bundle, { seed, scenarioId, seats }), phase: 'play', round: 1 })
const models = (g: GameState, owner: string): ModelState[] => Object.values(g.models).filter((m) => m.owner === owner)
const face = (g: GameState, f: string): MarkerState[] => g.markers.filter((m) => m.face === f)
const step = (g: GameState, type: string, modelId: string, markerId: string) => scenario.resolve(g, bundle, { type, decisionId: g.pending.id, seat: g.models[modelId]!.owner, modelId, markerId })
const placeNear = (g: GameState, id: string, mk: MarkerState, dx = 1.2): GameState => updateModel(g, id, { pos: { x: mk.pos.x + dx, z: mk.pos.z } })
const isPa = (defId: string): boolean => bundle.records.armor.find((a) => a.id === defId)?.kind === 'powerArmor'

describe('SCN-006 every scenario side declares its forces', () => {
  it('SCN-006 no side relies on a default; setup throws for a side with none', () => {
    for (const sc of bundle.records.scenarios) for (const side of sc.sides) expect(side.forces?.length, `${sc.id}/${side.id}`).toBeGreaterThan(0)
    const broken = { ...bundle, records: { ...bundle.records, scenarios: bundle.records.scenarios.map((s) => (s.id === 'box-2' ? { ...s, sides: s.sides.map((x, i) => (i === 1 ? { ...x, forces: [] } : x)) } : s)) } }
    expect(() => createGame(broken, { seed: 's', scenarioId: 'box-2' })).toThrow(/no forces/)
  })
})

describe('SCN-007 box-1 Ad Victoriam', () => {
  it('SCN-007 Brotherhood vs Scavengers, no suit worn at the start, three suits 8 in apart on the centre line', () => {
    const g = game('box-1')
    expect(g.seats.A!.faction).toBe('brotherhood-of-steel')
    expect(g.seats.B!.faction).toBe('survivors')
    for (const m of models(g, 'A')) expect(m.carried.some((c) => isPa(c.defId))).toBe(false)
    const suits = face(g, 'power-armor-suit')
    expect(suits).toHaveLength(3)
    expect(suits.map((s) => s.pos.x).sort((a, b) => a - b)).toEqual([-8, 0, 8])
    for (const s of suits) { expect(s.pos.z).toBe(0); expect(s.kind).toBe('object'); expect(isShootable(s)).toBe(true) }
    for (const m of models(g, 'A')) expect(m.pos.z).toBeGreaterThan(14 - 1.2) // within Yellow of the south edge
    for (const m of models(g, 'B')) expect(m.pos.z).toBeLessThan(-14 + 1.2)
    expect(g.terrain.filter((t) => t.rulesType === 'building')).toHaveLength(6)
  })

  it('SCN-007 each suit is one of T-45, T-51 or T-60, drawn from a layout stream, with that suit\'s armor and Health', () => {
    const seen = new Set<string>()
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      for (const s of face(game('box-1', undefined, seed), 'power-armor-suit')) {
        expect(['t-45-power-armor', 't-51-power-armor', 't-60-power-armor']).toContain(s.props.suit)
        expect(s.props.health).toBeGreaterThanOrEqual(3)
        expect((s.props.armor as { physical: number }).physical).toBeGreaterThanOrEqual(2)
        seen.add(String(s.props.suit))
      }
    }
    expect(seen.size).toBeGreaterThan(1)
    expect(game('box-1', undefined, 'same').markers).toEqual(game('box-1', undefined, 'same').markers)
  })

  it('SCN-007 a Brotherhood model in contact claims a suit with an Action; Scavengers cannot', () => {
    const g0 = game('box-1')
    const suit = face(g0, 'power-armor-suit')[1]!
    const bos = models(g0, 'A')[0]!, scav = models(g0, 'B')[0]!
    const near = placeNear(placeNear(g0, bos.id, suit), scav.id, suit, -1.2)
    expect(scenario.options(near, bundle, bos.id).map((o) => o.action.type)).toContain('scenario.claim')
    expect(scenario.options(near, bundle, scav.id).map((o) => o.action.type)).not.toContain('scenario.claim')
    expect(isRejection(step(near, 'scenario.claim', scav.id, suit.id))).toBe(true)
    const r = step(near, 'scenario.claim', bos.id, suit.id)
    expect(isRejection(r)).toBe(false)
    const s = (r as { state: GameState }).state
    const worn = s.models[bos.id]!.carried.find((c) => isPa(c.defId))!
    expect(worn.defId).toBe(suit.props.suit)
    expect(worn.starting).toBe(false)
    expect(s.markers.find((m) => m.id === suit.id)!.props.claimed).toBe(true)
    expect(isRejection(step(s, 'scenario.claim', bos.id, suit.id))).toBe(true) // gone, and he already wears one
  })

  it('SCN-007 a suit that has been shot to pieces cannot be claimed', () => {
    const g0 = game('box-1')
    const suit = face(g0, 'power-armor-suit')[0]!
    const bos = models(g0, 'A')[0]!
    const wrecked: GameState = { ...placeNear(g0, bos.id, suit), markers: g0.markers.map((m) => (m.id === suit.id ? { ...m, props: { ...m.props, destroyed: true, health: 0 } } : m)) }
    expect(scenario.options(wrecked, bundle, bos.id).map((o) => o.action.type)).not.toContain('scenario.claim')
  })
})

describe('SCN-008 box-2 Big John\'s', () => {
  it('SCN-008 Super Mutants within Red of the nuke, Survivors within Yellow of an edge, a dense container maze', () => {
    const g = game('box-2')
    const nuke = face(g, 'mini-nuke')[0]!
    expect(nuke.pos).toEqual({ x: 0, z: 0 })
    for (const m of models(g, 'A')) { expect(bundle.records.units.find((u) => u.id === m.profileId)!.faction).toBe('super-mutants'); expect(Math.hypot(m.pos.x, m.pos.z)).toBeLessThanOrEqual(6.5) }
    for (const m of models(g, 'B')) { expect(bundle.records.units.find((u) => u.id === m.profileId)!.faction).toBe('survivors'); expect(Math.max(Math.abs(m.pos.x), Math.abs(m.pos.z))).toBeGreaterThanOrEqual(18 - 4 - 1) }
    const containers = g.terrain.filter((t) => t.pieceId === 'shipping-container-rusted')
    expect(containers.length).toBeGreaterThanOrEqual(16)
    for (const c of containers) expect(terrainTraits(c).blocksLos).toBe(true)
  })

  it('SCN-008 a hit shot near the nuke rolls the armor die: a 1 detonates it, anything else does not', () => {
    let boom = 0, quiet = 0
    for (let i = 0; i < 40; i++) {
      const g0 = game('box-2', undefined, `n${i}`)
      const nuke = face(g0, 'mini-nuke')[0]!
      const [shooter] = models(g0, 'B')
      const target = models(g0, 'A')[0]!
      const g = { ...updateModel(g0, target.id, { pos: { x: 1, z: 0 } }), events: [...g0.events, { type: 'attack', ns: 'shoot', attackerId: shooter!.id, targetId: target.id, success: true }] }
      const after = upkeep(g, bundle)
      if (face(after, 'mini-nuke')[0]!.props.exploded === true) boom++; else quiet++
      expect(nuke.props.exploded).toBeUndefined()
    }
    expect(boom).toBeGreaterThan(0)
    expect(quiet).toBeGreaterThan(boom)
  })

  it('SCN-008 a miss, or a hit far from the nuke, rolls nothing', () => {
    const g0 = game('box-2')
    const shooter = models(g0, 'B')[0]!, target = models(g0, 'A')[0]!
    const far = updateModel(g0, target.id, { pos: { x: 9, z: 0 } })
    const miss = upkeep({ ...updateModel(g0, target.id, { pos: { x: 1, z: 0 } }), events: [...g0.events, { type: 'attack', ns: 'shoot', attackerId: shooter.id, targetId: target.id, success: false }] }, bundle)
    const dist = upkeep({ ...far, events: [...far.events, { type: 'attack', ns: 'shoot', attackerId: shooter.id, targetId: target.id, success: true }] }, bundle)
    expect(miss.rollSeq).toBe(g0.rollSeq)
    expect(dist.rollSeq).toBe(g0.rollSeq)
  })

  it('SCN-008 round 9: an unclaimed nuke is a defender win; one in attacker hands is not', () => {
    const g = game('box-2')
    const end = (s: GameState) => checkRound(s, 9)
    expect(end(g)!.winner).toBe('A')
    const carrier = models(g, 'B')[0]!
    const held = { ...g, markers: g.markers.map((m) => (m.face === 'mini-nuke' ? { ...m, carriedBy: carrier.id } : m)) }
    expect(end(held)).toBeNull()
  })
})

import { endOfRound } from '../../src/engine/scenario'
function checkRound(s: GameState, round: number) {
  const r = endOfRound({ ...s, round }, bundle)
  return r.phase === 'over' ? r.result : null
}

describe('SCN-009 box-3 Quest for Knowledge', () => {
  it('SCN-009 Survivors are the attacker with +20% caps; the school blocks line of sight; books are inside, Yellow apart', () => {
    const g = game('box-3')
    const sc = bundle.records.scenarios.find((s) => s.id === 'box-3')!
    expect(sc.sides[1]!.capsBonusPct).toBe(20)
    expect(g.seats.B!.faction).toBe('survivors')
    const walls = g.terrain.filter((t) => t.pieceId === 'school-wall')
    expect(walls.length).toBeGreaterThan(10)
    for (const w of walls) expect(terrainTraits(w).blocksLos).toBe(true)
    const books = face(g, 'book')
    expect(books).toHaveLength(5)
    for (const b of books) expect(Math.max(Math.abs(b.pos.x), Math.abs(b.pos.z))).toBeLessThanOrEqual(10)
    for (let i = 0; i < books.length; i++) for (let j = i + 1; j < books.length; j++) expect(Math.hypot(books[i]!.pos.x - books[j]!.pos.x, books[i]!.pos.z - books[j]!.pos.z)).toBeGreaterThanOrEqual(4 + 1 - 1e-6)
    for (const m of models(g, 'A')) expect(Math.hypot(m.pos.x, m.pos.z)).toBeLessThan(11) // defenders inside the school
  })

  it('SCN-009 only the attacking Survivors can take a book', () => {
    const g0 = game('box-3')
    const book = face(g0, 'book')[0]!
    const def = models(g0, 'A')[0]!, att = models(g0, 'B')[0]!
    const g = placeNear(placeNear(g0, def.id, book), att.id, book, -1.2)
    expect(scenario.options(g, bundle, def.id).map((o) => o.action.type)).not.toContain('scenario.pickup')
    expect(scenario.options(g, bundle, att.id).map((o) => o.action.type)).toContain('scenario.pickup')
    expect(isRejection(step(g, 'scenario.pickup', def.id, book.id))).toBe(true)
    expect(isRejection(step(g, 'scenario.pickup', att.id, book.id))).toBe(false)
  })
})

describe('SCN-010 box-4 Radio Tower Takeover', () => {
  it('SCN-010 Brotherhood defend with a turret and a held-back reserve; the tower is solid terrain at the centre', () => {
    const g = game('box-4')
    const tower = face(g, 'radio-tower')[0]!
    expect(tower.pos).toEqual({ x: 0, z: 0 })
    const def = models(g, 'A')
    expect(def.some((m) => m.profileId === 'machine-gun-turret-mk1')).toBe(true)
    expect(def.some((m) => m.profileId === 'aspirant-goddard')).toBe(true)
    const held = def.filter((m) => m.offTable)
    expect(held).toHaveLength(2)
    expect(held.every((m) => m.profileId === 'knight')).toBe(true)
    expect(g.terrain.some((t) => t.id === `obj-${tower.id}`)).toBe(true)
    for (const m of def.filter((x) => !x.offTable)) expect(Math.hypot(m.pos.x, m.pos.z)).toBeLessThanOrEqual(4 + 1.6 + 0.8)
  })

  it('SCN-010 three controlled turns in a row bring the reserve on; an enemy in contact resets the count', () => {
    const g0 = game('box-4')
    const tower = face(g0, 'radio-tower')[0]!
    const holder = models(g0, 'A').find((m) => !m.offTable && m.profileId === 'initiate')!
    const foe = models(g0, 'B')[0]!
    let g = updateModel(g0, holder.id, { pos: { x: 2.6, z: 0 } })
    expect(tower.props.baseMm).toBe(80)
    g = endOfTurn(endOfTurn(g, bundle), bundle)
    expect(models(g, 'A').filter((m) => m.offTable)).toHaveLength(2)
    const contested = endOfTurn(updateModel(g, foe.id, { pos: { x: -2.6, z: 0 } }), bundle)
    expect(models(contested, 'A').filter((m) => m.offTable)).toHaveLength(2)
    const third = endOfTurn(g, bundle)
    expect(models(third, 'A').filter((m) => m.offTable)).toHaveLength(0)
    for (const m of models(third, 'A').filter((x) => x.profileId === 'knight')) expect(m.life).toBe('active')
  })

  it('SCN-010 models in base contact with the tower count (the tower has a base)', () => {
    let g: GameState = { ...game('box-4'), round: 6 }
    const m = models(g, 'B')[0]!
    g = updateModel(g, m.id, { pos: { x: 2.4, z: 0 } })
    const over = endOfRound(g, bundle)
    expect(over.result!.winner).toBe('B')
  })
})

describe('SCN-011 box-5 Flip\'s Revenge', () => {
  it('SCN-011 Flip is a heroic non-creature Super Mutant; the Kidnappers hold about double his caps; a ring of buildings', () => {
    const g = game('box-5')
    const flip = models(g, 'B')
    expect(flip).toHaveLength(1)
    expect(flip[0]!.heroic).toBe(true)
    expect(bundle.records.units.find((u) => u.id === flip[0]!.profileId)!.types).not.toContain('creature')
    const cost = (ms: ModelState[]): number => ms.reduce((n, m) => n + bundle.records.units.find((u) => u.id === m.profileId)!.cost + m.carried.filter((c) => !bundle.records.units.find((u) => u.id === m.profileId)!.equipped.includes(c.defId)).reduce((a, c) => a + (bundle.records.weapons.find((w) => w.id === c.defId)?.cost ?? 0), 0), 0)
    const ratio = cost(models(g, 'A')) / cost(flip)
    expect(ratio).toBeGreaterThan(1.8)
    expect(ratio).toBeLessThan(2.2)
    expect(g.terrain.filter((t) => t.rulesType === 'building')).toHaveLength(7)
    for (const m of models(g, 'A')) expect(Math.hypot(m.pos.x, m.pos.z)).toBeLessThanOrEqual(4 + 1)
    expect(Math.max(Math.abs(flip[0]!.pos.x), Math.abs(flip[0]!.pos.z))).toBeGreaterThanOrEqual(18 - 6 - 1)
  })

  it('SCN-011 only Flip\'s side frees Sarah, who appears as a Settler with a Laser Rifle under Flip\'s control', () => {
    const g0 = game('box-5')
    const cap = face(g0, 'captive')[0]!
    const flip = models(g0, 'B')[0]!, kid = models(g0, 'A')[0]!
    const g = placeNear(placeNear(g0, flip.id, cap, 1.9), kid.id, cap, -1.9)
    expect(scenario.options(g, bundle, kid.id).map((o) => o.action.type)).not.toContain('scenario.interact')
    expect(scenario.options(g, bundle, flip.id).map((o) => o.action.type)).toContain('scenario.interact')
    const r = step(g, 'scenario.interact', flip.id, cap.id)
    expect(isRejection(r)).toBe(false)
    const s = (r as { state: GameState }).state
    const sid = face(s, 'captive')[0]!.props.spawnedId as string
    const sarah = s.models[sid]!
    expect(sarah.owner).toBe('B')
    expect(sarah.profileId).toBe('settler')
    expect(sarah.carried.some((c) => c.defId === 'laser-rifle')).toBe(true)
    expect(Math.hypot(sarah.pos.x - s.models[flip.id]!.pos.x, sarah.pos.z - s.models[flip.id]!.pos.z)).toBeGreaterThanOrEqual(1.4)
    expect(isRejection(step(s, 'scenario.interact', flip.id, cap.id))).toBe(true)
  })

  it('SCN-011 victory: Sarah leaves = Flip 200; Sarah dies = Kidnappers 150; both die = Kidnappers 200', () => {
    const g0 = game('box-5')
    const cap = face(g0, 'captive')[0]!
    const flip = models(g0, 'B')[0]!
    const g = placeNear(g0, flip.id, cap, 1.9)
    const s = (step(g, 'scenario.interact', flip.id, cap.id) as { state: GameState }).state
    const sid = face(s, 'captive')[0]!.props.spawnedId as string
    expect(checkVictory(s, bundle)).toBeNull()
    const out = checkVictory({ ...s, scenario: { ...s.scenario, exited: [sid] } as GameState['scenario'] }, bundle)!
    expect([out.winner, out.caps]).toEqual(['B', 200])
    const dead = checkVictory(updateModel(s, sid, { life: 'dead' }), bundle)!
    expect([dead.winner, dead.caps]).toEqual(['A', 150])
    const both = checkVictory(updateModel(updateModel(s, sid, { life: 'dead' }), flip.id, { life: 'dead' }), bundle)!
    expect([both.winner, both.caps]).toEqual(['A', 200])
    const early = checkVictory(updateModel(g0, flip.id, { life: 'dead' }), bundle)!
    expect([early.winner, early.caps]).toEqual(['A', 200])
  })
})

describe('SCN-012 Getting Acclimated tables', () => {
  it('SCN-012 GA tables are small, have no generic terrain, and start Nora where the map does', () => {
    const sizes: Record<string, [number, number]> = { 'ga-1': [18, 12], 'ga-2': [24, 14], 'ga-3': [24, 14], 'ga-4': [24, 14] }
    for (const [id, [w, d]] of Object.entries(sizes)) {
      const g = game(id, ['A'])
      expect(g.scenario.table).toEqual({ w, d })
      const nora = Object.values(g.models)[0]!
      expect(Math.abs(nora.pos.x + w / 2 - 1)).toBeLessThan(0.6)
      if (id !== 'ga-1') { expect(g.terrain).toHaveLength(0); expect(Math.abs(nora.pos.z)).toBeLessThan(0.6) }
    }
  })

  it('SCN-012 GA-2 cans sit at the source spots; GA-3 plants can be struck in melee; GA-4 mounds have Health and armor', () => {
    const cans = face(game('ga-2', ['A']), 'can')
    expect(cans.map((m) => [m.pos.x + 12, m.pos.z + 7])).toEqual([[7, 4], [12, 2], [12, 7], [19, 7.5], [21, 12]])
    const plants = face(game('ga-3', ['A']), 'mut-fruit-plant')
    expect(plants).toHaveLength(5)
    expect(plants.every((p) => p.props.meleeable === true && p.props.shootable === false)).toBe(true)
    const mounds = face(game('ga-4', ['A']), 'mole-rat-mound')
    expect(mounds.map((m) => [m.pos.x + 12, m.pos.z + 7])[4]).toEqual([16.4, 8.8])
    expect(mounds.every((m) => m.props.health === 3)).toBe(true)
  })

  it('SCN-012 GA-2 a can that has been hit leaves the table; the run is won when every can was hit', () => {
    const g0 = game('ga-2', ['A'])
    const hit = { ...g0, markers: g0.markers.map((m, i) => (i === 0 ? { ...m, props: { ...m.props, hit: 1 } } : m)) }
    const after = upkeep(hit, bundle)
    expect(after.markers[0]!.props.destroyed).toBe(true)
    expect(isShootable(after.markers[0]!)).toBe(false)
    expect(checkVictory(after, bundle)).toBeNull()
    const all = upkeep({ ...g0, markers: g0.markers.map((m) => ({ ...m, props: { ...m.props, hit: 1 } })) }, bundle)
    expect(checkVictory(all, bundle)!.winner).toBe('A')
  })

  it('SCN-012 GA-1 hazard zones cannot be entered; the crate must be reached before the exit', () => {
    const g0 = game('ga-1', ['A'])
    const hazards = g0.terrain.filter((t) => t.rulesType === 'hazard')
    expect(hazards).toHaveLength(3)
    for (const h of hazards) expect(terrainTraits(h).move).toBe('impassable')
    const nora = Object.values(g0.models)[0]!
    const crate = face(g0, 'crate')[0]!, exit = face(g0, 'exit')[0]!
    expect(crate.pos.x + 9).toBeCloseTo(11, 6); expect(crate.pos.z + 6).toBeCloseTo(1.2, 6)
    expect(exit.pos.x + 9).toBeCloseTo(16, 6); expect(exit.pos.z + 6).toBeCloseTo(9.7, 6)
    // the exit first does not count
    const early = upkeep(updateModel(g0, nora.id, { pos: { ...exit.pos } }), bundle)
    expect(checkVictory(early, bundle)).toBeNull()
    const atCrate = upkeep(updateModel(g0, nora.id, { pos: { ...crate.pos } }), bundle)
    expect(face(atCrate, 'crate')[0]!.props.done).toBe(true)
    expect(checkVictory(atCrate, bundle)).toBeNull()
    const done = checkVictory(updateModel(atCrate, nora.id, { pos: { ...exit.pos } }), bundle)!
    expect(done.winner).toBe('A')
  })
})
