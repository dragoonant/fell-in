import { create } from 'zustand'
import { createDemoGame } from '@/engine/setup'
import type { GameState } from '@/engine/types'

export type CameraPreset = 'overview' | 'near' | 'top' | 'far'
interface Store {
  screen: 'start' | 'game'
  game: GameState
  preset: CameraPreset
  presetTick: number
  start: (seed: string) => void
  setPreset: (p: CameraPreset) => void
  backToStart: () => void
}
export const useStore = create<Store>((set) => ({
  screen: 'start',
  game: createDemoGame(),
  preset: 'overview',
  presetTick: 0,
  start: (seed) => set({ screen: 'game', game: createDemoGame(seed) }),
  setPreset: (preset) => set((s) => ({ preset, presetTick: s.presetTick + 1 })),
  backToStart: () => set({ screen: 'start' }),
}))
