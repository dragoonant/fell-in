// Official AI: Responses M O F D S, Careful vs Reckless, engaged rules, Push Back, Slide, targets (AI-004..012, 016..022).
import { describe, expect, it } from 'vitest'
import { followUpPushBack } from '../../src/ai/official/responses'
import { chooseWeapon, rankTargets } from '../../src/ai/official/targeting'
import { resolveCell } from '../../src/ai/official/matrix'
import { inObjectContact } from '../../src/engine/objects'
import { engagedWith } from '../../src/engine/attack'
import { modelDistance } from '../../src/engine/measure'
import { view } from '../../src/engine/view'
import { CONTACT_40_32, activate, bundle, bundleWith, newDecider, scene, set, step, testCard } from './official-helpers'

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z)

describe('M: Move (AI-004)', () => {
  it('AI-004 far from the Subject, a Careful model moves at least half its Move toward it without engaging', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -15], 'p1-settler-1': [12, 12] } })
    const d = newDecider(testCard({ response: 'M', reckless: false, method: 'close' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    expect(r.action.type).toBe('move.go')
    expect(r.log.activity).toBe('move.towardSubject')
    expect(r.log.chain).toEqual(['M'])
    const p = step(r.state, d)
    expect(p.action.type).toBe('move.to')
    const moved = p.state.models['ai-super-mutant-1']!
    const travelled = dist(moved.pos, { x: 0, z: -15 })
    expect(travelled).toBeGreaterThan(3)
    expect(dist(moved.pos, { x: 0, z: 0 })).toBeLessThan(15)
    expect(engagedWith(p.state, 'ai-super-mutant-1')).toEqual([])
  })

  it('AI-004 a Reckless model goes direct and ends as far along as it can', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -15], 'p1-settler-1': [12, 12] } })
    const d = newDecider(testCard({ response: 'M', reckless: true, method: 'close' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    const p = step(r.state, d)
    const moved = p.state.models['ai-super-mutant-1']!
    expect(moved.pos.x).toBeCloseTo(0, 1)
    expect(dist(moved.pos, { x: 0, z: -15 })).toBeGreaterThan(5)
  })

  it('AI-004 within Move of the Subject, M performs O (Defeat the rocket: attack it only)', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -3], 'p1-settler-1': [12, 12] } })
    const d = newDecider(testCard({ response: 'M', reckless: true, method: 'ranged' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    expect(r.log.chain).toEqual(['M', 'O', 'defeat', 'A'])
    expect(r.action.type).toBe('shoot.begin')
    expect(r.log.target).toEqual({ id: 'marker-1', kind: 'marker' })
  })
})

describe('O: Objective (AI-005, AI-019)', () => {
  it('AI-005 Go To with the Subject within Move moves onto it (into contact)', () => {
    const b = bundleWith({ objective: 'goTo', subject: 'red-rocket' })
    const { s: s0 } = scene({ b, place: { 'ai-super-mutant-1': [0, -4], 'p1-settler-1': [12, 12] } })
    const d = newDecider(testCard({ response: 'O', reckless: true, method: 'close' }), b)
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d, b)
    expect(r.log.activity).toBe('move.ontoSubject')
    expect(r.log.chain).toEqual(['O', 'goTo', 'M'])
    const p = step(r.state, d, b)
    expect(inObjectContact(p.state, 'ai-super-mutant-1', p.state.markers[0]!)).toBe(true)
  })

  it('AI-019 Defeat maps to A with the Subject as the only target', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -6], 'p1-settler-1': [3, -5] } })
    const d = newDecider(testCard({ response: 'O', reckless: true, method: 'ranged' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    expect(r.log.chain).toEqual(['O', 'defeat', 'A'])
    expect(r.action.type).toBe('shoot.begin')
    expect(r.log.target?.id).toBe('marker-1') // the settler is closer but is not the Subject
    const t = step(r.state, d)
    expect(t.action.targetMarkerId).toBe('marker-1')
  })

  it('AI-019 an Objective the model cannot carry out falls back to A', () => {
    const b = bundleWith({ objective: 'defeat', subject: 'no-such-thing' })
    const { s: s0 } = scene({ b, place: { 'ai-super-mutant-1': [0, -6], 'p1-settler-1': [0, -1] } })
    const d = newDecider(testCard({ response: 'O', reckless: true, method: 'ranged' }), b)
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d, b)
    expect(r.log.chain.slice(-1)).toEqual(['A'])
    expect(r.action.type).toBe('shoot.begin')
    expect(r.log.target?.id).toBe('p1-settler-1')
  })

  it('AI-019 no Objective settings at all (a scenario without an ai block) reads as None and attacks', () => {
    const b = { ...bundle, records: { ...bundle.records, scenarios: bundle.records.scenarios.map((sc) => (sc.id === 'ai-rr' ? { ...sc, sides: sc.sides.map((sd) => { const { ai: _ai, ...rest } = sd; return rest }) } : sc)) } }
    const { s: s0 } = scene({ place: { 'ai-super-mutant-1': [0, -6], 'p1-settler-1': [0, -1] } })
    const d = newDecider(testCard({ response: 'O', reckless: true, method: 'ranged' }), b)
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d, b)
    expect(r.log.settings?.objective).toBe('none')
    expect(r.action.type).toBe('shoot.begin')
  })
})

