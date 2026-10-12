// Board-local interaction state (owner I): hover, selection, drag ghost, tools, confirm chooser. Display and intent
// only; it never holds a rules number the engine did not give us.
import { create } from 'zustand'
import type { DecisionOption, ModelId, Vec2 } from '../../engine/types'

export interface Ghost {
  /** Where the engine says the model would end. */
  pos: Vec2
  /** Start of the leg. */
  from: Vec2
  /** The clamped aim point: what a commit submits as the path. */
  asked: Vec2
  ok: boolean
  travel: number
  colourNeeded: string | null
  detail?: string
}
export interface DragState { modelId: ModelId; promptId: string; sx: number; sy: number; moved: boolean }
export interface Choice { targetId: ModelId; options: DecisionOption[] }

export interface InteractionState {
  hover: ModelId | null
  selected: ModelId | null
  ghost: Ghost | null
  drag: DragState | null
  measure: boolean
  los: boolean
  choice: Choice | null
}

export const useInteractionStore = create<InteractionState>(() => ({ hover: null, selected: null, ghost: null, drag: null, measure: false, los: false, choice: null }))
const set = useInteractionStore.setState

export const ix = {
  setHover: (hover: ModelId | null) => { if (useInteractionStore.getState().hover !== hover) set({ hover }) },
  setSelected: (selected: ModelId | null) => set({ selected }),
  setGhost: (ghost: Ghost | null) => set({ ghost }),
  startDrag: (d: DragState) => set({ drag: d }),
  dragMoved: () => set((s) => (s.drag && !s.drag.moved ? { drag: { ...s.drag, moved: true } } : {})),
  endDrag: () => { if (useInteractionStore.getState().drag) set({ drag: null }) },
  toggleMeasure: () => set((s) => ({ measure: !s.measure })),
  toggleLos: () => set((s) => ({ los: !s.los })),
  setChoice: (choice: Choice | null) => set({ choice }),
  /** Drop everything tied to one decision (a new prompt opened or it closed). */
  resetPrompt: () => set({ ghost: null, drag: null, choice: null }),
}
