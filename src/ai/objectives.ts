// Objective play (spec 30 s13). Owner: AI. Reads the scenario record, the view's markers and the round, and turns what the
// scenario rewards into goals the eval can score: where a model wants to stand (a suit to claim, the marker to touch) and
// what an attack risks (a hit near a carriable bomb). Pure; every rules number still comes from query.* and the data.
// Nothing here reads hidden state: markers come from the view (objects are open information) and the side is inferred
// from the scenario record and the bot's own models. Nothing is keyed on a scenario id: goals come from record facts
// (marker props, rule ids and params, rounds), so any scenario with a claimable suit, a carried bomb or a hold marker gets them.
import { diceDef, recordOf } from '../engine/edition'
import { baseRadius } from '../engine/geometry'
import { markerRadius, touchingMarker } from '../engine/scenarios/rules'
import { inchesOf } from '../engine/scenarios/spec'
import type { MarkerState, ModelId, ModelState, Vec2 } from '../engine/types'
import type { AiContext } from './types'
import { dist, live } from './world'

export interface Scene {
  id: string
  /** The scenario side this bot plays (def.sides[].id), or null when it cannot be told. */
  side: string | null
  round: number
  /** Round limit; 0 when the scenario runs until someone wins. */
  rounds: number
  /** The round a side wins by outlasting (the round limit, or a victory entry's own round); 0 when nothing ends the game by the clock. */
  deadline: number
  /** The side that wins when the deadline passes with the board as it is (a victory entry with its own round), or null. */
  waitSide: string | null
  /** True when a round-limited scenario is decided by wiping the other side out (no hold marker decides it). */
  elimination: boolean
  /** Face of the marker whose base contact decides the game (a hold victory), or null. */
  holdFace: string | null
  /** The side that calls its reserve by holding the hold marker (the tower-control rule's side), or null. */
  reserveSide: string | null
  /** Face of the carriable marker a shot near it can detonate (the nuke-blast rule), or null. */
  nukeFace: string | null
  /** Inches from the nuke within which a hit rolls the armor die (the nuke-blast rule's `near`, read as the engine reads it). */
  blast: number
}

/**
 * Victory entries as the scenario record may carry them. `kind`, `marker` and `round` are the structured fields the record is
 * meant to grow (elimination | carryOff | hold, the face a hold victory counts contact with, the round a waiting side wins at);
 * until the data has them the facts are read from what the record does carry (rules, markers, rounds).
 */
interface VictoryFacts { side: string; when: string; kind?: string; marker?: string; round?: number }

const sceneMemo = new WeakMap<object, Scene>()
/** The scenario facts for this decision (memoised on the context). */
export function sceneOf(ctx: AiContext): Scene {
  const hit = sceneMemo.get(ctx)
  if (hit) return hit
  const id = ctx.view.scenarioId ?? ''
  const def = id ? recordOf(ctx.bundle, 'scenarios', id) : undefined
  const rounds = ctx.view.maxRounds ?? 0
  const scene: Scene = { id, side: null, round: ctx.view.round ?? 1, rounds, deadline: rounds, waitSide: null, elimination: false, holdFace: null, reserveSide: null, nukeFace: null, blast: 0 }
  if (def) {
    const mine = new Set(Object.values(ctx.view.models).filter((m) => m.owner === ctx.seat).map((m) => m.profileId))
    scene.side = def.sides.find((s) => (s.forces ?? []).some((f) => mine.has(f.unit)))?.id ?? null
    const victory = def.victory as unknown as VictoryFacts[]
    const ruleParams = (rid: string): Record<string, unknown> | null => {
      const r = def.rules.find((x) => x.id === rid) as { params?: Record<string, unknown> } | undefined
      return r ? (r.params ?? {}) : null
    }
    // The hold marker: a structured hold victory, else the object a control rule counts contact with.
    const hold = victory.find((v) => v.kind === 'hold' && typeof v.marker === 'string')
    const controlled = ruleParams('tower-control') || ruleParams('control') ? def.markers.find((m) => m.kind === 'object' && typeof m.face === 'string')?.face : undefined
    scene.holdFace = hold?.marker ?? controlled ?? null
    const reserve = ruleParams('tower-control')?.side
    scene.reserveSide = typeof reserve === 'string' ? reserve : null
    scene.elimination = victory.some((v) => v.kind) ? victory.some((v) => v.kind === 'elimination') : rounds > 0 && scene.holdFace === null
    // The nuke: the carriable marker of a scenario with a blast rule.
    const blast = ruleParams('nuke-blast')
    if (blast) {
      scene.nukeFace = def.markers.find((m) => (m.props as { carry?: unknown } | undefined)?.carry === true)?.face ?? null
      scene.blast = inchesOf(ctx.bundle, (blast.near as string | undefined) ?? 'orange')
    }
    // A side that wins by outlasting a round: a victory entry's own round, else (no round limit) the round its text names.
    const timed = victory.find((v) => typeof v.round === 'number')
    if (timed) { scene.deadline = timed.round!; scene.waitSide = timed.side }
    else if (rounds === 0) {
      const t = victory.find((v) => /\bround (\d+)\b/i.test(v.when))
      const n = Number(/\bround (\d+)\b/i.exec(t?.when ?? '')?.[1])
      if (t && Number.isFinite(n) && n > 1) { scene.deadline = n; scene.waitSide = t.side }
    }
  }
  sceneMemo.set(ctx, scene)
  return scene
}

