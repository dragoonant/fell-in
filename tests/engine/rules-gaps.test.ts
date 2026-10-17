// Engine gaps closed after M2: BC-006 (defender's free break-away), DMG-005 (eliminated Ready model's free Quick Action),
// WPN-008 / PREP-016 (Walked Fire) and WPN-003 (mines). Real modules throughout; a spy on applyHit shows what each hit carried.
import { describe, expect, it, vi } from 'vitest'
import type { DiceDef, DieColour, EditionBundle, Icon, ScenarioForce, WeaponDef } from '../../src/data/types'
import { attack } from '../../src/engine/attack'
import { apply } from '../../src/engine/apply'
import { applyDirectDamage, damage, healthOf } from '../../src/engine/damage'
import { baseRadius } from '../../src/engine/geometry'
import { breakContact, movement, retreatPath } from '../../src/engine/movement'
import { melee } from '../../src/engine/melee'
import { minesOf } from '../../src/engine/mines'
import { expectedDamage } from '../../src/engine/query'
import { isRejection, type StepResult } from '../../src/engine/registry'
import { createGame } from '../../src/engine/setup'
import { activationMenu } from '../../src/engine/turnflow'
import type { Action, DecisionOption, GameState, ModelId } from '../../src/engine/types'
import { loadBundle, patchBundle, ter, withPending } from './helpers'

const spy = vi.hoisted(() => ({ hits: [] as any[] }))
vi.mock('../../src/engine/damage', async (orig) => {
  const real = await orig<typeof import('../../src/engine/damage')>()
  return { ...real, applyHit: (s: GameState, b: unknown, hit: any) => { spy.hits.push(hit); return real.applyHit(s, b as EditionBundle, hit) } }
})

const base = loadBundle()
type Faces = Partial<Record<DieColour, Icon[]>>
type SkillFace = { value: number | 'X'; icons: Icon[] }
/** Skill die and effect dice with fixed faces so the rolls are exact. */
function fixed(skill: SkillFace | SkillFace[], effect: Faces = {}, b: EditionBundle = base): EditionBundle {
  const d: DiceDef = structuredClone(b.singletons.dice!)
  d.skill.faces = Array.isArray(skill) ? skill : [skill]
  for (const c of ['black', 'green', 'yellow', 'blue'] as DieColour[]) d.effect[c] = [{ icons: effect[c] ?? [] }]
  return patchBundle(b, { dice: d })
}
const withWeapons = (extra: WeaponDef[], b: EditionBundle = base): EditionBundle => {
  const c = structuredClone(b)
  c.records.weapons.push(...extra)
  return c
}
const weapon = (w: Partial<WeaponDef> & { id: string }): WeaponDef =>
  ({ name: w.id, skill: 'rifle', short: 'black', dice: { short: { black: 1 } }, damage: [{ type: 'physical', value: 1 }], specials: [], cost: 0, source: 'test', ...w }) as WeaponDef

// ---------- a small arena: seat A activates its first model, seat B stands around ----------
interface Spot { x: number; z: number }
interface ArenaOpts { bundle: EditionBundle; seed?: string; A: ScenarioForce[]; B: ScenarioForce[]; at: Spot[]; action?: string }
interface Arena { state: GameState; bundle: EditionBundle; a: ModelId[]; b: ModelId[] }
function arena(o: ArenaOpts): Arena {
  const g = createGame(o.bundle, { seed: o.seed ?? 'gap', forces: { A: o.A, B: o.B } })
  const a = Object.values(g.models).filter((m) => m.owner === 'A').map((m) => m.id)
  const b = Object.values(g.models).filter((m) => m.owner === 'B').map((m) => m.id)
  const models = { ...g.models }
  ;[...a, ...b].forEach((id, i) => { models[id] = { ...models[id]!, pos: o.at[i]!, luck: 0 } })
  models[a[0]!] = { ...models[a[0]!]!, readiness: 'ready' }
  const base0: GameState = {
    ...g, models, terrain: [], markers: [], phase: 'play', round: 1, advantage: 'A',
    turn: { seat: 'A', step: 'use', readied: a[0]!, firstSeat: 'A' },
    activation: { modelId: a[0]!, actionsTaken: 1, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
    action: o.action ? { modelId: a[0]!, type: o.action, quick: false, reaction: false, free: false, itemUsed: false } : null,
  }
  const end: DecisionOption = { id: 'end', label: 'End activation', action: { type: 'turn.end', decisionId: '', seat: 'A' } }
  return { state: withPending(base0, { seat: 'A', kind: 'turn.activation', context: {}, options: [end], canPass: false }), bundle: o.bundle, a, b }
}
const patchModel = (s: GameState, id: ModelId, p: Partial<GameState['models'][string]>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...p } } })
const ok = (r: StepResult): Exclude<StepResult, { code: string }> => { if (isRejection(r)) throw new Error(`rejected: ${r.code} ${r.message}`); return r }
const act = (s: GameState, a: Omit<Action, 'decisionId' | 'seat'> & { seat?: string }): Action => ({ ...a, decisionId: s.pending.id, seat: a.seat ?? 'A' }) as Action
const pickTarget = (s: GameState, targetId: string): Action => {
  const o = s.pending.options.find((x) => x.action.targetId === targetId)
  if (!o) throw new Error(`no option for ${targetId}: ${s.pending.options.map((x) => x.id).join(',')}`)
  return o.action
}

