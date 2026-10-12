// Checklist (owner A): SHOT RANGE COVER THR WPN CRIT LUCK (CHG BC CC live in melee.ts). Spec 11 s3, s7; 13; 14.
// Owns 'shoot.*' and 'throw.*'. Every roll goes through dice.ts; wounds go through damage.applyHit().
// Expose pure helpers so query.ts (integrator) never re-derives a number.
//
// This file also holds the attack pipeline shared with melee.ts (plan -> roll -> luck decisions -> hit/miss -> bookkeeping),
// parameterised by a namespace ('shoot' | 'throw' | 'melee') that names the pending kinds it raises ('<ns>.luck', ...).
import type { Colour, DicePool, DieColour, EditionBundle, Skill, WeaponDef, WeaponSpecial } from '../data/types'
import { DIE_COLOURS } from '../data/types'
import { addCondition, conditionSvMods } from './conditions'
import { applyDirectDamage, applyHit, type Hit } from './damage'
import {
  adjustResult, armorRoll, buildPool, computeSv, flipLuck, quickActionMod, rollEffectDice, scoreTest, skillOdds, skillTest,
  type IconTally, type SkillTestResult,
} from './dice'
import { diceDef, recordOf, ruleNum, rulerColours, rulerInches } from './edition'
import { attrOf, skillRow, unitOf } from './forces'
import {
  add, baseClass, baseDiameter, baseRadius, clampToTable, fromAngle, isOnTable, scale, segPointDist, sub,
} from './geometry'
import { carriedOf, itemMods } from './items'
import { hasLos, losReport } from './los'
import { modelDistance, modelsInCircle } from './measure'
import { pushBack } from './movement'
import {
  isRejection, option, pushEvents, raiseDecision, reject, updateModel, type ActionDone, type ModuleDef, type StepResult, type Trigger,
} from './registry'
import { roll } from './rng'
import { scenarioDefOf } from './scenario'
import { hostile, sameTeam } from './sides'
import { hitObject, markerById, shootableMarkers, withProbe } from './objects'
import { distToShape, segmentInsideIntervals, terrainPieces } from './terrain'
import type { AttackOpts, Band, CoverInfo, HitOdds, RangeInfo } from './query'
import type {
  Action, CarriedItem, DecisionOption, GameState, Id, Mod, ModelId, ModelState, Rejection, Vec2, WastelandCondition,
} from './types'

const EPS = 1e-6

export type AttackNs = 'shoot' | 'throw' | 'melee'
/** Data id of the always-available melee weapon (CC-001). */
export const IMPROVISED_ID = 'improvised-weapon'
export const improvisedUid = (modelId: ModelId): string => `${modelId}/${IMPROVISED_ID}`
const RANGED_SKILLS: readonly Skill[] = ['pistol', 'rifle', 'heavy', 'throw']

/** AttackOpts plus the flags only the attack pipeline needs. */
export interface AttackOptsEx extends AttackOpts {
  /** Make a Critical Attack (needs a full meter, CRIT-005). */
  critical?: boolean
  /** A free attack from withdrawal (CC-009): Quick Action penalty, no AP, no luck, not a trigger. */
  free?: boolean
  /** Close Combat against a scenario object in base contact: skips the engagement requirement (SHOT-003). */
  objectContact?: boolean
}

/** Everything needed to roll an attack, computed purely (the same object feeds query.hitOdds). */
export interface AttackPlan extends HitOdds {
  attackerId: ModelId
  /** The target model, or the marker id when `targetMarkerId` is set (scenario object, SHOT-003). */
  targetId: ModelId
  /** Set when the target is a scenario object (a MarkerState), not a model. */
  targetMarkerId?: Id
  weaponUid: string
  weaponId: string
  cover: CoverInfo
  /** Dice dropped by the per-colour cap (DICE-008). */
  dropped: Partial<Record<DieColour, number>>
  /** Base damage entries of the attack (the critical's when it is a Critical Attack). */
  damage: Hit['damage']
  /** Area colour of the damage, when the weapon has a blast (spec 14 s7). */
  area: Colour | null
  /** The target is engaged and the attacker is not: +SV and a victim roll on a hit (SHOT-006/007). */
  intoMelee: boolean
  quick: boolean
  reaction: boolean
  free: boolean
}

// ---------- engagement (canonical here; melee.ts re-exports) ----------
/** Opposing models in base contact with this model (engaged, spec 11 s4). */
export function engagedWith(state: GameState, modelId: ModelId): ModelId[] {
  const m = state.models[modelId]
  if (!m || !isOnTable(m)) return []
  return Object.values(state.models)
    .filter((o) => o.id !== modelId && hostile(state, o.owner, m.owner) && isOnTable(o) && modelDistance(m, o) <= EPS)
    .map((o) => o.id)
}
export const isEngaged = (state: GameState, modelId: ModelId): boolean => engagedWith(state, modelId).length > 0

// ---------- small lookups ----------
export interface WeaponRef { def: WeaponDef; item: CarriedItem | null }

/** A carried weapon (or the virtual Improvised Weapon) by instance uid; undefined when missing or spent. */
export function weaponRef(state: GameState, bundle: EditionBundle, modelId: ModelId, uid: string): WeaponRef | undefined {
  const m = state.models[modelId]
  if (!m) return undefined
  const item = m.carried.find((c) => c.uid === uid && c.kind === 'weapon')
  if (item) {
    if (item.spent) return undefined
    const def = recordOf(bundle, 'weapons', item.defId)
    return def ? { def, item } : undefined
  }
  if (uid === improvisedUid(modelId)) {
    const def = recordOf(bundle, 'weapons', IMPROVISED_ID)
    return def ? { def, item: null } : undefined
  }
  return undefined
}

/** Quick Action / Reaction / free flags of the Action being resolved for this model (state.action). */
export function actionFlags(state: GameState, modelId: ModelId, opts: AttackOptsEx = {}): { quick: boolean; reaction: boolean; free: boolean } {
  const a = state.action && state.action.modelId === modelId ? state.action : null
  const free = opts.free ?? a?.free ?? false
  return { quick: !!(opts.quick ?? a?.quick) || free, reaction: !!(opts.reaction ?? a?.reaction), free }
}

