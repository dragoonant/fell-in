// Threat map (spec 30 s9). Owner: E (eval + threat).
// Reach comes from the unit's move/charge colours (edition.rulerInches) and weapon long range; the damage an enemy
// could deal at a point comes from query.* with that enemy moved into reach on the shim (world.withModelAt).
import type { EditionBundle } from '../data/types'
import { engagedWith, rangedWeapons } from '../engine/attack'
import { rulerInches } from '../engine/edition'
import { recordOf } from '../engine/edition'
import { ccWeapons } from '../engine/melee'
import * as query from '../engine/query'
import * as odds from './odds'
import type { AttackOpts } from '../engine/query'
import type { GameState, ModelId, ModelState, Vec2 } from '../engine/types'
import type { AiContext, Reach, ThreatMap, ThreatReport } from './types'
import { dist, enemiesOf, live, withModelAt } from './world'

export const NO_THREAT: ThreatReport = { exp: 0, pKill: 0, attackers: [] }
const MM = 25.4
/** Slack added to a centre-distance reach check for base radii. */
const BASE_SLACK = 2

const inchesOr0 = (b: EditionBundle, c: Parameters<typeof rulerInches>[1] | undefined): number => {
  if (!c) return 0
  try { return rulerInches(b, c) } catch { return 0 }
}

/** Weapon options an attacker could use against a target on state `q` (ranged in a band, or close combat when engaged / forced). */
export function attackChoices(q: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, forceMelee = false): AttackOpts[] {
  if (forceMelee || engagedWith(q, attackerId).includes(targetId)) {
    return ccWeapons(q, bundle, attackerId).map((weaponUid) => ({ weaponUid, band: 'melee' as const }))
  }
  return rangedWeapons(q, bundle, attackerId)
    .filter((weaponUid) => odds.rangeBand(q, bundle, attackerId, targetId, weaponUid).band !== null)
    .map((weaponUid) => ({ weaponUid }))
}

/** Inches an enemy model can cover next turn and its longest ranged reach. */
export function reachOf(ctx: AiContext, modelId: ModelId): Reach {
  const m = ctx.view.models[modelId]
  const unit = m ? recordOf(ctx.bundle, 'units', m.profileId) : undefined
  if (!m || !unit) return { move: 0, charge: 0, range: 0, melee: false }
  let range = 0, melee = false
  for (const c of m.carried) {
    if (c.kind !== 'weapon' || c.spent) continue
    const def = recordOf(ctx.bundle, 'weapons', c.defId)
    if (!def) continue
    if (def.skill === 'melee') melee = true
    else range = Math.max(range, inchesOr0(ctx.bundle, def.long ?? (def.short === 'throw' ? undefined : def.short)))
  }
  if (!melee && range === 0) melee = true // Improvised Weapon
  return { move: inchesOr0(ctx.bundle, unit.move), charge: inchesOr0(ctx.bundle, unit.charge), range, melee }
}

/** Build the threat map of every enemy of `ctx.seat` (once per decision; cheap reach first). */
export function buildThreatMap(ctx: AiContext): ThreatMap {
  const reach: ThreatMap['reach'] = {}
  for (const e of enemiesOf(ctx.view, ctx.seat)) reach[e.id] = reachOf(ctx, e.id)
  return { seat: ctx.seat, reach, memo: new Map() }
}

const totalReach = (r: Reach): number => Math.max(r.move + r.range, r.melee ? r.charge : 0)

/** Enemies that could reach `at` next turn (reach check only, no query). */
export function threatsInReach(ctx: AiContext, map: ThreatMap, at: Vec2): ModelId[] {
  const out: ModelId[] = []
  for (const [id, r] of Object.entries(map.reach)) {
    const e = ctx.view.models[id]
    if (!live(e)) continue
    if (dist(e.pos, at) <= totalReach(r) + BASE_SLACK) out.push(id)
  }
  return out
}

/** Place `e` on the line to `at`: stop `gap` centre-to-centre from it, moving at most `maxMove`. */
function approach(e: ModelState, at: Vec2, gap: number, maxMove: number): Vec2 {
  const d = dist(e.pos, at)
  const step = Math.min(maxMove, Math.max(0, d - gap))
  if (d < 1e-9 || step <= 0) return e.pos
  return { x: e.pos.x + ((at.x - e.pos.x) / d) * step, z: e.pos.z + ((at.z - e.pos.z) / d) * step }
}

/** Expected damage and kill odds the enemies could deal to `targetId` standing at `at` next turn (memoised). */
export function threatAt(ctx: AiContext, map: ThreatMap, targetId: ModelId, at: Vec2): ThreatReport {
  const key = `${targetId}@${at.x.toFixed(2)},${at.z.toFixed(2)}`
  const hit = map.memo.get(key)
  if (hit) return hit
  const target = ctx.view.models[targetId]
  let rep = NO_THREAT
  if (live(target)) {
    const base = withModelAt(ctx.q, targetId, at)
    let exp = 0, survive = 1
    const attackers: ModelId[] = []
    for (const id of threatsInReach(ctx, map, at)) {
      const e = base.models[id]!
      const r = map.reach[id]!
      const tr = target.base / 2 / MM
      let bestExp = 0, bestKill = 0
      const tryAt = (pos: Vec2, forceMelee: boolean) => {
        const qq = withModelAt(base, id, pos)
        for (const opts of attackChoices(qq, ctx.bundle, id, targetId, forceMelee)) {
          const ex = odds.hitOdds(qq, ctx.bundle, id, targetId, opts).pHit * odds.expectedDamage(qq, ctx.bundle, id, targetId, opts).expected
          if (ex > bestExp) { bestExp = ex; bestKill = odds.killOdds(qq, ctx.bundle, id, targetId, opts) }
        }
      }
      // Shoot: stay if already in a band, else step in to 80 percent of the longest range.
      if (r.range > 0) tryAt(approach(e, at, Math.max(0, r.range * 0.8), r.move), false)
      // Charge: reach base contact within the charge ruler.
      const contact = e.base / 2 / MM + tr
      if (r.melee && dist(e.pos, at) - contact <= r.charge) tryAt(approach(e, at, contact, r.charge + 0), true)
      if (bestExp > 0) { exp += bestExp; survive *= 1 - bestKill; attackers.push(id) }
    }
    if (attackers.length) rep = { exp, pKill: 1 - survive, attackers }
  }
  map.memo.set(key, rep)
  return rep
}
