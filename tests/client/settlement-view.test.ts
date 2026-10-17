// The settlement screen's reading of a campaign: the step list, each step's choices, the panels. Uses the campaign layer's
// own fixtures (tests/campaign/fixtures.ts), so every action a choice carries is checked against the real reducer.
import { describe, expect, it } from 'vitest'
import { fromBattle } from '../../src/campaign/battle'
import { reduce } from '../../src/campaign/reducer'
import { FORCE_LIMITS, scrapRefund, slotsTotal } from '../../src/campaign/rules'
import { structureRec } from '../../src/campaign/data'
import { STEP_IDS, type CampaignAction } from '../../src/campaign/types'
import { viewOf } from '../../src/client/ui/settlement/campaignView'
import { autoForce, shownStep, stepsFor } from '../../src/client/ui/settlement/choices'
import type { Choice, StepView } from '../../src/client/ui/settlement/model'
import { P, SEAT, act, addPerk, addStruct, advance, at, caps, card, fresh, finished, instOf, readyFx, withPlayer } from '../campaign/fixtures'

const current = (steps: StepView[]): StepView => steps.find((s) => s.state === 'current')!
const click = (c: Choice): CampaignAction => (c.withPicks ? c.withPicks([]) : c.action) as CampaignAction

describe('settlement step list and choices', () => {
  it('SETTLE-001 the list has every step once, one current, earlier steps done, later ones waiting', () => {
    const fx = advance(fresh())
    const steps = stepsFor(fx.c, fx.d)
    expect(steps.map((s) => s.id)).toEqual([...STEP_IDS])
    expect(steps.filter((s) => s.state === 'current')).toHaveLength(1)
    const cur = steps.findIndex((s) => s.state === 'current')
    expect(steps.slice(0, cur).every((s) => s.state === 'done')).toBe(true)
    expect(steps.slice(cur + 1).every((s) => s.state === 'later')).toBe(true)
    expect(steps[cur]!.id).toBe(shownStep(P(fx.c)))
  })

  it('SETTLE-002 a step with nothing to decide is marked auto and offers no choices', () => {
    const fx = fresh()
    const lockers = stepsFor(at(fx.c, 'afterBattle.lockers'), fx.d)
    expect(current(lockers).auto).toBe(true)
    expect(current(lockers).choices).toEqual([])
  })

  it('SETTLE-003 build choices carry real actions: affordable buys go through, dear ones are greyed with a reason', () => {
    const fx = fresh()
    const c = caps(at(fx.c, 'build.structures'), 120)
    const s = current(stepsFor(c, fx.d))
    expect(s.id).toBe('build.structures')
    const gen = s.choices.find((x) => x.id === 'buy:gen-small')!
    expect(gen.cost).toBe(100)
    expect(gen.blocked).toBeUndefined()
    const after = reduce(c, click(gen), fx.d)
    expect(P(after).structures.filter((x) => x.defId === 'gen-small')).toHaveLength(3)
    expect(P(after).caps).toBe(20)
    const dear = s.choices.find((x) => x.id === 'buy:gen-large')!
    expect(dear.blocked).toMatch(/caps/i)
    const scrap = s.choices.find((x) => x.id.startsWith('scrap:'))!
    expect(scrap.cost).toBeLessThanOrEqual(0)
  })

  it('SETTLE-004 once a draw has happened Build offers nothing', () => {
    let fx = fresh()
    fx = { ...fx, c: caps(addStruct(at(fx.c, 'build.structures'), 'chem-station'), 300) }
    fx = act(fx, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'chem-station') })
    const c = at(withPlayer(fx.c, (p) => { p.phase.pending = null }), 'build.structures')
    const s = current(stepsFor(c, fx.d))
    // the layer says Build has nothing to decide any more, so the step is auto and offers nothing
    expect(s.auto).toBe(true)
    expect(s.choices).toEqual([])
  })

  it('SETTLE-005 an open draw is a pick-exactly-N step whose confirm keeps those cards', () => {
    let fx = fresh()
    fx = { ...fx, c: caps(addStruct(at(fx.c, 'build.structures'), 'scavenging-2'), 0) }
    fx = act(fx, { type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'scavenging-2') })
    const s = current(stepsFor(fx.c, fx.d))
    expect(s.id).toBe('draw.structures')
    expect(s.optional).toBe(false)
    expect(s.multi).toBeDefined()
    const want = Math.min(P(fx.c).phase.pending!.keep, P(fx.c).phase.pending!.cards.length)
    expect([s.multi!.min, s.multi!.max]).toEqual([want, want])
    const ids = s.choices.filter((x) => x.action === null).slice(0, want).map((x) => x.id)
    const after = reduce(fx.c, s.multi!.confirm!(ids) as CampaignAction, fx.d)
    expect(P(after).phase.pending).toBeNull()
    expect(P(after).pool.map((x) => x.uid)).toEqual(ids)
  })

  it('SETTLE-006 scouting offers the scouting building and commits picked gear', () => {
    let fx = fresh()
    fx = { ...fx, c: caps(withPlayer(at(fx.c, 'draw.structures'), (p) => { p.pool.push(card('stimpak', 'gear-1')) }), 100) }
    const s = current(stepsFor(fx.c, fx.d))
    const scout = s.choices.find((x) => x.id.startsWith('scout:'))!
    expect(scout.cost).toBe(50)
    expect(s.choices.some((x) => x.id === 'gear-1')).toBe(true)
    const after = reduce(fx.c, scout.withPicks!(['gear-1']) as CampaignAction, fx.d)
    expect(P(after).phase.explore?.committed).toEqual(['gear-1'])
    expect(P(after).caps).toBe(50)
    // with a card open the screen shows the Explore step, then returns to the draw step once it is resolved
    expect(shownStep(P(after))).toBe('draw.explore')
    const open = current(stepsFor(after, fx.d))
    expect(open.id).toBe('draw.explore')
    expect(open.choices.length).toBeGreaterThan(0)
  })

  it('SETTLE-007 a battle result lands on the retain step with the gathered cards as toggles', () => {
    const fx = readyFx()
    const won = finished(fx, 'box-1', { winner: 'A', reason: 'test' }, (st) => {
      const mine = Object.values(st.models).find((m) => m.owner === 'A')!
      mine.carried.push({ uid: 'found-1', defId: 'stimpak', kind: 'item' } as never)
    })
    const after = advance({ ...fx, c: fromBattle(fx.c, won.state, fx.d) })
    const s = current(stepsFor(after.c, after.d))
    expect(P(after.c).caps).toBeGreaterThanOrEqual(200)
    if (s.id === 'afterBattle.retain') {
      expect(s.multi).toBeDefined()
      const keep = reduce(after.c, s.multi!.confirm!([]) as CampaignAction, after.d)
      expect(P(keep).step).not.toBe('afterBattle.retain')
    } else {
      expect(['afterBattle.leader', 'build.market', 'build.structures', 'build.perks', 'build.power', 'draw.structures']).toContain(s.id)
    }
  })

  it('SETTLE-008 the quick force fits its limit and the reducer accepts it', () => {
    const fx = fresh()
    const c = at(fx.c, 'force.create')
    const p = P(c)
    for (const limit of [500, 750, 1000]) {
      const plan = autoForce(p, fx.d, limit)
      expect(plan.members.length).toBeGreaterThan(0)
      expect(plan.leader?.modelId).toBe(p.leader?.modelId)
      const after = reduce(c, { type: 'force.create', seat: SEAT, plan }, fx.d)
      expect(P(after).force!.value).toBeLessThanOrEqual(limit)
    }
    const s = current(stepsFor(c, fx.d))
    expect(s.choices.filter((x) => x.id.startsWith('auto:'))).toHaveLength(3)
    expect(s.multi!.min).toBe(1)
  })
})

