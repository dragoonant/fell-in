// Checklist (owner T): MOVE, plus the movement half of CHG (charge path) and Push Back (CC-012, MOVE-010). Spec 11 s3-4, spec 14.
// Owns 'move.*' (Move, withdraw, climb/jump/fall, shake off Stun, put out fire). Geometry (sweeps, placement) lives in geometry.ts.
//
// Flow: the activation menu offers 'move.go'; resolving it raises 'move.path' with two option templates, 'move.to'
// (the chooser adds `path`: the waypoints after the model's current position) and 'move.cancel' (takes the Action back).
import type { Colour, EditionBundle } from '../data/types'
import { conditionMoveSteps, conditionSvMods, removeCondition } from './conditions'
import { applyDirectDamage, applyHit, removeModel } from './damage'
import { computeSv, quickActionMod, rollColourDie, skillTest } from './dice'
import { colourFor, colourShorter, recordOf, rulerColours, rulerInches, ruleObj } from './edition'
import { attrOf, unitOf } from './forces'
import {
  baseDiameter, baseOnTable, baseRadius, dist, isLegalPlacement, isOnTable, norm, overlapIntervals, sub, surfaceElevation, sweepFrom,
} from './geometry'
import { engagedWith } from './attack'
import { freeAttack } from './melee'
import { isRejection, option, pushEvents, raiseDecision, reject, updateModel, type ModuleDef, type StepResult } from './registry'
import { sameTeam } from './sides'
import { terrainPieces } from './terrain'
import { gainAp } from './turnflow'
import type { Action, DecisionOption, GameState, ModelId, Rejection, Vec2 } from './types'
export { sweepStraight, validateAdvancePath, findPlacementNear, isLegalPlacement } from './geometry'

export interface MoveOpts { quick?: boolean; charge?: boolean }

const EPS = 1e-6
const hasCond = (s: GameState, id: ModelId, c: string): boolean => !!s.models[id]?.conditions.includes(c)

/** Movement colour after Quick Action, Slow, Frozen and injuries (AP-002, COND-002/006): never below the shortest ruler. */
export function moveColour(state: GameState, bundle: EditionBundle, modelId: ModelId, opts: MoveOpts = {}): Colour {
  const u = unitOf(state, bundle, modelId)
  if (!u) return rulerColours(bundle)[0]!
  // MOVE-006: Slow and friends first, then the Quick Action step; one clamp at the shortest ruler gives the same result as stepwise clamping.
  const steps = conditionMoveSteps(state, bundle, modelId) + (opts.quick ? 1 : 0)
  return colourShorter(bundle, opts.charge ? u.charge : u.move, steps)
}

interface Walk { end: Vec2; inches: number; difficult: boolean; contacted: ModelId | null; colour: Colour; allowance: number }

/** Shared path walker for Move and Charge: blocking, difficult ground, allowance. */
function walk(
  state: GameState, bundle: EditionBundle, modelId: ModelId, path: Vec2[], opts: MoveOpts, stopAt?: ModelId,
): Walk | Rejection {
  const m = state.models[modelId]
  if (!m || !isOnTable(m)) return reject('E_BAD_PARAM', `${modelId} is not on the table.`)
  if (!Array.isArray(path) || path.length === 0 || path.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z))) {
    return reject('E_BAD_PARAM', 'A move needs at least one waypoint.')
  }
  const r = baseRadius(m.base)
  const friendly = Object.values(state.models).filter((o) => o.id !== m.id && sameTeam(state, o.owner, m.owner)).map((o) => o.id) // MOVE-003
  const pts = [m.pos, ...path]
  let used = 0, difficult = false, contacted: ModelId | null = null
  let end = m.pos
  for (let i = 1; i < pts.length && !contacted; i++) {
    const a = end, b = pts[i]!
    const l = dist(a, b)
    if (l < EPS) continue
    const dir = norm(sub(b, a))
    const sw = sweepFrom(state, m, a, dir, l, { passThrough: 'none', obstacles: 'ignore', ignoreIds: friendly, clampTable: false })
    for (const p of terrainPieces(state)) {
      if ((p.traits.rough || p.traits.move === 'obstacle') && overlapIntervals(p, a, dir, sw.travelled, r).length) difficult = true
    }
    if (sw.stoppedBy.kind === 'obstruction') return reject('E_PATH_BLOCKED', `Blocked by ${sw.stoppedBy.id}.`, { id: sw.stoppedBy.id })
    if (sw.stoppedBy.kind === 'model') {
      if (stopAt && sw.contacted === stopAt) { contacted = stopAt; end = sw.end; used += sw.travelled; break } // charge stops on contact
      return reject('E_PATH_BLOCKED', `Blocked by ${sw.stoppedBy.id}.`, { id: sw.stoppedBy.id }) // MOVE-002
    }
    end = b
    used += l
  }
  const u = unitOf(state, bundle, modelId)
  const colour0 = moveColour(state, bundle, modelId, opts)
  const eased = u?.flags.includes('unimpeded') // MOVE-005
  const colour = difficult && !eased ? colourShorter(bundle, colour0) : colour0 // MOVE-004
  const allowance = rulerInches(bundle, colour) + baseDiameter(m.base) // MOVE-001
  if (used > allowance + EPS) return reject('E_TOO_FAR', `That path is ${used.toFixed(2)} in; the limit is ${allowance.toFixed(2)} in.`, { used, allowance, colour })
  return { end, inches: used, difficult, contacted, colour, allowance }
}

