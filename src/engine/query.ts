// Every number the UI shows comes from here (spec 00 s5; spec 13 s7). The client formats these and never recomputes
// them. SIGNATURES are frozen at M2 foundations; the bodies reuse the owners' pure helpers (attack.ts attackPlan/
// rangeBandOf/coverOf, melee.ts meleePlan, dice.ts skillOdds/poolJoint, damage.ts damageDistribution/healthOf/tokensOn),
// so a shown figure is the same plan the roll resolves against. An attack that is not legal now reports pHit 0, band null.
import type { Colour, DicePool, EditionBundle, Skill } from '../data/types'
import { attackPlan, coverOf, objectAttackPlan, engagedWith, rangeBandOf, rangedWeapons, weaponRef, type AttackPlan } from './attack'
import { damageDistribution, healthOf, tokensOn } from './damage'
import { poolJoint, skillOdds } from './dice'
import { isOnTable } from './geometry'
import { modelDistance } from './measure'
import { meleePlan, objectMeleePlan } from './melee'
import { healthLeft, inObjectContact, isMeleeable, markerTarget, objectDamageDistribution, withProbe } from './objects'
import { isRejection } from './registry'
import type { GameState, Id, ModelId, Mod, WastelandDamageType } from './types'

/** Which effect-dice set applies: a ranged band or the melee set. */
export type Band = 'short' | 'long' | 'melee'

export interface RangeInfo {
  /** Band the target is in; 'both' when its base sits in both and the attacker picks; null = out of range. */
  band: 'short' | 'long' | 'both' | null
  /** Base-edge distance in inches. */
  distance: number
  short?: Colour | null
  long?: Colour | null
}

export interface CoverInfo {
  /** The target has cover against this attacker (any amount). */
  cover: boolean
  /** Number of cover steps counted (each gives rules.coverPenalty to SV). */
  count: number
  /** SV modifiers from cover. */
  svMods: Mod[]
  /** Armor bonus for every damage type (rules.coverArmorBonus when in cover). */
  armorBonus: number
  /** Terrain ids or model ids granting it. */
  sources: Id[]
}

export interface AttackOpts {
  /** Carried weapon instance uid (CarriedItem.uid); default = the model's first usable weapon. */
  weaponUid?: string
  band?: Band
  quick?: boolean
  reaction?: boolean
  /** Armor-reduction icons already earned before the dice (Walked Fire shots 2+ on the same target, WPN-008); odds-only, the roll adds its own. */
  extraAr?: number
}

export interface HitOdds {
  skill: Skill
  sv: number
  /** Base value then each modifier (cover, quick action, injured arm, speciality, ...). */
  breakdown: Mod[]
  pool: DicePool
  band: Band | null
  /** P(hit), exact. */
  pHit: number
  /** P(hit) if a Luck Accurate flip is used after a failure (models with luck tokens). */
  pHitAccurate?: number
  critical: boolean
}

export interface DamageOdds {
  /** P(applied damage = i) given a hit, after armor (index = damage). */
  dist: number[]
  expected: number
  byType: { type: WastelandDamageType; expected: number }[]
}

/** The plan the attack would resolve with: close combat when the two are in base contact (or band 'melee'), else ranged. */
function planFor(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOpts): AttackPlan | null {
  const mk = markerTarget(state, targetId) // a scenario object named by its marker id (SHOT-003)
  if (mk) {
    const strike = opts.band === 'melee' || (opts.band === undefined && isMeleeable(mk) && inObjectContact(state, attackerId, mk) && !objectAttackPlanOk(state, bundle, attackerId, targetId, opts))
    const op = strike ? objectMeleePlan(state, bundle, attackerId, targetId, opts) : objectAttackPlan(state, bundle, attackerId, targetId, { ...opts, band: opts.band === 'melee' ? undefined : opts.band })
    return isRejection(op) ? null : op
  }
  const melee = opts.band === 'melee' || engagedWith(state, attackerId).includes(targetId)
  const band = opts.band === 'melee' ? undefined : opts.band
  const o = { ...opts, ...(band ? { band } : { band: undefined }) }
  const plan = melee ? meleePlan(state, bundle, attackerId, targetId, o) : attackPlan(state, bundle, attackerId, targetId, o)
  return isRejection(plan) ? null : plan
}

const objectAttackPlanOk = (state: GameState, bundle: EditionBundle, attackerId: ModelId, markerId: Id, opts: AttackOpts): boolean =>
  !isRejection(objectAttackPlan(state, bundle, attackerId, markerId, { ...opts, band: undefined }))

