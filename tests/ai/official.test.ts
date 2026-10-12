// Official AI procedure tests (spec 18 s8): responses A, M, O, F, D, S, Careful filter, priorities, luck, trace.
import { describe, expect, it } from 'vitest'
import { createOfficialAiDecider, makeOfficialContext, newOfficialMemory } from '../../src/ai/official/decider'
import { normalizeFactor, rankTargets, validTargets } from '../../src/ai/official/targeting'
import { AI_TRACE_FIELD, type AiSetting, type AiTrace } from '../../src/ai/official/types'
import type { AiCardDef, EditionBundle } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import { activationMenu } from '../../src/engine/turnflow'
import type { Action, GameState } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { duel, loadBundle, withPending } from '../engine/helpers'

const base = loadBundle()
const ICONS = [['BOT', 'BOT2', 'BOT+STAR'], ['STAR', 'STAR2'], ['BLAST']] as const

/** A card whose every cell is one response (so the blue die cannot change the outcome). */
function cardOf(unitId: string, response: 'A' | 'M' | 'O' | 'F' | 'D' | 'S', o: { reckless?: boolean; stay?: boolean; method?: ('ranged' | 'close')[]; priority?: string[] } = {}): AiCardDef {
  const cell = { response, reckless: !!o.reckless, stayEngaged: !!o.stay }
  return {
    id: `ai-${unitId}`, unitId, standardEquipment: [],
    columns: [{ label: '1+', when: { other: 'health:1+' } }],
    rows: ICONS.map((blueIcons) => ({ blueIcons: [...blueIcons], cells: [cell], method: o.method ?? ['ranged', 'close'] })),
    targetPriority: o.priority ?? ['Nearest'], source: 'test fixture, Unsourced',
  } as AiCardDef
}
const withCards = (...cards: AiCardDef[]): EditionBundle => ({ ...base, records: { ...base.records, ai: cards } })

/** The AI (seat A) mid-activation on a real menu; returns its answer to the first decision. */
function menuAnswer(card: AiCardDef, distance: number, setting?: AiSetting) {
  const bundle = withCards(card)
  const d = duel({ distance })
  const state = withPending(d.state, { seat: 'A', kind: 'turn.activation', context: { modelId: d.attackerId, actionsLeft: 2, ap: 0 }, options: activationMenu(d.state, bundle, d.attackerId), canPass: false })
  const ai = createOfficialAiDecider(bundle, { seed: 'menu', accepts: (a: Action) => apply(state, bundle, a).ok, settings: setting })
  const r = ai.decideSync(view(state, 'A'), state.pending, legalActions(state))
  return { ...r, state, bundle, d, ai }
}

describe('official AI responses (spec 18 s8.5)', () => {
  it('AI-003 A shoots the nearest valid target with the best weapon', () => {
    const r = menuAnswer(cardOf('sole-survivor', 'A'), 8)
    expect(r.action.type).toBe('shoot.begin')
    expect(r.fallback).toBe(false)
    expect(String(r.action.weaponUid)).toContain('hunting-rifle')
    const act = (r.trace.entries.find((e) => e.kind === 'activity') as unknown as { activity: { kind: string; targetId: string } }).activity
    expect(act).toMatchObject({ kind: 'shoot', targetId: r.d.targetId })
  })

  it('AI-004 M moves toward the Subject without attacking, even with a target in range', () => {
    const r = menuAnswer(cardOf('sole-survivor', 'M'), 20)
    expect(r.action.type).toBe('move.go')
    expect(r.fallback).toBe(false)
  })

  it('AI-005 O with Defeat attacks the Subject; with a far Go To Subject it heads for it', () => {
    expect(menuAnswer(cardOf('sole-survivor', 'O'), 8, { objective: 'defeat', subject: 'super-mutant' }).action.type).toBe('shoot.begin')
    expect(menuAnswer(cardOf('sole-survivor', 'O'), 20, { objective: 'goTo', subject: 'super-mutant' }).action.type).toBe('move.go')
  })

  it('AI-006 F moves toward the deployment point when away, attacks in place when there (R-13)', () => {
    const here = menuAnswer(cardOf('sole-survivor', 'F', { reckless: true }), 8)
    expect(here.action.type).toBe('shoot.begin') // the first position seen is the deployment point
    const bundle = withCards(cardOf('sole-survivor', 'F'))
    const d = duel({ distance: 20 })
    const ai = createOfficialAiDecider(bundle, { seed: 'f', accepts: () => true })
    ai.memory.deploy[d.attackerId] = { x: 0, z: d.state.models[d.attackerId]!.pos.z + 6 }
    const state = withPending(d.state, { seat: 'A', kind: 'turn.activation', context: { modelId: d.attackerId, actionsLeft: 2, ap: 0 }, options: activationMenu(d.state, bundle, d.attackerId), canPass: false })
    expect(ai.decideSync(view(state, 'A'), state.pending, legalActions(state)).action.type).toBe('move.go')
  })

  it('AI-007 D (Protect self) attacks the top enemy as if standing at the Subject', () => {
    expect(menuAnswer(cardOf('sole-survivor', 'D'), 8, { objective: 'protect', subject: 'self' }).action.type).toBe('shoot.begin')
  })

  it('AI-008 S attacks when it can, moves when it cannot', () => {
    expect(menuAnswer(cardOf('sole-survivor', 'S'), 8).action.type).toBe('shoot.begin')
    expect(menuAnswer(cardOf('sole-survivor', 'S'), 30).action.type).toBe('move.go')
  })

  it('AI-009 Careful never targets an enemy engaged with a friendly; Reckless may', () => {
    const bundle = withCards(cardOf('sole-survivor', 'A'))
    const d = duel({ distance: 8 })
    const t = d.state.models[d.targetId]!
    const friend = { ...d.state.models[d.attackerId]!, id: 'friend', pos: { x: t.pos.x + 1.26, z: t.pos.z }, readiness: 'unready' as const }
    const st = { ...d.state, models: { ...d.state.models, friend } }
    const ctx = makeOfficialContext(bundle, { seed: 'c' }, newOfficialMemory(), view(st, 'A'), st.pending, legalActions(st))
    expect(validTargets(ctx, d.attackerId, 'careful', 'ranged')).not.toContain(d.targetId)
    expect(validTargets(ctx, d.attackerId, 'reckless', 'ranged')).toContain(d.targetId)
  })
})

