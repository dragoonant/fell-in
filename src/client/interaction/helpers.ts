// Pure view helpers for the interaction layer (owner I): which models a decision lets the player click, how a drag
// point is pulled back to the farthest point the engine accepts, and the ruler readout text. No store, no React, and no
// rules numbers: legality always comes from the engine (a preview callback), ruler data from the edition.
import type { Action, DecisionOption, ModelId, PendingDecision, Vec2 } from '../../engine/types'

/** Action types that carry a free `path` answer (drag or click on the table). */
export const PATH_TYPES: ReadonlySet<string> = new Set(['move.to', 'melee.slide'])

/** Pixels a press may travel and still count as a click (more is an orbit or a drag). */
export const CLICK_PX = 5

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)

/** The option that takes a free path answer, or null. */
export function pathOption(p: PendingDecision | null): DecisionOption | null {
  return p?.options.find((o) => PATH_TYPES.has(o.action.type)) ?? null
}

/** The model a path answer moves. */
export function pathModelId(p: PendingDecision | null, o: DecisionOption | null): ModelId | null {
  const id = o?.action.modelId ?? p?.context.modelId
  return typeof id === 'string' ? id : null
}

export interface Pickable {
  /** 'select' answers a ready/pick prompt; 'target' aims an attack or charge. */
  role: 'select' | 'target'
  /** Submit on one click. Menu entries (charge, melee) first show a confirm chooser. */
  immediate: boolean
  options: DecisionOption[]
}

const SELECT_TYPES = new Set(['turn.ready', 'turn.pick'])
const isTargetType = (t: string): boolean => t.endsWith('.target') || t === 'charge.go' || t === 'melee.attack'

/** Models the open decision lets the player click, with the options each click answers. */
export function pickables(p: PendingDecision | null): Map<ModelId, Pickable> {
  const out = new Map<ModelId, Pickable>()
  if (!p) return out
  for (const o of p.options) {
    const t = o.action.type
    let id: unknown, role: Pickable['role'] | null = null
    if (SELECT_TYPES.has(t)) { id = o.action.modelId; role = 'select' } else if (isTargetType(t)) { id = o.action.targetId; role = 'target' }
    if (!role || typeof id !== 'string') continue
    const cur = out.get(id)
    if (cur) cur.options.push(o)
    else out.set(id, { role, immediate: role === 'select' || t.endsWith('.target'), options: [o] })
  }
  return out
}

/**
 * Pull `to` back to the farthest point on the line from `from` that `ok` accepts (bisection). ok is the engine's own
 * dry run; the result is `to` itself when that is accepted, `from` when nothing along the line is.
 */
export function clampAlong(from: Vec2, to: Vec2, ok: (p: Vec2) => boolean, iterations = 9): { pos: Vec2; full: boolean; moved: boolean } {
  if (ok(to)) return { pos: to, full: true, moved: dist(from, to) > 1e-9 }
  let lo = 0, hi = 1
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    if (ok(lerp(from, to, mid))) lo = mid
    else hi = mid
  }
  return { pos: lo > 0 ? lerp(from, to, lo) : from, full: false, moved: lo > 0 }
}

export interface RulerReadout { travel: number; colourNeeded: string | null; limitColour: string | null; limitInches: number | null; ok: boolean }

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const inch = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

/** One line for the drag readout: travel against the ruler the decision grants (names come from the edition). */
export function readoutText(r: RulerReadout): string {
  const need = r.colourNeeded ? `${cap(r.colourNeeded)} ruler` : 'beyond every ruler'
  const lim = r.limitColour && r.limitInches != null ? ` of ${cap(r.limitColour)} (${inch(r.limitInches)} in)` : ''
  return `${inch(r.travel)} in: ${need}${lim}${r.ok ? '' : ' | blocked'}`
}

/** Table point where a camera ray meets y = 0, or null when it points level or away. */
export function rayToTable(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): Vec2 | null {
  if (dir.y >= -1e-6) return null
  const t = -origin.y / dir.y
  return t > 0 ? { x: origin.x + dir.x * t, z: origin.z + dir.z * t } : null
}

/** Clicks and keys must never answer from the wrong place: true when a key event comes from a text field. */
export const typingTarget = (t: { tagName?: string; isContentEditable?: boolean } | null): boolean =>
  !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.isContentEditable)

/** The option whose action is a cancel (move.cancel), for Esc. */
export function cancelOption(p: PendingDecision | null): Action | null {
  const o = p?.options.find((x) => x.id === 'cancel' || x.action.type.endsWith('.cancel'))
  return o ? o.action : null
}
