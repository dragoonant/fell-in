// Launch surface for the START CHUNK (App + StartScreen). No engine or data imports here: the game screen, engine and
// data load lazily when a game starts. StartScreen imports from this file (and settingsStore), never from contract.ts.
import { create } from 'zustand'
import type { SeatController } from '../params'
import editionsFile from '../../../data/editions.json'
import { SAVE_VERSION, STORE_KEY } from '../../campaign/store'
import { readJson } from './storage'

export type { SeatController }

/** What a new game needs. Seats are in seat order (index 0 = near edge, +z). */
export interface NewGameOptions {
  /** Scenario id (data/1e/scenarios); omitted = the engine's default skirmish. */
  scenarioId?: string
  /** Controller per seat, e.g. ['human','bot'] (vs bot), ['human','human'] (hot-seat), ['bot','bot'] (watch). */
  seats?: SeatController[]
  /** Engine seed; random when omitted. */
  seed?: string
  /** Themed board for open skirmish tables: suburbs | red-rocket | junkyard (other scenarios keep their own terrain). */
  theme?: string
  /** Data edition (default from data/editions.json). */
  edition?: string
  /** Campaign battle: forces per seat id (overrides the scenario's own for that seat); the game also saves them. */
  forces?: Record<string, CampaignForce[]>
  /** Campaign hand-off for the engine: damage, degraded suits and fitted mods per model (spec 19 s7, createGame opts.campaign). */
  campaign?: { damage?: Record<string, number>; degraded?: Record<string, string[]>; mods?: Record<string, Record<string, string[]>> }
  /** True when the game was launched from the settlement (game over then offers "Back to settlement"). */
  fromCampaign?: boolean
}
/** One force line for a seat (the shape of the data layer's ScenarioForce, plus equipped Perks). */
export interface CampaignForce { unit: string; count: number; items: string[]; heroic?: boolean; leader?: string; perks?: string[] }

export type Launch =
  | { id: number; mode: 'new'; opts: NewGameOptions }
  | { id: number; mode: 'continue' }

interface LaunchStore {
  screen: 'start' | 'game'
  launch: Launch | null
  /** Start screen shows the settlement (campaign) instead of the menu. */
  campaignOpen: boolean
  /** How the settlement should open: a fresh campaign or the saved one. */
  campaignMode: 'new' | 'continue' | null
  /** Seed for a new campaign (?campaign=new&seed=...). */
  campaignSeed: string | null
  /** Faction a new campaign starts as (null = the first one the data offers). */
  campaignFaction: string | null
  /** The running game was launched from the settlement. */
  inCampaignBattle: boolean
}

export const useLaunchStore = create<LaunchStore>(() => ({
  screen: 'start', launch: null, campaignOpen: false, campaignMode: null, campaignSeed: null, campaignFaction: null, inCampaignBattle: false,
}))

let launchSeq = 0
/** Start a new game: switches to the (lazy) game screen, which creates the game. */
export function launchGame(opts: NewGameOptions = {}): void {
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'new', opts }, inCampaignBattle: !!opts.fromCampaign })
}
/** Resume the autosave (check hasAutosave() first). */
export function continueGame(): void {
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'continue' }, inCampaignBattle: false })
}
/** Back to the start screen (the game stays in memory; Continue resumes from the autosave). */
export function backToMenu(): void {
  useLaunchStore.setState({ screen: 'start', campaignOpen: false, campaignMode: null })
}

// ---------- campaign (spec 19 s7; the screen lives in ui/settlement/, lazy) ----------
/** The campaign save key (one definition, in src/campaign/store.ts). */
export const CAMPAIGN_KEY = STORE_KEY
/** Open the settlement: a new campaign (replaces the save after a confirm in the screen) or the saved one. */
export function openCampaign(mode: 'new' | 'continue', seed?: string | null, faction?: string | null): void {
  useLaunchStore.setState({ screen: 'start', campaignOpen: true, campaignMode: mode, campaignSeed: seed ?? null, campaignFaction: faction ?? null })
}
/** Leave the settlement for the start menu (the campaign stays saved). */
export function closeCampaign(): void {
  useLaunchStore.setState({ campaignOpen: false, campaignMode: null, campaignSeed: null })
}
/** After a campaign battle: show the settlement again (the screen applies the result first). */
export function backToSettlement(): void {
  useLaunchStore.setState({ screen: 'start', campaignOpen: true, campaignMode: 'continue', inCampaignBattle: false })
}

/** Factions a campaign can start as: those with units in the data (loads the data chunk on demand). */
export async function loadCampaignFactions(): Promise<{ id: string; name: string }[]> {
  const data = await import('../../data/index')
  const used = new Set(data.all('units').map((u) => u.faction).filter((f): f is string => !!f))
  return data.all('factions').filter((f) => used.has(f.id)).map((f) => ({ id: f.id, name: f.name }))
}

/** Summary of the saved campaign, readable without the campaign layer. */
export interface CampaignSummary { name: string; round: number; caps: number }
export function readCampaignSummary(): CampaignSummary | null {
  const d = readJson<{ version?: number; edition?: string; name?: string; round?: number; players?: { caps?: number }[] }>(CAMPAIGN_KEY)
  if (!d || typeof d !== 'object' || !Array.isArray(d.players)) return null
  // A save the campaign store would refuse (another version or edition) is not offered as "Continue campaign".
  if (d.version !== SAVE_VERSION || d.edition !== editionsFile.default) return null
  return { name: d.name ?? 'Settlement', round: d.round ?? 1, caps: d.players[0]?.caps ?? 0 }
}
export const hasCampaignSave = (): boolean => readCampaignSummary() !== null

export const AUTOSAVE_KEY = 'fell-in.save.auto'

/** Summary of the autosave, readable without the engine. */
export interface AutosaveSummary { savedAt: string; round: number; scenarioId: string | null; seats: SeatController[]; seed: string }

export function readAutosaveSummary(): AutosaveSummary | null {
  const d = readJson<{ kind?: string; savedAt?: string; round?: number; scenarioId?: string | null; seats?: SeatController[]; seed?: string }>(AUTOSAVE_KEY)
  if (!d || d.kind !== 'fell-in-save') return null
  return { savedAt: d.savedAt ?? '', round: d.round ?? 0, scenarioId: d.scenarioId ?? null, seats: d.seats ?? [], seed: d.seed ?? '' }
}
export const hasAutosave = (): boolean => readAutosaveSummary() !== null

/** Scenario choices for the start screen (loads the data chunk on demand). */
export interface BriefingInfo { story: string; goals: Record<string, string>; howToWin: string[]; tips: string[] }
export interface ScenarioChoice { id: string; name: string; mode: string; rounds: number | null; sides: number; /** Side ids in seat order. */ sideIds?: string[]; /** The AI-controlled side, if any. */ aiSideId?: string; briefing?: BriefingInfo | null }
export async function loadScenarioChoices(): Promise<ScenarioChoice[]> {
  const data = await import('../../data/index')
  return data.all('scenarios').map((s) => ({
    id: s.id, name: s.name, mode: s.mode, rounds: s.rounds, sides: s.sides.length, sideIds: s.sides.map((x) => x.id), ...(s.sides.find((x) => x.ai) ? { aiSideId: s.sides.find((x) => x.ai)!.id } : {}),
    briefing: (s as { briefing?: BriefingInfo }).briefing ?? null,
  }))
}
