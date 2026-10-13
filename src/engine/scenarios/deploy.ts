// Scenario set-up from data (docs/spec/17-scenarios.md s4.1): terrain, markers and where each side's models stand.
// createGame calls deployScenario once, after the generic rows and the AI number draw. Only the parts of a scenario record
// written in the layout format (terrain entries with `piece`, marker `place.at|zone`, side `deploy.zone|groups`) are touched;
// older records keep the generic placement. All draws come from seeded streams, never the game rng.
import type { EditionBundle, ScenarioDef } from '../../data/types'
import { armorRoll } from '../dice'
import { recordOf } from '../edition'
import { baseRadius } from '../geometry'
import { pushEvents } from '../registry'
import { carriedFor, modelDefaults } from '../setup'
import { placementBlockers, worldShape, type WorldShape } from '../terrain'
import type { GameState, MarkerState, ModelState, TerrainInstance, Vec2 } from '../types'
import { clearOf, frameOf, inchesOf, pointOf, sampleZone, stream, terrainFrom, type Lookup, type PointSpec, type TerrainEntry, type ZoneSpec } from './spec'

/** A group of a side's models that stands in its own zone, possibly arriving later (reserve) or following a patrol route. */
export interface GroupSpec {
  /** Unit ids (one entry per model; repeat for several); "rest" takes whatever is left. */
  units: string[] | 'rest'
  zone: ZoneSpec
  /** Arrives later: at the start of `round`, or on a die roll in rounds [from, to] (armor die below round - `below`). */
  enters?: { round?: number; rounds?: [number, number]; armorDieBelowRoundMinus?: number; wave?: string }
  /** Patrol route id (markers with props.route.id) the group walks. */
  route?: number
  /** Counters written onto each model of the group at set-up (for example the chain link a player is bound to). */
  tokens?: Record<string, number>
}
export interface SideDeploy { zone?: ZoneSpec; groups?: GroupSpec[] }

const sideDef = (sc: ScenarioDef, id: string) => sc.sides.find((x) => x.id === id)
/** The side's deploy record when it is in the layout format (a zone object or groups); older records give {}. */
const deployOf = (sc: ScenarioDef, id: string): SideDeploy => {
  const d = (sideDef(sc, id)?.deploy ?? {}) as { zone?: unknown; groups?: unknown }
  return { ...(typeof d.zone === 'object' && d.zone !== null ? { zone: d.zone as ZoneSpec } : {}), ...(Array.isArray(d.groups) ? { groups: d.groups as GroupSpec[] } : {}) }
}
const isLayoutPlace = (p: object | undefined): boolean => !!p && ('at' in p || 'zone' in p)

/** Look up a placed piece by terrain id, marker id or marker face. */
function lookupFor(state: GameState): Lookup {
  return (name: string) => {
    const t = state.terrain.find((x) => x.id === name)
    if (t) return { ...t.pos }
    const mk = state.markers.find((x) => x.id === name || x.face === name)
    return mk ? { ...mk.pos } : null
  }
}
const shapeLookup = (state: GameState) => (id: string): WorldShape | null => {
  const t = state.terrain.find((x) => x.id === id)
  return t ? worldShape(t) : null
}

/** Radius a solid scenario object keeps clear of models. */
const solidRadius = (mk: MarkerState): number => (mk.kind === 'object' && mk.props.solid === true ? baseRadius(typeof mk.props.baseMm === 'number' ? mk.props.baseMm : 40) : 0)

function placeTerrain(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  const entries = (sc.terrain ?? []).filter((e): e is TerrainEntry => 'piece' in e && 'at' in e)
  if (entries.length === 0) return state
  const f = frameOf(state)
  let s: GameState = { ...state, terrain: [] }
  for (const e of entries) s = { ...s, terrain: [...s.terrain, terrainFrom(bundle, f, e, lookupFor(s))] }
  return s
}

