// M4b engine side: AI turn flow (AI-001, AI-027), co-op teams (COOP-001/002), object targets (SHOT-003, AI-029), the
// scenario push Action, the ai.decision event (AI-015) and the extended view. Spec 18 s8.
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { engagedWith, isEngaged } from '../../src/engine/attack'
import { hitOdds } from '../../src/engine/query'
import { raiseDecision } from '../../src/engine/registry'
import { createGame } from '../../src/engine/setup'
import { hostile } from '../../src/engine/sides'
import { activationMenu } from '../../src/engine/turnflow'
import type { Action, GameState, MarkerState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle, rocketAtOrigin } from './helpers'

const bundle = loadBundle()
const pick = (s: GameState, type: string, match: Partial<Action> = {}): Action => {
  const o = s.pending.options.find((x) => x.action.type === type && Object.entries(match).every(([k, v]) => x.action[k] === v))
  if (!o) throw new Error(`no ${type} in ${s.pending.kind}: ${s.pending.options.map((x) => `${x.action.type}:${x.id}`).join(',')}`)
  return o.action
}
const step = (s: GameState, a: Action): GameState => {
  const r = apply(s, bundle, a)
  if (!r.ok) throw new Error(`${a.type}: ${r.rejection.code} ${r.rejection.message}`)
  return r.state
}
const aiGame = (seed = 'ai1') => rocketAtOrigin(createGame(bundle, { seed, scenarioId: 'ai-rr', seats: ['p1', 'ai'] }))
const coopGame = (seed = 'co1') => createGame(bundle, { seed, scenarioId: 'coop-munitions', seats: ['ai', 'p1', 'p2'] })
const started = (s: GameState): GameState => step(s, pick(s, 'turn.start'))
const set = (s: GameState, id: string, patch: Partial<GameState['models'][string]>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })
const place = (s: GameState, id: string, x: number, z: number): GameState => set(s, id, { pos: { x, z } })

/** Put a model mid-activation with the real menu raised (like the duel fixture, but for any seats). */
function activate(s0: GameState, modelId: string): GameState {
  const m = s0.models[modelId]!
  const s: GameState = {
    ...s0, phase: 'play', round: 1, terrain: [], advantage: m.owner,
    models: { ...s0.models, [modelId]: { ...m, readiness: 'ready' } },
    turn: { seat: s0.seatOrder.find((x) => s0.seats[x]!.team === s0.seats[m.owner]!.team) ?? m.owner, step: 'use', readied: modelId, firstSeat: m.owner },
    activation: { modelId, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
  }
  return raiseDecision(s, { seat: m.owner, kind: 'turn.activation', context: { modelId }, options: activationMenu(s, bundle, modelId), canPass: false })
}
const stripLuck = (s: GameState): GameState => ({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, luck: 0, heroic: false }])) })

describe('AI set-up (AI-027)', () => {
  it('AI-027 every AI model gets one Number from a seeded permutation and keeps its deployment point', () => {
    const s = aiGame()
    const ai = Object.values(s.models).filter((m) => m.owner === 'ai')
    expect(ai.map((m) => m.tokens.aiNumber).sort()).toEqual([1, 2, 3, 4, 5])
    for (const m of ai) expect([m.tokens.deployX, m.tokens.deployZ]).toEqual([m.pos.x, m.pos.z])
    expect(Object.values(s.models).filter((m) => m.owner === 'p1').every((m) => m.tokens.aiNumber === undefined)).toBe(true)
    const again = aiGame()
    expect(Object.values(again.models).map((m) => m.tokens.aiNumber)).toEqual(Object.values(s.models).map((m) => m.tokens.aiNumber))
    const other = aiGame('ai2')
    expect(Object.values(other.models).map((m) => m.pos.x).join()).not.toBe(Object.values(s.models).map((m) => m.pos.x).join())
  })

  it('AI-027 the seats get controllers and teams; the AI takes its card equipment and a human opens the game', () => {
    const s = aiGame()
    expect(s.seats.ai).toMatchObject({ controller: 'official', team: 'ai', side: 'super-mutants' })
    expect(s.seats.p1).toMatchObject({ team: 'players', side: 'survivors' })
    expect(s.pending.kind).toBe('turn.start')
    expect(s.pending.seat).toBe('p1')
    expect(s.models['ai-super-mutant-1']!.carried.map((c) => c.defId)).toEqual(expect.arrayContaining(['board', 'bolt-action-pipe-rifle']))
  })
})