export const nameOf = (state: GameState, bundle: EditionBundle, id: ModelId): string => {
  const m = state.models[id]
  return (m && recordOf(bundle, 'units', m.profileId)?.name) || id
}

/** Models with a Critical icon (Heroic card or unit card) gain CP (CRIT-001). */
export function critCapable(state: GameState, bundle: EditionBundle, modelId: ModelId): boolean {
  const m = state.models[modelId]
  return !!m && (m.heroic || unitOf(state, bundle, modelId)?.critical === true)
}

const isTutorial = (state: GameState, bundle: EditionBundle): boolean => scenarioDefOf(state, bundle)?.mode === 'tutorial'

/** Rolls of the speciality bonus the attacker's card lists against this target (SKILL-006). */
function specialityMods(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId): Mod[] {
  const a = unitOf(state, bundle, attackerId), t = unitOf(state, bundle, targetId)
  if (!a || !t) return []
  return a.specialities
    .filter((s) => s.target === t.id || s.target === t.faction || t.types.some((x) => x === s.target) || s.target === t.versionGroup)
    .map((s) => ({ source: 'speciality', label: `Speciality: ${s.target}`, value: s.bonus, mode: 'add' as const }))
}

// ---------- range ----------
/** Range band of the target for a carried weapon (RANGE-*). Distances are base-edge gaps. */
export function rangeBandOf(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, weaponUid: string): RangeInfo {
  const A = state.models[attackerId], B = state.models[targetId]
  if (!A || !B) return { band: null, distance: Infinity }
  const d = modelDistance(A, B)
  const w = weaponRef(state, bundle, attackerId, weaponUid)
  if (!w || w.def.skill === 'melee') return { band: null, distance: d }
  const shortColour: Colour | null = w.def.short === 'throw' ? skillRow(state, bundle, attackerId, 'throw')?.colour ?? null : w.def.short ?? null
  if (!shortColour) return { band: null, distance: d, short: null, long: null }
  const longColour: Colour | null = w.def.short === 'throw' ? null : w.def.long ?? null
  const S = rulerInches(bundle, shortColour)
  const L = longColour ? rulerInches(bundle, longColour) : 0
  const inShort = d <= S + EPS
  // RULING (Long band membership): in long when the gap is within S+L and part of the base lies beyond S.
  const inLong = !!longColour && d <= S + L + EPS && d + baseDiameter(B.base) > S + EPS
  const band = inShort && inLong ? 'both' : inShort ? 'short' : inLong ? 'long' : null
  return { band, distance: d, short: shortColour, long: longColour }
}

// ---------- cover ----------
/** Cover of the target against the attacker, from los.ts/terrain.ts (COVER-*). */
export function coverOf(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId): CoverInfo {
  const A = state.models[attackerId], B = state.models[targetId]
  const none: CoverInfo = { cover: false, count: 0, svMods: [], armorBonus: 0, sources: [] }
  if (!A || !B) return none
  const rA = baseRadius(A.base), rB = baseRadius(B.base)
  const orange = rulerInches(bundle, rulerColours(bundle)[0]!)
  const elevated = A.elev - B.elev >= orange - EPS
  const sources: Id[] = []
  for (const p of terrainPieces(state)) {
    const line = p.traits.cover === 'cover'
    const area = !line && (p.traits.forest || p.traits.insideCover !== 'none')
    if (!line && !area) continue
    if (distToShape(A.pos, p.shape) <= rA + EPS) continue // COVER-002: cover the shooter touches is ignored
    const iv = segmentInsideIntervals(A.pos, B.pos, p.shape)
    if (!iv.length) continue
    // COVER-001/004: lines must be crossed fully (enter and exit); area terrain only needs to be entered.
    if (line && !iv.some(([t0, t1]) => t0 > EPS && t1 < 1 - EPS)) continue
    if (elevated && distToShape(B.pos, p.shape) - rB > orange + EPS) continue // COVER-007
    sources.push(p.t.id)
  }
  for (const o of Object.values(state.models)) {
    if (o.id === A.id || o.id === B.id || !isOnTable(o) || sameTeam(state, o.owner, A.owner)) continue // COVER-005
    const { d, t } = segPointDist(A.pos, B.pos, o.pos)
    if (!(d < baseRadius(o.base) - EPS && t > EPS && t < 1 - EPS)) continue
    if (baseClass(o.base) === 'huge' && !(o.base > B.base && modelDistance(B, o) > EPS)) continue // COVER-006
    sources.push(o.id)
  }
  if (!sources.length) return none
  const penalty = ruleNum(bundle, 'coverPenalty')
  return {
    cover: true, count: sources.length, sources,
    svMods: sources.map((s) => ({ source: 'cover', label: `Cover (${s})`, value: penalty, mode: 'add' as const })),
    armorBonus: ruleNum(bundle, 'coverArmorBonus'),
  }
}

// ---------- weapons ----------
/** Usable ranged/thrown weapon uids for a model right now (skill icon, not engaged, slow-firing loaded, ...). */
export function rangedWeapons(state: GameState, bundle: EditionBundle, modelId: ModelId, band?: Band): string[] {
  const m = state.models[modelId]
  if (!m || !isOnTable(m) || isEngaged(state, modelId)) return []
  if (band === 'melee') return []
  return carriedOf(state, modelId, 'weapon').filter((c) => {
    const def = recordOf(bundle, 'weapons', c.defId)
    if (!def || !RANGED_SKILLS.includes(def.skill) || def.mine) return false
    if (!skillRow(state, bundle, modelId, def.skill)) return false
    if (def.slowFiring && c.loaded === false) return false // SHOT-005
    if (def.heavy && state.activation?.modelId === modelId && state.activation.heavyFired) return false // SHOT-004
    if (band === 'long' && !def.long) return false
    if (band === 'short' && !def.short) return false
    return true
  }).map((c) => c.uid)
}

// ---------- plan building (shared with melee.ts) ----------
export interface PlanInput {
  attackerId: ModelId
  targetId: ModelId
  ref: WeaponRef
  weaponUid: string
  band: Band
  critical: boolean
  cover: CoverInfo
  intoMelee: boolean
  flags: { quick: boolean; reaction: boolean; free: boolean }
  /** Skill whose icon row supplies the SV when not the weapon's own (Super Mutants with ranged weapons in melee). */
  svSkill?: Skill
  extraMods?: Mod[]
  extraPools?: DicePool[]
}

