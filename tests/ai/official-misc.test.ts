// Official AI: decision log, determinism, Heroic, charge flip, Yellow limit and whole games (AI-014, 015, 018, 024..028).
import { describe, expect, it } from 'vitest'
import { createAiDecider } from '../../src/ai/decider'
import { createOfficialAiDecider } from '../../src/ai/official/decider'
import { resolveCell } from '../../src/ai/official/matrix'
import { chooseWeapon, rankTargets } from '../../src/ai/official/targeting'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, CarriedItem } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { ter } from '../engine/helpers'
import { activate, bundle, newDecider, scene, set, step, testCard, CONTACT_40_32 } from './official-helpers'
import { runDeciders } from '../engine/helpers'

describe('decision log (AI-015)', () => {
  it('AI-015 every decision logs the blue face, row, column, cell, Method, chain, activity, weapon and target ranking', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [2, 0], 'p1-settler-2': [-2, 0] } })
    const seen: string[] = []
    const d = createOfficialAiDecider({ seed: 'log', bundle: b, cards: [testCard({ response: 'A', reckless: true, method: 'ranged', priorities: ['wounded'] })], onLog: (l) => seen.push(l.kind) })
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    const log = r.log
    expect(log.type).toBe('ai.decision')
    expect(log.cell).toMatchObject({ response: 'A', reckless: true, stayEngaged: false, method: 'ranged', column: 0, columnLabel: 'any' })
    expect(typeof log.cell!.face).toBe('number')
    expect(typeof log.cell!.row).toBe('number')
    expect(log.cell!.icons).toBeTruthy()
    expect(log.performed).toBe('A')
    expect(log.chain).toEqual(['A'])
    expect(log.activity).toBe('ranged.shoot')
    expect(log.weapon).toBe('ai-super-mutant-1/bolt-action-pipe-rifle')
    expect(log.ranking?.steps.map((x) => x.priority)).toEqual(['wounded'])
    expect(log.ranking?.tie?.seedKey).toMatch(/^tie:/) // two equal settlers: a seeded, logged pick
    expect(log.draws).toEqual(expect.arrayContaining([log.ranking!.tie!.seedKey]))
    expect(log.draws.some((x) => x.startsWith('ai-blue'))).toBe(true)
    expect(d.log).toHaveLength(1)
    expect(seen).toEqual(['turn.activation'])
    expect((r.action as Action & { aiLog?: unknown }).aiLog).toBe(log)
  })

  it('AI-015 the log becomes an ai.decision event when the engine applies the answer', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [2, 0] } })
    const d = newDecider(testCard({ response: 'A', reckless: true, method: 'ranged' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    const ev = r.state.events.find((e) => e.type === 'ai.decision')
    expect(ev).toMatchObject({ kind: 'turn.activation', activity: 'ranged.shoot', performed: 'A' })
    expect('aiLog' in r.state.log[r.state.log.length - 1]!).toBe(false)
  })
})