/** A spot worth standing on: `marker` is the thing to touch, `share` its value as a fraction of the model's worth. */
export interface Goal { kind: 'suit' | 'hold'; at: Vec2; marker: MarkerState; share: number }

const isPowerArmor = (ctx: AiContext, m: ModelState): boolean =>
  m.carried.some((c) => c.kind === 'armor' && !c.spent && recordOf(ctx.bundle, 'armor', c.defId)?.kind === 'powerArmor')

/** An object a side can put on (a drawn power armor suit), from the marker's own props. */
const isSuit = (mk: MarkerState): boolean => typeof mk.props.suit === 'string' || Array.isArray(mk.props.suitPool)

/** Unclaimed, unbroken suits this model's side may put on. */
export function claimableSuits(ctx: AiContext, modelId: ModelId): MarkerState[] {
  const m = ctx.view.models[modelId]
  const scene = sceneOf(ctx)
  if (!live(m) || isPowerArmor(ctx, m)) return []
  return (ctx.view.markers ?? []).filter((mk) => isSuit(mk) && mk.props.claimed !== true && mk.props.destroyed !== true
    && mk.props.offTable !== true && !mk.carriedBy && (typeof mk.props.claimBy !== 'string' || mk.props.claimBy === scene.side))
}

/** What claiming a suit is worth in the activation menu, in cost units: the suit's cost (its armor record) times SUIT_WORTH. */
export function suitValue(ctx: AiContext, mk: MarkerState): number {
  const cost = recordOf(ctx.bundle, 'armor', String(mk.props.suit ?? ''))?.cost ?? 0
  return SUIT_WORTH * cost
}
/** Times its cost that a suit is worth to claim: it protects (and, for a melee model, strengthens) every later turn. */
const SUIT_WORTH = 1.5

/** Fraction of the game gone (0 at the start, 1 on the last round); 0 when there is no round limit. */
export function progress(ctx: AiContext): number {
  const s = sceneOf(ctx)
  return s.rounds > 0 ? Math.max(0, Math.min(1, (s.round - 1) / Math.max(1, s.rounds - 1))) : 0
}

/**
 * How hard the bot must push to finish before the clock does: 0 until 30 percent of the rounds are gone, 1 on the last
 * one. Only scenarios decided by wiping the other side out under a round limit have it; a hold goal has its own pull.
 * Scenarios with no clock use `stall` instead.
 */
export function urgency(ctx: AiContext): number {
  const s = sceneOf(ctx)
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
  if (s.elimination && s.rounds > 0) return clamp01((progress(ctx) - 0.3) / 0.7)
  return stall(ctx)
}
/** 0..1: how stalled a scenario with no round limit and no deadline is: past round STALL_FROM a bot hunts the last stragglers instead of waiting; the threat and survival terms fade out as it grows. */
export function stall(ctx: AiContext): number {
  const s = sceneOf(ctx)
  if (s.rounds > 0 || s.deadline > 0) return 0
  return Math.max(0, Math.min(1, (s.round - STALL_FROM) / STALL_SPAN))
}
/** Round after which an unlimited game counts as stalled, and the rounds over which the push to finish it ramps up. */
const STALL_FROM = 8
const STALL_SPAN = 6

