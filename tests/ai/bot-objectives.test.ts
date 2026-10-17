// Objective play and the late decision kinds (spec 30 s13). Named BOT-<n>. Uses the real engine bundle; scenes are the
// shipped box scenarios with a model or two moved on the view, as eval.test.ts does.
import { describe, expect, it } from 'vitest'
import { createAiDecider, makeContext } from '../../src/ai/decider'
import { attackValue, modelValue, objectiveValue } from '../../src/ai/eval'
import { attackFactor, claimableSuits, nukeCaution, nukeRisk, sceneOf, stall, suitValue, touchesTower, urgency } from '../../src/ai/objectives'
import { spotScore } from '../../src/ai/moves'
import { buildThreatMap } from '../../src/ai/threat'
import { pickBest, POLICIES } from '../../src/ai/policies'
import { MISS_PER_MS, newMemory, TIERS, timeUp, type AiContext, type AiView, type DecisionKind } from '../../src/ai/types'
import { oddsStats } from '../../src/ai/budget'
import { apply } from '../../src/engine/apply'
import { rulerInches } from '../../src/engine/edition'
import { baseRadius } from '../../src/engine/geometry'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, MarkerState, ModelState, PendingDecision, SeatId } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../engine/helpers'

const bundle = loadBundle()

interface Scene { state: GameState; seat: SeatId }
const scene = (id: string, seed = 'bot', seat: SeatId = 'A'): Scene => ({ state: createGame(bundle, { seed, scenarioId: id }), seat })

/** A context over the scene's view with models, markers, round and the pending decision patched. */
function ctxOf(sc: Scene, patch: {
  models?: (ms: Record<string, ModelState>) => void
  markers?: (mk: MarkerState[]) => MarkerState[]
  round?: number
  pending?: PendingDecision
  legal?: Action[]
} = {}): AiContext {
  const v = view(sc.state, sc.seat)
  const models = Object.fromEntries(Object.entries(v.models).map(([k, m]) => [k, { ...m, carried: [...m.carried], pos: { ...m.pos } }]))
  patch.models?.(models)
  const markers = patch.markers ? patch.markers((v.markers ?? []).map((m) => ({ ...m, props: { ...m.props } }))) : v.markers
  const pending = patch.pending ?? sc.state.pending
  const av = { ...v, models, markers, round: patch.round ?? v.round, pending } as AiView
  return makeContext('normal', av, pending, patch.legal ?? legalActions(sc.state), { seed: 'b', bundle, budgetMs: 5000 }, newMemory())
}
const own = (c: AiContext, profile?: string) => Object.values(c.view.models).filter((m) => m.owner === c.seat && (!profile || m.profileId === profile))
const foes = (c: AiContext, profile?: string) => Object.values(c.view.models).filter((m) => m.owner !== c.seat && (!profile || m.profileId === profile))

