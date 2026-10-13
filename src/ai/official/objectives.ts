// Objective settings (spec 18 s1.3, s8.6; CH p9, p13; AIH s2). Scenario data -> AiSettings -> ResolvedSubject.
import { AI_RESPONSES, type EditionBundle, type ScenarioDef } from '../../data/types'
import { recordOf, rulerInches } from '../../engine/edition'
import { baseRadius, isOnTable } from '../../engine/geometry'
import { hasLos } from '../../engine/los'
import { modelDistance } from '../../engine/measure'
import type { Id, MarkerState, ModelState, Vec2 } from '../../engine/types'
import type { AiView } from '../types'
import { queryState } from '../world'
import type { AiObjective, AiResponse, AiSettings, ResolvedSubject } from './types'

const OBJECTIVES: readonly string[] = ['defeat', 'protect', 'goTo', 'use', 'none']
const NONE: ResolvedSubject = { kind: 'none', ids: [], points: [] }
const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s_]+/g, '-')

/** The scenario record the view belongs to (view.scenarioId via ViewExtras), or undefined. */
export function scenarioOf(view: AiView, bundle: EditionBundle): ScenarioDef | undefined {
  return view.scenarioId ? bundle.records.scenarios.find((s) => s.id === view.scenarioId) : undefined
}

const aiBlock = (view: AiView, bundle: EditionBundle) => scenarioOf(view, bundle)?.sides.find((s) => s.ai)?.ai

const enemiesOfModel = (view: AiView, me: ModelState): ModelState[] =>
  Object.values(view.models).filter((m) => m.owner !== me.owner && isOnTable(m))

interface SwitchSet { objective?: string; subject?: string; phase?: number; who?: string; forceResponse?: string }

function markerHeldBySide(view: AiView, me: ModelState, word: string): boolean {
  return (view.markers ?? []).some((mk) => {
    const holder = mk.carriedBy ? view.models[mk.carriedBy] : undefined
    return !!holder && holder.owner === me.owner && (norm(mk.face ?? '').includes(word) || mk.id === word)
  })
}

/** Is a switch on right now for this model? Latched switches (kept by the host) and engine-written phases count too. */
function switchOn(sw: { when: string; set: object }, idx: number, view: AiView, bundle: EditionBundle, me: ModelState, latched: ReadonlySet<number>): boolean {
  if (latched.has(idx)) return true
  const set = sw.set as SwitchSet
  const when = (sw.when ?? '').toLowerCase().trim()
  if (!when || when === 'always') return true
  if (typeof set.phase === 'number' && (me.tokens.aiPhase ?? 0) >= set.phase) return true
  const holds = /ai model (?:holds|carries|has) (?:the )?([\w -]+)/.exec(when)
  if (holds) return markerHeldBySide(view, me, norm(holds[1]!))
  if (/aware of a trigger|sees a player model|sees an enemy/.test(when)) {
    if ((me.tokens.aiAware ?? 0) > 0) return true
    const unit = recordOf(bundle, 'units', me.profileId)
    if (!unit) return false
    const reach = rulerInches(bundle, unit.awareness)
    const q = queryState(view, bundle)
    return enemiesOfModel(view, me).some((e) => modelDistance(me, e) <= reach + 1e-6 && hasLos(q, me.id, e.id))
  }
  return false
}

function whoMatches(who: string | undefined, view: AiView, me: ModelState): boolean {
  if (!who) return true
  const w = norm(who)
  const carrier = (view.markers ?? []).some((mk) => mk.carriedBy === me.id)
  if (w === 'carrier') return carrier
  if (w === 'others' || w === 'rest' || w === 'non-carrier') return !carrier
  return w === norm(me.id) || w === norm(me.profileId)
}

