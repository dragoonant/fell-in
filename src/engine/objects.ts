// Scenario objects as attack targets (SHOT-003, spec 18 s8.5). An object is a MarkerState whose props describe it:
//   health (Health left), maxHealth, damage (tokens taken), armor {physical, energy, radiation} (number | 'immune'),
//   shootable, meleeable (in base contact), baseMm (stand-in size), destroyed, offTable, hit / damaged (counters).
// Objects are never models: no engagement, no Push Back, no reactions, no luck dodge. To reuse the range, LoS and
// cover maths the engine measures against a stand-in "probe" model that exists only inside a throw-away state.
// A destroyed object stays in state.markers with props.destroyed = true (scenarios read it; views and menus skip it).
import type { EditionBundle } from '../data/types'
import { appliedDist, lowerOf, ratingOf, type ArmorRating } from './damage'
import { armorRoll } from './dice'
import { baseRadius, dist } from './geometry'
import { pushEvents } from './registry'
import { OBJECT_OWNER } from './sides'
import { modelDefaults } from './setup'
import type { GameState, Id, MarkerState, ModelId, ModelState, Vec2, WastelandDamageType } from './types'

/** Geometry tolerance for "in base contact with an object" (a table fact, like scenario.ts MARKER_REACH_IN). */
export const OBJECT_CONTACT_IN = 0.5
const DEFAULT_OBJECT_BASE_MM = 40
const PROBE_PREFIX = 'obj:'

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const alive = (mk: MarkerState): boolean => mk.props['destroyed'] !== true && mk.props['offTable'] !== true && !mk.carriedBy

export const isShootable = (mk: MarkerState): boolean => alive(mk) && mk.props['shootable'] === true
export const isMeleeable = (mk: MarkerState): boolean => alive(mk) && mk.props['meleeable'] === true
export const markerById = (state: GameState, id: Id): MarkerState | undefined => state.markers.find((m) => m.id === id)
export const healthLeft = (mk: MarkerState): number | null => num(mk.props['health']) ?? null

/** Shootable markers in id order (the menu and the AI iterate these). */
export const shootableMarkers = (state: GameState): MarkerState[] => state.markers.filter(isShootable)
export const meleeableMarkers = (state: GameState): MarkerState[] => state.markers.filter(isMeleeable)

/** Armor of an object against one damage type: a number, 'immune' (or X), or nothing. */
export function objectArmor(mk: MarkerState, type: WastelandDamageType): ArmorRating {
  const armor = mk.props['armor'] as Record<string, unknown> | undefined
  const v = armor?.[type]
  if (v === 'immune' || v === 'X' || v === 'x') return ratingOf('immune')
  const n = num(v)
  return n === undefined ? ratingOf(undefined) : ratingOf({ base: n })
}

// ---------- geometry through a probe model ----------
export const probeIdOf = (markerId: Id): ModelId => `${PROBE_PREFIX}${markerId}`

/** A copy of the state with a stand-in model at the marker, so attackPlan/meleePlan/rangeBandOf/coverOf can measure to it. */
export function withProbe(state: GameState, mk: MarkerState): { state: GameState; probeId: ModelId } {
  const probeId = probeIdOf(mk.id)
  const probe: ModelState = {
    ...modelDefaults(), id: probeId, profileId: '__object__', owner: OBJECT_OWNER, pos: { ...mk.pos }, elev: 0,
    base: num(mk.props['baseMm']) ?? DEFAULT_OBJECT_BASE_MM, life: 'active', conditions: [],
  }
  return { state: { ...state, models: { ...state.models, [probeId]: probe } }, probeId }
}

/** Gap between a model's base edge and the object's stand-in base (inches). */
export function objectGap(state: GameState, modelId: ModelId, mk: MarkerState): number {
  const m = state.models[modelId]
  if (!m) return Infinity
  return Math.max(0, dist(m.pos, mk.pos) - baseRadius(m.base) - baseRadius(num(mk.props['baseMm']) ?? DEFAULT_OBJECT_BASE_MM))
}
export const inObjectContact = (state: GameState, modelId: ModelId, mk: MarkerState): boolean => objectGap(state, modelId, mk) <= OBJECT_CONTACT_IN + 1e-9

/** The marker a target id names when it is not a model (query.* and menus accept marker ids as targets). */
export function markerTarget(state: GameState, targetId: Id): MarkerState | undefined {
  if (state.models[targetId]) return undefined
  const mk = markerById(state, targetId)
  return mk && (isShootable(mk) || isMeleeable(mk)) ? mk : undefined
}

// ---------- damage ----------
export interface ObjectHit {
  attackerId?: ModelId
  damage: { type: WastelandDamageType; value: number; lowerOfPhysEnergy?: boolean }[]
  dmg: number
  ar: number
  /** Points that skip the armor roll (ignoreArmor outcomes). */
  direct?: number
}
export interface ObjectHitReport { state: GameState; applied: number; destroyed: boolean }

