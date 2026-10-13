// Responses and activity lists (spec 18 s3.3-3.8, s4; CH p11-16; AIRF). Each call plans ONE Action from the top of
// the list (re-walked before every Action, CH p16) and returns the concrete answer to the open decision.
import type { AiCardDef, EditionBundle } from '../../data/types'
import { engagedWith, isEngaged, rangeBandOf } from '../../engine/attack'
import { rulerInches } from '../../engine/edition'
import { baseDiameter, baseOnTable, baseRadius, isOnTable } from '../../engine/geometry'
import { hasLos } from '../../engine/los'
import { modelDistance } from '../../engine/measure'
import { moveColour, validateMove } from '../../engine/movement'
import * as query from '../../engine/query'
import { isRejection } from '../../engine/registry'
import type { Action, GameState, Id, MarkerState, ModelState, PendingDecision, Vec2 } from '../../engine/types'
import { clearLine, fieldAt, pathLength, routeDown } from '../nav'
import type { AiView } from '../types'
import { withModelAt } from '../world'
import { legalObjectTargets } from '../../engine/attack'
import { objectGap, withProbe } from '../../engine/objects'
import { canDoObjective } from './objectives'
import { chooseWeapon, defendThreat, rankTargets, shootable, validTargets, type RankFor } from './targeting'
import type { AiDecisionLog, AiMethod, AiResponse, AiSettings, ResolvedCell, ResolvedSubject, TargetRanking } from './types'
import { centreDistance, enemiesOf, exposure, fieldFor, friendsOf, qOf, weaponDefOf } from './util'

/** Everything a response step needs for one decision. */
export interface ResponseCtx {
  view: AiView
  bundle: EditionBundle
  pending: PendingDecision
  legal: readonly Action[]
  me: ModelState
  card: AiCardDef
  cell: ResolvedCell
  settings: AiSettings
  subject: ResolvedSubject
  actionIndex: 0 | 1 | 'quick'
  accepts: (a: Action) => boolean
  /** Seeded tie-break / coin: deriveSeed(seed, key). */
  pickTie: (among: Id[], key: string) => Id
  coin: (key: string) => boolean
}

/** What to do with the follow-up decisions of the Action just chosen (move path, shot target, ...). */
export type Intent =
  | { kind: 'move'; req: MoveReq }
  | { kind: 'shoot'; targetId: Id; targetKind: 'model' | 'marker'; weaponUid: string }
  | { kind: 'none' }

/** A planned step: the answer plus the log fields it fills (performed, chain, activity, weapon, target, ranking). */
export interface Planned {
  action: Action
  log: Pick<AiDecisionLog, 'performed' | 'chain' | 'activity'> & Partial<Pick<AiDecisionLog, 'weapon' | 'target' | 'ranking'>>
  intent?: Intent
}

// ---------------------------------------------------------------------------------------------------------------------
// Targets as models or scenario objects
// ---------------------------------------------------------------------------------------------------------------------
export interface Tgt { id: Id; kind: 'model' | 'marker'; pos: Vec2 }

const tgtOfModel = (m: ModelState): Tgt => ({ id: m.id, kind: 'model', pos: m.pos })
const markerOf = (view: AiView, id: Id): MarkerState | undefined => (view.markers ?? []).find((m) => m.id === id)

/** Edge-to-edge gap in inches from the model to a target. */
function gapTo(q: GameState, me: ModelState, t: Tgt): number {
  if (t.kind === 'model') { const m = q.models[t.id]; return m ? modelDistance(me, m) : Infinity }
  const mk = q.markers.find((x) => x.id === t.id)
  return mk ? objectGap({ ...q, models: { ...q.models, [me.id]: me } }, me.id, mk) : Infinity
}

/** Range band and line of sight from a spot (or the model where it stands) to a target for a ranged weapon. */
function shootBand(q: GameState, bundle: EditionBundle, me: ModelState, t: Tgt, uid: string): 'short' | 'long' | 'both' | null {
  try {
    if (t.kind === 'marker') {
      const mk = q.markers.find((x) => x.id === t.id)
      if (!mk) return null
      const p = withProbe(q, mk)
      const r = rangeBandOf(p.state, bundle, me.id, p.probeId, uid)
      return r.band !== null && hasLos(p.state, me.id, p.probeId) ? r.band : null
    }
    const r = rangeBandOf(q, bundle, me.id, t.id, uid)
    return r.band !== null && hasLos(q, me.id, t.id) ? r.band : null
  } catch { return null }
}

// ---------------------------------------------------------------------------------------------------------------------
// Movement planning
// ---------------------------------------------------------------------------------------------------------------------
export type MoveStop = 'full' | 'range' | 'charge' | 'moveReach' | 'contact' | 'onto' | 'objectContact' | 'disengage'
export interface MoveReq {
  /** Points to approach (the target's or Subject's position). */
  goals: Vec2[]
  /** The target the stop test is about. */
  target?: Tgt
  stop: MoveStop
  weaponUid?: string
  /** Careful movement (CH p10): at least half the Move, ending at the safest spot. */
  careful: boolean
  /** The route may not end touching an enemy (M and the approach steps; CH p13). */
  noEngage: boolean
}

const quickOf = (ctx: ResponseCtx): boolean => ctx.actionIndex === 'quick'
const EPS = 1e-6

function allowanceOf(ctx: ResponseCtx): number {
  const q = qOf(ctx.view, ctx.bundle)
  const colour = moveColour(q, ctx.bundle, ctx.me.id, { quick: quickOf(ctx) })
  return rulerInches(ctx.bundle, colour) + baseDiameter(ctx.me.base)
}