describe('F, D, S (AI-006, AI-007, AI-008)', () => {
  it('AI-007 Fall Back moves toward the initial deployment point', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -2], 'p1-settler-1': [12, 12] } })
    const withDeploy = set(s0, 'ai-super-mutant-1', { tokens: { aiNumber: 5, deployX: 0, deployZ: -10.96 } })
    const d = newDecider(testCard({ response: 'F', reckless: true, method: 'close' }))
    const r = step(activate(withDeploy, b, 'ai-super-mutant-1'), d)
    expect(r.log.chain).toEqual(['F', 'M'])
    const p = step(r.state, d)
    expect(dist(p.state.models['ai-super-mutant-1']!.pos, { x: 0, z: -10.96 })).toBeLessThan(dist({ x: 0, z: -2 }, { x: 0, z: -10.96 }) - 3)
  })

  it('AI-007 at the deployment point a Fall Back model attacks without leaving it', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -10.96], 'p1-settler-1': [0, -4] } })
    const withDeploy = set(s0, 'ai-super-mutant-1', { tokens: { aiNumber: 5, deployX: 0, deployZ: -10.96 } })
    const d = newDecider(testCard({ response: 'F', reckless: true, method: 'ranged' }))
    const r = step(activate(withDeploy, b, 'ai-super-mutant-1'), d)
    expect(r.action.type).toBe('shoot.begin')
    // out of range of anything and a move would be needed: it does nothing
    const far = scene({ place: { 'ai-super-mutant-1': [0, -10.96], 'p1-settler-1': [12, 15] } })
    const f2 = set(far.s, 'ai-super-mutant-1', { tokens: { aiNumber: 5, deployX: 0, deployZ: -10.96 } })
    const r2 = step(activate(f2, far.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'F', reckless: true, method: 'close' })))
    expect(r2.action.type).toBe('turn.end')
  })

  it('AI-006 Defend attacks the enemy it would pick from the Subject position, and only that one', () => {
    const b = bundleWith({ objective: 'protect', subject: 'red-rocket' })
    const { s: s0 } = scene({ b, place: { 'ai-super-mutant-1': [0, -7], 'p1-settler-1': [-4, -3], 'p1-sole-survivor-1': [0, 2] } })
    const d = newDecider(testCard({ response: 'D', reckless: true, method: 'ranged', priorities: ['nearest'] }), b)
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d, b)
    // From the rocket the sole survivor (2 in) is nearer than the settler (5 in): it is the threat, and it is in range here.
    expect(r.log.ranking?.winner).toBe('p1-sole-survivor-1')
    expect(r.log.target?.id).toBe('p1-sole-survivor-1')
    expect(r.action.type).toBe('shoot.begin')
  })

  it('AI-006 Defend moves toward the Subject when the threat cannot be attacked this Action', () => {
    const b = bundleWith({ objective: 'protect', subject: 'red-rocket' })
    const { s: s0 } = scene({ b, place: { 'ai-super-mutant-1': [0, -16], 'p1-sole-survivor-1': [0, 2] } })
    const d = newDecider(testCard({ response: 'D', reckless: true, method: 'close' }), b)
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d, b)
    expect(r.action.type).toBe('move.go')
    expect(r.log.activity).toBe('defend.move')
  })

  it('AI-008 Strike attacks only if it can attack or engage this Action, else it moves', () => {
    const near = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32], 'p1-settler-1': [0, 0] } })
    const hit = step(activate(near.s, near.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'S', reckless: true, method: 'close' })))
    expect(hit.action.type).toBe('melee.attack')
    expect(hit.log.chain).toEqual(['S', 'A'])
    const far = scene({ place: { 'ai-super-mutant-1': [0, -15], 'p1-settler-1': [12, 15] } })
    const mv = step(activate(far.s, far.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'S', reckless: true, method: 'close' })))
    expect(mv.action.type).toBe('move.go')
    expect(mv.log.chain).toEqual(['S', 'M'])
  })
})

