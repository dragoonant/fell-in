// Navigation grid for move planning (spec 30 s6). Geometry only: which table spots a base of a given radius can stand
// on (terrain the engine treats as impassable), a walking-distance field to a set of goals, and a path down that field.
// The engine still validates every path (ctx.accepts); this only proposes routes round walls and buildings.
import { baseOnTable } from '../engine/geometry'
import { circleOverlapsShape, terrainPieces } from '../engine/terrain'
import type { GameState, Vec2 } from '../engine/types'

/** Grid pitch in inches. */
export const NAV_STEP = 1
const SQRT2 = Math.SQRT2
/** Extra walking cost of a cell on an obstacle (must be climbed over and cleared; never a place to stop). */
const OBSTACLE_COST = 3

export interface NavGrid {
  nx: number; nz: number; x0: number; z0: number
  /** 0 free, 1 obstacle (passable, cannot stop), 2 blocked. */
  cell: Uint8Array
}

const gridCache = new WeakMap<object, Map<string, NavGrid>>()

/** The grid for a base radius on this table and terrain (cached per terrain array: terrain never moves). */
export function navGrid(q: Pick<GameState, 'terrain' | 'scenario'>, r: number): NavGrid {
  let byR = gridCache.get(q.terrain)
  if (!byR) gridCache.set(q.terrain, (byR = new Map()))
  const k = `${r.toFixed(3)}:${q.scenario.table.w}x${q.scenario.table.d}`
  const hit = byR.get(k)
  if (hit) return hit
  const { w, d } = q.scenario.table
  const nx = Math.floor(w / NAV_STEP) + 1, nz = Math.floor(d / NAV_STEP) + 1
  const x0 = -w / 2, z0 = -d / 2
  const cell = new Uint8Array(nx * nz)
  const pieces = terrainPieces(q).filter((p) => p.traits.move !== 'none')
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const p = { x: x0 + ix * NAV_STEP, z: z0 + iz * NAV_STEP }
      let v = baseOnTable(q, p, r) ? 0 : 2
      if (v === 0) {
        for (const pc of pieces) {
          if (!circleOverlapsShape(p, r + 0.05, pc.shape)) continue
          if (pc.traits.move === 'impassable') { v = 2; break }
          v = 1
        }
      }
      cell[iz * nx + ix] = v
    }
  }
  const g = { nx, nz, x0, z0, cell }
  byR.set(k, g)
  return g
}

/**
 * A copy of the grid with round blockers (other bases the mover may not walk through) marked blocked. Cells within
 * `keepR` of `keep` (the mover's own spot) keep their terrain value so a model touching a friend can still leave.
 */
export function withBlockers(g: NavGrid, blockers: readonly { at: Vec2; r: number }[], keep?: Vec2, keepR = 0): NavGrid {
  if (!blockers.length) return g
  const cell = g.cell.slice()
  for (const b of blockers) {
    const lo = { ix: Math.floor((b.at.x - b.r - g.x0) / NAV_STEP), iz: Math.floor((b.at.z - b.r - g.z0) / NAV_STEP) }
    const hi = { ix: Math.ceil((b.at.x + b.r - g.x0) / NAV_STEP), iz: Math.ceil((b.at.z + b.r - g.z0) / NAV_STEP) }
    for (let iz = Math.max(0, lo.iz); iz <= Math.min(g.nz - 1, hi.iz); iz++) {
      for (let ix = Math.max(0, lo.ix); ix <= Math.min(g.nx - 1, hi.ix); ix++) {
        const x = g.x0 + ix * NAV_STEP, z = g.z0 + iz * NAV_STEP
        if (Math.hypot(x - b.at.x, z - b.at.z) >= b.r) continue
        if (keep && Math.hypot(x - keep.x, z - keep.z) < keepR) continue
        cell[iz * g.nx + ix] = 2
      }
    }
  }
  return { ...g, cell }
}

const idxOf = (g: NavGrid, p: Vec2): number => {
  const ix = Math.max(0, Math.min(g.nx - 1, Math.round((p.x - g.x0) / NAV_STEP)))
  const iz = Math.max(0, Math.min(g.nz - 1, Math.round((p.z - g.z0) / NAV_STEP)))
  return iz * g.nx + ix
}
const ptOf = (g: NavGrid, i: number): Vec2 => ({ x: g.x0 + (i % g.nx) * NAV_STEP, z: g.z0 + Math.floor(i / g.nx) * NAV_STEP })

/** Walking distance (inches) from every cell to the nearest goal; Infinity where no route exists. */
export interface NavField { g: NavGrid; dist: Float64Array }

/** Dijkstra over the 8-connected grid from the goal points (each goal's own cell starts at 0 even if blocked). */
export function navField(g: NavGrid, goals: readonly Vec2[]): NavField {
  const n = g.nx * g.nz
  const dist = new Float64Array(n).fill(Infinity)
  const heap: number[] = [] // pairs packed as index; priorities in dist
  const push = (i: number) => {
    heap.push(i)
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (dist[heap[p]!]! <= dist[heap[c]!]!) break
      ;[heap[p], heap[c]] = [heap[c]!, heap[p]!]
      c = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let c = 0
      for (;;) {
        const l = 2 * c + 1, r = l + 1
        let m = c
        if (l < heap.length && dist[heap[l]!]! < dist[heap[m]!]!) m = l
        if (r < heap.length && dist[heap[r]!]! < dist[heap[m]!]!) m = r
        if (m === c) break
        ;[heap[m], heap[c]] = [heap[c]!, heap[m]!]
        c = m
      }
    }
    return top
  }
  for (const gp of goals) {
    const i = idxOf(g, gp)
    const d0 = Math.hypot(ptOf(g, i).x - gp.x, ptOf(g, i).z - gp.z)
    if (d0 < dist[i]!) { dist[i] = d0; push(i) }
  }
  const done = new Uint8Array(n)
  while (heap.length) {
    const i = pop()
    if (done[i]) continue
    done[i] = 1
    const ix = i % g.nx, iz = Math.floor(i / g.nx)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const jx = ix + dx, jz = iz + dz
        if (jx < 0 || jz < 0 || jx >= g.nx || jz >= g.nz) continue
        const j = jz * g.nx + jx
        const cj = g.cell[j]!
        if (cj === 2) continue
        // No corner cutting past a blocked cell.
        if (dx && dz && (g.cell[iz * g.nx + jx] === 2 || g.cell[jz * g.nx + ix] === 2)) continue
        const step = (dx && dz ? SQRT2 : 1) * NAV_STEP + (cj === 1 ? OBSTACLE_COST : 0)
        const nd = dist[i]! + step
        if (nd < dist[j]!) { dist[j] = nd; push(j) }
      }
    }
  }
  return { g, dist }
}