/** Skill value with every modifier, the dice pool, and the exact odds (spec 13 s3, s7). */
export function composePlan(state: GameState, bundle: EditionBundle, p: PlanInput): AttackPlan | Rejection {
  const { def } = p.ref
  const row = skillRow(state, bundle, p.attackerId, p.svSkill ?? def.skill)
  if (!row || !skillRow(state, bundle, p.attackerId, def.skill)) return reject('E_NO_SKILL', `${nameOf(state, bundle, p.attackerId)} has no ${def.skill} icon.`)
  let base = attrOf(state, bundle, p.attackerId, row.attr)
  if (def.skillRoll) {
    base = attrOf(state, bundle, p.attackerId, def.skillRoll.attr)
    if (def.skillRoll.minusTargetAttr) base -= attrOf(state, bundle, p.targetId, def.skillRoll.minusTargetAttr)
  }
  const mods: Mod[] = [
    ...p.cover.svMods,
    ...(p.flags.quick ? [quickActionMod(bundle)] : []),
    ...conditionSvMods(state, bundle, p.attackerId),
    ...itemMods(state, bundle, p.attackerId, { purpose: 'sv', skill: def.skill, targetId: p.targetId }),
    ...specialityMods(state, bundle, p.attackerId, p.targetId),
    ...(p.extraMods ?? []),
  ]
  const { sv, breakdown } = computeSv(base, mods)
  const diceKey = p.band === 'melee' ? 'melee' : p.band
  const parts: (DicePool | undefined)[] = [def.dice[diceKey], p.critical ? def.critical?.extraDice : undefined, ...(p.extraPools ?? [])]
  const att = state.models[p.attackerId]!
  const { pool, dropped } = buildPool(bundle, parts, att.bonusDice)
  const damageSrc = p.critical && def.critical?.damage ? def.critical.damage : def.damage
  const odds = p.critical ? { pHit: 1, pHitAccurate: 1 } : skillOdds(bundle, sv, pool, { tutorial: isTutorial(state, bundle) })
  return {
    skill: def.skill, sv, breakdown, pool, band: p.band, pHit: odds.pHit,
    ...(att.luck > 0 && !p.critical ? { pHitAccurate: odds.pHitAccurate } : {}),
    critical: p.critical,
    attackerId: p.attackerId, targetId: p.targetId, weaponUid: p.weaponUid, weaponId: def.id,
    cover: p.cover, dropped,
    damage: damageSrc.map((d) => ({ type: d.type, value: d.value, ...(d.lowerOfPhysEnergy ? { lowerOfPhysEnergy: true } : {}) })),
    area: damageSrc.find((d) => d.area)?.area ?? null,
    intoMelee: p.intoMelee, quick: p.flags.quick, reaction: p.flags.reaction, free: p.flags.free,
  }
}

/** Checks a Critical Attack request against the weapon (CRIT-005/007). */
export function criticalProblem(state: GameState, bundle: EditionBundle, attackerId: ModelId, ref: WeaponRef, band: Band): Rejection | null {
  const crit = ref.def.critical
  if (!crit || !ref.item || ref.def.skill === 'throw') return reject('E_NOT_LEGAL', 'This weapon cannot make a Critical Attack.')
  if (!critCapable(state, bundle, attackerId)) return reject('E_NOT_LEGAL', 'Only models with a Critical icon make Critical Attacks.')
  if ((ref.item.cp ?? 0) < crit.rating) return reject('E_NOT_LEGAL', 'The Critical Meter is not full.')
  if (crit.restriction === 'shortOnly' && band !== 'short' && band !== 'melee') return reject('E_NOT_LEGAL', 'This critical works at short range only.')
  if (crit.restriction === 'longOnly' && band !== 'long') return reject('E_NOT_LEGAL', 'This critical works at long range only.')
  return null
}

/** Build the attack (skill, SV with every modifier, pool, band, critical). Rejection when illegal (no LoS, out of range, engaged, ...). */
export function attackPlan(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOptsEx = {}): AttackPlan | Rejection {
  const A = state.models[attackerId], B = state.models[targetId]
  if (!A || !B || !isOnTable(A) || !isOnTable(B) || attackerId === targetId) return reject('E_BAD_TARGET', 'Not a valid attacker and target.')
  if (isEngaged(state, attackerId)) return reject('E_ENGAGED', 'An engaged model can only make Close Combat attacks.') // SHOT-009
  const uid = opts.weaponUid ?? rangedWeapons(state, bundle, attackerId)[0]
  if (!uid) return reject('E_NO_ITEM', 'No usable ranged weapon.')
  const ref = weaponRef(state, bundle, attackerId, uid)
  if (!ref) return reject('E_NO_ITEM', `Weapon ${uid} is not carried or already used up.`)
  if (!RANGED_SKILLS.includes(ref.def.skill)) return reject('E_NOT_LEGAL', 'That is a melee weapon; use Close Combat.')
  if (!rangedWeapons(state, bundle, attackerId).includes(uid)) return reject('E_NOT_LEGAL', `${ref.def.name} cannot be used right now.`)
  const range = rangeBandOf(state, bundle, attackerId, targetId, uid)
  if (range.band === null) return reject('E_OUT_OF_RANGE', 'The target is out of range.', { distance: range.distance })
  const pick = (b: 'short' | 'long'): number => {
    const key = b
    const dice = ref.def.dice[key]
    return dice ? DIE_COLOURS.reduce((a, c) => a + (dice[c] ?? 0), 0) : 0
  }
  let band: 'short' | 'long'
  if (opts.band && opts.band !== 'melee') {
    if (range.band !== 'both' && range.band !== opts.band) return reject('E_OUT_OF_RANGE', `The target is not in the ${opts.band} band.`)
    band = opts.band
  } else band = range.band === 'both' ? (pick('long') > pick('short') ? 'long' : 'short') : range.band // RANGE-005: attacker chooses
  if (!losReport(state, attackerId, targetId).visible) return reject('E_NO_LOS', 'No line of sight to the target.')
  const critical = !!opts.critical
  if (critical) {
    const bad = criticalProblem(state, bundle, attackerId, ref, band)
    if (bad) return bad
  }
  const intoMelee = isEngaged(state, targetId)
  const flags = actionFlags(state, attackerId, opts)
  const mods: Mod[] = intoMelee ? [{ source: 'intoMelee', label: 'Target is tied up in close combat', value: ruleNum(bundle, 'intoMeleeBonus'), mode: 'add' }] : []
  return composePlan(state, bundle, {
    attackerId, targetId, ref, weaponUid: uid, band, critical, cover: coverOf(state, bundle, attackerId, targetId),
    intoMelee, flags, extraMods: mods,
  })
}