// ---------- BC-006 ----------
describe('BC-006 a defender that wins the Battle Cry backs away without a free attack', () => {
  const touching = () => {
    const t = arena({ bundle: base, A: [{ unit: 'brute', count: 1, items: ['sledgehammer'] }], B: [{ unit: 'settler', count: 1, items: [] }], at: [{ x: 0, z: 0 }, { x: 0, z: 0 }] })
    const gap = baseRadius(t.state.models[t.a[0]!]!.base) + baseRadius(t.state.models[t.b[0]!]!.base)
    return { ...t, state: patchModel(t.state, t.a[0]!, { pos: { x: 0, z: gap } }), gap }
  }
  it('retreatPath finds a spot out of base contact, and breakContact moves there without any attack', () => {
    spy.hits.length = 0
    const t = touching()
    expect(retreatPath(t.state, base, t.b[0]!, t.a[0]!)).not.toBeNull()
    const moved = breakContact(t.state, base, t.b[0]!, t.a[0]!)
    if (isRejection(moved)) throw new Error(moved.message)
    const to = moved.state.models[t.b[0]!]!.pos
    expect(Math.hypot(to.x, to.z - t.gap)).toBeGreaterThan(t.gap + 0.01) // no longer in base contact
    expect(to.z).toBeLessThan(0) // straight away from the charger
    expect(spy.hits).toHaveLength(0)
  })
  it('RoP p41: the break-away is a Reaction, so the defender needs a Reaction marker and spends it', () => {
    // A 1-face and an X-face skill die: seeds differ in who wins the Battle Cry, so search for one the defender wins.
    const bundle = fixed([{ value: 1, icons: [] }, { value: 'X', icons: [] }])
    const scene = (seed: string, reaction: boolean) => {
      const t = arena({ bundle, seed, A: [{ unit: 'brute', count: 1, items: ['sledgehammer'] }], B: [{ unit: 'settler', count: 1, items: [] }], at: [{ x: 0, z: 3 }, { x: 0, z: 0 }], action: 'charge.go' })
      const s = patchModel(t.state, t.b[0]!, { reaction })
      const go = ok(melee.resolve(s, bundle, act(s, { type: 'charge.go', modelId: t.a[0]!, targetId: t.b[0]! })))
      const marker = ok(melee.resolve(go.state, bundle, act(go.state, { type: 'charge.marker', modelId: t.a[0]!, targetId: t.b[0]!, colour: 'black' })))
      return { ...t, marker }
    }
    let seen = 0
    for (let i = 0; i < 120 && seen < 1; i++) {
      const withMarker = scene(`bc6-${i}`, true)
      if (withMarker.marker.state.pending.kind !== 'battleCry.escape') continue
      seen++
      const bare = scene(`bc6-${i}`, false) // same seed, same dice, no marker: no offer
      expect(bare.marker.state.pending.kind).not.toBe('battleCry.escape')
      expect(bare.marker.done).toBeTruthy()
      const left = ok(melee.resolve(withMarker.marker.state, bundle, withMarker.marker.state.pending.options.find((o) => o.action.go === true)!.action))
      expect(left.state.models[withMarker.b[0]!]!.reaction).toBe(false) // the marker is removed when the Reaction is complete
      expect(left.state.events.some((e) => e.type === 'battleCryEscape')).toBe(true)
    }
    expect(seen).toBe(1)
  })
  it('a break-away that stays in contact, or runs further than a Quick Move, is refused', () => {
    const t = touching()
    expect(isRejection(breakContact(t.state, base, t.b[0]!, t.a[0]!, [{ x: 0.5, z: 0.4 }]))).toBe(true)
    expect(isRejection(breakContact(t.state, base, t.b[0]!, t.a[0]!, [{ x: 0, z: -30 }]))).toBe(true)
  })
})

