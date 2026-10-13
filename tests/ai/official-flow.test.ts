// Official AI: turn flow, matrix, objectives, responses and targets (AI-001..015; spec 18).
import { describe, expect, it } from 'vitest'
import { aiNumbersOf, blueFaceFor, createOfficialAiDecider, drawToken } from '../../src/ai/official/decider'
import { blueFaces, blueIconKey, columnFor, resolveCell, rowFor } from '../../src/ai/official/matrix'
import { apply } from '../../src/engine/apply'
import { engagedWith } from '../../src/engine/attack'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import { view } from '../../src/engine/view'
import { CONTACT_40_32, activate, bundle, newDecider, scene, step, testCard } from './official-helpers'

const aiGame = (seed = 'f1') => createGame(bundle, { seed, scenarioId: 'ai-rr', seats: ['p1', 'ai'] })

describe('turn flow (AI-001)', () => {
  it('AI-001 draws a Number Token from the legal ready options, deterministically, and never passes', () => {
    let s = aiGame()
    const start = apply(s, bundle, legalActions(s)[0]!)
    expect(start.ok).toBe(true)
    if (!start.ok) return
    s = start.state
    const first = s.pending.options.find((o) => o.action.firstSeat === 'ai')!.action
    const a = apply(s, bundle, first)
    expect(a.ok).toBe(true)
    if (!a.ok) return
    s = a.state
    expect(s.pending.kind).toBe('turn.ready')
    const d1 = createOfficialAiDecider({ seed: 'tok', bundle })
    const d2 = createOfficialAiDecider({ seed: 'tok', bundle })
    const r1 = d1.decideSync(view(s, 'ai'), s.pending, legalActions(s))
    const r2 = d2.decideSync(view(s, 'ai'), s.pending, legalActions(s))
    expect(r1.action.type).toBe('turn.ready')
    expect(legalActions(s).some((l) => l.modelId === r1.action.modelId)).toBe(true)
    expect(r2.action.modelId).toBe(r1.action.modelId)
    expect(drawToken('tok', s.pending, legalActions(s)).modelId).toBe(r1.action.modelId)
    const next = apply(s, bundle, r1.action)
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.state.pending.kind).toBe('turn.choose')
    const choose = d1.decideSync(view(next.state, 'ai'), next.state.pending, legalActions(next.state))
    expect(choose.action.type).toBe('turn.useAll')
  })

  it('AI-001 picks the Ready model with the lowest Number', () => {
    const { s } = scene({})
    const ids = Object.values(s.models).filter((m) => m.owner === 'ai').map((m) => m.id)
    const nums = aiNumbersOf(view(s, 'ai'), 'x')
    expect(Object.values(nums).sort()).toEqual([1, 2, 3, 4, 5])
    const low = ids.find((id) => nums[id] === 1)!
    const high = ids.find((id) => nums[id] === 5)!
    const pending = { id: 'd:99', seat: 'ai', kind: 'turn.pick', context: {}, canPass: false, options: [] }
    const legal = [high, low].map((id) => ({ type: 'turn.pick', decisionId: 'd:99', seat: 'ai', modelId: id }))
    const d = createOfficialAiDecider({ seed: 'x', bundle })
    expect(d.decideSync(view(s, 'ai'), pending, legal).action.modelId).toBe(low)
  })

  it('AI-001 derives a stable Number permutation when the engine set none', () => {
    const { s } = scene({})
    const stripped = { ...s, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, tokens: {} }])) }
    const a = aiNumbersOf(view(stripped, 'ai'), 'seedA')
    const b = aiNumbersOf(view(stripped, 'ai'), 'seedA')
    expect(a).toEqual(b)
    expect(Object.values(a).sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('matrix (AI-002)', () => {
  it('AI-002 the blue die has 12 faces with the printed icon split and bottle+star counts as one star', () => {
    expect(blueFaces(bundle)).toBe(12)
    const keys: Record<string, number> = {}
    for (let f = 0; f < 12; f++) keys[blueIconKey(bundle, f)] = (keys[blueIconKey(bundle, f)] ?? 0) + 1
    expect(keys).toEqual({ BOT: 4, BOT2: 2, 'BOT+STAR': 1, STAR: 2, STAR2: 1, BLAST: 2 })
    const card = bundle.records.ai.find((c) => c.id === 'ai-super-mutant')!
    expect(rowFor(card, 'BOT+STAR').row).toBe(rowFor(card, 'STAR').row)
  })

  it('AI-002 the blue die is rolled from the seed, round and model: same inputs, same face', () => {
    expect(blueFaceFor('s', 2, 'ai-brute-1', 12)).toBe(blueFaceFor('s', 2, 'ai-brute-1', 12))
    const faces = new Set<number>()
    for (let r = 1; r <= 40; r++) faces.add(blueFaceFor('s', r, 'ai-brute-1', 12))
    expect(faces.size).toBeGreaterThan(6)
    for (const f of faces) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(12) }
  })

  it('AI-002 the column is the first one that is true from the left, else the last', () => {
    const { s } = scene({})
    const card = bundle.records.ai.find((c) => c.id === 'ai-brute')! // 5+, 3-4, 1-2
    const brute = s.models['ai-brute-1']!
    const v = view(s, 'ai')
    expect(columnFor(card, brute, v, bundle)).toBe(0) // full Health
    const hurt = (n: number) => {
      const m = { ...brute, damage: n }
      return columnFor(card, m, { ...v, models: { ...v.models, [m.id]: m } }, bundle)
    }
    expect(hurt(0)).toBe(0)
    expect(hurt(100)).toBe(2) // nothing matches: the last column
    const cell = resolveCell(card, brute, 0, v, bundle)
    expect(cell.row).toBe(rowFor(card, blueIconKey(bundle, 0)).row)
    expect(cell.icons).toBe('BOT')
  })
})

