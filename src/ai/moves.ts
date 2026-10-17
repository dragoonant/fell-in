// Move destination search (spec 30 s6). Owner: M (moves + policies).
// Candidates fan out along bearings to enemies, objectives and cover, are scored cheaply on the raw end point, then the
// best are validated (pulled back to the farthest accepted point on ctx.accepts) and rescored. Respect timeUp(ctx).
import { healthOf, tokensOn } from '../engine/damage'
import * as query from '../engine/query'
import * as odds from './odds'
import { baseOnTable, baseRadius } from '../engine/geometry'
import { hasLos } from '../engine/los'
import { modelDistance } from '../engine/measure'
import type { Action, ModelId, Vec2 } from '../engine/types'
import { healthLeft, modelValue, positionValue } from './eval'
import { stall, urgency } from './objectives'
import { clearLine, fieldAt, navField, navGrid, pathLength, routeDown, truncatePath, withBlockers, type NavField } from './nav'
import { reachOf } from './threat'
import { timeUp, type AiContext, type MoveCandidate, type Reach, type Score, type ThreatMap } from './types'
import { dist, enemiesOf, live, withModelAt } from './world'

/** Move allowance from pending.context (inches + baseInches), 0 when the decision is not a move. */
export function allowance(ctx: AiContext): number {
  const c = ctx.pending.context as { inches?: number; baseInches?: number }
  return (c.inches ?? 0) + (c.baseInches ?? 0)
}

/** Worth of a model in model-cost units; 1 while eval is still a stub so sums stay comparable. */
export const worth = (ctx: AiContext, id: ModelId): number => modelValue(ctx, id) || 1
/** Health left, at least 1 (eval first, the engine's own count as fallback). */
export function hpLeft(ctx: AiContext, id: ModelId): number {
  const h = healthLeft(ctx, id)
  if (h > 0) return h
  const m = ctx.q.models[id]
  return m ? Math.max(1, healthOf(ctx.q, ctx.bundle, id) - tokensOn(ctx.bundle, m)) : 1
}

const TAU = Math.PI * 2
const polar = (from: Vec2, ang: number, r: number): Vec2 => ({ x: from.x + Math.cos(ang) * r, z: from.z + Math.sin(ang) * r })
const bearing = (a: Vec2, b: Vec2): number => Math.atan2(b.z - a.z, b.x - a.x)

/** Raw candidate end points for a model (bearings x radii, ctx.tier.moveSamples total), before acceptance. */
export function candidatePoints(ctx: AiContext, modelId: ModelId, reach: number): Vec2[] {
  const me = ctx.view.models[modelId]
  if (!me || reach <= 0) return []
  const goals: Vec2[] = []
  const foes = enemiesOf(ctx.view, ctx.seat).sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos))
  for (const f of foes.slice(0, 4)) goals.push(f.pos)
  for (const mk of ctx.view.markers ?? []) if (!mk.carriedBy && dist(mk.pos, me.pos) <= reach + 8) goals.push(mk.pos)
  const cover = [...ctx.view.terrain].filter((t) => dist(t.pos, me.pos) <= reach + 4).sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos))
  for (const t of cover.slice(0, 4)) goals.push(t.pos)
  const out: Vec2[] = []
  const add = (p: Vec2) => { if (out.length < ctx.tier.moveSamples && freeSpot(ctx, modelId, p)) out.push(p) }
  const radii = [1, 0.65, 0.35]
  // Toward each goal first (stopping at its edge), the cheapest and most useful points.
  for (const r of radii) {
    for (const g of goals) {
      const toward = Math.min(reach * r, Math.max(0, dist(me.pos, g) - baseRadius(me.base) * 2))
      if (toward > 0.2) add(polar(me.pos, bearing(me.pos, g), toward))
    }
  }
  // Flanking and retreat bearings relative to the nearest enemy.
  const lead = foes[0] ? bearing(me.pos, foes[0].pos) : Math.PI / 2
  for (const off of [35, -35, 70, -70, 110, -110, 180]) {
    for (const r of [1, 0.6]) add(polar(me.pos, lead + (off * Math.PI) / 180, reach * r))
  }
  for (let i = 0; i < 8; i++) add(polar(me.pos, (i * TAU) / 8, reach))
  return out
}

