// Official AI responses (spec 18 s8.5-8.6): a matrix letter (A, M, O, F, D, S) becomes one concrete Activity per
// Action, then an engine Action (menu option, move path, target row, sub-decision answer). Every answer is one of
// the engine's legal options; nothing is invented.
import { engagedWith } from '../../engine/attack'
import { baseOnTable, baseRadius } from '../../engine/geometry'
import { hasLos } from '../../engine/los'
import { modelDistance } from '../../engine/measure'
import type { Action, ModelId, Vec2 } from '../../engine/types'
import { allowance, cutAccepted, detour, freeSpot } from '../moves'
import { fieldAt, navField, navGrid, routeDown, truncatePath, withBlockers } from '../nav'
import * as odds from '../odds'
import { itemBranch } from '../policies'
import { reachOf } from '../threat'
import { dist, enemiesOf, live, withModelAt } from '../world'
import { cardOfModel, planFor, resolveSubject } from './procedure'
import { bestWeapon, engagedWithFriendly, rankTargets, validTargets } from './targeting'
import type { ActivationPlan, Activity, CombatMethod, OfficialContext } from './types'

// ---------- small helpers ----------
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const bearing = (a: Vec2, b: Vec2): number => Math.atan2(b.z - a.z, b.x - a.x)
const polar = (from: Vec2, ang: number, r: number): Vec2 => ({ x: from.x + Math.cos(ang) * r, z: from.z + Math.sin(ang) * r })
const ATTACK_TYPE = /^(shoot|throw|melee|charge)\./

/** Per-decision flags set by the bounce guard (a menu pick that came straight back is not repeated). */
interface Flags { noMove: boolean; skip: Set<string> }
const flagsOf = new WeakMap<OfficialContext, Flags>()
const flags = (ctx: OfficialContext): Flags => { let f = flagsOf.get(ctx); if (!f) flagsOf.set(ctx, (f = { noMove: false, skip: new Set() })); return f }

/** Menu rows of one type for the Action being chosen (Quick rows only when the activity is a Quick Action). */
const rows = (ctx: OfficialContext, type: string, quick = false): Action[] => ctx.legal.filter((a) => a.type === type && (a.quick === true) === quick)
const canMove = (ctx: OfficialContext, quick = false): boolean => !flags(ctx).noMove && rows(ctx, 'move.go', quick).length > 0

/** Subject point nearest to the model, or null. */
function nearestSubject(ctx: OfficialContext, plan: ActivationPlan): { pos: Vec2; id: string; d: number; marker: boolean } | null {
  const me = ctx.view.models[plan.modelId]
  if (!me) return null
  const set = resolveSubject(ctx, plan.modelId, plan.setting.subject)
  let best: { pos: Vec2; id: string; d: number; marker: boolean } | null = null
  const consider = (pos: Vec2, id: string, marker: boolean) => {
    const d = dist(me.pos, pos)
    if (!best || d < best.d - 1e-9) best = { pos, id, d, marker }
  }
  set.models.forEach((id) => { const m = ctx.view.models[id]; if (m) consider(m.pos, id, false) })
  set.markers.forEach((id, i) => consider(set.points[set.models.length + i] ?? me.pos, id, true))
  return best
}

/** Resolved Subject of the plan (Importance ranks by distance to it and excludes it, ERR p.16). */
const subjectOf = (ctx: OfficialContext, plan: ActivationPlan) => resolveSubject(ctx, plan.modelId, plan.setting.subject)

/** Arrival at a Subject: marker goals count within the base radius plus half an inch (a model cannot end on a marker). */
const arrived = (ctx: OfficialContext, plan: ActivationPlan, s: { d: number; marker: boolean }): boolean => {
  const me = ctx.view.models[plan.modelId]
  return s.marker && me ? s.d <= baseRadius(me.base) + 0.5 : s.d < 0.5
}

const mk = (plan: ActivationPlan, a: Omit<Activity, 'as'> & { as?: Activity['as'] }): Activity => ({ as: plan.pick.response, ...a })

