// Pure view helpers for the dice tray (no React, no store). Face meaning comes in through a FaceLookup built from the
// edition dice table (contract skillDieFace/effectDieFace), so these functions are testable without a data bundle.
import type { Icon } from '../../data/types'
import type { CueOf, RolledDie } from '../contract'

export interface FaceLookup {
  skill(face: number): { value: number | 'X'; icons: readonly Icon[] } | null
  effect(colour: string, face: number): readonly Icon[] | null
}

/** Our own glyphs and words for the edition icons. */
export const ICON_GLYPH: Record<Icon, { glyph: string; word: string }> = {
  DMG: { glyph: '✸', word: 'Damage' },
  AR: { glyph: '◈', word: 'Armor ring' },
  ACC1: { glyph: '⌖', word: 'Accuracy 1' },
  ACC2: { glyph: '⌖⌖', word: 'Accuracy 2' },
  ACC3: { glyph: '⌖⌖⌖', word: 'Accuracy 3' },
  BOT: { glyph: '◍', word: 'Bottle cap' },
  STAR: { glyph: '★', word: 'Star' },
  BLAST: { glyph: '✺', word: 'Blast' },
  AP: { glyph: '▲', word: 'Action point' },
  CP: { glyph: '◆', word: 'Critical' },
  X: { glyph: '✕', word: 'Miss' },
}

export interface DieView {
  key: string
  role: RolledDie['role']
  colour: string | null
  sides: number
  face: number
  /** Big text on the die: the skill value, 'X', the face number, or a luck word. */
  text: string
  icons: Icon[]
  reroll: boolean
  /** Replaced by a later re-roll of the same die. */
  superseded: boolean
  /** Skill die showing a critical face. */
  crit: boolean
}

export interface Outcome { success: boolean; critical: boolean; sv: number }

export interface RollView {
  label: string
  dice: DieView[]
  /** Sum of ACC on the dice still counting (not superseded). */
  acc: number
  rerolled: boolean
  luck: 'lucky' | 'blank' | null
  outcome: Outcome | null
  /** Verdict word and tone for the header. */
  verdict: { word: string; tone: 'win' | 'lose' | 'crit' | 'neutral' }
}

const accOf = (icons: readonly Icon[]) => icons.reduce((n, i) => n + (i === 'ACC1' ? 1 : i === 'ACC2' ? 2 : i === 'ACC3' ? 3 : 0), 0)

export function viewDice(dice: readonly RolledDie[], lookup: FaceLookup, isLuck = false): DieView[] {
  const out: DieView[] = dice.map((d, i) => {
    let text = String(d.face)
    let icons: Icon[] = []
    let crit = false
    if (d.role === 'skill') {
      const f = lookup.skill(d.face)
      if (f) { text = String(f.value); icons = [...f.icons]; crit = f.icons.includes('CP') }
    } else if (d.role === 'effect' && d.colour) {
      icons = [...(lookup.effect(d.colour, d.face) ?? [])]
    } else if (isLuck) {
      text = d.face === 1 ? 'Luck' : 'Blank'
    }
    return { key: `${d.rollId}:${i}`, role: d.role, colour: d.colour ?? null, sides: d.sides, face: d.face, text, icons, reroll: d.reroll, superseded: false, crit }
  })
  // A re-roll die replaces the earliest still-counting die of the same kind that was rolled before it.
  out.forEach((d, i) => {
    if (!d.reroll) return
    const prev = out.find((p, j) => j < i && !p.reroll && !p.superseded && p.role === d.role && p.colour === d.colour)
    if (prev) prev.superseded = true
  })
  return out
}

export function verdictFor(outcome: Outcome | null, luck: RollView['luck']): RollView['verdict'] {
  if (luck) return luck === 'lucky' ? { word: 'Lucky', tone: 'win' } : { word: 'No luck', tone: 'lose' }
  if (!outcome) return { word: '', tone: 'neutral' }
  if (outcome.success && outcome.critical) return { word: 'Critical hit', tone: 'crit' }
  return outcome.success ? { word: 'Success', tone: 'win' } : { word: 'Fail', tone: 'lose' }
}

export function viewRoll(cue: CueOf<'dice'>, lookup: FaceLookup, outcome: Outcome | null, label: string): RollView {
  const isLuck = cue.purpose === 'luck' || cue.purpose.startsWith('luck:')
  const dice = viewDice(cue.dice, lookup, isLuck)
  const luck: RollView['luck'] = isLuck ? (cue.dice[0]?.face === 1 ? 'lucky' : 'blank') : null
  const acc = dice.filter((d) => !d.superseded).reduce((n, d) => n + accOf(d.icons), 0)
  const o = isLuck ? null : outcome
  return { label, dice, acc, rerolled: dice.some((d) => d.reroll), luck, outcome: o, verdict: verdictFor(o, luck) }
}

/** Roll purposes that are the attack test itself (an armor or luck roll is not). */
const ATTACK_HEADS = new Set(['shoot', 'throw', 'melee'])
/** True when a dice cue is an attack test, or carries no purpose to tell. */
export const isAttackRoll = (cue: { purpose?: unknown }): boolean =>
  typeof cue.purpose !== 'string' || ATTACK_HEADS.has(cue.purpose.split(':')[0] ?? '')

/**
 * The attack result that follows an attack dice cue in the feed, if any. The engine logs the armor roll and damage before
 * the attack event, so non-attack dice cues (armor, luck) are stepped over; the next attack roll ends the search.
 */
export function outcomeAfter(feed: readonly { cue: { kind: string } }[], cue: unknown): Outcome | null {
  const at = feed.findIndex((e) => e.cue === cue)
  if (at < 0 || !isAttackRoll(cue as { purpose?: unknown })) return null
  for (let i = at + 1; i < feed.length; i++) {
    const c = feed[i]!.cue as { kind: string; success?: boolean; critical?: boolean; sv?: number; purpose?: unknown }
    if (c.kind === 'dice') { if (isAttackRoll(c)) return null; continue }
    if (c.kind === 'attack') return { success: !!c.success, critical: !!c.critical, sv: Number(c.sv ?? 0) }
  }
  return null
}

/**
 * What the tray headlines: the latest roll, except that an armor roll that follows an attack roll is shown under that
 * attack (so the attack dice and verdict stay in view). Returns indexes into the log.
 */
export function trayFocus(log: readonly { cue: { purpose: string } }[]): { main: number; extra: number | null } | null {
  const last = log.length - 1
  if (last < 0) return null
  const head = log[last]!.cue.purpose.split(':')[0]
  if (head === 'armor' && last > 0 && ATTACK_HEADS.has(log[last - 1]!.cue.purpose.split(':')[0] ?? '')) return { main: last - 1, extra: last }
  return { main: last, extra: null }
}
