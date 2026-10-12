// Pure board helpers (no three, no React): camera poses, deployment-zone rectangles. Display only; no rules numbers.
import type { Vec2 } from '../../engine/types'

export type CameraPresetId = 'overview' | 'near' | 'far' | 'top'
export interface Pose { pos: [number, number, number]; target: [number, number, number] }

export const CAMERA_TRANSITION_MS = 500
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Camera pose for a preset on a w x d table. The human seat is the near edge (+z). */
export function cameraPose(preset: CameraPresetId, table: { w: number; d: number }): Pose {
  const k = Math.max(table.w, table.d) / 36
  switch (preset) {
    case 'near': return { pos: [0, 14 * k, 30 * k], target: [0, 0, 6 * k] }
    case 'far': return { pos: [0, 18 * k, -30 * k], target: [0, 0, -4 * k] }
    case 'top': return { pos: [0, 62 * k, 0.01], target: [0, 0, 0] }
    default: return { pos: [0, 30 * k, 38 * k], target: [0, 0, 2 * k] }
  }
}

export interface ZoneRect { seatIndex: number; x0: number; x1: number; z0: number; z1: number }

/**
 * Deployment strips drawn on the mat. Only `{ within: <ruler colour>, of: 'own edge' }` (or no `of`) has a fixed shape:
 * seat 0 owns the near edge (+z), seat 1 the far edge (-z). Every other deploy record has no strip to draw.
 */
export function deployZones(table: { w: number; d: number }, deploys: unknown[], inchesOf: (colour: string) => number): ZoneRect[] {
  const out: ZoneRect[] = []
  deploys.slice(0, 2).forEach((dep, i) => {
    const r = dep as { within?: unknown; of?: unknown } | null
    if (!r || typeof r.within !== 'string') return
    if (r.of !== undefined && r.of !== 'own edge') return
    const depth = inchesOf(r.within)
    if (!Number.isFinite(depth) || depth <= 0) return
    const hw = table.w / 2, hd = table.d / 2
    out.push(i === 0 ? { seatIndex: 0, x0: -hw, x1: hw, z0: hd - depth, z1: hd } : { seatIndex: 1, x0: -hw, x1: hw, z0: -hd, z1: -hd + depth })
  })
  return out
}

export type Tooltip = { x: number; y: number }
export const clampTooltipLeft = (x: number, viewportW: number, width = 260): number => Math.max(8, Math.min(x + 16, viewportW - width - 12))

export type { Vec2 }