/** Settings plus the indexes of the switches that are on (the host latches them, CH p9 "may change during play"). */
export function settingsWith(view: AiView, bundle: EditionBundle, me: ModelState, latched: ReadonlySet<number> = new Set()): { settings: AiSettings; active: number[] } {
  const ai = aiBlock(view, bundle)
  if (!ai) return { settings: { objective: 'none', subject: '' }, active: [] }
  const settings: AiSettings = { objective: ai.objective, subject: ai.subject }
  const active: number[] = []
  ;(ai.switches ?? []).forEach((sw, i) => {
    const set = sw.set as SwitchSet
    if (!whoMatches(set.who, view, me)) return
    if (!switchOn(sw, i, view, bundle, me, latched)) return
    active.push(i)
    if (typeof set.objective === 'string' && OBJECTIVES.includes(set.objective)) settings.objective = set.objective as AiObjective
    if (typeof set.subject === 'string') settings.subject = set.subject
    if (typeof set.forceResponse === 'string' && (AI_RESPONSES as readonly string[]).includes(set.forceResponse)) settings.forceResponse = set.forceResponse as AiResponse
    else if (set.forceResponse === 'matrix') delete settings.forceResponse // a later switch hands the choice back to the matrix (patrol over)
  })
  return { settings, active }
}

/**
 * Current settings for one AI model: the side's `ai` block, then latched phase switches (`tokens.aiPhase`), then live
 * switch predicates (e.g. "an AI model holds the helmet"), then per-model `who` overrides. No `ai` block: Defeat
 * [any-enemy] is NOT assumed; returns objective 'none' (O falls back to A, CH p13).
 */
export function settingsFor(view: AiView, bundle: EditionBundle, me: ModelState): AiSettings {
  return settingsWith(view, bundle, me).settings
}

const live = (mk: MarkerState): boolean => mk.props['destroyed'] !== true && mk.props['offTable'] !== true

/** Point on the table edge nearest the model's deployment point, lined up with the model (the entry edge). */
function edgePoint(view: AiView, me: ModelState): Vec2 {
  const { w, d } = view.scenario.table
  const dep = { x: me.tokens.deployX ?? me.pos.x, z: me.tokens.deployZ ?? me.pos.z }
  const r = baseRadius(me.base)
  const edge = [
    { edge: 'x-', g: dep.x + w / 2 }, { edge: 'x+', g: w / 2 - dep.x }, { edge: 'z-', g: dep.z + d / 2 }, { edge: 'z+', g: d / 2 - dep.z },
  ].sort((a, b) => a.g - b.g)[0]!.edge
  const cx = Math.max(-w / 2 + r, Math.min(w / 2 - r, me.pos.x)), cz = Math.max(-d / 2 + r, Math.min(d / 2 - r, me.pos.z))
  switch (edge) {
    case 'x-': return { x: -w / 2 + r, z: cz }
    case 'x+': return { x: w / 2 - r, z: cz }
    case 'z-': return { x: cx, z: -d / 2 + r }
    default: return { x: cx, z: d / 2 - r }
  }
}

function markerSubject(view: AiView, markers: MarkerState[]): ResolvedSubject {
  const ids: Id[] = [], points: Vec2[] = []
  for (const mk of markers) {
    const carrier = mk.carriedBy ? view.models[mk.carriedBy] : undefined
    if (carrier && isOnTable(carrier)) { ids.push(carrier.id); points.push({ ...carrier.pos }); continue }
    ids.push(mk.id); points.push({ ...mk.pos })
  }
  if (!ids.length) return NONE
  return { kind: markers.every((m) => !m.carriedBy) ? 'marker' : 'model', ids, points }
}

function modelSubject(models: ModelState[]): ResolvedSubject {
  const on = models.filter(isOnTable)
  return on.length ? { kind: 'model', ids: on.map((m) => m.id), points: on.map((m) => ({ ...m.pos })) } : NONE
}