// ---------- DMG-005 ----------
describe('DMG-005 a Ready, unused model eliminated in an Action flips luck for one free Quick Action, then goes', () => {
  const killer = weapon({ id: 'test-cannon', damage: [{ type: 'physical', value: 9 }] })
  const back = weapon({ id: 'test-return', damage: [{ type: 'physical', value: 1 }] })
  /** B's only model has one Health left and a rifle; A shoots it with a 9-damage rifle. */
  function scene(seed: string, readiness: 'ready' | 'used' | 'unready' = 'ready') {
    const bundle = fixed({ value: 1, icons: [] }, {}, withWeapons([killer, back]))
    const t = arena({
      bundle, seed, A: [{ unit: 'sole-survivor', count: 1, items: ['test-cannon'] }], B: [{ unit: 'super-mutant', count: 1, items: ['test-return'] }],
      at: [{ x: 0, z: 4 }, { x: 0, z: -4 }], action: 'shoot.begin',
    })
    const victim = t.b[0]!
    const s = patchModel(t.state, victim, { readiness, damage: healthOf(t.state, bundle, victim) - 1 })
    const begin = ok(attack.resolve(s, bundle, act(s, { type: 'shoot.begin', modelId: t.a[0]!, weaponUid: `${t.a[0]}/test-cannon` })))
    const fire = ok(attack.resolve(begin.state, bundle, pickTarget(begin.state, victim)))
    return { ...t, bundle, victim, fire }
  }
  const luckOf = (s: GameState) => (s.events.find((e) => e.type === 'eliminationLuck') as { lucky?: boolean } | undefined)?.lucky
  const find = (want: boolean | undefined, readiness: 'ready' | 'used' | 'unready' = 'ready') => {
    for (let i = 0; i < 80; i++) {
      const r = scene(`dmg5-${i}`, readiness)
      if (luckOf(r.fire.state) === want) return r
    }
    throw new Error('no seed gave that luck')
  }
  it('luck side down: the model is simply removed and the Action ends at once', () => {
    const r = find(false)
    expect(r.fire.done?.type).toBe('shoot.fire')
    expect(r.fire.state.models[r.victim]!.life).toBe('dead')
    expect(r.fire.state.pending.kind).not.toBe('damage.dying')
  })
  it('luck side up: the owner is asked for a free Quick Action (declining is listed first)', () => {
    const r = find(true)
    expect(r.fire.done).toBeUndefined() // the Action waits for the free one
    expect(r.fire.state.pending.kind).toBe('damage.dying')
    expect(r.fire.state.pending.seat).toBe('B')
    expect(r.fire.state.pending.options[0]!.action).toMatchObject({ type: 'damage.dying', take: false })
    expect(r.fire.state.pending.options.length).toBeGreaterThan(1)
    expect(r.fire.state.models[r.victim]!.life).toBe('dead') // still off the table meanwhile
  })
  it('declining hands back the original Action and the model stays removed', () => {
    const r = find(true)
    const pass = ok(damage.resolve(r.fire.state, r.bundle, r.fire.state.pending.options[0]!.action))
    expect(pass.done).toMatchObject({ modelId: r.a[0], type: 'shoot.fire' })
    expect(pass.state.models[r.victim]!.life).toBe('dead')
    expect(pass.state.action).toMatchObject({ modelId: r.a[0], type: 'shoot.begin' }) // the attacker's Action context is back
  })
  it('taking it lets the eliminated model act once (here: shoot back), then it is removed for good', () => {
    const r = find(true)
    const shoot = r.fire.state.pending.options.find((o) => (o.action.inner as Action | undefined)?.type === 'shoot.begin')!
    const started = ok(damage.resolve(r.fire.state, r.bundle, shoot.action))
    expect(started.state.models[r.victim]!.life).toBe('active') // alive for its Action
    expect(started.state.pending.kind).toBe('shoot.target')
    const fired = ok(attack.resolve(started.state, r.bundle, pickTarget(started.state, r.a[0]!)))
    expect(fired.done).toMatchObject({ modelId: r.a[0], type: 'shoot.fire' }) // the original Action's done, not the free one's
    const answers = fired.state.events.filter((e) => e.type === 'attack' && (e as { attackerId?: string }).attackerId === r.victim)
    expect(answers).toHaveLength(1)
    expect(fired.state.models[r.victim]!.life).toBe('dead')
    expect(fired.state.models[r.victim]!.offTable).toBe(true)
    expect(fired.state.models[r.victim]!.tokens['freeAction']).toBeUndefined()
  })
  it("through the controller: declining or taking the free Action both end back on the shooter's activation menu", () => {
    const killer2 = weapon({ id: 'test-cannon', damage: [{ type: 'physical', value: 9 }] })
    const live = (seed: string) => {
      const bundle = fixed({ value: 1, icons: [] }, {}, withWeapons([killer2, back]))
      const t = arena({
        bundle, seed, A: [{ unit: 'sole-survivor', count: 1, items: ['test-cannon'] }], B: [{ unit: 'super-mutant', count: 2, items: ['test-return'] }], // a second B model keeps the game from ending
        at: [{ x: 0, z: 4 }, { x: 0, z: -4 }, { x: 8, z: -8 }],
      })
      let s = patchModel(t.state, t.b[0]!, { readiness: 'ready', damage: healthOf(t.state, bundle, t.b[0]!) - 1 })
      s = { ...s, activation: { ...s.activation!, actionsTaken: 0 } }
      s = withPending(s, { seat: 'A', kind: 'turn.activation', context: { modelId: t.a[0] }, options: activationMenu(s, bundle, t.a[0]!), canPass: false })
      const step = (st: GameState, a: Action) => { const r = apply(st, bundle, a); if (!r.ok) throw new Error(`${a.type}: ${r.rejection.message}`); return r.state }
      const begin = s.pending.options.find((o) => o.action.type === 'shoot.begin')!.action
      const afterBegin = step(s, begin)
      if (process.env.DBG) process.stderr.write(JSON.stringify([afterBegin.pending.kind, afterBegin.pending.options.map((o) => o.id)]) + '\n')
      return { t, bundle, afterFire: step(afterBegin, pickTarget(afterBegin, t.b[0]!)), step }
    }
    let seen = 0
    for (let i = 0; i < 60 && seen < 2; i++) {
      const g = live(`ctl-${i}`)
      if (g.afterFire.pending.kind !== 'damage.dying') { expect(g.afterFire.pending.kind).toBe('turn.activation'); continue }
      seen++
      const dying = g.afterFire.pending
      const declined = g.step(g.afterFire, dying.options[0]!.action)
      expect(declined.pending).toMatchObject({ kind: 'turn.activation', seat: 'A' })
      expect(declined.models[g.t.b[0]!]!.life).toBe('dead')
      const shoot = dying.options.find((o) => (o.action.inner as Action | undefined)?.type === 'shoot.begin')!.action
      const started = g.step(g.afterFire, shoot)
      expect(started.pending).toMatchObject({ kind: 'shoot.target', seat: 'B' })
      const answered = g.step(started, pickTarget(started, g.t.a[0]!))
      expect(answered.pending).toMatchObject({ kind: 'turn.activation', seat: 'A' })
      expect(answered.models[g.t.b[0]!]!.life).toBe('dead')
      expect(answered.events.some((e) => e.type === 'attack' && (e as unknown as { attackerId: string }).attackerId === g.t.b[0])).toBe(true)
    }
    expect(seen).toBe(2)
  })
  it('ERR p.8: the activating model is still Ready, so one killed by a withdrawal free attack flips luck for its own free Quick Action', () => {
    const bundle = fixed({ value: 1, icons: [] }, {}, withWeapons([killer]))
    const gap = baseRadius(32) + baseRadius(40)
    const scene2 = (seed: string) => {
      const t = arena({
        bundle, seed, A: [{ unit: 'sole-survivor', count: 1, items: [] }, { unit: 'sole-survivor', count: 1, items: [] }], B: [{ unit: 'super-mutant', count: 1, items: ['sledgehammer'] }],
        at: [{ x: 0, z: gap }, { x: 12, z: 12 }, { x: 0, z: 0 }],
      })
      const mover = t.a[0]!
      let s = patchModel(t.state, mover, { damage: healthOf(t.state, bundle, mover) - 1 })
      s = { ...s, activation: { ...s.activation!, actionsTaken: 0 }, action: { modelId: mover, type: 'move.go', quick: false, reaction: false, free: false, itemUsed: false } }
      const go = ok(movement.resolve(s, bundle, act(s, { type: 'move.go', modelId: mover })))
      const out = ok(movement.resolve(go.state, bundle, act(go.state, { type: 'move.to', modelId: mover, path: [{ x: 0, z: gap + 3 }] })))
      return { ...t, mover, out }
    }
    let seen = 0
    for (let i = 0; i < 80 && seen < 1; i++) {
      const r = scene2(`err8-${i}`)
      const ev = r.out.state.events.find((e) => e.type === 'eliminationLuck') as { lucky?: boolean; modelId?: string } | undefined
      if (!ev?.lucky) continue
      seen++
      expect(ev.modelId).toBe(r.mover) // the activating model earned the flip
      expect(r.out.state.pending.kind).toBe('damage.dying')
      expect(r.out.state.pending.seat).toBe('A')
      expect(r.out.done).toBeUndefined()
      expect(r.out.state.models[r.mover]!.life).toBe('dead')
      const pass = ok(damage.resolve(r.out.state, bundle, r.out.state.pending.options[0]!.action))
      expect(pass.done).toMatchObject({ modelId: r.mover, type: 'move.to' })
      expect(pass.state.models[r.mover]!.offTable).toBe(true)
      expect(pass.state.models[r.mover]!.tokens['freeAction']).toBeUndefined()
    }
    expect(seen).toBe(1)
  })
  it('a model that is not Ready (Used or Unready) gets no luck flip at all', () => {
    for (const rd of ['used', 'unready'] as const) {
      const r = scene('dmg5-x', rd)
      expect(r.fire.state.events.some((e) => e.type === 'eliminationLuck')).toBe(false)
      expect(r.fire.done).toBeTruthy()
    }
  })
  it('a removal outside any Action (no Action context) earns nothing', () => {
    const t = arena({ bundle: base, A: [{ unit: 'sole-survivor', count: 1, items: [] }], B: [{ unit: 'super-mutant', count: 1, items: [] }], at: [{ x: 0, z: 4 }, { x: 0, z: -4 }] })
    const idle = patchModel(t.state, t.b[0]!, { readiness: 'ready' })
    const dead = applyDirectDamage(idle, base, t.b[0]!, 99, { reason: 'test' }).state
    expect(dead.models[t.b[0]!]!.life).toBe('dead')
    expect(dead.events.some((e) => e.type === 'eliminationLuck')).toBe(false)
  })
})