// ---------- attack (A) ----------
/** A: attack from where it stands. Ranged first when both methods are listed (R-10). */
function attackNow(ctx: OfficialContext, plan: ActivationPlan, only?: readonly string[], o: { noMove?: boolean } = {}): Activity | null {
  const id = plan.modelId, card = cardOfModel(ctx, id)
  if (!card) return null
  const skip = flags(ctx).skip
  const methods = (['ranged', 'close'] as CombatMethod[]).filter((m) => plan.pick.method.includes(m))
  for (const method of methods) {
    const cands = validTargets(ctx, id, plan.pick.attitude, method).filter((t) => (!only || only.includes(t)) && !skip.has(t))
    if (!cands.length) continue
    if (method === 'ranged') {
      const first = bestWeapon(ctx, id, cands[0]!, 'ranged')
      const ranking = rankTargets(ctx, card, id, cands, { ...(first ? { weaponUid: first } : {}), subject: subjectOf(ctx, plan) })
      for (const r of ranking.ranked) {
        const uid = bestWeapon(ctx, id, r.id, 'ranged')
        if (!uid) continue
        const begin = ctx.legal.filter((a) => /^(shoot|throw)\.begin$/.test(a.type) && a.weaponUid === uid && a.quick !== true)
        if (!begin.length) continue
        const kind = begin[0]!.type === 'throw.begin' ? 'throw' : 'shoot'
        return mk(plan, { kind, targetId: r.id, weaponUid: uid, critical: begin.some((a) => a.critical === true), reason: `ranged at ${r.id}` })
      }
    } else {
      const engaged = engagedWith(ctx.q, id)
      if (engaged.length) {
        const ranking = rankTargets(ctx, card, id, cands, { subject: subjectOf(ctx, plan) })
        for (const r of ranking.ranked) {
          const area = (uid: string) => plan.pick.attitude === 'careful' && closeAreaWeapon(ctx, id, uid)
          const uid = bestWeapon(ctx, id, r.id, 'close', area)
          if (!uid) continue
          const swings = ctx.legal.filter((a) => a.type === 'melee.attack' && a.weaponUid === uid && a.targetId === r.id && a.quick !== true)
          if (!swings.length) continue
          return mk(plan, { kind: 'closeCombat', targetId: r.id, weaponUid: uid, critical: swings.some((a) => a.critical === true), reason: `close combat with ${r.id}` })
        }
      } else if (!o.noMove) {
        // A Careful close fighter prefers enemies already engaged with a friendly (FC p1).
        const pref = plan.pick.attitude === 'careful' ? cands.filter((c) => engagedWithFriendly(ctx, c)) : []
        const ranking = rankTargets(ctx, card, id, cands, { subject: subjectOf(ctx, plan), ...(pref.length ? { preferred: pref } : {}) })
        for (const r of ranking.ranked) {
          if (rows(ctx, 'charge.go').some((a) => a.targetId === r.id)) return mk(plan, { kind: 'charge', targetId: r.id, reason: `charge ${r.id}` })
        }
      }
    }
  }
  return null
}

/** True when a weapon has an area damage entry (Careful never uses one in close combat, ERR p.16). */
function closeAreaWeapon(ctx: OfficialContext, id: ModelId, uid: string): boolean {
  const c = ctx.view.models[id]?.carried.find((x) => x.uid === uid)
  const def = c ? ctx.bundle.records.weapons.find((w) => w.id === c.defId) : undefined
  return !!def?.damage.some((d) => d.area)
}

/** Move to a spot from which the top-priority enemy can be attacked next Action. */
function moveToAttack(ctx: OfficialContext, plan: ActivationPlan, only?: readonly string[]): Activity | null {
  if (!canMove(ctx)) return null
  const id = plan.modelId, card = cardOfModel(ctx, id), me = ctx.view.models[id]
  if (!card || !me) return null
  const foes = enemiesOf(ctx.view, ctx.seat).map((e) => e.id).filter((t) => !only || only.includes(t))
  if (!foes.length) return null
  const methods = (['ranged', 'close'] as CombatMethod[]).filter((m) => plan.pick.method.includes(m))
  const hasGun = reachOf(ctx, id).range > 0
  for (const method of methods) {
    if (method === 'ranged' && !hasGun) continue
    const ranking = rankTargets(ctx, card, id, foes, { subject: subjectOf(ctx, plan) })
    const top = ranking.ranked[0]
    const foe = top ? ctx.view.models[top.id] : undefined
    if (!top || !foe) continue
    if (method === 'ranged') return mk(plan, { kind: 'moveToRange', targetId: top.id, reason: `toward ${top.id}` })
    // Close ladder (R2 #8, FC p1): move into engagement > within Charge > within Move > toward.
    const r = reachOf(ctx, id), edge = modelDistance(me, foe)
    const kind = edge <= r.move ? 'moveEngage' : edge - r.move <= r.charge ? 'moveToCharge' : edge - r.move <= r.move ? 'moveToMove' : 'moveToward'
    return mk(plan, { kind, targetId: top.id, reason: `${kind} ${top.id}` })
  }
  return null
}

