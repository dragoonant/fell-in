// Matrix lookup (spec 18 s2, s3.1; CH p10-11). Pure; no randomness here (the caller passes the rolled face).
import type { AiCardDef, EditionBundle } from '../../data/types'
import { healthOf, tokensOn } from '../../engine/damage'
import { diceDef } from '../../engine/edition'
import type { ModelState } from '../../engine/types'
import type { AiView } from '../types'
import { queryState } from '../world'
import type { AiBlueIcon, ResolvedCell } from './types'

/** Icons of blue-die face `face` (dice.json order) as an AiBlueIcon key; BOT+BOT -> 'BOT2', STAR+STAR -> 'STAR2'. */
export function blueIconKey(bundle: EditionBundle, face: number): AiBlueIcon {
  const faces = diceDef(bundle).effect.blue
  const icons = faces[((face % faces.length) + faces.length) % faces.length]!.icons
  const n = (k: string): number => icons.filter((i) => i === k).length
  if (n('BLAST') > 0) return 'BLAST'
  const bot = n('BOT'), star = n('STAR')
  if (bot > 0 && star > 0) return 'BOT+STAR'
  if (star >= 2) return 'STAR2'
  if (star === 1) return 'STAR'
  if (bot >= 2) return 'BOT2'
  return 'BOT'
}

/** Number of faces on the blue die (12 in 1e). */
export function blueFaces(bundle: EditionBundle): number {
  return diceDef(bundle).effect.blue.length
}

/** Fallback order when a card does not list an icon key itself: the bottle+star face reads as a single star (CH p10). */
const FALLBACK: Record<AiBlueIcon, AiBlueIcon[]> = {
  'BOT+STAR': ['STAR'], BOT2: ['BOT'], STAR2: ['STAR'], BOT: ['BOT2'], STAR: ['STAR2', 'BOT+STAR'], BLAST: [],
}

/** Row index and Method for an icon key; 'BOT+STAR' reads as one star (CH p10). Throws if the card has no such row. */
export function rowFor(card: AiCardDef, icon: AiBlueIcon): { row: number; method: 'close' | 'ranged' } {
  for (const key of [icon, ...FALLBACK[icon]]) {
    for (let r = 0; r < card.rows.length; r++) {
      const idx = card.rows[r]!.blueIcons.indexOf(key)
      if (idx < 0) continue
      const methods = card.rows[r]!.method
      return { row: r, method: methods[idx] ?? methods[0] ?? 'close' }
    }
  }
  throw new Error(`AI card ${card.id} has no row for ${icon}`)
}

/** Health remaining of a model (max Health incl. Power Armor, minus tokens). */
function healthLeft(view: AiView, bundle: EditionBundle, model: ModelState): number {
  const q = queryState(view, bundle)
  return Math.max(0, healthOf(q, bundle, model.id) - tokensOn(bundle, model))
}

/** True when a column predicate holds: `health:<lo>-<hi>` / `health:<n>+` on Health remaining, or a scenario key. */
export function columnHolds(when: AiCardDef['columns'][number]['when'], model: ModelState, view: AiView, bundle: EditionBundle): boolean {
  const hasOther = typeof when.other === 'string' && when.other.length > 0
  if (!when.damageTaken && !hasOther) return true // an unconditional column ("any")
  if (when.damageTaken) {
    const taken = model.damage + model.rad
    if (taken < when.damageTaken[0] || taken > when.damageTaken[1]) return false
  }
  if (hasOther) {
    const m = /^health:(\d+)(?:-(\d+)|(\+))?$/.exec(when.other!)
    if (!m) return false // an unknown scenario predicate never holds; the last column catches the fall-through
    const left = healthLeft(view, bundle, model)
    const lo = Number(m[1])
    const hi = m[3] ? Infinity : m[2] !== undefined ? Number(m[2]) : lo
    if (left < lo || left > hi) return false
  }
  return true
}

/** First true column from the left, else the last column (CH p10). */
export function columnFor(card: AiCardDef, model: ModelState, view: AiView, bundle: EditionBundle): number {
  for (let i = 0; i < card.columns.length; i++) if (columnHolds(card.columns[i]!.when, model, view, bundle)) return i
  return Math.max(0, card.columns.length - 1)
}

/** The full lookup for one activation. */
export function resolveCell(card: AiCardDef, model: ModelState, face: number, view: AiView, bundle: EditionBundle): ResolvedCell {
  const icons = blueIconKey(bundle, face)
  const { row, method } = rowFor(card, icons)
  const column = columnFor(card, model, view, bundle)
  const cells = card.rows[row]!.cells
  const cell = cells[Math.min(column, cells.length - 1)]!
  return {
    cardId: card.id, face, icons, row, column, columnLabel: card.columns[column]?.label ?? '',
    response: cell.response, reckless: cell.reckless, stayEngaged: cell.stayEngaged, method,
  }
}

/** The AI card for a unit (by unitId), or undefined. The fallback card (id ai-generic) is never matched by unit. */
export function cardFor(cards: readonly AiCardDef[], unitId: string | undefined): AiCardDef | undefined {
  if (!unitId) return undefined
  return cards.find((c) => c.unitId === unitId && c.id !== 'ai-generic')
}
