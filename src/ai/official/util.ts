// Small shared helpers for the official AI (view -> query shim cache, enemies, weapons, walking distance, safety).
// Nothing here decides a rule; numbers come from engine query.* and the engine's own helpers.
import type { AiCardDef, EditionBundle, WeaponDef } from '../../data/types'
import { IMPROVISED_ID, engagedWith } from '../../engine/attack'
import { recordOf } from '../../engine/edition'
import { baseRadius, isOnTable } from '../../engine/geometry'
import { modelDistance } from '../../engine/measure'
import * as query from '../../engine/query'
import type { GameState, Id, ModelState, Vec2 } from '../../engine/types'
import { fieldAt, navField, navGrid, withBlockers } from '../nav'
import type { AiView } from '../types'
import { queryState, withModelAt } from '../world'

const Q = new WeakMap<object, GameState>()
/** The read-only query shim for a view, built once per view object. */
export function qOf(view: AiView, bundle: EditionBundle): GameState {
  let q = Q.get(view)
  if (!q) Q.set(view, (q = queryState(view, bundle)))
  return q
}

export const enemiesOf = (view: AiView, me: ModelState): ModelState[] =>
  Object.values(view.models).filter((m) => m.owner !== me.owner && isOnTable(m)).sort((a, b) => a.id.localeCompare(b.id))
export const friendsOf = (view: AiView, me: ModelState): ModelState[] =>
  Object.values(view.models).filter((m) => m.owner === me.owner && m.id !== me.id && isOnTable(m))

/** The AI card of a model (by unit record id), else the generic fallback card. */
export function cardOfModel(cards: readonly AiCardDef[], me: ModelState): AiCardDef {
  return cards.find((c) => c.unitId === me.profileId && c.id !== 'ai-generic') ?? cards.find((c) => c.id === 'ai-generic') ?? cards[0]!
}

export const isImprovised = (uid: string): boolean => uid.endsWith(`/${IMPROVISED_ID}`)

/** Weapon definition for a carried uid (or the virtual Improvised Weapon). */
export function weaponDefOf(q: GameState, bundle: EditionBundle, me: ModelState, uid: string): WeaponDef | undefined {
  if (isImprovised(uid)) return recordOf(bundle, 'weapons', IMPROVISED_ID)
  const c = me.carried.find((x) => x.uid === uid)
  return c ? recordOf(bundle, 'weapons', c.defId) : undefined
}

export const centreDistance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)

/** Walking distance (inches, difficult ground counted by the nav grid) from a model to a point; straight line if no route. */
export function walkDistance(q: GameState, from: ModelState, to: Vec2): number {
  try {
    const g = navGrid(q, baseRadius(from.base))
    const d = fieldAt(navField(g, [to]), from.pos)
    return Number.isFinite(d) ? d : centreDistance(from.pos, to)
  } catch {
    return centreDistance(from.pos, to)
  }
}

/** Walking field toward goals for one model, friendly bases as walls (the mover keeps its own spot free). */
export function fieldFor(q: GameState, view: AiView, me: ModelState, goals: readonly Vec2[], avoidEnemies = false): ReturnType<typeof navField> {
  const r = baseRadius(me.base)
  const blockers = Object.values(view.models)
    .filter((o) => o.id !== me.id && isOnTable(o) && (o.owner === me.owner || avoidEnemies))
    .map((o) => ({ at: o.pos, r: r + baseRadius(o.base) - 0.1 }))
  return navField(withBlockers(navGrid(q, r), blockers, me.pos, 1.1), goals)
}

/** Expected enemy hits on the model if it stood at `at` (lower = safer): the sum of their hit chances, plus cover as a tie-break. */
export function exposure(q: GameState, bundle: EditionBundle, view: AiView, me: ModelState, at: Vec2): { threat: number; cover: number } {
  const q2 = withModelAt(q, me.id, at)
  let threat = 0, cover = 0
  for (const e of enemiesOf(view, me)) {
    let p = 0
    try { p = query.hitOdds(q2, bundle, e.id, me.id, {}).pHit } catch { p = 0 }
    if (p <= 0) continue
    threat += p
    try { cover += query.coverFor(q2, bundle, e.id, me.id).count } catch { /* no cover info */ }
  }
  return { threat, cover }
}

/** Number of friends of `me` engaged with an enemy (the Raider-style class test: engaged with exactly one friendly). */
export function engagedCount(q: GameState, id: Id): number {
  return engagedWith(q, id).length
}

export { modelDistance }
