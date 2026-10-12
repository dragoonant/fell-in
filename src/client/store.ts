// Camera preset store (board view only; the game itself lives in store/gameStore.ts).
import { create } from 'zustand'

export type CameraPreset = 'overview' | 'near' | 'top' | 'far'
interface Store {
  preset: CameraPreset
  presetTick: number
  setPreset: (p: CameraPreset) => void
}
export const useStore = create<Store>((set) => ({
  preset: 'overview',
  presetTick: 0,
  setPreset: (preset) => set((s) => ({ preset, presetTick: s.presetTick + 1 })),
}))