function placeMarkers(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  const f = frameOf(state)
  const next = stream(state.seed, 'layout', sc.id, 'markers')
  const markers: MarkerState[] = [...state.markers]
  sc.markers.forEach((def, i) => {
    const place = def.place as { at?: PointSpec; zone?: ZoneSpec; apart?: string | number; clear?: string | number; r?: number }
    if (!isLayoutPlace(place) || !markers[i]) return
    const gap = inchesOf(bundle, place.apart)
    const r = place.r ?? 0.5
    let pos: Vec2 | null = null
    const lookup: Lookup = (name) => {
      const t = state.terrain.find((x) => x.id === name)
      if (t) return { ...t.pos }
      const mk = markers.find((x, k) => k !== i && (x.id === name || x.face === name))
      return mk ? { ...mk.pos } : null
    }
    if (place.at) pos = pointOf(bundle, f, place.at, lookup)
    else if (place.zone) {
      const placed = markers.filter((_, k) => k < i && sc.markers[k] && isLayoutPlace(sc.markers[k]!.place)).map((m) => ({ pos: m.pos, r }))
      const clearing = inchesOf(bundle, place.clear)
      pos = sampleZone(bundle, f, place.zone, next, {
        r, taken: placed, gap,
        ok: (p) => placementBlockers(state, p, r + clearing).length === 0,
      }, lookup, shapeLookup(state))
    }
    if (pos) markers[i] = { ...markers[i]!, pos }
  })
  return { ...state, markers }
}

/** Assign a side's models to its groups (by unit id), leaving the rest to the side zone. */
function groupsFor(models: ModelState[], groups: GroupSpec[]): Map<number, ModelState[]> {
  const out = new Map<number, ModelState[]>()
  const left = [...models].sort((a, b) => a.id.localeCompare(b.id))
  const take = (g: number, m: ModelState) => { out.set(g, [...(out.get(g) ?? []), m]); left.splice(left.indexOf(m), 1) }
  groups.forEach((g, gi) => {
    if (g.units === 'rest') return
    for (const u of g.units) {
      const m = left.find((x) => x.profileId === u)
      if (m) take(gi, m)
    }
  })
  groups.forEach((g, gi) => { if (g.units === 'rest') for (const m of [...left]) take(gi, m) })
  if (left.length) out.set(-1, left)
  return out
}

const withModel = (s: GameState, id: string, patch: Partial<ModelState>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })

/** Stand one model at a freshly drawn point in the zone; returns the new position or null when the zone is full. */
function standIn(state: GameState, bundle: EditionBundle, sc: ScenarioDef, m: ModelState, zone: ZoneSpec, next: () => number, taken: { pos: Vec2; r: number }[]): Vec2 | null {
  const f = frameOf(state)
  const r = clearOf(m.base)
  const apart = inchesOf(bundle, zone.apart)
  const ok = (p: Vec2): boolean => {
    if (placementBlockers(state, p, baseRadius(m.base)).length > 0) return false
    return !state.markers.some((mk) => solidRadius(mk) > 0 && Math.hypot(p.x - mk.pos.x, p.z - mk.pos.z) < solidRadius(mk) + baseRadius(m.base) + 0.3)
  }
  const lookup = lookupFor(state)
  const opts = (gap: number) => ({ r, taken, gap, ok })
  const shapes = shapeLookup(state)
  const tryZone = (z: ZoneSpec): Vec2 | null =>
    sampleZone(bundle, f, z, next, opts(apart), lookup, shapes) ?? sampleZone(bundle, f, z, next, opts(apart / 2), lookup, shapes) ?? sampleZone(bundle, f, z, next, opts(0), lookup, shapes)
  // A crowded zone grows a little rather than leaving a model at its generic row (the data's size is a minimum, not a promise).
  return tryZone(zone) ?? tryZone(grown(bundle, zone, 1.5)) ?? tryZone(grown(bundle, zone, 2.25))
}

