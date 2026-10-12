// The action protocol (FROZEN at M2 foundations; docs/spec/00-architecture.md s1 and s10).
// Every rules module exports one ModuleDef. apply.ts validates an Action against the open PendingDecision, then hands it
// to the module that owns the pending kind's namespace (the text before the first '.', e.g. 'shoot' in 'shoot.target').
// Turnflow is the controller: it owns the activation menu, forwards a chosen menu action to the module that owns the
// action type's namespace, and runs afterAction() when a module reports its Action done.
import type { EditionBundle } from '../data/types'
import type { DiceRolled } from './rng'
import { raise } from './pending'
import type { Action, DecisionOption, GameEvent, GameState, ModelId, PendingDecision, Rejection, RejectionCode } from './types'
import { turnflow } from './turnflow'
import { movement } from './movement'
import { attack } from './attack'
import { melee } from './melee'
import { damage } from './damage'
import { conditions } from './conditions'
import { items } from './items'
import { scenario } from './scenario'

export type ModuleId = 'turnflow' | 'movement' | 'attack' | 'melee' | 'damage' | 'conditions' | 'items' | 'scenario'

/** What happened in a finished Action, for reactions and bookkeeping (PREP-007..015). */
export interface Trigger {
  /** 'action' = an opposing Action was taken; 'hit' = a model was hit by an attack; 'damaged' = a model took damage. */
  kind: 'action' | 'hit' | 'damaged'
  sourceId: ModelId
  targetId?: ModelId
  /** The Action moved the source (movement triggers reach two Awareness lengths). */
  movement?: boolean
  /** The Action was an attack (two Awareness lengths, no LoS needed for the attacked model). */
  attack?: boolean
}

/** A module reports this when the current Action (or Quick Action / Reaction) is completely resolved. */
export interface ActionDone {
  modelId: ModelId
  /** The action type that finished, e.g. 'shoot.fire'. */
  type: string
  triggers: Trigger[]
}

/**
 * Result of one resolve step: the new state, plus `done` when the Action finished. Without `done` the module must
 * have raised its own next decision (raiseDecision). With `done`, apply() calls the controller's afterAction().
 */
export type StepResult = { state: GameState; done?: ActionDone } | Rejection

export interface ModuleDef {
  id: ModuleId
  /** Namespaces this module owns, for both pending kinds and action types: 'shoot' owns 'shoot.*'. Disjoint across modules. */
  kinds: string[]
  /**
   * Main-menu entries this module offers the active model right now (e.g. Shoot, Charge, Use Expertise). Empty when
   * none is legal. Action types are '<namespace>.<verb>'; decisionId/seat are stamped by raiseDecision(). Never throws.
   */
  options(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[]
  /** Resolve one Action against this module's open decision (or a forwarded menu action). Bad input -> Rejection. */
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult
}

/** Turnflow's extra hook: after an Action, run reactions/triggers, then raise the next menu or end the activation. */
export interface Controller extends ModuleDef {
  afterAction(state: GameState, bundle: EditionBundle, done: ActionDone): GameState
}

// ---------- module table (built lazily: modules import this file, so nothing here runs at import time) ----------
let table: readonly ModuleDef[] | null = null
export function modules(): readonly ModuleDef[] {
  if (!table) {
    table = [turnflow, movement, attack, melee, damage, conditions, items, scenario]
    const seen = new Map<string, string>()
    for (const m of table) for (const k of m.kinds) {
      const prev = seen.get(k)
      if (prev) throw new Error(`registry: namespace "${k}" claimed by both ${prev} and ${m.id}`)
      seen.set(k, m.id)
    }
  }
  return table
}
export const controller = (): Controller => turnflow

/** Namespace of a kind or action type: the text before the first '.'. */
export const namespaceOf = (kindOrType: string): string => kindOrType.split('.')[0]!

/** Module owning a pending kind or an action type, or undefined. */
export function moduleFor(kindOrType: string): ModuleDef | undefined {
  const ns = namespaceOf(kindOrType)
  return modules().find((m) => m.kinds.includes(ns))
}

/** Every module's menu entries for a model, in table order (turnflow builds the activation menu from this). */
export function allOptions(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
  return modules().flatMap((m) => m.options(state, bundle, modelId))
}

// ---------- helpers every module uses ----------
export const isRejection = (r: unknown): r is Rejection =>
  typeof r === 'object' && r !== null && typeof (r as Rejection).code === 'string' && typeof (r as Rejection).message === 'string' && !('state' in r)

export const reject = (code: RejectionCode, message: string, detail?: Record<string, unknown>): Rejection =>
  detail ? { code, message, detail } : { code, message }

/** Thrown by unimplemented bodies. apply() turns it into an E_TODO rejection; anything else is a real bug. */
export class TodoError extends Error {
  constructor(what: string) { super(`TODO(M2): ${what}`); this.name = 'TodoError' }
}
export function todo(what: string): never { throw new TodoError(what) }

/**
 * Raise the one open decision and stamp its id and seat into every option's action (raise() alone does not).
 * Options are templates: a chosen action must carry every field of one option unchanged; extra fields are parameters
 * the owning module validates (e.g. a move destination). Must be given at least one option (legalActions never empty).
 */
export function raiseDecision(state: GameState, spec: Omit<PendingDecision, 'id'>): GameState {
  if (spec.options.length === 0) throw new Error(`raiseDecision(${spec.kind}): no options; legalActions must never be empty`)
  const { state: s, pending } = raise(state, spec)
  const seatOf = (a: Action) => (spec.seat === 'all' ? a.seat : spec.seat)
  const options = pending.options.map((o) => ({ ...o, action: { ...o.action, decisionId: pending.id, seat: seatOf(o.action) } }))
  return { ...s, pending: { ...pending, options } }
}

/** Build a menu option with a placeholder decisionId/seat (raiseDecision stamps them). */
export function option(id: string, label: string, type: string, fields: Record<string, unknown> = {}, seat = ''): DecisionOption {
  return { id, label, action: { ...fields, type, decisionId: '', seat } }
}

/** Append events (dice, damage, removals) to the game's event log. */
export function pushEvents(state: GameState, events: readonly (GameEvent | DiceRolled)[]): GameState {
  return events.length ? { ...state, events: [...state.events, ...events] } : state
}

/** Replace one model immutably. */
export function updateModel(state: GameState, id: ModelId, patch: Partial<GameState['models'][string]>): GameState {
  const m = state.models[id]
  if (!m) return state
  return { ...state, models: { ...state.models, [id]: { ...m, ...patch } } }
}