/** Walking distance from a point to the field's goals (its cell, or the best free neighbour, plus the offset). */
export function fieldAt(f: NavField, p: Vec2): number {
  const { g } = f
  const i = idxOf(g, p)
  const c = ptOf(g, i)
  let best = f.dist[i]! + Math.hypot(c.x - p.x, c.z - p.z)
  if (Number.isFinite(f.dist[i]!)) return best
  const ix = i % g.nx, iz = Math.floor(i / g.nx)
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const jx = ix + dx, jz = iz + dz
      if (jx < 0 || jz < 0 || jx >= g.nx || jz >= g.nz) continue
      const j = jz * g.nx + jx
      const q = ptOf(g, j)
      best = Math.min(best, f.dist[j]! + Math.hypot(q.x - p.x, q.z - p.z))
    }
  }
  return best
}

/**
 * True when a straight walk a -> b stays on free or obstacle cells (sampled every quarter inch). Samples within
 * `skipR` of `skipAt` are ignored (the target's own spot when checking a charge lane).
 */
export function clearLine(g: NavGrid, a: Vec2, b: Vec2, skipAt?: Vec2, skipR = 0): boolean {
  const l = Math.hypot(b.x - a.x, b.z - a.z)
  const n = Math.max(1, Math.ceil(l / 0.25))
  for (let k = 1; k <= n; k++) {
    const t = k / n
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    if (skipAt && Math.hypot(p.x - skipAt.x, p.z - skipAt.z) < skipR) continue
    if (g.cell[idxOf(g, p)] === 2) return false
  }
  return true
}

/**
 * The route down the field from `from`, at most `maxLen` inches long, as waypoints (string-pulled on the grid). The
 * last point never sits on an obstacle cell. Null when the field gives no progress.
 */
export function routeDown(f: NavField, from: Vec2, maxLen: number): Vec2[] | null {
  const { g } = f
  let i = idxOf(g, from)
  const chain: Vec2[] = [from]
  let len = 0, prev = from
  for (let guard = 0; guard < g.nx * g.nz; guard++) {
    const ix = i % g.nx, iz = Math.floor(i / g.nx)
    let next = -1, nd = f.dist[i]!
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const jx = ix + dx, jz = iz + dz
        if (jx < 0 || jz < 0 || jx >= g.nx || jz >= g.nz) continue
        const j = jz * g.nx + jx
        if (g.cell[j] === 2 || f.dist[j]! >= nd - 1e-9) continue
        // A model standing in a cell the grid marks blocked (a pocket beside a wall the engine lets it into) may step out diagonally.
        if (dx && dz && Number.isFinite(f.dist[i]!) && (g.cell[iz * g.nx + jx] === 2 || g.cell[jz * g.nx + ix] === 2)) continue
        nd = f.dist[j]!; next = j
      }
    }
    if (next < 0 || f.dist[next] === 0) break
    const p = ptOf(g, next)
    const step = Math.hypot(p.x - prev.x, p.z - prev.z)
    if (len + step > maxLen) {
      const t = (maxLen - len) / step
      if (t > 0.05) chain.push({ x: prev.x + (p.x - prev.x) * t, z: prev.z + (p.z - prev.z) * t })
      break
    }
    chain.push(p); len += step; prev = p; i = next
  }
  // Do not stop on an obstacle: drop trailing points until the end is on free ground.
  while (chain.length > 1 && g.cell[idxOf(g, chain[chain.length - 1]!)] === 1) chain.pop()
  if (chain.length < 2) return null
  // String pull: keep only the corners needed for clear straight legs.
  const out: Vec2[] = []
  let anchor = chain[0]!, k = 1
  while (k < chain.length) {
    let far = k
    for (let m = chain.length - 1; m > k; m--) if (clearLine(g, anchor, chain[m]!)) { far = m; break }
    out.push(chain[far]!)
    anchor = chain[far]!
    k = far + 1
  }
  return out
}

/** Length of a path from `from` through the waypoints. */
export const pathLength = (from: Vec2, path: readonly Vec2[]): number => {
  let l = 0, p = from
  for (const q of path) { l += Math.hypot(q.x - p.x, q.z - p.z); p = q }
  return l
}

/** The path cut to a fraction of its length (bisection helper). */
export function truncatePath(from: Vec2, path: readonly Vec2[], frac: number): Vec2[] {
  const total = pathLength(from, path)
  let want = total * frac, p = from
  const out: Vec2[] = []
  for (const q of path) {
    const l = Math.hypot(q.x - p.x, q.z - p.z)
    if (l >= want) {
      if (want > 1e-6) out.push({ x: p.x + ((q.x - p.x) * want) / l, z: p.z + ((q.z - p.z) * want) / l })
      return out
    }
    out.push(q); want -= l; p = q
  }
  return out
}
