// Official AI targeting (spec 18 s8.5, s8.7): valid targets by attitude, weapon choice, and the card's ordered
// target-priority factors. Every number comes from engine query.* (through ai/odds) on the view's shim.
import type { AiCardDef } from '../../data/types'
import { engagedWith, rangedWeapons, weaponRef } from '../../engine/attack'
import { armorOf, healthOf, tokensOn } from '../../engine/damage'
import { recordOf } from '../../engine/edition'
import { modelDistance, modelToPoint } from '../../engine/measure'
import { ccWeapons } from '../../engine/melee'
import type { ModelId, WastelandDamageType } from '../../engine/types'
import * as odds from '../odds'
import { dist, enemiesOf, live } from '../world'
import { FACTOR_ALIASES, TARGET_FACTORS, type Attitude, type CombatMethod, type OfficialContext, type RankOpts, type TargetFactor, type TargetRanking } from './types'

/** Map a printed priority name onto a factor (aliases, case and spaces ignored); null = unknown (ignored, traced). */
export function normalizeFactor(name: string): TargetFactor | null {
  const k = name.trim().toLowerCase()
  if (FACTOR_ALIASES[k]) return FACTOR_ALIASES[k]!
  const compact = k.replace(/[\s_-]+/g, '')
  return (TARGET_FACTORS as readonly string[]).find((f) => f.toLowerCase() === compact) as TargetFactor | undefined ?? null
}

const healthLeftOf = (ctx: OfficialContext, id: ModelId): number => {
  const m = ctx.view.models[id]
  return m ? Math.max(0, healthOf(ctx.q, ctx.bundle, id) - tokensOn(ctx.bundle, m)) : 0
}

/** Damage type of the weapon a ranking uses (physical when unknown, R-20). */
function damageTypeOf(ctx: OfficialContext, attackerId: ModelId, weaponUid?: string): WastelandDamageType {
  const ref = weaponUid ? weaponRef(ctx.q, ctx.bundle, attackerId, weaponUid) : undefined
  const t = ref?.def.damage[0]?.type
  return t === 'energy' || t === 'radiation' ? t : 'physical'
}

/** Position of the Subject for Importance (model or marker id), if any. */
function subjectPos(ctx: OfficialContext, subjectId: string | undefined) {
  if (!subjectId) return null
  const m = ctx.view.models[subjectId]
  if (m) return m.pos
  return ctx.view.markers?.find((k) => k.id === subjectId)?.pos ?? null
}

/** Sort key of one factor for one candidate (lower ranks first). */
export function factorKey(ctx: OfficialContext, factor: TargetFactor, attackerId: ModelId, targetId: ModelId, opts: RankOpts = {}): number {
  const A = ctx.view.models[attackerId], T = ctx.view.models[targetId]
  if (!A || !T) return 0
  switch (factor) {
    case 'nearest': return opts.from ? modelToPoint(T, opts.from) : modelDistance(A, T)
    case 'vulnerable': {
      const r = armorOf(ctx.q, ctx.bundle, targetId, damageTypeOf(ctx, attackerId, opts.weaponUid))
      return r.immune ? 99 : r.has ? r.base : 0 // Strong ignored (ERR p.16)
    }
    case 'leader': return T.leaderId ? 0 : 1
    case 'importance': {
      if (opts.subject) {
        if (opts.subject.models.includes(targetId)) return 1e9 // the Subject itself is excluded (ERR p.16)
        return opts.subject.points.length ? Math.min(...opts.subject.points.map((p) => modelToPoint(T, p))) : 0
      }
      if (opts.subjectId === targetId) return 1e9
      const p = subjectPos(ctx, opts.subjectId)
      return p ? modelToPoint(T, p) : 0
    }
    case 'prepared': return T.reaction ? 0 : 1
    case 'wounded': return -(T.damage + T.rad)
    case 'weakest': return healthLeftOf(ctx, targetId)
    case 'healthiest': return -healthLeftOf(ctx, targetId)
    case 'largest': return -(T.base * 1000 + healthOf(ctx.q, ctx.bundle, targetId))
    case 'highest': return -T.rad
    case 'capable': {
      try {
        const h = odds.hitOdds(ctx.q, ctx.bundle, targetId, attackerId)
        return -(h.pHit * odds.expectedDamage(ctx.q, ctx.bundle, targetId, attackerId).expected)
      } catch { return 0 }
    }
    case 'bestChance': {
      try { return -odds.hitOdds(ctx.q, ctx.bundle, attackerId, targetId, opts.weaponUid ? { weaponUid: opts.weaponUid } : {}).pHit } catch { return 0 }
    }
  }
}

/** True when an enemy is in base contact with a model of the AI seat. */
export const engagedWithFriendly = (ctx: OfficialContext, enemyId: ModelId): boolean =>
  engagedWith(ctx.q, enemyId).some((id) => ctx.view.models[id]?.owner === ctx.seat)

/** Charge candidates: the menu's charge.go rows during the model's activation menu, else enemies inside Move + Charge. */
function chargeTargets(ctx: OfficialContext, attackerId: ModelId): ModelId[] {
  const rows = ctx.legal.filter((a) => a.type === 'charge.go' && a.modelId === attackerId).map((a) => String(a.targetId))
  if (ctx.pending.kind === 'turn.activation') return [...new Set(rows)]
  const A = ctx.view.models[attackerId]
  const unit = A ? recordOf(ctx.bundle, 'units', A.profileId) : undefined
  if (!A || !unit) return []
  const reach = 12
  return enemiesOf(ctx.view, ctx.seat).filter((e) => dist(e.pos, A.pos) <= reach).map((e) => e.id)
}