const fieldMemo = new WeakMap<AiContext, Map<string, NavField | null>>()
/**
 * Walking-distance field from every live enemy for this model's base (built once per decision and model). `clean`
 * treats obstacles as walls: crossing one shortens the whole move (MOVE-004), so a route round them can go farther.
 */
export function foeField(ctx: AiContext, modelId: ModelId, clean = false): NavField | null {
  let m = fieldMemo.get(ctx)
  if (!m) fieldMemo.set(ctx, (m = new Map()))
  const k = `${modelId}:${clean}`
  if (m.has(k)) return m.get(k)!
  const me = ctx.view.models[modelId]
  const foes = enemiesOf(ctx.view, ctx.seat)
  let f: NavField | null = null
  if (me && foes.length) {
    const r = baseRadius(me.base)
    // Friendly bases block the walk (MOVE-002), so the route goes round them instead of into their backs.
    const friends = Object.values(ctx.view.models)
      .filter((o) => o.id !== modelId && o.owner === me.owner && live(o))
      .map((o) => ({ at: o.pos, r: r + baseRadius(o.base) - 0.1 }))
    try {
      let g = navGrid(ctx.q, r)
      if (clean) g = { ...g, cell: g.cell.map((v) => (v === 1 ? 2 : v)) }
      f = navField(withBlockers(g, friends, me.pos, 1.1), foes.map((e) => e.pos))
    } catch { f = null }
  }
  m.set(k, f)
  return f
}

/** Fractions of a path tried, longest first, until the engine accepts one (difficult ground shortens the allowance). */
const CUTS = [1, 0.85, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22]
/**
 * The longest accepted prefix of `route` from `from` (scan, not bisection: a cut ending inside an obstacle is refused
 * while a shorter one is fine, so acceptance is not monotonic). Null when nothing of at least 0.3 in is accepted.
 */
export function cutAccepted(ctx: AiContext, template: Action, from: Vec2, route: readonly Vec2[]): Vec2[] | null {
  for (const f of CUTS) {
    const p = f === 1 ? [...route] : truncatePath(from, route, f)
    if (!p.length || pathLength(from, p) < 0.3) continue
    if (ctx.accepts({ ...template, path: p })) return p
  }
  return null
}

/** Walking distance from a spot to the nearest enemy (straight line when the grid has no route). */
function walkToFoe(ctx: AiContext, modelId: ModelId, at: Vec2): number {
  const f = foeField(ctx, modelId)
  const d = f ? fieldAt(f, at) : Infinity
  return Number.isFinite(d) ? d : nearestFoe(ctx, at)
}

/** A move may not end on or touching another base (contact is a charge): 0.1" clear of every other live model. */
export function freeSpot(ctx: AiContext, modelId: ModelId, p: Vec2): boolean {
  const me = ctx.view.models[modelId]
  if (!me) return false
  const r = baseRadius(me.base)
  // A move that ends off the table takes the model out of the game (a voluntary exit): never a candidate.
  if (!baseOnTable(ctx.q, p, r)) return false
  for (const m of Object.values(ctx.view.models)) {
    if (m.id === modelId || !live(m)) continue
    if (dist(m.pos, p) < r + baseRadius(m.base) + 0.1) return false
  }
  return true
}

function nearestFoe(ctx: AiContext, at: Vec2): number {
  let d = Infinity
  for (const e of enemiesOf(ctx.view, ctx.seat)) d = Math.min(d, dist(e.pos, at))
  return d
}

/** Free attacks a withdrawal from close combat provokes (killOdds and damage of each engaged enemy), in cost units. */
export function withdrawPenalty(ctx: AiContext, modelId: ModelId): number {
  const me = ctx.view.models[modelId]
  if (!me) return 0
  let pen = 0
  for (const e of enemiesOf(ctx.view, ctx.seat)) {
    if (modelDistance(me, e) > 0.05) continue
    try {
      const h = odds.hitOdds(ctx.q, ctx.bundle, e.id, modelId, { band: 'melee' })
      if (h.pHit <= 0) continue
      const ed = odds.expectedDamage(ctx.q, ctx.bundle, e.id, modelId, { band: 'melee' })
      pen += ((h.pHit * ed.expected) / hpLeft(ctx, modelId) + ctx.tier.wKill * odds.killOdds(ctx.q, ctx.bundle, e.id, modelId, { band: 'melee' })) * worth(ctx, modelId)
    } catch { /* an unreadable plan costs nothing */ }
  }
  return pen
}