/** Joint (dmg, ar) outcomes on a hit for a plan (a Critical Attack always hits, so it is the bare pool). */
function onHitOf(bundle: EditionBundle, plan: AttackPlan): { dmg: number; ar: number; p: number }[] {
  const extra = plan.extraAr ?? 0 // WPN-008: Walked Fire streak icons
  if (plan.critical) return poolJoint(bundle, plan.pool).map((o) => ({ dmg: o.dmg, ar: o.ar + extra, p: o.p }))
  return skillOdds(bundle, plan.sv, plan.pool).onHit.map((o) => (extra ? { ...o, ar: o.ar + extra } : o))
}

const mean = (d: readonly number[]): number => d.reduce((a, p, i) => a + p * i, 0)

/** Exact hit chance for attacker vs target with a weapon (SKILL-009). */
export function hitOdds(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOpts = {}): HitOdds {
  const plan = planFor(state, bundle, attackerId, targetId, opts)
  if (!plan) {
    const uid = opts.weaponUid ?? rangedWeapons(state, bundle, attackerId)[0]
    const skill: Skill = (uid ? weaponRef(state, bundle, attackerId, uid)?.def.skill : undefined) ?? 'melee'
    return { skill, sv: 0, breakdown: [], pool: {}, band: null, pHit: 0, critical: false }
  }
  return {
    skill: plan.skill, sv: plan.sv, breakdown: plan.breakdown, pool: plan.pool, band: plan.band, pHit: plan.pHit,
    ...(plan.pHitAccurate !== undefined ? { pHitAccurate: plan.pHitAccurate } : {}), critical: plan.critical,
  }
}

/** Range band of the target for a weapon (RANGE-*). */
export function rangeBand(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, weaponUid?: string): RangeInfo {
  const uid = weaponUid ?? rangedWeapons(state, bundle, attackerId)[0]
  const mk = markerTarget(state, targetId)
  if (mk && uid) { const p = withProbe(state, mk); return rangeBandOf(p.state, bundle, attackerId, p.probeId, uid) }
  const A = state.models[attackerId], B = state.models[targetId]
  if (!uid || !A || !B) return { band: null, distance: A && B ? modelDistance(A, B) : Infinity }
  return rangeBandOf(state, bundle, attackerId, targetId, uid)
}

/** Cover the target has against the attacker (COVER-*). */
export function coverFor(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId): CoverInfo {
  const mk = markerTarget(state, targetId)
  if (mk) { const p = withProbe(state, mk); return coverOf(p.state, bundle, attackerId, p.probeId) }
  return coverOf(state, bundle, attackerId, targetId)
}

/** Damage distribution and expectation given a hit (spec 13 s7.2). */
export function expectedDamage(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOpts = {}): DamageOdds {
  const plan = planFor(state, bundle, attackerId, targetId, opts)
  if (!plan) return { dist: [1], expected: 0, byType: [] }
  const onHit = onHitOf(bundle, plan)
  const mk = markerTarget(state, targetId)
  if (mk) {
    const dist = objectDamageDistribution(bundle, mk, { damage: plan.damage, onHit })
    const types = [...new Set(plan.damage.map((d) => d.type))]
    const byType = types.map((type) => ({ type, expected: mean(objectDamageDistribution(bundle, mk, { damage: plan.damage.filter((d) => d.type === type), onHit })) }))
    return { dist, expected: mean(dist), byType }
  }
  const cover = plan.cover.cover
  const dist = damageDistribution(state, bundle, targetId, { damage: plan.damage, onHit, cover })
  const types = [...new Set(plan.damage.map((d) => d.type))]
  const byType = types.map((type) => ({
    type, expected: mean(damageDistribution(state, bundle, targetId, { damage: plan.damage.filter((d) => d.type === type), onHit, cover })),
  }))
  return { dist, expected: mean(dist), byType }
}

/** P(the attack removes the target) = P(hit and applied damage >= Health - tokens), incl. Power Armor (spec 13 s7.3). */
export function killOdds(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOpts = {}): number {
  const B = state.models[targetId]
  const plan = planFor(state, bundle, attackerId, targetId, opts)
  const mk = markerTarget(state, targetId)
  if (plan && mk) {
    const hp = healthLeft(mk)
    if (hp === null) return 0
    const { dist } = expectedDamage(state, bundle, attackerId, targetId, opts)
    return plan.pHit * dist.reduce((a, p, i) => (i >= hp ? a + p : a), 0)
  }
  if (!plan || !B || !isOnTable(B)) return 0
  // tokensOn counts tokens parked on an undegraded Power Armor card; healthOf includes its Health bonus.
  const left = healthOf(state, bundle, targetId) - tokensOn(bundle, B)
  if (left <= 0) return plan.pHit
  const { dist } = expectedDamage(state, bundle, attackerId, targetId, opts)
  const pKill = dist.reduce((a, p, i) => (i >= left ? a + p : a), 0)
  return plan.pHit * pKill
}

export { objectiveStatus, type ObjectiveLine, type ObjectiveStatus } from './scenarios/status'