// ---------- WPN-008 / PREP-016 ----------
describe('WPN-008 Walked Fire', () => {
  const gat = weapon({
    id: 'test-gatling', walkedFire: { shots: 3, colour: 'yellow' }, critical: { rating: 3, damage: [{ type: 'physical', value: 2 }] },
  })
  const crew: ScenarioForce[] = [{ unit: 'super-mutant', count: 4, items: [] }]
  const at = [{ x: 0, z: 4 }, { x: 0, z: -4 }, { x: 2, z: -4 }, { x: -2, z: -4 }, { x: 14, z: -4 }]
  function scene(bundle: EditionBundle, seed = 'walk') {
    const b2 = withWeapons([gat], bundle)
    const t = arena({ bundle: b2, seed, A: [{ unit: 'sole-survivor', count: 1, items: ['test-gatling'] }], B: crew, at, action: 'shoot.begin' })
    const begin = ok(attack.resolve(t.state, b2, act(t.state, { type: 'shoot.begin', modelId: t.a[0]!, weaponUid: `${t.a[0]}/test-gatling` })))
    return { ...t, begin }
  }
  const walkOf = (s: GameState) => (s.pending.context as { walk?: { left: number } }).walk
  /** Fire the listed targets in order; returns the last result and the pending kind seen before each shot. */
  function fireAll(t: ReturnType<typeof scene>, targets: ModelId[], from = t.begin) {
    let r = from
    const kinds: string[] = []
    for (const id of targets) {
      kinds.push(r.state.pending.kind)
      r = ok(attack.resolve(r.state, t.bundle, pickTarget(r.state, id)))
    }
    return { r, kinds }
  }
  it('one Shoot fires N shots: a fresh target menu after each, one done at the end', () => {
    const t = scene(fixed({ value: 1, icons: [] }))
    expect(t.begin.state.pending.kind).toBe('shoot.target')
    expect(walkOf(t.begin.state)?.left).toBe(3)
    const mid = ok(attack.resolve(t.begin.state, t.bundle, pickTarget(t.begin.state, t.b[0]!)))
    expect(mid.done).toBeUndefined()
    expect(mid.state.pending.kind).toBe('shoot.target') // PREP-016: nothing can react in the middle of the Action
    expect(walkOf(mid.state)?.left).toBe(2)
    const { r, kinds } = fireAll(t, [t.b[0]!, t.b[0]!, t.b[0]!])
    expect(kinds).toEqual(['shoot.target', 'shoot.target', 'shoot.target'])
    expect(r.done).toMatchObject({ modelId: t.a[0], type: 'shoot.fire' })
  })
  it('each successive hit on the same target adds one armor-reduction icon; one armor boost goes after every hit', () => {
    spy.hits.length = 0
    const t = scene(fixed({ value: 1, icons: [] }))
    const boosted = { ...t.begin, state: patchModel(t.begin.state, t.b[0]!, { armorBoost: 3 }) }
    const { r } = fireAll(t, [t.b[0]!, t.b[0]!, t.b[0]!], boosted)
    expect(spy.hits.map((h) => h.ar)).toEqual([0, 1, 2])
    expect(r.state.models[t.b[0]!]!.armorBoost).toBe(0) // ERR p.10: one per hit, not one per Action
    // The engine owns the numbers the UI shows: the target menu for shot 2 and 3 reports the streak on the same target only.
    const second = ok(attack.resolve(t.begin.state, t.bundle, pickTarget(t.begin.state, t.b[0]!)))
    type Row = { targetId: string; extraAr?: number }
    const rowsOf = (st: GameState) => (st.pending.context as { targets: Row[] }).targets
    expect(rowsOf(second.state).find((x) => x.targetId === t.b[0])!.extraAr).toBe(1)
    expect(rowsOf(second.state).filter((x) => x.targetId !== t.b[0]).every((x) => !x.extraAr)).toBe(true)
    expect(second.state.pending.options.find((o) => o.action.targetId === t.b[0])!.label).toContain('+1 armor reduction')
    const third = ok(attack.resolve(second.state, t.bundle, pickTarget(second.state, t.b[0]!)))
    expect(rowsOf(third.state).find((x) => x.targetId === t.b[0])!.extraAr).toBe(2)
    // expectedDamage with the earned icons never reads lower than without them, and is higher against armor that the icons cut through
    const wuid = `${t.a[0]}/test-gatling`
    const none = expectedDamage(second.state, t.bundle, t.a[0]!, t.b[0]!, { weaponUid: wuid })
    const withAr = expectedDamage(second.state, t.bundle, t.a[0]!, t.b[0]!, { weaponUid: wuid, extraAr: 2 })
    expect(withAr.expected).toBeGreaterThanOrEqual(none.expected)
  })
  it('a new target restarts the climb, and the next shot may go to any viable target within the weapon colour of the last one', () => {
    spy.hits.length = 0
    const t = scene(fixed({ value: 1, icons: [] }))
    const first = ok(attack.resolve(t.begin.state, t.bundle, pickTarget(t.begin.state, t.b[0]!)))
    const offered = first.state.pending.options.map((o) => o.action.targetId)
    expect(offered).toEqual(expect.arrayContaining([t.b[0], t.b[1], t.b[2]]))
    expect(offered).not.toContain(t.b[3]) // 14 in. away is outside Yellow of the last target
    const second = ok(attack.resolve(first.state, t.bundle, pickTarget(first.state, t.b[1]!)))
    ok(attack.resolve(second.state, t.bundle, pickTarget(second.state, t.b[1]!)))
    expect(spy.hits.map((h) => [h.targetId, h.ar])).toEqual([[t.b[0], 0], [t.b[1], 0], [t.b[1], 1]])
  })
  it('a miss resets the climb: a hit carries as many extra AR icons as hits since the last miss or change', () => {
    const dice = fixed([{ value: 1, icons: [] }, { value: 'X', icons: [] }])
    let sawMiss = false
    for (let i = 0; i < 30; i++) {
      spy.hits.length = 0
      const t = scene(dice, `walk-miss-${i}`)
      const { r } = fireAll(t, [t.b[0]!, t.b[0]!, t.b[0]!])
      const shots = r.state.events.filter((e) => e.type === 'attack').map((e) => (e as unknown as { success: boolean }).success)
      let streak = 0
      const want: number[] = []
      for (const hit of shots) { if (hit) { want.push(streak); streak++ } else { streak = 0; sawMiss = true } }
      expect(spy.hits.map((h) => h.ar)).toEqual(want)
    }
    expect(sawMiss).toBe(true)
  })
  it('at most 1 AP and 1 Critical Point come from the whole Shoot Action', () => {
    const t = scene(fixed({ value: 1, icons: ['AP', 'AP', 'CP'] }))
    const heroic = { ...t.begin, state: patchModel(t.begin.state, t.a[0]!, { heroic: true }) }
    const { r } = fireAll(t, [t.b[0]!, t.b[0]!, t.b[0]!], heroic)
    expect(r.state.activation!.ap).toBe(1)
    expect(r.state.models[t.a[0]!]!.carried.find((c) => c.defId === 'test-gatling')!.cp).toBe(1)
  })
  it('every shot is a trigger, and the answer comes once after the whole Action', () => {
    const t = scene(fixed({ value: 1, icons: [] }))
    const { r } = fireAll(t, [t.b[0]!, t.b[1]!, t.b[1]!])
    const hits = r.done!.triggers.filter((x) => x.kind === 'hit').map((x) => x.targetId)
    expect(hits).toEqual(expect.arrayContaining([t.b[0], t.b[1]]))
    expect(new Set(r.done!.triggers.map((x) => JSON.stringify(x))).size).toBe(r.done!.triggers.length) // no duplicate triggers
  })
  it('a Critical Attack with a Walked Fire weapon is a single shot', () => {
    const bundle = withWeapons([gat], fixed({ value: 1, icons: [] }))
    const t0 = arena({ bundle, A: [{ unit: 'sole-survivor', count: 1, items: ['test-gatling'] }], B: crew, at, action: 'shoot.begin' })
    const s = patchModel(t0.state, t0.a[0]!, { heroic: true, carried: t0.state.models[t0.a[0]!]!.carried.map((c) => ({ ...c, cp: 3 })) })
    const begin = ok(attack.resolve(s, bundle, act(s, { type: 'shoot.begin', modelId: t0.a[0]!, weaponUid: `${t0.a[0]}/test-gatling`, critical: true })))
    const shot = ok(attack.resolve(begin.state, bundle, pickTarget(begin.state, t0.b[0]!)))
    expect(shot.done).toBeTruthy()
  })
})

