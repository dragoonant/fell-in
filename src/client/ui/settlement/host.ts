// What the settlement needs from the start screen's side of the app (launching a game, the saved-campaign summary, the URL hook).
// The start screen hands these over as a prop, so the settlement chunk never imports the launch store or params itself: both
// live in the main chunk, and a lazy chunk that imports them statically makes the bundler cut them out into a shared chunk that
// the react chunk then loops back through (a production-only "t is not a function" at boot).
import type { NewGameOptions, ScenarioChoice } from '../../store/launch'

export interface SettlementHost {
  launchGame(opts: NewGameOptions): void
  loadScenarioChoices(): Promise<ScenarioChoice[]>
  loadCampaignFactions(): Promise<{ id: string; name: string }[]>
  hasCampaignSave(): boolean
  /** How the settlement was asked to open (the start screen button, ?campaign=, or "Back to settlement"). */
  openRequest(): { mode: 'new' | 'continue' | null; seed: string | null; faction: string | null }
  /** ?test=1 (window.__campaign, no replace prompt). */
  testMode(): boolean
  /** Table themes for open skirmish tables (the start screen's picker), the scenarios they can dress, and the theme last picked there. */
  themes: readonly { id: string; label: string }[]
  themeable(scenarioId: string): boolean
  startTheme(): string | null
  readJson<T>(key: string): T | null
  writeJson(key: string, value: unknown): boolean
  removeKey(key: string): void
}

let current: SettlementHost | null = null
export function setHost(h: SettlementHost): void { current = h }
export function host(): SettlementHost {
  if (!current) throw new Error('The settlement was opened without its start screen.')
  return current
}