/**
 * Weight (in model worth per full move) of closing in on the nearest enemy until the model can attack it. Kept well
 * under one attack's value (bench round 2): a gun that can already shoot should shoot, not inch forward.
 */
export const W_APPROACH = 0.1
/** Extra pull toward the nearest enemy (per full move) while nothing can be attacked from the spot. */
/** The same for melee-only models, which have to close to do anything at all. */
export const W_APPROACH_MELEE = 0.3
export const W_PULL = 0.03
/** Extra pull toward the nearest enemy at full stall (per full move, in model worth), on top of W_PULL. */
export const W_STALL_PULL = 0.15

const reachMemo = new WeakMap<AiContext, Map<ModelId, Reach>>()
function ownReach(ctx: AiContext, id: ModelId): Reach {
  let m = reachMemo.get(ctx)
  if (!m) reachMemo.set(ctx, (m = new Map()))
  let r = m.get(id)
  if (!r) { r = reachOf(ctx, id); m.set(id, r) }
  return r
}

/** Inches added to the gap for an enemy the spot has no line of sight to (it can be neither shot nor charged). */
const NO_LOS_GAP = 4
const gapMemo = new WeakMap<AiContext, Map<string, number>>()

/**
 * Inches the model still has to close before it can attack from the spot next activation: ranged models want an enemy
 * inside 80 percent of their longest range, melee-only models an enemy inside their charge reach, in both cases with
 * line of sight (engine LoS on the shim) and, for a charge, a clear straight lane. The extra walk round walls (nav
 * field minus straight distance) is added. 0 once there.
 */
export function engageGap(ctx: AiContext, modelId: ModelId, at: Vec2): number {
  const key = `${modelId}@${at.x.toFixed(2)},${at.z.toFixed(2)}`
  let memo = gapMemo.get(ctx)
  if (!memo) gapMemo.set(ctx, (memo = new Map()))
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const me = ctx.view.models[modelId]
  const foes = enemiesOf(ctx.view, ctx.seat).sort((a, b) => dist(a.pos, at) - dist(b.pos, at))
  if (!me || !foes.length) return 0
  const r = ownReach(ctx, modelId)
  const melee = r.range <= 0
  const want = melee ? Math.max(0, r.charge * 0.9 + baseRadius(me.base)) : r.range * 0.8
  const walk = walkToFoe(ctx, modelId, at)
  const detour = Number.isFinite(walk) ? Math.max(0, walk - dist(foes[0]!.pos, at)) : 0
  const f = foeField(ctx, modelId)
  const q = withModelAt(ctx.q, modelId, at)
  let gap = Infinity
  for (const e of foes.slice(0, 3)) {
    const d = dist(e.pos, at)
    let g = Math.max(0, d - want)
    if (g < NO_LOS_GAP) {
      let seen = false
      try { seen = hasLos(q, modelId, e.id) } catch { seen = false }
      if (!seen || (melee && f && !clearLine(f.g, at, e.pos, e.pos, baseRadius(e.base) + baseRadius(me.base) + 0.2))) g += NO_LOS_GAP
    }
    gap = Math.min(gap, g)
  }
  const out = (Number.isFinite(gap) ? gap : 0) + detour
  memo.set(key, out)
  return out
}

/**
 * The walking route toward the nearest enemy (nav grid), cut where a ranged model gets in range or the allowance runs
 * out, then pulled back by bisection until the engine accepts it. Null when it gets nowhere.
 */
export function navRoute(ctx: AiContext, template: Action, modelId: ModelId, reach: number, frac = 1): Vec2[] | null {
  const me = ctx.view.models[modelId]
  const f = foeField(ctx, modelId)
  if (!me || !f) return null
  const r = ownReach(ctx, modelId)
  const want = r.range > 0 ? r.range * 0.8 : 0
  const now = fieldAt(f, me.pos)
  if (!Number.isFinite(now)) return null
  let best: { path: Vec2[]; d: number } | null = null
  // Over the obstacles (shorter allowance) and round them (full allowance); keep whichever gains more on its own field.
  for (const ff of [f, foeField(ctx, modelId, true)]) {
    if (!ff) continue
    const here = fieldAt(ff, me.pos)
    if (!Number.isFinite(here)) continue
    const len = Math.min(reach - 0.05, Math.max(0, here - want)) * frac
    if (len < 0.3) continue
    const route = routeDown(ff, me.pos, len)
    const cut = route ? cutAccepted(ctx, template, me.pos, route) : null
    if (!cut) continue
    const d = fieldAt(ff, cut[cut.length - 1]!) - here
    if (!best || d < best.d) best = { path: cut, d }
  }
  return best && best.d < -0.2 ? best.path : null
}