function grown(bundle: EditionBundle, z: ZoneSpec, k: number): ZoneSpec {
  const g = (c: ZoneSpec['reach']): number | undefined => (c === undefined ? undefined : inchesOf(bundle, c) * k)
  return { ...z, ...(z.reach !== undefined ? { reach: g(z.reach)! } : {}), ...(z.w !== undefined ? { w: g(z.w)! } : {}), ...(z.d !== undefined ? { d: g(z.d)! } : {}), ...(z.within !== undefined ? { within: g(z.within)! } : {}) }
}

function placeModels(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  let s = state
  const taken: { pos: Vec2; r: number }[] = []
  const bySide = new Map<string, ModelState[]>()
  for (const m of Object.values(s.models)) {
    const side = s.seats[m.owner]?.side ?? ''
    bySide.set(side, [...(bySide.get(side) ?? []), m])
  }
  // Fixed sides first (the order the data lists them), so a later side steers clear of earlier ones.
  for (const def of sc.sides) {
    const models = bySide.get(def.id) ?? []
    const dep = deployOf(sc, def.id)
    if (!dep.zone && !dep.groups) continue
    const groups = dep.groups ?? []
    const assigned = groupsFor(models, groups)
    const next = stream(s.seed, 'layout', sc.id, def.id)
    const place = (m: ModelState, zone: ZoneSpec | undefined, group: GroupSpec | undefined, gi: number) => {
      if (!zone) return
      const reserve = !!group?.enters
      const pos = standIn(s, bundle, sc, m, zone, next, reserve ? [] : taken)
      if (!pos) return
      if (!reserve) taken.push({ pos, r: baseRadius(m.base) })
      const tokens = { ...m.tokens, deployX: pos.x, deployZ: pos.z }
      if (reserve) Object.assign(tokens, { reserve: gi + 1 })
      if (group?.route !== undefined) Object.assign(tokens, { aiRouteId: group.route, aiRoute: 1 })
      if (group?.tokens) Object.assign(tokens, group.tokens)
      s = withModel(s, m.id, { pos, tokens, ...(reserve ? { offTable: true } : {}) })
    }
    for (const [gi, ms] of assigned) {
      if (gi === -1) ms.forEach((m) => place(m, dep.zone, undefined, -1))
      else ms.forEach((m) => place(m, groups[gi]!.zone, groups[gi]!, gi))
    }
  }
  return s
}

/** A scenario object that blocks movement (props.blocksMove, such as the missile sled) also stands as an impassable piece of terrain. */
function addObjectTerrain(state: GameState): GameState {
  const extra: TerrainInstance[] = state.markers.filter((m) => m.props.blocksMove === true).map((m) => ({
    id: `obj-${m.id}`, pieceId: m.face ?? 'object', rulesType: 'scenarioTerrain', pos: { ...m.pos }, rot: 0,
    footprint: { circle: { r: solidRadiusOf(m) } }, height: 1.5,
    props: { baseType: 'obstacle', impassable: true, cover: true, blocksLos: m.props.blocksLos === true },
  }))
  return extra.length ? { ...state, terrain: [...state.terrain, ...extra] } : state
}
const solidRadiusOf = (mk: MarkerState): number => baseRadius(typeof mk.props.baseMm === 'number' ? mk.props.baseMm : 40)

/** Terrain, markers and models from the scenario record, in that order (later steps steer clear of earlier ones). */
export function deployScenario(state: GameState, bundle: EditionBundle): GameState {
  const sc = state.scenarioId ? recordOf(bundle, 'scenarios', state.scenarioId) : undefined
  if (!sc) return state
  let s = placeTerrain(state, bundle, sc)
  s = placeMarkers(s, bundle, sc)
  s = addObjectTerrain(s)
  return placeModels(s, bundle, sc)
}

