// Scoring (spec 30 s7.1, s9). Owner: E (eval + threat).
// Every rules number comes from query.* on ctx.q (or a withModelAt copy); nothing here re-derives a rule.
import { healthOf, tokensOn } from '../engine/damage'
import { recordOf } from '../engine/edition'
import { baseRadius } from '../engine/geometry'
import * as query from '../engine/query'
import * as odds from './odds'
import type { AttackOpts } from '../engine/query'
import { victimSlots } from '../engine/attack'
import { modelDistance } from '../engine/measure'
import type { GameState, ModelId, Vec2 } from '../engine/types'
import { attackChoices, threatAt, threatsInReach } from './threat'
import { timeUp, type AiContext, type Score, type ScorePart, type ThreatMap } from './types'
import { dist, enemiesOf, live, roundOf, withModelAt } from './world'

export const ZERO: Score = { value: 0, parts: {} }

/** Sum weighted parts into a Score (weights default to 1). */
export function combine(parts: Score['parts'], weights: Partial<Record<ScorePart, number>> = {}): Score {
  let value = 0
  for (const [k, v] of Object.entries(parts) as [ScorePart, number][]) value += (weights[k] ?? 1) * v
  return { value, parts }
}

/** Per-decision memo (ctx objects live for one decision). */
const memos = new WeakMap<object, Map<string, number>>()
function memo(ctx: AiContext, key: string, f: () => number): number {
  let m = memos.get(ctx)
  if (!m) memos.set(ctx, (m = new Map()))
  const hit = m.get(key)
  if (hit !== undefined) return hit
  const v = f()
  m.set(key, v)
  return v
}

/** Health a model has left (healthOf - tokensOn via query semantics); 0 when off the table. */
export function healthLeft(ctx: AiContext, modelId: ModelId): number {
  const m = ctx.view.models[modelId]
  if (!live(m)) return 0
  return memo(ctx, `hl:${modelId}`, () => Math.max(0, healthOf(ctx.q, ctx.bundle, modelId) - tokensOn(ctx.bundle, m)))
}

/** Worth of a model in model-cost units: unit cost scaled by Health left and by how dangerous it is (ranged-armed). */
export function modelValue(ctx: AiContext, modelId: ModelId): number {
  const m = ctx.view.models[modelId]
  if (!live(m)) return 0
  return memo(ctx, `mv:${modelId}`, () => {
    const unit = recordOf(ctx.bundle, 'units', m.profileId)
    const cost = Math.max(1, unit?.cost ?? 1)
    const max = Math.max(1, healthOf(ctx.q, ctx.bundle, modelId))
    const frac = Math.min(1, healthLeft(ctx, modelId) / max)
    const armed = m.carried.some((c) => c.kind === 'weapon' && !c.spent && (recordOf(ctx.bundle, 'weapons', c.defId)?.skill ?? 'melee') !== 'melee')
    return cost * (armed ? 1.2 : 1) * (0.5 + 0.5 * frac)
  })
}

/**
 * Value of one attack (spec 30 s7.1): expectedDamage x pHit / healthLeft x modelValue + wKill x killOdds x modelValue,
 * plus focus-fire bonus for damaged targets. `attackerAt` scores the attack as if the attacker stood there.
 */
export function attackValue(ctx: AiContext, attackerId: ModelId, targetId: ModelId, opts: AttackOpts = {}, attackerAt?: Vec2): Score {
  const left = healthLeft(ctx, targetId)
  if (left <= 0 || !ctx.view.models[attackerId]) return ZERO
  const q = attackerAt ? withModelAt(ctx.q, attackerId, attackerAt) : ctx.q
  const pHit = odds.hitOdds(q, ctx.bundle, attackerId, targetId, opts).pHit
  if (pHit <= 0) return ZERO
  const mv = modelValue(ctx, targetId)
  const exp = Math.min(left, odds.expectedDamage(q, ctx.bundle, attackerId, targetId, opts).expected)
  const pKill = odds.killOdds(q, ctx.bundle, attackerId, targetId, opts)
  const max = Math.max(1, healthOf(ctx.q, ctx.bundle, targetId))
  const focus = 1 + 0.5 * (1 - Math.min(1, left / max))
  const parts = { damage: ((pHit * exp) / left) * mv * focus, kill: pKill * mv }
  if (opts.band !== 'melee') scrum(ctx, q, attackerId, targetId, opts, pHit, parts)
  return combine(parts, { kill: ctx.tier.wKill })
}