/** A: close ladder (FC p1) or ranged ladder (FC p5) by the row's methods (R-10). */
export function attackActivity(ctx: OfficialContext, plan: ActivationPlan, only?: string[]): Activity | null {
  return attackNow(ctx, plan, only) ?? moveToAttack(ctx, plan, only)
}

// ---------- engaged first ----------
/**
 * Engaged branch first (FC p2, CH p16 ex. 3): an underlined cell always stays in close combat, whatever the row's
 * methods; a plain A also fights close; any other plain response breaks off toward its own goal.
 */
export function engagedActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const engaged = engagedWith(ctx.q, plan.modelId)
  if (!engaged.length) return null
  const r = plan.pick.response
  if (plan.pick.stayEngaged || r === 'A') {
    if (!ctx.legal.some((a) => a.type === 'melee.attack')) return null
    const own = { ...plan, pick: { ...plan.pick, method: ['close' as const] } }
    const hit = attackNow(ctx, own)
    if (hit || plan.pick.stayEngaged) return hit
    return null
  }
  return disengageActivity(ctx, plan, engaged)
}

/** Break off from close combat toward the response's own goal (F: deployment point; M/O/D/S: the Subject). */
function disengageActivity(ctx: OfficialContext, plan: ActivationPlan, engaged: ModelId[]): Activity | null {
  if (!canMove(ctx)) return null
  const me = ctx.view.models[plan.modelId]
  if (!me) return null
  const r = plan.pick.response
  let goal: Vec2 | undefined, subjectId: string | undefined
  if (r === 'F') {
    const home = ctx.official.deploy[plan.modelId]
    if (home && dist(me.pos, home) > 1.5) goal = home
  } else {
    const s = nearestSubject(ctx, plan)
    if (s && !engaged.includes(s.id)) { goal = s.pos; subjectId = s.id }
  }
  if (!goal) return null // nowhere better to go: keep fighting
  return mk(plan, { kind: 'disengage', goal, ...(subjectId ? { subjectId } : {}), reason: 'break off (not underlined)' })
}

// ---------- move (M) ----------
/** M: toward the nearest Subject, never attacking or engaging; Subject within Move -> O (R-11). */
export function moveActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const s = nearestSubject(ctx, plan)
  if (!s) return null
  if (s.d <= reachOf(ctx, plan.modelId).move) return objectiveActivity(ctx, plan)
  if (!canMove(ctx)) return null
  return mk(plan, { as: 'M', kind: 'moveToward', goal: s.pos, subjectId: s.id, reason: `toward subject ${s.id}` })
}

// ---------- objective (O) ----------
const INTERACT = ['search.interact', 'expertise.use', 'scenario.pickup', 'item.pickup'] as const

/** O: Defeat -> A on the Subject only; Protect -> D; Go To -> M; Use -> interact / move into contact / M. */
export function objectiveActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const { objective } = plan.setting
  const s = nearestSubject(ctx, plan)
  const as = 'O' as const
  if (objective === 'defeat') {
    const set = resolveSubject(ctx, plan.modelId, plan.setting.subject)
    const hit = set.models.length ? attackActivity(ctx, plan, set.models) : null
    if (hit) return hit
    // A marker-only Subject (the rocket): the engine has no object targets yet (SHOT-003), so walk up to it.
    if (!set.models.length && s?.marker && !arrived(ctx, plan, s) && canMove(ctx)) return mk(plan, { as, kind: 'moveToward', goal: s.pos, subjectId: s.id, reason: `close on ${s.id}` })
    return attackActivity(ctx, plan)
  }
  if (objective === 'protect') return defendActivity(ctx, plan) ?? attackActivity(ctx, plan)
  if (!s) return plan.setting.subject === 'next-route-marker' ? null : attackActivity(ctx, plan) // an unrouted patrol holds position
  if (objective === 'goTo') {
    if (arrived(ctx, plan, s)) return attackActivity(ctx, plan)
    return canMove(ctx) ? mk(plan, { as, kind: 'moveToward', goal: s.pos, subjectId: s.id, reason: `go to ${s.id}` }) : null
  }
  // use
  const set = resolveSubject(ctx, plan.modelId, plan.setting.subject)
  for (const type of [...INTERACT, 'search.peek'] as const) {
    const row = rows(ctx, type).find((a) => set.markers.includes(str(a.markerId)))
    if (row) return mk(plan, { as, kind: type === 'search.peek' ? 'peek' : 'interact', subjectId: str(row.markerId), reason: `use ${str(row.markerId)}` })
  }
  if (arrived(ctx, plan, s)) return attackActivity(ctx, plan)
  return canMove(ctx) ? mk(plan, { as, kind: 'moveContact', goal: s.pos, subjectId: s.id, reason: `to use ${s.id}` }) : attackActivity(ctx, plan)
}

