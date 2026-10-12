// Per-decision-kind policies (spec 30 s3-s7). Owner: M (moves + policies). Exports are FROZEN.
// A policy returns a legal Action (parameters filled) or null for "no opinion" (the decider then uses randomPolicy).
// The threat map is built at most once per decision (threatsFor); scoring goes through eval.ts and query.*.
import { rulerInches } from '../engine/edition'
import { baseRadius } from '../engine/geometry'
import * as query from '../engine/query'
import * as odds from './odds'
import type { Action, ModelId, ModelState, Vec2 } from '../engine/types'
import { activationValue, attackValue, bestAttackFrom, combine, positionValue, ZERO } from './eval'
import { bestMove, bestSlide, contactPoint, hpLeft, moveGain, worth } from './moves'
import { buildThreatMap, reachOf, threatAt } from './threat'
import { timeUp, type AiContext, type Policy, type PolicyTable, type Score, type Scored, type ThreatMap } from './types'
import { contextModel, dist, enemiesOf, modelsOf, withModelAt } from './world'

/**
 * Pick the best scored candidate. Noise (tier.noise x score spread, from ctx.rng) perturbs scores for easy; exact ties
 * break on ctx.rng so the answer is deterministic for (seed, decision id, tier). Null for an empty list.
 */
export function pickBest<T>(ctx: AiContext, scored: readonly Scored<T>[]): Scored<T> | null {
  if (!scored.length) return null
  const vals = scored.map((s) => s.score.value)
  const spread = Math.max(...vals) - Math.min(...vals)
  let best: Scored<T> | null = null, bestV = -Infinity
  for (const s of scored) {
    const v = s.score.value + (ctx.tier.noise > 0 ? (ctx.rng() - 0.5) * 2 * ctx.tier.noise * spread : 0) + ctx.rng() * 1e-9
    if (v > bestV) { bestV = v; best = s }
  }
  return best
}

// ---------- helpers ----------
/**
 * A Critical Attack option is scored by the engine's own plan for it: query's AttackOpts has no critical field, but
 * the opts reach the attack plan unchanged, which reads `critical` (always hits, critical dice and damage).
 */
