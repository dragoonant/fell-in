// PERK-001..008 (spec 19 s2.3, checklist 12).
import { describe, expect, it } from 'vitest'
import { toBattle } from '../../src/campaign/battle'
import { reduce } from '../../src/campaign/reducer'
import { forceValue } from '../../src/campaign/rules'
import { CampaignError, type CampaignAction } from '../../src/campaign/types'
import { SEAT, P, act, at, caps, fresh, makeData, modelOf, planAll, withPlayer, type Fx } from './fixtures'

const code = (f: () => unknown): string => { try { f(); return 'no error' } catch (e) { return e instanceof CampaignError ? e.code : String(e) } }
const run = (fx: Fx, a: CampaignAction): string => code(() => reduce(fx.c, a, fx.d))
const buildFx = (over = {}): Fx => { const fx = fresh(over); return { ...fx, c: caps(at(fx.c, 'build.perks'), 200) } }
const buy = (fx: Fx, perkId: string, unit?: string): Fx => act(fx, { type: 'build.perks', seat: SEAT, op: 'buy', perkId, ...(unit ? { modelId: modelOf(fx.c, unit).id } : {}) })
const tryBuy = (fx: Fx, perkId: string, unit?: string): string => run(fx, { type: 'build.perks', seat: SEAT, op: 'buy', perkId, ...(unit ? { modelId: modelOf(fx.c, unit).id } : {}) })

describe('buying and removing Perks', () => {
  it('PERK-001 a Perk is bought once per model, never the same Perk twice on one model', () => {
    let fx = buy(buildFx(), 'mysterious-stranger', 'sole-survivor')
    expect(modelOf(fx.c, 'sole-survivor').perks).toEqual(['mysterious-stranger'])
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.phase.perkBought = [] }) } // a later phase
    expect(tryBuy(fx, 'mysterious-stranger', 'sole-survivor')).toBe('E_PERK')
    expect(tryBuy(fx, 'mysterious-stranger', 'settler')).toBe('no error') // another model may take it
  })

  it('PERK-002 a settlement-wide Perk is bought once per settlement and is assigned to no model', () => {
    const fx = buy(buildFx(), 'local-leader')
    expect(P(fx.c).perks).toEqual(['local-leader'])
    expect(P(fx.c).roster.every((m) => m.perks.length === 0)).toBe(true)
    expect(tryBuy(fx, 'local-leader')).toBe('E_PERK')
    expect(tryBuy(buildFx(), 'local-leader', 'settler')).toBe('E_PERK')
  })

  it('PERK-003 at most one new Perk per model per Settlement Phase', () => {
    const fx = buy(buildFx(), 'mysterious-stranger', 'sole-survivor')
    expect(tryBuy(fx, 'unique-only', 'sole-survivor')).toBe('E_PERK')
    expect(tryBuy(fx, 'unique-only', 'dogmeat')).toBe('no error') // a different model is fine
    expect(tryBuy(buy(fx, 'local-leader'), 'local-leader-ii')).toBe('no error') // settlement-wide Perks are not per model
  })

  it('PERK-004 a Perk requirements (attribute minimum, prerequisite Perk) are checked at purchase', () => {
    const fx = buildFx()
    expect(tryBuy(fx, 'nerd-rage', 'sole-survivor')).toBe('E_PERK') // INT 5 < 8
    expect(tryBuy(fx, 'nerd-rage', 'enslaved-tech')).toBe('no error') // INT 8
    expect(tryBuy(fx, 'lone-wanderer', 'sole-survivor')).toBe('E_PERK') // needs Mysterious Stranger first
    expect(tryBuy(buy(fx, 'mysterious-stranger', 'sole-survivor'), 'lone-wanderer', 'sole-survivor')).toBe('E_PERK') // same phase: one per model
    const later = { ...fx, c: withPlayer(buy(fx, 'mysterious-stranger', 'sole-survivor').c, (p) => { p.phase.perkBought = [] }) }
    expect(tryBuy(later, 'lone-wanderer', 'sole-survivor')).toBe('no error')
    expect(tryBuy(fx, 'unique-only', 'settler')).toBe('E_PERK') // not a unique character
    expect(tryBuy(buy(fx, 'local-leader'), 'local-leader-ii')).toBe('no error')
    expect(tryBuy(fx, 'local-leader-ii')).toBe('E_PERK') // needs Local Leader
  })

  it('PERK-005 removing a Perk refunds nothing and is refused while another owned Perk requires it', () => {
    let fx = buildFx()
    fx = buy(fx, 'mysterious-stranger', 'sole-survivor')
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.phase.perkBought = [] }) }
    fx = buy(fx, 'lone-wanderer', 'sole-survivor')
    const caps0 = P(fx.c).caps
    const rm = (perkId: string): CampaignAction => ({ type: 'build.perks', seat: SEAT, op: 'remove', perkId, modelId: modelOf(fx.c, 'sole-survivor').id })
    expect(run(fx, rm('mysterious-stranger'))).toBe('E_REQUIRED')
    fx = act(fx, rm('lone-wanderer'))
    fx = act(fx, rm('mysterious-stranger'))
    expect(P(fx.c).caps).toBe(caps0) // no refund
    expect(modelOf(fx.c, 'sole-survivor').perks).toEqual([])
  })
})

describe('Perks in a force', () => {
  it('PERK-006 an unequipped owned Perk costs no caps for that battle and has no effect in it', () => {
    let fx = buy(buildFx(), 'mysterious-stranger', 'sole-survivor')
    fx = { ...fx, c: at(fx.c, 'force.create') }
    const ss = modelOf(fx.c, 'sole-survivor').id
    const bare = planAll(fx.c).plan
    const equipped = { ...bare, equipPerks: { [ss]: ['mysterious-stranger'] } }
    expect(forceValue(P(fx.c), fx.d, equipped) - forceValue(P(fx.c), fx.d, bare)).toBe(fx.d.perks.find((p) => p.id === 'mysterious-stranger')!.cost)
    fx = act(fx, { type: 'force.create', seat: SEAT, plan: bare })
    expect(toBattle(fx.c, 'box-1', fx.d, { opponent: 'bot' }).forces![SEAT]!.every((f) => ((f as { perks?: string[] }).perks ?? []).length === 0)).toBe(true)
    expect(run(fx, { type: 'force.create', seat: SEAT, plan: { ...bare, equipPerks: { [modelOf(fx.c, 'settler').id]: ['mysterious-stranger'] } } })).toBe('E_FORCE') // only the model that bought it
  })

  it('PERK-007 Gun Nut and Blacksmith each grant one free Weapons Workbench; Armorer grants one free Armor Workbench', () => {
    const count = (fx: Fx, id: string) => P(fx.c).structures.filter((s) => s.defId === id).length
    let fx = buy(buildFx(), 'gun-nut-rifle')
    expect(count(fx, 'weapons-workbench')).toBe(1)
    fx = buy(fx, 'blacksmith')
    expect(count(fx, 'weapons-workbench')).toBe(2)
    expect(count(fx, 'armor-workbench')).toBe(0)
    fx = buy(fx, 'armorer')
    expect(count(fx, 'armor-workbench')).toBe(1)
    expect(count(fx, 'power-armor-station')).toBe(0) // never a Power Armor Station
  })

  it('PERK-008 Perk costs come from COST "PERKS" through the edition bundle, never a code literal', () => {
    const perks = makeData().perks.map((p) => (p.id === 'blacksmith' ? { ...p, cost: 11 } : p))
    const fx = buildFx({ perks })
    expect(P(buy(fx, 'blacksmith').c).caps).toBe(200 - 11)
  })
})