describe('AI turn flow (AI-001)', () => {
  it('AI-001 the AI readies one model per turn and is never offered use none', () => {
    let s = started(aiGame())
    s = step(s, pick(s, 'turn.first', { firstSeat: 'ai' }))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('ai')
    expect(s.pending.options).toHaveLength(5) // the whole pool is on offer; the decider draws the Number Token
    const drawn = s.pending.options[2]!.action
    s = step(s, drawn)
    expect(s.pending.kind).toBe('turn.choose')
    expect(s.pending.options.map((o) => o.action.type)).toEqual(['turn.useAll'])
    s = step(s, pick(s, 'turn.useAll'))
    expect(s.activation!.modelId).toBe(drawn.modelId)
  })

  it('AI-001 several Ready AI models are Used in ascending Number order', () => {
    let s = started(aiGame())
    s = step(s, pick(s, 'turn.first', { firstSeat: 'ai' }))
    const by = (n: number) => Object.values(s.models).find((m) => m.tokens.aiNumber === n)!.id
    const first = by(4)
    s = step(s, pick(s, 'turn.ready', { modelId: first }))
    s = set(s, by(2), { readiness: 'ready' })
    s = set(s, by(5), { readiness: 'ready' })
    s = step(s, pick(s, 'turn.useAll'))
    expect(s.pending.kind).toBe('turn.pick')
    expect(s.pending.options.map((o) => o.action.modelId)).toEqual([by(2)])
    s = step(s, pick(s, 'turn.pick'))
    expect(s.activation!.modelId).toBe(by(2))
  })

  it('AI-001 once every AI model is Used the AI takes no more turns', () => {
    let s = started(aiGame())
    for (const m of Object.values(s.models)) if (m.owner === 'ai') s = set(s, m.id, { readiness: 'used' })
    s = step(s, pick(s, 'turn.first', { firstSeat: 'ai' }))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('p1')
  })
})

describe('co-op teams (COOP-001, COOP-002)', () => {
  it('COOP-001 turns alternate by team; the team readies one model for either player, then that player uses all or none', () => {
    let s = started(coopGame())
    expect(s.pending.kind).toBe('turn.first')
    expect(s.pending.options.map((o) => o.action.firstSeat).sort()).toEqual(['ai', 'p1']) // one entry per team
    s = step(s, pick(s, 'turn.first', { firstSeat: 'p1' }))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('p1')
    expect(s.pending.context.team).toEqual(['p1', 'p2'])
    expect(new Set(s.pending.options.map((o) => s.models[String(o.action.modelId)]!.owner))).toEqual(new Set(['p1', 'p2']))
    const theirs = s.pending.options.find((o) => s.models[String(o.action.modelId)]!.owner === 'p2')!.action
    s = step(s, theirs) // p1 answers for the team and readies one of p2's models
    expect(s.pending.kind).toBe('turn.choose')
    expect(s.pending.seat).toBe('p2') // the owner decides alone
    expect(s.pending.options.map((o) => o.action.type).sort()).toEqual(['turn.useAll', 'turn.useNone'])
    s = step(s, pick(s, 'turn.useNone'))
    expect(s.models[String(theirs.modelId)]!.readiness).toBe('used')
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('ai') // the next team
  })

  it('COOP-001 after the AI turn the player team takes the next turn, not a single seat', () => {
    let s = started(coopGame())
    s = step(s, pick(s, 'turn.first', { firstSeat: 'ai' }))
    s = step(s, s.pending.options[0]!.action)
    s = step(s, pick(s, 'turn.useAll'))
    // end the AI activation
    s = step(s, pick(s, 'turn.end'))
    expect(s.pending.kind).toBe('turn.ready')
    expect(s.pending.seat).toBe('p1')
    expect(s.pending.context.team).toEqual(['p1', 'p2'])
  })

  it('COOP-002 teammates are never hostile or engaged with each other', () => {
    let s = coopGame()
    s = place(place(s, 'p1-sole-survivor-1', 0, 0), 'p2-settler-1', 1.5, 0)
    expect(hostile(s, 'p1', 'p2')).toBe(false)
    expect(hostile(s, 'p1', 'ai')).toBe(true)
    expect(engagedWith(s, 'p1-sole-survivor-1')).toEqual([])
    expect(isEngaged(place(s, 'ai-super-mutant-1', 1.4, 0), 'p1-sole-survivor-1')).toBe(true) // an AI model in base contact does engage
  })

  it('COOP-002 a prepared player model reacts to AI Actions but not to a teammate Action', () => {
    const lay = (): GameState => {
      let s = stripLuck(coopGame())
      s = place(place(place(s, 'p1-sole-survivor-1', 0, 6), 'p2-settler-1', 4, 6), 'ai-super-mutant-1', 0, -2)
      s = set(s, 'p2-settler-1', { reaction: true })
      return place(s, 'ai-brute-1', 20, -20)
    }
    // teammate p1 shoots the AI model: p2 (same team) is not a trigger source
    let s = activate(lay(), 'p1-sole-survivor-1')
    s = step(s, pick(s, 'shoot.begin'))
    s = step(s, s.pending.options.find((o) => o.action.targetId === 'ai-super-mutant-1')!.action)
    expect(s.pending.kind).not.toBe('react.offer')
    // the AI shoots a player: p2 is offered a reaction
    let t = activate(lay(), 'ai-super-mutant-1')
    t = step(t, pick(t, 'shoot.begin'))
    t = step(t, t.pending.options.find((o) => o.action.targetId === 'p1-sole-survivor-1')!.action)
    expect(t.pending.kind).toBe('react.offer')
    expect(t.pending.seat).toBe('p2')
  })
})

