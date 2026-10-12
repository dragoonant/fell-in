import { describe, expect, it } from 'vitest'
import type { DiceDef, DieColour, Icon } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import {
  adjustResult, armorRoll, buildPool, computeSv, opposed, poolJoint, skillFace, skillOdds, skillTest, specialityMod,
  type SkillTestResult,
} from '../../src/engine/dice'
import { createGame, createDemoGame } from '../../src/engine/setup'
import { duel, loadBundle, patchBundle } from './helpers'

const bundle = loadBundle()
const dice = bundle.singletons.dice!
const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length
const facesOf = (c: DieColour) => dice.effect[c].map((f) => [...f.icons].sort().join('+') || 'blank')
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})

/** A bundle whose skill die has one face and whose effect dice each have one face, for exact scoring tests. */
function fixedDice(skill: { value: number | 'X'; icons: Icon[] }, effect: Partial<Record<DieColour, Icon[]>> = {}) {
  const d: DiceDef = structuredClone(dice)
  d.skill.faces = [skill]
  for (const c of ['black', 'green', 'yellow', 'blue'] as DieColour[]) if (effect[c]) d.effect[c] = [{ icons: effect[c]! }]
  return patchBundle(bundle, { dice: d })
}
const state = () => duel().state
const test = (b: ReturnType<typeof fixedDice>, sv: number, pool = {}, extra = {}): SkillTestResult =>
  skillTest(state(), b, { sv, pool, purpose: 't', ...extra }).test

describe('dice faces (data-driven)', () => {
  it('DICE-001 skill die: 2 AP, 3 CP, one each of 2-5, two each of 6-8, one each of 9-10, two X, one X+AP', () => {
    const f = dice.skill.faces
    expect(f).toHaveLength(20)
    expect(count(f, (x) => x.value === 1 && x.icons.includes('AP'))).toBe(2)
    expect(count(f, (x) => x.icons.includes('CP'))).toBe(3)
    for (const v of [2, 3, 4, 5, 9, 10]) expect(count(f, (x) => x.value === v)).toBe(1)
    for (const v of [6, 7, 8]) expect(count(f, (x) => x.value === v)).toBe(2)
    expect(count(f, (x) => x.value === 'X' && x.icons.length === 0)).toBe(2)
    expect(count(f, (x) => x.value === 'X' && x.icons.includes('AP'))).toBe(1)
  })

  it('DICE-002 AP and CP faces count as a result of 1', () => {
    for (let face = 1; face <= 5; face++) expect(skillFace(bundle, face).value).toBe(1)
  })

  it('DICE-003..006 effect dice faces match the sheet', () => {
    expect(tally(facesOf('black'))).toEqual({ DMG: 5, 'DMG+DMG': 1, blank: 3, BOT: 1, AR: 1, ACC1: 1 })
    expect(tally(facesOf('green'))).toEqual({ ACC1: 4, ACC2: 2, ACC3: 1, AR: 2, DMG: 2, BOT: 1 })
    expect(tally(facesOf('yellow'))).toEqual({ AR: 5, 'AR+AR': 1, blank: 2, BOT: 1, ACC1: 2, DMG: 1 })
    expect(tally(facesOf('blue'))).toEqual({ BOT: 4, 'BOT+BOT': 2, 'BOT+STAR': 1, STAR: 2, 'STAR+STAR': 1, BLAST: 2 })
  })

  it('DICE-007 armor die: four 1s, three 2s, three 3s, two 4s; armorRoll returns face values via roll()', () => {
    expect(tally(dice.armor.map(String))).toEqual({ 1: 4, 2: 3, 3: 3, 4: 2 })
    let s = state()
    for (let i = 0; i < 50; i++) {
      const r = armorRoll(s, bundle, 'armor')
      expect([1, 2, 3, 4]).toContain(r.value)
      expect(r.state.rollSeq).toBe(s.rollSeq + 1)
      s = r.state
    }
  })

  it('DICE-008 at most 4 dice of one colour; excess dropped before rolling', () => {
    const { pool, dropped } = buildPool(bundle, [{ black: 3, green: 1 }, { black: 3 }])
    expect(pool).toEqual({ black: 4, green: 1 })
    expect(dropped).toEqual({ black: 2 })
    const capped = skillTest(state(), bundle, { sv: 5, pool, purpose: 'cap' })
    expect(capped.test.effect.filter((d) => d.colour === 'black')).toHaveLength(4)
  })

  it('DICE-009 at most one bonus-die token per colour per test', () => {
    expect(buildPool(bundle, [{ yellow: 1 }], ['yellow', 'yellow', 'green']).pool).toEqual({ yellow: 2, green: 1 })
  })

  it('DICE-010 dice tables load from the edition data file, not engine literals', () => {
    const allX = fixedDice({ value: 'X', icons: [] })
    for (let i = 0; i < 5; i++) expect(skillTest(state(), allX, { sv: 99, purpose: `x${i}` }).test.success).toBe(false)
    expect(skillOdds(allX, 10).pHit).toBe(0)
  })
})

