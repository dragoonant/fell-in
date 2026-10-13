// Objective status for the HUD (owner feedback: players could not tell what to do). Pure, reads the PlayerView only, and
// uses the same facts the scenario evaluators in ../scenario.ts score from (marker props, exited ids, model life), so a
// shown number is the number the victory check reads. Scenario names live here because the view carries no data bundle.
import { baseRadius, dist } from '../geometry'
import type { MarkerState, ModelState, PlayerView } from '../types'

export interface ObjectiveLine { id: string; text: string; side?: string; value?: number; max?: number; done?: boolean }
export interface ObjectiveStatus {
  scenarioId: string; name: string; round: number
  /** Round limit; 0 when the scenario runs until someone wins. */
  rounds: number
  lines: ObjectiveLine[]
  markers: { id: string; label: string; x: number; z: number }[]
}

const NAMES: Record<string, string> = {
  'ga-1': 'Navigating the Wastes', 'ga-2': 'Shooting Range', 'ga-3': 'Weird Harvest', 'ga-4': 'Solving the Rat Problem',
  'box-1': 'Ad Victoriam', 'box-2': "Big John's Salvage Showdown", 'box-3': 'Quest for Knowledge', 'box-4': 'Radio Tower Takeover', 'box-5': "Flip's Revenge",
  'ai-rr': 'The Red Rocket Misunderstanding', 'ai-missile': 'The Missile', 'ai-breakin': 'The Break-in', 'ai-tech': 'The Escaped Tech',
  'coop-sewer': 'Into the Sewer', 'coop-cage': 'Blood Cage', 'coop-munitions': 'Dangerous Munitions',
}
/** Short table labels by marker face (hidden faces are not in the view, so they fall back to a generic label). */
const LABELS: Record<string, string> = {
  crate: 'Crate', can: 'Can', plant: 'Plant', mound: 'Rat mound', 'power-armor': 'Power armor', nuke: 'Nuke', book: 'Book', tower: 'Radio tower',
  captive: 'Sarah', 'red-rocket': 'Red Rocket', 'missile-sled': 'Missile sled', valve: 'Valve', tech: 'The Tech', hatch: 'Sewer hatch',
  'hole-1': 'Chain anchor', 'hole-2': 'Chain anchor', chain: 'Chain', item: 'Loot', munitions: 'Munitions', 'exit-near-ai': 'Exit', 'exit-near-players': 'Exit',
  'key-1': 'Key', 'key-2': 'Key', 'protocol-box': 'Protocol box',
}
/** Labels for marker kinds whose face is hidden in the view, per scenario. */
const HIDDEN_LABELS: Record<string, Record<string, string>> = {
  'box-1': { searchable: 'Power armor' },
  'coop-sewer': { investigation: 'Emergency box' },
}
/** Terrain pieces worth a table label, by scenario then terrain id. */
const TERRAIN_LABELS: Record<string, Record<string, string>> = { 'ai-rr': { diner: 'Diner' } }
const AI_SEAT = 'ai'
const TOUCH_IN = 0.5

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const alive = (m: ModelState): boolean => m.life !== 'dead'
const onTable = (m: ModelState): boolean => alive(m) && !m.offTable
const gone = (mk: MarkerState): boolean => mk.props.offTable === true || mk.props.destroyed === true
const exitedOf = (v: PlayerView): string[] => ((v.scenario as unknown as { exited?: string[] }).exited ?? [])
const techIdOf = (v: PlayerView): string | undefined => (v.scenario as unknown as { tech?: { techId?: string } }).tech?.techId

