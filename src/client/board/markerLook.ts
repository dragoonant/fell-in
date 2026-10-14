// Pure helpers for how scenario markers are drawn on the table (no three, no React).
import type { MarkerState } from '../../engine/types'
import type { ObjectEntry, Manifest } from '../figures/glbModels'

/** Marker faces whose manifest "objects" key differs from the face the scenario data uses. */
export const OBJECT_ALIASES: Record<string, string> = { 'power-armor-suit': 'power-armor', 'mini-nuke': 'nuke', 'radio-tower': 'tower' }

/** The GLB entry for a marker face: the face itself, its alias, or undefined (procedural). */
export function objectEntryFor(m: Pick<Manifest, 'objects'>, face: string | undefined): ObjectEntry | undefined {
  if (!face) return undefined
  return m.objects[face] ?? (OBJECT_ALIASES[face] ? m.objects[OBJECT_ALIASES[face]!] : undefined)
}

const flag = (mk: Pick<MarkerState, 'props'>, k: string): boolean => mk.props[k] === true

/** Markers that are gone from the table: destroyed (cans hit), off the table, freed (captive) or claimed (suit worn). */
export function markerHidden(mk: Pick<MarkerState, 'props'>): boolean {
  return flag(mk, 'destroyed') || flag(mk, 'offTable') || flag(mk, 'freed') || flag(mk, 'claimed')
}

/** A patrol route waypoint: a small numbered flag, not a token. */
export const isRouteFlag = (mk: Pick<MarkerState, 'props'>): boolean => mk.props.route !== undefined && mk.props.route !== null

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

/** Long rectangle of a marker (Red Rocket on its side, the missile sled): size in inches and yaw about +y (radians, three's sign). */
export function markerRect(mk: Pick<MarkerState, 'props'>): { length: number; width: number; yaw: number } | null {
  const length = num(mk.props.lengthIn), width = num(mk.props.widthIn)
  if (length === undefined || width === undefined) return null
  // The engine turns the long axis from +x towards +z; three's rotation.y turns +x towards -z, so the sign flips.
  return { length, width, yaw: -(Number(mk.props.rotDeg ?? 0) * Math.PI) / 180 }
}

/** The label a route flag shows (its step number, or the marker face when that is short). */
export function routeLabel(mk: Pick<MarkerState, 'face' | 'props'>): string {
  const r = mk.props.route as { id?: number; step?: number } | undefined
  return mk.face && mk.face.length <= 3 ? mk.face : String(r?.step ?? '')
}