/** Resolve a Subject string against the view (markers, model selectors, edges, routes, own deployment point). */
export function resolveSubject(view: AiView, bundle: EditionBundle, me: ModelState, settings: AiSettings): ResolvedSubject {
  void bundle
  const s = norm(settings.subject)
  if (!s || s === 'none') return NONE
  const markers = (view.markers ?? []).filter(live)
  const enemies = enemiesOfModel(view, me)
  if (s.endsWith('-edge') || s === 'edge') return { kind: 'edge', ids: [], points: [edgePoint(view, me)] }
  if (s === 'deployment-point' || s === 'initial-deployment-point') return deploymentPointOf(view, me)
  if (s === 'next-route-marker') {
    // A model with a route id (set at deployment) walks the markers of that route in step order; otherwise every route marker is one loop.
    const routeOf = (m: MarkerState): { id: number; step: number } | null => { const r = m.props['route'] as { id?: number; step?: number } | undefined; return r && typeof r.id === 'number' ? { id: r.id, step: r.step ?? 0 } : null }
    const mine = me.tokens.aiRouteId
    const all = markers.filter((m) => norm(m.face ?? '').startsWith('route') || routeOf(m) !== null)
    const route = (mine !== undefined ? all.filter((m) => routeOf(m)?.id === mine) : all)
      .sort((a, b) => (routeOf(a)?.step ?? 0) - (routeOf(b)?.step ?? 0) || a.id.localeCompare(b.id))
    if (!route.length) return NONE
    return markerSubject(view, [route[(me.tokens.aiRoute ?? 0) % route.length]!])
  }
  if (s.startsWith('nearest-investigation-marker') || s === 'investigation-marker') {
    return markerSubject(view, markers.filter((m) => m.kind === 'investigation' && !m.revealed))
  }
  if (s.startsWith('any-enemy') || s === 'nearest-enemy' || s === 'any-player' || s === 'player-model') return modelSubject(enemies)
  if (s === 'player-leader' || s === 'enemy-leader') return modelSubject(enemies.filter((m) => m.leaderId !== undefined))
  const byMarker = markers.filter((m) => norm(m.face ?? '') === s || m.id === s)
  if (byMarker.length) return markerSubject(view, byMarker)
  const looseMarker = markers.filter((m) => m.kind === 'object' && norm(m.face ?? '').includes(s))
  if (looseMarker.length) return markerSubject(view, looseMarker)
  const named = Object.values(view.models).filter((m) => isOnTable(m) && (m.id === settings.subject || norm(m.profileId) === s || norm(m.profileId).includes(s)))
  if (named.length) {
    if (settings.objective === 'defeat') return modelSubject(named.filter((m) => m.owner !== me.owner))
    if (settings.objective === 'protect') {
      const own = named.filter((m) => m.owner === me.owner)
      return modelSubject(own.length ? own : named)
    }
    return modelSubject(named)
  }
  return NONE
}

const USE_SKILLS: readonly string[] = ['search', 'lockpick', 'computers']

/** True when the model can carry out O at all (skill, Subject present, item not already held) (CH p13). */
export function canDoObjective(view: AiView, bundle: EditionBundle, me: ModelState, settings: AiSettings, subject: ResolvedSubject): boolean {
  if (settings.objective === 'none' || subject.kind === 'none') return false
  const markersOf = (view.markers ?? []).filter((m) => subject.ids.includes(m.id))
  switch (settings.objective) {
    case 'defeat':
      if (subject.kind === 'marker') return markersOf.some((m) => m.props['shootable'] === true || m.props['meleeable'] === true)
      return subject.ids.some((id) => view.models[id] && view.models[id]!.owner !== me.owner)
    case 'protect':
    case 'goTo':
      return subject.points.length > 0
    case 'use': {
      // An item an AI model already carries resolves to its carrier: nothing left to use (CH p13).
      if (!markersOf.length) return false
      const unit = recordOf(bundle, 'units', me.profileId)
      const has = (sk: string): boolean => !!unit?.skills.some((s) => s.skill === sk)
      // Carrying or flipping an object, or looking at an investigation marker, needs no skill (AIH s2 Use); a searchable
      // or a marker with a skill (lock, terminal) needs that very skill, Search by default (engine items.ts).
      return markersOf.some((m) => {
        const need = typeof m.props['skill'] === 'string' ? (m.props['skill'] as string) : m.kind === 'searchable' ? 'search' : null
        return need === null || (USE_SKILLS.includes(need) && has(need))
      })
    }
    default: return false
  }
}

/** The model's initial deployment point, the Fall Back Subject (CH p13). Needs the engine hook tokens/deployment. */
export function deploymentPointOf(_view: AiView, me: ModelState): ResolvedSubject {
  const x = me.tokens.deployX, z = me.tokens.deployZ
  if (x === undefined || z === undefined) return NONE
  return { kind: 'point', ids: [], points: [{ x, z }] }
}