describe('Careful and Reckless targets (AI-009, AI-016)', () => {
  const lay = () => scene({ place: {
    'ai-super-mutant-1': [0, -9], 'p1-dogmeat-1': [-2, -4], 'ai-mutant-hound-1': [-2, -4 + (40 + 32) / 25.4 / 2], 'p1-settler-1': [6, -4],
  } })

  it('AI-009 a Reckless shooter may take an engaged enemy; a Careful one may not', () => {
    const { s, b } = lay()
    const reckless = step(activate(s, b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: true, method: 'ranged', priorities: ['nearest'] })))
    expect(reckless.log.target?.id).toBe('p1-dogmeat-1')
    const careful = step(activate(s, b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: false, method: 'ranged', priorities: ['nearest'] })))
    expect(careful.log.target?.id).toBe('p1-settler-1')
  })

  it('AI-016 the Response is fixed for the activation but the activity is chosen again before each Action', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -15], 'p1-settler-1': [0, 8] } })
    const d = newDecider(testCard({ response: 'A', reckless: true, method: 'ranged' }))
    const first = step(activate(s0, b, 'ai-super-mutant-1'), d)
    expect(first.action.type).toBe('move.go')
    const moved = step(first.state, d)
    const second = step(moved.state, d)
    expect(second.log.cell).toEqual(first.log.cell)
    expect(second.log.actionIndex).toBe(1)
    expect(first.log.actionIndex).toBe(0)
  })
})

