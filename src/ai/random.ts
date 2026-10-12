// The random tier and the decider's fallback (spec 30 s2, s8). Same behaviour as the M3 placeholder bot
// (src/client/bot/randomBot.ts), made synchronous and keyed by the AI context: seeded pick over legal answers that
// favours attacks and moving, skips turn-wasting options when it has a choice, and fills move paths by bisection.
import type { Action, Vec2 } from '../engine/types'
import type { AiContext } from './types'
import { dist } from './world'

/** Option types whose template needs a parameter added by the decider. */
export const PARAMETERISED: ReadonlySet<string> = new Set(['move.to'])
const ATTACK_OPENER = /^(shoot|throw|melee|charge)\./
const isAttack = (a: Action): boolean => ATTACK_OPENER.test(a.type) && !a.type.endsWith('.cancel')
const PASSIVE: ReadonlySet<string> = new Set(['turn.useNone', 'turn.end', 'move.cancel'])
/** Bearings tried, in degrees off the line to the goal. */
const FAN = [0, 20, -20, 40, -40, 60, -60, 90, -90, 135, -135]

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
/** Next draw from the decision's seeded stream (the tag documents the call site only). */
const roll = (ctx: AiContext, _tag: string): number => ctx.rng()

/** Nearest standing enemy of the moving model, else the table centre. */
function goalFor(ctx: AiContext, modelId: string): Vec2 {
  const me = ctx.view.models[modelId]!
  let best: Vec2 = { x: 0, z: 0 }, bestD = Infinity
  for (const m of Object.values(ctx.view.models)) {
    if (m.owner === me.owner || m.life !== 'active' || m.offTable) continue
    const d = dist(me.pos, m.pos)
    if (d < bestD) { bestD = d; best = m.pos }
  }
  return best
}

/** Farthest accepted point on the segment from -> to (bisection on ctx.accepts), or null when none moves at all. */
export function farthestAccepted(ctx: AiContext, template: Action, from: Vec2, to: Vec2, steps = 8): Vec2 | null {
  const ok = (p: Vec2) => ctx.accepts({ ...template, path: [p] })
  let lo = 0, hi = 1
  if (ok(to)) lo = 1
  else for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2; if (ok(lerp(from, to, mid))) lo = mid; else hi = mid }
  return lo === 0 ? null : lerp(from, to, lo)
}

/** A single-leg path towards the goal using as much of the allowance as is accepted (the M3 bot method). */
export function randomMovePath(ctx: AiContext, template: Action, goal?: Vec2): Vec2[] | null {
  const c = ctx.pending.context as { modelId?: string; inches?: number; baseInches?: number }
  const m = c.modelId ? ctx.view.models[c.modelId] : undefined
  const reach = (c.inches ?? 0) + (c.baseInches ?? 0)
  if (!m || reach <= 0) return null
  const g = goal ?? goalFor(ctx, m.id)
  const want = Math.min(reach, dist(m.pos, g))
  if (want < 0.25) return null
  const heading = Math.atan2(g.z - m.pos.z, g.x - m.pos.x) + (roll(ctx, 'path') - 0.5) * (Math.PI / 9)
  let best: Vec2 | null = null, bestGain = 0
  for (const deg of FAN) {
    const ang = heading + (deg * Math.PI) / 180
    const end = farthestAccepted(ctx, template, m.pos, { x: m.pos.x + Math.cos(ang) * want, z: m.pos.z + Math.sin(ang) * want })
    if (!end) continue
    const gain = dist(m.pos, g) - dist(end, g) + dist(m.pos, end) * 0.01
    if (gain > bestGain || best === null) { best = end; bestGain = gain }
    if (gain >= want * 0.6) break
  }
  return best ? [best] : null
}

/** Fill a parameterised pick; falls back to another legal option when no path validates. */
export function completeRandom(ctx: AiContext, pick: Action, pool: readonly Action[] = ctx.legal): Action {
  if (!PARAMETERISED.has(pick.type)) return pick
  const path = randomMovePath(ctx, pick)
  if (path) {
    const a = { ...pick, path }
    if (ctx.accepts(a)) return a
  }
  const m = (ctx.pending.context as { modelId?: string }).modelId
  const mm = m ? ctx.view.models[m] : undefined
  if (mm) ctx.memory.stuck.add(`${mm.id}:${mm.pos.x.toFixed(2)},${mm.pos.z.toFixed(2)}`)
  return pool.find((x) => !PARAMETERISED.has(x.type)) ?? ctx.legal.find((x) => !PARAMETERISED.has(x.type)) ?? pick
}

/** The random policy: never null, always a legal answer (parameters filled). */
export function randomPolicy(ctx: AiContext): Action {
  const { legal } = ctx
  const attacks = legal.filter(isAttack)
  if (attacks.length) {
    const f = roll(ctx, 'attack')
    if (f < 0.8) return completeRandom(ctx, attacks[Math.floor((f / 0.8) * attacks.length)]!)
  }
  if (ctx.pending.kind === 'move.path') {
    const to = legal.find((a) => a.type === 'move.to')
    if (to) return completeRandom(ctx, to)
  }
  const mid = (ctx.pending.context as { modelId?: string }).modelId
  const m = mid ? ctx.view.models[mid] : undefined
  let pool = legal.filter((a) => !PASSIVE.has(a.type))
  if (m && ctx.memory.stuck.has(`${m.id}:${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)}`)) pool = pool.filter((a) => a.type !== 'move.go')
  if (!pool.length) pool = legal
  const move = pool.find((a) => a.type === 'move.go')
  if (move && roll(ctx, 'move') < 0.85) return move
  return completeRandom(ctx, pool[Math.floor(roll(ctx, 'pick') * pool.length)]!, pool)
}