// ---------- reserves and spawns ----------
/** Put the reserve models whose group enters at the start of `round` on the table (called at the end of round - 1). */
export function enterReserves(state: GameState, bundle: EditionBundle, round: number): GameState {
  const sc = state.scenarioId ? recordOf(bundle, 'scenarios', state.scenarioId) : undefined
  if (!sc) return state
  let s = state
  const entering = new Set<string>() // "<side>#<group index>"
  const rolled = new Map<string, boolean>() // one die per wave and round, shared by its groups
  for (const def of sc.sides) {
    const groups = deployOf(sc, def.id).groups ?? []
    groups.forEach((g, gi) => {
      const e = g.enters
      if (!e) return
      const waiting = Object.values(s.models).some((m) => s.seats[m.owner]?.side === def.id && m.tokens.reserve === gi + 1)
      if (!waiting) return
      if (e.round === round) entering.add(`${def.id}#${gi}`)
      else if (e.rounds && round >= e.rounds[0] && round <= e.rounds[1]) {
        const wave = `${def.id}:${e.wave ?? gi}`
        if (!rolled.has(wave)) {
          const r = armorRoll(s, bundle, `reserve:${wave}:${round}`)
          s = pushEvents(r.state, [r.event])
          rolled.set(wave, r.value < round - (e.armorDieBelowRoundMinus ?? 1))
        }
        if (rolled.get(wave)) entering.add(`${def.id}#${gi}`)
      }
    })
  }
  if (entering.size === 0) return s
  const taken = Object.values(s.models).filter((m) => !m.offTable && m.life === 'active').map((m) => ({ pos: m.pos, r: baseRadius(m.base) }))
  for (const key of entering) {
    const [sideId, gs] = key.split('#') as [string, string]
    const gi = Number(gs)
    const g = (deployOf(sc, sideId).groups ?? [])[gi]!
    const next = stream(s.seed, 'enter', sc.id, key, round)
    for (const m of Object.values(s.models).filter((x) => s.seats[x.owner]?.side === sideId && x.tokens.reserve === gi + 1).sort((a, b) => a.id.localeCompare(b.id))) {
      const pos = standIn(s, bundle, sc, m, g.zone, next, taken)
      if (!pos) continue
      taken.push({ pos, r: baseRadius(m.base) })
      const { reserve: _gone, ...tokens } = m.tokens
      s = withModel(s, m.id, { pos, offTable: false, readiness: 'unready', tokens: { ...tokens, deployX: pos.x, deployZ: pos.z } })
      s = pushEvents(s, [{ type: 'entered', modelId: m.id, at: { ...pos }, round }])
    }
  }
  return s
}

/** A brand-new model for a seat (a scenario spawn, such as a Deathclaw arriving). Returns the id. */
export function spawnModel(state: GameState, bundle: EditionBundle, seat: string, unitId: string, items: string[], pos: Vec2, extraTokens: Record<string, number> = {}, opts: { bare?: boolean; used?: boolean } = {}): { state: GameState; id: string } | null {
  const unit = recordOf(bundle, 'units', unitId)
  if (!unit) return null
  let n = 1
  while (state.models[`${seat.toLowerCase()}-${unitId}-${n}`]) n++
  const id = `${seat.toLowerCase()}-${unitId}-${n}`
  const std = !opts.bare && state.seats[seat]?.controller === 'official' ? bundle.records.ai.find((c) => c.unitId === unitId)?.standardEquipment ?? [] : []
  const numbers = Object.values(state.models).filter((m) => m.owner === seat).map((m) => m.tokens.aiNumber ?? 0)
  const model: ModelState = {
    ...modelDefaults(), id, profileId: unit.id, owner: seat, unitId: id, pos: { ...pos }, elev: 0, base: unit.baseMm, life: 'active', conditions: [],
    luck: unit.luck ? unit.attrs.luc : 0, carried: carriedFor(bundle, id, [...unit.equipped, ...items, ...std]), ...(opts.used ? { readiness: 'used' as const } : {}),
    tokens: { ...(state.seats[seat]?.controller === 'official' ? { aiNumber: Math.max(0, ...numbers) + 1, deployX: pos.x, deployZ: pos.z } : {}), ...extraTokens },
  }
  return { state: pushEvents({ ...state, models: { ...state.models, [id]: model } }, [{ type: 'spawned', modelId: id, unitId, at: { ...pos } }]), id }
}
