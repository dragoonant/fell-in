// Scenario mechanics that run between decisions (docs/spec/17-scenarios.md s4.2). Three entry points, all pure:
//   scenarioUpkeep   after every finished Action (events -> counters, patrol steps, keys, chains, exits)
//   scenarioTurnEnd  when a turn ends (the missile sled's move)
//   scenarioRoundEnd when a round ends (reserves arriving, the Deathclaw check)
// Which mechanics a scenario uses is read from its `rules` ids; their numbers come from marker props, rule `params` and the
// side deploy records in data/<edition>/scenarios. No rolls except through roll()/armorRoll()/flipLuck().
import type { EditionBundle, ScenarioDef } from '../../data/types'
import { isEngaged } from '../attack'
import { armorRoll, computeSv, flipLuck, skillTest } from '../dice'
import { attrOf } from '../forces'
import { recordOf, rulerInches } from '../edition'
import { hitObject } from '../objects'
import { baseOnTable, baseRadius, dist, isOnTable, segPointDist } from '../geometry'
import { hasLos } from '../los'
import { modelDistance } from '../measure'
import { removeModel } from '../damage'
import { pushEvents, updateModel } from '../registry'
import { placementBlockers } from '../terrain'
import type { GameState, MarkerState, ModelState, Vec2 } from '../types'

/** Engine events as the loose records they are (DiceRolled has its own shape and is skipped by type). */
type GameEvent = { type: string; [k: string]: unknown }
import { callReserves, enterReserves, spawnModel } from './deploy'
import { rectGapToBase } from './objshape'
import { cornerPoint, frameOf, inchesOf, pointOf, sampleZone, stream, type Corner, type PointSpec, type ZoneSpec } from './spec'

/** Geometry tolerance for "touching a marker" (a table fact, like scenario.ts MARKER_REACH_IN). */
const TOUCH_IN = 0.5

/** Scenario bookkeeping kept on state.scenario beside the table size (runtime only; the frozen type is not widened). */
interface Runtime { evSeen?: number; exited?: string[]; deathclawDone?: boolean; tech?: TechRuntime; towerTurns?: number; reinforced?: boolean }
interface TechRuntime { phase: number; revealedBy?: 'ai' | 'player'; techId?: string }
export const runtimeOf = (s: GameState): Runtime => s.scenario as unknown as Runtime
const withRuntime = (s: GameState, patch: Partial<Runtime>): GameState => ({ ...s, scenario: { ...s.scenario, ...patch } as GameState['scenario'] })

export const scenarioDefOfState = (s: GameState, bundle: EditionBundle): ScenarioDef | undefined => (s.scenarioId ? recordOf(bundle, 'scenarios', s.scenarioId) : undefined)
const hasRule = (sc: ScenarioDef, id: string): boolean => sc.rules.some((r) => r.id === id)
const paramsOf = (sc: ScenarioDef, id: string): Record<string, unknown> => ((sc.rules.find((r) => r.id === id) as { params?: Record<string, unknown> } | undefined)?.params ?? {})