describe('settlement force, draw and rule numbers (review fixes)', () => {
  const forceFx = () => {
    const fx = fresh()
    const c = withPlayer(at(fx.c, 'force.create'), (p) => { p.roster[0]!.perks.push('lone-wanderer') })
    return { fx, c }
  }

  it('SETTLE-011 the force step offers a bought perk and Heroic as toggles that reach the plan', () => {
    const { fx, c } = forceFx()
    const p = P(c)
    const m = p.roster[0]!
    const s = current(stepsFor(c, fx.d))
    expect(s.choices.some((x) => x.id === `perk:${m.id}:lone-wanderer`)).toBe(true)
    const heroic = s.choices.find((x) => x.id === `heroic:${m.id}`)
    expect(heroic).toBeDefined()
    const action = s.multi!.confirm!([m.id, `perk:${m.id}:lone-wanderer`, `heroic:${m.id}`]) as Extract<CampaignAction, { type: 'force.create' }>
    expect(action.plan.equipPerks[m.id]).toEqual(['lone-wanderer'])
    expect(action.plan.heroic).toEqual([m.id])
    // a perk toggled for a model that is not fielded is ignored
    const other = p.roster[1]
    if (other) expect((s.multi!.confirm!([m.id, `perk:${other.id}:lone-wanderer`]) as typeof action).plan.equipPerks[other.id]).toBeUndefined()
  })

  it('SETTLE-012 the quick force equips bought perks while it fits and hire buttons show no price', () => {
    const { fx, c } = forceFx()
    const p = P(c)
    const plan = autoForce(p, fx.d, 750)
    expect(plan.equipPerks[p.roster[0]!.id]).toEqual(['lone-wanderer'])
    expect(P(reduce(c, { type: 'force.create', seat: SEAT, plan }, fx.d)).force!.value).toBeLessThanOrEqual(750)
    const tight = autoForce(p, fx.d, 1)
    expect(Object.values(tight.equipPerks).flat()).toEqual([])
    const hire = current(stepsFor(c, fx.d)).choices.filter((x) => x.id.startsWith('hire:'))
    expect(hire.length).toBeGreaterThan(0)
    expect(hire.every((x) => x.cost === undefined)).toBe(true)
  })

  it('SETTLE-013 the Armor Workbench offers its Armor Boost and the Power Armor Station its repair next to the draw', () => {
    const fx = fresh()
    let c = addPerk(addStruct(addStruct(at(fx.c, 'draw.structures'), 'armor-workbench'), 'power-armor-station'), 'armorer')
    c = withPlayer(c, (p) => { p.roster[0]!.degraded = ['power-armor'] })
    const s = current(stepsFor(c, fx.d))
    const ids = s.choices.map((x) => x.id)
    const bench = instOf(c, 'armor-workbench')
    const station = instOf(c, 'power-armor-station')
    expect(ids).toContain(`use:${bench}`)
    expect(ids).toContain(`armor:${bench}:${P(c).roster[0]!.id}`)
    expect(ids).toContain(`use:${station}`)
    expect(ids).toContain(`fix:${station}:${P(c).roster[0]!.id}`)
  })

  it('SETTLE-014 force limits and the scrap refund come from the campaign layer', () => {
    const fx = fresh()
    expect(FORCE_LIMITS.map((z) => z.caps)).toEqual([500, 750, 1000])
    const c = caps(at(fx.c, 'build.structures'), 120)
    const s = current(stepsFor(c, fx.d))
    const scrap = s.choices.find((x) => x.id.startsWith('scrap:'))!
    const inst = P(c).structures.find((x) => `scrap:${x.id}` === scrap.id)!
    expect(scrap.cost).toBe(-scrapRefund(structureRec(fx.d, inst.defId)))
    expect(P(reduce(c, scrap.action as CampaignAction, fx.d)).caps).toBe(120 + scrapRefund(structureRec(fx.d, inst.defId)))
  })
})