describe('official AI priorities, luck and trace', () => {
  it('AI-010 Nearest ranks the closer enemy first and the ranking is traced', () => {
    const bundle = withCards(cardOf('sole-survivor', 'A', { priority: ['Nearest'] }))
    const g = createGame(bundle, { seed: 'rank' })
    const mine = Object.values(g.models).find((m) => m.owner === g.seatOrder[0])!
    const foes = Object.values(g.models).filter((m) => m.owner !== mine.owner).slice(0, 2)
    const models = { ...g.models, [mine.id]: { ...mine, pos: { x: 0, z: 0 } }, [foes[0]!.id]: { ...foes[0]!, pos: { x: 0, z: -12 } }, [foes[1]!.id]: { ...foes[1]!, pos: { x: 0, z: -5 } } }
    const st = { ...g, models }
    const ctx = makeOfficialContext(bundle, { seed: 'rank' }, newOfficialMemory(), view(st, mine.owner), st.pending, legalActions(st))
    const rk = rankTargets(ctx, bundle.records.ai[0]!, mine.id, [foes[0]!.id, foes[1]!.id])
    expect(rk.ranked[0]!.id).toBe(foes[1]!.id)
    expect(ctx.trace.entries.some((e) => e.kind === 'ranking')).toBe(true)
    expect(normalizeFactor('Ready')).toBe('prepared')
  })

  it('AI-011 Luck is spent on dodge only (R-17)', () => {
    const bundle = withCards(cardOf('sole-survivor', 'A'))
    const d = duel({ distance: 8 })
    const ask = (which: string) => {
      const options = [true, false].map((use) => ({ id: String(use), label: String(use), action: { type: 'shoot.luck', decisionId: '', seat: 'A', ask: which, use } as Action }))
      const st = withPending(d.state, { seat: 'A', kind: 'shoot.luck', context: { ask: which }, options, canPass: false })
      return createOfficialAiDecider(bundle, { seed: 'luck' }).decideSync(view(st, 'A'), st.pending, legalActions(st)).action.use
    }
    expect(ask('dodge')).toBe(true)
    expect(ask('accurate')).toBe(false)
    expect(ask('crit')).toBe(false)
  })

  it('AI-015 every answer carries a trace; same seed gives the same full-game log', () => {
    const bundle = withCards(cardOf('sole-survivor', 'A'), cardOf('dogmeat', 'S'), cardOf('settler', 'A'), cardOf('enslaved-tech', 'O'),
      cardOf('brute', 'A', { stay: true }), cardOf('super-mutant', 'S'), cardOf('mutant-hound', 'A', { reckless: true }))
    const run = () => {
      let state: GameState = createGame(bundle, { seed: 'full', scenarioId: 'box-1' })
      const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createOfficialAiDecider(bundle, { seed: `full:${s}`, scenarioId: 'box-1', accepts: (a: Action) => apply(state, bundle, a).ok, budgetMs: 100 })]))
      const log: Action[] = []
      for (let n = 0; n < 350 && state.phase !== 'over'; n++) {
        const p = state.pending
        const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
        const { action } = ds[seat]!.decideSync(view(state, seat), p, legalActions(state))
        const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
        if (!r.ok) throw new Error(`rejected ${action.type}: ${r.rejection.message}`)
        state = r.state; log.push(action)
      }
      return { log, errors: Object.values(ds).reduce((n, x) => n + x.memory.stats.errors, 0) }
    }
    const a = run(), b = run()
    for (const x of a.log) expect((x[AI_TRACE_FIELD] as AiTrace).decisionId).toBe(x.decisionId)
    expect(a.log.map((x) => JSON.stringify(x))).toEqual(b.log.map((x) => JSON.stringify(x)))
    expect(a.errors).toBe(0)
    expect(a.log.some((x) => x.type === 'shoot.target' || x.type === 'melee.attack' || x.type === 'charge.go')).toBe(true)
  })

  it('COOP-001 the AI readies one model per turn, then Uses all Ready models', () => {
    const bundle = withCards(cardOf('sole-survivor', 'A'))
    let state: GameState = createGame(bundle, { seed: 'coop', scenarioId: 'box-1' })
    const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createOfficialAiDecider(bundle, { seed: `coop:${s}`, accepts: (a: Action) => apply(state, bundle, a).ok })]))
    const kinds: string[] = []
    for (let n = 0; n < 60 && state.phase !== 'over'; n++) {
      const p = state.pending
      const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
      const { action } = ds[seat]!.decideSync(view(state, seat), p, legalActions(state))
      if (['turn.ready', 'turn.choose'].includes(p.kind)) kinds.push(`${p.kind}:${action.type}`)
      const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
      if (!r.ok) throw new Error(r.rejection.message)
      state = r.state
    }
    expect(kinds.filter((k) => k === 'turn.ready:turn.ready').length).toBeGreaterThan(0)
    expect(kinds.every((k) => k !== 'turn.choose:turn.useNone')).toBe(true)
  })
})
