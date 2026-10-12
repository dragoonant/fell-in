// Checklist (owner D): COND (and the condition parts of RAD). Spec 15 s5; spec 11 s2 (activation start order).
// Owns 'cond.*'. Conditions are ModelState.conditions entries drawn from WASTELAND_CONDITIONS; at most one of each (COND-001).
import type { Effect, EditionBundle } from '../data/types'
import { applyDirectDamage, ruleOr } from './damage'
import { ruleNum } from './edition'
import { flipLuck } from './dice'
import { unitOf } from './forces'
import { pushEvents, reject, updateModel, type ModuleDef, type StepResult } from './registry'
import type { Action, DecisionOption, GameState, Mod, ModelId, ModelState, WastelandCondition } from './types'

/** Foundations-implemented: does the model hold this condition? */
export const hasCondition = (m: Pick<ModelState, 'conditions'>, c: WastelandCondition): boolean => m.conditions.includes(c)

/** Damage steps per tick of On Fire and Poisoned come from rules.json when present (spec 15 s5 says 1). */
const fireDamage = (b: EditionBundle): number => ruleOr(b, 'onFireDamage', 1)
const poisonDamage = (b: EditionBundle): number => ruleOr(b, 'poisonDamage', 1)

/** Unit abilities may carry `{code: 'conditionImmune' | 'conditionResistant', args: {condition}}` (hook names for data). */
function abilityCodes(state: GameState, bundle: EditionBundle, modelId: ModelId, code: string, c: WastelandCondition): boolean {
  const unit = unitOf(state, bundle, modelId)
  if (!unit) return false
  const effects: Effect[] = unit.abilities.flatMap((a) => a.effects ?? [])
  return effects.some((e) => 'code' in e && e.code === code && (e.args as { condition?: string } | undefined)?.condition === c)
}

/** Robots are immune to Poisoned (spec 15 s5); abilities can grant more. */
export function isImmune(state: GameState, bundle: EditionBundle, modelId: ModelId, c: WastelandCondition): boolean {
  const unit = unitOf(state, bundle, modelId)
  if (c === 'poisoned' && unit?.types.includes('robot')) return true
  return abilityCodes(state, bundle, modelId, 'conditionImmune', c)
}

/** Add a condition: one of each (COND-001), On Fire/Frozen replace each other (COND-004), Resistant flips (COND-009), Immune never. */
export function addCondition(state: GameState, bundle: EditionBundle, modelId: ModelId, c: WastelandCondition): { state: GameState; added: boolean } {
  const m = state.models[modelId]
  if (!m || m.life === 'dead' || isImmune(state, bundle, modelId, c) || hasCondition(m, c)) return { state, added: false }
  let s = state
  if (abilityCodes(state, bundle, modelId, 'conditionResistant', c)) {
    const f = flipLuck(s, `resist:${c}`, modelId)
    s = pushEvents(f.state, [f.event])
    if (!f.lucky) return { state: s, added: false }
  }
  const cur = s.models[modelId]!.conditions
  const replaced = c === 'onFire' ? 'frozen' : c === 'frozen' ? 'onFire' : null
  const conditions = [...cur.filter((x) => x !== replaced), c]
  return { state: pushEvents(updateModel(s, modelId, { conditions }), [{ type: 'conditionAdded', modelId, condition: c }]), added: true }
}

export function removeCondition(state: GameState, _bundle: EditionBundle, modelId: ModelId, c: WastelandCondition): GameState {
  const m = state.models[modelId]
  if (!m || !hasCondition(m, c)) return state
  return pushEvents(updateModel(state, modelId, { conditions: m.conditions.filter((x) => x !== c) }), [{ type: 'conditionRemoved', modelId, condition: c }])
}

/** SV modifiers from the model's own conditions (Frozen, Injured Arm), from rules constants (COND-002/006). */
export function conditionSvMods(state: GameState, bundle: EditionBundle, modelId: ModelId): Mod[] {
  const m = state.models[modelId]
  if (!m) return []
  const out: Mod[] = []
  if (hasCondition(m, 'frozen')) out.push({ source: 'frozen', label: 'Frozen', value: ruleNum(bundle, 'frozenPenalty'), mode: 'add' })
  if (hasCondition(m, 'injuredArm')) out.push({ source: 'injuredArm', label: 'Injured Arm', value: ruleNum(bundle, 'injuredArmPenalty'), mode: 'add' })
  return out
}

/** Ruler steps shorter for all movement (Slow, Frozen, Injured Leg -> Slow) (COND-002/006). Slow and Injured Leg count once together. */
export function conditionMoveSteps(state: GameState, _bundle: EditionBundle, modelId: ModelId): number {
  const m = state.models[modelId]
  if (!m) return 0
  return (hasCondition(m, 'frozen') ? 1 : 0) + (hasCondition(m, 'slow') || hasCondition(m, 'injuredLeg') ? 1 : 0)
}

/** Activation start, step 2 (spec 11 s2): On Fire damage then luck flip, Poisoned damage. Calls damage.applyDirectDamage. */
export function startOfActivation(state: GameState, bundle: EditionBundle, modelId: ModelId): GameState {
  let s = state
  if (hasCondition(s.models[modelId]!, 'onFire')) {
    const r = applyDirectDamage(s, bundle, modelId, fireDamage(bundle), { type: 'physical', strongBlocks: true, reason: 'onFire' })
    s = r.state
    if (r.removed) return s
    const f = flipLuck(s, 'onFire', modelId)
    s = pushEvents(f.state, [f.event])
    if (f.lucky) s = removeCondition(s, bundle, modelId, 'onFire')
  }
  if (hasCondition(s.models[modelId]!, 'poisoned')) {
    s = applyDirectDamage(s, bundle, modelId, poisonDamage(bundle), { type: 'physical', reason: 'poison' }).state
  }
  return s
}

/** Activation end: Frozen ends (COND-002). */
export function endOfActivation(state: GameState, bundle: EditionBundle, modelId: ModelId): GameState {
  return removeCondition(state, bundle, modelId, 'frozen')
}

export const conditions: ModuleDef = {
  id: 'conditions',
  kinds: ['cond'],
  options(_state: GameState, _bundle: EditionBundle, _modelId: ModelId): DecisionOption[] {
    return []
  },
  resolve(state: GameState, _bundle: EditionBundle, action: Action): StepResult {
    // Putting out fire is a Move Action handled by movement; no 'cond.*' decision is raised yet.
    return reject('E_UNKNOWN_KIND', `no condition decision is open (${action.type} vs ${state.pending.kind})`)
  },
}