export function objectiveStatus(view: PlayerView): ObjectiveStatus | null {
  const id = view.scenarioId
  if (!id) return null
  const markers = view.markers ?? []
  const models = Object.values(view.models)
  const byFace = (f: string): MarkerState[] => markers.filter((m) => m.face === f)
  const lines: ObjectiveLine[] = []
  const line = (l: ObjectiveLine): void => { lines.push(l) }
  const ai = id.startsWith('ai-') || id.startsWith('coop-')
  const mine = (m: ModelState): boolean => (ai ? m.owner !== AI_SEAT : m.owner === view.seat)
  const standing = (pred: (m: ModelState) => boolean): number => models.filter((m) => onTable(m) && !m.inert && pred(m)).length
  const heldBy = (mk: MarkerState): ModelState | undefined => (mk.carriedBy ? view.models[mk.carriedBy] : undefined)
  const markerOffTable = (mk: MarkerState): boolean => gone(mk) || (heldBy(mk) ? !!heldBy(mk)!.offTable : false)
  const exited = exitedOf(view)

  const modelCounts = (): void => {
    line({ id: 'yours', text: 'Your models standing', value: standing(mine), side: 'you' })
    line({ id: 'enemy', text: ai ? 'Enemy models standing' : 'Opposing models standing', value: standing((m) => !mine(m)), side: 'enemy' })
  }
  const healthLine = (face: string, text: string, fallbackMax: number): void => {
    const mk = byFace(face)[0]
    if (!mk) return
    const hp = num(mk.props.health) ?? 0
    line({ id: `${face}-health`, text, value: mk.props.destroyed === true ? 0 : hp, max: fallbackMax, done: mk.props.destroyed === true })
  }

  switch (id) {
    case 'ga-1': {
      line({ id: 'crate', text: 'Reach the crate, then the exit', done: byFace('crate').some((c) => c.revealed || c.props.done === true) })
      break
    }
    case 'ga-2': case 'ga-3': case 'ga-4': {
      const flag = id === 'ga-4' ? 'damaged' : 'hit'
      const targets = markers.filter((m) => m.kind === 'investigation')
      const done = targets.filter((m) => (num(m.props[flag]) ?? 0) > 0).length
      line({ id: 'targets', text: id === 'ga-2' ? 'Cans hit' : id === 'ga-3' ? 'Plants hit' : 'Mounds damaged', value: done, max: targets.length, done: targets.length > 0 && done === targets.length })
      break
    }
    case 'box-1': {
      modelCounts()
      line({ id: 'suits', text: 'Power armor suits on the table', value: markers.filter((m) => m.kind === 'searchable' && !markerOffTable(m)).length, max: 3 })
      break
    }
    case 'box-2': {
      const nuke = byFace('nuke')[0]
      const carrier = nuke ? heldBy(nuke) : undefined
      const text = !nuke || markerOffTable(nuke) ? 'Nuke has left the table' : carrier ? (mine(carrier) ? 'You are carrying the nuke' : 'The enemy is carrying the nuke') : 'Nuke is lying loose'
      line({ id: 'nuke', text, done: !!carrier && mine(carrier) })
      line({ id: 'hold', text: 'Defenders must hold it until round 9', value: view.round ?? 0, max: 9 })
      break
    }
    case 'box-3': {
      const out = byFace('book').filter(markerOffTable).length
      line({ id: 'books', text: 'Books off the table', value: out, max: 3, done: out >= 3 })
      break
    }
    case 'box-4': {
      const tower = byFace('tower')[0]
      if (tower) {
        const near = (pred: (m: ModelState) => boolean): number => standing((m) => pred(m) && dist(m.pos, tower.pos) - baseRadius(m.base) <= TOUCH_IN)
        line({ id: 'tower-you', text: 'Your models at the tower', value: near(mine), side: 'you' })
        line({ id: 'tower-enemy', text: 'Enemy models at the tower', value: near((m) => !mine(m)), side: 'enemy' })
      }
      break
    }
    case 'box-5': {
      const sarah = byFace('captive')[0]
      line({ id: 'captive', text: sarah && markerOffTable(sarah) ? 'Sarah has left the table' : 'Sarah is still held', done: !!sarah && markerOffTable(sarah) })
      modelCounts()
      break
    }
    case 'ai-rr': {
      healthLine('red-rocket', 'Red Rocket Health', 10)
      line({ id: 'rocket-need', text: 'Rocket must keep this much Health after round 4', value: 4 })
      break
    }
    case 'ai-missile': healthLine('missile-sled', 'Missile sled Health', 5); break
    case 'ai-breakin': {
      const valve = byFace('valve')[0]
      const players = models.filter((m) => m.owner !== AI_SEAT && alive(m))
      const out = players.filter((m) => exited.includes(m.id)).length
      line({ id: 'valve', text: 'Valve running', done: valve?.props.done === true })
      line({ id: 'escaped', text: 'Team members escaped (half needed)', value: out, max: players.length, done: players.length > 0 && out * 2 >= players.length })
      break
    }
    case 'ai-tech': {
      const tid = techIdOf(view)
      const tech = tid ? view.models[tid] : undefined
      line({ id: 'tech-found', text: 'The Tech found', done: !!tech })
      if (tech) {
        line({ id: 'tech-health', text: 'Tech alive', done: alive(tech) && !exited.includes(tech.id) })
        line({ id: 'tech-escaped', text: 'Tech escaped', done: exited.includes(tech.id) })
      }
      line({ id: 'ai-left', text: 'Wasteland AI models left', value: standing((m) => m.owner === AI_SEAT), side: 'enemy' })
      break
    }
    case 'coop-sewer': {
      const hatch = markers.find((m) => m.props.hatch === true)
      const out = models.filter((m) => m.owner !== AI_SEAT && exited.includes(m.id))
      line({ id: 'locks', text: 'Hatch locks left', value: num(hatch?.props.locks) ?? 0, max: 2, done: hatch?.props.open === true })
      line({ id: 'escaped', text: 'Escaped through the sewer', value: out.length, max: 3, done: out.length >= 3 })
      line({ id: 'survivor', text: 'Sole Survivor escaped', done: out.some((m) => m.profileId === 'sole-survivor') })
      break
    }
    case 'coop-cage': {
      healthLine('chain', 'Chain Health', 2)
      line({ id: 'loot', text: 'Loot markers left', value: byFace('item').filter((m) => !gone(m) && m.props.taken !== true && !m.revealed).length, max: 12 })
      line({ id: 'ai-left', text: 'Wasteland AI models left', value: standing((m) => m.owner === AI_SEAT), side: 'enemy' })
      break
    }
    case 'coop-munitions': {
      line({ id: 'ai-left', text: 'Wasteland AI models left', value: standing((m) => m.owner === AI_SEAT), side: 'enemy' })
      line({ id: 'players-left', text: 'Your models standing', value: standing(mine), side: 'you' })
      break
    }
    default: modelCounts()
  }

  const hidden = HIDDEN_LABELS[id]
  const out: ObjectiveStatus['markers'] = []
  for (const mk of markers) {
    if (gone(mk) || mk.props.route !== undefined || mk.face === 'blank') continue
    const carrier = heldBy(mk)
    const p = carrier ? carrier.pos : mk.pos
    const label = (mk.face && LABELS[mk.face]) || (mk.props.hatch === true ? 'Sewer hatch' : undefined) || hidden?.[mk.kind]
      || (mk.kind === 'object' ? 'Object' : mk.kind === 'searchable' ? 'Search marker' : 'Unknown marker')
    out.push({ id: mk.id, label, x: p.x, z: p.z })
  }
  for (const t of view.terrain ?? []) {
    const label = TERRAIN_LABELS[id]?.[t.id]
    if (label) out.push({ id: t.id, label, x: t.pos.x, z: t.pos.z })
  }
  return { scenarioId: id, name: NAMES[id] ?? id, round: view.round ?? 0, rounds: view.maxRounds ?? 0, lines, markers: out }
}