const holdMarker = (ctx: AiContext): MarkerState | undefined => {
  const face = sceneOf(ctx).holdFace
  return face ? (ctx.view.markers ?? []).find((mk) => mk.face === face) : undefined
}

/** True when a model's base is in contact with the hold marker (the engine's own contact test). */
export function touchesTower(ctx: AiContext, m: ModelState): boolean {
  const tower = holdMarker(ctx)
  return !!tower && live(m) && touchingMarker(m, tower)
}

/**
 * A hold scenario (box-4) is decided by who touches the marker when the last round ends, so in the closing rounds a shot
 * only matters if it thins the models touching it. Scales an attack's value by its target: 1 elsewhere and in the opening rounds.
 */
export function attackFactor(ctx: AiContext, targetId: ModelId): number {
  const scene = sceneOf(ctx)
  if (!scene.holdFace || scene.rounds <= 0) return 1
  const left = scene.rounds - scene.round
  if (left > 1) return 1
  const t = ctx.view.models[targetId]
  if (!t || !holdMarker(ctx)) return 1
  const at = touchesTower(ctx, t)
  return left <= 0 ? (at ? 1.6 : 0.15) : (at ? 1.3 : 0.5)
}

const goalFaceMemo = new WeakMap<object, ReadonlySet<string> | undefined>()
/** Marker faces whose pull the scenario's goals already cover (the generic pull skips them); undefined for scenarios without goals. */
export function goalFaces(ctx: AiContext): ReadonlySet<string> | undefined {
  if (goalFaceMemo.has(ctx)) return goalFaceMemo.get(ctx)
  const scene = sceneOf(ctx)
  const faces = new Set<string>()
  for (const mk of ctx.view.markers ?? []) if (isSuit(mk) && mk.face) faces.add(mk.face)
  if (scene.holdFace) faces.add(scene.holdFace)
  if (scene.nukeFace) faces.add(scene.nukeFace)
  const out = faces.size ? faces : undefined
  goalFaceMemo.set(ctx, out)
  return out
}

/** The goals a model has now. */
export function goalsFor(ctx: AiContext, modelId: ModelId): Goal[] {
  const m = ctx.view.models[modelId]
  const scene = sceneOf(ctx)
  if (!live(m)) return []
  const out: Goal[] = []
  for (const mk of claimableSuits(ctx, modelId)) out.push({ kind: 'suit', at: mk.pos, marker: mk, share: SUIT_GOAL_SHARE })
  const hold = holdMarker(ctx)
  if (hold && !m.inert) {
    // Models touching the marker decide the game when the last round ends: a faint pull early, a hard one on the last rounds.
    // The side that calls its reserve by holding it needs several turns in a row, so it holds from the start.
    const p = progress(ctx)
    const share = scene.side !== null && scene.side === scene.reserveSide ? DEFENDER_TOWER_MIN + (DEFENDER_TOWER_MAX - DEFENDER_TOWER_MIN) * p
      : TOWER_SHARE_MIN + (TOWER_SHARE_MAX - TOWER_SHARE_MIN) * p * p
    // On the last round the count is all that is left: contact is worth far more than anything else.
    out.push({ kind: 'hold', at: hold.pos, marker: hold, share: scene.rounds > 0 && scene.round >= scene.rounds ? share * 2 : share })
  }
  return out
}
const SUIT_GOAL_SHARE = 0.2
const TOWER_SHARE_MIN = 0.02
const TOWER_SHARE_MAX = 0.2
const DEFENDER_TOWER_MIN = 0.16
const DEFENDER_TOWER_MAX = 0.3
/** Distance (in) beyond which a goal no longer pulls. */
const GOAL_REACH = 24

/** The value of one goal to a model standing at `at`, as a fraction of the model's worth (before tier.wObjective). */
export function goalValue(ctx: AiContext, modelId: ModelId, g: Goal, at: Vec2): number {
  const m = ctx.view.models[modelId]
  if (!m) return 0
  if (touchingMarker({ ...m, pos: at }, g.marker)) return g.share * 1.5
  const gap = Math.max(0, dist(at, g.at) - baseRadius(m.base) - markerRadius(g.marker))
  return g.share * Math.max(0, 1 - gap / GOAL_REACH)
}