describe('skill tests', () => {
  it('SKILL-001 success iff (die value minus ACC) <= adjusted SV', () => {
    const b = fixedDice({ value: 5, icons: [] }, { green: ['ACC2'] })
    expect(test(b, 3, { green: 1 }).success).toBe(true) // 5 - 2 = 3
    expect(test(b, 2, { green: 1 }).success).toBe(false)
    expect(test(b, 3, { green: 1 }).result).toBe(3)
  })

  it('SKILL-002 every SV modifier is summed before comparing', () => {
    const { sv, breakdown } = computeSv(6, [
      { source: 'cover', label: 'Cover', value: -2, mode: 'add' },
      { source: 'quick', label: 'Quick Action', value: -2, mode: 'add' },
      specialityMod(bundle),
    ])
    expect(sv).toBe(4)
    expect(breakdown).toHaveLength(4)
  })

  it('SKILL-003 X always fails and cannot be modified', () => {
    const b = fixedDice({ value: 'X', icons: [] }, { green: ['ACC3'] })
    const t = test(b, 20, { green: 4 })
    expect(t.success).toBe(false)
    expect(t.forced).toBe('X')
    expect(adjustResult(t, -2).success).toBe(false)
  })

  it('SKILL-004 with SV below 1 only a CP face succeeds', () => {
    expect(test(fixedDice({ value: 1, icons: ['CP'] }), 0).success).toBe(true)
    expect(test(fixedDice({ value: 1, icons: ['AP'] }), 0).success).toBe(false)
    expect(test(fixedDice({ value: 2, icons: [] }, { green: ['ACC3'] }), 0, { green: 1 }).success).toBe(false)
    expect(test(fixedDice({ value: 1, icons: ['CP'] }), 3).cp).toBe(1)
  })

  it('SKILL-005 on a failure only skill-die AP icons count (AP-004 incl. X+AP)', () => {
    const t = test(fixedDice({ value: 'X', icons: ['AP'] }, { black: ['DMG'] }), 10, { black: 2 })
    expect(t.success).toBe(false)
    expect(t.ap).toBe(1)
    expect(t.icons.DMG).toBe(0)
    expect(t.rolled.DMG).toBe(2)
    const hit = test(fixedDice({ value: 2, icons: [] }, { black: ['DMG'] }), 10, { black: 2 })
    expect(hit.icons.DMG).toBe(2)
  })

  it('SKILL-006 speciality adds the rules constant (+2)', () => {
    expect(specialityMod(bundle).value).toBe(2)
    const b = fixedDice({ value: 7, icons: [] })
    expect(test(b, 5).success).toBe(false)
    expect(test(b, computeSv(5, [specialityMod(bundle)]).sv).success).toBe(true)
  })

  it('SKILL-007 opposed: higher successful result wins; a winner must succeed; tie to the higher SV', () => {
    const mk = (value: number, sv: number) => test(fixedDice({ value, icons: [] }), sv)
    expect(opposed(mk(4, 6), mk(6, 6))).toBe('b')
    expect(opposed(mk(4, 6), mk(8, 6))).toBe('a') // b failed
    expect(opposed(mk(9, 6), mk(8, 6))).toBeNull()
    expect(opposed(mk(5, 7), mk(5, 6))).toBe('a')
    expect(opposed(mk(5, 6), mk(5, 6), 'a')).toBe('a') // Battle Cry: tie to the charger
  })

  it('SKILL-008 choosing to fail sets the skill die to X; effect dice still roll; no rerolls', () => {
    const s = state()
    const r = skillTest(s, bundle, { sv: 20, pool: { blue: 2 }, purpose: 'fail', chooseFail: true, rerolls: [() => ({ skill: true, effect: [0] })] })
    expect(r.test.success).toBe(false)
    expect(r.test.forced).toBe('choseFail')
    expect(r.test.skillFace).toBeNull()
    expect(r.test.effect).toHaveLength(2)
    expect(r.state.rollSeq).toBe(s.rollSeq + 1) // only the blue pool was rolled
  })

  it('SKILL-009 hit odds are exact: reference table and brute-force enumeration', () => {
    const ref: Record<number, number> = { 1: 0.25, 2: 0.3, 3: 0.35, 4: 0.4, 5: 0.45, 6: 0.55, 7: 0.65, 8: 0.75, 9: 0.8, 10: 0.85, 14: 0.85 }
    for (const [sv, p] of Object.entries(ref)) expect(skillOdds(bundle, Number(sv)).pHit).toBeCloseTo(p, 12)
    // brute force over every face of 1 green + 1 black at SV 4
    let hits = 0, n = 0
    for (const sf of dice.skill.faces) for (const g of dice.effect.green) for (const k of dice.effect.black) {
      n++
      if (sf.value === 'X') continue
      const acc = [...g.icons, ...k.icons].reduce((a, i) => a + (i === 'ACC1' ? 1 : i === 'ACC2' ? 2 : i === 'ACC3' ? 3 : 0), 0)
      if (sf.value - acc <= 4) hits++
    }
    const odds = skillOdds(bundle, 4, { green: 1, black: 1 })
    expect(odds.pHit).toBeCloseTo(hits / n, 12)
    expect(odds.onHit.reduce((a, o) => a + o.p, 0)).toBeCloseTo(odds.pHit, 12)
    expect(poolJoint(bundle, { green: 1, black: 1 }).reduce((a, o) => a + o.p, 0)).toBeCloseTo(1, 12)
    expect(odds.pHitAccurate).toBeGreaterThan(odds.pHit)
  })

  it('RNG determinism: the same seed and calls give the same dice; only roll() advances rng and rollSeq', () => {
    const a = skillTest(state(), bundle, { sv: 6, pool: { black: 2, green: 1 }, purpose: 'd' })
    const b = skillTest(state(), bundle, { sv: 6, pool: { black: 2, green: 1 }, purpose: 'd' })
    expect(a.test).toEqual(b.test)
    expect(a.state.rollSeq).toBe(state().rollSeq + 3) // skill + black + green
    expect(a.events.map((e) => e.purpose)).toEqual(['d:skill', 'd:black', 'd:green'])
  })
})

