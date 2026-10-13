// HUD-local view state (owner U): rails, the inspected unit, the chosen target. Never game state.
import { create } from 'zustand'

interface UiState {
  leftOpen: boolean
  rightOpen: boolean
  inspected: string | null
  briefingOpen: boolean
  /** Target row picked for one decision (reset when the decision id changes). */
  pick: { decisionId: string; optionId: string } | null
  setBriefing: (open: boolean) => void
  toggleLeft: () => void
  toggleRight: () => void
  inspect: (id: string | null) => void
  setPick: (decisionId: string, optionId: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  leftOpen: true,
  rightOpen: true,
  inspected: null,
  briefingOpen: false,
  pick: null,
  setBriefing: (briefingOpen) => set({ briefingOpen }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  inspect: (inspected) => set({ inspected }),
  setPick: (decisionId, optionId) => set({ pick: { decisionId, optionId } }),
}))

/** The picked option id for a decision, or the first option when none (or a stale one) is picked. */
export function pickedOption(pick: UiState['pick'], decisionId: string, optionIds: readonly string[]): string | null {
  if (pick && pick.decisionId === decisionId && optionIds.includes(pick.optionId)) return pick.optionId
  return optionIds[0] ?? null
}
