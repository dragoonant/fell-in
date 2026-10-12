// Pure formatting helpers for the HUD (owner U). No rules numbers are computed here, only worded.
import type { ArmorValue, Colour, DicePool } from '../../data/types'

export const COLOUR_HEX: Record<Colour, string> = {
  orange: '#d9822b', yellow: '#e2c744', red: '#b8412f', green: '#5f9b4a', blue: '#4a79b8', black: '#2b2825',
}

/** 0.5 -> "50%". Tiny non-zero shows "<1%"; exact 0 and 1 stay exact. */
export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '-'
  if (p <= 0) return '0%'
  if (p >= 1) return '100%'
  const r = Math.round(p * 100)
  return r === 0 ? '<1%' : r === 100 ? '99%' : `${r}%`
}

/** One decimal, trailing ".0" dropped. */
export function num(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return String(Number(n.toFixed(digits)))
}

export function armorText(v: ArmorValue | undefined): string {
  if (v === undefined || v === 'none') return '-'
  if (v === 'immune') return 'immune'
  return v.strong !== undefined ? `${v.base} (${v.strong} strong)` : String(v.base)
}

export function poolText(pool: DicePool | undefined): string {
  const parts = Object.entries(pool ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([c, n]) => `${n} ${c}`)
  return parts.length ? parts.join(', ') : 'no effect dice'
}

/** Replace raw model ids inside an engine label with unit names (longest id first so prefixes do not clash). */
export function humaniseLabel(label: string, names: Record<string, string>): string {
  let out = label
  for (const id of Object.keys(names).sort((a, b) => b.length - a.length)) {
    if (id && out.includes(id)) out = out.split(id).join(names[id]!)
  }
  return out
}

/** "turn.ready" -> "Turn ready". Fallback title for kinds without their own copy. */
export function kindTitle(kind: string): string {
  const s = kind.replace(/[._]/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Group action menu entries for the activation panel. */
export function menuGroup(optionId: string, actionType: string): 'end' | 'quick' | 'move' | 'attack' | 'other' {
  if (actionType === 'turn.end' || optionId === 'end' || optionId.endsWith(':end')) return 'end'
  if (optionId.startsWith('quick:')) return 'quick'
  if (/^(move|climb)/.test(actionType)) return 'move'
  if (/^(shoot|throw|melee|charge|battleCry)/.test(actionType)) return 'attack'
  return 'other'
}