describe('A: Attack (AI-003, AI-013)', () => {
  it('AI-003 ranged Method uses the ranged weapon and shoots the best target by the card priorities', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [0, 0], 'p1-sole-survivor-1': [6, 0] } })
    const card = testCard({ response: 'A', reckless: true, method: 'ranged', priorities: ['nearest'], notes: ['pref:board'] })
    const d = newDecider(card)
    const s = activate(s0, b, 'ai-super-mutant-1')
    const r = step(s, d)
    expect(r.action.type).toBe('shoot.begin')
    expect(r.action.weaponUid).toBe('ai-super-mutant-1/bolt-action-pipe-rifle')
    expect(r.log.activity).toBe('ranged.shoot')
    expect(r.log.chain).toEqual(['A'])
    expect(r.log.target).toEqual({ id: 'p1-settler-1', kind: 'model' })
    const t = step(r.state, d)
    expect(t.action.type).toBe('shoot.target')
    expect(t.action.targetId).toBe('p1-settler-1')
  })

  it('AI-003 close Method uses the preferred weapon in Close Combat', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32], 'p1-settler-1': [0, 0] } })
    const card = testCard({ response: 'A', reckless: true, method: 'close', notes: ['pref:board'] })
    const s = activate(s0, b, 'ai-super-mutant-1')
    expect(engagedWith(s, 'ai-super-mutant-1')).toContain('p1-settler-1')
    const r = step(s, newDecider(card))
    expect(r.action.type).toBe('melee.attack')
    expect(r.action.weaponUid).toBe('ai-super-mutant-1/board')
    expect(r.log.activity).toBe('cc.strike')
  })

  it('AI-003 with nobody to shoot it moves toward an enemy; with an enemy in reach it charges', () => {
    const far = scene({ place: { 'ai-super-mutant-1': [0, -14], 'p1-settler-1': [0, 8] } })
    const card = testCard({ response: 'A', reckless: true, method: 'ranged' })
    const r = step(activate(far.s, far.b, 'ai-super-mutant-1'), newDecider(card))
    expect(r.action.type).toBe('move.go')
    expect(['ranged.approach', 'move.towardEnemy']).toContain(r.log.activity)
    const near = scene({ place: { 'ai-super-mutant-1': [0, -4], 'p1-settler-1': [0, 0] } })
    const ch = step(activate(near.s, near.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: true, method: 'close' })))
    expect(ch.action.type).toBe('charge.go')
    expect(ch.log.activity).toBe('cc.charge')
  })

  it('AI-013 the Improvised Weapon is used only when nothing better exists; no weapon for the Method means no attack', () => {
    const base = scene({ place: { 'ai-super-mutant-1': [0, -CONTACT_40_32], 'p1-settler-1': [0, 0] } })
    const unarmed = { ...base.s, models: { ...base.s.models, 'ai-super-mutant-1': { ...base.s.models['ai-super-mutant-1']!, carried: [] } } }
    const card = testCard({ response: 'A', reckless: true, method: 'close' })
    const r = step(activate(unarmed, base.b, 'ai-super-mutant-1'), newDecider(card))
    expect(r.action.type).toBe('melee.attack')
    expect(String(r.action.weaponUid)).toMatch(/improvised-weapon$/)
    const ranged = scene({ place: { 'ai-super-mutant-1': [0, -6], 'p1-settler-1': [0, 0] } })
    const none = { ...ranged.s, models: { ...ranged.s.models, 'ai-super-mutant-1': { ...ranged.s.models['ai-super-mutant-1']!, carried: [] } } }
    const r2 = step(activate(none, ranged.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: true, method: 'ranged' })))
    expect(r2.action.type).not.toBe('shoot.begin')
    expect(r2.action.type).not.toBe('melee.attack')
  })
})
