// Default bot brain: the engine's seeded random decider over legal options, plus parameter filling for option templates
// that need one (move.to takes a path). Candidates are checked with gameStore.preview (a dry-run apply); the bot never
// computes a rules number itself. M4 replaces this with the AI through setBotBrain().
import { createRandomDecider } from '../../engine/decider'
import { deriveSeed, nextFloat } from '../../engine/rng'
import type { Action, PendingDecision, PlayerView, Vec2 } from '../../engine/types'

export interface BotContext {
  seed: string
  /** Dry-run an action: true when the engine would accept it. */
  accepts(action: Action): boolean
  /** Time budget for this decision (VITE_AI_MS). */
  budgetMs: number
}
/** A bot brain answers one decision from the seat's view. */
export type BotBrain = (view: PlayerView, pending: PendingDecision, legal: Action[], ctx: BotContext) => Promise<Action> | Action

/** Option types whose template needs a parameter added by the decider. */
export const PARAMETERISED: ReadonlySet<string> = new Set(['move.to'])

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })

/** Where a bot model heads: the nearest standing enemy, else the table centre. */
function goalFor(view: PlayerView, modelId: string): Vec2 {
  const me = view.models[modelId]!
  let best: Vec2 = { x: 0, z: 0 }, bestD = Infinity
  for (const m of Object.values(view.models)) {
    if (m.owner === me.owner || m.life !== 'active') continue
    const d = dist(me.pos, m.pos)
    if (d < bestD) { bestD = d; best = m.pos }
  }
  return best
}

/** Bearings tried, in degrees off the line to the goal: straight first, then fanning out round obstacles. */
const FAN = [0, 20, -20, 40, -40, 60, -60, 90, -90, 135, -135]

/**
 * A single-leg move towards the goal using as much of the allowance (pending.context) as the engine accepts. Each
 * bearing is pulled back to its farthest accepted point (bisection on ctx.accepts), so buildings and friendly bases
 * shorten a move instead of vetoing it. Null when no bearing gets the model anywhere.
 */
function movePath(view: PlayerView, pending: PendingDecision, template: Action, ctx: BotContext): Vec2[] | null {
  const c = pending.context as { modelId?: string; inches?: number; baseInches?: number }
  const m = c.modelId ? view.models[c.modelId] : undefined
  const reach = (c.inches ?? 0) + (c.baseInches ?? 0)
  if (!m || reach <= 0) return null
  const goal = goalFor(view, m.id)
  const want = Math.min(reach, dist(m.pos, goal))
  if (want < 0.25) return null
  const [jitter] = nextFloat(deriveSeed(ctx.seed, `${pending.id}:path`))
  const heading = Math.atan2(goal.z - m.pos.z, goal.x - m.pos.x) + (jitter - 0.5) * (Math.PI / 9)
  const ok = (p: Vec2) => ctx.accepts({ ...template, path: [p] })
  let best: Vec2 | null = null, bestGain = 0
  for (const deg of FAN) {
    const ang = heading + (deg * Math.PI) / 180
    const to = { x: m.pos.x + Math.cos(ang) * want, z: m.pos.z + Math.sin(ang) * want }
    let lo = 0, hi = 1
    if (ok(to)) lo = 1
    else for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (ok(lerp(m.pos, to, mid))) lo = mid; else hi = mid }
    if (lo === 0) continue
    const end = lerp(m.pos, to, lo)
    // Prefer closing on the goal; a sideways step still beats standing still.
    const gain = dist(m.pos, goal) - dist(end, goal) + lo * want * 0.01
    if (gain > bestGain || best === null) { best = end; bestGain = gain }
    if (gain >= want * 0.6) break
  }
  return best ? [best] : null
}

/** Fill a parameterised template; falls back to another legal option when nothing validates. */
export function completeAction(view: PlayerView, pending: PendingDecision, legal: Action[], pick: Action, ctx: BotContext): Action {
  if (!PARAMETERISED.has(pick.type)) return pick
  const path = movePath(view, pending, pick, ctx)
  if (path) {
    const a = { ...pick, path }
    if (ctx.accepts(a)) return a
  }
  return legal.find((x) => !PARAMETERISED.has(x.type)) ?? pick
}

/** Attack openers the placeholder bot favours, so bot games make contact (M4 replaces this brain). */
const ATTACK_OPENER = /^(shoot|throw|melee|charge)\./
const isAttack = (a: Action): boolean => ATTACK_OPENER.test(a.type) && !a.type.endsWith('.cancel')

/** Options that throw a turn away; the placeholder bot takes them only when nothing else is offered. */
const PASSIVE: ReadonlySet<string> = new Set(['turn.useNone', 'turn.end', 'move.cancel'])
/** Models whose last move found no legal path, keyed by seat, model and position, so the bot stops re-trying them. */
const stuck = new Set<string>()
const stuckKey = (view: PlayerView, modelId: string): string => {
  const m = view.models[modelId]
  return m ? `${view.seat}:${modelId}:${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)}` : ''
}

export const randomBrain: BotBrain = async (view, pending, legal, ctx) => {
  const attacks = legal.filter(isAttack)
  if (attacks.length) {
    const [f] = nextFloat(deriveSeed(ctx.seed, `${pending.id}:attack`))
    if (f < 0.8) return completeAction(view, pending, legal, attacks[Math.floor(f / 0.8 * attacks.length)]!, ctx)
  }
  const modelId = (pending.context as { modelId?: string }).modelId
  if (pending.kind === 'move.path' && modelId) {
    const to = legal.find((a) => a.type === 'move.to')
    if (to) {
      const a = completeAction(view, pending, legal, to, ctx)
      if (a.type !== 'move.to') stuck.add(stuckKey(view, modelId))
      return a
    }
  }
  // Drop the turn-wasting options and any move this model already failed from here; prefer moving over preparing.
  let pool = legal.filter((a) => !PASSIVE.has(a.type))
  if (modelId && stuck.has(stuckKey(view, modelId))) pool = pool.filter((a) => a.type !== 'move.go')
  if (!pool.length) pool = legal
  const move = pool.find((a) => a.type === 'move.go')
  if (move && nextFloat(deriveSeed(ctx.seed, `${pending.id}:move`))[0] < 0.85) return move
  const pick = await createRandomDecider(`${ctx.seed}:${view.seat}`).decide(view, pending, pool)
  return completeAction(view, pending, pool, pick, ctx)
}
