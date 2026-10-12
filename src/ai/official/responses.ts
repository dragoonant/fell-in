// Responses and activity lists (spec 18 s3.3-3.8, s4; CH p11-16; AIRF). Each call plans ONE Action from the top of
// the list (re-walked before every Action, CH p16) and returns the concrete answer to the open decision.
import type { AiCardDef, EditionBundle } from '../../data/types'
import { todo } from '../../engine/registry'
import type { Action, Id, ModelState, PendingDecision } from '../../engine/types'
import type { AiView } from '../types'
import type { AiDecisionLog, AiResponse, AiSettings, ResolvedCell, ResolvedSubject } from './types'

/** Everything a response step needs for one decision. */
export interface ResponseCtx {
  view: AiView
  bundle: EditionBundle
  pending: PendingDecision
  legal: readonly Action[]
  me: ModelState
  card: AiCardDef
  cell: ResolvedCell
  settings: AiSettings
  subject: ResolvedSubject
  actionIndex: 0 | 1 | 'quick'
  accepts: (a: Action) => boolean
  /** Seeded tie-break / coin: deriveSeed(seed, key). */
  pickTie: (among: Id[], key: string) => Id
  coin: (key: string) => boolean
}

/** A planned step: the answer plus the log fields it fills (performed, chain, activity, weapon, target, ranking). */
export interface Planned {
  action: Action
  log: Pick<AiDecisionLog, 'performed' | 'chain' | 'activity'> & Partial<Pick<AiDecisionLog, 'weapon' | 'target' | 'ranking'>>
}

/** Dispatch on the Response to perform (starting from the printed one), applying the engaged rules first (CH p15). */
export function planAction(ctx: ResponseCtx): Planned {
  void ctx
  return todo('responses.planAction')
}

/** A: Close Combat list 1-7 or Ranged list 1-4 (CH p11-12); `only` restricts targets (Defeat Subject / Defend threat). */
export function attack(ctx: ResponseCtx, chain: string[], only?: readonly Id[]): Planned {
  void ctx; void chain; void only
  return todo('responses.attack')
}

/** M: within Move -> O; else toward the nearest Subject without engaging; Reckless direct, Careful >= half, safest (CH p13). */
export function move(ctx: ResponseCtx, chain: string[], subject?: ResolvedSubject): Planned {
  void ctx; void chain; void subject
  return todo('responses.move')
}

/** O: Defeat -> A (Subject only), Protect -> D, Go To -> M (onto the Subject), Use -> Interact/contact/M; else A (CH p13). */
export function objective(ctx: ResponseCtx, chain: string[]): Planned {
  void ctx; void chain
  return todo('responses.objective')
}

/** F: M toward the initial deployment point; at it, Careful improves cover else A without moving (CH p13; ERR p.16). */
export function fallBack(ctx: ResponseCtx, chain: string[]): Planned {
  void ctx; void chain
  return todo('responses.fallBack')
}

/** D: threat as if at the Subject, attack it only, else move toward the Subject; Careful ranged -> close (CH p14). */
export function defend(ctx: ResponseCtx, chain: string[]): Planned {
  void ctx; void chain
  return todo('responses.defend')
}

/** S: A only if it attacks or engages this activation, else M (ERR p.16). */
export function strike(ctx: ResponseCtx, chain: string[]): Planned {
  void ctx; void chain
  return todo('responses.strike')
}

/** Push Back follow-up (CH p15): charged -> yes; printed A -> close Method; printed O/D (and M/F, RULING) -> Reckless. */
export function followUpPushBack(printed: AiResponse, method: 'close' | 'ranged', reckless: boolean, charged: boolean): boolean {
  void printed; void method; void reckless; void charged
  return todo('responses.followUpPushBack')
}

/** Slide answer after an AI close combat attack: away from the Subject when the enemy could reach it (CH p15). */
export function slide(ctx: ResponseCtx): Action {
  void ctx
  return todo('responses.slide')
}