describe('object targets (SHOT-003, AI-029)', () => {
  function rocketGame(seed: string, rocket?: Partial<MarkerState['props']>): GameState {
    let s = stripLuck(aiGame(seed))
    s = place(s, 'p1-settler-1', 0, 8) // 8 in from the rocket at the centre
    s = place(place(place(s, 'p1-settler-2', 10, 10), 'p1-dogmeat-1', -10, 10), 'p1-sole-survivor-1', -10, 9)
    s = place(s, 'p1-enslaved-tech-1', 10, 9)
    for (const m of Object.values(s.models)) if (m.owner === 'ai') s = place(s, m.id, -10 + 2 * Number(m.tokens.aiNumber), -11)
    s = { ...s, markers: s.markers.map((mk) => ({ ...mk, props: { ...mk.props, ...(rocket ?? {}) } })) }
    return activate(s, 'p1-settler-1')
  }

  it('SHOT-003 the shoot menu offers the rocket with a targetMarkerId and the engine plans odds for it', () => {
    let s = rocketGame('o1')
    const begin = pick(s, 'shoot.begin')
    s = step(s, begin)
    const row = s.pending.options.find((o) => o.action.targetMarkerId === 'marker-1')
    expect(row).toBeDefined()
    expect(row!.action.targetId).toBeUndefined()
    expect(hitOdds(s, bundle, 'p1-settler-1', 'marker-1', { weaponUid: String(begin.weaponUid) }).pHit).toBeGreaterThan(0)
  })

  it('SHOT-003 a hit takes the rocket Health down and can wreck it, ending the game for the AI side', () => {
    let wrecked = 0, damaged = 0
    for (let i = 0; i < 40; i++) {
      let s = rocketGame(`o-hit-${i}`, { health: 1, maxHealth: 1, armor: {} })
      s = step(s, pick(s, 'shoot.begin'))
      s = step(s, s.pending.options.find((o) => o.action.targetMarkerId === 'marker-1')!.action)
      const mk = s.markers[0]!
      if ((mk.props.damaged as number | undefined) ?? 0) damaged++
      if (mk.props.destroyed) {
        wrecked++
        expect(mk.props.health).toBe(0)
        expect(s.phase).toBe('over')
        expect(s.result?.winner).toBe('ai')
        expect(s.events.some((e) => e.type === 'objectRemoved')).toBe(true)
      } else expect(s.phase).toBe('play')
    }
    expect(wrecked).toBeGreaterThan(0)
    expect(damaged).toBe(wrecked)
  })

  it('SHOT-003 armor comes from the marker; Health left plus damage taken equals the start', () => {
    for (let i = 0; i < 25; i++) {
      let s = rocketGame(`o-arm-${i}`)
      s = step(s, pick(s, 'shoot.begin'))
      s = step(s, s.pending.options.find((o) => o.action.targetMarkerId === 'marker-1')!.action)
      const p = s.markers[0]!.props
      expect((p.health as number) + ((p.damage as number | undefined) ?? 0)).toBe(10)
      expect(p.maxHealth).toBe(10)
    }
  })

  it('AI-029 base contact with an object is not an engagement, so a model may shoot or strike it', () => {
    let s = rocketGame('o-melee')
    s = activate(place(s, 'p1-settler-1', 0, 1.6), 'p1-settler-1') // in base contact with the rocket
    expect(isEngaged(s, 'p1-settler-1')).toBe(false)
    expect(s.pending.options.some((o) => o.action.type === 'melee.attack' && o.action.targetMarkerId === 'marker-1')).toBe(true)
    expect(s.pending.options.some((o) => o.action.type === 'shoot.begin')).toBe(true)
    let t = step(s, pick(s, 'melee.attack', { targetMarkerId: 'marker-1' }))
    expect(['melee.slide', 'turn.activation', 'melee.luck']).toContain(t.pending.kind)
    expect(t.events.some((e) => e.type === 'attack')).toBe(true)
    if (t.pending.kind === 'melee.slide') t = step(t, pick(t, 'melee.slide'))
    expect(isEngaged(t, 'p1-settler-1')).toBe(false)
  })

  it('AI-029 a destroyed object is no longer offered as a target', () => {
    const dead = rocketGame('o-dead', { destroyed: true, health: 0 })
    expect(dead.pending.options.some((o) => o.action.type === 'melee.attack' && o.action.targetMarkerId)).toBe(false)
    const shot = dead.pending.options.find((o) => o.action.type === 'shoot.begin')
    if (shot) expect(step(dead, shot.action).pending.options.some((o) => o.action.targetMarkerId)).toBe(false)
  })

  it('SCN-005 tutorial targets are shootable and open information', () => {
    const g = createGame(bundle, { seed: 'ga', scenarioId: 'ga-2', seats: ['A'] })
    expect(g.markers.every((m) => m.props.shootable === true)).toBe(true)
    expect(view(g, 'A').markers!.every((m) => m.face === 'can')).toBe(true)
  })
})

