// What the settlement screen reads and does, in the screen's own terms. The campaign layer (src/campaign/*, spec 19 s7) is
// reached only through adapter.ts, which turns its records into these shapes; nothing here imports the engine or the data.
import type { Campaign } from '../../../campaign/types'
import type { CampaignForce, NewGameOptions, SeatController } from '../../store/launch'  // types only: erased at build

/** The campaign record (src/campaign/types.ts). */
export type CampaignDoc = Campaign

/** One thing a player can do in a step (a button). `action` goes back to the campaign layer untouched. */
export interface Choice {
  id: string
  label: string
  detail?: string
  /** Caps it costs (shown on the button); negative = pays you. */
  cost?: number
  /** Heading the choice is listed under (structures by kind, pool cards by type). */
  group?: string
  /** Why it cannot be chosen right now (plain words); the button is disabled when set. */
  blocked?: string
  /** The action to run on click; null = the choice is a toggle for the step's pick-several confirm. */
  action: unknown
  /** Click-through that also takes whatever toggles are picked right now (scout with committed gear). */
  withPicks?: (picked: string[]) => unknown
}

export type StepState = 'done' | 'current' | 'later' | 'skipped'

export interface StepView {
  id: string
  title: string
  /** Plain-words line: what this step is for. */
  blurb: string
  /** The question the player answers here. */
  decision: string
  choices: Choice[]
  /** The step needs nothing from the player. */
  auto: boolean
  /** The player may leave the step without choosing (most steps). */
  optional: boolean
  state: StepState
  /** One extra plain-words line under the question (what happens if the player leaves the step alone). */
  hint?: string
  /** What the layer wants dispatched to close the step; null = just move on in the screen. */
  finish: unknown | null
  /** Pick-several steps: the choices become toggles and `confirm` builds the one action from the picked choice ids. */
  multi?: { min: number; max: number; confirmLabel?: string; confirm?: (ids: string[]) => unknown }
}

export interface RosterRow { id: string; name: string; unit: string; leader: boolean; perks: string[]; injuries: string[]; equipped: string[] }
export interface PoolRow { id: string; name: string; kind: string; value: number | null; note?: string }
export interface StructureRow { id: string; name: string; count: number; powered?: boolean; note?: string }
export interface QuestRow { id: string; name: string; progress: string }

export interface CampaignView {
  name: string
  round: number
  caps: number
  land: number
  structureCount: number
  room: number | null
  power: { supply: number; need: number } | null
  faction: string
  /** Perks the whole settlement owns (names). */
  settlementPerks: string[]
  /** Boost cards held for the next battle (contents stay secret). */
  handCount: number
  roster: RosterRow[]
  pool: PoolRow[]
  structures: StructureRow[]
  quests: QuestRow[]
  /** Newest last, plain words. */
  log: string[]
  /** Text for things the next battle brings (consequences, explore results). */
  carry: string[]
}

/** Everything the screen needs from the layer. */
export interface CampaignApi {
  create(opts: { seed: string; faction?: string | null; name?: string }): CampaignDoc
  /** The saved campaign, or null. */
  load(): CampaignDoc | null
  save(c: CampaignDoc): void
  view(c: CampaignDoc): CampaignView
  steps(c: CampaignDoc): StepView[]
  /** One action; steps with nothing to decide then run on their own. Throws the layer's own message when it refuses. */
  reduce(c: CampaignDoc, action: unknown): CampaignDoc
  /** Marks the battle as running (picks a force first when none is set) and returns the campaign plus the game launch options. */
  startBattle(c: CampaignDoc, pick: NextBattle): { campaign: CampaignDoc; options: NewGameOptions }
  /** `questCompleted`: the player says the Quest card they took into the battle was done (the engine does not model Quests). */
  fromBattle(c: CampaignDoc, finalState: unknown, opts?: { questCompleted?: boolean }): CampaignDoc
  /** The Quest card taken into the battle in progress, or null. */
  pendingQuest(c: CampaignDoc): { cardId: string; name: string } | null
}

export interface OpponentChoice { id: 'bot' | 'official' | 'human'; label: string; blurb: string }
export const OPPONENTS: OpponentChoice[] = [
  { id: 'bot', label: 'Raider bot', blurb: 'The skirmish bot plays the other side.' },
  { id: 'official', label: 'Wasteland AI', blurb: 'The official AI cards run the other side (needs an AI scenario).' },
  { id: 'human', label: 'A friend', blurb: 'Two players, one screen, taking turns.' },
]

export interface NextBattle { scenarioId: string; opponent: OpponentChoice['id']; seed: string; /** Table theme for an open skirmish table; none or null = the scenario's own layout. */ theme?: string | null }

export type { CampaignForce, NewGameOptions, SeatController }