/**
 * A ranged hit into close combat lands on a slot from the engine's victimSlots (SHOT-007): scale the target's share and
 * charge (or credit) the other models in the scrum by their share. Shooting into a melee where a friend is fighting is
 * how the bot used to kill its own models.
 */
function scrum(ctx: AiContext, q: GameState, attackerId: ModelId, targetId: ModelId, opts: AttackOpts, pHit: number, parts: { damage: number; kill: number }): void {
  const t = q.models[targetId]
  if (!t) return
  let busy = false
  for (const o of Object.values(q.models)) {
    if (o.id === targetId || o.id === attackerId || !live(o)) continue
    if (modelDistance(t, o) <= 0.05) { busy = true; break }
  }
  if (!busy) return
  let slots: ModelId[]
  try { slots = victimSlots(q, ctx.bundle, attackerId, targetId) } catch { return }
  if (slots.length <= 1) return
  const share = new Map<ModelId, number>()
  for (const id of slots) share.set(id, (share.get(id) ?? 0) + 1 / slots.length)
  const own = share.get(targetId) ?? 0
  parts.damage *= own
  parts.kill *= own
  for (const [id, sh] of share) {
    if (id === targetId) continue
    const o = ctx.view.models[id]
    const leftO = healthLeft(ctx, id)
    if (!live(o) || leftO <= 0) continue
    const mvO = modelValue(ctx, id)
    let exp = 0, pk = 0
    try {
      exp = Math.min(leftO, odds.expectedDamage(q, ctx.bundle, attackerId, id, opts).expected)
      pk = odds.killOdds(q, ctx.bundle, attackerId, id, opts)
    } catch { exp = 0; pk = 0 }
    const sign = o.owner === ctx.seat ? -FRIENDLY_FIRE : 1
    parts.damage += sign * sh * ((pHit * exp) / leftO) * mvO
    parts.kill += sign * sh * pk * mvO
  }
}
/** Hurting a friend costs this many times what hurting an enemy of the same worth gains. */
const FRIENDLY_FIRE = 1.5

/** Best attack value a model has from a spot over every enemy and weapon (move scoring, activation choice). */
export function bestAttackFrom(ctx: AiContext, attackerId: ModelId, at?: Vec2): { targetId: ModelId | null; weaponUid: string | null; score: Score } {
  const me = ctx.view.models[attackerId]
  const none: { targetId: ModelId | null; weaponUid: string | null; score: Score } = { targetId: null, weaponUid: null, score: ZERO }
  if (!live(me)) return none
  const q = at ? withModelAt(ctx.q, attackerId, at) : ctx.q
  let best = none
  for (const e of enemiesOf(ctx.view, ctx.seat)) {
    if (timeUp(ctx)) break
    for (const opts of attackChoices(q, ctx.bundle, attackerId, e.id)) {
      const s = attackValue(ctx, attackerId, e.id, opts, at)
      if (s.value > best.score.value) best = { targetId: e.id, weaponUid: opts.weaponUid ?? null, score: s }
    }
  }
  return best
}

/** Value of one marker as a share of the model's worth (before tier.wObjective): a pull, never a reason to ignore a fight. */
const OBJECTIVE_SHARE = 0.02
/** Round from which the table centre counts as an objective while the view carries no markers. */
export const LATE_ROUND = 5
/** Centre value at the centre, as a fraction of the model's worth (before tier.wObjective). */
const CENTRE_SHARE = 0.12

/**
 * Objective value of a model standing at a spot (spec 30 s9). With ViewExtras.markers: value per marker by distance.
 * Without them (PlayerView carries no markers yet): from LATE_ROUND on, standing at the table centre (where the box
 * scenarios put their tower, nuke, captive and middle crate) is worth CENTRE_SHARE x worth, fading out over 8".
 */
export function objectiveValue(ctx: AiContext, modelId: ModelId, at: Vec2): number {
  const markers = ctx.view.markers
  const me = ctx.view.models[modelId]
  if (!live(me)) return 0
  if (markers === undefined) {
    if (roundOf(ctx.memory, ctx.view) < LATE_ROUND) return 0
    const d = Math.max(0, Math.hypot(at.x, at.z) - baseRadius(me.base))
    return CENTRE_SHARE * modelValue(ctx, modelId) * (d <= 0.5 ? 1 : Math.max(0, 1 - (d - 0.5) / 8))
  }
  if (!markers.length) return 0
  let v = 0
  const unit = OBJECTIVE_SHARE * modelValue(ctx, modelId)
  for (const mk of markers) {
    if (mk.carriedBy === modelId) { v += unit; continue }
    if (mk.carriedBy) continue // someone else holds it; killing the holder is attackValue's job
    if (mk.kind !== 'object' && (mk.revealed || mk.seenBy.includes(ctx.seat))) continue // nothing left to learn
    v += unit / (1 + dist(at, mk.pos) / 4)
  }
  return v
}

