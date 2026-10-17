// The one place the settlement screen runs the campaign layer (spec 19 s7). Loaded lazily, so the start screen never pays for the
// campaign rules, the reducer or the campaign data. Everything here is glue: the layer does every rule and every random draw.
import type { GameState } from '../../../engine/types'
import * as battle from '../../../campaign/battle'
import * as defaults from '../../../campaign/defaults'
import { questRec } from '../../../campaign/data'
import * as reducer from '../../../campaign/reducer'
import { DEFAULT_FORCE_LIMIT, scenarioForceValue } from '../../../campaign/rules'
import * as sequence from '../../../campaign/sequence'
import * as store from '../../../campaign/store'
import type { Campaign, CampaignAction } from '../../../campaign/types'
import { autoForce, shownStep, stepsFor } from './choices'
import { nameFromId } from './stepCopy'
import { viewOf } from './campaignView'
import { launchOptions } from './battleLaunch'
import type { CampaignApi, CampaignDoc } from './model'

let cached: Promise<CampaignApi> | null = null
export function loadCampaignApi(): Promise<CampaignApi> {
  if (!cached) cached = build().catch((e) => { cached = null; throw e })
  return cached
}

/** The first player's seat (a solo campaign has one; the screen plays that seat). */
const seatOf = (c: Campaign): string => c.players[0]?.seat ?? 'A'

// Static imports: this whole file is its own lazy chunk, loaded by campaignStore on first use.
async function build(): Promise<CampaignApi> {
  const data = defaults.defaultCampaignData()
  const stepOf = (c: Campaign): string => c.players[0]?.step ?? ''
  /** Run the steps that have nothing to decide, up to the first one the player must act on. */
  const settle = (c: Campaign): Campaign => sequence.autoAdvance(c, seatOf(c), data)

  const api: CampaignApi = {
    create: ({ seed, faction, name }) => {
      const fac = faction ?? data.units.find((u) => u.faction)?.faction ?? ''
      const c = reducer.newCampaign({ seed, ...(name ? { name } : {}), createdAt: Date.now(), players: [{ seat: 'A', faction: fac }] }, data)
      return settle(c)
    },
    load: () => {
      const r = store.loadCampaign(data.edition)
      return r.ok && r.campaign.players.length ? r.campaign : null
    },
    save: (c) => { store.saveCampaign(c) },
    view: (c) => viewOf(c, data),
    steps: (c) => stepsFor(c, data),
    reduce: (c, action) => {
      const a = action as CampaignAction
      const next = reducer.reduce(c, a, data)
      // Closing a step, or an action that moved the campaign to another step, lets the empty steps after it run.
      return a.type === 'step.next' || stepOf(next) !== stepOf(c) ? settle(next) : next
    },
    startBattle: (c, pick) => {
      let cur = c
      const p = cur.players[0]
      // No force yet: take a regular one (the player can still pick their own; this only stops "To battle" from failing).
      if (p && !p.force) cur = reducer.reduce(cur, { type: 'force.create', seat: p.seat, plan: autoForce(p, data, DEFAULT_FORCE_LIMIT) }, data)
      const { campaign, setup } = battle.beginBattle(cur, pick.scenarioId, data, { opponent: pick.opponent, ...(pick.seed ? { seed: pick.seed } : {}) })
      // The other side's force value (CH p19, the 1,000-caps bonus) is worked out now from the scenario's own force and kept on the
      // battle record, so a reload mid-battle still pays it out.
      const sc = data.scenarios.find((x) => x.id === pick.scenarioId)
      const oppSide = pick.opponent === 'official' ? sc?.sides.find((x) => x.ai) ?? sc?.sides[1] : sc?.sides[1]
      const withOpp: Campaign = campaign.players.length === 1 && oppSide && campaign.current
        ? { ...campaign, current: { ...campaign.current, opponentForceValue: scenarioForceValue(data, oppSide.forces) } } : campaign
      return { campaign: withOpp, options: launchOptions({ seed: setup.seed, scenarioId: setup.scenarioId, forces: setup.forces as never, campaign: setup.campaign }, pick) }
    },
    fromBattle: (c, finalState, o) => {
      const p = c.players[0]
      // The engine does not model Quests: the player says on the game-over screen whether the chosen card was done.
      const questsCompleted = o?.questCompleted && p?.quest ? { [p.seat]: { cardId: p.quest } } : undefined
      // RULING: the Event Deck is not run by the engine yet, so no eventDeck goes back and Consequences stay with their owners.
      return settle(battle.fromBattle(c, finalState as GameState, data, {
        ...(c.current?.opponentForceValue !== undefined ? { opponentForceValue: c.current.opponentForceValue } : {}),
        ...(questsCompleted ? { questsCompleted } : {}),
      }))
    },
    pendingQuest: (c) => {
      const id = c.players[0]?.quest
      return id ? { cardId: id, name: questRec(data, id)?.name ?? nameFromId(id) } : null
    },
  }
  return api
}

/** The step id the screen shows as current (exported for the test hook and tests). */
export function currentStepId(c: CampaignDoc): string { return c.players[0] ? shownStep(c.players[0]) : '' }