/** Legal (target, band) pairs for a weapon: range and line of sight only (cheap; no odds). */
export function legalTargets(state: GameState, bundle: EditionBundle, attackerId: ModelId, weaponUid: string): { targetId: ModelId; band: 'short' | 'long' }[] {
  const A = state.models[attackerId]
  if (!A || !isOnTable(A) || !rangedWeapons(state, bundle, attackerId).includes(weaponUid)) return []
  const out: { targetId: ModelId; band: 'short' | 'long' }[] = []
  for (const o of Object.values(state.models).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!hostile(state, o.owner, A.owner) || !isOnTable(o)) continue
    const r = rangeBandOf(state, bundle, attackerId, o.id, weaponUid)
    if (r.band === null || !hasLos(state, attackerId, o.id)) continue
    for (const b of r.band === 'both' ? (['short', 'long'] as const) : [r.band]) out.push({ targetId: o.id, band: b })
  }
  return out
}

/** Legal (object, band) pairs for a ranged weapon: shootable markers in range and in line of sight (SHOT-003). */
export function legalObjectTargets(state: GameState, bundle: EditionBundle, attackerId: ModelId, weaponUid: string): { markerId: Id; band: 'short' | 'long' }[] {
  const A = state.models[attackerId]
  if (!A || !isOnTable(A) || !rangedWeapons(state, bundle, attackerId).includes(weaponUid)) return []
  const out: { markerId: Id; band: 'short' | 'long' }[] = []
  for (const mk of shootableMarkers(state)) {
    const probed = withProbe(state, mk)
    const r = rangeBandOf(probed.state, bundle, attackerId, probed.probeId, weaponUid)
    if (r.band === null || !hasLos(probed.state, attackerId, probed.probeId)) continue
    for (const b of r.band === 'both' ? (['short', 'long'] as const) : [r.band]) out.push({ markerId: mk.id, band: b })
  }
  return out
}

/** Attack plan against a scenario object (no engagement, no dodge, armor from the marker; SHOT-003). */
export function objectAttackPlan(state: GameState, bundle: EditionBundle, attackerId: ModelId, markerId: Id, opts: AttackOptsEx = {}): AttackPlan | Rejection {
  const mk = markerById(state, markerId)
  if (!mk || !shootableMarkers(state).some((x) => x.id === markerId)) return reject('E_BAD_TARGET', 'That object cannot be shot.')
  const { state: probed, probeId } = withProbe(state, mk)
  const plan = attackPlan(probed, bundle, attackerId, probeId, opts)
  if (isRejection(plan)) return plan
  return { ...plan, targetId: markerId, targetMarkerId: markerId, intoMelee: false }
}

// ---------- special effects (WPN-007: each effect pays and fires at most once per Action) ----------
type Post =
  | { kind: 'cond'; c: WastelandCondition }
  | { kind: 'push'; colour: Colour }
  | { kind: 'removeReaction' }
  | { kind: 'ap'; n: number }
interface SpecialResult { dmg: number; ar: number; ignoreArmor: number; post: Post[] }

const OUTCOME_COND: Record<string, WastelandCondition> = {
  stun: 'stunned', fire: 'onFire', poison: 'poisoned', slow: 'slow', injuredArm: 'injuredArm', injuredLeg: 'injuredLeg',
}

/** Pay icons (BOT/STAR/BLAST) for each paid special in order; `auto` specials (primed use) need no icons. */
export function applySpecials(paid: readonly WeaponSpecial[], auto: readonly WeaponSpecial[], icons: IconTally): SpecialResult {
  const left: Record<string, number> = { BOT: icons.BOT, STAR: icons.STAR, BLAST: icons.BLAST }
  const res: SpecialResult = { dmg: 0, ar: 0, ignoreArmor: 0, post: [] }
  const fire = (sp: WeaponSpecial): void => {
    if (typeof sp.outcome !== 'string') return // {code} hooks: not wired yet
    const n = sp.n ?? 1
    switch (sp.outcome) {
      case 'armorDown': res.ar += n; break
      case 'extraDamage': res.dmg += n; break
      case 'ignoreArmor': res.ignoreArmor += n; break
      case 'addIcon': if (sp.icon) left[sp.icon] = (left[sp.icon] ?? 0) + n; break
      case 'gainAP': res.post.push({ kind: 'ap', n }); break
      case 'removeReaction': res.post.push({ kind: 'removeReaction' }); break
      case 'push': case 'throw': res.post.push({ kind: 'push', colour: sp.colour ?? 'orange' }); break
      default: { const c = OUTCOME_COND[sp.outcome]; if (c) res.post.push({ kind: 'cond', c }) }
    }
  }
  for (const sp of paid) {
    if (!sp.cost?.length) continue
    const need: Record<string, number> = {}
    for (const i of sp.cost) need[i] = (need[i] ?? 0) + 1
    if (!Object.entries(need).every(([i, n]) => (left[i] ?? 0) >= n)) continue
    for (const [i, n] of Object.entries(need)) left[i]! -= n
    fire(sp)
  }
  for (const sp of auto) fire(sp)
  return res
}

// ---------- hit victims (SHOT-007) ----------
/** Slot list for a hit into melee: target first, then models in contact with it that the shooter can see, looped to fill the slots. */
export function victimSlots(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId): ModelId[] {
  const t = state.models[targetId]!
  const contacts = Object.values(state.models)
    .filter((o) => o.id !== targetId && o.id !== attackerId && isOnTable(o) && modelDistance(t, o) <= EPS && hasLos(state, attackerId, o.id))
    .map((o) => o.id).sort()
  const list = [targetId, ...contacts]
  const slots = Math.max(...diceDef(bundle).armor)
  return Array.from({ length: slots }, (_, i) => list[i % list.length]!)
}