const onTable = (m: ModelState): boolean => isOnTable(m)
export const isAiOwned = (s: GameState, m: ModelState): boolean => s.seats[m.owner]?.controller === 'official'
const markerGoneProps = (mk: MarkerState): boolean => mk.props.destroyed === true || mk.props.offTable === true
const patchMarker = (s: GameState, id: string, props: Record<string, unknown>): GameState => ({ ...s, markers: s.markers.map((m) => (m.id === id ? { ...m, props: { ...m.props, ...props } } : m)) })
const setMarker = (s: GameState, id: string, patch: Partial<MarkerState>): GameState => ({ ...s, markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
const lookupIn = (s: GameState) => (name: string): Vec2 | null => {
  const t = s.terrain.find((x) => x.id === name)
  if (t) return { ...t.pos }
  const mk = s.markers.find((x) => x.id === name || x.face === name)
  return mk ? { ...mk.pos } : null
}
export const markerRadius = (mk: MarkerState): number => baseRadius(typeof mk.props.baseMm === 'number' ? mk.props.baseMm : 40)
export const touchingMarker = (m: ModelState, mk: MarkerState): boolean => (rectGapToBase(mk, m.pos, baseRadius(m.base)) ?? dist(m.pos, mk.pos) - baseRadius(m.base) - markerRadius(mk)) <= TOUCH_IN

// ---------- entry points ----------
export function scenarioUpkeep(state: GameState, bundle: EditionBundle): GameState {
  const sc = scenarioDefOfState(state, bundle)
  if (!sc || state.phase === 'over') return state
  // New events since the last pass. ai.decision events are left out of the count: a replay from the action log does not recreate them.
  const counted = (state.events as unknown as GameEvent[]).filter((e) => e.type !== 'ai.decision')
  const seen = runtimeOf(state).evSeen ?? 0
  const fresh = seen > counted.length ? counted : counted.slice(seen)
  let s = withRuntime(state, { evSeen: counted.length })
  s = trackExits(s, fresh)
  if (hasRule(sc, 'sled')) s = sledEvents(s, bundle, fresh)
  if (hasRule(sc, 'patrol')) s = patrolStep(s, bundle, fresh)
  if (hasRule(sc, 'keys')) s = keysStep(s, bundle, sc)
  if (hasRule(sc, 'chain')) s = chainStep(s, bundle)
  if (hasRule(sc, 'weapon-uses')) s = weaponUses(s, bundle, sc, fresh)
  if (hasRule(sc, 'tech')) s = techStep(s, bundle, sc)
  if (hasRule(sc, 'tutorial-route')) s = routeStep(s, sc)
  if (hasRule(sc, 'remove-on-hit')) s = removeOnHit(s, sc)
  if (hasRule(sc, 'nuke-blast')) s = nukeBlast(s, bundle, sc, fresh)
  return withRuntime(s, { evSeen: countedLength(s) })
}

const countedLength = (s: GameState): number => (s.events as unknown as GameEvent[]).filter((e) => e.type !== 'ai.decision').length

export function scenarioTurnEnd(state: GameState, bundle: EditionBundle): GameState {
  const sc = scenarioDefOfState(state, bundle)
  if (!sc || state.phase === 'over') return state
  let s = scenarioUpkeep(state, bundle)
  if (hasRule(sc, 'sled') && sledOf(s)?.props.movesAt === 'turn') s = moveSled(s, bundle)
  if (hasRule(sc, 'tower-control')) s = towerControlStep(s, bundle, sc)
  if (hasRule(sc, 'tech')) s = techPresence(s, bundle)
  return s
}

/** Round end, first part: scenario movement that happens before the round's result is read (the sled's roll, unless it moves per turn). */
export function scenarioRoundMoves(state: GameState, bundle: EditionBundle): GameState {
  const sc = scenarioDefOfState(state, bundle)
  if (!sc) return state
  let s = scenarioUpkeep(state, bundle)
  // The sled rolls once per round unless its data says per turn (see RULING Missile sled timing).
  if (hasRule(sc, 'sled') && sledOf(s)?.props.movesAt !== 'turn') s = moveSled(s, bundle)
  return s
}

/** Round end, second part: what arrives for the next round (reserves, the Deathclaw check). Runs only when the game goes on. */
export function scenarioRoundEntries(state: GameState, bundle: EditionBundle): GameState {
  const sc = scenarioDefOfState(state, bundle)
  if (!sc) return state
  const next = state.round + 1
  let s = enterReserves(state, bundle, next)
  if (hasRule(sc, 'deathclaw')) s = deathclawCheck(s, bundle, sc, next)
  return withRuntime(s, { evSeen: countedLength(s) })
}

// ---------- tutorial route (GA-1), tutorial targets (GA-2) ----------
/** The first marker (face params.first) is marked reached once a model touches it; the scenario's victory then waits for the second. */
function routeStep(state: GameState, sc: ScenarioDef): GameState {
  const first = (paramsOf(sc, 'tutorial-route').first as string | undefined) ?? 'crate'
  let s = state
  for (const mk of s.markers.filter((x) => x.face === first && x.props.done !== true)) {
    if (Object.values(s.models).some((m) => onTable(m) && touchingMarker(m, mk))) s = setMarker(s, mk.id, { revealed: true, props: { ...mk.props, done: true } })
  }
  return s
}

/** GA-2: a target marker leaves the table once it has been hit (its `hit` counter stays for the victory check). */
function removeOnHit(state: GameState, sc: ScenarioDef): GameState {
  const face = paramsOf(sc, 'remove-on-hit').face as string | undefined
  let s = state
  for (const mk of s.markers.filter((x) => x.face === face && x.props.destroyed !== true && typeof x.props.hit === 'number' && x.props.hit > 0)) s = patchMarker(s, mk.id, { destroyed: true })
  return s
}

// ---------- the mini nuke (box-2) ----------
/**
 * A shot that hits the carrier, or a model within `near` of the nuke, rolls the red armor die: a 1 sets the nuke off (both
 * sides lose). On any other result the shot is meant to hit the carrier; the shot itself resolves as usual (RULING).
 */
function nukeBlast(state: GameState, bundle: EditionBundle, sc: ScenarioDef, events: readonly GameEvent[]): GameState {
  let s = state
  const nuke = s.markers.find((m) => m.face === 'mini-nuke')
  if (!nuke || markerGoneProps(nuke) || nuke.props.exploded === true) return s
  const near = inchesOf(bundle, (paramsOf(sc, 'nuke-blast').near as string | undefined) ?? 'orange')
  for (const e of events) {
    if (e.type !== 'attack' || e.ns === 'melee' || e.success !== true) continue
    const target = s.models[String(e.targetId)]
    if (!target) continue
    const at = (s.markers.find((m) => m.id === nuke.id)!.carriedBy ? s.models[nuke.carriedBy!]?.pos : null) ?? nuke.pos
    const carrier = nuke.carriedBy === target.id
    if (!carrier && Math.max(0, dist(target.pos, at) - baseRadius(target.base)) > near) continue
    const roll = armorRoll(s, bundle, 'nuke:hit')
    s = pushEvents(roll.state, [roll.event, { type: 'nukeShotHit', targetId: target.id, armorDie: roll.value }])
    if (roll.value === 1) return pushEvents(patchMarker(s, nuke.id, { exploded: true }), [{ type: 'nukeDetonated', markerId: nuke.id }])
  }
  return s
}

// ---------- tower control and held-back reserves (box-4) ----------
/** One count per finished turn: the defenders touch the tower and no enemy does. At `turns` in a row the reserve is called in. */
function towerControlStep(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  const p = paramsOf(sc, 'tower-control') as { side?: string; turns?: number }
  const tower = state.markers.find((m) => m.face === 'radio-tower')
  if (!tower || !p.side || runtimeOf(state).reinforced) return state
  const sideOf = (m: ModelState): string => state.seats[m.owner]?.side ?? ''
  const at = Object.values(state.models).filter((m) => onTable(m) && !m.inert && touchingMarker(m, tower))
  const mine = at.filter((m) => sideOf(m) === p.side).length, foes = at.filter((m) => sideOf(m) !== p.side).length
  const n = mine > 0 && foes === 0 ? (runtimeOf(state).towerTurns ?? 0) + 1 : 0
  let s = withRuntime(state, { towerTurns: n })
  if (n >= (p.turns ?? 3)) {
    s = callReserves(s, bundle, p.side, 'towerControl')
    s = withRuntime(pushEvents(s, [{ type: 'reinforcementsCalled', side: p.side }]), { reinforced: true })
  }
  return s
}

// ---------- exits ----------
function trackExits(s: GameState, events: readonly GameEvent[]): GameState {
  const out = runtimeOf(s).exited ?? []
  const add = events.filter((e) => e.type === 'removed' && e.reason === 'left the table').map((e) => String(e.modelId)).filter((id) => !out.includes(id))
  return add.length ? withRuntime(s, { exited: [...out, ...add] }) : s
}
export const exitedIds = (s: GameState): string[] => runtimeOf(s).exited ?? []
/** The Tech model once marker 1 has been looked at (The Escaped Tech). */
export const techIdOf = (s: GameState): string | undefined => runtimeOf(s).tech?.techId

/** Take a model off the table the way walking off an edge does, and log it as an exit. */
function exitModel(s: GameState, bundle: EditionBundle, id: string): GameState {
  const out = removeModel(s, bundle, id, 'left the table')
  const ids = runtimeOf(out).exited ?? []
  return withRuntime(out, { exited: ids.includes(id) ? ids : [...ids, id] })
}

// ---------- missile sled (AIH s4 The Missile) ----------
const sledOf = (s: GameState): MarkerState | undefined => s.markers.find((m) => typeof m.props.moves === 'object' && m.props.moves !== null)

function areaRadius(bundle: EditionBundle, weaponId: string): number {
  const w = recordOf(bundle, 'weapons', weaponId)
  const area = w?.damage?.find((d) => d.area)?.area
  return area ? rulerInches(bundle, area) / 2 : 0
}

/** Count hits on the missile from this batch of events, rolling the armor die for each (detonation at <= earlier hits). */
function sledEvents(state: GameState, bundle: EditionBundle, events: readonly GameEvent[]): GameState {
  let s = state
  let mk = sledOf(s)
  if (!mk || markerGoneProps(mk) || mk.props.detonated === true) return s
  const near = inchesOf(bundle, (mk.props.hitWithin as string | undefined) ?? 'yellow')
  const r = markerRadius(mk)
  let landing: Vec2 | null = null
  let hits = 0
  for (const e of events) {
    if (e.type === 'scatter') { landing = e.to as Vec2; continue }
    if (e.type !== 'attack') continue
    const target = s.models[String(e.targetId)]
    const centre = landing ?? (target ? target.pos : null)
    landing = null
    let hit = false
    // A shooting test that shows an X at the sled, or at a target within Yellow of it.
    if (e.ns === 'shoot' && e.result === null) {
      if (e.targetId === mk.id) hit = true
      else if (target && Math.max(0, dist(target.pos, mk.pos) - baseRadius(target.base) - r) <= near) hit = true
    }
    // Area damage that reaches the sled.
    const reach = areaRadius(bundle, String(e.weaponId))
    if (reach > 0 && centre && dist(centre, mk.pos) - r <= reach) hit = true
    if (hit) hits++
  }
  for (let i = 0; i < hits; i++) {
    mk = sledOf(s)!
    const before = typeof mk.props.missileHits === 'number' ? mk.props.missileHits : 0
    const roll = armorRoll(s, bundle, 'missile:hit')
    s = pushEvents(roll.state, [roll.event, { type: 'missileHit', hitsBefore: before, armorDie: roll.value }])
    if (roll.value <= before) { s = pushEvents(patchMarker(s, mk.id, { detonated: true }), [{ type: 'missileDetonated', markerId: mk.id }]); break }
    s = patchMarker(s, mk.id, { missileHits: before + 1 })
  }
  // A Use [Lockpick] while Interacting with the sled: 1 damage, no armor roll.
  mk = sledOf(s)!
  if (mk.props.done === true && mk.props.detonated !== true) {
    s = patchMarker(s, mk.id, { done: false })
    s = hitObject(s, bundle, mk.id, { damage: [], dmg: 0, ar: 0, direct: 1 }).state
  }
  return s
}

/** The sled's move at the end of a turn: towards the exit by the shortest clear heading, shoving or crushing models. */
function moveSled(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  const mk = sledOf(s)
  if (!mk || markerGoneProps(mk) || mk.props.detonated === true) return s
  const mv = mk.props.moves as { colour: string; towards: PointSpec }
  const step = inchesOf(bundle, mv.colour)
  const exit = pointOf(bundle, frameOf(s), mv.towards, lookupIn(s))
  const r = markerRadius(mk)
  const pieceId = `obj-${mk.id}`
  const terrainWithout = s.terrain.filter((t) => t.id !== pieceId)
  const free = (p: Vec2): boolean => placementBlockers({ terrain: terrainWithout }, p, r).length === 0
  const to = { x: exit.x - mk.pos.x, z: exit.z - mk.pos.z }
  const left = Math.hypot(to.x, to.z)
  const base = Math.atan2(to.z, to.x)
  const len = Math.min(step, left)
  let dest: Vec2 | null = null
  for (const deg of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
    const a = base + (deg * Math.PI) / 180
    const end = { x: mk.pos.x + Math.cos(a) * len, z: mk.pos.z + Math.sin(a) * len }
    let clear = true
    for (let d = 0.5; d <= len + 1e-9 && clear; d += 0.5) clear = free({ x: mk.pos.x + Math.cos(a) * d, z: mk.pos.z + Math.sin(a) * d })
    if (clear && free(end)) { dest = end; break }
  }
  if (!dest) return s // boxed in: it waits
  const leaving = left <= step + 1e-9
  if (leaving) dest = { x: exit.x, z: exit.z }
  const from = { ...mk.pos }
  // Models in the way: Push Back out of the path, or run over when there is no room (AIH s4).
  const ids = Object.values(s.models).filter(onTable).map((m) => m.id).sort()
  for (const id of ids) {
    const m = s.models[id]!
    const seg = segPointDist(from, dest, m.pos)
    const need = r + baseRadius(m.base)
    if (seg.d >= need - 1e-9) continue
    const c = { x: from.x + (dest.x - from.x) * seg.t, z: from.z + (dest.z - from.z) * seg.t }
    let dir = { x: m.pos.x - c.x, z: m.pos.z - c.z }
    let dl = Math.hypot(dir.x, dir.z)
    if (dl < 1e-6) { dir = { x: -(dest.z - from.z), z: dest.x - from.x }; dl = Math.hypot(dir.x, dir.z) || 1 }
    const unit = { x: dir.x / dl, z: dir.z / dl }
    const legal = (p: Vec2): boolean => baseOnTable(s, p, baseRadius(m.base))
      && placementBlockers({ terrain: terrainWithout }, p, baseRadius(m.base)).length === 0
      && !Object.values(s.models).some((o) => o.id !== id && onTable(o) && dist(o.pos, p) < baseRadius(o.base) + baseRadius(m.base) - 1e-9)
    const tries = [1, -1].map((sg) => ({ x: c.x + unit.x * sg * (need + 0.05), z: c.z + unit.z * sg * (need + 0.05) }))
    const spot = tries.find(legal)
    if (spot) s = updateModel(s, id, { pos: spot })
    else s = removeModel(pushEvents(s, [{ type: 'crushed', modelId: id, by: mk.id }]), bundle, id, 'crushed by the sled')
  }
  s = setMarker(s, mk.id, { pos: dest, props: { ...mk.props, ...(leaving ? { offTable: true } : {}) } })
  s = { ...s, terrain: s.terrain.map((t) => (t.id === pieceId ? { ...t, pos: { ...dest! } } : t)) }
  return pushEvents(s, [{ type: 'objectMoved', markerId: mk.id, from, to: { ...dest }, off: leaving }])
}

// ---------- patrols and awareness (AIH s4 The Break-in) ----------
interface RouteInfo { id: number; step: number }
export const routeOf = (mk: MarkerState): RouteInfo | null => {
  const r = mk.props.route as RouteInfo | undefined
  return r && typeof r.id === 'number' ? r : null
}

function patrolStep(state: GameState, bundle: EditionBundle, events: readonly GameEvent[]): GameState {
  let s = state
  const patrollers = Object.values(s.models).filter((m) => onTable(m) && isAiOwned(s, m) && m.tokens.aiRouteId !== undefined && !(m.tokens.aiAware > 0))
  if (patrollers.length === 0) return s
  const attacks = events.filter((e) => e.type === 'attack')
  for (const m0 of patrollers) {
    let m = s.models[m0.id]!
    // Walk the loop: touching the marker being walked to sends it on to the next one (it need not stop there).
    const route = s.markers.filter((mk) => routeOf(mk)?.id === m.tokens.aiRouteId).sort((a, b) => routeOf(a)!.step - routeOf(b)!.step)
    if (route.length) {
      const idx = (m.tokens.aiRoute ?? 0) % route.length
      if (touchingMarker(m, route[idx]!)) {
        s = updateModel(s, m.id, { tokens: { ...m.tokens, aiRoute: ((m.tokens.aiRoute ?? 0) + 1) % route.length } })
        m = s.models[m.id]!
      }
    }
    // Aware: an enemy within one Awareness length in line of sight, or an enemy attack close enough to hear, or being shot at.
    const unit = recordOf(bundle, 'units', m.profileId)
    const reach = unit ? rulerInches(bundle, unit.awareness) : 0
    const enemies = Object.values(s.models).filter((o) => onTable(o) && !isAiOwned(s, o) && o.owner !== m.owner)
    let aware = enemies.some((o) => modelDistance(m, o) <= reach + 1e-6 && hasLos(s, m.id, o.id))
    if (!aware) {
      aware = attacks.some((e) => {
        const a = s.models[String(e.attackerId)]
        if (!a || isAiOwned(s, a)) return false
        return e.targetId === m.id || modelDistance(m, a) <= reach + 1e-6
      })
    }
    if (aware) s = updateModel(s, m.id, { tokens: { ...m.tokens, aiAware: 1 } })
  }
  return s
}

// ---------- keys, locks and the hatch (COOP s4 Into the Sewer) ----------
function keysStep(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  let s = state
  const p = paramsOf(sc, 'keys')
  const skills = (Array.isArray(p.skills) ? p.skills : ['computers', 'lockpick']) as string[]
  // 1. A marker someone has looked at: blanks are discarded, numbered ones become a lock box or a terminal.
  for (const mk of [...s.markers]) {
    if (mk.kind !== 'investigation' || mk.seenBy.length === 0 || !mk.face) continue
    if (mk.face === 'blank') s = { ...s, markers: s.markers.filter((x) => x.id !== mk.id) }
    else if (mk.face.startsWith('key-')) {
      const next = stream(s.seed, 'key-box', mk.id)
      const skill = skills[Math.floor(next() * skills.length)]!
      s = setMarker(s, mk.id, { kind: 'object', face: 'protocol-box', revealed: true, props: { ...mk.props, skill, public: true, box: mk.face } })
    }
  }
  // 2. A box that has been opened gives its key to the model that opened it.
  const actor = s.activation?.modelId
  for (const mk of s.markers.filter((x) => x.face === 'protocol-box' && x.props.done === true)) {
    const who = (actor && s.models[actor]) || Object.values(s.models).filter(onTable).sort((a, b) => dist(a.pos, mk.pos) - dist(b.pos, mk.pos))[0]
    s = { ...s, markers: s.markers.filter((x) => x.id !== mk.id) }
    if (who) s = pushEvents(updateModel(s, who.id, { tokens: { ...who.tokens, key: (who.tokens.key ?? 0) + 1 } }), [{ type: 'keyTaken', modelId: who.id, box: mk.props.box }])
  }
  // 3. A key-holder touching the hatch removes a lock (an Interact with no Action).
  const hatch = s.markers.find((x) => x.props.hatch === true)
  if (!hatch) return s
  for (const m of Object.values(s.models).filter(onTable).sort((a, b) => a.id.localeCompare(b.id))) {
    const h = s.markers.find((x) => x.id === hatch.id)!
    const locks = typeof h.props.locks === 'number' ? h.props.locks : 0
    if ((m.tokens.key ?? 0) > 0 && locks > 0 && touchingMarker(m, h)) {
      s = updateModel(s, m.id, { tokens: { ...m.tokens, key: m.tokens.key! - 1 } })
      s = patchMarker(s, h.id, { locks: locks - 1, ...(locks - 1 === 0 ? { open: true } : {}) })
      s = pushEvents(s, [{ type: 'lockRemoved', modelId: m.id, left: locks - 1 }])
    }
  }
  // 4. With both locks gone, the player model that has just acted and is touching the hatch leaves through it (the engine has
  //    no free Action, so leaving happens when the model's Action ends beside the hatch).
  const h2 = s.markers.find((x) => x.id === hatch.id)!
  const actor2 = s.activation?.modelId ? s.models[s.activation.modelId] : undefined
  if (h2.props.open === true && actor2 && onTable(actor2) && !isAiOwned(s, actor2) && touchingMarker(actor2, h2)) s = exitModel(s, bundle, actor2.id)
  return s
}

// ---------- the chain (COOP s4 Blood Cage) ----------
function chainStep(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  const chain = s.markers.find((m) => m.face === 'chain')
  if (!chain || markerGoneProps(chain)) return s
  const holes = [s.markers.find((m) => m.face === 'hole-1'), s.markers.find((m) => m.face === 'hole-2')]
  const pair = [1, 2].map((n) => Object.values(s.models).find((m) => m.tokens.chain === n && onTable(m)))
  if (!holes[0] || !holes[1] || !pair[0] || !pair[1]) return s
  const slack = inchesOf(bundle, (chain.props.slack as string | undefined) ?? 'black')
  const d = (i: 0 | 1): number => dist(s.models[pair[i]!.id]!.pos, holes[i]!.pos)
  let excess = d(0) + d(1) - slack
  if (excess <= 1e-6) return s
  const actor = s.activation?.modelId
  const movedIdx: 0 | 1 = actor === pair[1]!.id ? 1 : 0
  const pull = (i: 0 | 1, amount: number): number => {
    const m = s.models[pair[i]!.id]!, hole = holes[i]!.pos
    const dl = dist(m.pos, hole)
    const take = Math.min(amount, dl)
    if (take <= 1e-9) return 0
    // Back off in small steps until the spot is legal: the pulled model stops where something is in its way.
    for (let t = take; t > 1e-3; t -= 0.25) {
      const p = { x: m.pos.x + ((hole.x - m.pos.x) / dl) * t, z: m.pos.z + ((hole.z - m.pos.z) / dl) * t }
      const ok = baseOnTable(s, p, baseRadius(m.base))
        && placementBlockers(s, p, baseRadius(m.base)).length === 0
        && !Object.values(s.models).some((o) => o.id !== m.id && onTable(o) && dist(o.pos, p) < baseRadius(o.base) + baseRadius(m.base) - 1e-9)
      if (ok) { s = updateModel(s, m.id, { pos: p }); return t }
    }
    return 0
  }
  // The model that did not move is pulled towards its hole; whatever it cannot give comes out of the mover's reach.
  const other = (1 - movedIdx) as 0 | 1
  excess -= pull(other, excess)
  if (excess > 1e-6) pull(movedIdx, excess)
  return pushEvents(s, [{ type: 'chainPulled' }])
}

// ---------- limited-use weapons (COOP s4 Blood Cage) ----------
function weaponUses(state: GameState, bundle: EditionBundle, sc: ScenarioDef, events: readonly GameEvent[]): GameState {
  let s = state
  const limit = typeof paramsOf(sc, 'weapon-uses').limit === 'number' ? (paramsOf(sc, 'weapon-uses').limit as number) : 3
  for (const e of events) {
    if (e.type !== 'attack' || e.ns === 'melee') continue
    const m = s.models[String(e.attackerId)]
    const w = recordOf(bundle, 'weapons', String(e.weaponId))
    if (!m || !w) continue
    const key = `use:${w.id}`
    const used = (m.tokens[key] ?? 0) + 1
    // Found weapons run dry after `limit` uses; the weapon card is spent, so it leaves the model.
    const carried = used >= limit ? m.carried.filter((c) => !(c.defId === w.id && !c.starting)) : m.carried
    s = updateModel(s, m.id, { tokens: { ...m.tokens, [key]: used }, carried })
  }
  return s
}

// ---------- the Deathclaw (COOP s4 Into the Sewer) ----------
function deathclawCheck(state: GameState, bundle: EditionBundle, sc: ScenarioDef, round: number): GameState {
  const p = paramsOf(sc, 'deathclaw') as { rounds?: [number, number]; unit?: string; zone?: ZoneSpec; seat?: string }
  if (runtimeOf(state).deathclawDone || !p.rounds || round < p.rounds[0] || round > p.rounds[1] || !p.zone || !p.unit) return state
  const flip = flipLuck(state, `deathclaw:${round}`)
  let s = pushEvents(flip.state, [flip.event])
  if (!flip.lucky) return s
  const seat = p.seat ?? s.seatOrder.find((x) => s.seats[x]?.controller === 'official') ?? s.seatOrder[0]!
  const next = stream(s.seed, 'deathclaw', round)
  const unit = recordOf(bundle, 'units', p.unit)
  if (!unit) return s
  const taken = Object.values(s.models).filter(onTable).map((m) => ({ pos: m.pos, r: baseRadius(m.base) }))
  const pos = sampleZone(bundle, frameOf(s), p.zone, next, {
    r: baseRadius(unit.baseMm) + 0.25, taken, gap: 0.2, ok: (q) => placementBlockers(s, q, baseRadius(unit.baseMm)).length === 0,
  }, lookupIn(s))
  if (!pos) return s
  const spawned = spawnModel(s, bundle, seat, p.unit, [], pos)
  if (!spawned) return s
  return withRuntime(spawned.state, { deathclawDone: true })
}

// ---------- The Escaped Tech (AIH s4) ----------
/**
 * Phase 1 is the search of eight face-down markers; marker 1 hides the Tech. Looking at a blank discards it. When a hound (the AI)
 * looks at marker 1 the Tech appears there and the AI is in phase 2 straight away; when a player looks first the Tech joins that
 * player's team and the AI stays in phase 1 until the Tech comes into the line of sight of any AI model (phase 2). A Super Mutant
 * that gets a Presence test through on the Tech takes it back under AI control: phase 3, every AI model protects it and it walks
 * to the exit. The exits are the two edges beside the opponent's start corner, up to Black from that corner (params
 * exitCornerAi / exitCornerPlayers / exitWithin); the exit markers only give the AI a point to walk to.
 * Not modelled here: the Tech's Move-only limit and its refusal to move beside a hound, Yellow awareness for players looking at
 * markers, and the hounds' Red limit. The Presence test is made by the engine at the end of the AI's turn for each Super Mutant
 * in range (RULING Escaped Tech). See docs/needs-rules-check.md.
 */
interface TechParams { unit?: string; revealFace?: string; exitCornerAi?: Corner; exitCornerPlayers?: Corner; exitWithin?: string }

/** Is the model's base against one of the two table edges at `corner`, no more than `within` inches along that edge from the corner? */
function touchesExitBand(s: GameState, m: ModelState, corner: Corner, within: number): boolean {
  const f = frameOf(s), c = cornerPoint(f, corner), r = baseRadius(m.base)
  const onX = Math.abs(c.x - m.pos.x) - r <= TOUCH_IN && Math.abs(m.pos.z - c.z) <= within
  const onZ = Math.abs(c.z - m.pos.z) - r <= TOUCH_IN && Math.abs(m.pos.x - c.x) <= within
  return onX || onZ
}

function setAiPhase(s: GameState, phase: number): GameState {
  const models = Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, isAiOwned(s, m) ? { ...m, tokens: { ...m.tokens, aiPhase: Math.max(phase, m.tokens.aiPhase ?? 0) } } : m]))
  return { ...s, models }
}