describe('scenario push (SCN-003)', () => {
  it('SCN-003 a model within Orange of the rocket may spend an Action on a Str test; a success shoves it Yellow', () => {
    let moved = 0
    for (let i = 0; i < 30; i++) {
      let s = stripLuck(aiGame(`push-${i}`))
      s = place(s, 'p1-sole-survivor-1', 0, 3)
      s = activate(s, 'p1-sole-survivor-1')
      const t = step(s, pick(s, 'scenario.push', { markerId: 'marker-1' }))
      const mk = t.markers[0]!
      if (mk.pos.z !== 0 || mk.pos.x !== 0) {
        moved++
        expect(Math.hypot(mk.pos.x, mk.pos.z)).toBeCloseTo(4, 5) // Yellow = 4 in, away from the pusher (-z)
        expect(mk.pos.z).toBeLessThan(0)
      }
    }
    expect(moved).toBeGreaterThan(0)
  })

  it('SCN-003 a shove past the table edge flags the rocket off the table and the Survivors win', () => {
    let s = stripLuck(aiGame('push-edge'))
    s = { ...s, markers: s.markers.map((m) => ({ ...m, pos: { x: 0, z: -9 } })) }
    s = place(s, 'p1-sole-survivor-1', 0, -6)
    for (let i = 0; i < 40; i++) {
      const a = activate({ ...s, rng: [i + 1, 2, 3, 4] as GameState['rng'] }, 'p1-sole-survivor-1')
      const t = step(a, pick(a, 'scenario.push'))
      if (t.markers[0]!.props.offTable) { expect(t.phase).toBe('over'); expect(t.result?.winner).toBe('p1'); return }
    }
    throw new Error('no push succeeded in 40 tries')
  })
})

describe('apply and view (AI-015, view)', () => {
  it('AI-015 an attached aiLog becomes an ai.decision event and is stripped from the log', () => {
    let s = started(aiGame())
    s = step(s, pick(s, 'turn.first', { firstSeat: 'ai' }))
    const a = { ...s.pending.options[0]!.action, aiLog: { type: 'ai.decision', kind: 'turn.ready', draws: ['ai-token'] } }
    const r = apply(s, bundle, a)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.events.find((e) => e.type === 'ai.decision')).toMatchObject({ kind: 'turn.ready', draws: ['ai-token'] })
    expect('aiLog' in r.state.log[r.state.log.length - 1]!).toBe(false)
  })

  it('view carries round, rounds, scenario and markers; hidden faces are removed until the team has seen them', () => {
    const g = createGame(bundle, { seed: 'v1', scenarioId: 'box-1' })
    const v = view(g, 'A')
    expect(v).toMatchObject({ round: 0, maxRounds: 6, scenarioId: 'box-1' })
    expect(v.markers).toHaveLength(3)
    expect(v.markers!.every((m) => m.face === undefined)).toBe(true)
    const seen = { ...g, markers: g.markers.map((m, i) => (i === 0 ? { ...m, seenBy: ['A'] } : i === 1 ? { ...m, revealed: true } : m)) }
    expect(view(seen, 'A').markers!.map((m) => m.face !== undefined)).toEqual([true, true, false])
    expect(view(seen, 'B').markers!.map((m) => m.face !== undefined)).toEqual([false, true, false])
  })

  it('view shares peeked markers inside a co-op team', () => {
    const g = coopGame()
    const peeked = { ...g, markers: g.markers.map((m) => ({ ...m, kind: 'investigation' as const, seenBy: ['p1'] })) }
    expect(view(peeked, 'p2').markers!.every((m) => m.face !== undefined)).toBe(true)
    expect(view(peeked, 'ai').markers!.every((m) => m.face === undefined)).toBe(true)
  })
})
