// Memoised query.* for one decision (spec 30 s10 time budget). Every number still comes from src/engine/query.ts;
// this only avoids asking the same question twice. A shim derived with world.withModelAt shares its base's memo, and
// the key carries the attacker's and target's spots, the only models a derived shim moves.
import type { EditionBundle } from '../data/types'
import * as query from '../engine/query'
import type { GameState, ModelId } from '../engine/types'
import { oddsStats } from './budget'
import { baseOf } from './world'

/** Terrain pieces that add one unit to the cost of a query miss (line of sight is walked against every piece). */
const TERRAIN_PER_UNIT = 6
const memo = new WeakMap<GameState, Map<string, unknown>>()

function cached<T>(q: GameState, key: string, f: () => T): T {
  const base = baseOf(q)
  let m = memo.get(base)
  if (!m) memo.set(base, (m = new Map()))
  if (m.has(key)) return m.get(key) as T
  oddsStats.misses += 1 + q.terrain.length / TERRAIN_PER_UNIT
  const v = f()
  m.set(key, v)
  return v
}

const spot = (q: GameState, id: ModelId): string => {
  const m = q.models[id]
  return m ? `${id}@${m.pos.x.toFixed(3)},${m.pos.z.toFixed(3)}` : id
}
const pairKey = (q: GameState, a: ModelId, t: ModelId): string => `${spot(q, a)}>${spot(q, t)}`
const optsKey = (o: query.AttackOpts): string =>
  `${o.weaponUid ?? ''}|${o.band ?? ''}|${o.quick ? 1 : 0}|${o.reaction ? 1 : 0}|${(o as { critical?: boolean }).critical ? 1 : 0}`

export const hitOdds = (q: GameState, b: EditionBundle, a: ModelId, t: ModelId, o: query.AttackOpts = {}): query.HitOdds =>
  cached(q, `h:${pairKey(q, a, t)}:${optsKey(o)}`, () => query.hitOdds(q, b, a, t, o))

export const expectedDamage = (q: GameState, b: EditionBundle, a: ModelId, t: ModelId, o: query.AttackOpts = {}): query.DamageOdds =>
  cached(q, `d:${pairKey(q, a, t)}:${optsKey(o)}`, () => query.expectedDamage(q, b, a, t, o))

export const killOdds = (q: GameState, b: EditionBundle, a: ModelId, t: ModelId, o: query.AttackOpts = {}): number =>
  cached(q, `k:${pairKey(q, a, t)}:${optsKey(o)}`, () => query.killOdds(q, b, a, t, o))

export const rangeBand = (q: GameState, b: EditionBundle, a: ModelId, t: ModelId, uid?: string): query.RangeInfo =>
  cached(q, `r:${pairKey(q, a, t)}:${uid ?? ''}`, () => query.rangeBand(q, b, a, t, uid))

export const coverFor = (q: GameState, b: EditionBundle, a: ModelId, t: ModelId): query.CoverInfo =>
  cached(q, `c:${pairKey(q, a, t)}`, () => query.coverFor(q, b, a, t))