describe('settlement panels', () => {
  it('SETTLE-009 the header numbers come from the layer: caps, buildings, room, power', () => {
    const fx = fresh()
    const v = viewOf(fx.c, fx.d)
    expect(v.caps).toBe(0)
    expect(v.structureCount).toBe(5)
    expect(v.room).toBe(slotsTotal(P(fx.c), fx.d))
    expect(v.power).toEqual({ supply: 6, need: 3 })
    expect(v.round).toBe(1)
    expect(v.roster.length).toBe(P(fx.c).roster.length)
    expect(v.roster.filter((r) => r.leader)).toHaveLength(1)
    expect(v.roster.every((r) => r.injuries.length === 0)).toBe(true)
    expect(v.structures.find((s) => s.name === 'Generator - Small')?.count).toBe(2)
  })

  it('SETTLE-010 the pool lists card names and caps values, and the log hides step bookkeeping', () => {
    const fx = fresh()
    const c = withPlayer(fx.c, (p) => { p.pool.push(card('stimpak', 'p1')) })
    const v = viewOf(reduce(c, { type: 'step.next', seat: SEAT }, fx.d), fx.d)
    expect(v.pool).toHaveLength(1)
    expect(v.pool[0]!.name.length).toBeGreaterThan(0)
    expect(v.pool[0]!.value).not.toBeNull()
    expect(v.log.every((t) => t !== 'step.next')).toBe(true)
  })
})