function ratingFor(mk: MarkerState, entry: ObjectHit['damage'][number]): ArmorRating {
  return entry.lowerOfPhysEnergy ? lowerOf(objectArmor(mk, 'physical'), objectArmor(mk, 'energy')) : objectArmor(mk, entry.type)
}

/** Distribution of applied damage 0..n for a hit on an object (exact; same armor maths as models, no cover). */
export function objectDamageDistribution(bundle: EditionBundle, mk: MarkerState, input: { damage: ObjectHit['damage']; onHit: { dmg: number; ar: number; p: number }[] }): number[] {
  const pHit = input.onHit.reduce((a, o) => a + o.p, 0)
  if (pHit <= 0) return [1]
  const per = input.onHit.map((o) => {
    let acc: number[] = [1]
    for (const e of input.damage) {
      const total = Math.max(0, e.value + o.dmg)
      const d = appliedDist(bundle, total, ratingFor(mk, e), o.ar, false)
      const next = new Array<number>(acc.length + d.length - 1).fill(0)
      acc.forEach((pa, i) => d.forEach((pb, j) => { next[i + j]! += pa * pb }))
      acc = next
    }
    return { acc, w: o.p / pHit }
  })
  const out = new Array<number>(Math.max(1, ...per.map((x) => x.acc.length))).fill(0)
  for (const { acc, w } of per) acc.forEach((p, i) => { out[i]! += p * w })
  return out
}

const patchMarker = (state: GameState, id: Id, props: Record<string, unknown>): GameState =>
  ({ ...state, markers: state.markers.map((m) => (m.id === id ? { ...m, props: { ...m.props, ...props } } : m)) })

/**
 * Resolve a successful attack against an object: armor roll per damage entry (armor from the marker's props, 'immune'
 * blocks everything), tokens onto props.damage, Health down, destroyed at 0. Counts props.hit and props.damaged.
 */
export function hitObject(state: GameState, bundle: EditionBundle, markerId: Id, hit: ObjectHit): ObjectHitReport {
  const mk = markerById(state, markerId)
  if (!mk || !alive(mk)) return { state, applied: 0, destroyed: false }
  let s = state
  let applied = 0
  const perType: { type: WastelandDamageType; total: number; rating: number; roll: number | null; applied: number }[] = []
  for (const entry of hit.damage) {
    const total = Math.max(0, entry.value + hit.dmg)
    const rating = ratingFor(mk, entry)
    let R = 0, rollVal: number | null = null, blocked = 0
    if (rating.immune) blocked = total
    else {
      R = rating.has ? Math.max(0, rating.base - hit.ar) : 0
      if (R > 0 && total > 0) {
        const r = armorRoll(s, bundle, `armor:${entry.type}`, markerId)
        s = pushEvents(r.state, [r.event])
        rollVal = r.value
        if (r.value <= R) blocked += r.value
      }
    }
    const got = Math.max(0, total - blocked)
    applied += got
    perType.push({ type: entry.type, total, rating: R, roll: rollVal, applied: got })
  }
  applied += Math.max(0, hit.direct ?? 0) // ignoreArmor points go straight on (the immune check above does not apply)
  const hp = healthLeft(mk)
  const left = hp === null ? null : Math.max(0, hp - applied)
  const destroyed = left !== null && left <= 0
  const props: Record<string, unknown> = {
    hit: (num(mk.props['hit']) ?? 0) + 1,
    ...(applied > 0 ? { damage: (num(mk.props['damage']) ?? 0) + applied, damaged: (num(mk.props['damaged']) ?? 0) + 1 } : {}),
    ...(left !== null ? { health: left } : {}),
    ...(destroyed ? { destroyed: true } : {}),
  }
  s = patchMarker(s, markerId, props)
  s = pushEvents(s, [{ type: 'objectDamage', markerId, attackerId: hit.attackerId, perType, applied, removed: destroyed }])
  if (destroyed) s = pushEvents(s, [{ type: 'objectRemoved', markerId, reason: 'damage' }])
  return { state: s, applied, destroyed }
}

// ---------- pushing ----------
/**
 * Shove an object `inches` straight away from `from` (a scenario push Action). An object that ends outside the table is
 * flagged props.offTable (scenarios read it). Pure geometry; the Str test is the caller's job.
 */
export function pushObject(state: GameState, markerId: Id, from: Vec2, inches: number): GameState {
  const mk = markerById(state, markerId)
  if (!mk) return state
  const dx = mk.pos.x - from.x, dz = mk.pos.z - from.z
  const len = Math.hypot(dx, dz) || 1
  const pos = { x: mk.pos.x + (dx / len) * inches, z: mk.pos.z + (dz / len) * inches }
  const { w, d } = state.scenario.table
  const off = Math.abs(pos.x) > w / 2 || Math.abs(pos.z) > d / 2
  const next = { ...state, markers: state.markers.map((m) => (m.id === markerId ? { ...m, pos, props: off ? { ...m.props, offTable: true } : m.props } : m)) }
  return pushEvents(next, [{ type: 'objectPushed', markerId, from: { ...mk.pos }, to: pos, off }])
}