/**
 * Position value plus the approach term: closing the engagement gap is worth W_APPROACH x worth per full move, and a
 * smaller pull toward the nearest enemy applies while no attack is available from the spot (no idling out of range).
 */
export function spotScore(ctx: AiContext, modelId: ModelId, at: Vec2, threats: ThreatMap, reach: number): Score {
  const me = ctx.view.models[modelId]!
  const base = positionValue(ctx, modelId, at, threats)
  const w = worth(ctx, modelId)
  const per = Math.max(1, reach)
  const clamp = (x: number) => Math.max(-1, Math.min(1, x))
  const wApp = ownReach(ctx, modelId).range <= 0 ? (ctx.tier.wApproachMelee ?? W_APPROACH_MELEE) : (ctx.tier.wApproach ?? W_APPROACH)
  let adv = wApp * (1 + 1.5 * urgency(ctx)) * w * clamp((engageGap(ctx, modelId, me.pos) - engageGap(ctx, modelId, at)) / per)
  const attacks = (base.parts.damage ?? 0) + (base.parts.kill ?? 0)
  if (attacks <= 1e-9) {
    // No live enemy on the table (reserves still off it) makes both walks Infinity: no pull then, never NaN.
    const gain = walkToFoe(ctx, modelId, me.pos) - walkToFoe(ctx, modelId, at)
    // A stalled game (no clock, past STALL_FROM) adds W_STALL_PULL for every tier, whatever its threat weights: hunt the stragglers.
    if (Number.isFinite(gain)) adv += ((ctx.tier.wPull ?? W_PULL) + W_STALL_PULL * stall(ctx)) * w * clamp(gain / per)
  }
  return { value: base.value + adv, parts: { ...base.parts, tempo: (base.parts.tempo ?? 0) + adv } }
}

/** Full spotScore evaluations per move.path decision (each costs LoS and attack plans; the budget is 150 ms). */
const FULL_EVALS = 14
/** Spots the activation menu scores to estimate a move's gain. */
const GAIN_EVALS = 7

/**
 * The points worth a full evaluation: the best by a cheap walking-distance pre-score (no LoS, no attack plans), plus
 * an even spread of the rest so retreats and flanks stay in the running.
 */
export function shortlist(ctx: AiContext, modelId: ModelId, pts: readonly Vec2[], n: number): Vec2[] {
  if (pts.length <= n) return [...pts]
  const r = ownReach(ctx, modelId)
  const want = r.range > 0 ? r.range * 0.8 : Math.max(0, r.charge * 0.9)
  const ranked = pts.map((pt) => { const w = walkToFoe(ctx, modelId, pt); return { pt, v: Number.isFinite(w) ? -Math.max(0, w - want) : 0 } }).sort((a, b) => b.v - a.v)
  const head = Math.ceil(n * 0.6)
  const out = ranked.slice(0, head).map((x) => x.pt)
  const rest = ranked.slice(head)
  const step = rest.length / Math.max(1, n - head)
  for (let i = 0; out.length < n && i < rest.length; i += step) out.push(rest[Math.floor(i)]!.pt)
  return out
}

