// Full-round replay with a fixed seed, determinism, the save size and speed budgets, the real-data smoke test and the RULING log.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromBattle, toBattle } from '../../src/campaign/battle'
import { campaignData } from '../../src/campaign/data'
import { defaultCampaignData } from '../../src/campaign/defaults'
import { actionsFromLog, capsAward, newCampaign, reduce, replay } from '../../src/campaign/reducer'
import { CAMPAIGN_RULINGS } from '../../src/campaign/rulings'
import { autoAdvance, describeStep } from '../../src/campaign/sequence'
import { MAX_SAVE_BYTES, clearCampaign, compactLog, loadCampaign, saveCampaign } from '../../src/campaign/store'
import type { Campaign, CampaignAction } from '../../src/campaign/types'
import { createGame } from '../../src/engine/setup'
import { loadBundle } from '../engine/helpers'
import { SEAT, P, bundleFor, finished, fresh, instOf, makeData, modelOf, planAll, readyFx, withPlayer, type Fx } from './fixtures'

/** One scripted round: a first battle won, then a settlement phase using several Structures, then a new force. */
function playRound(seed: string): { checkpoint: Campaign; final: Campaign; fx: Fx } {
  let fx = fresh({}, seed)
  fx = { ...fx, c: withPlayer(fx.c, (p) => { p.step = 'force.create' }) }
  fx = { ...fx, c: reduce(fx.c, planAll(fx.c), fx.d) }
  const { state } = finished(fx, 'box-1', { winner: 'A', level: 'major', reason: 'scripted' })
  fx = { ...fx, c: fromBattle(fx.c, state, fx.d) }
  fx = { ...fx, c: autoAdvance(fx.c, SEAT, fx.d) }
  const checkpoint = fx.c
  const go = (a: CampaignAction) => { fx = { ...fx, c: reduce(fx.c, a, fx.d) } }
  expect(P(fx.c).caps).toBe(200)
  go({ type: 'build.structures', seat: SEAT, op: 'buy', defId: 'chem-station' })
  go({ type: 'build.structures', seat: SEAT, op: 'buy', defId: 'scavenging-1' })
  go({ type: 'build.power', seat: SEAT, dark: [] })
  go({ type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'chem-station') })
  go({ type: 'draw.keep', seat: SEAT, keep: [P(fx.c).phase.pending!.cards[0]!.uid] })
  go({ type: 'draw.use', seat: SEAT, structureId: instOf(fx.c, 'scavenging-1') })
  go({ type: 'draw.keep', seat: SEAT, keep: [P(fx.c).phase.pending!.cards[1]!.uid] })
  go({ type: 'select.stores', seat: SEAT, take: [P(fx.c).pool[0]!.uid] })
  go({ type: 'select.lockers', seat: SEAT, park: [] })
  go({ type: 'select.sell', seat: SEAT })
  go(planAll(fx.c))
  go({ type: 'force.quest', seat: SEAT, questId: 'lost-journal' })
  return { checkpoint, final: fx.c, fx }
}