/** Enemies this model may attack with this method (ranged Careful excludes enemies engaged with a friendly, R2 #9). */
export function validTargets(ctx: OfficialContext, attackerId: ModelId, attitude: Attitude, method: CombatMethod): ModelId[] {
  const A = ctx.view.models[attackerId]
  if (!A || !live(A)) return []
  const foes = enemiesOf(ctx.view, ctx.seat)
  let out: ModelId[]
  if (method === 'ranged') {
    const uids = rangedWeapons(ctx.q, ctx.bundle, attackerId)
    out = foes.filter((e) => uids.some((uid) => {
      try { return odds.hitOdds(ctx.q, ctx.bundle, attackerId, e.id, { weaponUid: uid }).pHit > 0 } catch { return false }
    })).map((e) => e.id)
  } else {
    const mine = engagedWith(ctx.q, attackerId)
    if (mine.length) return mine // an engaged model fights who it is touching
    out = chargeTargets(ctx, attackerId).filter((id) => ctx.view.models[id] && live(ctx.view.models[id]))
  }
  // The Careful filter is printed under the ranged list only (R2 #9); a Careful close fighter PREFERS engaged enemies (FC p1).
  if (attitude === 'careful' && method === 'ranged') out = out.filter((id) => !engagedWithFriendly(ctx, id))
  return out
}

/** Candidates engaged with exactly one friendly (the card's usual preferFirst set, ERR p.16). */
function engagedWithOne(ctx: OfficialContext, id: ModelId): boolean {
  return engagedWith(ctx.q, id).filter((o) => ctx.view.models[o]?.owner === ctx.seat).length === 1
}

/** Rank candidates by the card's list, preferFirst set first; a final tie goes to the seeded RNG. */
export function rankTargets(ctx: OfficialContext, card: AiCardDef, attackerId: ModelId, candidates: readonly ModelId[], opts: RankOpts = {}): TargetRanking {
  const factors = card.targetPriority.map(normalizeFactor).filter((f): f is TargetFactor => f !== null)
  const ignored = card.targetPriority.filter((n) => normalizeFactor(n) === null)
  const preferred = new Set(opts.preferred ?? (card.preferFirst ? candidates.filter((c) => engagedWithOne(ctx, c)) : []))
  const rows = candidates.map((id) => ({ id, keys: factors.map((f) => factorKey(ctx, f, attackerId, id, opts)), preferred: preferred.has(id) }))
  const cmp = (a: typeof rows[number], b: typeof rows[number]): number => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    for (let i = 0; i < a.keys.length; i++) if (Math.abs(a.keys[i]! - b.keys[i]!) > 1e-9) return a.keys[i]! - b.keys[i]!
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
  rows.sort(cmp)
  // Ties: everyone equal to the leader on preference and every key; pick one with the seeded stream (traced).
  const same = (a: typeof rows[number], b: typeof rows[number]) => a.preferred === b.preferred && a.keys.every((k, i) => Math.abs(k - b.keys[i]!) <= 1e-9)
  const tied = rows.length ? rows.filter((r) => same(r, rows[0]!)) : []
  let tie: ModelId[] | null = null
  if (tied.length > 1) {
    tie = tied.map((r) => r.id)
    const idx = Math.floor(ctx.roll('tie', `${ctx.pending.id}:${attackerId}`)() * tied.length)
    const pick = tied[idx]!
    rows.splice(rows.indexOf(pick), 1)
    rows.unshift(pick)
    ctx.trace.entries.push({ kind: 'tie', purpose: 'target', among: tie, picked: pick.id })
  }
  const ranking: TargetRanking = { factors, ignored, ranked: rows, tie }
  ctx.trace.entries.push({ kind: 'ranking', modelId: attackerId, ranking })
  return ranking
}

/** Best weapon uid for an attack (expected damage; Improvised only as a last resort, ERR p.16). */
export function bestWeapon(ctx: OfficialContext, attackerId: ModelId, targetId: ModelId, method: CombatMethod, skip?: (uid: string) => boolean): string | null {
  const uids = (method === 'ranged' ? rangedWeapons(ctx.q, ctx.bundle, attackerId) : ccWeapons(ctx.q, ctx.bundle, attackerId)).filter((u) => !skip?.(u))
  let best: { uid: string; v: number; improvised: boolean } | null = null
  for (const uid of uids) {
    const opts = method === 'close' ? { weaponUid: uid, band: 'melee' as const } : { weaponUid: uid }
    let v = 0
    try {
      const h = odds.hitOdds(ctx.q, ctx.bundle, attackerId, targetId, opts)
      if (h.pHit <= 0) continue
      v = h.pHit * odds.expectedDamage(ctx.q, ctx.bundle, attackerId, targetId, opts).expected + 1e-6
    } catch { continue }
    const improvised = weaponRef(ctx.q, ctx.bundle, attackerId, uid)?.def.id === 'improvised-weapon'
    if (!best || (best.improvised && !improvised) || (best.improvised === improvised && v > best.v)) best = { uid, v, improvised }
  }
  return best?.uid ?? null
}