/** Accepted, scored candidates for the move template (`move.to`), best first. */
export function moveCandidates(ctx: AiContext, template: Action, threats: ThreatMap): MoveCandidate[] {
  const id = (ctx.pending.context as { modelId?: string }).modelId
  const me = id ? ctx.view.models[id] : undefined
  const reach = allowance(ctx)
  if (!id || !me || reach <= 0) return []
  const raw: { pt: Vec2; score: Score }[] = []
  for (const pt of shortlist(ctx, id, candidatePoints(ctx, id, reach), FULL_EVALS)) {
    if (raw.length >= 3 && timeUp(ctx)) break
    raw.push({ pt, score: spotScore(ctx, id, pt, threats, reach) })
  }
  raw.sort((a, b) => b.score.value - a.score.value)
  const out: MoveCandidate[] = []
  const seen: Vec2[] = []
  // The walking route toward the enemy first: it goes round walls the straight candidates run into.
  for (const frac of [1, 0.5]) {
    const route = navRoute(ctx, template, id, reach, frac)
    if (!route) continue
    const end = route[route.length - 1]!
    if (seen.some((s) => dist(s, end) < 0.3)) continue
    seen.push(end)
    out.push({ to: end, path: route, score: spotScore(ctx, id, end, threats, reach) })
  }
  let tried = 0
  for (const r of raw) {
    if (out.length >= 6 || (tried >= 2 && timeUp(ctx)) || tried >= 10) break
    tried++
    let end: Vec2 | null = r.pt
    let score = r.score
    if (!ctx.accepts({ ...template, path: [r.pt] })) {
      end = cutAccepted(ctx, template, me.pos, [r.pt])?.[0] ?? null
      if (!end || dist(end, me.pos) < 0.25) continue
      score = spotScore(ctx, id, end, threats, reach)
    }
    if (seen.some((s) => dist(s, end!) < 0.3)) continue
    seen.push(end)
    out.push({ to: end, path: [end], score })
  }
  // Blocked in front (a wall, a building): when no straight move gets meaningfully closer, try two-leg detours toward
  // the nearest enemy and toward the best raw point.
  const foe = enemiesOf(ctx.view, ctx.seat).sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos))[0]
  const progress = (p: Vec2) => (foe ? dist(me.pos, foe.pos) - dist(p, foe.pos) : 0)
  const bestProgress = Math.max(0, ...out.map((c) => progress(c.to)))
  if (foe && bestProgress < reach * 0.4 && dist(me.pos, foe.pos) > reach * 0.5) {
    const goals = [foe.pos, ...(raw[0] ? [raw[0].pt] : [])]
    for (const g of goals) {
      if (timeUp(ctx) && out.length) break
      const path = detour(ctx, template, me.pos, g, reach)
      if (!path) continue
      const end = path[path.length - 1]!
      if (seen.some((s) => dist(s, end) < 0.3)) continue
      seen.push(end)
      out.push({ to: end, path, score: spotScore(ctx, id, end, threats, reach) })
    }
  }
  return out.sort((a, b) => b.score.value - a.score.value)
}

/**
 * A two-leg path from `from` toward `goal` that the engine accepts, sidestepping whatever blocks the straight line:
 * first legs fan out at growing angles, the second leg heads for the goal with the allowance left (pulled back by
 * bisection when blocked). Returns the path that ends nearest the goal, or null.
 */
export function detour(ctx: AiContext, template: Action, from: Vec2, goal: Vec2, reach: number): Vec2[] | null {
  const head = bearing(from, goal)
  const d0 = dist(from, goal)
  let best: { path: Vec2[]; d: number } | null = null
  const ok = (path: Vec2[]) => ctx.accepts({ ...template, path })
  for (const deg of [30, -30, 55, -55, 80, -80, 110, -110]) {
    if (best && best.d < d0 - reach * 0.6) break
    if (best && timeUp(ctx)) break
    for (const f of [0.35, 0.6]) {
      const leg1 = reach * f
      const w = polar(from, head + (deg * Math.PI) / 180, leg1)
      if (!ok([w])) continue
      const left = Math.max(0, reach - leg1 - 0.05)
      const toGoal = dist(w, goal)
      if (left < 0.3 || toGoal < 0.3) continue
      const end = polar(w, bearing(w, goal), Math.min(left, toGoal))
      let lo = 0, hi = 1
      if (ok([w, end])) lo = 1
      else for (let i = 0; i < 5; i++) { const mid = (lo + hi) / 2; if (ok([w, polar(w, bearing(w, goal), Math.min(left, toGoal) * mid)])) lo = mid; else hi = mid }
      const path = lo > 0.05 ? [w, polar(w, bearing(w, goal), Math.min(left, toGoal) * lo)] : [w]
      const d = dist(path[path.length - 1]!, goal)
      if (d < d0 - 0.25 && (!best || d < best.d)) best = { path, d }
    }
  }
  return best?.path ?? null
}