/** The end point must be a legal spot: not overlapping bases or blocking terrain, and not on a marker (MOVE-012). */
function checkEnd(state: GameState, modelId: ModelId, end: Vec2, voluntaryExit: boolean): Rejection | null {
  const m = state.models[modelId]!
  const r = baseRadius(m.base)
  if (!baseOnTable(state, end, r)) return voluntaryExit ? null : reject('E_PLACEMENT', 'The base would leave the table.')
  const ok = isLegalPlacement(state, modelId, end, m.base)
  if (!ok.ok) return reject(ok.code ?? 'E_PLACEMENT', ok.message ?? 'Illegal end position.')
  if (state.markers.some((k) => !k.carriedBy && dist(k.pos, end) < r - EPS)) return reject('E_PLACEMENT', 'A model cannot end on a marker.')
  return null
}

/** Validate a path for a model; returns the end point and inches used, or a Rejection (E_TOO_FAR, E_PATH_BLOCKED, ...). */
export function validateMove(state: GameState, bundle: EditionBundle, modelId: ModelId, path: Vec2[], opts: MoveOpts = {}): { end: Vec2; inches: number } | Rejection {
  const w = walk(state, bundle, modelId, path, opts)
  if (isRejection(w)) return w
  const bad = checkEnd(state, modelId, w.end, true)
  return bad ?? { end: w.end, inches: w.inches }
}

/** Charge movement (CHG): up to the Charge colour into base contact with targetId, stopping on contact. Called by melee.ts. */
export function chargeMove(state: GameState, bundle: EditionBundle, modelId: ModelId, targetId: ModelId, path: Vec2[], opts: MoveOpts = {}): { state: GameState } | Rejection {
  const t = state.models[targetId]
  if (!t || !isOnTable(t)) return reject('E_BAD_TARGET', 'The charge target is not on the table.')
  // The last leg always runs at the target, so a charge needs no exact final waypoint.
  const w = walk(state, bundle, modelId, [...(path ?? []), t.pos], { ...opts, charge: true }, targetId)
  if (isRejection(w)) return w
  if (w.contacted !== targetId) return reject('E_OUT_OF_RANGE', 'The charge never reached the target.')
  const bad = checkEnd(state, modelId, w.end, false)
  if (bad) return bad
  const m = state.models[modelId]!
  return { state: updateModel(state, modelId, { pos: w.end, elev: surfaceElevation(state, w.end, m.base) }) }
}

