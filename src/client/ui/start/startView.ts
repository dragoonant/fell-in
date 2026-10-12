// Pure helpers for the start screen (no engine or data imports: the start chunk stays small).
import type { NewGameOptions, ScenarioChoice, SeatController } from '../../store/launch'

export type PlayMode = 'bot' | 'hotseat' | 'watch'

export const MODES: readonly { id: PlayMode; label: string; blurb: string }[] = [
  { id: 'bot', label: 'Versus bot', blurb: 'You take the near edge; the bot plays the rest.' },
  { id: 'hotseat', label: 'Hot-seat', blurb: 'Two people, one screen, taking turns.' },
  { id: 'watch', label: 'Watch bots', blurb: 'Sit back and watch the bots fight it out.' },
]

export type OpponentTier = 'easy' | 'normal' | 'random' | 'official'
export const OPPONENTS: readonly { id: OpponentTier; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Plays sensibly but makes mistakes.' },
  { id: 'normal', label: 'Normal', blurb: 'Uses cover, picks fights it can win.' },
  { id: 'random', label: 'Random', blurb: 'Moves and shoots without a plan.' },
  { id: 'official', label: 'Wasteland AI (official cards)', blurb: 'The tabletop AI deck plays the other side: solo, or co-op for two.' },
]
export const OFFICIAL_TIER: OpponentTier = 'official'
export type TeamSize = 1 | 2
export const asTeam = (v: unknown): TeamSize => (v === 2 ? 2 : 1)
export const DEFAULT_TIER: OpponentTier = 'normal'
export const asTier = (v: unknown): OpponentTier => (OPPONENTS.some((o) => o.id === v) ? (v as OpponentTier) : DEFAULT_TIER)

export const DEFAULT_SCENARIO_ID = 'box-1'

/** Controllers in seat order for a mode, padded to the scenario's side count (extra sides are bots). */
export function seatsFor(mode: PlayMode, sides = 2): SeatController[] {
  const base: SeatController[] = mode === 'hotseat' ? ['human', 'human'] : mode === 'watch' ? ['bot', 'bot'] : ['human', 'bot']
  const out = base.slice(0, Math.max(1, sides))
  while (out.length < sides) out.push('bot')
  return out
}

/** Seats for the official AI: one or two people (hot-seat co-op) against the AI seat, which always sits last. */
export function officialSeats(team: TeamSize): SeatController[] {
  return team === 2 ? ['human', 'human', 'official'] : ['human', 'official']
}

/** With the official AI as opponent only scenarios with an AI side apply: the solo and co-op groups. */
export function aiScenarios(list: readonly ScenarioChoice[]): ScenarioChoice[] {
  return list.filter((s) => s.mode === 'ai' || s.mode === 'coop')
}

/** Trim the seed; blank means a random seed (omit it). */
export function cleanSeed(raw: string): string | undefined {
  const s = raw.trim().slice(0, 40)
  return s === '' ? undefined : s
}

export interface ScenarioGroup { id: 'box' | 'tutorial' | 'ai' | 'coop' | 'other'; label: string; items: ScenarioChoice[] }

const GROUPS: readonly { id: ScenarioGroup['id']; label: string }[] = [
  { id: 'box', label: 'Skirmish (starter box 1 to 5)' },
  { id: 'tutorial', label: 'Learn to play' },
  { id: 'ai', label: 'Solo against the game' },
  { id: 'coop', label: 'Co-op' },
  { id: 'other', label: 'Other' },
]

/** Split scenarios into groups; the box scenarios sort by number, the rest keep data order. Empty groups drop out. */
export function groupScenarios(list: readonly ScenarioChoice[]): ScenarioGroup[] {
  const groupOf = (s: ScenarioChoice): ScenarioGroup['id'] =>
    /^box-\d+$/.test(s.id) ? 'box' : s.mode === 'tutorial' ? 'tutorial' : s.mode === 'ai' ? 'ai' : s.mode === 'coop' ? 'coop' : 'other'
  const boxNo = (s: ScenarioChoice) => Number(s.id.replace(/\D+/g, '')) || 0
  return GROUPS.map((g) => {
    const items = list.filter((s) => groupOf(s) === g.id)
    if (g.id === 'box') items.sort((a, b) => boxNo(a) - boxNo(b))
    return { id: g.id, label: g.label, items }
  }).filter((g) => g.items.length > 0)
}

/** The scenario to preselect: the saved/default id if it exists, else the first box scenario, else the first of any. */
export function pickDefaultScenario(list: readonly ScenarioChoice[], wanted = DEFAULT_SCENARIO_ID): string | null {
  return (list.find((s) => s.id === wanted) ?? groupScenarios(list).find((g) => g.id === 'box')?.items[0] ?? list[0])?.id ?? null
}

/** One line under the picker describing the chosen scenario. */
export function scenarioSummary(s: ScenarioChoice): string {
  const rounds = s.rounds ? `${s.rounds} rounds` : 'goal based'
  const kind = s.mode === 'versus' ? 'Skirmish' : s.mode === 'tutorial' ? 'Tutorial' : s.mode === 'ai' ? 'Solo' : s.mode === 'coop' ? 'Co-op' : s.mode
  return `${kind}, ${s.sides} ${s.sides === 1 ? 'side' : 'sides'}, ${rounds}`
}

/** Build the launch options from the picker state. */
export function buildOptions(p: { scenarioId: string | null; mode: PlayMode; seed: string; sides: number; tier?: OpponentTier; team?: TeamSize }): NewGameOptions & { tier?: OpponentTier } {
  const seed = cleanSeed(p.seed)
  const seats = p.tier === OFFICIAL_TIER ? officialSeats(asTeam(p.team)) : seatsFor(p.mode, p.sides)
  return { ...(p.tier ? { tier: asTier(p.tier) } : {}), ...(p.scenarioId ? { scenarioId: p.scenarioId } : {}), seats, ...(seed ? { seed } : {}) }
}

/** "3 min ago" style label for the autosave line. */
export function ageLabel(savedAt: string, now = Date.now()): string {
  const t = Date.parse(savedAt)
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}