// ---------- WPN-003 ----------
describe('WPN-003 mines', () => {
  // Trigger Orange (2 in. from the marker to a base edge); the blast is Orange across (small) or Red across (big).
  const mine = weapon({
    id: 'test-mine', name: 'Test Mine', skill: 'throw', short: 'orange', dice: {}, mine: { trigger: 'orange' }, limitedUse: true,
    damage: [{ type: 'physical', value: 3, area: 'orange' }],
  })
  const big = weapon({ ...mine, id: 'test-mine-big', name: 'Big Mine', damage: [{ type: 'physical', value: 3, area: 'red' }] })
  const bundle = fixed({ value: 1, icons: [] }, {}, withWeapons([mine, big]))
  const readyLog = { type: 'turn.ready', decisionId: 'd', seat: 'A', modelId: 'x' } as Action
  /** A's sapper (0, 2.5) holds both mines; a second A model, two B models. The marker goes down at the origin. */
  function scene() {
    return arena({
      bundle, A: [{ unit: 'sole-survivor', count: 1, items: ['test-mine', 'test-mine-big'] }, { unit: 'sole-survivor', count: 1, items: [] }],
      B: [{ unit: 'super-mutant', count: 2, items: [] }],
      at: [{ x: 0, z: 2.5 }, { x: 8, z: 8 }, { x: 2, z: -5 }, { x: 14, z: -10 }], action: 'move.mine',
    })
  }
  type Scene = ReturnType<typeof scene>
  const place = (t: Scene, at?: { x: number; z: number }, id = 'test-mine') =>
    ok(movement.resolve(t.state, bundle, act(t.state, { type: 'move.mine', modelId: t.a[0]!, weaponUid: `${t.a[0]}/${id}`, ...(at ? { at } : {}) })))
  // apply() appends the placing action to the log after it resolves, then the owner's next turn begins with a 'turn.ready'.
  const armed = (s: GameState): GameState => ({ ...s, log: [...s.log, { ...readyLog, type: 'move.mine' } as Action, readyLog] })
  /** Models that took a hit, from the event log (mines.ts sits in an import cycle with damage.ts, so the applyHit spy cannot see it). */
  const struck = (s: GameState): string[] => s.events.filter((e) => e.type === 'damage').map((e) => (e as unknown as { targetId: string }).targetId)
  /** A full Move for `id` along `path` (the mover is made the active model). */
  function walk(s: GameState, id: ModelId, path: { x: number; z: number }[]) {
    const owner = s.models[id]!.owner
    const s0: GameState = { ...s, activation: { ...s.activation!, modelId: id }, action: { modelId: id, type: 'move.go', quick: false, reaction: false, free: false, itemUsed: false } }
    const go = ok(movement.resolve(s0, bundle, act(s0, { type: 'move.go', modelId: id, seat: owner })))
    return ok(movement.resolve(go.state, bundle, act(go.state, { type: 'move.to', modelId: id, path, seat: owner })))
  }

  it('an unengaged model holding a mine is offered "place a mine" with its Move; an engaged one is not', () => {
    const t = scene()
    expect(movement.options(t.state, bundle, t.a[0]!).map((o) => o.action.type)).toContain('move.mine')
    expect(movement.options(t.state, bundle, t.a[1]!).map((o) => o.action.type)).not.toContain('move.mine') // no mine card on the second model
    const stuck = patchModel(t.state, t.b[0]!, { pos: { x: baseRadius(32) + baseRadius(40), z: 2.5 } })
    expect(movement.options(stuck, bundle, t.a[0]!).map((o) => o.action.type)).not.toContain('move.mine')
    expect(movement.resolve(stuck, bundle, act(stuck, { type: 'move.mine', modelId: t.a[0]!, weaponUid: `${t.a[0]}/test-mine` }))).toMatchObject({ code: 'E_ENGAGED' })
  })
  it('placing needs no movement, lands within Orange of the model, uses the card up and is a Trigger', () => {
    const t = scene()
    const r = place(t, { x: 0, z: 0 })
    expect(minesOf(r.state)).toEqual([expect.objectContaining({ owner: 'A', pos: { x: 0, z: 0 } })])
    expect(r.state.models[t.a[0]!]!.pos).toEqual({ x: 0, z: 2.5 })
    expect(r.state.models[t.a[0]!]!.carried.find((c) => c.defId === 'test-mine')!.spent).toBe(true)
    expect(r.done).toMatchObject({ type: 'move.mine', triggers: [expect.objectContaining({ kind: 'action', sourceId: t.a[0] })] })
    expect(movement.resolve(t.state, bundle, act(t.state, { type: 'move.mine', modelId: t.a[0]!, weaponUid: `${t.a[0]}/test-mine`, at: { x: 0, z: -1 } }))).toMatchObject({ code: 'E_TOO_FAR' })
    expect(minesOf(place(t).state)).toHaveLength(1) // the default drop works too
  })
  it("it is inactive until the start of the owner's next turn, then fires on an enemy that ends an Action in the area", () => {
    const t = scene()
    const placed = place(t, { x: 0, z: 0 }).state
    const quiet = walk(placed, t.b[0]!, [{ x: 0.5, z: -1 }]) // B ends inside the area but the mine is not live yet
    expect(minesOf(quiet.state)).toHaveLength(1)
    expect(struck(quiet.state)).toEqual([])
    const boom = walk(armed(placed), t.b[0]!, [{ x: 0.5, z: -1 }])
    expect(minesOf(boom.state)).toHaveLength(0)
    expect(boom.state.events.some((e) => e.type === 'mineDetonated')).toBe(true)
    expect(struck(boom.state)).toEqual([t.b[0]])
    expect(boom.state.events.find((e) => e.type === 'damage')).toMatchObject({ perType: [{ type: 'physical', total: 3 }] }) // the card's damage, no dice icons
  })
  it("only opposing models set it off: the owner's side walks over it freely", () => {
    const t = scene()
    const live = patchModel(armed(place(t, { x: 0, z: 0 }).state), t.a[1]!, { pos: { x: 3, z: -1 } })
    const moved = walk(live, t.a[1]!, [{ x: 1, z: -1 }])
    expect(minesOf(moved.state)).toHaveLength(1)
    expect(struck(moved.state)).toEqual([])
  })
  it('the blast hits every model it touches, friend or foe, once each', () => {
    const t = scene()
    let s = armed(place(t, { x: 0, z: 0 }).state)
    s = patchModel(s, t.a[1]!, { pos: { x: -1, z: 0.5 } }) // a friend standing in the blast
    const boom = walk(s, t.b[0]!, [{ x: 0.8, z: -1 }])
    expect(struck(boom.state).sort()).toEqual([t.a[1], t.b[0]].sort()) // the far B model and the sapper are clear
    expect(boom.state.events.filter((e) => e.type === 'mineDetonated')).toHaveLength(1)
  })
  it('terrain that blocks line of sight stops the blast for the model behind it', () => {
    const t = scene()
    let s = armed(place(t, { x: 0, z: 0 }).state)
    s = { ...s, terrain: [ter('wall', 'building', 0.8, 0, 0.3, 4, 4)] }
    s = patchModel(patchModel(s, t.a[1]!, { pos: { x: 1.6, z: 0 } }), t.b[0]!, { pos: { x: -1.5, z: -4 } }) // behind the wall, inside the blast radius
    const boom = walk(s, t.b[0]!, [{ x: -0.5, z: -1 }])
    expect(boom.state.events.some((e) => e.type === 'mineDetonated')).toBe(true)
    expect(struck(boom.state)).toEqual([t.b[0]])
  })
  it('a Move that crosses the area but ends outside it pauses at the first touch, resolves the blast, and carries on', () => {
    const t = scene()
    let s = armed(place(t, { x: 0, z: 0 }, 'test-mine-big').state)
    s = patchModel(patchModel(s, t.a[0]!, { pos: { x: -8, z: 8 } }), t.b[0]!, { pos: { x: 1.5, z: -2.5 } })
    const moved = walk(s, t.b[0]!, [{ x: 1.5, z: 2.5 }])
    expect(minesOf(moved.state)).toHaveLength(0)
    expect(moved.state.events.some((e) => e.type === 'mineDetonated')).toBe(true)
    expect(struck(moved.state)).toContain(t.b[0]) // the pause point is inside the Red blast
    expect(moved.state.models[t.b[0]!]!.pos).toEqual({ x: 1.5, z: 2.5 }) // then the move was completed
  })
  it('a Charge that crosses a live mine area on the way to contact pauses for the blast; a charger that survives goes on, one that dies does not', () => {
    // The mine (B's, Red blast) sits at (0, 5.5); the brute starts at (0, 8.5), outside the area, and ends in contact with the settler near the origin.
    const charge = (hurt: boolean) => {
      const t = arena({
        bundle, A: [{ unit: 'brute', count: 1, items: ['sledgehammer'] }, { unit: 'sole-survivor', count: 1, items: [] }], B: [{ unit: 'settler', count: 1, items: [] }, { unit: 'settler', count: 1, items: [] }],
        at: [{ x: 0, z: 8.5 }, { x: 14, z: 14 }, { x: 0, z: 0 }, { x: -14, z: -14 }], action: 'charge.go',
      })
      const charger = t.a[0]!
      let s = hurt ? patchModel(t.state, charger, { damage: healthOf(t.state, bundle, charger) - 1 }) : t.state
      const mine = { id: 'mine:x', owner: 'B', pos: { x: 0, z: 5.5 }, weaponId: 'test-mine-big', placedAt: -1 }
      s = { ...s, scenario: { ...s.scenario, mines: [mine] } as unknown as GameState['scenario'], log: [{ type: 'turn.ready', decisionId: 'd', seat: 'B', modelId: 'x' } as Action] }
      const out = ok(melee.resolve(s, bundle, act(s, { type: 'charge.go', modelId: charger, targetId: t.b[0]! })))
      return { ...t, charger, out }
    }
    const hit = charge(false)
    expect(hit.out.state.events.some((e) => e.type === 'mineDetonated')).toBe(true)
    expect(struck(hit.out.state)).toContain(hit.charger)
    expect(minesOf(hit.out.state)).toHaveLength(0)
    expect(hit.out.state.pending.kind).toBe('charge.marker') // the charger lived: the charge goes on to contact
    expect(Math.hypot(hit.out.state.models[hit.charger]!.pos.x, hit.out.state.models[hit.charger]!.pos.z)).toBeLessThan(3)
    const dead = charge(true)
    expect(dead.out.state.events.some((e) => e.type === 'mineDetonated')).toBe(true)
    expect(dead.out.state.models[dead.charger]!.life).toBe('dead')
    expect(dead.out.state.pending.kind).not.toBe('charge.marker')
  })
})