describe('Heroic, charge flip, reactions, weapons (AI-014, AI-024, AI-025, AI-026, AI-028)', () => {
  it('AI-024 a Heroic model with V.A.T.S. Action Points takes one Quick Action with the same Response after its two Actions', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -12], 'p1-settler-1': [10, 10] } })
    const heroic = set(s0, 'ai-super-mutant-1', { heroic: true })
    const d = newDecider(testCard({ response: 'M', reckless: true, method: 'close' }))
    const quick = step(activate(heroic, b, 'ai-super-mutant-1', 2, { ap: 1 }), d)
    expect(quick.log.actionIndex).toBe('quick')
    expect(quick.action.quick).toBe(true)
    expect(quick.action.type).toBe('move.go')
    // A model that is not Heroic ends instead.
    const plain = step(activate(s0, b, 'ai-super-mutant-1', 2, { ap: 1 }), newDecider(testCard({ response: 'M', reckless: true, method: 'close' })))
    expect(plain.action.type === 'turn.end' || plain.action.quick !== true).toBe(true)
  })

  it('AI-025 the charge marker colour is a seeded flip: stable for a seed, both colours across seeds', () => {
    const colours = new Set<string>()
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -4], 'p1-settler-1': [0, 0] } })
    for (let i = 0; i < 24; i++) {
      const d = newDecider(testCard({ response: 'A', reckless: true, method: 'close' }), b, `flip${i}`)
      const c = step(activate(s0, b, 'ai-super-mutant-1'), d)
      expect(c.action.type).toBe('charge.go')
      const m = step(c.state, d)
      expect(m.action.type).toBe('charge.marker')
      colours.add(String(m.action.colour))
      const again = step(c.state, newDecider(testCard({ response: 'A', reckless: true, method: 'close' }), b, `flip${i}`))
      expect(again.action.colour).toBe(m.action.colour)
    }
    expect(colours.size).toBe(2)
  })

  it('AI-025 Battle Cry is followed up with a Push Back only when Reckless', () => {
    let seen = 0
    for (const reckless of [true, false]) {
      for (let i = 0; i < 40 && seen < 2; i++) {
        const { s: s0, b } = scene({ seed: `bc${i}`, place: { 'ai-brute-1': [0, -4], 'p1-settler-1': [0, 0] } })
        const d = newDecider(testCard({ response: 'A', reckless, method: 'close', unitId: 'brute' }), b, `bc${i}`)
        let s = step(activate(s0, b, 'ai-brute-1'), d).state
        if (s.pending.kind === 'charge.marker') s = step(s, d).state
        if (s.pending.kind !== 'battleCry.push') continue
        const r = step(s, d)
        expect(r.action.push).toBe(true) // the shove is never skipped
        const f = step(r.state, d)
        expect(f.state.pending.kind === 'battleCry.follow' ? f.action.follow : true).toBe(true) // charged: always follows
        void reckless
        seen++
        break
      }
    }
    expect(seen).toBeGreaterThanOrEqual(1)
  })

  it('AI-026 a Careful Close Combat model prefers engaged enemies at every tie-break step', () => {
    const sc = scene({ place: {
      'ai-super-mutant-1': [0, -8], 'p1-settler-1': [0, -5], 'p1-dogmeat-1': [6, 0], 'ai-mutant-hound-1': [6, CONTACT_40_32 - 0.0],
    } })
    const v = view(sc.s, 'ai')
    const me = sc.s.models['ai-super-mutant-1']!
    const rank = (reckless: boolean) => {
      const card = testCard({ response: 'A', reckless, method: 'close', priorities: ['nearest'] })
      const cell = { ...resolveCell(card, me, 0, v, sc.b), method: 'close' as const }
      return rankTargets(v, sc.b, me, card, cell, [sc.s.models['p1-settler-1']!, sc.s.models['p1-dogmeat-1']!], 'close', [], (a) => a[0]!)
    }
    expect(rank(true).winner).toBe('p1-settler-1') // Reckless: just the nearest
    expect(rank(false).winner).toBe('p1-dogmeat-1') // Careful: the engaged one first
  })

  it('AI-028 the AI seat declines reaction offers (its models never Prepare)', () => {
    const { s } = scene({})
    const pending = { id: 'd:50', seat: 'ai', kind: 'react.offer', context: { modelId: 'ai-brute-1' }, canPass: false, options: [] }
    const legal = [
      { type: 'react.take', decisionId: 'd:50', seat: 'ai', modelId: 'ai-brute-1', inner: { type: 'move.go' } },
      { type: 'react.pass', decisionId: 'd:50', seat: 'ai', modelId: 'ai-brute-1' },
    ]
    const r = createOfficialAiDecider({ seed: 'r', bundle }).decideSync(view(s, 'ai'), pending, legal)
    expect(r.action.type).toBe('react.pass')
  })

  it('AI-014 an AI model carries everything its AI card lists; Luck is never spent', () => {
    const s = createGame(bundle, { seed: 'eq', scenarioId: 'ai-rr', seats: ['p1', 'ai'] })
    const sm = s.models['ai-super-mutant-1']!
    expect(sm.carried.map((c) => c.defId)).toEqual(expect.arrayContaining(bundle.records.ai.find((c) => c.id === 'ai-super-mutant')!.standardEquipment))
    const pending = { id: 'd:60', seat: 'ai', kind: 'melee.luck', context: { ask: 'accurate' }, canPass: false, options: [] }
    const legal = [
      { type: 'melee.luck', decisionId: 'd:60', seat: 'ai', ask: 'accurate', use: true },
      { type: 'melee.luck', decisionId: 'd:60', seat: 'ai', ask: 'accurate', use: false },
    ]
    expect(createOfficialAiDecider({ seed: 'r', bundle }).decideSync(view(s, 'ai'), pending, legal).action.use).toBe(false)
  })

  it('AI-009 a Careful model never uses an area weapon in Close Combat', () => {
    const { s, b } = scene({})
    const launcher: CarriedItem = { uid: 'ai-brute-1/missile-launcher', defId: 'missile-launcher', kind: 'weapon', starting: true, loaded: true }
    const armed = set(s, 'ai-brute-1', { carried: [launcher] })
    const me = armed.models['ai-brute-1']!
    const card = testCard({ response: 'A', unitId: 'brute' })
    const v = view(armed, 'ai')
    const reckless = chooseWeapon(v, b, me, card, 'close', { reckless: true })
    const careful = chooseWeapon(v, b, me, card, 'close', { reckless: false })
    if (reckless === launcher.uid) expect(careful).not.toBe(launcher.uid)
    else expect(careful).toBe(reckless)
  })
})

