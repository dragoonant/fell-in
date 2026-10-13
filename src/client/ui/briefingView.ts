// Pure view helpers for the scenario briefing and the objective tracker (our words; data comes from ScenarioDef.briefing).
import type { ObjectiveLine, ObjectiveStatus } from '../../engine/scenarios/status'
import type { BriefingInfo } from '../store/launch'

export interface BriefingInput {
  name: string
  rounds: number | null
  sideIds: readonly string[]
  briefing?: BriefingInfo | null
  rules?: readonly { id: string; text: string }[]
}
export interface GoalRow { seat: string; label: string; text: string; mine: boolean }
export interface BriefingModel {
  title: string
  story: string
  goals: GoalRow[]
  enemy: GoalRow[]
  howToWin: string[]
  tips: string[]
  rules: { id: string; text: string }[]
  rounds: string
}

export const roundsText = (rounds: number | null): string => (rounds ? `${rounds} rounds` : 'No round limit: play until a side wins')

/** Sensible briefing for a scenario that has no authored one. */
export function fallbackBriefing(name: string, rounds: number | null): BriefingInfo {
  return {
    story: `${name}. Two sides meet on the table and only one walks away.`,
    goals: {},
    howToWin: [
      'Defeat the enemy units before they defeat yours.',
      rounds ? `The game lasts ${rounds} rounds; the side with the better position at the end wins.` : 'There is no round limit; the game ends when one side is wiped out.',
    ],
    tips: ['Use cover when you shoot and when you are shot at.'],
  }
}

const DEFAULT_GOAL = 'Defeat the enemy units and hold the field.'

/**
 * Build the briefing model. Each seat's side comes from `seatSides` (the engine's assignment); without it seat i plays side i. Humans get "Your goal" rows (one per
 * human seat, labelled by seat in hot-seat); every other side is listed as the enemy.
 */
export function buildBriefing(
  input: BriefingInput, seatOrder: readonly string[], controllers: Readonly<Record<string, string>>, seatName: (seat: string) => string,
  seatSides?: Readonly<Record<string, string>>,
): BriefingModel {
  const b = input.briefing ?? fallbackBriefing(input.name, input.rounds)
  const humans = seatOrder.filter((s) => controllers[s] === 'human')
  const goalFor = (seat: string, i: number) => b.goals[seatSides?.[seat] ?? input.sideIds[i] ?? ''] ?? DEFAULT_GOAL
  const row = (seat: string, mine: boolean): GoalRow => {
    const i = seatOrder.indexOf(seat)
    const ai = controllers[seat] === 'official'
    const label = mine ? (humans.length > 1 ? `${seatName(seat)}'s goal` : 'Your goal') : ai ? 'The Wasteland AI will...' : 'Enemy goal'
    return { seat, label, text: goalFor(seat, i), mine }
  }
  return {
    title: input.name,
    story: b.story,
    goals: humans.map((s) => row(s, true)),
    enemy: seatOrder.filter((s) => !humans.includes(s)).map((s) => row(s, false)),
    howToWin: b.howToWin,
    tips: b.tips,
    rules: (input.rules ?? []).map((r) => ({ id: r.id, text: r.text })),
    rounds: roundsText(input.rounds),
  }
}

export interface TrackerLine { id: string; text: string; side?: string; kind: 'bar' | 'check' | 'value' | 'text'; value?: number; max?: number; pct?: number; done?: boolean }
export interface TrackerModel { name: string; round: string; lines: TrackerLine[] }

export function trackerView(s: ObjectiveStatus): TrackerModel {
  const round = Math.max(1, s.round)
  const lines = s.lines.map((l: ObjectiveLine): TrackerLine => {
    const base = { id: l.id, text: l.text, ...(l.side ? { side: l.side } : {}) }
    if (l.done !== undefined && l.value === undefined) return { ...base, kind: 'check', done: l.done }
    if (l.value !== undefined && l.max !== undefined && l.max > 0) {
      return { ...base, kind: 'bar', value: l.value, max: l.max, pct: Math.max(0, Math.min(100, Math.round((l.value / l.max) * 100))), ...(l.done !== undefined ? { done: l.done } : {}) }
    }
    if (l.value !== undefined) return { ...base, kind: 'value', value: l.value, ...(l.done !== undefined ? { done: l.done } : {}) }
    return { ...base, kind: 'text' }
  })
  return { name: s.name, round: s.round < 1 ? (s.rounds > 0 ? `Setting up · ${s.rounds} rounds` : 'Setting up') : `Round ${round}${s.rounds > 0 ? ` of ${s.rounds}` : ''}`, lines }
}
