// Pure view model for the AI card panel (our wording): turns an AiTrace into plain-words lines the player can follow.
// Imports types only, so it stays cheap to test and load.
import type { Action } from '../../engine/types'
import type { Activity, ActivityKind, AiTrace, MatrixPick, ResponseCode } from '../../ai/official/types'

export const RESPONSE_NAMES: Record<ResponseCode, string> = {
  A: 'Attack', M: 'Move', O: 'Objective', F: 'Fall back', D: 'Defend', S: 'Strike',
}
export const RESPONSE_MEANING: Record<ResponseCode, string> = {
  A: 'Hit the best enemy it can reach, closing in if it has to.',
  M: 'Walk toward its target without starting a fight.',
  O: 'Work on its mission: fight the target, guard it, travel to it or use it.',
  F: 'Retreat toward where it started.',
  D: 'Cover its protected target by attacking whoever threatens it.',
  S: 'Attack if it can fight this turn; otherwise just move closer.',
}
export const ACTIVITY_WORDS: Record<ActivityKind, string> = {
  closeCombat: 'fights in close combat', charge: 'charges', shoot: 'shoots', throw: 'throws something',
  moveEngage: 'moves into base contact', moveToCharge: 'moves to within charge reach', moveToMove: 'moves to within a move of the enemy',
  moveToward: 'advances', moveToRange: 'moves to a firing spot', moveSafer: 'moves to better cover', disengage: 'breaks away from combat',
  interact: 'interacts with the objective', useExpertise: 'uses an expertise on the objective', peek: 'peeks at the objective from range',
  pickup: 'picks something up', moveContact: 'moves up to the objective', fallBack: 'falls back', holdCover: 'holds its cover',
  useItem: 'uses an item', prepare: 'prepares', end: 'ends its activation',
}

export interface PanelState {
  modelId: string | null
  cardId: string | null
  pick: MatrixPick | null
  token: { drawn: string; number: number } | null
  activities: { action: number; activity: Activity }[]
  ranking: string[]
  notes: string[]
  /** Counts traces absorbed (lets tests and the UI see updates). */
  rev: number
}
export const emptyPanel = (): PanelState => ({ modelId: null, cardId: null, pick: null, token: null, activities: [], ranking: [], notes: [], rev: 0 })

/** Fold one trace into the panel state. A matrix entry starts a fresh card view. */
export function applyTrace(prev: PanelState, trace: AiTrace): PanelState {
  let s: PanelState = { ...prev, rev: prev.rev + 1 }
  for (const e of trace.entries) {
    if (e.kind === 'matrix') {
      s = { ...s, modelId: e.pick.modelId, cardId: e.pick.cardId, pick: e.pick, activities: [], ranking: [], notes: [] }
    } else if (e.kind === 'activity') {
      const dup = s.activities.some((a) => a.action === e.action && a.activity.kind === e.activity.kind && a.activity.reason === e.activity.reason)
      if (!dup) s = { ...s, modelId: e.modelId, activities: [...s.activities, { action: e.action, activity: e.activity }] }
    } else if (e.kind === 'ranking') {
      s = { ...s, ranking: e.ranking.ranked.map((r) => r.id) }
    } else if (e.kind === 'token') {
      s = { ...s, token: { drawn: e.drawn, number: e.number } }
    } else if (e.kind === 'fallback') {
      s = { ...s, notes: [...s.notes, `No card answer for ${e.decisionKind}; the ${e.to} routine chose.`] }
    } else if (e.kind === 'note') {
      s = { ...s, notes: [...s.notes, e.text] }
    }
  }
  return s
}

/** The aiTrace stamped on an Action, or null (human and random answers carry none). */
export function traceOf(a: Action | null | undefined): AiTrace | null {
  const t = (a as { aiTrace?: unknown } | null | undefined)?.aiTrace
  return t && typeof t === 'object' && Array.isArray((t as AiTrace).entries) ? (t as AiTrace) : null
}

export interface PickLines { unit: string; column: string; roll: string; row: string; response: string; meaning: string; attitude: string }
export function describePick(pick: MatrixPick, name: (id: string) => string): PickLines {
  const letter = pick.forced ?? pick.response
  const roll = pick.roll
    ? `Blue die: ${pick.roll.icons.length ? pick.roll.icons.join(' + ') : 'blank'}`
    : 'No die rolled: the scenario fixes the row'
  return {
    unit: name(pick.modelId),
    column: `Column ${pick.columnLabel}: the first column that fits its health`,
    roll,
    row: `Row ${pick.row + 1}`,
    response: `${letter}: ${RESPONSE_NAMES[letter]}`,
    meaning: RESPONSE_MEANING[letter],
    attitude: `${pick.attitude === 'reckless' ? 'Reckless: ignores cover and danger' : 'Careful: plays for cover'}${pick.stayEngaged ? ', stays in combat' : ''}`,
  }
}

export function describeActivity(a: Activity, name: (id: string) => string): string {
  const who = a.targetId ? ` ${name(a.targetId)}` : ''
  return `${ACTIVITY_WORDS[a.kind] ?? a.kind}${who} (as ${RESPONSE_NAMES[a.as] ?? a.as}): ${a.reason}`
}