function techStep(state: GameState, bundle: EditionBundle, sc: ScenarioDef): GameState {
  let s = state
  const p = paramsOf(sc, 'tech') as TechParams
  const aiSeat = s.seatOrder.find((x) => s.seats[x]?.controller === 'official')
  // An AI seat looking at a marker turns it face up for everyone.
  if (aiSeat) s = { ...s, markers: s.markers.map((m) => (m.kind === 'investigation' && m.seenBy.includes(aiSeat) && !m.revealed ? { ...m, revealed: true } : m)) }
  // Blanks that have been seen are discarded; the Tech marker becomes the Tech.
  for (const mk of [...s.markers]) {
    if (mk.kind !== 'investigation' || mk.seenBy.length === 0) continue
    if (mk.face === 'blank') { s = { ...s, markers: s.markers.filter((x) => x.id !== mk.id) }; continue }
    if (mk.face !== (p.revealFace ?? 'tech') || runtimeOf(s).tech) continue
    const seat = mk.seenBy[0]!
    const spawned = spawnModel(s, bundle, seat, p.unit ?? 'enslaved-tech', [], mk.pos, { tech: 1 }, { bare: true, used: true })
    if (!spawned) continue
    s = { ...spawned.state, markers: spawned.state.markers.filter((x) => x.id !== mk.id) }
    const byAi = s.seats[seat]?.controller === 'official'
    s = withRuntime(s, { tech: { phase: byAi ? 2 : 1, revealedBy: byAi ? 'ai' : 'player', techId: spawned.id } })
    if (byAi) s = setAiPhase(s, 2)
    s = pushEvents(s, [{ type: 'techRevealed', modelId: spawned.id, by: seat }])
  }
  const tech = runtimeOf(s).tech
  const t = tech?.techId ? s.models[tech.techId] : undefined
  if (tech && t && onTable(t)) {
    // A Tech the players found is still unseen by the AI: the first AI model with a line of sight to it starts phase 2.
    if (tech.phase === 1 && !isAiOwned(s, t) && Object.values(s.models).some((m) => m.id !== t.id && onTable(m) && isAiOwned(s, m) && hasLos(s, m.id, t.id))) {
      s = setAiPhase(withRuntime(s, { tech: { ...tech, phase: 2 } }), 2)
      s = pushEvents(s, [{ type: 'techSpotted', modelId: t.id }])
    }
    // The Tech leaves at the edges beside the other side's start corner, up to Black from that corner.
    const within = inchesOf(bundle, p.exitWithin ?? 'black')
    const now = s.models[t.id]!
    const corner = isAiOwned(s, now) ? p.exitCornerPlayers : p.exitCornerAi
    if (corner && onTable(now) && touchesExitBand(s, now, corner, within)) s = exitModel(s, bundle, t.id)
  }
  return s
}