/** Push Back (CC-012): straight away from `from`, up to `colour`; stops on models/blocking terrain; table edge = 1 damage (MOVE-010, via damage.applyDirectDamage). */
export function pushBack(state: GameState, bundle: EditionBundle, modelId: ModelId, from: Vec2, colour: Colour): { state: GameState; inches: number } {
  const m = state.models[modelId]
  if (!m || !isOnTable(m)) return { state, inches: 0 }
  const away = sub(m.pos, from)
  const dir = norm(Math.hypot(away.x, away.z) < EPS ? { x: 0, z: 1 } : away)
  const max = rulerInches(bundle, colour)
  const sw = sweepFrom(state, m, m.pos, dir, max, { passThrough: 'none', obstacles: 'stop' })
  let s = updateModel(state, modelId, { pos: sw.end, elev: surfaceElevation(state, sw.end, m.base) })
  if (sw.stoppedBy.kind === 'edge' && sw.travelled < max - EPS) {
    s = applyDirectDamage(s, bundle, modelId, 1, { type: 'physical', reason: 'pushed against the table edge' }).state
  }
  return { state: s, inches: sw.travelled }
}

// ---------- falling ----------
/** Armoured exoskeletons shrug falls off (MOVE-009). */
function hasPowerArmor(state: GameState, bundle: EditionBundle, modelId: ModelId): boolean {
  return (state.models[modelId]?.carried ?? []).some((c) => c.kind === 'armor' && !c.spent && !c.degraded && recordOf(bundle, 'armor', c.defId)?.kind === 'powerArmor')
}

/**
 * Resolve a fall of `distance` inches onto the model (MOVE-008, MOVE-013). A jump counts the fall one colour lower, and
 * Orange or less is free. A fall beyond the longest ruler removes the model. Power Armor ignores all of it.
 */
export function resolveFall(state: GameState, bundle: EditionBundle, modelId: ModelId, distance: number, jump: boolean): GameState {
  if (!alive(state, modelId) || hasPowerArmor(state, bundle, modelId)) return state
  const colours = rulerColours(bundle)
  const table = ruleObj<Record<string, number | string>>(bundle, 'fallingTable')
  let colour: Colour | null = colourFor(bundle, distance)
  if (jump) colour = colour ? colourShorter(bundle, colour) : colours[colours.length - 1]!
  if (!colour) return removeModel(state, bundle, modelId, 'fell too far')
  const value = table[colour]
  if (typeof value !== 'number') return removeModel(state, bundle, modelId, 'fell too far')
  if (jump && value === 0) return state
  const r = rollColourDie(state, bundle, 'black', 'fall', modelId)
  const s = pushEvents(r.state, [r.event])
  const dmg = r.die.icons.filter((i) => i === 'DMG').length
  const ar = r.die.icons.filter((i) => i === 'BOT').length
  return applyHit(s, bundle, { targetId: modelId, damage: [{ type: 'physical', value }], dmg, ar, cover: false }).state
}

const alive = (s: GameState, id: ModelId): boolean => { const m = s.models[id]; return !!m && isOnTable(m) }

// ---------- tests of agility ----------
function agiTest(state: GameState, bundle: EditionBundle, modelId: ModelId, purpose: string): { state: GameState; success: boolean } {
  const quick = !!state.action?.quick
  const mods = [...conditionSvMods(state, bundle, modelId), ...(quick ? [quickActionMod(bundle)] : [])]
  const { sv } = computeSv(attrOf(state, bundle, modelId, 'agi'), mods)
  const r = skillTest(state, bundle, { sv, purpose, ownerId: modelId })
  return { state: gainAp(pushEvents(r.state, r.events), r.test.ap), success: r.test.success }
}

// ---------- the Move action ----------
const movementTriggers = (id: ModelId) => [{ kind: 'action' as const, sourceId: id, movement: true }]