// ---------- the attack run ----------
interface RunCtx {
  ns: AttackNs
  plan: AttackPlan
  test: SkillTestResult
  tutorial: boolean
  /** Next luck stage to evaluate. */
  stage: 'accurate' | 'dodge' | 'crit' | 'done'
  noAttackerLuck: boolean
  extraCp: number
}

const actionType = (ns: AttackNs): string => (ns === 'melee' ? 'melee.attack' : `${ns}.fire`)
const bumpLuck = (s: GameState, id: ModelId): GameState => updateModel(s, id, { luck: Math.max(0, s.models[id]!.luck - 1) })

function patchItem(s: GameState, modelId: ModelId, uid: string, patch: Partial<CarriedItem>): GameState {
  const m = s.models[modelId]
  if (!m) return s
  return updateModel(s, modelId, { carried: m.carried.map((c) => (c.uid === uid ? { ...c, ...patch } : c)) })
}

/** Roll an attack, then walk the luck windows (pending decisions) and resolve it. */
export function startAttack(state: GameState, bundle: EditionBundle, ns: AttackNs, plan: AttackPlan): StepResult {
  const purpose = `${ns}:${plan.attackerId}>${plan.targetId}`
  const tutorial = isTutorial(state, bundle)
  let s = state
  let test: SkillTestResult
  if (plan.critical) {
    // CRIT-005: no skill die; the attack succeeds automatically and gains no CP.
    const fx = rollEffectDice(s, bundle, plan.pool, purpose, plan.attackerId)
    s = pushEvents(fx.state, fx.events)
    test = scoreTest({ sv: Math.max(plan.sv, 1), skillFace: null, value: 1, skillIcons: [], effect: fx.dice, acc: 0, resultMod: 0, rollIds: fx.events.map((e) => e.rollId) })
  } else {
    const r = skillTest(s, bundle, { sv: plan.sv, pool: plan.pool, purpose, ownerId: plan.attackerId, tutorial })
    s = pushEvents(r.state, r.events)
    test = r.test
  }
  const att = s.models[plan.attackerId]!
  if (att.bonusDice.length) s = updateModel(s, plan.attackerId, { bonusDice: [] })
  return advance(s, bundle, { ns, plan, test, tutorial, stage: 'accurate', noAttackerLuck: plan.free, extraCp: 0 })
}

function raiseLuck(state: GameState, ask: 'accurate' | 'dodge' | 'crit', run: RunCtx): GameState {
  const { plan, ns } = run
  const who = ask === 'dodge' ? plan.targetId : plan.attackerId
  const seat = state.models[who]!.owner
  const label = { accurate: 'Spend a luck token to aim better', dodge: 'Spend a luck token to dodge', crit: 'Spend a luck token to build the Critical Meter' }[ask]
  return raiseDecision(state, {
    seat, kind: `${ns}.luck`, canPass: false,
    context: { ask, run, attackerId: plan.attackerId, targetId: plan.targetId, result: run.test.result, sv: plan.sv, success: run.test.success },
    options: [
      option('use', label, `${ns}.luck`, { ask, use: true }, seat),
      option('keep', 'Keep the token', `${ns}.luck`, { ask, use: false }, seat),
    ],
  })
}

function advance(state: GameState, bundle: EditionBundle, run0: RunCtx): StepResult {
  const run = { ...run0 }
  const { plan, test } = run
  const A = state.models[plan.attackerId]!
  const B = plan.targetMarkerId ? undefined : state.models[plan.targetId]! // an object cannot dodge or earn a Critical (SHOT-003)
  if (run.stage === 'accurate') {
    run.stage = 'dodge'
    // LUCK-002: after a failed, non-X test (never a chosen failure).
    if (!plan.critical && !test.success && test.value !== 'X' && test.forced !== 'choseFail' && A.luck > 0 && !run.noAttackerLuck) {
      return { state: raiseLuck(state, 'accurate', run) }
    }
  }
  if (run.stage === 'dodge') {
    run.stage = 'crit'
    // LUCK-003: the target may dodge a successful attack, never a critical one.
    if (!plan.critical && test.success && B && B.luck > 0 && isOnTable(B)) return { state: raiseLuck(state, 'dodge', run) }
  }
  if (run.stage === 'crit') {
    run.stage = 'done'
    const ref = weaponRef(state, bundle, plan.attackerId, plan.weaponUid)
    const rating = ref?.def.critical?.rating
    if (!plan.critical && test.success && run.ns !== 'throw' && A.luck > 0 && !run.noAttackerLuck && rating !== undefined
      && (ref?.item?.cp ?? 0) < rating && critCapable(state, bundle, A.id) && B && hostile(state, A.owner, B.owner)) {
      return { state: raiseLuck(state, 'crit', run) }
    }
  }
  return finish(state, bundle, run)
}

/** Answer to a '<ns>.luck' decision (LUCK-002..006). */
export function resolveLuck(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const run = state.pending.context['run'] as RunCtx | undefined
  const ask = state.pending.context['ask'] as 'accurate' | 'dodge' | 'crit' | undefined
  if (!run || !ask || action.ask !== ask || typeof action.use !== 'boolean') return reject('E_BAD_PARAM', 'Malformed luck answer.')
  if (!action.use) return advance(state, bundle, run)
  const who = ask === 'dodge' ? run.plan.targetId : run.plan.attackerId
  if ((state.models[who]?.luck ?? 0) < 1) return reject('E_NOT_LEGAL', 'No luck token left.')
  const flip = flipLuck(state, `${run.ns}:luck:${ask}`, who)
  let s = pushEvents(bumpLuck(flip.state, who), [flip.event])
  const luck = ruleNum(bundle, 'luckBonus')
  const next: RunCtx = { ...run }
  if (ask === 'accurate') {
    next.noAttackerLuck = true // LUCK-006: one token per result
    if (flip.lucky) next.test = adjustResult(run.test, -luck, run.tutorial)
  } else if (ask === 'dodge') {
    if (flip.lucky) { next.test = adjustResult(run.test, luck, run.tutorial); next.noAttackerLuck = true }
  } else if (flip.lucky) next.extraCp = run.extraCp + 1
  s = pushEvents(s, [{ type: 'luck', ask, who, lucky: flip.lucky }])
  return advance(s, bundle, next)
}