// ---------- the box-2 nuke ----------
/** Share of the bot's own side that a detonation (both sides lose, a draw) throws away. */
const NUKE_DRAW_SHARE = 0.9

/** Chance of a 1 on the armor die, read from the edition's die faces (the engine's detonation roll, nukeBlast). */
function nukeP(ctx: AiContext): number {
  const faces = diceDef(ctx.bundle).armor
  return faces.length ? faces.filter((v) => v === 1).length / faces.length : 0
}

/**
 * The live nuke's centre, or null: no nuke in this scenario, or it has gone off or left. A carried nuke is where its carrier
 * stands. Reads the view's marker, which objects always show.
 */
export function nukeAt(ctx: AiContext): { at: Vec2; carrier: ModelId | null } | null {
  const face = sceneOf(ctx).nukeFace
  const mk = face ? (ctx.view.markers ?? []).find((x) => x.face === face) : undefined
  if (!mk || mk.props.exploded === true || mk.props.destroyed === true || mk.props.offTable === true) return null
  const c = mk.carriedBy ? ctx.view.models[mk.carriedBy] : undefined
  return { at: c ? c.pos : mk.pos, carrier: c ? c.id : null }
}

/**
 * Cost (in the bot's cost units) of an attack that may set the nuke off: a hit on the carrier or on a model within the blast
 * range of the nuke rolls the armor die and a 1 detonates it, which ends the game as a draw. `pHit` is the engine's hit odds.
 * `mineTotal` is the bot's surviving cost; a bot with nothing to lose pays nothing.
 */
export function nukeRisk(ctx: AiContext, targetPos: Vec2, targetId: ModelId, pHit: number, mineTotal: number): number {
  if (pHit <= 0) return 0
  const nuke = nukeAt(ctx)
  const t = ctx.view.models[targetId]
  if (!nuke || !t) return 0
  const near = nuke.carrier === targetId || Math.max(0, dist(targetPos, nuke.at) - baseRadius(t.base)) <= sceneOf(ctx).blast
  return near ? pHit * nukeP(ctx) * NUKE_DRAW_SHARE * mineTotal * nukeCaution(ctx) : 0
}

/** Cost of standing at a spot where `pHurt` is the chance some enemy hits the model there (a hit within the blast range rolls the die). */
export function nukeExposure(ctx: AiContext, modelId: ModelId, at: Vec2, pHurt: number, mineTotal: number): number {
  const nuke = nukeAt(ctx)
  const m = ctx.view.models[modelId]
  if (!nuke || !m || pHurt <= 0) return 0
  const near = nuke.carrier === modelId || Math.max(0, dist(at, nuke.at) - baseRadius(m.base)) <= sceneOf(ctx).blast
  return near ? Math.min(1, pHurt) * nukeP(ctx) * NUKE_DRAW_SHARE * mineTotal * nukeCaution(ctx) : 0
}

/**
 * What picking up the nuke is worth to a model, in cost units, or null when `mk` is not the nuke or the pickup is an
 * ordinary one. The side that wins by waiting leaves it alone (a carrier is the one a hit sets it off on); the others
 * pick it up like any other object.
 */
export function nukePickupValue(ctx: AiContext, modelId: ModelId, mk: MarkerState | undefined): number | null {
  const scene = sceneOf(ctx)
  if (!mk || !scene.nukeFace || mk.face !== scene.nukeFace || !ctx.view.models[modelId]) return null
  return scene.side !== null && scene.side === scene.waitSide ? -1 : null
}

/**
 * How much a possible detonation should weigh: fully while there is time to win by shooting, less as the waiting side's
 * timer runs down for the other (a draw beats the loss that waiting brings). The waiting side is winning by waiting, so
 * the nuke stays a full risk to it.
 */
export function nukeCaution(ctx: AiContext): number {
  const scene = sceneOf(ctx)
  if (scene.waitSide === null || scene.side === null || scene.side === scene.waitSide || scene.deadline <= 0) return 1
  const dl = scene.deadline
  return Math.max(NUKE_CAUTION_FLOOR, Math.min(NUKE_ATTACKER_CAUTION, (dl - scene.round) / Math.max(1, dl - 3)))
}
const NUKE_CAUTION_FLOOR = 0.05
const NUKE_ATTACKER_CAUTION = 1