function moveTo(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.action
  const id = ctx?.modelId ?? state.activation?.modelId
  if (!id || !state.models[id]) return reject('E_BAD_PARAM', 'No model is moving.')
  const m = state.models[id]!
  const path = action.path as Vec2[]
  if (!Array.isArray(path) || path.length === 0 || !path.every((v) => v && Number.isFinite(v.x) && Number.isFinite(v.z))) {
    return reject('E_BAD_PARAM', 'A move needs a path: one or more {x, z} points.')
  }
  const w = walk(state, bundle, id, path, { quick: ctx?.quick })
  if (isRejection(w)) return w
  const r = baseRadius(m.base)
  const exits = !baseOnTable(state, w.end, r)
  const bad = checkEnd(state, id, w.end, true)
  if (bad) return bad
  const done = { modelId: id, type: 'move.to', triggers: movementTriggers(id) }
  const unit = unitOf(state, bundle, id)
  const startElev = m.elev
  const endElev = exits ? startElev : surfaceElevation(state, w.end, m.base)
  const climbing = endElev - startElev > EPS
  if (climbing && unit?.flags.includes('cannotClimb')) return reject('E_NOT_LEGAL', 'This model cannot climb.') // MOVE-007

  let s = state
  // Withdrawing (CC-009..011): each enemy left behind, engaged with nobody else, gets a free attack before the move.
  const before = engagedWith(s, id)
  if (before.length) {
    const after = engagedWith({ ...s, models: { ...s.models, [id]: { ...m, pos: w.end } } }, id)
    for (const foe of before.filter((x) => !after.includes(x))) {
      const f = s.models[foe]
      if (!f || !isOnTable(f) || hasCond(s, foe, 'stunned') || engagedWith(s, foe).some((x) => x !== id)) continue
      s = freeAttack(s, bundle, foe, id).state
      if (!alive(s, id)) return { state: s, done }
    }
  }
  if (exits) return { state: removeModel(s, bundle, id, 'left the table'), done } // MOVE-011
  // Climbing (MOVE-007): an Agility test; failing falls from where the climb began and ends the Action.
  if (climbing) {
    const t = agiTest(s, bundle, id, 'climb')
    s = t.state
    if (!t.success) return { state: resolveFall(s, bundle, id, endElev - startElev, false), done }
  }
  s = updateModel(s, id, { pos: w.end, elev: endElev })
  if (startElev - endElev > EPS) s = resolveFall(s, bundle, id, startElev - endElev, true) // MOVE-013
  return { state: s, done }
}

export const movement: ModuleDef = {
  id: 'movement',
  kinds: ['move'],
  options(state: GameState, _bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m || !isOnTable(m)) return []
    if (m.conditions.includes('stunned')) return [option('shakeOff', 'Shake off the stun', 'move.shakeOff')] // COND-007
    const out = [option('move', 'Move', 'move.go')]
    if (m.conditions.includes('onFire')) out.push(option('putOut', 'Put out the fire', 'move.putOut'))
    return out
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    const id = state.action?.modelId ?? state.activation?.modelId
    const model = id ? state.models[id] : undefined
    switch (action.type) {
      case 'move.go': {
        if (!id || !model) return reject('E_BAD_PARAM', 'No model is moving.')
        const quick = !!state.action?.quick
        const colour = moveColour(state, bundle, id, { quick })
        return {
          state: raiseDecision(state, {
            seat: model.owner, kind: 'move.path', canPass: false,
            context: { modelId: id, colour, inches: rulerInches(bundle, colour), baseInches: baseDiameter(model.base) },
            options: [option('to', 'Move here', 'move.to'), option('cancel', 'Cancel the move', 'move.cancel')],
          }),
        }
      }
      case 'move.to': return moveTo(state, bundle, action)
      case 'move.cancel': return id ? { state, done: { modelId: id, type: 'move.cancel', triggers: [] } } : reject('E_BAD_PARAM', 'No model is moving.')
      case 'move.shakeOff': {
        if (!id || !model) return reject('E_BAD_PARAM', 'No model is moving.')
        if (!model.conditions.includes('stunned')) return reject('E_CONDITION', 'The model is not stunned.')
        return { state: removeCondition(state, bundle, id, 'stunned'), done: { modelId: id, type: 'move.shakeOff', triggers: [{ kind: 'action', sourceId: id }] } }
      }
      case 'move.putOut': {
        if (!id || !model) return reject('E_BAD_PARAM', 'No model is moving.')
        if (!model.conditions.includes('onFire')) return reject('E_CONDITION', 'The model is not on fire.')
        const t = agiTest(state, bundle, id, 'putOut')
        const s = t.success ? removeCondition(t.state, bundle, id, 'onFire') : t.state
        return { state: s, done: { modelId: id, type: 'move.putOut', triggers: [{ kind: 'action', sourceId: id }] } }
      }
      default: return reject('E_NOT_LEGAL', `${action.type} is not a movement choice.`)
    }
  },
}
