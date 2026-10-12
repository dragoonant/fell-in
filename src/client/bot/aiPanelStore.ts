// Holds what the official AI last decided so the AI card panel can show it (fed by officialBrain, read by AiCardPanel).
import { create } from 'zustand'
import type { AiTrace } from '../../ai/official/types'
import { applyTrace, emptyPanel, type PanelState } from './officialView'

interface PanelStore { panel: PanelState; push(trace: AiTrace): void; reset(): void }
export const useAiPanelStore = create<PanelStore>((set) => ({
  panel: emptyPanel(),
  push: (trace) => set((s) => ({ panel: applyTrace(s.panel, trace) })),
  reset: () => set({ panel: emptyPanel() }),
}))