/**
 * Phase 2 to 3 (AIH s4: Super Mutants Use [Presence] on the Tech). At the end of the AI's turn each of its Super Mutants that is not
 * engaged, has the Tech in line of sight and within its own Presence ruler makes one Presence test; the first success puts the
 * Tech back under the AI's control and every AI model into phase 3.
 */
function techPresence(state: GameState, bundle: EditionBundle): GameState {
  const aiSeat = state.seatOrder.find((x) => state.seats[x]?.controller === 'official')
  const tech = runtimeOf(state).tech
  if (!aiSeat || state.turn?.seat !== aiSeat || !tech?.techId || tech.phase !== 2) return state
  let s = state
  const t = s.models[tech.techId]
  if (!t || !onTable(t)) return s
  for (const sm of Object.values(s.models).filter((m) => onTable(m) && isAiOwned(s, m) && m.id !== t.id).sort((a, b) => a.id.localeCompare(b.id))) {
    const unit = recordOf(bundle, 'units', sm.profileId)
    const row = unit?.skills.find((k) => k.skill === 'presence')
    if (!row || !row.colour || isEngaged(s, sm.id) || modelDistance(sm, t) > rulerInches(bundle, row.colour as never) + 1e-9 || !hasLos(s, sm.id, t.id)) continue
    const sv = computeSv(attrOf(s, bundle, sm.id, row.attr), []).sv
    const r = skillTest(s, bundle, { sv, pool: {}, purpose: `presence:${sm.id}>${t.id}`, ownerId: sm.id })
    s = pushEvents(r.state, r.events)
    if (!r.test.success) continue
    const nums = Object.values(s.models).filter((m) => m.owner === aiSeat).map((m) => m.tokens.aiNumber ?? 0)
    s = updateModel(s, t.id, { owner: aiSeat, readiness: 'used', tokens: { ...t.tokens, aiNumber: Math.max(0, ...nums) + 1, deployX: t.pos.x, deployZ: t.pos.z } })
    s = setAiPhase(withRuntime(s, { tech: { ...tech, phase: 3 } }), 3)
    return pushEvents(s, [{ type: 'techRestored', modelId: t.id, by: sm.id }])
  }
  return s
}

