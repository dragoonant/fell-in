// Pure view of the latest logged official-AI decision, for the HUD card panel.
import type { GameState } from '../../engine/types'
import type { FeedEntry } from '../contract'
import { modelName, RESPONSE_WORDS } from '../presentation/labels'

export interface AiCardRows { unit: string; column: string; row: string; response: string; target: string | null }

export function latestAiDecision(feed: readonly FeedEntry[]): Record<string, unknown> | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const c = feed[i]!.cue
    if (c.kind === 'note' && (c.event as { type: string }).type === 'ai.decision') return c.event as unknown as Record<string, unknown>
  }
  return null
}

export function aiCardRows(state: GameState | null, ev: Record<string, unknown>): AiCardRows | null {
  const cell = ev.cell as { columnLabel?: string; row?: number; response?: string } | null | undefined
  if (!cell) return null
  const performed = (ev.performed as string | null | undefined) ?? cell.response ?? null
  const asked = cell.response ?? performed
  const word = (r: string | null) => (r ? RESPONSE_WORDS[r] ?? r : 'none')
  const target = ev.target as { id?: string; kind?: string } | undefined
  return {
    unit: typeof ev.modelId === 'string' ? modelName(state, ev.modelId) : 'The AI',
    column: cell.columnLabel ?? '?',
    row: String((cell.row ?? 0) + 1),
    response: performed === asked ? word(performed) : `${word(asked)}, turned into ${word(performed)}`,
    target: target?.id ? (target.kind === 'marker' ? 'a marker' : modelName(state, target.id)) : null,
  }
}