describe('BOT objective play (spec 30 s13)', () => {
  it('BOT-001 the policy table covers battleCry.escape and damage.dying', () => {
    for (const k of ['battleCry.escape', 'damage.dying'] as DecisionKind[]) expect(POLICIES[k], k).toBeTypeOf('function')
  })

  it('BOT-002 battleCry.escape: backs away (go true) from a charger that will probably kill it, stands against a weaker one', () => {
    const sc = scene('box-1')
    const pend = (a: string, b: string): PendingDecision => ({
      id: 'd:esc', seat: 'A', kind: 'battleCry.escape', canPass: false, context: { modelId: a, chargerId: b },
      options: [
        { id: 'stay', label: 'stay', action: { type: 'battleCry.escape', modelId: a, go: false } },
        { id: 'go', label: 'go', action: { type: 'battleCry.escape', modelId: a, go: true } },
      ],
    } as unknown as PendingDecision)
    // A hurt Initiate facing the Sole Survivor in melee, against a healthy Knight facing a Settler.
    const weak = ctxOf(sc)
    const meW = own(weak, 'initiate')[0]!, foeW = foes(weak, 'sole-survivor')[0]!
    const pW = pend(meW.id, foeW.id)
    const askW = ctxOf(sc, { models: (ms) => { Object.assign(ms[meW.id]!, { pos: { x: 0, z: 0 }, damage: 3 }); ms[foeW.id]!.pos = { x: 1.2, z: 0 } }, pending: pW, legal: pW.options.map((o) => o.action) })
    const a1 = POLICIES['battleCry.escape']!(askW)
    expect(a1?.type).toBe('battleCry.escape')
    expect(a1?.go).toBe(true)
    const meS = own(weak, 'knight')[0]!, foeS = foes(weak, 'settler')[0]!
    const pS = pend(meS.id, foeS.id)
    const askS = ctxOf(sc, { models: (ms) => { ms[meS.id]!.pos = { x: 0, z: 0 }; ms[foeS.id]!.pos = { x: 1.3, z: 0 } }, pending: pS, legal: pS.options.map((o) => o.action) })
    expect(POLICIES['battleCry.escape']!(askS)?.go).toBe(false)
  })

  it('BOT-003 damage.dying: takes a free attack when one is on offer, passes when only a move is', () => {
    const sc = scene('box-1')
    const c0 = ctxOf(sc)
    const me = own(c0, 'knight')[0]!, foe = foes(c0, 'settler')[0]!
    const gun = me.carried.find((c) => c.kind === 'weapon' && c.defId === 'laser-rifle' || c.defId === 'assault-rifle')!
    const mkPending = (inner: Action[]): PendingDecision => ({
      id: 'd:dy', seat: 'A', kind: 'damage.dying', canPass: false, context: { modelId: me.id },
      options: [
        { id: 'pass', label: 'pass', action: { type: 'damage.dying', modelId: me.id, take: false } },
        ...inner.map((i, n) => ({ id: `take:${n}`, label: 'take', action: { type: 'damage.dying', modelId: me.id, take: true, inner: i } })),
      ],
    } as unknown as PendingDecision)
    const ask = (p: PendingDecision) => ctxOf(sc, {
      models: (ms) => { Object.assign(ms[me.id]!, { life: 'dead', offTable: true, pos: { x: 0, z: 0 } }); ms[foe.id]!.pos = { x: 4, z: 0 } },
      pending: p, legal: p.options.map((o) => o.action),
    })
    const shoot = { type: 'shoot.begin', weaponUid: gun.uid } as unknown as Action
    const move = { type: 'move.go' } as unknown as Action
    expect(POLICIES['damage.dying']!(ask(mkPending([move, shoot])))?.take).toBe(true)
    expect(POLICIES['damage.dying']!(ask(mkPending([move])))?.take).toBe(false)
  })

  it('BOT-004 box-1: a Brotherhood model is drawn to an unclaimed suit, claiming scores high, scavengers feel nothing', () => {
    const sc = scene('box-1')
    const c = ctxOf(sc)
    const knight = own(c, 'knight')[0]!
    const suit = (c.view.markers ?? []).find((m) => m.face === 'power-armor-suit')!
    expect(sceneOf(c).side).toBe('brotherhood')
    expect(claimableSuits(c, knight.id).length).toBe(3)
    expect(suitValue(c, suit)).toBeGreaterThan(30)
    const near = objectiveValue(c, knight.id, { x: suit.pos.x + 1.5, z: suit.pos.z })
    const far = objectiveValue(c, knight.id, { x: suit.pos.x + 25, z: suit.pos.z + 25 })
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0)
    // Once every suit is claimed the pull is gone, and the scavengers never had one.
    const claimed = ctxOf(sc, { markers: (mk) => mk.map((m) => ({ ...m, props: { ...m.props, claimed: true } })) })
    expect(claimableSuits(claimed, own(claimed, 'knight')[0]!.id)).toEqual([])
    const scav = ctxOf(scene('box-1', 'bot', 'B'))
    const sole = own(scav, 'sole-survivor')[0]!
    expect(claimableSuits(scav, sole.id)).toEqual([])
  })

  it('BOT-005 box-1: urgency is 0 early and reaches 1 on the last round', () => {
    const sc = scene('box-1')
    expect(urgency(ctxOf(sc, { round: 1 }))).toBe(0)
    expect(urgency(ctxOf(sc, { round: 4 }))).toBeGreaterThan(0)
    expect(urgency(ctxOf(sc, { round: 6 }))).toBeCloseTo(1, 9)
    expect(urgency(ctxOf(scene('box-3'), { round: 6 }))).toBe(0)
  })

  it('BOT-006 box-2: an attack that may set the nuke off costs something, and the cost fades as the defenders\' timer runs down', () => {
    const sc = scene('box-2', 'bot', 'B')
    const c = ctxOf(sc, { round: 1 })
    const nukeMk = (c.view.markers ?? []).find((m) => m.face === 'mini-nuke')!
    const target = foes(c)[0]!
    const mine = 200
    const nearPos = { x: nukeMk.pos.x + 1, z: nukeMk.pos.z }
    const farPos = { x: nukeMk.pos.x + 20, z: nukeMk.pos.z }
    expect(sceneOf(c).side).toBe('attacker')
    expect(nukeRisk(c, nearPos, target.id, 1, mine)).toBeGreaterThan(0)
    expect(nukeRisk(c, farPos, target.id, 1, mine)).toBe(0)
    const late = ctxOf(sc, { round: 8 })
    expect(nukeCaution(late)).toBeLessThan(nukeCaution(c))
    expect(nukeRisk(late, nearPos, target.id, 1, mine)).toBeLessThan(nukeRisk(c, nearPos, target.id, 1, mine))
    // The score of a real shot carries the penalty only when the nuke is near the target.
    const me = own(c).find((m) => m.carried.some((x) => x.kind === 'weapon' && x.defId !== 'baseball-bat'))!
    const a = ctxOf(sc, { round: 1, models: (ms) => { ms[me.id]!.pos = { x: nukeMk.pos.x + 7, z: nukeMk.pos.z }; ms[target.id]!.pos = { x: nukeMk.pos.x + 1.2, z: nukeMk.pos.z } } })
    const b = ctxOf(sc, { round: 1, models: (ms) => { ms[me.id]!.pos = { x: nukeMk.pos.x + 7 + 14, z: nukeMk.pos.z }; ms[target.id]!.pos = { x: nukeMk.pos.x + 1.2 + 14, z: nukeMk.pos.z } } })
    const va = attackValue(a, me.id, target.id, {})
    const vb = attackValue(b, me.id, target.id, {})
    if (va.value !== 0 || vb.value !== 0) expect(va.parts.objective ?? 0).toBeLessThan(vb.parts.objective ?? 0)
  })

  it('BOT-007 box-4: touching the tower is worth more than standing away, most of all on the last round; shots matter only at the tower then', () => {
    const sc = scene('box-4')
    const early = ctxOf(sc, { round: 1 })
    const last = ctxOf(sc, { round: 6 })
    const m = own(early).find((x) => !x.offTable)!
    const tower = (early.view.markers ?? []).find((k) => k.face === 'radio-tower')!
    const touch = { x: tower.pos.x + 2.6, z: tower.pos.z }
    const away = { x: tower.pos.x + 16, z: tower.pos.z }
    expect(objectiveValue(early, m.id, touch)).toBeGreaterThan(objectiveValue(early, m.id, away))
    expect(objectiveValue(last, m.id, touch)).toBeGreaterThan(objectiveValue(early, m.id, touch))
    const e = foes(last)[0]!
    const lastAway = ctxOf(sc, { round: 6, models: (ms) => { ms[e.id]!.pos = { x: 15, z: 15 } } })
    const lastAt = ctxOf(sc, { round: 6, models: (ms) => { ms[e.id]!.pos = { x: tower.pos.x + 2.6, z: tower.pos.z } } })
    expect(attackFactor(lastAway, e.id)).toBeLessThan(1)
    expect(attackFactor(lastAt, e.id)).toBeGreaterThan(1)
    expect(attackFactor(ctxOf(sc, { round: 2, models: (ms) => { ms[e.id]!.pos = { x: 15, z: 15 } } }), e.id)).toBe(1)
  })

  it('BOT-008 a named hero counts for more than its cost', () => {
    const c = ctxOf(scene('box-1'))
    const sole = foes(c, 'sole-survivor')[0]!
    const settler = foes(c, 'settler')[0]!
    expect(modelValue(c, sole.id) / modelValue(c, settler.id)).toBeGreaterThan(89 / 40 * 1.5)
  })

  it('BOT-009 the cost budget stops a search when its query misses and dry runs pass the cap, and counts both', () => {
    const c = ctxOf(scene('box-3'))
    const w = c.work!
    expect(w.missCap).toBe(Math.max(40, Math.ceil(5000 * MISS_PER_MS)))
    const before = oddsStats.misses
    const me = own(c)[0]!, foe = foes(c)[0]!
    attackValue(c, me.id, foe.id, {})
    expect(oddsStats.misses).toBeGreaterThanOrEqual(before)
    // Pretend the decision used up its allowance: timeUp reports it.
    const spent = { ...c, work: { ...w, miss0: oddsStats.misses - (w.missCap ?? 0) - 1 } }
    expect(timeUp(spent)).toBe(true)
    expect(timeUp({ ...c, work: { ...w, miss0: oddsStats.misses } })).toBe(false)
  })

  it('BOT-010 normal plays a tower game against random with no rejected answers, no fallbacks and no errors', () => {
    let state = createGame(bundle, { seed: 'bot10', scenarioId: 'box-4' })
    const accepts = (a: Action) => apply(state, bundle, a).ok
    const ds = Object.fromEntries(state.seatOrder.map((s, i) => [s, createAiDecider(i === 0 ? 'normal' : 'random', { seed: `bot10:${s}`, bundle, accepts, budgetMs: 80 })]))
    let n = 0
    while (state.phase !== 'over' && n < 1500) {
      const p = state.pending
      const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
      const { action } = ds[seat]!.decideSync(view(state, seat), p, legalActions(state))
      const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      state = r.state; n++
    }
    expect(state.phase).toBe('over')
    expect(ds.A!.memory.stats.errors).toBe(0)
    expect(ds.A!.memory.stats.fallbacks).toBe(0)
    expect(ds.A!.memory.stats.hardStops).toBe(0)
  }, 120000)

  it('BOT-011 box-3 has no clock: a game still going after round 8 ramps up to a full push, other clockless scenarios do not', () => {
    const sc = scene('box-3')
    expect(stall(ctxOf(sc, { round: 8 }))).toBe(0)
    const mid = stall(ctxOf(sc, { round: 11 }))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(stall(ctxOf(sc, { round: 14 }))).toBe(1)
    expect(urgency(ctxOf(sc, { round: 14 }))).toBe(1)
    expect(stall(ctxOf(scene('box-2'), { round: 14 }))).toBe(0)
    expect(stall(ctxOf(scene('box-4'), { round: 14 }))).toBe(0)
  })

  it('BOT-012 scenario facts come from the record (rules, markers, rounds), not from the scenario id', () => {
    const f = (id: string, seat: SeatId = 'A') => sceneOf(ctxOf(scene(id, 'bot', seat)))
    const b1 = f('box-1'), b2 = f('box-2'), b3 = f('box-3'), b4 = f('box-4')
    expect([b1.elimination, b1.holdFace, b1.nukeFace]).toEqual([true, null, null])
    expect([b2.nukeFace, b2.waitSide, b2.deadline, b2.elimination]).toEqual(['mini-nuke', 'defender', 9, false])
    expect(b2.blast).toBe(rulerInches(bundle, 'orange'))
    expect([b3.elimination, b3.holdFace, b3.nukeFace, b3.deadline]).toEqual([false, null, null, 0])
    expect([b4.holdFace, b4.reserveSide, b4.elimination, b4.nukeFace]).toEqual(['radio-tower', 'defender', false, null])
  })

  it('BOT-013 the nuke detonation chance is the share of 1s on the armor die in the data (4 of 12), not a literal', () => {
    const c = ctxOf(scene('box-2', 'bot', 'B'), { round: 1 })
    const nukeMk = (c.view.markers ?? []).find((m) => m.face === 'mini-nuke')!
    const target = foes(c)[0]!
    const faces = bundle.singletons.dice!.armor
    const p1 = faces.filter((v) => v === 1).length / faces.length
    expect(p1).toBeCloseTo(1 / 3, 9)
    expect(nukeRisk(c, { x: nukeMk.pos.x + 1, z: nukeMk.pos.z }, target.id, 1, 200)).toBeCloseTo(p1 * 0.9 * 200 * nukeCaution(c), 6)
  })

  it('BOT-014 tower contact is the engine test: within half an inch of the base counts, a gap beyond it does not', () => {
    const c = ctxOf(scene('box-4'), { round: 6 })
    const tower = (c.view.markers ?? []).find((k) => k.face === 'radio-tower')!
    const m = own(c).find((x) => !x.offTable)!
    const r = baseRadius(m.base) + baseRadius(80)
    const at = (gap: number) => ({ ...m, pos: { x: tower.pos.x + r + gap, z: tower.pos.z } })
    expect(touchesTower(c, at(0.45))).toBe(true)
    expect(touchesTower(c, at(0.56))).toBe(false)
  })

  it('BOT-015 no live enemy on the table: spot scores stay finite and pickBest skips a non-finite row (easy included)', () => {
    const sc = scene('box-4')
    for (const tier of ['normal', 'easy'] as const) {
      const c = ctxOf(sc, { models: (ms) => { for (const m of Object.values(ms)) if (m.owner !== 'A') Object.assign(m, { life: 'dead', offTable: true }) } })
      const ctx = tier === 'easy' ? { ...c, tier: { ...c.tier, ...TIERS.easy } } : c
      const me = own(ctx).find((x) => !x.offTable)!
      const v = spotScore(ctx, me.id, { x: me.pos.x + 2, z: me.pos.z }, buildThreatMap(ctx), 6).value
      expect(Number.isFinite(v), tier).toBe(true)
      const rows = [{ action: 'bad', score: { value: Number.NaN, parts: {} } }, { action: 'good', score: { value: 1, parts: {} } }, { action: 'ok', score: { value: 0.5, parts: {} } }]
      expect(['good', 'ok']).toContain(pickBest(ctx, rows)!.action)
      expect(pickBest(ctx, [rows[0]!])).not.toBeNull()
    }
  })

  it('BOT-016 a wall-clock hard stop counts in hardStops, not in fallbacks', () => {
    let state = createGame(bundle, { seed: 'bot16', scenarioId: 'box-1' })
    // Play on with the random policy until a seat has an activation to choose (the first decision that searches).
    const rnd = createAiDecider('random', { seed: 'bot16:r', bundle })
    for (let n = 0; state.pending.kind !== 'turn.activation' && n < 50; n++) {
      const p = state.pending, seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
      const r = apply(state, bundle, rnd.decideSync(view(state, seat), p, legalActions(state)).action)
      if (!r.ok) throw new Error('setup move rejected')
      state = r.state
    }
    expect(state.pending.kind).toBe('turn.activation')
    const seat = state.pending.seat as SeatId
    let t = 0
    const d = createAiDecider('normal', { seed: 'bot16', bundle, now: () => (t += 1e6) })
    d.decideSync(view(state, seat), state.pending, legalActions(state))
    expect(d.memory.stats.hardStops).toBeGreaterThan(0)
    expect(d.memory.stats.byKind['turn.activation']!.hard).toBeGreaterThan(0)
    expect(d.memory.stats.fallbacks).toBe(0)
  })
})