describe('a full round with a fixed seed', () => {
  it('CAMP-008 the same seed and choices reproduce the whole round exactly, and the log replays it', () => {
    const a = playRound('fixed-seed'), b = playRound('fixed-seed')
    expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final))
    expect(JSON.stringify(playRound('other-seed').final)).not.toBe(JSON.stringify(a.final))
    const tail = actionsFromLog({ ...a.final, log: a.final.log.slice(a.checkpoint.log.length) })
    expect(tail.length).toBe(12)
    expect(JSON.stringify(replay(a.checkpoint, tail, a.fx.d))).toBe(JSON.stringify(a.final))
    // and the result plays: the new force becomes a real game
    const setup = toBattle(a.final, 'box-1', a.fx.d, { opponent: 'bot' })
    const game = createGame(bundleFor(a.fx.d), setup)
    expect(game.pending.kind).toBe('turn.start')
    expect(Object.values(game.models).filter((m) => m.owner === SEAT).length).toBe(P(a.final).force!.members.length)
    expect(Object.values(game.models).find((m) => m.leaderId)?.profileId).toBeDefined()
  })

  /** A force created, a Quest in play, an owed Consequence, then a linked scenario won: the state just before fromBattle. */
  function beforeBattle(): { fx: Fx; pre: Campaign; after: Campaign } {
    let fx = readyFx()
    fx = { ...fx, c: withPlayer(fx.c, (p) => { p.quest = 'lost-journal'; p.consequences = ['raiders'] }) }
    const pre = fx.c
    const { setup, state } = finished(fx, 'farm', { winner: 'A', level: 'major', reason: 'test' })
    return { fx, pre, after: fromBattle(pre, state, fx.d, { eventDeck: setup.extras.eventDeck }) }
  }

  it('CAMP-008 fromBattle is a run of logged actions, so the log replays the campaign across a battle', () => {
    const { fx, pre, after } = beforeBattle()
    const tail = actionsFromLog({ ...after, log: after.log.slice(pre.log.length) })
    expect(tail.map((a) => a.type)).toEqual(['afterBattle.caps', 'afterBattle.strip', 'afterBattle.result'])
    expect(JSON.stringify(replay(pre, tail, fx.d))).toBe(JSON.stringify(after))
    expect(P(after).quests[0]).toMatchObject({ title: 'lost-journal', failed: ['lost-journal'] }) // an unfinished Quest, recorded through the log
    expect(P(after).linked.length).toBe(2)
    expect(P(after).lastForceValue).toBe(P(pre).force!.value)
    expect(after.round).toBe(pre.round + 1)
    // and on through the next settlement phase
    const settled = autoAdvance(after, SEAT, fx.d)
    const more = actionsFromLog({ ...settled, log: settled.log.slice(pre.log.length) })
    expect(JSON.stringify(replay(pre, more, fx.d))).toBe(JSON.stringify(settled))
  })

  it('CAMP-008 a campaign saved after the log was compacted still replays', () => {
    const { fx, pre, after } = beforeBattle()
    const fillers = Array.from({ length: 150 }, (_, i) => ({ round: 1, seat: SEAT, type: 'filler', text: `old line ${i} ${'x'.repeat(600)}`, data: { pad: 'y'.repeat(600) } }))
    const big: Campaign = { ...after, log: [...fillers, ...after.log.map((e) => ({ ...e, data: { ...e.data, pad: 'z'.repeat(300) } }))] }
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_SAVE_BYTES)
    expect(saveCampaign(big)).toBe(true)
    const loaded = loadCampaign()
    clearCampaign()
    if (!loaded.ok) throw new Error(loaded.message)
    expect(loaded.campaign.log[0]!.data).toBeUndefined() // old payloads were dropped
    expect(loaded.campaign.log[0]!.text.length).toBeLessThan(200)
    expect(actionsFromLog(loaded.campaign)).toEqual(actionsFromLog(big)) // ... but never the actions
    const tail = actionsFromLog({ ...loaded.campaign, log: loaded.campaign.log.slice(fillers.length + pre.log.length) })
    expect(JSON.stringify(replay(pre, tail, fx.d))).toBe(JSON.stringify(after))
    // compaction keeps the last entries whole and the old ones' actions
    const small = compactLog(after, 1)
    expect(actionsFromLog(small)).toEqual(actionsFromLog(after))
  })

  it('a settlement phase with every Structure used stays under 50 ms and the save under 64 KB', () => {
    let fx = fresh({}, 'perf')
    let c = withPlayer(fx.c, (p) => {
      p.caps = 5000; p.step = 'draw.structures'; p.phase.drawn = false
      p.perks = ['gun-nut-rifle', 'armorer']
      for (const d of ['gen-large', 'gen-large', 'chem-station', 'scavenging-2', 'weapons-1', 'armor-1', 'aid-0', 'drink-1', 'bugle-1', 'practiced-0']) p.structures.push({ id: `p-${d}-${p.structures.length}`, defId: d })
    })
    fx = { ...fx, c }
    const t0 = performance.now()
    for (const s of [...P(fx.c).structures]) {
      const op = String(fx.d.structures.find((r) => r.id === s.defId)!.effect.op)
      if (op !== 'draw') continue
      c = reduce(c, { type: 'draw.use', seat: SEAT, structureId: s.id }, fx.d)
      const pend = P(c).phase.pending!
      c = reduce(c, { type: 'draw.keep', seat: SEAT, keep: pend.cards.slice(0, Math.min(pend.keep, pend.cards.length)).map((x) => x.uid) }, fx.d)
    }
    expect(performance.now() - t0).toBeLessThan(50)
    expect(JSON.stringify(compactLog(c)).length).toBeLessThan(MAX_SAVE_BYTES)
  })

  it('the UI view lists the legal choices for a step and walks the sequence generically', () => {
    const fx = fresh()
    const view = describeStep(fx.c, SEAT, fx.d)
    expect(view.step.id).toBe('build.market')
    const after = autoAdvance(fx.c, SEAT, fx.d)
    const force = describeStep(after, SEAT, fx.d)
    expect(force.step.id).toBe('force.create')
    expect(force.decision).toBe(true)
    expect(force.options.length).toBe(P(after).roster.length)
  })
})