/** Resolve the attack once the dice are settled: hit or miss, then bookkeeping and the Action's end (or melee's slide). */
function finish(state: GameState, bundle: EditionBundle, run: RunCtx): StepResult {
  const { plan, test, ns } = run
  let s = state
  const triggers: Trigger[] = []
  if (!plan.free) triggers.push({ kind: 'action', sourceId: plan.attackerId, targetId: plan.targetId, attack: true })
  const ref = weaponRef(s, bundle, plan.attackerId, plan.weaponUid)
  const A = s.models[plan.attackerId]!
  if (test.success) {
    const h = resolveHit(s, bundle, run)
    s = h.state
    if (!plan.free && !plan.targetMarkerId) {
      triggers.push({ kind: 'hit', sourceId: plan.attackerId, targetId: h.victimId, attack: true })
      if (h.tookDamage) triggers.push({ kind: 'damaged', sourceId: plan.attackerId, targetId: h.victimId, attack: true })
    }
  } else s = resolveMiss(s, bundle, run)
  s = pushEvents(s, [{ type: 'attack', ns, attackerId: plan.attackerId, targetId: plan.targetId, weaponId: plan.weaponId, success: test.success, critical: plan.critical, result: test.result, sv: plan.sv }])

  // ---- bookkeeping ----
  const hostileTarget = s.models[plan.targetId] ? hostile(s, s.models[plan.targetId]!.owner, A.owner) : false
  if (!plan.quick && !plan.reaction && !plan.free && test.ap > 0 && s.activation?.modelId === plan.attackerId) { // AP-004/005
    s = { ...s, activation: { ...s.activation, ap: s.activation.ap + test.ap } }
  }
  if (ref?.item && ref.def) {
    const patch: Partial<CarriedItem> = {}
    const rating = ref.def.critical?.rating
    if (plan.critical && rating !== undefined) patch.cp = Math.max(0, (ref.item.cp ?? 0) - rating) // CRIT-005
    else if (test.success && hostileTarget && ns !== 'throw' && rating !== undefined && critCapable(s, bundle, plan.attackerId)) {
      patch.cp = Math.min(rating, (ref.item.cp ?? 0) + 1 + test.cp + run.extraCp) // CRIT-002/004
    }
    if (ref.def.slowFiring) patch.loaded = false
    if (ref.def.limitedUse || ref.def.grenade) patch.spent = true
    if (ref.def.primed && (ref.item.primed ?? 0) >= ref.def.primed.tokens) {
      patch.primed = ref.def.primed.spend === 'all' ? 0 : Math.max(0, (ref.item.primed ?? 0) - ref.def.primed.spend)
    }
    s = patchItem(s, plan.attackerId, plan.weaponUid, patch)
    if (ref.def.limitedUse || ref.def.grenade) {
      if (s.action) s = { ...s, action: { ...s.action, itemUsed: true } }
    }
    if (ref.def.heavy && s.activation?.modelId === plan.attackerId) s = { ...s, activation: { ...s.activation, heavyFired: true } }
  }
  const done: ActionDone = { modelId: plan.attackerId, type: actionType(ns), triggers }
  if (ns === 'melee' && !plan.free) {
    const me = s.models[plan.attackerId]!
    // Charge markers are spent by the attack either way (CHG-006).
    s = updateModel(s, plan.attackerId, { chargeBonus: [], tokens: dropCharged(me.tokens) })
    const after = s.models[plan.attackerId]!
    if (isOnTable(after)) {
      const engagedBefore = engagedWith(s, plan.attackerId)
      return {
        state: raiseDecision(s, {
          seat: after.owner, kind: 'melee.slide', canPass: false,
          context: { modelId: plan.attackerId, engagedBefore, done },
          options: [option('slide', 'Slide after the attack (give a path), or stay put', 'melee.slide', { modelId: plan.attackerId })],
        }),
      }
    }
  }
  return { state: s, done }
}

/** Remove the "charged:<id>" bookkeeping keys from a token map. */
export function dropCharged(tokens: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(tokens).filter(([k]) => !k.startsWith('charged:')))
}

/** CHG-005: any Action other than the Close Combat attack discards Charge Bonus markers. */
export function discardChargeBonus(state: GameState, modelId: ModelId): GameState {
  const m = state.models[modelId]
  if (!m || (!m.chargeBonus.length && !Object.keys(m.tokens).some((k) => k.startsWith('charged:')))) return state
  return updateModel(state, modelId, { chargeBonus: [], tokens: dropCharged(m.tokens) })
}

function damageIcons(run: RunCtx): { dmg: number; ar: number } {
  return { dmg: run.test.icons.DMG, ar: run.test.icons.AR }
}

interface HitOutcome { state: GameState; victimId: ModelId; tookDamage: boolean }