const critOpt = (a: Action): query.AttackOpts => (a.critical === true ? ({ critical: true } as query.AttackOpts) : {})
/** Spending the weapon's critical points has a cost: a critical must beat the plain attack by this factor's margin. */
const CRIT_SPEND = 0.8
/** Prepare (a reaction held for the enemy turn) as a share of worth x tier.wPrepare at full trigger odds. */
const PREPARE_SHARE = 0.1
const threatCache = new WeakMap<AiContext, ThreatMap>()
/** The threat map for this decision, built once. */
function threatsFor(ctx: AiContext): ThreatMap {
  let t = threatCache.get(ctx)
  if (!t) { t = buildThreatMap(ctx); threatCache.set(ctx, t) }
  return t
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const scored = <T>(action: T, value: number, parts: Score['parts'] = {}): Scored<T> => ({ action, score: { value, parts } })
const ATTACK_TYPE = /^(shoot|throw|melee|charge)\./
const key = (m: ModelState): string => `${m.id}:${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)}`

/**
 * Attack value with the engine's numbers: eval.attackValue, and when that is still zero for an attack the engine says
 * can hit, the same formula straight from query.* so the bot never reads a real shot as worthless.
 */
function atk(ctx: AiContext, attackerId: ModelId, targetId: ModelId, opts: query.AttackOpts = {}, at?: Vec2): Score {
  try {
    const av = attackValue(ctx, attackerId, targetId, opts, at)
    // A scored attack stands even when the scrum made it worthless or worse; the fallback is for unscored ones only.
    if (av.value > 0 || Object.keys(av.parts).length) return av
    const q = at ? withModelAt(ctx.q, attackerId, at) : ctx.q
    const h = odds.hitOdds(q, ctx.bundle, attackerId, targetId, opts)
    if (h.pHit <= 0) return av
    const ed = odds.expectedDamage(q, ctx.bundle, attackerId, targetId, opts)
    const w = worth(ctx, targetId)
    return combine({ damage: (h.pHit * ed.expected / hpLeft(ctx, targetId)) * w, kill: ctx.tier.wKill * odds.killOdds(q, ctx.bundle, attackerId, targetId, opts) * w })
  } catch {
    return ZERO
  }
}

/** Best attack value of a ranged weapon over every enemy in range. */
function bestRanged(ctx: AiContext, id: ModelId, uid: string, base: query.AttackOpts): Score {
  let best = ZERO
  for (const e of enemiesOf(ctx.view, ctx.seat)) {
    if (best !== ZERO && timeUp(ctx)) break
    try {
      if (!odds.rangeBand(ctx.q, ctx.bundle, id, e.id, uid).band) continue
    } catch { continue }
    const s = atk(ctx, id, e.id, { ...base, weaponUid: uid })
    if (s.value > best.value) best = s
  }
  return best
}

/** Damage fraction/health-weighted exposure of a model standing at a spot (tier.wThreat x enemy threat). */
function exposure(ctx: AiContext, id: ModelId, at: Vec2, threats: ThreatMap): number {
  if (ctx.tier.wThreat <= 0) return 0
  const rep = threatAt(ctx, threats, id, at)
  return ctx.tier.wThreat * (rep.exp / hpLeft(ctx, id) + ctx.tier.wKill * rep.pKill) * worth(ctx, id)
}

/** Heal amount an item restores (best branch of a choose-one), 0 when it does not heal. */
function healOf(effects: readonly unknown[] | undefined): number {
  let n = 0
  for (const e of (effects ?? []) as { op?: string; n?: number; options?: unknown[][] }[]) {
    if (e.op === 'heal') n += e.n ?? 0
    else if (e.op === 'choose') n += Math.max(0, ...(e.options ?? []).map((b) => healOf(b)))
  }
  return n
}
function itemDef(ctx: AiContext, id: string) {
  return ctx.bundle.records.items.find((r) => r.id === id)
}

// ---------- single-option and turn-flow ----------
/** Single-option decisions (turn.start and any one-option prompt). */
export const pickOnly: Policy = (ctx) => (ctx.legal.length === 1 && ctx.legal[0]!.type !== 'move.to' ? ctx.legal[0]! : null)

/** turn.first: take the first turn when a kill or objective is available now, else let the opponent commit. */
export const firstTurn: Policy = (ctx) => {
  const opts = ctx.legal.filter((a) => a.type === 'turn.first')
  const mine = opts.find((a) => a.firstSeat === ctx.seat)
  const theirs = opts.filter((a) => a.firstSeat !== ctx.seat)
  if (!mine || !theirs.length) return opts[0] ?? null
  let best = 0
  for (const m of modelsOf(ctx.view, ctx.seat)) {
    if (best > 0 && timeUp(ctx)) break
    best = Math.max(best, bestAttackFrom(ctx, m.id).score.value)
  }
  return best > 0.25 ? mine : theirs[0]!
}

/** Activation desirability: eval's number plus a tiny pull for models close to the enemy (stable when eval is flat). */
function wantValue(ctx: AiContext, id: ModelId, threats: ThreatMap): Score {
  const base = activationValue(ctx, id, threats)
  const m = ctx.view.models[id]
  let d = Infinity
  if (m) for (const e of enemiesOf(ctx.view, ctx.seat)) d = Math.min(d, dist(e.pos, m.pos))
  return { value: base.value + 0.001 / (1 + (Number.isFinite(d) ? d : 99)), parts: base.parts }
}
function pickByModel(ctx: AiContext, type: string): Action | null {
  const opts = ctx.legal.filter((a) => a.type === type && typeof a.modelId === 'string')
  if (!opts.length) return null
  const threats = threatsFor(ctx)
  const rows = opts.map((a) => ({ action: a, score: wantValue(ctx, str(a.modelId), threats) }))
  return pickBest(ctx, rows)?.action ?? null
}
/** turn.ready: Ready the model with the highest activationValue (spec 30 s4). */
export const readyModel: Policy = (ctx) => pickByModel(ctx, 'turn.ready')
/** turn.pick: Use the Ready model with the highest activationValue next. */
export const pickModel: Policy = (ctx) => pickByModel(ctx, 'turn.pick')
/**
 * turn.choose: always Use. Passing would leave models idle and let both bots stall into a round-limit draw, so the
 * "worth waiting" test of spec 30 s3 is deliberately not applied (reported as an issue).
 */
export const useOrPass: Policy = (ctx) => ctx.legal.find((a) => a.type === 'turn.useAll') ?? null

// ---------- activation menu ----------
function menuOption(ctx: AiContext, id: ModelId, me: ModelState, a: Action, threats: ThreatMap, bestAttack: { v: number }): Scored<Action> {
  const quick = a.quick === true
  const qf = quick ? 0.98 : 1
  const w = worth(ctx, id)
  const wObj = ctx.tier.wObjective / 4
  switch (a.type) {
    case 'turn.end': return scored(a, 0)
    case 'shoot.begin': case 'throw.begin': {
      const band = a.band === 'short' || a.band === 'long' ? a.band : undefined
      const s = bestRanged(ctx, id, str(a.weaponUid), { quick, ...(band ? { band } : {}), ...critOpt(a) })
      const f = (a.critical === true ? CRIT_SPEND : 1) * qf
      bestAttack.v = Math.max(bestAttack.v, s.value * f)
      return { action: a, score: { value: s.value * f, parts: s.parts } }
    }
    case 'melee.attack': {
      const s = atk(ctx, id, str(a.targetId), { weaponUid: str(a.weaponUid), band: 'melee', quick, ...critOpt(a) })
      const f = (a.critical === true ? CRIT_SPEND : 1) * qf
      bestAttack.v = Math.max(bestAttack.v, s.value * f)
      return { action: a, score: { value: s.value * f, parts: s.parts } }
    }
    case 'charge.go': {
      const t = ctx.view.models[str(a.targetId)]
      const at = contactPoint(ctx, id, str(a.targetId))
      if (!t || !at) return scored(a, 0.05)
      const s = atk(ctx, id, t.id, { band: 'melee', quick }, at)
      // Exposure relative to standing still, as a move's gain is: the charger is in the open either way.
      const v = s.value * 1.1 * qf - Math.max(0, exposure(ctx, id, at, threats) - exposure(ctx, id, me.pos, threats))
      bestAttack.v = Math.max(bestAttack.v, v)
      return { action: a, score: { value: Math.max(v, 0.05 * w), parts: s.parts } }
    }
    case 'move.go': {
      if (ctx.memory.stuck.has(key(me))) return scored(a, -1)
      const reach = Math.max(reachOf(ctx, id).move + 2 * baseRadius(me.base), rulerInches(ctx.bundle, 'yellow'), 4)
      const g = moveGain(ctx, id, threats, reach)
      return scored(a, g * qf)
    }
    case 'move.shakeOff': return scored(a, 1000)
    case 'move.putOut': return scored(a, 3 * w)
    case 'prepare.go': {
      // A fallback for a model with nothing better to do: any real move or attack outscores it.
      let n = 0
      for (const e of enemiesOf(ctx.view, ctx.seat)) if (e.readiness !== 'used' && dist(e.pos, me.pos) <= 14) n++
      return scored(a, PREPARE_SHARE * ctx.tier.wPrepare * Math.min(1, n / 3) * w * qf, { tempo: n })
    }
    case 'item.use': {
      const card = me.carried.find((c) => c.uid === a.itemUid)
      const def = card ? itemDef(ctx, card.defId) : undefined
      if (!def) return scored(a, 0.01)
      const heal = healOf(def.effects)
      const hp = hpLeft(ctx, id)
      if (heal > 0) {
        const taken = me.damage + me.rad
        return scored(a, taken >= (taken + hp) / 2 ? (2 * Math.min(heal, taken) * w) / (taken + hp) : 0.01, { survival: heal })
      }
      if (def.addictive) return scored(a, 0.01)
      const near = enemiesOf(ctx.view, ctx.seat).some((e) => dist(e.pos, me.pos) <= 16)
      return scored(a, near ? 0.15 * w : 0.02)
    }
    case 'item.drop': return scored(a, -1)
    case 'item.pickup': return scored(a, 0.2 * w * wObj + 0.02)
    // Carrying a scenario object (box nuke, books) is how those scenarios are won or denied; the carrier never
    // walks it off the table (moves stay on the table), so holding it is never worse than leaving it.
    case 'scenario.pickup': return scored(a, 0.5 * w * wObj + 0.05, { objective: 1 })
    case 'scenario.drop': return scored(a, -1)
    case 'search.peek': return scored(a, 0.15 * w * wObj + 0.02)
    case 'search.interact': case 'expertise.use': return scored(a, 0.3 * w * wObj + 0.02, { objective: 1 })
    default: return scored(a, 0.05 * qf)
  }
}

const bounces = new WeakMap<object, { sig: string; last: string | null; banned: Set<string> }>()
const optKey = (a: Action): string => `${a.type}|${str(a.weaponUid)}|${str(a.targetId)}|${str(a.itemUid)}|${a.quick === true}|${a.critical === true}`

/** turn.activation: score each menu option family (spec 30 s5); AiMemory.plan keeps the chosen step. */
export const activationMenu: Policy = (ctx) => {
  const me = contextModel(ctx.view)
  if (!me) return null
  const threats = threatsFor(ctx)
  const bestAttack = { v: 0 }
  // Attack options first so move and prepare know what shooting offers (move only matters when it beats that).
  const order = [...ctx.legal].sort((a, b) => Number(ATTACK_TYPE.test(b.type)) - Number(ATTACK_TYPE.test(a.type)))
  // Bounce guard: the same menu again (same model, spot, actions and AP) means the last pick was cancelled further
  // down (move with no better spot, attack with no target); never pick it again, or the activation loops forever.
  const c = ctx.pending.context as { actionsLeft?: number; ap?: number }
  const sig = `${key(me)}|${c.actionsLeft ?? '?'}|${c.ap ?? '?'}`
  let b = bounces.get(ctx.memory)
  if (!b || b.sig !== sig) bounces.set(ctx.memory, (b = { sig, last: null, banned: new Set() }))
  else if (b.last) b.banned.add(b.last)
  const banned = b.banned
  const rows = order.filter((a) => a.type === 'turn.end' || !banned.has(optKey(a))).map((a) => menuOption(ctx, me.id, me, a, threats, bestAttack))
  for (const r of rows) {
    if (r.action.type === 'prepare.go' && bestAttack.v > 0) r.score.value = Math.min(r.score.value, bestAttack.v * 0.5)
    if (r.action.type === 'move.go' && bestAttack.v > 0 && r.score.value <= bestAttack.v) r.score.value *= 0.5
  }
  const pick = pickBest(ctx, rows)
  if (!pick) return null
  b.last = optKey(pick.action)
  ctx.memory.plan ={ modelId: me.id, decisionSeq: ctx.memory.stats.decisions, steps: [pick.action.type] }
  return pick.action
}

/** move.path: moves.bestMove. */
export const movePath: Policy = (ctx) => bestMove(ctx, threatsFor(ctx))

// ---------- attacks ----------
/** shoot.target / throw.target: best row of pending.context.targets by eval.attackValue for its band. */
export const pickTarget: Policy = (ctx) => {
  const rows: Scored<Action>[] = []
  const targets = (ctx.pending.context as { targets?: { targetId: string; band: 'short' | 'long'; pHit: number }[] }).targets ?? []
  for (const a of ctx.legal) {
    if (!/\.target$/.test(a.type)) continue
    const row = targets.find((t) => t.targetId === a.targetId && t.band === a.band)
    const s = atk(ctx, str(a.modelId), str(a.targetId), { weaponUid: str(a.weaponUid), band: a.band === 'long' ? 'long' : 'short', ...critOpt(a) })
    rows.push({ action: a, score: s.value > 0 || Object.keys(s.parts).length ? s : { value: (row?.pHit ?? 0) * 0.01, parts: {} } })
  }
  return pickBest(ctx, rows)?.action ?? null
}

/** *.luck: spend luck per tier.luck (spec 30 s7.4). */
export const useLuck: Policy = (ctx) => {
  const use = ctx.legal.find((a) => a.use === true), keep = ctx.legal.find((a) => a.use === false)
  if (!use || !keep) return null
  const c = ctx.pending.context as { ask?: string; attackerId?: string; targetId?: string; success?: boolean; run?: { plan?: { weaponUid?: string } } }
  const ask = c.ask ?? 'accurate'
  const relevant = ask === 'dodge' ? c.success !== false : ask === 'accurate' ? c.success !== true : false
  if (ctx.tier.luck === 'always') return relevant || ask === 'crit' ? use : keep
  if (!relevant || !c.attackerId || !c.targetId) return keep
  try {
    const opts: query.AttackOpts = c.run?.plan?.weaponUid ? { weaponUid: c.run.plan.weaponUid } : {}
    const h = odds.hitOdds(ctx.q, ctx.bundle, c.attackerId, c.targetId, opts)
    if (h.pHit <= 0) return keep
    const pKill = odds.killOdds(ctx.q, ctx.bundle, c.attackerId, c.targetId, opts) / h.pHit
    const frac = odds.expectedDamage(ctx.q, ctx.bundle, c.attackerId, c.targetId, opts).expected / hpLeft(ctx, c.targetId)
    return pKill >= 0.25 || frac >= 0.5 ? use : keep
  } catch {
    return keep
  }
}

/** charge.marker: green when pHit < 0.6, else black. */
export const chargeDie: Policy = (ctx) => {
  const green = ctx.legal.find((a) => a.colour === 'green'), black = ctx.legal.find((a) => a.colour === 'black')
  if (!green || !black) return ctx.legal[0] ?? null
  const c = ctx.pending.context as { modelId?: string; targetId?: string }
  if (!c.modelId || !c.targetId) return black
  try {
    const at = contactPoint(ctx, c.modelId, c.targetId)
    const q = at ? withModelAt(ctx.q, c.modelId, at) : ctx.q
    const h = odds.hitOdds(q, ctx.bundle, c.modelId, c.targetId, { band: 'melee' })
    return h.pHit > 0 && h.pHit < 0.6 ? green : black
  } catch {
    return black
  }
}

/** battleCry.push: shove when the end spot scores better than staying. */
export const battleCryPush: Policy = (ctx) => {
  const push = ctx.legal.find((a) => a.push === true), stay = ctx.legal.find((a) => a.push === false)
  if (!push || !stay) return null
  const c = ctx.pending.context as { modelId?: string; targetId?: string; colour?: string }
  const me = c.modelId ? ctx.view.models[c.modelId] : undefined, foe = c.targetId ? ctx.view.models[c.targetId] : undefined
  if (!me || !foe) return push
  const threats = threatsFor(ctx)
  let inches = 2
  try { inches = Math.min(4, rulerInches(ctx.bundle, (c.colour ?? 'yellow') as never)) } catch { /* keep the default */ }
  const d = Math.max(1e-6, dist(me.pos, foe.pos))
  const end = { x: me.pos.x + ((foe.pos.x - me.pos.x) / d) * inches, z: me.pos.z + ((foe.pos.z - me.pos.z) / d) * inches }
  const gain = positionValue(ctx, me.id, end, threats).value - positionValue(ctx, me.id, me.pos, threats).value
  return gain >= -1e-9 ? push : stay
}

/** melee.slide: moves.bestSlide. */
export const slide: Policy = (ctx) => bestSlide(ctx, threatsFor(ctx))

/** react.offer: take a reaction when it beats holding the marker (tier.reactions). */
export const reaction: Policy = (ctx) => {
  const pass = ctx.legal.find((a) => a.type === 'react.pass')
  const takes = ctx.legal.filter((a) => a.type === 'react.take')
  if (!pass || !takes.length) return null
  const c = ctx.pending.context as { modelId?: string; sourceId?: string }
  const rid = c.modelId ?? str(takes[0]!.modelId)
  const innerOf = (a: Action) => (a.inner ?? {}) as { type?: string; weaponUid?: string; targetId?: string }
  const attacks = takes.filter((a) => ATTACK_TYPE.test(str(innerOf(a).type)))
  if (ctx.tier.reactions === 'attacks') return attacks[0] ?? pass
  // The marker is spent at the end of the round anyway: hold it only against a near-worthless attack.
  const hold = ctx.tier.wPrepare * 0.04 * worth(ctx, rid)
  const rows: Scored<Action>[] = []
  for (const a of attacks) {
    const inner = innerOf(a)
    const target = str(inner.targetId) || str(c.sourceId)
    if (!target) continue
    const opts: query.AttackOpts = { reaction: true, quick: true, ...(inner.weaponUid ? { weaponUid: inner.weaponUid } : {}) }
    const s = inner.type?.startsWith('charge') ? atk(ctx, rid, target, { band: 'melee', quick: true, reaction: true }, contactPoint(ctx, rid, target) ?? undefined)
      : inner.type?.startsWith('melee') ? atk(ctx, rid, target, { ...opts, band: 'melee' }) : bestRanged(ctx, rid, str(inner.weaponUid), opts)
    rows.push({ action: a, score: s })
  }
  const best = pickBest(ctx, rows)
  return best && best.score.value > hold ? best.action : pass
}

/** item.choose: healing branch when damaged, else the first. */
export const itemBranch: Policy = (ctx) => {
  const opts = ctx.legal.filter((a) => a.type === 'item.choose')
  if (!opts.length) return null
  const c = ctx.pending.context as { modelId?: string; itemId?: string }
  const me = c.modelId ? ctx.view.models[c.modelId] : undefined
  const def = c.itemId ? itemDef(ctx, c.itemId) : undefined
  if (me && me.damage + me.rad > 0 && def) {
    const choose = (def.effects as { op?: string; options?: unknown[][] }[]).find((e) => e.op === 'choose')
    let best: Action | null = null, bestHeal = 0
    for (const a of opts) {
      const h = healOf(choose?.options?.[Number(a.index)])
      if (h > bestHeal) { bestHeal = h; best = a }
    }
    if (best) return best
  }
  return [...opts].sort((a, b) => Number(a.index) - Number(b.index))[0]!
}

/** search.found: keep unless it is useless to the model (never, at present: every found item has some use). */
export const keepFound: Policy = (ctx) => ctx.legal.find((a) => a.type === 'search.keep') ?? null

/** Dispatch table used by decider.ts (spec 30 s3). */
export const POLICIES: PolicyTable = {
  'turn.start': pickOnly,
  'turn.first': firstTurn,
  'turn.ready': readyModel,
  'turn.choose': useOrPass,
  'turn.pick': pickModel,
  'turn.activation': activationMenu,
  'move.path': movePath,
  'shoot.target': pickTarget,
  'throw.target': pickTarget,
  'shoot.luck': useLuck,
  'throw.luck': useLuck,
  'melee.luck': useLuck,
  'charge.marker': chargeDie,
  'battleCry.push': battleCryPush,
  'melee.slide': slide,
  'react.offer': reaction,
  'item.choose': itemBranch,
  'search.found': keepFound,
}

/** Exposed for tests: the action a policy returned, or null. */
export const runPolicy = (p: Policy | undefined, ctx: AiContext): Action | null => (p ? p(ctx) : null)