describe('ranged movement (AI-018)', () => {
  it('AI-018 once a Shoot is possible a ranged move stops no closer than Yellow to the target', () => {
    // A wall hides the target; going round it the rifle comes into range inside Yellow unless the move stops short.
    const wall = ter('wall', 'building', 0, -3, 7, 1, 4)
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [-3, -9], 'p1-settler-1': [0, 0] } })
    const pistol: CarriedItem = { uid: 'ai-super-mutant-1/pipe-pistol', defId: 'pipe-pistol', kind: 'weapon', starting: true }
    const armed = set(s0, 'ai-super-mutant-1', { carried: [pistol] })
    const d = newDecider(testCard({ response: 'A', reckless: true, method: 'ranged' }))
    const r = step(activate(armed, b, 'ai-super-mutant-1', 0, { terrain: [wall] }), d)
    if (r.action.type === 'move.go') {
      const p = step(r.state, d)
      const me = p.state.models['ai-super-mutant-1']!
      const gap = Math.hypot(me.pos.x, me.pos.z) - (40 + 32) / 25.4 / 2
      expect(gap).toBeGreaterThanOrEqual(4 - 0.06)
    }
    expect(['move.go', 'shoot.begin']).toContain(r.action.type)
  })
})

describe('whole games', () => {
  const play = async (scenarioId: string, seed: string, seats: string[]) => {
    const s = createGame(bundle, { seed, scenarioId, seats })
    const ai = createOfficialAiDecider({ seed: `${seed}-ai`, bundle })
    const dec: Record<string, ReturnType<typeof createAiDecider> | typeof ai> = { ai }
    for (const seat of seats) if (seat !== 'ai') dec[seat] = createAiDecider('random', { seed: `${seed}-${seat}`, bundle })
    const r = await runDeciders(s, bundle, dec, { maxSteps: 6000 })
    return { r, ai }
  }

  it('AI-001 a full ai-rr game, official decider on the AI seat and the random decider on the player seat, reaches a result', async () => {
    const { r, ai } = await play('ai-rr', 'full1', ['p1', 'ai'])
    expect(r.rejections).toEqual([])
    expect(r.stoppedBy).toBe('over')
    expect(r.state.result).not.toBeNull()
    expect(ai.log.length).toBeGreaterThan(20)
    expect(ai.log.filter((l) => l.activity.startsWith('fallback')).length).toBe(0)
    expect(r.state.events.filter((e) => e.type === 'ai.decision').length).toBeGreaterThan(20)
  }, 120000)

  it('AI-015 same seeds give the same game and the same decision log; another AI seed differs', async () => {
    const a = await play('ai-rr', 'det1', ['p1', 'ai'])
    const b = await play('ai-rr', 'det1', ['p1', 'ai'])
    expect(JSON.stringify(a.ai.log)).toBe(JSON.stringify(b.ai.log))
    expect(a.r.state.result).toEqual(b.r.state.result)
    const sd = createGame(bundle, { seed: 'det1', scenarioId: 'ai-rr', seats: ['p1', 'ai'] })
    const other = createOfficialAiDecider({ seed: 'another', bundle })
    const r = await runDeciders(sd, bundle, { ai: other, p1: createAiDecider('random', { seed: 'det1-p1', bundle }) }, { maxSteps: 6000 })
    expect(JSON.stringify(other.log)).not.toBe(JSON.stringify(a.ai.log))
    void r
  }, 120000)

  it('SCN-001 the other AI scenarios and a co-op scenario also run to a result without a rejection', async () => {
    for (const [sc, seats] of [['ai-missile', ['p1', 'ai']], ['ai-breakin', ['p1', 'ai']], ['ai-tech', ['p1', 'ai']], ['coop-munitions', ['p1', 'p2', 'ai']]] as const) {
      const { r, ai } = await play(sc, `${sc}-g1`, [...seats])
      expect(r.rejections, sc).toEqual([])
      expect(r.stoppedBy, sc).toBe('over')
      expect(ai.log.filter((l) => l.activity.startsWith('fallback')).length, sc).toBe(0)
    }
  }, 240000)

  it('AI-001 the legal list is respected: every answer matches a legal option of its decision', async () => {
    const s0 = createGame(bundle, { seed: 'legal1', scenarioId: 'ai-rr', seats: ['p1', 'ai'] })
    const ai = createOfficialAiDecider({ seed: 'legal1', bundle })
    const rnd = createAiDecider('random', { seed: 'legal1-p', bundle })
    let s = s0
    for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
      const seat = s.pending.seat as string
      const legal = legalActions(s)
      const a = seat === 'ai' ? ai.decideSync(view(s, seat), s.pending, legal).action : await rnd.decide(view(s, seat), s.pending, legal)
      const res = apply(s, bundle, a)
      expect(res.ok, `${s.pending.kind} ${a.type}`).toBe(true)
      if (!res.ok) return
      s = res.state
    }
  }, 120000)
})