describe('data and rulings', () => {
  const real = defaultCampaignData()
  const hasCampaignData = real.structures.length > 0

  it('the shipped bundle loads through campaignData (campaign kinds may still be empty before the data stage lands)', () => {
    const d = campaignData(loadBundle())
    expect(d.units.length).toBeGreaterThan(5)
    expect(d.dieFaces).toHaveLength(20)
    expect(Array.isArray(d.structures)).toBe(true)
  })

  it.skipIf(!hasCampaignData)('a new campaign from the shipped data starts with the CH settlement and plays a round of the sequence', () => {
    const c = newCampaign({ seed: 'real', players: [{ seat: SEAT, faction: 'survivors' }] }, real)
    expect(P(c).structures.length).toBeGreaterThanOrEqual(5)
    expect(autoAdvance(c, SEAT, real).players[0]!.step).toBeDefined()
    expect(modelOf(c, 'settler')).toBeDefined()
  })

  it.skipIf(!hasCampaignData)('the shipped data: starting settlement, side-specific caps awards and a no-bonus tutorial', () => {
    const c = newCampaign({ seed: 'real', players: [{ seat: SEAT, faction: 'survivors' }] }, real)
    const count = (id: string) => P(c).structures.filter((x) => x.defId === id).length
    expect([count('generator-small'), count('stores'), count('maintenance-shed'), count('listening-post')]).toEqual([2, 1, 1, 1])
    expect(capsAward(real, { outcome: 'win', scenarioId: 'box-1', side: 'scavengers' })).toBe(300)
    expect(capsAward(real, { outcome: 'win', scenarioId: 'box-1', side: 'brotherhood' })).toBe(200)
    expect(capsAward(real, { outcome: 'lose', scenarioId: 'box-1', side: 'brotherhood' })).toBe(120)
    expect(capsAward(real, { outcome: 'win', scenarioId: 'box-4', level: 'minor' })).toBe(150)
    expect(capsAward(real, { outcome: 'win', scenarioId: 'ga-1', bigForce: true })).toBe(0) // tutorials pay nothing, bonus included
    expect(capsAward(real, { outcome: 'draw', scenarioId: 'not-a-record' })).toBe(200)
  })

  it.skipIf(!hasCampaignData)('the shipped data: every working draw Structure can be used and kept without an error', () => {
    let c = newCampaign({ seed: 'real-phase', players: [{ seat: SEAT, faction: 'survivors' }] }, real)
    c = withPlayer(c, (p) => {
      p.caps = 20000; p.step = 'draw.structures'; p.perks = ['gun-nut-rifle', 'armorer', 'robotics-expert', 'creature-trainer', 'local-leader', 'local-leader-ii']
      for (let i = 0; i < 6; i++) p.structures.push({ id: `g${i}`, defId: 'generator-large' })
      for (const r of real.structures) if (r.effect.op === 'draw' && r.group !== 'infrastructure') p.structures.push({ id: `s-${r.id}`, defId: r.id })
    })
    let used = 0
    for (const s of [...P(c).structures]) {
      if (real.structures.find((r) => r.id === s.defId)?.effect.op !== 'draw') continue
      c = reduce(c, { type: 'draw.use', seat: SEAT, structureId: s.id }, real)
      const pend = P(c).phase.pending!
      c = reduce(c, { type: 'draw.keep', seat: SEAT, keep: pend.cards.slice(0, Math.min(pend.keep, pend.cards.length)).map((x) => x.uid) }, real)
      used++
    }
    expect(used).toBeGreaterThan(30)
    const uids = P(c).pool.map((x) => x.uid)
    expect(new Set(uids).size).toBe(uids.length)
    expect(P(c).caps).toBe(20000)
    // the Armor Workbench draws the Dissipating armor mod through the Armorer Perk's modFits
    expect(P(c).pool.some((x) => x.defId === 'dissipating')).toBe(true)
  })

  it('every RULING this layer relies on is in docs/needs-rules-check.md', () => {
    const doc = readFileSync(resolve(__dirname, '..', '..', 'docs', 'needs-rules-check.md'), 'utf8')
    for (const line of CAMPAIGN_RULINGS) expect(doc).toContain(line)
  })

  it('the campaign layer does not name the owner or a home path', () => {
    const files = ['types', 'data', 'reducer', 'battle', 'sequence', 'store', 'hooks', 'rules', 'events', 'boosts', 'decks', 'rand', 'rulings']
    for (const f of files) {
      const text = readFileSync(resolve(__dirname, '..', '..', 'src', 'campaign', `${f}.ts`), 'utf8')
      expect(text).not.toMatch(/C:\\Users|\/Users\//)
    }
  })

  it('makeData fixtures keep the real units, so a campaign built on them is not empty', () => {
    expect(makeData().units.some((u) => u.id === 'sole-survivor')).toBe(true)
  })
})
