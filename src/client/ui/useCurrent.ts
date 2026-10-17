// The model the HUD is currently about: the inspected one, else the active one, else the one a decision names.
import { useOpenDecision, usePresented } from '../contract'
import { useUiStore } from './uiStore'

export function useCurrentModelId(): string | null {
  const state = usePresented()
  const open = useOpenDecision()
  const inspected = useUiStore((s) => s.inspected)
  if (!state) return null
  const ctxModel = typeof open?.context.modelId === 'string' ? open.context.modelId : null
  return inspected && state.models[inspected] ? inspected : state.activation?.modelId ?? ctxModel ?? Object.keys(state.models)[0] ?? null
}
