// Targets and weapons (spec 18 s2.1, s3.3, s3.7; CH p11-14; ERR p.16). Numbers come from engine query.*.
import type { AiCardDef, EditionBundle } from '../../data/types'
import { engagedWith, isEngaged, rangeBandOf, rangedWeapons } from '../../engine/attack'
import { armorOf, healthOf, tokensOn } from '../../engine/damage'
import { recordOf, rulerInches } from '../../engine/edition'
import { baseDiameter, baseRadius } from '../../engine/geometry'
import { hasLos } from '../../engine/los'
import { modelDistance } from '../../engine/measure'
import { ccWeapons } from '../../engine/melee'
import * as query from '../../engine/query'
import type { Id, ModelState, Vec2, WastelandDamageType } from '../../engine/types'
import type { AiView } from '../types'
import { withModelAt } from '../world'
import type { AiMethod, ResolvedCell, TargetRanking } from './types'
import { cardOfModel, centreDistance, enemiesOf, friendsOf, isImprovised, qOf, walkDistance, weaponDefOf } from './util'

/** What the candidate set is being ranked for: Nearest means fewest Moves for movement, shortest shot for shooting. */
export type RankFor = 'move' | 'shoot' | 'close'

/** Weapon for the Method (CH p11; ERR p.16): see chooseWeapon. `reckless` false drops area weapons from Close Combat. */
export function chooseWeapon(view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, method: AiMethod, opts: { reckless?: boolean } = {}): Id | null {
  const q = qOf(view, bundle)
  // Availability ignores the model's own engagement (a ranged weapon is chosen even while engaged; the activity list then
  // decides to disengage, CH p15): look at the model alone.
  const alone = { ...q, models: { [me.id]: me } } as typeof q
  let uids = method === 'close' ? ccWeapons(q, bundle, me.id) : rangedWeapons(alone, bundle, me.id)
  if (method === 'close' && opts.reckless === false) {
    uids = uids.filter((u) => !weaponDefOf(q, bundle, me, u)?.damage.some((d) => d.area !== undefined))
  }
  if (!uids.length) return null
  const pref = (card.notes ?? []).find((n) => n.startsWith('pref:'))?.slice(5)
  const preferred = pref ? uids.find((u) => me.carried.find((c) => c.uid === u)?.defId === pref) : undefined
  if (preferred) return preferred
  const proper = uids.find((u) => !isImprovised(u))
  return proper ?? uids[0]! // the Improvised Weapon only when nothing better exists (ERR p.16)
}

/** Enemies that a ranged weapon could shoot right now from `from` (range band and line of sight; engagement ignored). */
export function shootable(view: AiView, bundle: EditionBundle, me: ModelState, uid: string): ModelState[] {
  const q = qOf(view, bundle)
  return enemiesOf(view, me).filter((e) => rangeBandOf(q, bundle, me.id, e.id, uid).band !== null && hasLos(q, me.id, e.id))
}

/**
 * Enemy models this model may target with the Method: on table, not removed; Careful drops engaged enemies for
 * Ranged (CH p10, p12). Objects are never returned (they are targeted only through O, spec 18 s8.5).
 */
export function validTargets(view: AiView, bundle: EditionBundle, me: ModelState, cell: ResolvedCell): ModelState[] {
  const q = qOf(view, bundle)
  const enemies = enemiesOf(view, me)
  if (cell.method === 'close') return enemies
  const card = cardOfModel(bundle.records.ai, me)
  const uid = chooseWeapon(view, bundle, me, card, 'ranged', { reckless: cell.reckless })
  if (!uid) return []
  let out = shootable(view, bundle, me, uid)
  if (!cell.reckless) out = out.filter((e) => !isEngaged(q, e.id))
  return out
}

const BIG = 9999
const unitOfModel = (bundle: EditionBundle, m: ModelState) => recordOf(bundle, 'units', m.profileId)
const healthLeft = (view: AiView, bundle: EditionBundle, m: ModelState): number => Math.max(0, healthOf(qOf(view, bundle), bundle, m.id) - tokensOn(bundle, m))

function contactSpot(me: ModelState, t: ModelState): Vec2 {
  const a = Math.atan2(me.pos.z - t.pos.z, me.pos.x - t.pos.x)
  const d = baseRadius(me.base) + baseRadius(t.base)
  return { x: t.pos.x + Math.cos(a) * d, z: t.pos.z + Math.sin(a) * d }
}

interface Metric { value: (t: ModelState) => number; best: 'min' | 'max' }