describe('target priorities (AI-010, AI-011, AI-012, AI-017)', () => {
  const rank = (priorities: string[], place: Record<string, [number, number]>, subjectIds: string[] = [], patch?: (s: ReturnType<typeof scene>['s']) => ReturnType<typeof scene>['s']) => {
    const sc = scene({ place: { 'ai-super-mutant-1': [0, -8], ...place } })
    const s = patch ? patch(sc.s) : sc.s
    const card = testCard({ response: 'A', reckless: true, method: 'ranged', priorities })
    const v = view(s, 'ai')
    const me = s.models['ai-super-mutant-1']!
    const cell = resolveCell(card, me, 0, v, sc.b)
    cell.method = 'ranged'
    const cands = Object.values(s.models).filter((m) => m.owner === 'p1' && place[m.id])
    return rankTargets({ ...v, pending: { ...v.pending, id: 'd:7' } }, sc.b, me, card, cell, cands, 'shoot', subjectIds, (among, key) => (key.startsWith('tie:') ? [...among].sort()[0]! : among[0]!))
  }

  it('AI-010 Importance picks the enemy nearest the Subject, never the Subject itself', () => {
    const r = rank(['importance'], { 'p1-sole-survivor-1': [0, 0], 'p1-settler-1': [1.5, 0], 'p1-settler-2': [8, 0] }, ['p1-sole-survivor-1'])
    expect(r.winner).toBe('p1-settler-1')
    expect(r.steps[0]!.values['p1-sole-survivor-1']).toBeGreaterThan(1000)
  })

  it('AI-011 Vulnerable compares base armor and ignores Strong', () => {
    // Settler base 1 vs Dogmeat base 2; two Strong boosts on the settler must not change the order.
    const r = rank(['vulnerable'], { 'p1-settler-1': [0, 0], 'p1-dogmeat-1': [3, 0] }, [], (s) => set(s, 'p1-settler-1', { armorBoost: 2 }))
    expect(r.winner).toBe('p1-settler-1')
    const r2 = rank(['vulnerable'], { 'p1-settler-1': [0, 0], 'p1-sole-survivor-1': [3, 0] })
    expect(r2.winner).toBe('p1-settler-1')
    expect(r2.steps[0]!.values['p1-sole-survivor-1']).toBe(3)
  })

  it('AI-012 Leader keeps the model holding a Leader card', () => {
    const r = rank(['leader'], { 'p1-settler-1': [0, 0], 'p1-dogmeat-1': [4, 0] }, [], (s) => set(s, 'p1-dogmeat-1', { leaderId: 'someone' }))
    expect(r.winner).toBe('p1-dogmeat-1')
  })

  it('AI-017 priorities break ties in order and a leftover tie is a seeded, logged pick', () => {
    const r = rank(['wounded', 'weakest', 'nearest'], { 'p1-settler-1': [0, 0], 'p1-settler-2': [1, 0], 'p1-dogmeat-1': [-6, 0] }, [], (s) => set(set(s, 'p1-settler-1', { damage: 1 }), 'p1-settler-2', { damage: 1 }))
    expect(r.steps.map((x) => x.priority)).toEqual(['wounded', 'weakest', 'nearest'])
    expect(r.steps[0]!.kept.sort()).toEqual(['p1-settler-1', 'p1-settler-2'])
    expect(r.winner).toBe('p1-settler-1') // nearest of the two to the shooter
    const tie = rank(['wounded'], { 'p1-settler-1': [2, 0], 'p1-settler-2': [-2, 0] })
    expect(tie.tie?.among.sort()).toEqual(['p1-settler-1', 'p1-settler-2'])
    expect(tie.tie?.seedKey).toMatch(/^tie:/)
  })

  it('AI-017 the last AI model under a Defeat objective picks the Subject before its list', () => {
    const sc = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-sole-survivor-1': [6, 0], 'p1-settler-1': [0, -4] } })
    let s = sc.s
    for (const m of Object.values(s.models)) if (m.owner === 'ai' && m.id !== 'ai-super-mutant-1') s = set(s, m.id, { life: 'dead' })
    const card = testCard({ response: 'A', reckless: true, method: 'ranged', priorities: ['nearest'] })
    const v = view(s, 'ai')
    const me = s.models['ai-super-mutant-1']!
    const cell = { ...resolveCell(card, me, 0, v, sc.b), method: 'ranged' as const }
    const cands = [s.models['p1-sole-survivor-1']!, s.models['p1-settler-1']!]
    const r = rankTargets(v, sc.b, me, card, cell, cands, 'shoot', ['p1-sole-survivor-1'], (a) => a[0]!)
    expect(r.forced).toBe('lastModel')
    expect(r.winner).toBe('p1-sole-survivor-1')
  })
})