function resolveHit(state: GameState, bundle: EditionBundle, run: RunCtx): HitOutcome {
  const { plan, ns } = run
  const ref = weaponRef(state, bundle, plan.attackerId, plan.weaponUid)
  const def = ref?.def
  let s = state
  // special effects: paid with the rolled icons; critical effects only on a Critical Attack; primed use is automatic
  const primedUsed = !!def?.primed && (ref?.item?.primed ?? 0) >= def.primed.tokens
  const fx = applySpecials(
    [...(def?.specials ?? []), ...(plan.critical ? def?.critical?.effects ?? [] : [])],
    primedUsed ? def!.primed!.onUse : [],
    run.test.icons,
  )
  // SHOT-007: a ranged hit into melee may land on someone else in the scrum.
  let victimId = plan.targetId
  if (plan.intoMelee && !plan.area && ns !== 'melee') {
    const slots = victimSlots(s, bundle, plan.attackerId, plan.targetId)
    const r = armorRoll(s, bundle, `${ns}:victim`, plan.attackerId)
    s = pushEvents(r.state, [r.event])
    victimId = slots[Math.min(slots.length, Math.max(1, r.value)) - 1] ?? plan.targetId
  }
  const icons = damageIcons(run)
  const targetExtra = victimId === plan.targetId ? def?.targetExtra?.damage ?? 0 : 0
  // ignoreArmor n: n points of the damage skip the armor roll (taken off the first entry, dealt directly afterwards).
  let direct = 0
  const damage = plan.damage.map((d) => ({ ...d }))
  if (fx.ignoreArmor > 0 && damage[0]) {
    direct = Math.min(fx.ignoreArmor, damage[0].value)
    damage[0].value -= direct
  }
  const baseHit: Omit<Hit, 'targetId' | 'cover'> = {
    attackerId: plan.attackerId, weaponUid: plan.weaponUid, damage, dmg: icons.dmg + fx.dmg + targetExtra, ar: icons.ar + fx.ar,
    ...(plan.critical ? { critical: true } : {}),
  }
  const cover = victimId === plan.targetId ? plan.cover.cover : coverOf(s, bundle, plan.attackerId, victimId).cover
  let tookDamage = false
  if (plan.targetMarkerId) { // SHOT-003: armor comes from the object's props; blast splash on an object is not modelled (RULING)
    const o = hitObject(s, bundle, plan.targetMarkerId, { attackerId: plan.attackerId, damage, dmg: baseHit.dmg, ar: baseHit.ar, direct })
    return { state: o.state, victimId, tookDamage: o.applied > 0 }
  }
  const hit = applyHit(s, bundle, { ...baseHit, targetId: victimId, cover })
  s = hit.state
  tookDamage = hit.report.tookDamage
  if (direct > 0 && isOnTable(s.models[victimId]!)) {
    const d = applyDirectDamage(s, bundle, victimId, direct, { reason: 'ignoreArmor' })
    s = d.state
    tookDamage = tookDamage || d.applied > 0
  }
  // blast: everyone else touched takes the damage separately, friend or foe (spec 14 s7)
  if (plan.area) {
    const centre = s.models[plan.targetId]!.pos
    const r = rulerInches(bundle, plan.area) / 2
    const near = modelsInCircle(s, centre, r).filter((o) => o.id !== victimId && o.id !== plan.targetId)
      .sort((a, b) => modelDistance(s.models[plan.targetId]!, a) - modelDistance(s.models[plan.targetId]!, b) || a.id.localeCompare(b.id))
    for (const o of near) {
      if (!hasLos(s, plan.targetId, o.id)) continue // LoS blockers stop the blast
      const c = coverOf(s, bundle, plan.targetId, o.id).cover
      const h = applyHit(s, bundle, { ...baseHit, dmg: icons.dmg + fx.dmg, targetId: o.id, cover: c })
      s = h.state
    }
  }
  // post-damage effects on the victim
  const v = s.models[victimId]
  if (v && isOnTable(v)) {
    for (const p of fx.post) {
      if (p.kind === 'cond') s = addCondition(s, bundle, victimId, p.c).state
      else if (p.kind === 'removeReaction') s = updateModel(s, victimId, { reaction: false })
      else if (p.kind === 'push') s = pushBack(s, bundle, victimId, s.models[plan.attackerId]!.pos, p.colour).state
      else if (p.kind === 'ap' && !plan.quick && !plan.reaction && !plan.free && s.activation?.modelId === plan.attackerId) {
        s = { ...s, activation: { ...s.activation, ap: s.activation.ap + p.n } }
      }
    }
  }
  return { state: s, victimId, tookDamage }
}

/** A failed attack: scatter weapons land somewhere else (THR-002, WPN-001/002). */
function resolveMiss(state: GameState, bundle: EditionBundle, run: RunCtx): GameState {
  const { plan, test, ns } = run
  const ref = weaponRef(state, bundle, plan.attackerId, plan.weaponUid)
  const def = ref?.def
  if (!def?.scatter || plan.critical || !plan.area) return state
  const B = state.models[plan.targetId]
  const A = state.models[plan.attackerId]
  if (!B || !A) return state
  // fail margin: X (or a chosen failure) uses the largest band
  const margin = test.result === null ? Infinity : test.result - plan.sv
  const bands = def.scatter
  const band = bands.find((b) => margin >= b.failBy[0] && (b.failBy[1] === null || margin <= b.failBy[1])) ?? bands[bands.length - 1]!
  const inches = rulerInches(bundle, band.colour)
  const r = roll(state, { count: 1, sides: 360, purpose: `${ns}:scatter`, ownerId: plan.attackerId })
  let s = pushEvents(r.state, [r.event])
  const dir = fromAngle(((r.event.dice[0]! - 1) * Math.PI) / 180)
  let landing = clampToTable(s, add(B.pos, scale(dir, inches)), 0)
  // collision: grenades check from the original target, other scatter from the firer
  const origin = def.grenade ? B.pos : A.pos
  let first = 1
  for (const p of terrainPieces(s)) {
    if (p.traits.move === 'none') continue
    const iv = segmentInsideIntervals(origin, landing, p.shape)[0]
    if (iv && iv[0] > EPS && iv[0] < first) first = iv[0]
  }
  if (first < 1) landing = add(origin, scale(sub(landing, origin), first))
  s = pushEvents(s, [{ type: 'scatter', ns, from: { ...B.pos }, to: landing, colour: band.colour }])
  // the effect lands there; target-only extras are lost (THR-005)
  const radius = rulerInches(bundle, plan.area) / 2
  const icons = damageIcons(run)
  const near = modelsInCircle(s, landing, radius).sort((a, b) => a.id.localeCompare(b.id))
  const baseHit = { attackerId: plan.attackerId, weaponUid: plan.weaponUid, damage: plan.damage.map((d) => ({ ...d })), dmg: icons.dmg, ar: icons.ar }
  for (const o of near) {
    if (!isOnTable(s.models[o.id]!)) continue
    s = applyHit(s, bundle, { ...baseHit, targetId: o.id, cover: false }).state
  }
  return s
}

// ---------- immediate (decision-free) attacks: free attacks from withdrawal ----------
/** Roll and resolve an attack without luck windows or a slide. Returns the new state (free attacks are not triggers, CC-010). */
export function resolveImmediate(state: GameState, bundle: EditionBundle, ns: AttackNs, plan: AttackPlan): GameState {
  const purpose = `${ns}:${plan.attackerId}>${plan.targetId}`
  const r = skillTest(state, bundle, { sv: plan.sv, pool: plan.pool, purpose, ownerId: plan.attackerId, tutorial: isTutorial(state, bundle) })
  let s = pushEvents(r.state, r.events)
  const run: RunCtx = { ns, plan, test: r.test, tutorial: false, stage: 'done', noAttackerLuck: true, extraCp: 0 }
  const res = finish(s, bundle, run)
  if (isRejection(res)) return s
  return res.state
}

