// Settlement client wiring that does not need the campaign layer: launch store, ?campaign hook, battle launch options,
// step copy and the campaign forces reaching the engine.
import { beforeEach, describe, expect, it } from 'vitest'
import { readParams } from '../../src/client/params'
import { exportSave, importSave, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { backToSettlement, CAMPAIGN_KEY, closeCampaign, launchGame, openCampaign, readCampaignSummary, useLaunchStore } from '../../src/client/store/launch'
import { removeKey, writeJson } from '../../src/client/store/storage'
import { loadCampaignApi } from '../../src/client/ui/settlement/adapter'
import { launchOptions, opponentProblem, seatIdsFor, seatsFor } from '../../src/client/ui/settlement/battleLaunch'
import { capsText, groupBy, nameFromId, STEP_COPY, stepCopy } from '../../src/client/ui/settlement/stepCopy'
import { STEP_IDS } from '../../src/campaign/types'

beforeEach(() => {
  resetGameStore()
  useLaunchStore.setState({ screen: 'start', launch: null, campaignOpen: false, campaignMode: null, campaignSeed: null, inCampaignBattle: false })
})

describe('settlement client wiring', () => {
  it('CAMP-UI-001 ?campaign opens the settlement instead of autostarting a game', () => {
    expect(readParams('?campaign=1').campaign).toBe('new')
    expect(readParams('?campaign=new&seed=x').campaign).toBe('new')
    expect(readParams('?campaign=continue').campaign).toBe('continue')
    expect(readParams('?campaign=0').campaign).toBeNull()
    expect(readParams('?test=1&campaign=1').autostart).toBe(false)
    expect(readParams('?test=1').autostart).toBe(true)
    expect(readParams('').campaign).toBeNull()
  })

  it('CAMP-UI-002 the launch store switches between menu, settlement and a campaign battle', () => {
    openCampaign('new', 'seed-a')
    let s = useLaunchStore.getState()
    expect([s.screen, s.campaignOpen, s.campaignMode, s.campaignSeed]).toEqual(['start', true, 'new', 'seed-a'])
    closeCampaign()
    expect(useLaunchStore.getState().campaignOpen).toBe(false)
    launchGame({ scenarioId: 'box-1', fromCampaign: true })
    s = useLaunchStore.getState()
    expect([s.screen, s.inCampaignBattle]).toEqual(['game', true])
    backToSettlement()
    s = useLaunchStore.getState()
    expect([s.screen, s.campaignOpen, s.campaignMode, s.inCampaignBattle]).toEqual(['start', true, 'continue', false])
    launchGame({ scenarioId: 'box-1' })
    expect(useLaunchStore.getState().inCampaignBattle).toBe(false)
  })

  it('CAMP-UI-003 the player always takes the first seat; the layer forces and hand-off ride along', () => {
    expect(seatsFor('bot')).toEqual(['human', 'bot'])
    expect(seatsFor('human')).toEqual(['human', 'human'])
    expect(seatsFor('official')).toEqual(['human', 'official'])
    expect(seatIdsFor(['human', 'official'])).toEqual(['A', 'ai'])
    const forces = { A: [{ unit: 'knight', count: 1, items: ['laser-rifle'] }] }
    const campaign = { damage: { 'a-knight-1': 2 } }
    const o = launchOptions({ seed: 'abc', scenarioId: 'ai-rr', forces, campaign }, { scenarioId: 'box-1', opponent: 'official', seed: '' })
    expect(o).toMatchObject({ scenarioId: 'ai-rr', seats: ['human', 'official'], seed: 'abc', fromCampaign: true, campaign })
    expect(o.forces).toEqual(forces)
    // no force lines: the scenario's own force is left alone
    expect(launchOptions({ seed: 's' }, { scenarioId: 'box-1', opponent: 'bot', seed: '' }).forces).toBeUndefined()
  })

  it('CAMP-UI-004 an opponent that cannot play the scenario is explained', () => {
    expect(opponentProblem('official', { sides: 2 })).toMatch(/Wasteland AI/)
    expect(opponentProblem('official', { sides: 2, aiSideId: 'ai' })).toBeNull()
    expect(opponentProblem('bot', { sides: 1 })).toMatch(/tutorial/)
    expect(opponentProblem('bot', { sides: 2 })).toBeNull()
    expect(opponentProblem('bot', undefined)).toBeNull()
  })

  it('CAMP-UI-005 campaign forces reach the engine: seat A fields the campaign roster, the other side keeps its own', () => {
    const forces = { A: [{ unit: 'knight', count: 2, items: ['laser-rifle'] }] }
    expect(newGame({ seed: 'camp-forces', scenarioId: 'box-1', seats: ['human', 'bot'], forces, fromCampaign: true })).toBeNull()
    const st = useGameStore.getState().state!
    const mine = Object.values(st.models).filter((m) => m.owner === 'A')
    const theirs = Object.values(st.models).filter((m) => m.owner === 'B')
    expect(mine).toHaveLength(2)
    expect(mine.every((m) => m.profileId === 'knight')).toBe(true)
    expect(theirs.length).toBeGreaterThan(0)
  })

  it('CAMP-UI-006 every step of the sequence has plain copy of our own', () => {
    for (const id of STEP_IDS) {
      const c = stepCopy(id)
      expect(STEP_COPY[id], id).toBeDefined()
      expect(c.title.length).toBeGreaterThan(2)
      expect(c.blurb.length).toBeGreaterThan(10)
    }
    expect(stepCopy('mystery.step', { title: 'odd job' }).title).toBe('Odd job')
    expect(stepCopy('build.market').part).toBe('Build')
  })

  it('CAMP-UI-007 small text helpers', () => {
    expect(capsText(0)).toBe('free')
    expect(capsText(1)).toBe('1 cap')
    expect(capsText(150)).toBe('150 caps')
    expect(capsText(-30)).toBe('+30 caps')
    expect(nameFromId('gun_nut-rifle')).toBe('Gun nut rifle')
    expect(groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'))).toEqual([{ key: 'odd', items: [1, 3] }, { key: 'even', items: [2, 4] }])
  })

  it('CAMP-UI-008 a campaign battle resumed from a save still ends with Back to settlement', () => {
    const forces = { A: [{ unit: 'knight', count: 1, items: ['laser-rifle'] }] }
    expect(newGame({ seed: 'resume-1', scenarioId: 'box-1', seats: ['human', 'bot'], forces, fromCampaign: true })).toBeNull()
    const save = exportSave()!
    expect(save.fromCampaign).toBe(true)
    // the page reloaded: a fresh store, then Continue
    resetGameStore()
    useLaunchStore.setState({ inCampaignBattle: false })
    expect(importSave(JSON.parse(JSON.stringify(save)))).toBeNull()
    expect(useLaunchStore.getState().inCampaignBattle).toBe(true)
    // a normal game saved and resumed stays a normal game
    expect(newGame({ seed: 'resume-2', scenarioId: 'box-1', seats: ['human', 'bot'] })).toBeNull()
    const plain = exportSave()!
    expect(plain.fromCampaign).toBeUndefined()
    useLaunchStore.setState({ inCampaignBattle: true })
    expect(importSave(JSON.parse(JSON.stringify(plain)))).toBeNull()
    expect(useLaunchStore.getState().inCampaignBattle).toBe(false)
  })

  it('CAMP-UI-009 Continue campaign is offered only for a save the campaign store would load', () => {
    try {
      writeJson(CAMPAIGN_KEY, { version: 1, edition: '1e', name: 'Sanctuary', round: 3, players: [{ caps: 40 }] })
      expect(readCampaignSummary()).toEqual({ name: 'Sanctuary', round: 3, caps: 40 })
      writeJson(CAMPAIGN_KEY, { version: 2, edition: '1e', name: 'Sanctuary', round: 3, players: [{ caps: 40 }] })
      expect(readCampaignSummary()).toBeNull()
      writeJson(CAMPAIGN_KEY, { version: 1, edition: '2e', name: 'Sanctuary', round: 3, players: [{ caps: 40 }] })
      expect(readCampaignSummary()).toBeNull()
      writeJson(CAMPAIGN_KEY, { name: 'old', players: [] })
      expect(readCampaignSummary()).toBeNull()
    } finally { removeKey(CAMPAIGN_KEY) }
  })

  it('CAMP-UI-010 starting a battle stores the other side force value so the 1,000-caps bonus can pay out', async () => {
    const api = await loadCampaignApi()
    const c = api.create({ seed: 'opp-1' })
    c.players[0]!.step = 'force.create'
    const r = api.startBattle(c, { scenarioId: 'box-1', opponent: 'bot', seed: 'opp-seed' })
    expect(r.campaign.current?.opponentForceValue).toBeGreaterThan(0)
    expect(r.options.fromCampaign).toBe(true)
  })
})