// ---------- fall back (F) ----------
/** Summed cover steps the enemy nearest three would face against a model standing at `at` (higher is safer). */
function coverScore(ctx: OfficialContext, id: ModelId, at: Vec2): number {
  const q = withModelAt(ctx.q, id, at)
  const foes = enemiesOf(ctx.view, ctx.seat).sort((a, b) => dist(a.pos, at) - dist(b.pos, at)).slice(0, 3)
  let s = 0
  for (const e of foes) {
    try { s += hasLos(q, e.id, id) ? odds.coverFor(q, ctx.bundle, e.id, id).count : 3 } catch { /* no verdict */ }
  }
  return s
}

/** F: toward the deployment point; there: Careful finds better cover, else A without moving (R-13). */
export function fallBackActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const id = plan.modelId, me = ctx.view.models[id], home = ctx.official.deploy[id]
  if (!me || !home) return attackNow(ctx, plan, undefined, { noMove: true })
  if (dist(me.pos, home) > 1.5 && canMove(ctx)) return mk(plan, { as: 'F', kind: 'fallBack', goal: home, reason: 'toward deployment point' })
  if (plan.pick.attitude === 'careful' && canMove(ctx)) {
    const r = baseRadius(me.base)
    let best: { at: Vec2; s: number } | null = null
    const here = coverScore(ctx, id, me.pos)
    for (const rad of [1.5, 3]) {
      for (let i = 0; i < 8; i++) {
        const at = polar(home, (i * Math.PI) / 4, rad)
        if (!baseOnTable(ctx.q, at, r) || !freeSpot(ctx, id, at)) continue
        const s = coverScore(ctx, id, at)
        if (s > here && (!best || s > best.s)) best = { at, s }
      }
    }
    if (best) return mk(plan, { as: 'F', kind: 'moveSafer', goal: best.at, reason: 'better cover near deployment point' })
  }
  return attackNow(ctx, plan, undefined, { noMove: true }) // at the deployment point F attacks without moving (ERR p.16)
}

// ---------- defend (D) ----------
/** D: rank enemies from the Subject's position, attack the top one, else move toward the Subject (R-12). */
export function defendActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const id = plan.modelId, card = cardOfModel(ctx, id), me = ctx.view.models[id]
  const s = nearestSubject(ctx, plan)
  if (!card || !me || !s) return null
  const foes = enemiesOf(ctx.view, ctx.seat).map((e) => e.id).filter((t) => t !== s.id)
  if (foes.length) {
    const top = rankTargets(ctx, card, id, foes, { from: s.pos, subject: subjectOf(ctx, plan) }).ranked[0]
    if (top) {
      // Careful D: if the Subject is engaged with the target, fight it in close combat instead of shooting (R2 #10, FC p3).
      const close = plan.pick.attitude === 'careful' && engagedWith(ctx.q, top.id).includes(s.id)
      const hit = attackNow(ctx, close ? { ...plan, pick: { ...plan.pick, method: ['close' as const] } } : plan, [top.id])
      if (hit) return { ...hit, as: 'D' }
    }
  }
  if (s.d > 2.5 && canMove(ctx)) return mk(plan, { as: 'D', kind: 'moveToward', goal: s.pos, subjectId: s.id, reason: `stay close to ${s.id}` })
  return null
}

// ---------- strike (S) ----------
/** S: A if this activation can attack or engage, else M. */
export function strikeActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const now = attackNow(ctx, plan)
  if (now) return { ...now, as: 'A' }
  const me = ctx.view.models[plan.modelId]
  if (me) {
    const r = reachOf(ctx, plan.modelId)
    const reach = Math.max(r.move + r.charge, r.range > 0 ? r.move + r.range : 0)
    const near = enemiesOf(ctx.view, ctx.seat).some((e) => dist(e.pos, me.pos) <= reach)
    if (near) { const a = moveToAttack(ctx, plan); if (a) return { ...a, as: 'A' } }
  }
  return moveActivity(ctx, plan)
}

