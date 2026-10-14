// Pure: turn a scenario deploy zone (docs/spec/17-scenarios.md s4.1) into flat polygons to draw on the mat.
// Mirrors the engine's zone geometry (spec.ts inZone/zoneBounds) but only for display; no rules numbers are decided here.
import type { EditionBundle } from '../../data/types'
import { cornerPoint, inchesOf, pointOf, type Corner, type Edge, type Frame, type Lookup, type ZoneSpec } from '../../engine/scenarios/spec'
import { distToShape, type WorldShape } from '../../engine/terrain'
import type { Vec2 } from '../../engine/types'

export interface ZonePoly {
  /** Outline points on the mat (x, z in inches). */
  pts: Vec2[]
  /** Filled area (false: a ring is only an outline, it is a band at a fixed distance from a piece). */
  fill: boolean
}

const clampTo = (f: Frame, p: Vec2): Vec2 => ({ x: Math.max(-f.w / 2, Math.min(f.w / 2, p.x)), z: Math.max(-f.d / 2, Math.min(f.d / 2, p.z)) })
const rect = (x0: number, x1: number, z0: number, z1: number): Vec2[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
const arc = (c: Vec2, r: number, a0: number, a1: number, n: number): Vec2[] => Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + Math.cos(a0 + ((a1 - a0) * i) / n) * r, z: c.z + Math.sin(a0 + ((a1 - a0) * i) / n) * r }))
const west = (c: Corner): boolean => c[1] === 'w'
const north = (c: Corner): boolean => c[0] === 'n'

/** Polygons for one zone. Unknown or unresolvable zones give []. `except` areas are not cut out (drawn as a plain overlay). */
export function zonePolys(bundle: EditionBundle, f: Frame, z: ZoneSpec, lookup: Lookup, shapeOf: (id: string) => WorldShape | null): ZonePoly[] {
  const fill = (pts: Vec2[]): ZonePoly => ({ pts: pts.map((p) => clampTo(f, p)), fill: true })
  switch (z.kind) {
    case 'box': {
      const c = cornerPoint(f, z.corner!), w = inchesOf(bundle, z.w), d = inchesOf(bundle, z.d ?? z.w)
      const x = c.x + (west(z.corner!) ? w : -w), zz = c.z + (north(z.corner!) ? d : -d)
      return [fill(rect(Math.min(c.x, x), Math.max(c.x, x), Math.min(c.z, zz), Math.max(c.z, zz)))]
    }
    case 'triangle': {
      const c = cornerPoint(f, z.corner!), w = inchesOf(bundle, z.w), d = inchesOf(bundle, z.d ?? z.w)
      return [fill([c, { x: c.x + (west(z.corner!) ? w : -w), z: c.z }, { x: c.x, z: c.z + (north(z.corner!) ? d : -d) }])]
    }
    case 'corner': {
      const c = cornerPoint(f, z.corner!), r = inchesOf(bundle, z.reach)
      const a0 = Math.atan2(north(z.corner!) ? 1 : -1, west(z.corner!) ? 1 : -1) - Math.PI / 4
      return [fill([c, ...arc(c, r, a0, a0 + Math.PI / 2, 20)])]
    }
    case 'disc': {
      const c = z.centre ? pointOf(bundle, f, z.centre, lookup) : (z.of ? lookup(z.of) : null) ?? { x: 0, z: 0 }
      return [fill(arc(c, inchesOf(bundle, z.within ?? z.reach), 0, Math.PI * 2, 40))]
    }
    case 'edges': {
      const k = inchesOf(bundle, z.within)
      const es: Edge[] = z.edges === 'any' || !z.edges ? ['n', 's', 'e', 'w'] : z.edges
      const hw = f.w / 2, hd = f.d / 2
      return es.map((e) => fill(e === 'n' ? rect(-hw, hw, -hd, -hd + k) : e === 's' ? rect(-hw, hw, hd - k, hd) : e === 'w' ? rect(-hw, -hw + k, -hd, hd) : rect(hw - k, hw, -hd, hd)))
    }
    case 'ring': {
      const sh = z.of ? shapeOf(z.of) : null
      if (!sh) return []
      const c = sh.kind === 'circle' ? sh.c : { x: sh.pts.reduce((a, p) => a + p.x, 0) / sh.pts.length, z: sh.pts.reduce((a, p) => a + p.z, 0) / sh.pts.length }
      const gap = inchesOf(bundle, z.gap)
      const pts: Vec2[] = []
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2
        let lo = 0, hi = 60
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2
          if (distToShape({ x: c.x + Math.cos(a) * mid, z: c.z + Math.sin(a) * mid }, sh) < gap) lo = mid; else hi = mid
        }
        pts.push({ x: c.x + Math.cos(a) * hi, z: c.z + Math.sin(a) * hi })
      }
      return [{ pts, fill: false }]
    }
    default: return [] // 'table' (anywhere) has nothing to draw
  }
}