/** Value of the best destination over standing still (menu scoring); cheap, no acceptance checks. */
export function moveGain(ctx: AiContext, modelId: ModelId, threats: ThreatMap, reach: number): number {
  const me = ctx.view.models[modelId]
  if (!me || reach <= 0) return 0
  const stay = spotScore(ctx, modelId, me.pos, threats, reach).value
  let best = -Infinity
  // The walking route's end (round walls) plus straight points the grid says are reachable in a line.
  const pts: Vec2[] = []
  const f = foeField(ctx, modelId)
  if (f) {
    const r = ownReach(ctx, modelId)
    const now = fieldAt(f, me.pos)
    const len = Math.min(reach - 0.05, Math.max(0, now - (r.range > 0 ? r.range * 0.8 : 0)))
    const route = Number.isFinite(now) && len >= 0.3 ? routeDown(f, me.pos, len) : null
    if (route && freeSpot(ctx, modelId, route[route.length - 1]!)) pts.push(route[route.length - 1]!)
  }
  const lane = candidatePoints(ctx, modelId, reach).filter((pt) => !f || clearLine(f.g, me.pos, pt))
  pts.push(...shortlist(ctx, modelId, lane, GAIN_EVALS - pts.length))
  for (const pt of pts) {
    if (timeUp(ctx) && best > -Infinity) break
    best = Math.max(best, spotScore(ctx, modelId, pt, threats, reach).value)
  }
  if (best === -Infinity) return 0
  return best - stay - withdrawPenalty(ctx, modelId)
}

/** The answer to a move.path decision: move.to with the best path, move.cancel when staying is better, null = no opinion. */
export function bestMove(ctx: AiContext, threats: ThreatMap): Action | null {
  const to = ctx.legal.find((a) => a.type === 'move.to')
  const cancel = ctx.legal.find((a) => a.type === 'move.cancel') ?? null
  const id = (ctx.pending.context as { modelId?: string }).modelId
  const me = id ? ctx.view.models[id] : undefined
  if (!to || !id || !me) return null
  const reach = allowance(ctx)
  const r = baseRadius(me.base)
  const cands = moveCandidates(ctx, to, threats).filter((c) => baseOnTable(ctx.q, c.to, r))
  if (!cands.length) {
    ctx.memory.stuck.add(`${me.id}:${me.pos.x.toFixed(2)},${me.pos.z.toFixed(2)}`)
    return cancel
  }
  const stay = spotScore(ctx, id, me.pos, threats, reach).value - withdrawPenalty(ctx, id)
  const best = cands[0]!
  if (cancel && best.score.value < stay - 1e-9) return cancel
  return { ...to, path: best.path }
}

/** Slide path after close combat (melee.slide): best accepted end spot that keeps the engagement, or an empty slide. */
export function bestSlide(ctx: AiContext, threats: ThreatMap): Action | null {
  const tpl = ctx.legal.find((a) => a.type === 'melee.slide')
  const c = ctx.pending.context as { modelId?: string; engagedBefore?: string[] }
  const me = c.modelId ? ctx.view.models[c.modelId] : undefined
  if (!tpl || !me) return null
  const stayV = spotScore(ctx, me.id, me.pos, threats, 4).value
  const foes = (c.engagedBefore ?? []).map((i) => ctx.view.models[i]).filter((m): m is NonNullable<typeof m> => !!m)
  let best: { at: Vec2; v: number } | null = null
  for (const f of foes.slice(0, 2)) {
    const r = baseRadius(me.base) + baseRadius(f.base)
    const a0 = bearing(f.pos, me.pos)
    for (const deg of [25, -25, 50, -50, 90, -90, 130, -130]) {
      if (timeUp(ctx) && best) break
      const at = polar(f.pos, a0 + (deg * Math.PI) / 180, r + 0.02)
      if (!baseOnTable(ctx.q, at, baseRadius(me.base))) continue
      const v = spotScore(ctx, me.id, at, threats, 4).value
      if (v > stayV + 1e-9 && (!best || v > best.v) && ctx.accepts({ ...tpl, path: [at] })) best = { at, v }
    }
  }
  return best ? { ...tpl, path: [best.at] } : tpl
}

/** Position the model would stand in if moved next to a target (charge scoring): contact point on the near side. */
export function contactPoint(ctx: AiContext, attackerId: ModelId, targetId: ModelId): Vec2 | null {
  const a = ctx.view.models[attackerId], t = ctx.view.models[targetId]
  if (!a || !t) return null
  return polar(t.pos, bearing(t.pos, a.pos), baseRadius(a.base) + baseRadius(t.base))
}