function metricFor(
  name: string, view: AiView, bundle: EditionBundle, me: ModelState, cell: ResolvedCell, rankFor: RankFor, subjectIds: readonly Id[], weaponUid: string | null,
): Metric | null {
  const q = qOf(view, bundle)
  switch (name) {
    case 'nearest':
      return rankFor === 'shoot'
        ? { value: (t) => modelDistance(me, t), best: 'min' }
        : { value: (t) => walkDistance(q, me, t.pos), best: 'min' }
    case 'weakest': return { value: (t) => healthLeft(view, bundle, t), best: 'min' }
    case 'largest': return { value: (t) => healthOf(q, bundle, t.id), best: 'max' }
    case 'wounded': return { value: (t) => t.damage + t.rad, best: 'max' }
    case 'healthiest': return { value: (t) => healthLeft(view, bundle, t), best: 'max' }
    case 'vulnerable': {
      const type: WastelandDamageType = (weaponUid ? weaponDefOf(q, bundle, me, weaponUid)?.damage[0]?.type : undefined) ?? 'physical'
      return {
        value: (t) => { const a = armorOf(q, bundle, t.id, type); return a.immune ? BIG : a.has ? a.base : 0 }, // base armor only: Strong ignored
        best: 'min',
      }
    }
    case 'slowest': return { value: (t) => { const u = unitOfModel(bundle, t); return u ? rulerInches(bundle, u.move) : BIG }, best: 'min' }
    case 'fastest': return { value: (t) => { const u = unitOfModel(bundle, t); return u ? rulerInches(bundle, u.charge) : 0 }, best: 'max' }
    case 'bestChance':
      return {
        value: (t) => {
          try {
            const qq = cell.method === 'close' && !engagedWith(q, me.id).includes(t.id) ? withModelAt(q, me.id, contactSpot(me, t)) : q
            return query.hitOdds(qq, bundle, me.id, t.id, { ...(weaponUid ? { weaponUid } : {}), ...(cell.method === 'close' ? { band: 'melee' as const } : {}) }).sv
          } catch { return 0 }
        },
        best: 'max',
      }
    case 'prepared': return { value: (t) => (t.reaction ? 1 : 0), best: 'max' }
    case 'spent': return { value: (t) => (t.readiness === 'used' ? 1 : 0), best: 'max' }
    case 'importance': {
      const pts: Vec2[] = []
      for (const id of subjectIds) {
        const m = view.models[id]
        const mk = (view.markers ?? []).find((x) => x.id === id)
        if (m) pts.push(m.pos); else if (mk) pts.push(mk.pos)
      }
      if (!pts.length) return null
      return { value: (t) => (subjectIds.includes(t.id) ? BIG : Math.min(...pts.map((p) => centreDistance(p, t.pos)))), best: 'min' }
    }
    case 'notEngaged': return { value: (t) => (isEngaged(q, t.id) ? 0 : 1), best: 'max' }
    case 'engaged': return { value: (t) => (isEngaged(q, t.id) ? 1 : 0), best: 'max' }
    case 'capable': {
      return { value: (t) => (unitOfModel(bundle, t)?.skills.some((s) => s.skill === 'computers' || s.skill === 'lockpick' || s.skill === 'search') ? 1 : 0), best: 'max' }
    }
    case 'leader': return { value: (t) => (t.leaderId !== undefined ? 1 : 0), best: 'max' }
    default: return null
  }
}

/** Class tests named by a card's `preferFirst` string (ERR p.16). Unknown text narrows nothing. */
function preferClass(text: string, view: AiView, bundle: EditionBundle, me: ModelState): ((t: ModelState) => boolean) | null {
  const q = qOf(view, bundle)
  const s = text.toLowerCase()
  const exactlyOne = /exactly one|only one|single/.test(s)
  if (/engaged/.test(s)) {
    return (t) => {
      const foes = engagedWith(q, t.id)
      return exactlyOne ? foes.length === 1 : foes.length > 0
    }
  }
  void me
  return null
}

/**
 * Rank candidates by the card's priority list (CH p12): preferFirst class pass (ERR p.16), the last-AI-model Subject
 * rule, then each priority as a tie-breaker; Careful close combat prefers engaged enemies at every step (CH p11).
 * Leftover ties are broken with `pickTie`, whose seed key is recorded in the ranking.
 */
