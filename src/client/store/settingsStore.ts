// Player settings (persisted). Light: no engine imports, safe for the start screen.
import { create } from 'zustand'
import { readJson, writeJson } from './storage'

export interface Settings {
  /** Animation speed multiplier: 0 instant, 0.5 slow, 1 normal, 3 fast. */
  speed: number
  /** Narration lines in the feed. */
  narration: boolean
}

export const SPEED_PRESETS: readonly { id: string; label: string; speed: number }[] = [
  { id: 'slow', label: 'Slow', speed: 0.5 },
  { id: 'normal', label: 'Normal', speed: 1 },
  { id: 'fast', label: 'Fast', speed: 3 },
  { id: 'instant', label: 'Instant', speed: 0 },
]

const KEY = 'fell-in.settings'
const DEFAULTS: Settings = { speed: 1, narration: true }

interface SettingsStore extends Settings { set(patch: Partial<Settings>, persist?: boolean): void }

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  ...(readJson<Partial<Settings>>(KEY) ?? {}),
  set(patch, persist = true) {
    set(patch)
    if (persist) { const { speed, narration } = get(); writeJson(KEY, { speed, narration }) }
  },
}))

export const getSettings = (): Settings => useSettingsStore.getState()

/** A base duration scaled by speed (0 = instant). */
export function scaled(baseMs: number, speed = getSettings().speed): number {
  if (!(speed > 0)) return 0
  return Math.round(baseMs / speed)
}
