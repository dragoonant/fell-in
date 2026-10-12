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

function candidatePath(view: PlayerView, pending: PendingDecision, seed: string, attempt: number): Vec2[] {
  const c = pending.context as { modelId?: string; inches?: number; baseInches?: number }
  const m = c.modelId ? view.models[c.modelId] : undefined
  if (!m) return []
  let rng = deriveSeed(seed, `${pending.id}:path:${attempt}`)
  const [a, r1] = nextFloat(rng); rng = r1
  const [f] = nextFloat(rng)
  // Range the engine handed us in pending.context; lean towards the table centre so games make contact (a narrow cone,
  // widening on later attempts, keeps figures that start on an edge from wandering off the table).
  const reach = ((c.inches ?? 0) + (c.baseInches ?? 0)) * (0.25 + 0.7 * f)
  const spread = Math.min(1.2, 0.6 + attempt * 0.1)
  const ang = Math.atan2(-m.pos.z, -m.pos.x) + (a - 0.5) * Math.PI * spread
  return [{ x: m.pos.x + Math.cos(ang) * reach, z: m.pos.z + Math.sin(ang) * reach }]
}

/** Fill a parameterised template; falls back to another legal option when nothing validates. */
export function completeAction(view: PlayerView, pending: PendingDecision, legal: Action[], pick: Action, ctx: BotContext): Action {
  if (!PARAMETERISED.has(pick.type)) return pick
  for (let k = 0; k < 12; k++) {
    const a = { ...pick, path: candidatePath(view, pending, ctx.seed, k) }
    if (ctx.accepts(a)) return a
  }
  return legal.find((x) => !PARAMETERISED.has(x.type)) ?? pick
}

/** Attack openers the placeholder bot favours, so bot games make contact (M4 replaces this brain). */
const ATTACK_OPENER = /^(shoot|throw|melee|charge)\./
const isAttack = (a: Action): boolean => ATTACK_OPENER.test(a.type) && !a.type.endsWith('.cancel')

export const randomBrain: BotBrain = async (view, pending, legal, ctx) => {
  const attacks = legal.filter(isAttack)
  if (attacks.length) {
    const [f] = nextFloat(deriveSeed(ctx.seed, `${pending.id}:attack`))
    if (f < 0.8) return completeAction(view, pending, legal, attacks[Math.floor(f / 0.8 * attacks.length)]!, ctx)
  }
  const pick = await createRandomDecider(`${ctx.seed}:${view.seat}`).decide(view, pending, legal)
  return completeAction(view, pending, legal, pick, ctx)
}