export function rankTargets(
  view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, cell: ResolvedCell,
  candidates: readonly ModelState[], rankFor: RankFor, subjectIds: readonly Id[], pickTie: (among: Id[], key: string) => Id,
): TargetRanking {
  const q = qOf(view, bundle)
  const ranking: TargetRanking = { candidates: candidates.map((c) => c.id), steps: [], winner: null }
  if (!candidates.length) return ranking
  let pool = [...candidates]
  const weaponUid = chooseWeapon(view, bundle, me, card, cell.method, { reckless: cell.reckless })

  // Last AI model: pick the Subject before using the list (CH p12).
  const lastModel = friendsOf(view, me).length === 0
  if (lastModel && subjectIds.length && subjectIds.every((id) => view.models[id]?.owner !== me.owner)) {
    const sub = pool.filter((c) => subjectIds.includes(c.id))
    if (sub.length) { pool = sub; ranking.forced = 'lastModel' }
  }
  // A preferred class first, only if anyone is in it (ERR p.16).
  if (card.preferFirst) {
    const test = preferClass(card.preferFirst, view, bundle, me)
    const hit = test ? pool.filter(test) : []
    if (hit.length && hit.length < pool.length) { pool = hit; ranking.forced ??= 'preferFirst' }
  }
  const carefulClose = cell.method === 'close' && !cell.reckless
  const preferEngaged = (label: string): void => {
    if (!carefulClose || pool.length < 2) return
    const eng = pool.filter((t) => isEngaged(q, t.id))
    if (eng.length && eng.length < pool.length) {
      ranking.steps.push({ priority: label, values: Object.fromEntries(pool.map((t) => [t.id, isEngaged(q, t.id) ? 1 : 0])), kept: eng.map((t) => t.id) })
      pool = eng
    }
  }
  for (const name of card.targetPriority) {
    if (pool.length < 2) break
    preferEngaged('careful:engaged')
    if (pool.length < 2) break
    const metric = metricFor(name, view, bundle, me, cell, rankFor, subjectIds, weaponUid)
    if (!metric) { ranking.steps.push({ priority: name, values: {}, kept: pool.map((t) => t.id) }); continue }
    const values: Record<Id, number> = {}
    for (const t of pool) values[t.id] = metric.value(t)
    const nums = Object.values(values)
    const best = metric.best === 'min' ? Math.min(...nums) : Math.max(...nums)
    const kept = pool.filter((t) => Math.abs(values[t.id]! - best) < 1e-6)
    ranking.steps.push({ priority: name, values, kept: kept.map((t) => t.id) })
    pool = kept
  }
  preferEngaged('careful:engaged')
  if (pool.length > 1) {
    const among = pool.map((t) => t.id)
    const seedKey = `tie:${view.pending.id}:${me.id}:${rankFor}`
    ranking.winner = pickTie(among, seedKey)
    ranking.tie = { among, seedKey }
  } else ranking.winner = pool[0]!.id
  return ranking
}

/** The enemy this model would attack if it stood unengaged at `at` (Defend, CH p14). */
export function defendThreat(
  view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, cell: ResolvedCell, at: Vec2,
  pickTie: (among: Id[], key: string) => Id,
): TargetRanking {
  const moved = { ...me, pos: { ...at } }
  const v2: AiView = { ...view, models: { ...view.models, [me.id]: moved } }
  let cands: ModelState[]
  let rankFor: RankFor
  if (cell.method === 'close') {
    // Walk the Close Combat list from the Subject's position (CH p14): 1. engaged enemies, 2. enemies a Charge reaches, 3-6. any enemy.
    const q2 = qOf(v2, bundle)
    const foes = enemiesOf(v2, moved)
    const engagedIds = engagedWith(q2, moved.id)
    const unit = unitOfModel(bundle, moved)
    const reach = (unit ? rulerInches(bundle, unit.charge) : 0) + baseDiameter(moved.base)
    const charge = foes.filter((e) => modelDistance(moved, e) <= reach + 1e-6 && hasLos(q2, moved.id, e.id))
    const engagedFoes = foes.filter((e) => engagedIds.includes(e.id))
    if (engagedFoes.length) { cands = engagedFoes; rankFor = 'close' }
    else if (charge.length) { cands = charge; rankFor = 'close' }
    else { cands = foes; rankFor = 'move' }
  } else {
    cands = validTargets(v2, bundle, moved, cell)
    rankFor = 'shoot'
    if (!cands.length) { cands = enemiesOf(v2, moved); rankFor = 'move' } // nothing to shoot from there: the list moves toward an enemy
  }
  return rankTargets(v2, bundle, moved, card, cell, cands, rankFor, [], pickTie)
}