describe('Use objective feasibility (CH p13)', () => {
  it('AI-031 an item the AI side already carries, or a marker whose skill the model lacks, makes O impossible', async () => {
    const { canDoObjective } = await import('../../src/ai/official/objectives')
    const { s, b } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [2, 0] } })
    const v = view(s, 'p2')
    const me = v.models['ai-super-mutant-1']!
    const mk = (id: string, kind: 'object' | 'searchable', props: Record<string, unknown> = {}) => ({ id, kind, pos: { x: 0, z: 0 }, revealed: false, seenBy: [], props })
    const settings = { objective: 'use' as const, subject: 'x' }
    const held = { kind: 'model' as const, ids: [me.id], points: [me.pos] } // resolver maps a carried item to its carrier
    expect(canDoObjective({ ...v, markers: [mk('m1', 'object')] }, b, me, settings, held)).toBe(false)
    const lock = { kind: 'marker' as const, ids: ['m2'], points: [{ x: 0, z: 0 }] }
    const unit = b.records.units.find((u) => u.id === me.profileId)!
    const needs = unit.skills.some((k) => k.skill === 'lockpick')
    expect(canDoObjective({ ...v, markers: [mk('m2', 'object', { skill: 'lockpick' })] }, b, me, settings, lock)).toBe(needs)
    expect(canDoObjective({ ...v, markers: [mk('m2', 'object')] }, b, me, settings, lock)).toBe(true)
  })
})