/** Resolve the plan's response letter into this Action's activity (engaged branch first; R-5 when nothing fits). */
export function resolveResponse(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const r = plan.pick.response
  const main = engagedActivity(ctx, plan)
    ?? (r === 'A' ? attackActivity(ctx, plan) ?? objectiveActivity(ctx, plan) : ({ M: moveActivity, O: objectiveActivity, F: fallBackActivity, D: defendActivity, S: strikeActivity } as const)[r](ctx, plan))
  return main
}

// ---------- activity -> action ----------
/** Map an activity onto a `turn.activation` menu option (Quick variant when activity.quick). */
export function activityToAction(ctx: OfficialContext, activity: Activity): Action | null {
  const quick = activity.quick === true
  const pool = ctx.legal.filter((a) => (a.quick === true) === quick)
  const first = (type: string, pred: (a: Action) => boolean = () => true): Action | null => pool.find((a) => a.type === type && pred(a)) ?? null
  switch (activity.kind) {
    case 'shoot': case 'throw': {
      const type = activity.kind === 'shoot' ? 'shoot.begin' : 'throw.begin'
      const mine = pool.filter((a) => a.type === type && a.weaponUid === activity.weaponUid)
      const crit = mine.filter((a) => a.critical === true)
      const plain = mine.find((a) => a.critical !== true) ?? null
      if (activity.critical && crit.length && activity.targetId && activity.weaponUid) {
        let band = ''
        try { band = String(odds.rangeBand(ctx.q, ctx.bundle, str(crit[0]!.modelId), activity.targetId, activity.weaponUid).band) } catch { /* plain shot */ }
        const fit = crit.find((a) => a.band === band) ?? (band === 'both' ? crit.find((a) => a.band === 'short') : undefined)
        if (fit) return fit
      }
      return plain
    }
    case 'closeCombat': {
      const mine = pool.filter((a) => a.type === 'melee.attack' && a.weaponUid === activity.weaponUid && a.targetId === activity.targetId)
      return (activity.critical ? mine.find((a) => a.critical === true) : null) ?? mine.find((a) => a.critical !== true) ?? null
    }
    case 'charge': return first('charge.go', (a) => a.targetId === activity.targetId)
    case 'moveEngage': case 'moveToCharge': case 'moveToMove': case 'moveToward': case 'moveToRange': case 'moveSafer':
    case 'moveContact': case 'fallBack': case 'disengage': return first('move.go')
    case 'interact': case 'pickup': case 'useExpertise':
      return INTERACT.map((t) => first(t, (a) => !activity.subjectId || a.markerId === activity.subjectId)).find((a) => a) ?? null
    case 'peek': return first('search.peek', (a) => a.markerId === activity.subjectId)
    case 'useItem': return first('item.use', (a) => a.itemUid === activity.weaponUid)
    case 'holdCover': case 'prepare': return first('prepare.go')
    case 'end': return ctx.legal.find((a) => a.type === 'turn.end') ?? null
  }
}

// ---------- the activation menu ----------
/** Heal an item restores (best branch of a choose-one), 0 when it does not heal. */
function healOf(effects: readonly unknown[] | undefined): number {
  let n = 0
  for (const e of (effects ?? []) as { op?: string; n?: number; options?: unknown[][] }[]) {
    if (e.op === 'heal') n += e.n ?? 0
    else if (e.op === 'choose') n += Math.max(0, ...(e.options ?? []).map((b) => healOf(b)))
  }
  return n
}

/** Healing item to use at activation start when damaged (R-19). */
function healingActivity(ctx: OfficialContext, plan: ActivationPlan): Activity | null {
  const me = ctx.view.models[plan.modelId]
  if (!me || me.damage + me.rad <= 0) return null
  let best: { uid: string; heal: number } | null = null
  for (const a of rows(ctx, 'item.use')) {
    const card = me.carried.find((c) => c.uid === a.itemUid)
    const def = card ? ctx.bundle.records.items.find((i) => i.id === card.defId) : undefined
    const heal = healOf(def?.effects)
    if (heal > 0 && (!best || heal > best.heal)) best = { uid: str(a.itemUid), heal }
  }
  return best ? mk(plan, { kind: 'useItem', weaponUid: best.uid, reason: 'heal before acting' }) : null
}

const bounce = new WeakMap<object, { sig: string; last: string | null; banned: Set<string> }>()
const actKey = (a: Action): string => `${a.type}|${str(a.weaponUid)}|${str(a.targetId)}|${str(a.itemUid)}|${str(a.markerId)}|${a.quick === true}`