// ---------- primed weapons ----------
/** Add one Primed token to each primed weapon of a model that allows it after an Action (WPN-005/009). Called by turnflow. */
export function gainPrimed(state: GameState, bundle: EditionBundle, modelId: ModelId, nonFriendlyInLos: boolean): GameState {
  const m = state.models[modelId]
  if (!m) return state
  let changed = false
  const carried = m.carried.map((c) => {
    const def = c.kind === 'weapon' ? recordOf(bundle, 'weapons', c.defId) : undefined
    const pr = def?.primed
    if (!pr || typeof pr.gain !== 'string') return c
    if (pr.gain === 'afterActionNonFriendlyInLos' && !nonFriendlyInLos) return c
    if ((c.primed ?? 0) >= pr.tokens) return c // never above the requirement
    changed = true
    return { ...c, primed: (c.primed ?? 0) + 1 }
  })
  return changed ? updateModel(state, modelId, { carried }) : state
}

// ---------- the module ----------
export const attack: ModuleDef = {
  id: 'attack',
  kinds: ['shoot', 'throw'],
  options(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m) return []
    const out: DecisionOption[] = []
    for (const uid of rangedWeapons(state, bundle, modelId)) {
      const ref = weaponRef(state, bundle, modelId, uid)
      if (!ref) continue
      const ns = ref.def.skill === 'throw' ? 'throw' : 'shoot'
      const targets = [...legalTargets(state, bundle, modelId, uid), ...legalObjectTargets(state, bundle, modelId, uid)]
      if (!targets.length) continue
      const verb = ns === 'throw' ? 'Throw' : 'Shoot'
      out.push(option(`${ns}:${uid}`, `${verb}: ${ref.def.name}`, `${ns}.begin`, { modelId, weaponUid: uid }, m.owner))
      for (const b of ['short', 'long'] as const) {
        if (ref.def.critical && criticalProblem(state, bundle, modelId, ref, b) === null && targets.some((t) => t.band === b)) {
          out.push(option(`${ns}:${uid}:crit:${b}`, `${verb} (critical, ${b}): ${ref.def.name}`, `${ns}.begin`, { modelId, weaponUid: uid, critical: true, band: b }, m.owner))
        }
      }
    }
    return out
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    const verb = action.type.split('.')[1]
    const ns: AttackNs = action.type.startsWith('throw.') ? 'throw' : 'shoot'
    if (verb === 'luck') return resolveLuck(state, bundle, action)
    if (verb === 'begin') {
      const modelId = String(action.modelId ?? '')
      const m = state.models[modelId]
      if (!m) return reject('E_BAD_PARAM', 'Unknown model.')
      if (m.owner !== action.seat) return reject('E_WRONG_SEAT', 'That model belongs to another seat.')
      const uid = String(action.weaponUid ?? '')
      if (!rangedWeapons(state, bundle, modelId).includes(uid)) return reject('E_NOT_LEGAL', 'That weapon cannot be used now.')
      const ref = weaponRef(state, bundle, modelId, uid)!
      if ((ref.def.skill === 'throw') !== (ns === 'throw')) return reject('E_BAD_PARAM', 'Wrong action for this weapon.')
      const critical = action.critical === true
      const wantBand = action.band === 'short' || action.band === 'long' ? action.band : undefined
      const flags = actionFlags(state, modelId)
      const targets = legalTargets(state, bundle, modelId, uid).filter((t) => !wantBand || t.band === wantBand)
      const rows: { id: string; targetId: ModelId; targetMarkerId?: Id; band: 'short' | 'long'; pHit: number; sv: number }[] = []
      for (const t of targets) {
        const plan = attackPlan(state, bundle, modelId, t.targetId, { weaponUid: uid, band: t.band, critical, ...flags })
        if (isRejection(plan)) continue
        rows.push({ id: `${t.targetId}:${t.band}`, targetId: t.targetId, band: t.band, pHit: plan.pHit, sv: plan.sv })
      }
      for (const t of legalObjectTargets(state, bundle, modelId, uid).filter((o) => !wantBand || o.band === wantBand)) {
        const plan = objectAttackPlan(state, bundle, modelId, t.markerId, { weaponUid: uid, band: t.band, critical, ...flags })
        if (isRejection(plan)) continue
        rows.push({ id: `${t.markerId}:${t.band}`, targetId: t.markerId, targetMarkerId: t.markerId, band: t.band, pHit: plan.pHit, sv: plan.sv })
      }
      if (!rows.length) return reject('E_BAD_TARGET', 'No legal target.')
      const s0 = discardChargeBonus(state, modelId) // CHG-005
      const options = rows.map((r) => option(
        r.id, `${ns === 'throw' ? 'Throw at' : 'Fire at'} ${r.targetMarkerId ? (markerById(s0, r.targetMarkerId)?.face ?? 'the object') : nameOf(s0, bundle, r.targetId)} (${r.band}, ${Math.round(r.pHit * 100)}%)`,
        `${ns}.target`, { modelId, weaponUid: uid, ...(r.targetMarkerId ? { targetMarkerId: r.targetMarkerId } : { targetId: r.targetId }), band: r.band, critical }, m.owner,
      ))
      return { state: raiseDecision(s0, { seat: m.owner, kind: `${ns}.target`, canPass: false, context: { modelId, weaponUid: uid, critical, targets: rows }, options }) }
    }
    if (verb === 'target') {
      const modelId = String(action.modelId ?? '')
      const m = state.models[modelId]
      if (!m || m.owner !== action.seat) return reject('E_WRONG_SEAT', 'That model belongs to another seat.')
      const band: 'short' | 'long' | undefined = action.band === 'short' || action.band === 'long' ? action.band : undefined
      const opts = { weaponUid: String(action.weaponUid ?? ''), band, critical: action.critical === true, ...actionFlags(state, modelId) }
      const plan = action.targetMarkerId !== undefined
        ? objectAttackPlan(state, bundle, modelId, String(action.targetMarkerId), opts)
        : attackPlan(state, bundle, modelId, String(action.targetId ?? ''), opts)
      if (isRejection(plan)) return plan
      return startAttack(state, bundle, ns, plan)
    }
    return reject('E_UNKNOWN_KIND', `Unknown ${ns} action ${action.type}.`)
  },
}