/** Engine check of a whole path (allowance, blocking, end spot). At a move.path decision the full dry run is used. */
function pathOk(ctx: ResponseCtx, path: Vec2[]): boolean {
  if (!path.length) return false
  const q = qOf(ctx.view, ctx.bundle)
  const r = validateMove(q, ctx.bundle, ctx.me.id, path, { quick: quickOf(ctx) })
  if (isRejection(r)) return false
  if (ctx.pending.kind === 'move.path') {
    const to = ctx.legal.find((a) => a.type === 'move.to')
    return !!to && ctx.accepts({ ...to, path })
  }
  return true
}

interface Sample { d: number; p: Vec2; path: Vec2[] }

/** Samples every half inch along a polyline (starting at the model), each with the waypoint list that reaches it. */
function sampleRoute(route: readonly Vec2[], maxLen: number, step = 0.5): Sample[] {
  const out: Sample[] = []
  let travelled = 0, next = step
  const corners: Vec2[] = []
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!
    const l = Math.hypot(b.x - a.x, b.z - a.z)
    if (l < EPS) continue
    const at = (d: number): Vec2 => ({ x: a.x + ((b.x - a.x) * (d - travelled)) / l, z: a.z + ((b.z - a.z) * (d - travelled)) / l })
    while (next < travelled + l - EPS && next <= maxLen + EPS) {
      const p = at(next)
      out.push({ d: next, p, path: [...corners, p] })
      next += step
    }
    if (travelled + l > maxLen + EPS) {
      if (maxLen - (out[out.length - 1]?.d ?? 0) > 0.05) { const p = at(maxLen); out.push({ d: maxLen, p, path: [...corners, p] }) }
      return out
    }
    travelled += l
    corners.push(b)
    out.push({ d: travelled, p: b, path: [...corners] })
  }
  return out
}

/** The approach routes: the straight line to the nearest goal and the walking route round walls. */
function routesTo(ctx: ResponseCtx, goals: readonly Vec2[], reach: number): Vec2[][] {
  const q = qOf(ctx.view, ctx.bundle)
  const me = ctx.me
  if (!goals.length) return []
  const near = [...goals].sort((a, b) => centreDistance(me.pos, a) - centreDistance(me.pos, b))[0]!
  const straight = [me.pos, near]
  const out: Vec2[][] = []
  let nav: Vec2[] | null = null
  try {
    const f = fieldFor(q, ctx.view, me, goals)
    const d = fieldAt(f, me.pos)
    if (Number.isFinite(d)) nav = routeDown(f, me.pos, reach)
    if (nav) nav = [me.pos, ...nav]
    // Prefer the walking route when the straight line is walled off.
    const walled = !clearLine(f.g, me.pos, near)
    if (nav && walled) out.push(nav)
    out.push(straight)
    if (nav && !walled) out.push(nav)
  } catch { out.push(straight) }
  return out
}

function touchesEnemy(ctx: ResponseCtx, at: Vec2): boolean {
  const r = baseRadius(ctx.me.base)
  return enemiesOf(ctx.view, ctx.me).some((e) => centreDistance(e.pos, at) < r + baseRadius(e.base) + 0.1)
}

/** Exact point on segment a->b where the distance to c first equals R (entering the circle), or null. */
function enterCircle(a: Vec2, b: Vec2, c: Vec2, R: number): Vec2 | null {
  const dx = b.x - a.x, dz = b.z - a.z
  const fx = a.x - c.x, fz = a.z - c.z
  const A = dx * dx + dz * dz
  if (A < EPS) return null
  const B = 2 * (fx * dx + fz * dz)
  const C = fx * fx + fz * fz - R * R
  if (C <= 0) return null // already inside
  const disc = B * B - 4 * A * C
  if (disc < 0) return null
  const t = (-B - Math.sqrt(disc)) / (2 * A)
  if (t < 0 || t > 1) return null
  return { x: a.x + dx * t, z: a.z + dz * t }
}

/** A route that ends exactly touching the target (Charge-less engagement) or just clear of an object's centre. */
function contactPlan(ctx: ResponseCtx, t: Tgt, reach: number): Vec2[] | null {
  const me = ctx.me
  const q = qOf(ctx.view, ctx.bundle)
  const isModel = t.kind === 'model'
  const tm = isModel ? q.models[t.id] : undefined
  const D = isModel ? baseRadius(me.base) + baseRadius(tm!.base) : baseRadius(me.base) + 0.1
  for (const route of routesTo(ctx, [t.pos], reach + D + 2)) {
    for (let i = 1; i < route.length; i++) {
      const hit = enterCircle(route[i - 1]!, route[i]!, t.pos, D)
      if (!hit) continue
      const path = [...route.slice(1, i), hit]
      if (pathLength(me.pos, path) > reach + EPS) break
      if (pathOk(ctx, path)) return path
      break
    }
  }
  return null
}

/** One scored end spot along a route. */
interface Cand { s: Sample; threat: number; cover: number }