function actionsPerActivation(ctx: OfficialContext): number {
  const n = (ctx.bundle.singletons.rules?.constants as Record<string, unknown> | undefined)?.actionsPerActivation
  return typeof n === 'number' ? n : 2
}

/** `turn.activation`: plan (once per activation), resolve the response, pick the menu option. */
export function answerActivation(ctx: OfficialContext): Action | null {
  const modelId = str((ctx.pending.context as { modelId?: unknown }).modelId)
  const me = ctx.view.models[modelId]
  if (!me) return null
  const plan = planFor(ctx, modelId)
  if (!plan) return null
  const c = ctx.pending.context as { actionsLeft?: number; ap?: number }
  const left = c.actionsLeft ?? 0
  plan.actionsStarted = Math.max(plan.actionsStarted, actionsPerActivation(ctx) - left)
  const end = ctx.legal.find((a) => a.type === 'turn.end') ?? null
  const done = (activity: Activity, action: Action | null): Action | null => {
    plan.activity = activity
    ctx.trace.entries.push({ kind: 'activity', modelId, action: plan.actionsStarted, activity })
    return action
  }

  // Conditions first: shake off a stun, put out a fire.
  const shake = ctx.legal.find((a) => a.type === 'move.shakeOff') ?? ctx.legal.find((a) => a.type === 'move.putOut')
  if (shake && left > 0) return done(mk(plan, { kind: 'end', reason: shake.type }), shake)

  // Quick Actions only as a Heroic V.A.T.S. spend after both Actions (R-24); otherwise the activation ends.
  const quick = left <= 0
  if (quick && !(me.heroic && !plan.quickTaken && ctx.legal.some((a) => a.quick === true))) return end ? done(mk(plan, { kind: 'end', reason: 'activation spent' }), end) : null

  // Bounce guard: the same menu again means the last pick was cancelled further down; do not repeat it.
  const sig = `${plan.key}|${left}|${c.ap ?? 0}|${me.pos.x.toFixed(2)},${me.pos.z.toFixed(2)}`
  let b = bounce.get(ctx.official)
  if (!b || b.sig !== sig) bounce.set(ctx.official, (b = { sig, last: null, banned: new Set() }))
  else if (b.last) b.banned.add(b.last)
  const f = flags(ctx)
  let action: Action | null = null, activity: Activity | null = null
  for (let tries = 0; tries < 4; tries++) {
    activity = plan.actionsStarted === 0 && !quick && !b.banned.has('heal') ? healingActivity(ctx, plan) : null
    if (activity) b.banned.add('heal')
    activity ??= resolveResponse(ctx, plan)
    if (!activity) break
    if (quick) activity = { ...activity, quick: true }
    action = activityToAction(ctx, activity)
    if (!action) { activity = null; break }
    if (!b.banned.has(actKey(action))) break
    if (action.type === 'move.go') f.noMove = true
    else if (activity.targetId) f.skip.add(activity.targetId)
    action = null; activity = null
  }
  if (action && activity) {
    b.last = actKey(action)
    if (quick) plan.quickTaken = true
    return done(activity, action)
  }
  // R-5: nothing fits -> Prepare if offered, else end the activation.
  const prep = quick ? null : rows(ctx, 'prepare.go')[0] ?? null
  if (prep && !b.banned.has(actKey(prep))) { b.last = actKey(prep); return done(mk(plan, { kind: 'prepare', reason: 'no activity (R-5)' }), prep) }
  return end ? done(mk(plan, { kind: 'end', reason: 'no activity (R-5)' }), end) : null
}

// ---------- sub-decisions ----------
const planOf = (ctx: OfficialContext, modelId: string): ActivationPlan | null => {
  const m = ctx.view.models[modelId]
  if (!m || m.owner !== ctx.seat) return null
  const act = Object.values(ctx.official.plans).filter((p) => p.modelId === modelId).pop()
  return act ?? null
}

