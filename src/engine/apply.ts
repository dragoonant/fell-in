// apply(): the single entry point that advances a game (spec 00 s3). Pure; never throws on bad input.
// 1. game over / stale decision id / wrong seat / not matching any legal option -> Rejection, state unchanged.
// 2. dispatch to the module owning state.pending.kind's namespace (registry.ts).
// 3. a step that reports `done` goes through the controller's afterAction() (reactions, next menu, end of activation).
// 4. the accepted action is appended to state.log (modules never append it themselves).
import type { EditionBundle } from '../data/types'
import { controller, isRejection, moduleFor, reject, TodoError } from './registry'
import type { Action, GameState, Rejection } from './types'

export type ApplyResult = { ok: true; state: GameState } | { ok: false; state: GameState; rejection: Rejection }

const RESERVED = new Set(['decisionId', 'seat'])

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object), kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** An action matches an option template when it carries every template field unchanged (extra fields are parameters). */
export function matchesOption(action: Action, template: Action): boolean {
  if (action.type !== template.type) return false
  for (const [k, v] of Object.entries(template)) {
    if (RESERVED.has(k)) continue
    if (!deepEqual(action[k], v)) return false
  }
  return true
}

export function apply(state: GameState, bundle: EditionBundle, action: Action): ApplyResult {
  const no = (rejection: Rejection): ApplyResult => ({ ok: false, state, rejection })
  if (state.phase === 'over') return no(reject('E_GAME_OVER', 'The game is over.'))
  const p = state.pending
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return no(reject('E_BAD_PARAM', 'Malformed action.'))
  if (action.decisionId !== p.id) return no(reject('E_STALE_DECISION', `Decision ${String(action.decisionId)} is not the open one (${p.id}).`))
  if (p.seat !== 'all' ? action.seat !== p.seat : !(action.seat in state.seats)) {
    return no(reject('E_WRONG_SEAT', `Seat ${String(action.seat)} cannot answer this decision.`))
  }
  if (!p.options.some((o) => matchesOption(action, o.action))) return no(reject('E_NOT_LEGAL', `${action.type} is not a legal choice here.`))
  const mod = moduleFor(p.kind)
  if (!mod) return no(reject('E_UNKNOWN_KIND', `No rules module owns decision kind "${p.kind}".`))
  try {
    const r = mod.resolve(state, bundle, action)
    if (isRejection(r)) return no(r)
    let next = r.state
    if (r.done) next = controller().afterAction(next, bundle, r.done)
    return { ok: true, state: { ...next, log: [...state.log, action] } }
  } catch (e) {
    if (e instanceof TodoError) return no(reject('E_TODO', e.message))
    throw e
  }
}
