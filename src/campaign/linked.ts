// Linked-scenario consequences (CAMP-016) turned into numbers and flags. Kept apart from battle.ts so the reducer can apply them
// when they take effect without importing the battle bridge.
import type { LinkedConsequence } from './types'

/** A linked-scenario consequence turned into numbers and flags the battle layer can read. */
export interface LinkedApplied {
  text: string
  capsLimitDelta?: number
  freeCards?: string[]
  firstTurn?: 'self' | 'choose'
  deploySecond?: boolean
  /** True when no engine or campaign code applies it yet; the settlement shows the text (RULING: linked consequences not modelled). */
  notModelled?: boolean
}

export function applyLinked(l: LinkedConsequence): LinkedApplied {
  const e = l.effect
  const code = e && !Array.isArray(e) && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string; args?: Record<string, unknown> }) : null
  const args = code?.args ?? {}
  switch (code?.code) {
    case 'capsChange': case 'fewerCaps': return { text: l.text, capsLimitDelta: Number(args.n ?? 0) }
    case 'freeCard': case 'freeCards': return { text: l.text, freeCards: ([] as string[]).concat((args.defIds ?? args.defId ?? []) as string | string[]) }
    case 'firstTurn': return { text: l.text, firstTurn: args.choose ? 'choose' : 'self' }
    case 'deploySecond': return { text: l.text, deploySecond: true }
    default: return { text: l.text, notModelled: true }
  }
}