/** Route from a model toward a goal, stopping `stop` inches short of it: nav field, straight line, then detour. */
function routeTo(ctx: OfficialContext, tpl: Action, id: ModelId, goal: Vec2, reach: number, stop: number): Vec2[] | null {
  const me = ctx.view.models[id]
  if (!me) return null
  const r = baseRadius(me.base)
  const friends = Object.values(ctx.view.models)
    .filter((o) => o.id !== id && o.owner === me.owner && live(o))
    .map((o) => ({ at: o.pos, r: r + baseRadius(o.base) - 0.1 }))
  try {
    const g = withBlockers(navGrid(ctx.q, r), friends, me.pos, 1.1)
    const f = navField(g, [goal])
    const here = fieldAt(f, me.pos)
    if (Number.isFinite(here)) {
      const len = Math.min(reach - 0.05, Math.max(0, here - stop))
      if (len >= 0.3) {
        const route = routeDown(f, me.pos, len)
        const cut = route ? cutAccepted(ctx, tpl, me.pos, route) : null
        if (cut) return cut
      }
    }
  } catch { /* fall through to the straight line */ }
  const d = dist(me.pos, goal)
  const len = Math.min(reach - 0.05, Math.max(0, d - stop))
  if (len < 0.3) return null
  const straight = [polar(me.pos, bearing(me.pos, goal), len)]
  return cutAccepted(ctx, tpl, me.pos, straight) ?? detour(ctx, tpl, me.pos, goal, reach)
}

/** Careful M: among prefixes of the route that cover at least half the Move, end at the best-covered one (R-11). */
function saferPrefix(ctx: OfficialContext, id: ModelId, path: Vec2[]): Vec2[] {
  const me = ctx.view.models[id]
  if (!me || path.length === 0) return path
  let best = path, bestScore = -Infinity
  for (const frac of [1, 0.85, 0.7, 0.5]) {
    const p = frac === 1 ? path : truncatePath(me.pos, path, frac)
    if (!p.length) continue
    const end = p[p.length - 1]!
    if (!freeSpot(ctx, id, end)) continue
    const s = coverScore(ctx, id, end) + frac * 0.01
    if (s > bestScore + 1e-9) { bestScore = s; best = p }
  }
  return best
}

function answerMove(ctx: OfficialContext): Action | null {
  const tpl = ctx.legal.find((a) => a.type === 'move.to'), cancel = ctx.legal.find((a) => a.type === 'move.cancel') ?? null
  const id = str((ctx.pending.context as { modelId?: unknown }).modelId)
  const me = ctx.view.models[id]
  if (!tpl || !me) return null
  const plan = planOf(ctx, id)
  const act = plan?.activity ?? null
  const reach = allowance(ctx)
  const r = reachOf(ctx, id)
  let goal: Vec2 | null = act?.goal ?? null
  let stop = 0
  if (act?.targetId) {
    const t = ctx.view.models[act.targetId]
    if (t) {
      goal = t.pos
      const touch = baseRadius(me.base) + baseRadius(t.base) + 0.25
      stop = act.kind === 'moveToRange' ? Math.max(touch, r.range * 0.8)
        : act.kind === 'moveToCharge' ? Math.max(touch, r.charge * 0.85)
          : act.kind === 'moveToMove' ? Math.max(touch, r.move * 0.85)
            : act.kind === 'moveEngage' ? baseRadius(me.base) + baseRadius(t.base) + 0.05 : touch
      // Already inside charge reach but no charge was offered (the straight lane is blocked): walk round the blocker.
      if (act.kind === 'moveToCharge' && dist(me.pos, t.pos) - stop < 0.3) stop = baseRadius(me.base) + baseRadius(t.base) + 0.75
    }
  } else if (act && (act.kind === 'moveToward' || act.kind === 'moveContact' || act.kind === 'disengage') && act.subjectId) {
    const sm = ctx.view.models[act.subjectId]
    if (sm) stop = baseRadius(me.base) + baseRadius(sm.base) + 0.25
    else if (ctx.view.markers?.some((k) => k.id === act.subjectId)) stop = baseRadius(me.base) + 0.05 // cannot end on a marker
  }
  if (!goal) { // a reaction or free move with no plan: toward the nearest enemy
    const foe = enemiesOf(ctx.view, ctx.seat).sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos))[0]
    if (!foe) return cancel
    goal = foe.pos
    stop = baseRadius(me.base) + baseRadius(foe.base) + 0.25
  }
  let path = routeTo(ctx, tpl, id, goal, reach, stop)
  if (path && plan && act?.as === 'M' && plan.pick.attitude === 'careful') path = saferPrefix(ctx, id, path)
  return path ? { ...tpl, path } : cancel
}