describe('foundations', () => {
  it('SETUP-002 createGame builds the default box scenario: Survivors vs Super Mutants, 36 x 36, turn.start open', () => {
    const g = createGame(bundle, { seed: 's' })
    expect(g.scenario.table).toEqual({ w: 36, d: 36 })
    expect(g.scenarioId).toBe('box-1')
    const factions = new Set(Object.values(g.models).map((m) => `${m.owner}:${bundle.records.units.find((u) => u.id === m.profileId)!.faction}`))
    expect(factions).toEqual(new Set(['A:survivors', 'B:super-mutants']))
    expect(g.pending.kind).toBe('turn.start')
    expect(g.pending.options[0]!.action.decisionId).toBe(g.pending.id)
    expect(g.terrain.length).toBeGreaterThan(0)
    expect(g.markers).toHaveLength(3)
    for (const m of Object.values(g.models)) expect(Math.abs(m.pos.z)).toBeGreaterThan(12)
    expect(createGame(bundle, { seed: 's' })).toEqual(g)
    expect(createDemoGame().phase).toBe('setup')
  })

  it('APPLY-001 apply rejects stale, wrong-seat and illegal actions without changing state', () => {
    const { state: s } = duel()
    const ok = s.pending.options[0]!.action
    expect(apply(s, bundle, { ...ok, decisionId: 'd:999' })).toMatchObject({ ok: false, state: s, rejection: { code: 'E_STALE_DECISION' } })
    expect(apply(s, bundle, { ...ok, seat: 'B' })).toMatchObject({ ok: false, rejection: { code: 'E_WRONG_SEAT' } })
    expect(apply(s, bundle, { ...ok, type: 'shoot.fire' })).toMatchObject({ ok: false, rejection: { code: 'E_NOT_LEGAL' } })
  })
})