describe('engaged AI models and Push Back (AI-020, AI-021, AI-022)', () => {
  it('AI-020 an underlined cell on an engaged model stays and fights with the Close Combat Method', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32], 'p1-settler-1': [0, 0], 'p1-settler-2': [5, -6] } })
    const d = newDecider(testCard({ response: 'M', reckless: true, stay: true, method: 'ranged' }))
    const r = step(activate(s0, b, 'ai-super-mutant-1'), d)
    expect(r.action.type).toBe('melee.attack')
    expect(r.action.targetId).toBe('p1-settler-1')
    expect(r.log.chain).toContain('stay')
  })

  it('AI-020 a ranged model that is engaged but not underlined moves clear instead of shooting in melee', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32 - 3], 'p1-settler-1': [0, -3] } })
    const eng = set(s0, 'ai-super-mutant-1', { pos: { x: 0, z: -3 - CONTACT_40_32 } })
    expect(engagedWith(eng, 'ai-super-mutant-1')).toContain('p1-settler-1')
    const d = newDecider(testCard({ response: 'A', reckless: false, method: 'ranged' }))
    const r = step(activate(eng, b, 'ai-super-mutant-1'), d)
    expect(r.action.type).toBe('move.go')
    expect(r.log.activity).toBe('ranged.disengage')
    const p = step(r.state, d)
    expect(engagedWith(p.state, 'ai-super-mutant-1')).toEqual([])
  })

  it('AI-020 a close model that is not engaged with its intended target moves to engage it', () => {
    // Engaged with the settler, but the card ranks the sole survivor (wounded) first and it is close by.
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32], 'p1-settler-1': [0, 0], 'p1-sole-survivor-1': [4, -4] } })
    const hurt = set(s0, 'p1-sole-survivor-1', { damage: 2 })
    const d = newDecider(testCard({ response: 'A', reckless: true, method: 'close', priorities: ['wounded'] }))
    const r = step(activate(hurt, b, 'ai-super-mutant-1'), d)
    expect(r.log.target?.id).toBe('p1-sole-survivor-1')
    expect(r.action.type).toBe('move.go')
    const p = step(r.state, d)
    expect(engagedWith(p.state, 'ai-super-mutant-1')).toContain('p1-sole-survivor-1')
  })

  it('AI-021 Push Back follow-up follows the first rule that applies', () => {
    expect(followUpPushBack('A', 'ranged', false, true)).toBe(true) // charged
    expect(followUpPushBack('A', 'close', false, false)).toBe(true)
    expect(followUpPushBack('A', 'ranged', true, false)).toBe(false)
    expect(followUpPushBack('O', 'close', true, false)).toBe(true)
    expect(followUpPushBack('O', 'close', false, false)).toBe(false)
    expect(followUpPushBack('D', 'ranged', true, false)).toBe(true)
    expect(followUpPushBack('D', 'ranged', false, false)).toBe(false)
  })

  it('AI-022 after a Close Combat attack the AI slides away from the Subject when the enemy could reach it', () => {
    // The rocket (Subject) sits 1.5 in from the AI model; the settler could slide round it into contact with the rocket.
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -2.2], 'p1-settler-1': [0, -2.2 + CONTACT_40_32] } })
    const d = newDecider(testCard({ response: 'A', reckless: true, method: 'close' }))
    let s = activate(s0, b, 'ai-super-mutant-1')
    const r = step(s, d)
    expect(r.action.type).toBe('melee.attack')
    s = r.state
    let guard = 0
    while (s.pending.kind !== 'melee.slide' && s.pending.kind !== 'turn.activation' && guard++ < 6) s = step(s, d).state
    if (s.pending.kind === 'melee.slide') {
      const before = dist(s.models['ai-super-mutant-1']!.pos, s.markers[0]!.pos)
      const sl = step(s, d)
      const after = dist(sl.state.models['ai-super-mutant-1']!.pos, sl.state.markers[0]!.pos)
      expect(after).toBeGreaterThanOrEqual(before - 1e-6)
      expect(modelDistance(sl.state.models['ai-super-mutant-1']!, sl.state.models['p1-settler-1']!)).toBeLessThan(1e-6)
    }
  })
})

describe('weapons (AI-003, AI-009)', () => {
  it('AI-003 the underlined weapon is chosen; another is used when it cannot perform the Method', () => {
    const { s, b } = scene({})
    const me = s.models['ai-super-mutant-1']!
    const card = testCard({ response: 'A', notes: ['pref:board'] })
    expect(chooseWeapon(view(s, 'ai'), b, me, card, 'close')).toBe('ai-super-mutant-1/board')
    expect(chooseWeapon(view(s, 'ai'), b, me, card, 'ranged')).toBe('ai-super-mutant-1/bolt-action-pipe-rifle')
  })
})
