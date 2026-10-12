// Matrix lookup (spec 18 s2, s3.1; CH p10-11). Pure; no randomness here (the caller passes the rolled face).
import type { AiCardDef, EditionBundle } from '../../data/types'
import { todo } from '../../engine/registry'
import type { ModelState } from '../../engine/types'
import type { AiView } from '../types'
import type { AiBlueIcon, ResolvedCell } from './types'

/** Icons of blue-die face `face` (dice.json order) as an AiBlueIcon key; BOT+BOT -> 'BOT2', STAR+STAR -> 'STAR2'. */
export function blueIconKey(bundle: EditionBundle, face: number): AiBlueIcon {
  void bundle; void face
  return todo('matrix.blueIconKey')
}

/** Number of faces on the blue die (12 in 1e). */
export function blueFaces(bundle: EditionBundle): number {
  void bundle
  return todo('matrix.blueFaces')
}

/** Row index and Method for an icon key; 'BOT+STAR' reads as one star (CH p10). Throws if the card has no such row. */
export function rowFor(card: AiCardDef, icon: AiBlueIcon): { row: number; method: 'close' | 'ranged' } {
  void card; void icon
  return todo('matrix.rowFor')
}

/** True when a column predicate holds: `health:<lo>-<hi>` / `health:<n>+` on Health remaining, or a scenario key. */
export function columnHolds(when: AiCardDef['columns'][number]['when'], model: ModelState, view: AiView, bundle: EditionBundle): boolean {
  void when; void model; void view; void bundle
  return todo('matrix.columnHolds')
}

/** First true column from the left, else the last column (CH p10). */
export function columnFor(card: AiCardDef, model: ModelState, view: AiView, bundle: EditionBundle): number {
  void card; void model; void view; void bundle
  return todo('matrix.columnFor')
}

/** The full lookup for one activation. */
export function resolveCell(card: AiCardDef, model: ModelState, face: number, view: AiView, bundle: EditionBundle): ResolvedCell {
  void card; void model; void face; void view; void bundle
  return todo('matrix.resolveCell')
}

/** The AI card for a unit (by unitId), or undefined. */
export function cardFor(cards: readonly AiCardDef[], unitId: string | undefined): AiCardDef | undefined {
  void cards; void unitId
  return todo('matrix.cardFor')
}