/** Plan the path for a MoveReq, or null when nothing useful (at least 0.3 in) is possible this Action. */
export function planMove(ctx: ResponseCtx, req: MoveReq): Vec2[] | null {
  const q = qOf(ctx.view, ctx.bundle)
  const me = ctx.me
  const A = allowanceOf(ctx)
  if (A <= 0.3) return null
  const t = req.target
  if (req.stop === 'contact' || req.stop === 'objectContact') return t ? contactPlan(ctx, t, A) : null
  // A marker cannot be charged: the Charge stop is for models only (falls through to the next list step).
  if (req.stop === 'charge' && t?.kind === 'marker') return null
  if (req.stop === 'onto') {
    const goal = req.goals[0]
    if (!goal) return null
    if (t && t.kind === 'marker') return contactPlan(ctx, t, A)
    if (t && t.kind === 'model') return contactPlan(ctx, t, A)
    for (const route of routesTo(ctx, [goal], A + 2)) {
      const path = [...route.slice(1, -1), goal]
      if (pathLength(me.pos, path) <= A + EPS && pathOk(ctx, path)) return path
    }
    return null
  }
  const yellow = rulerInches(ctx.bundle, 'yellow')
  const moveReachIn = rulerInches(ctx.bundle, moveColour(q, ctx.bundle, me.id, { quick: quickOf(ctx) })) + baseDiameter(me.base)
  const chargeUnit = ctx.bundle.records.units.find((u) => u.id === me.profileId)
  const chargeReachIn = (chargeUnit ? rulerInches(ctx.bundle, chargeUnit.charge) : 0) + baseDiameter(me.base)

  const stopHit = (p: Vec2): boolean => {
    if (!t) return false
    const qq = withModelAt(q, me.id, p)
    const moved = qq.models[me.id]!
    switch (req.stop) {
      case 'range': return !!req.weaponUid && shootBand(qq, ctx.bundle, moved, t, req.weaponUid) !== null && gapTo(qq, moved, t) >= yellow - 0.05
      case 'charge': return t.kind === 'model' && gapTo(qq, moved, t) <= chargeReachIn - 0.05 && hasLos(qq, me.id, t.id)
      case 'moveReach': return gapTo(qq, moved, t) <= moveReachIn - 0.05
      default: return false
    }
  }
  // Already inside Charge or Move reach: this list step is spent, the next step moves (no 0.3 in creeping).
  if ((req.stop === 'charge' || req.stop === 'moveReach') && stopHit(me.pos)) return null
  const shootableOnly = req.stop === 'range'

  for (const route of routesTo(ctx, req.goals, A)) {
    const samples = sampleRoute(route, A - 0.02).filter((s) => s.d >= 0.3)
    const valid: Sample[] = []
    for (const s of samples) {
      if (!baseOnTable(q, s.p, baseRadius(me.base))) continue
      if (req.noEngage && touchesEnemy(ctx, s.p)) continue
      if (shootableOnly && t) {
        // Once Shoot is possible, no closer than Yellow (CH p12): a spot that can shoot from inside Yellow is refused.
        const qq = withModelAt(q, me.id, s.p)
        const moved = qq.models[me.id]!
        if (req.weaponUid && shootBand(qq, ctx.bundle, moved, t, req.weaponUid) !== null && gapTo(qq, moved, t) < yellow - 0.05) continue
      }
      if (pathOk(ctx, s.path)) valid.push(s)
    }
    if (!valid.length) continue
    // Range (CH p12): the farthest spot that can shoot next Action; the Yellow limit already trimmed the valid list.
    const shootableSpots = req.stop === 'range' && t ? valid.filter((s) => {
      const qq = withModelAt(q, me.id, s.p)
      return !!req.weaponUid && shootBand(qq, ctx.bundle, qq.models[me.id]!, t, req.weaponUid) !== null
    }) : []
    if (req.stop === 'range' && !shootableSpots.length) continue
    // Charge / Move reach: the first spot that gets within reach (then the next Action charges or closes).
    const stopAt = req.stop === 'range' ? shootableSpots[shootableSpots.length - 1] : valid.find((s) => stopHit(s.p))
    if (req.stop !== 'full' && !stopAt) continue
    const end = stopAt ?? valid[valid.length - 1]!
    if (!req.careful) return end.path
    // Careful (CH p13): at least half the Move, then the safest spot between there and the stop.
    const lo = Math.min(A * 0.5, end.d)
    const pool = req.stop === 'range' ? shootableSpots : valid
    const options: Cand[] = pool.filter((s) => s.d >= lo - 1e-9 && s.d <= end.d + 1e-9).map((s) => ({ s, ...exposure(q, ctx.bundle, ctx.view, me, s.p) }))
    if (!options.length) return end.path
    options.sort((a, b) => a.threat - b.threat || b.cover - a.cover || b.s.d - a.s.d)
    return options[0]!.s.path
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// Plan builders
// ---------------------------------------------------------------------------------------------------------------------
const LETTERS: readonly string[] = ['A', 'M', 'O', 'F', 'D', 'S']

function plan(ctx: ResponseCtx, action: Action, chain: string[], activity: string, extra: Partial<Planned['log']> = {}, intent?: Intent): Planned {
  const performed = ([...chain].reverse().find((c) => LETTERS.includes(c)) as AiResponse | undefined) ?? ctx.cell.response
  return { action, log: { performed, chain, activity, ...extra }, ...(intent ? { intent } : {}) }
}

const menu = (ctx: ResponseCtx): Action[] => ctx.legal.filter((a) => (a.quick === true) === quickOf(ctx))

function endPlan(ctx: ResponseCtx, chain: string[], why = 'turn.end'): Planned {
  const end = ctx.legal.find((a) => a.type === 'turn.end') ?? ctx.legal[ctx.legal.length - 1]!
  return plan(ctx, end, chain, why)
}

/** Pick one candidate with the card's priorities (models) or by distance (objects); returns it with the ranking. */
function choose(ctx: ResponseCtx, cands: Tgt[], rankFor: RankFor): { t: Tgt; ranking: TargetRanking } | null {
  if (!cands.length) return null
  const models = cands.filter((c) => c.kind === 'model').map((c) => ctx.view.models[c.id]!).filter(Boolean)
  const subjectIds = ctx.subject.ids
  if (models.length) {
    const ranking = rankTargets(ctx.view, ctx.bundle, ctx.me, ctx.card, ctx.cell, models, rankFor, subjectIds, ctx.pickTie)
    return ranking.winner ? { t: tgtOfModel(ctx.view.models[ranking.winner]!), ranking } : null
  }
  const sorted = [...cands].sort((a, b) => centreDistance(ctx.me.pos, a.pos) - centreDistance(ctx.me.pos, b.pos) || a.id.localeCompare(b.id))
  return { t: sorted[0]!, ranking: { candidates: cands.map((c) => c.id), steps: [], winner: sorted[0]!.id } }
}

const targetLog = (t: Tgt): { id: Id; kind: 'model' | 'marker' } => ({ id: t.id, kind: t.kind })

// ---------------------------------------------------------------------------------------------------------------------
// A: Attack
// ---------------------------------------------------------------------------------------------------------------------
interface AttackOpts { only?: readonly Id[]; strict?: boolean; skipO?: boolean; /** Never leave the spot: Close Combat strike or Shoot only (Fall Back at its point, ERR p.16). */ stationary?: boolean }

function candidatesFor(ctx: ResponseCtx, method: AiMethod, only?: readonly Id[]): Tgt[] {
  const markerIds = (only ?? []).filter((id) => markerOf(ctx.view, id))
  const out: Tgt[] = []
  if (only) {
    for (const id of only) {
      const m = ctx.view.models[id]
      if (m && isOnTable(m) && m.owner !== ctx.me.owner) out.push(tgtOfModel(m))
    }
    for (const id of markerIds) { const mk = markerOf(ctx.view, id)!; out.push({ id, kind: 'marker', pos: mk.pos }) }
    return out
  }
  void method
  return out
}

function attackInner(ctx0: ResponseCtx, chain: string[], o: AttackOpts): Planned | null {
  const { view, bundle, me, card } = ctx0
  const q = qOf(view, bundle)
  const engagedNow = engagedWith(q, me.id)
  // Underlined cell and engaged: stay put and fight (CH p15).
  const ctx: ResponseCtx = engagedNow.length && ctx0.cell.stayEngaged && ctx0.cell.method !== 'close'
    ? { ...ctx0, cell: { ...ctx0.cell, method: 'close' } } : ctx0
  const method = ctx.cell.method
  const weaponUid = chooseWeapon(view, bundle, me, card, method, { reckless: ctx.cell.reckless })
  if (!weaponUid) return null // no suitable weapon: no attack (CH p11)
  const def = weaponDefOf(q, bundle, me, weaponUid)
  const ns = def?.skill === 'throw' ? 'throw' : 'shoot'
  const m = menu(ctx)
  const careful = !ctx.cell.reckless
  const base = (extra: string[] = []): string[] => [...chain, ...extra]

  // ---- candidate set ----
  let cands: Tgt[]
  if (o.only) cands = candidatesFor(ctx, method, o.only)
  else cands = (method === 'close' ? enemiesOf(view, me) : enemiesOf(view, me)).map(tgtOfModel)
  if (!cands.length) return null

  if (method === 'close') {
    const reachable = (c: Tgt): boolean => c.kind === 'model' ? true : true
    cands = cands.filter(reachable)
    // Engaged and not underlined: assess Move into engagement first (CH p15).
    if (engagedNow.length) {
      const top = choose(ctx, cands.filter((c) => c.kind === 'model'), 'close')
      if (top && engagedNow.includes(top.t.id)) {
        const p = ccStep(ctx, [top.t], base(), m, weaponUid)
        if (p) return p
      } else if (top && !ctx.cell.stayEngaged && !o.stationary) {
        const path = planMove(ctx, { goals: [top.t.pos], target: top.t, stop: 'contact', careful, noEngage: false })
        if (path) return moveTo(ctx, base(['engaged']), 'cc.engage', path, top, { kind: 'move', req: { goals: [top.t.pos], target: top.t, stop: 'contact', careful, noEngage: false } })
      }
    }
    // 1. Close Combat
    const p1 = ccStep(ctx, cands, base(), m, weaponUid)
    if (p1) return p1
    if (o.stationary) return null
    // 2. Charge into engagement
    const chargeIds = new Set(m.filter((a) => a.type === 'charge.go').map((a) => String(a.targetId)))
    const c2 = cands.filter((c) => c.kind === 'model' && chargeIds.has(c.id))
    const ch = choose(ctx, c2, 'close')
    if (ch) {
      const act = m.find((a) => a.type === 'charge.go' && a.targetId === ch.t.id)!
      return plan(ctx, act, base(), 'cc.charge', { target: targetLog(ch.t), weapon: weaponUid, ranking: ch.ranking }, { kind: 'none' })
    }
    // 3. Move into engagement
    const near = cands.filter((c) => c.kind === 'model' || true)
    const f3 = feasible(ctx, near, (c) => ({ goals: [c.pos], target: c, stop: c.kind === 'model' ? 'contact' : 'objectContact', careful, noEngage: false }))
    const c3 = choose(ctx, f3.map((x) => x.t), 'move')
    if (c3) return moveWith(ctx, base(), 'cc.engage', f3, c3)
    if (o.strict) return null
    // 4. Move to within Charge distance, 5. within Move distance, 6. towards the enemy
    for (const [stop, activity] of [['charge', 'cc.approachCharge'], ['moveReach', 'cc.approachMove'], ['full', 'move.towardEnemy']] as const) {
      const f = feasible(ctx, stop === 'charge' ? cands.filter((c) => c.kind === 'model') : cands, (c) => ({ goals: [c.pos], target: c, stop, careful, noEngage: true }))
      const pick = choose(ctx, f.map((x) => x.t), 'move')
      if (pick) return moveWith(ctx, base(), activity, f, pick)
    }
  } else {
    // ---- Ranged ----
    // Engaged and not underlined: move clear so a Shoot is possible next Action instead of using the list (CH p15).
    if (engagedNow.length && !o.stationary) {
      const dis = disengage(ctx, cands, weaponUid, base(['engaged']))
      if (dis) return dis
    }
    // 1. Shoot
    const valid = new Set(validTargets(view, bundle, me, ctx.cell).map((x) => x.id))
    const beginAct = m.filter((a) => a.type === `${ns}.begin` && a.weaponUid === weaponUid && a.critical !== true)
    const markerOk = new Set<Id>()
    if (beginAct.length) for (const lt of legalObjectTargets(q, bundle, me.id, weaponUid)) markerOk.add(lt.markerId)
    const c1 = cands.filter((c) => (c.kind === 'model' ? (valid.has(c.id) && (!o.only || ctx.cell.reckless || !isEngaged(q, c.id))) : markerOk.has(c.id)))
    const sh = beginAct.length ? choose(ctx, c1, 'shoot') : null
    if (sh) {
      let act = beginAct[0]!
      if (me.heroic) {
        const band = sh.t.kind === 'model' ? rangeBandOf(q, bundle, me.id, sh.t.id, weaponUid).band : null
        const bands = band === 'both' ? ['short', 'long'] : band ? [band] : []
        const crit = m.find((a) => a.type === `${ns}.begin` && a.weaponUid === weaponUid && a.critical === true && bands.includes(String(a.band)))
        if (crit) act = crit
      }
      return plan(ctx, act, base(), 'ranged.shoot', { target: targetLog(sh.t), weapon: weaponUid, ranking: sh.ranking },
        { kind: 'shoot', targetId: sh.t.id, targetKind: sh.t.kind, weaponUid })
    }
    if (o.strict || o.stationary) return null
    // 2. Move so an enemy is in range next Action; 3. Move towards the enemy
    for (const [stop, activity] of [['range', 'ranged.approach'], ['full', 'move.towardEnemy']] as const) {
      const f = feasible(ctx, cands, (c) => ({ goals: [c.pos], target: c, stop, weaponUid, careful, noEngage: true }))
      const pick = choose(ctx, f.map((x) => x.t), 'move')
      if (pick) return moveWith(ctx, base(), activity, f, pick)
    }
  }
  return null
}

/** Close Combat (step 1): strike the best engaged valid target with the chosen weapon. */
function ccStep(ctx: ResponseCtx, cands: Tgt[], chain: string[], m: Action[], weaponUid: string): Planned | null {
  const opts = m.filter((a) => a.type === 'melee.attack' && a.weaponUid === weaponUid)
  const ids = new Set(cands.map((c) => c.id))
  const targetsIn = opts.filter((a) => a.critical !== true && ids.has(String(a.targetId ?? a.targetMarkerId)))
  if (!targetsIn.length) return null
  const tg: Tgt[] = [...new Set(targetsIn.map((a) => String(a.targetId ?? a.targetMarkerId)))].map((id) => cands.find((c) => c.id === id)!)
  const pick = choose(ctx, tg, 'close')
  if (!pick) return null
  const key = (a: Action): string => String(a.targetId ?? a.targetMarkerId)
  let act = targetsIn.find((a) => key(a) === pick.t.id)!
  if (ctx.me.heroic) { const crit = opts.find((a) => a.critical === true && key(a) === pick.t.id); if (crit) act = crit }
  return plan(ctx, act, chain, 'cc.strike', { target: targetLog(pick.t), weapon: weaponUid, ranking: pick.ranking }, { kind: 'none' })
}

/** Candidates for which a MoveReq yields a path. */
function feasible(ctx: ResponseCtx, cands: Tgt[], reqOf: (c: Tgt) => MoveReq): { t: Tgt; req: MoveReq; path: Vec2[] }[] {
  const out: { t: Tgt; req: MoveReq; path: Vec2[] }[] = []
  for (const c of cands) {
    const req = reqOf(c)
    if (req.stop === 'contact' || req.stop === 'objectContact') {
      const A = allowanceOf(ctx)
      if (c.kind === 'model' && gapTo(qOf(ctx.view, ctx.bundle), ctx.me, c) > A + 0.5) continue // cheap cut: cannot reach this Action
    }
    const path = planMove(ctx, req)
    if (path) out.push({ t: c, req, path })
  }
  return out
}

function moveWith(ctx: ResponseCtx, chain: string[], activity: string, f: { t: Tgt; req: MoveReq; path: Vec2[] }[], pick: { t: Tgt; ranking: TargetRanking }): Planned | null {
  const hit = f.find((x) => x.t.id === pick.t.id)
  if (!hit) return null
  const go = menu(ctx).find((a) => a.type === 'move.go')
  if (!go) return null
  return plan(ctx, go, chain, activity, { target: targetLog(pick.t), ranking: pick.ranking }, { kind: 'move', req: hit.req })
}

function moveTo(ctx: ResponseCtx, chain: string[], activity: string, path: Vec2[], pick: { t: Tgt; ranking: TargetRanking }, intent: Intent): Planned | null {
  void path
  const go = menu(ctx).find((a) => a.type === 'move.go')
  if (!go) return null
  return plan(ctx, go, chain, activity, { target: targetLog(pick.t), ranking: pick.ranking }, intent)
}

const bandRank = (b: 'short' | 'long' | 'both' | null): number => (b === null ? 9 : b === 'long' ? 1 : 0)

/** Engaged ranged model (CH p15): a spot clear of every enemy from which the intended target can still be shot, no harder, safer. */
function disengage(ctx: ResponseCtx, cands: Tgt[], weaponUid: string, chain: string[]): Planned | null {
  const { view, bundle, me } = ctx
  const q = qOf(view, bundle)
  const sees = cands.filter((c) => shootBand(q, bundle, me, c, weaponUid) !== null)
  const valid = new Set(validTargets(view, bundle, me, ctx.cell).map((x) => x.id))
  const pool = (sees.filter((c) => c.kind === 'marker' || valid.has(c.id)).length ? sees.filter((c) => c.kind === 'marker' || valid.has(c.id)) : cands)
  const pick = choose(ctx, pool, sees.length ? 'shoot' : 'move')
  if (!pick) return null
  const go = menu(ctx).find((a) => a.type === 'move.go')
  if (!go) return null
  const A = allowanceOf(ctx)
  const here = bandRank(shootBand(q, bundle, me, pick.t, weaponUid))
  let best: { p: Vec2; threat: number; cover: number; d: number } | null = null
  for (const frac of [1, 0.66, 0.33]) {
    for (let k = 0; k < 16; k++) {
      const ang = (k * Math.PI * 2) / 16
      const p = { x: me.pos.x + Math.cos(ang) * (A - 0.05) * frac, z: me.pos.z + Math.sin(ang) * (A - 0.05) * frac }
      if (!baseOnTable(q, p, baseRadius(me.base)) || touchesEnemy(ctx, p) || !pathOk(ctx, [p])) continue
      const qq = withModelAt(q, me.id, p)
      const moved = qq.models[me.id]!
      const band = shootBand(qq, bundle, moved, pick.t, weaponUid)
      if (band === null || bandRank(band) > here) continue
      const e = exposure(q, bundle, view, me, p)
      if (!best || e.threat < best.threat - 1e-9 || (Math.abs(e.threat - best.threat) < 1e-9 && (e.cover > best.cover || (e.cover === best.cover && frac < best.d)))) best = { p, ...e, d: frac }
    }
  }
  if (!best) return null
  const req: MoveReq = { goals: [best.p], target: pick.t, stop: 'disengage', weaponUid, careful: !ctx.cell.reckless, noEngage: true }
  return plan(ctx, go, chain, 'ranged.disengage', { target: targetLog(pick.t), ranking: pick.ranking, weapon: weaponUid }, { kind: 'move', req: { ...req, goals: [best.p] } })
}

/** The disengage spot is the single goal of its request: go straight there. */
function planDisengage(ctx: ResponseCtx, req: MoveReq): Vec2[] | null {
  const p = req.goals[0]
  return p && pathOk(ctx, [p]) ? [p] : null
}

/** Path for a move request at a move.path decision (the same plan as at menu time). */
export function pathFor(ctx: ResponseCtx, req: MoveReq): Vec2[] | null {
  return req.stop === 'disengage' ? planDisengage(ctx, req) : planMove(ctx, req)
}

export function attack(ctx: ResponseCtx, chain: string[], only?: readonly Id[]): Planned {
  return attackInner(ctx, chain, { only }) ?? endPlan(ctx, chain)
}

// ---------------------------------------------------------------------------------------------------------------------
// M, O, F, D, S
// ---------------------------------------------------------------------------------------------------------------------
function subjectTargets(ctx: ResponseCtx): Tgt[] {
  const s = ctx.subject
  if (s.kind === 'none') return []
  const out: Tgt[] = s.points.map((pos, i) => {
    const id = s.ids[i] ?? `point:${i}`
    return { id, kind: s.kind === 'marker' ? 'marker' as const : 'model' as const, pos }
  })
  return out
}

/** Nearest Subject by walking distance (fewest Moves, CH p13). */
function nearestSubject(ctx: ResponseCtx): Tgt | null {
  const q = qOf(ctx.view, ctx.bundle)
  const subs = subjectTargets(ctx)
  if (!subs.length) return null
  let best: { t: Tgt; d: number } | null = null
  for (const t of subs) {
    const d = walkDist(ctx, q, t.pos)
    if (!best || d < best.d - 1e-9) best = { t, d }
  }
  return best!.t
}

function walkDist(ctx: ResponseCtx, q: GameState, to: Vec2): number {
  try {
    const f = fieldFor(q, ctx.view, ctx.me, [to])
    const d = fieldAt(f, ctx.me.pos)
    return Number.isFinite(d) ? d : centreDistance(ctx.me.pos, to)
  } catch { return centreDistance(ctx.me.pos, to) }
}

/** Move toward (or onto) the Subject. `onto` ends touching / on it when it is within Move (ERR p.16). */
function moveToSubject(ctx: ResponseCtx, chain: string[], onto: boolean, activity = 'move.towardSubject'): Planned | null {
  const sub = nearestSubject(ctx)
  const go = menu(ctx).find((a) => a.type === 'move.go')
  if (!sub || !go) return null
  const careful = !ctx.cell.reckless
  const asTarget: Tgt | undefined = ctx.subject.kind === 'point' || ctx.subject.kind === 'edge' ? undefined : sub
  if (onto) {
    const req: MoveReq = { goals: [sub.pos], ...(asTarget ? { target: asTarget } : {}), stop: 'onto', careful, noEngage: false }
    const path = planMove(ctx, req)
    if (path) return plan(ctx, go, chain, 'move.ontoSubject', { target: targetLog(sub) }, { kind: 'move', req })
  }
  const req: MoveReq = { goals: [sub.pos], ...(asTarget ? { target: asTarget } : {}), stop: 'full', careful, noEngage: true }
  if (!planMove(ctx, req)) return null
  return plan(ctx, go, chain, activity, { target: targetLog(sub) }, { kind: 'move', req })
}

/** True when the nearest Subject can be reached with one Move (CH p13 "within Move"). */
function withinMove(ctx: ResponseCtx): boolean {
  const sub = nearestSubject(ctx)
  if (!sub) return false
  const req: MoveReq = { goals: [sub.pos], ...(ctx.subject.kind === 'point' || ctx.subject.kind === 'edge' ? {} : { target: sub }), stop: 'onto', careful: false, noEngage: false }
  return planMove(ctx, req) !== null
}

export function move(ctx: ResponseCtx, chain: string[], subject?: ResolvedSubject): Planned {
  const c = subject ? { ...ctx, subject } : ctx
  return moveInner(c, chain) ?? attackFallback(c, chain)
}

function moveInner(ctx: ResponseCtx, chain: string[]): Planned | null {
  if (ctx.subject.kind === 'none') return null
  // 1. Within Move of the Subject: perform O instead (Go To moves onto it, ERR p.16).
  if (!chain.includes('O') && withinMove(ctx)) {
    const o = objectiveInner(ctx, [...chain, 'O'])
    if (o) return o
  }
  // 2/3. Move towards the (nearest) Subject without engaging.
  return moveToSubject(ctx, chain, false)
}

/** No way to carry the Response out: attack instead (CH p13). */
function attackFallback(ctx: ResponseCtx, chain: string[]): Planned {
  return attackInner(ctx, [...chain, 'A'], {}) ?? endPlan(ctx, [...chain, 'A'])
}

function interactAction(ctx: ResponseCtx, ids: readonly Id[]): Action | null {
  const types = new Set(['search.interact', 'expertise.use', 'scenario.pickup', 'search.peek', 'item.pickup'])
  const opts = menu(ctx).filter((a) => types.has(a.type) && ids.includes(String(a.markerId)))
  if (!opts.length) return null
  return [...opts].sort((a, b) => a.type.localeCompare(b.type) || String(a.markerId).localeCompare(String(b.markerId)))[0]!
}

export function objective(ctx: ResponseCtx, chain: string[]): Planned {
  return objectiveInner(ctx, chain) ?? attackFallback(ctx, chain)
}

function objectiveInner(ctx: ResponseCtx, chain: string[]): Planned | null {
  const { settings, subject, view, bundle, me } = ctx
  if (!canDoObjective(view, bundle, me, settings, subject)) return null
  const base = [...chain, settings.objective]
  switch (settings.objective) {
    case 'defeat': return attackInner(ctx, [...base, 'A'], { only: subject.ids })
    case 'protect': return defendInner(ctx, [...base, 'D'])
    case 'goTo': return moveToSubject(ctx, [...base, 'M'], true)
    case 'use': {
      const act = interactAction(ctx, subject.ids)
      if (act) return plan(ctx, act, base, 'use.interact', { target: { id: String(act.markerId), kind: 'marker' } }, { kind: 'none' })
      const sub = nearestSubject(ctx)
      if (sub && sub.kind === 'marker') {
        const req: MoveReq = { goals: [sub.pos], target: sub, stop: 'objectContact', careful: !ctx.cell.reckless, noEngage: false }
        const go = menu(ctx).find((a) => a.type === 'move.go')
        if (go && planMove(ctx, req)) return plan(ctx, go, base, 'use.contact', { target: targetLog(sub) }, { kind: 'move', req })
      }
      return moveToSubject(ctx, [...base, 'M'], false)
    }
    default: return null
  }
}

export function fallBack(ctx: ResponseCtx, chain: string[]): Planned {
  const r = fallBackInner(ctx, chain)
  if (r === 'stay') return endPlan(ctx, [...chain, 'A'])
  return r ?? attackFallback(ctx, chain)
}

/** Planned step, null = no deployment point (attack instead), 'stay' = at the point with nothing to attack without moving. */
function fallBackInner(ctx: ResponseCtx, chain: string[]): Planned | null | 'stay' {
  const x = ctx.me.tokens.deployX, z = ctx.me.tokens.deployZ
  if (x === undefined || z === undefined) return null
  const point: ResolvedSubject = { kind: 'point', ids: [], points: [{ x, z }] }
  const c = { ...ctx, subject: point }
  const atPoint = centreDistance(ctx.me.pos, point.points[0]!) <= 0.5
  if (!atPoint) return moveToSubject(c, [...chain, 'M'], true, 'fallback.move')
  // At the deployment point: perform A without leaving it (a step that needs a move is skipped, ERR p.16).
  return attackInner(c, [...chain, 'A'], { stationary: true }) ?? 'stay'
}

export function defend(ctx: ResponseCtx, chain: string[]): Planned {
  return defendInner(ctx, chain) ?? attackFallback(ctx, chain)
}

function defendInner(ctx: ResponseCtx, chain: string[]): Planned | null {
  const sub = nearestSubject(ctx)
  if (!sub) return null
  const { view, bundle, me, card } = ctx
  const q = qOf(view, bundle)
  let cell = ctx.cell
  const threat = defendThreat(view, bundle, me, card, cell, sub.pos, ctx.pickTie)
  if (!threat.winner) return moveInner({ ...ctx }, [...chain, 'M'])
  // Careful: a ranged model whose Subject is engaged with the threat uses Close Combat instead (CH p14).
  if (!cell.reckless && cell.method === 'ranged' && sub.kind === 'model' && engagedWith(q, sub.id).includes(threat.winner)) {
    cell = { ...cell, method: 'close' }
  }
  const c: ResponseCtx = { ...ctx, cell }
  const atk = attackInner(c, [...chain, 'A'], { only: [threat.winner], strict: true })
  if (atk) return { ...atk, log: { ...atk.log, ranking: atk.log.ranking ?? threat } }
  // The threat can neither be attacked nor engaged with this Action: move towards the Subject instead.
  return moveToSubject(ctx, [...chain, 'M'], false, 'defend.move')
}

const SETUP_ACTIVITIES: ReadonlySet<string> = new Set(['cc.approachCharge', 'cc.approachMove', 'ranged.approach'])

export function strike(ctx: ResponseCtx, chain: string[]): Planned {
  const atk = attackInner(ctx, [...chain, 'A'], { strict: true })
  if (atk) return atk
  // ERR p.16 judges the whole activation: a move now that sets up a strike or engagement next Action still counts as A.
  if (ctx.actionIndex === 0) {
    const setup = attackInner(ctx, [...chain, 'A'], {})
    if (setup && SETUP_ACTIVITIES.has(setup.log.activity)) return setup
  }
  return moveInner(ctx, [...chain, 'M']) ?? endPlan(ctx, chain)
}

// ---------------------------------------------------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------------------------------------------------
/** Dispatch on the Response to perform (starting from the printed one), applying the engaged rules first (CH p15). */
export function planAction(ctx: ResponseCtx): Planned {
  const { me, view, bundle } = ctx
  const q = qOf(view, bundle)
  if (me.conditions.includes('stunned')) {
    const shake = ctx.legal.find((a) => a.type === 'move.shakeOff')
    if (shake) return plan(ctx, shake, ['stunned'], 'move.shakeOff')
  }
  const printed: AiResponse = ctx.settings.forceResponse ?? ctx.cell.response
  const chain: string[] = [printed]
  const engaged = engagedWith(q, me.id).length > 0
  // An underlined cell on an engaged model: stay and fight with the Close Combat Method (CH p15).
  if (engaged && ctx.cell.stayEngaged) {
    const c: ResponseCtx = { ...ctx, cell: { ...ctx.cell, method: 'close' } }
    return attackInner(c, [...chain, 'stay', 'A'], {}) ?? endPlan(c, [...chain, 'stay', 'A'])
  }
  const live = (p: Planned | null): Planned => p ?? endPlan(ctx, chain)
  switch (printed) {
    case 'A': return live(attackInner(ctx, chain, {}) ?? (chain.includes('O') ? null : objectiveInner(ctx, [...chain, 'O'])))
    case 'M': return move(ctx, chain)
    case 'O': return objective(ctx, chain)
    case 'F': return fallBack(ctx, chain)
    case 'D': return defend(ctx, chain)
    case 'S': return strike(ctx, chain)
    default: return endPlan(ctx, chain)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Push Back and Slide
// ---------------------------------------------------------------------------------------------------------------------
/** Push Back follow-up (CH p15): charged -> yes; printed A -> close Method; printed O/D (and M/F, RULING) -> Reckless. */
export function followUpPushBack(printed: AiResponse, method: 'close' | 'ranged', reckless: boolean, charged: boolean): boolean {
  if (charged) return true
  if (printed === 'A') return method === 'close'
  return reckless // O and D (CH p15); M, F and S read the same way (RULING)
}

/** Slide answer after an AI close combat attack: away from the Subject when the enemy could reach it (CH p15). */
export function slide(ctx: ResponseCtx): Action {
  const tpl = ctx.legal.find((a) => a.type === 'melee.slide')
  if (!tpl) return ctx.legal[0]!
  const c = ctx.pending.context as { modelId?: Id; engagedBefore?: Id[] }
  const me = ctx.view.models[c.modelId ?? ctx.me.id] ?? ctx.me
  const foes = (c.engagedBefore ?? []).map((id) => ctx.view.models[id]).filter((m): m is ModelState => !!m && isOnTable(m))
  if (!foes.length) return tpl
  // Subject positions, plus AI models touching the Subject (they count as the Subject, CH p15).
  const pts: { p: Vec2; r: number }[] = []
  for (const t of subjectTargets(ctx)) {
    const mk = t.kind === 'marker' ? markerOf(ctx.view, t.id) : undefined
    const m = t.kind === 'model' ? ctx.view.models[t.id] : undefined
    const r = m ? baseRadius(m.base) : mk ? 0.5 : 0
    pts.push({ p: t.pos, r })
    for (const f of friendsOf(ctx.view, me)) if (centreDistance(f.pos, t.pos) <= r + baseRadius(f.base) + 0.15) pts.push({ p: f.pos, r: baseRadius(f.base) })
  }
  if (!pts.length) return tpl
  const rm = baseRadius(me.base)
  const reachable = foes.some((f) => pts.some((s) => {
    const R = rm + baseRadius(f.base), Rs = baseRadius(f.base) + s.r
    const D = centreDistance(me.pos, s.p)
    return D >= Math.abs(R - Rs) - 0.05 && D <= R + Rs + 0.05
  }))
  if (!reachable) return tpl
  const q = qOf(ctx.view, ctx.bundle)
  const away = (p: Vec2): number => Math.min(...pts.map((s) => centreDistance(p, s.p)))
  const f0 = foes[0]!
  const R0 = rm + baseRadius(f0.base)
  let best: { p: Vec2; v: number } | null = null
  for (let k = 0; k < 120; k++) {
    const ang = (k * Math.PI * 2) / 120
    const p = { x: f0.pos.x + Math.cos(ang) * R0, z: f0.pos.z + Math.sin(ang) * R0 }
    if (!baseOnTable(q, p, rm)) continue
    if (!foes.every((f) => Math.abs(centreDistance(p, f.pos) - (rm + baseRadius(f.base))) < 1e-6)) continue
    const v = away(p)
    if (best && v <= best.v) continue
    if (ctx.accepts({ ...tpl, path: [p] })) best = { p, v }
  }
  if (!best || best.v <= away(me.pos) + 0.05) return tpl
  return { ...tpl, path: [best.p] }
}
