// Launch surface for the START CHUNK (App + StartScreen). No engine or data imports here: the game screen, engine and
// data load lazily when a game starts. StartScreen imports from this file (and settingsStore), never from contract.ts.
import { create } from 'zustand'
import type { SeatController } from '../params'
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
}

export type Launch =
  | { id: number; mode: 'new'; opts: NewGameOptions }
  | { id: number; mode: 'continue' }

interface LaunchStore {
  screen: 'start' | 'game'
  launch: Launch | null
}

export const useLaunchStore = create<LaunchStore>(() => ({ screen: 'start', launch: null }))

let launchSeq = 0
/** Start a new game: switches to the (lazy) game screen, which creates the game. */
export function launchGame(opts: NewGameOptions = {}): void {
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'new', opts } })
}
/** Resume the autosave (check hasAutosave() first). */
export function continueGame(): void {
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'continue' } })
}
/** Back to the start screen (the game stays in memory; Continue resumes from the autosave). */
export function backToMenu(): void {
  useLaunchStore.setState({ screen: 'start' })
}

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