/** Cover a spot gives a model against the enemies that threaten it (query.coverFor from each threat), 0..1. */
export function coverValue(ctx: AiContext, modelId: ModelId, at: Vec2, threats: ThreatMap): number {
  const ids = threatsInReach(ctx, threats, at)
  if (!ids.length) return 0
  const q = withModelAt(ctx.q, modelId, at)
  let n = 0
  for (const id of ids) if (odds.coverFor(q, ctx.bundle, id, modelId).cover) n++
  return n / ids.length
}

/** Surviving unit cost of each side from the view (the round-limit points race). */
function sidePoints(ctx: AiContext): { mine: number; theirs: number } {
  let mine = 0, theirs = 0
  for (const m of Object.values(ctx.view.models)) {
    if (!live(m)) continue
    const c = recordOf(ctx.bundle, 'units', m.profileId)?.cost ?? 0
    if (m.owner === ctx.seat) mine += c
    else theirs += c
  }
  return { mine, theirs }
}

/** Threat multiplier from the points race (tier.wLead): careful while ahead late on, bolder while behind. */
export function leadFactor(ctx: AiContext): number {
  const w = ctx.tier.wLead ?? 0
  if (w <= 0 || roundOf(ctx.memory, ctx.view) < LATE_ROUND) return 1
  return memo(ctx, 'lead', () => {
    const { mine, theirs } = sidePoints(ctx)
    return mine > theirs ? 1 + w : mine < theirs ? 1 / (1 + w) : 1
  })
}

/**
 * Full value of a model ending at a spot: best next attack, minus wThreat x threat, plus wCover x cover, plus
 * wObjective x objective, plus wSurvival x survival for damaged models.
 */
export function positionValue(ctx: AiContext, modelId: ModelId, at: Vec2, threats: ThreatMap): Score {
  const me = ctx.view.models[modelId]
  if (!live(me)) return ZERO
  const t = ctx.tier
  const mv = modelValue(ctx, modelId)
  const atk = bestAttackFrom(ctx, modelId, at)
  const parts: Score['parts'] = { damage: atk.score.parts.damage ?? 0, kill: (atk.score.parts.kill ?? 0) * t.wKill }
  let exposed = false
  if (t.wThreat > 0 || t.wSurvival > 0) {
    const left = Math.max(1e-6, healthLeft(ctx, modelId))
    const th = threatAt(ctx, threats, modelId, at)
    exposed = th.attackers.length > 0
    parts.threat = 0 - t.wThreat * leadFactor(ctx) * (Math.min(1, th.exp / left) * mv * 0.5 + th.pKill * mv)
  }
  if (t.wCover > 0) parts.cover = t.wCover * coverValue(ctx, modelId, at, threats) * mv * 0.25
  if (t.wObjective > 0) parts.objective = t.wObjective * objectiveValue(ctx, modelId, at)
  const max = Math.max(1, healthOf(ctx.q, ctx.bundle, modelId))
  const hurt = 1 - Math.min(1, healthLeft(ctx, modelId) / max)
  if (hurt > 0 && !exposed) parts.survival = t.wSurvival * hurt * mv
  return combine(parts)
}

/** How much a model wants to act now (activation choice, spec 30 s4). */
export function activationValue(ctx: AiContext, modelId: ModelId, threats: ThreatMap): Score {
  const me = ctx.view.models[modelId]
  if (!live(me)) return ZERO
  const mv = modelValue(ctx, modelId)
  const atk = bestAttackFrom(ctx, modelId)
  const parts: Score['parts'] = { damage: atk.score.parts.damage ?? 0, kill: (atk.score.parts.kill ?? 0) * ctx.tier.wKill }
  parts.objective = ctx.tier.wObjective * objectiveValue(ctx, modelId, me.pos)
  const th = threatAt(ctx, threats, modelId, me.pos)
  const urgent = Math.min(1, th.exp / Math.max(1e-6, healthLeft(ctx, modelId))) * mv * 0.5 + th.pKill * mv
  let tempo = ctx.tier.wSurvival * urgent
  const near = threatsInReach(ctx, threats, me.pos).length > 0
  if (!near && atk.targetId === null) tempo -= 1 // far from everything: it can wait
  parts.tempo = tempo
  return combine(parts)
}
