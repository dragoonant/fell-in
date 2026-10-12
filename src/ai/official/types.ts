// Official AI card system contracts (FROZEN at M4b; docs/spec/18-ai-system.md s8). Pure types only.
// The official decider sees view(state, seat), the open PendingDecision and legalActions, nothing else.
import type { AiCardDef, EditionBundle } from '../../data/types'
import type { Action, Id, ModelId, Vec2 } from '../../engine/types'
import type { AiView } from '../types'

/** Objectives (CH p9). Scenario data uses the first four; 'none' arrives only through a switch. */
export type AiObjective = 'defeat' | 'protect' | 'goTo' | 'use' | 'none'
/** Response letters (CH p11; S from ERR p.16). */
export type AiResponse = 'A' | 'M' | 'O' | 'F' | 'D' | 'S'
/** Attack Method from the row icon (CH p11). */
export type AiMethod = 'close' | 'ranged'
/** Blue-die icon keys as stored in AiCardDef rows (spec 20). */
export type AiBlueIcon = AiCardDef['rows'][number]['blueIcons'][number]

/** The AI task for one model right now: Objective [Subject] (CH p9; AIH s2). `subject` is the scenario string. */
export interface AiSettings {
  objective: AiObjective
  subject: string
  /** Scenario override: skip the matrix and always use this Response (e.g. Break-in patrols perform O). */
  forceResponse?: AiResponse
}

/** A Subject resolved against the current view (re-resolved before every Action). */
export interface ResolvedSubject {
  kind: 'model' | 'marker' | 'point' | 'edge' | 'none'
  /** Model or marker ids (several = pick the Nearest, CH p13). */
  ids: Id[]
  /** Points to reach (marker positions, a deployment point, the nearest spot on an edge). */
  points: Vec2[]
}

/** One activation's matrix lookup (CH p10). Fixed for the whole activation. */
export interface ResolvedCell {
  cardId: string
  /** Blue-die face index (0-11, dice.json order) and the icons it shows. */
  face: number
  icons: AiBlueIcon
  /** Row index on the card and the icon key used inside that row. */
  row: number
  column: number
  columnLabel: string
  response: AiResponse
  reckless: boolean
  stayEngaged: boolean
  method: AiMethod
}

/** How a target was chosen (CH p12): each priority step with the values it compared and who survived. */
export interface TargetRanking {
  candidates: Id[]
  /** 'subjectOnly' (Defeat / Defend), 'lastModel' (last AI model picks the Subject first), 'preferFirst' class pass. */
  forced?: 'subjectOnly' | 'lastModel' | 'preferFirst'
  steps: { priority: string; values: Record<Id, number>; kept: Id[] }[]
  winner: Id | null
  /** Set when several candidates survived every step and the seeded stream picked one. */
  tie?: { among: Id[]; seedKey: string }
}

/** One logged official-AI decision (AI-015). Emitted as an 'ai.decision' event once the engine hook lands. */
export interface AiDecisionLog {
  type: 'ai.decision'
  decisionId: Id
  kind: string
  round: number
  modelId: ModelId | null
  /** 0 or 1 for the two Actions, 'quick' for the Heroic V.A.T.S. Quick Action, null outside an activation. */
  actionIndex: 0 | 1 | 'quick' | null
  cell: ResolvedCell | null
  settings: AiSettings | null
  /** Response actually performed and how it got there, e.g. ['O', 'defeat', 'A']. */
  performed: AiResponse | null
  chain: string[]
  /** Activity chosen from the list, e.g. 'cc.charge', 'ranged.shoot', 'move.towardSubject', 'turn.end'. */
  activity: string
  weapon?: Id
  target?: { id: Id; kind: 'model' | 'marker' }
  ranking?: TargetRanking
  /** Seed keys of every random draw made for this answer (token, blue die, tie, charge marker). */
  draws: string[]
}

/** Host options for createOfficialAiDecider. */
export interface OfficialAiOpts {
  /** Seed for the AI's own streams: deriveSeed(seed, <purpose>, ...). Never state.rng. */
  seed: string
  bundle: EditionBundle
  /** AI cards by unit id; default: bundle.records.ai. */
  cards?: readonly AiCardDef[]
  /** Dry-run legality of a parameterised answer (as in M4a AiOpts.accepts). Default: shimAccepts over the view. */
  accepts?: (action: Action, view: AiView) => boolean
  /** Called with every decision log (tests, client feed). */
  onLog?: (log: AiDecisionLog) => void
}

/** Answer plus its log; decideSync is the synchronous core used by tests and the bench. */
export interface OfficialDecision {
  action: Action
  log: AiDecisionLog
}