function answerTarget(ctx: OfficialContext): Action | null {
  const opts = ctx.legal.filter((a) => /\.target$/.test(a.type))
  if (!opts.length) return null
  const id = str(opts[0]!.modelId)
  const card = cardOfModel(ctx, id), plan = planOf(ctx, id)
  if (!card) return null
  let pool = opts
  if (plan?.pick.attitude === 'careful') {
    const clean = opts.filter((a) => !engagedWithFriendly(ctx, str(a.targetId)))
    if (clean.length) pool = clean
  }
  const ids = [...new Set(pool.map((a) => str(a.targetId)))]
  const ranking = rankTargets(ctx, card, id, ids, { weaponUid: str(pool[0]!.weaponUid), ...(plan ? { subject: subjectOf(ctx, plan) } : {}) })
  const top = ranking.ranked[0]?.id
  const mine = pool.filter((a) => a.targetId === top)
  const rowsCtx = (ctx.pending.context as { targets?: { targetId: string; band: string; pHit: number }[] }).targets ?? []
  return [...mine].sort((a, b) => (rowsCtx.find((t) => t.targetId === b.targetId && t.band === b.band)?.pHit ?? 0) - (rowsCtx.find((t) => t.targetId === a.targetId && t.band === a.band)?.pHit ?? 0))[0] ?? null
}

/** `*.luck`: spend only on dodge (R-17); keep on accurate and crit. */
function answerLuck(ctx: OfficialContext): Action | null {
  const ask = str((ctx.pending.context as { ask?: unknown }).ask)
  const use = ctx.legal.find((a) => a.use === true), keep = ctx.legal.find((a) => a.use === false)
  return (ask === 'dodge' ? use : keep) ?? null
}

function answerChargeMarker(ctx: OfficialContext): Action | null {
  const green = ctx.legal.find((a) => a.colour === 'green'), black = ctx.legal.find((a) => a.colour === 'black')
  if (!green || !black) return ctx.legal[0] ?? null
  const heads = ctx.roll('chargeFlip', ctx.pending.id)() < 0.5
  ctx.trace.entries.push({ kind: 'coin', purpose: 'chargeFlip', heads })
  return heads ? green : black
}

function answerPush(ctx: OfficialContext): Action | null {
  const push = ctx.legal.find((a) => a.push === true), stay = ctx.legal.find((a) => a.push === false)
  if (!push || !stay) return null
  const plan = planOf(ctx, str((ctx.pending.context as { modelId?: unknown }).modelId))
  const act = plan?.activity
  const yes = plan?.pick.attitude === 'reckless' && !!act && (act.kind === 'charge' || act.as === 'O' || act.as === 'D')
  return yes ? push : stay
}

function answerReaction(ctx: OfficialContext): Action | null {
  const pass = ctx.legal.find((a) => a.type === 'react.pass')
  const takes = ctx.legal.filter((a) => a.type === 'react.take')
  if (!pass) return null
  const inner = (a: Action) => (a.inner ?? {}) as { type?: string; weaponUid?: string; targetId?: string }
  const rid = str((ctx.pending.context as { modelId?: unknown }).modelId) || str(takes[0]?.modelId)
  const attacks = takes.filter((a) => ATTACK_TYPE.test(str(inner(a).type)))
  let best: { a: Action; v: number } | null = null
  for (const a of attacks) {
    const i = inner(a)
    const target = str(i.targetId) || str((ctx.pending.context as { sourceId?: unknown }).sourceId)
    let v = 0.001
    try {
      if (target && i.weaponUid) v += odds.hitOdds(ctx.q, ctx.bundle, rid, target, { weaponUid: i.weaponUid, reaction: true, quick: true }).pHit
      else if (target) v += odds.hitOdds(ctx.q, ctx.bundle, rid, target, { reaction: true, quick: true }).pHit
    } catch { /* keep the floor */ }
    if (!best || v > best.v) best = { a, v }
  }
  if (best) return best.a
  return takes.find((a) => str(inner(a).type).startsWith('move')) ?? pass
}

/**
 * Sub-decisions from the current activity: move.path, shoot.target, throw.target, charge.marker, battleCry.push,
 * melee.slide, *.luck, react.offer, item.choose, search.found (s8.6).
 */
export function answerSub(ctx: OfficialContext): Action | null {
  switch (ctx.pending.kind) {
    case 'move.path': return answerMove(ctx)
    case 'shoot.target': case 'throw.target': return answerTarget(ctx)
    case 'shoot.luck': case 'throw.luck': case 'melee.luck': return answerLuck(ctx)
    case 'charge.marker': return answerChargeMarker(ctx)
    case 'battleCry.push': return answerPush(ctx)
    case 'melee.slide': return ctx.legal.find((a) => a.type === 'melee.slide') ?? null // hold: no slide
    case 'react.offer': return answerReaction(ctx)
    case 'item.choose': return itemBranch(ctx)
    case 'search.found': return ctx.legal.find((a) => a.type === 'search.keep') ?? null // R-18
    default: return null
  }
}
