// Official AI turn procedure (spec 18 s8.2-8.4). Pure helpers over the view: numbering, token draw, use order,
// settings and switches, column predicate, blue-die row, cell. `step` dispatches one decision kind.
// The turn-order and matrix helpers are real; settings resolution and `step` beyond the turn kinds are TODO(M4b).
import type { AiCardDef } from '../../data/types'
import { healthOf, tokensOn } from '../../engine/damage'
import { recordOf, rulerInches } from '../../engine/edition'
import { baseRadius } from '../../engine/geometry'
import { hasLos } from '../../engine/los'
import type { Action, ModelId, ModelState, SeatId } from '../../engine/types'
import type { AiView } from '../types'
import { dist, live, roundOf } from '../world'
import { answerActivation, answerSub } from './responses'
import type {
  ActivationPlan, AiSetting, BlueFace, BlueRoll, ColumnHook, ColumnPredicate, MatrixPick, OfficialContext,
  SubjectHook, SubjectSet, SwitchHook,
} from './types'
import type { MarkerState } from '../../engine/types'

/** Id of the generic fallback card (same value as decider.GENERIC_CARD_ID; not imported to avoid a cycle). */
const GENERIC_ID = 'ai-generic'

/** Default setting when nothing else applies (R-1). */
export const DEFAULT_SETTING: AiSetting = { objective: 'defeat', subject: 'any-enemy' }

/** Named dynamic Subjects (spec 18 s8.2). TODO(M4b): next-route-marker, any enemy seen this or last round. */
export const SUBJECT_HOOKS: Record<string, SubjectHook> = {
  /** Enemies with line of sight to one of the seat's models now (this-or-last-round memory is kept in `seen`). */
  'any enemy seen this or last round': (ctx, modelId) => {
    const round = roundOf(ctx.official.base, ctx.view)
    const now = new Set(ctx.official.seen[round] ?? [])
    for (const f of Object.values(ctx.view.models)) {
      if (f.owner !== ctx.seat || !live(f)) continue
      for (const e of Object.values(ctx.view.models)) {
        if (e.owner === ctx.seat || !live(e) || now.has(e.id)) continue
        try { if (hasLos(ctx.q, f.id, e.id)) now.add(e.id) } catch { /* no verdict */ }
      }
    }
    ctx.official.seen[round] = [...now]
    const ids = new Set([...now, ...(ctx.official.seen[round - 1] ?? [])])
    const ms = Object.values(ctx.view.models).filter((m) => ids.has(m.id) && live(m))
    void modelId
    return { models: ms.map((m) => m.id), markers: [], points: ms.map((m) => ({ ...m.pos })) }
  },
  /** Patrol loop: route markers (props.route = order) visited in turn; the index advances on contact and loops (AIH s4). */
  'next-route-marker': (ctx, modelId) => {
    const route = (ctx.view.markers ?? []).filter((k) => typeof k.props?.route === 'number').sort((a, b) => Number(a.props.route) - Number(b.props.route))
    const me = ctx.view.models[modelId]
    if (!route.length || !me) {
      ctx.trace.entries.push({ kind: 'note', text: 'next-route-marker: no route markers in the scenario data (patrol holds position)' })
      return { models: [], markers: [], points: [] }
    }
    let i = (ctx.official.route[modelId] ?? 0) % route.length
    if (dist(me.pos, route[i]!.pos) <= baseRadius(me.base) + 0.5) i = (i + 1) % route.length
    ctx.official.route[modelId] = i
    return { models: [], markers: [route[i]!.id], points: [{ ...route[i]!.pos }] }
  },
}

/** Awareness length for the Break-in alert (Yellow ruler; the scenario sheet names no colour: ruling in needs-rules-check). */
const AWARE_RULER = 'yellow' as const

/** Scenario switch predicates keyed by scenario id (spec 18 s8.2). */
export const SWITCH_HOOKS: Record<string, SwitchHook> = {
  /** Break-in: aware of a trigger (a force model took damage) or LoS to a player model within Awareness -> Defeat what it has seen. */
  'ai-breakin': (ctx) => {
    const mem = ctx.official
    if (!mem.aware) {
      const reach = rulerInches(ctx.bundle, AWARE_RULER)
      const mine = Object.values(ctx.view.models).filter((m) => m.owner === ctx.seat && live(m))
      if (mine.some((m) => m.damage + m.rad > 0)) mem.aware = true
      else {
        for (const f of mine) {
          for (const e of Object.values(ctx.view.models)) {
            if (e.owner === ctx.seat || !live(e) || dist(f.pos, e.pos) > reach) continue
            try { if (hasLos(ctx.q, f.id, e.id)) { mem.aware = true; break } } catch { /* no verdict */ }
          }
          if (mem.aware) break
        }
      }
    }
    return mem.aware ? { objective: 'defeat', subject: 'any enemy seen this or last round' } : null
  },
  /** Tech phase 2 (marker 1 revealed): hounds Protect the Tech while it is on the table. */
  'ai-tech': (ctx, modelId) => {
    const me = ctx.view.models[modelId]
    if (me?.profileId !== 'mutant-hound') return null
    const opened = (ctx.view.markers ?? []).some((k) => k.id === 'marker-1' && k.revealed)
    const tech = Object.values(ctx.view.models).some((m) => m.profileId === 'enslaved-tech' && live(m))
    return opened && tech ? { objective: 'protect', subject: 'enslaved-tech' } : null
  },
}

/** Responses forced without a blue roll (spec 18 s8.2): unaware Break-in patrols and Tech-scenario hounds always O. */
export function forcedResponse(ctx: OfficialContext, modelId: ModelId): MatrixPick['response'] | undefined {
  const sc = ctx.opts.scenarioId ?? ctx.view.scenarioId
  if (sc === 'ai-breakin') {
    SWITCH_HOOKS['ai-breakin']!(ctx, modelId, DEFAULT_SETTING)
    return ctx.official.aware ? undefined : 'O'
  }
  if (sc === 'ai-tech' && ctx.view.models[modelId]?.profileId === 'mutant-hound') return 'O'
  return undefined
}
/** Situation columns keyed by `code:<hook>` (spec 18 s8.3). TODO(M4b): oUseOrGoTo. */
export const COLUMN_HOOKS: Record<string, ColumnHook> = {
  /** Situation column of the Institute cards: true while the model's O response is Use or Go To. */
  oUseOrGoTo: (ctx, modelId) => { const o = currentSetting(ctx, modelId).objective; return o === 'use' || o === 'goTo' },
}

/**
 * Card for a model by its unit PROFILE id: opts.cards, then the card whose unitId is the profile, then the generic card.
 * (decider.ts looks up by `model.unitId`, which the engine sets to a group instance id like 'a-settler-1'; see issues.)
 */
export function cardOfModel(ctx: OfficialContext, modelId: ModelId): AiCardDef | null {
  const m = ctx.view.models[modelId]
  if (!m) return null
  const override = ctx.opts.cards?.[m.profileId]
  const byId = override ? ctx.bundle.records.ai.find((c) => c.id === override) : undefined
  return byId ?? recordOf(ctx.bundle, 'ai', `ai-${m.profileId}`)
    ?? ctx.bundle.records.ai.find((c) => c.unitId === m.profileId && c.id !== GENERIC_ID) ?? ctx.cardOf(modelId)
}

// ---------- numbering and turn order (s8.3 steps 1-4) ----------
/** AI marker numbers: the seat's models sorted by id, 1-based, fixed all game (R-4). */
export function aiNumbers(view: AiView, seat: SeatId, override?: Record<ModelId, number>): Record<ModelId, number> {
  const ids = Object.values(view.models).filter((m) => m.owner === seat).map((m) => m.id).sort()
  const out: Record<ModelId, number> = {}
  ids.forEach((id, i) => { out[id] = override?.[id] ?? i + 1 })
  return out
}

/** `turn.ready`: draw one number token from the Unready pool (uniform, seeded by the decision id). */
export function drawToken(ctx: OfficialContext): Action | null {
  const opts = ctx.legal.filter((a) => a.type === 'turn.ready')
  if (!opts.length) return null
  const nums = aiNumbers(ctx.view, ctx.seat, ctx.opts.numbers)
  const pool = [...opts].sort((a, b) => (nums[String(a.modelId)] ?? 0) - (nums[String(b.modelId)] ?? 0))
  const r = ctx.roll('token', ctx.pending.id)()
  const pick = pool[Math.floor(r * pool.length)]!
  const drawn = String(pick.modelId)
  ctx.trace.entries.push({ kind: 'token', round: roundOf(ctx.official.base, ctx.view), drawn, number: nums[drawn] ?? 0, pool: pool.map((a) => String(a.modelId)) })
  return pick
}

/** `turn.choose`: the AI always Uses its Ready models. */
export function useAll(ctx: OfficialContext): Action | null {
  return ctx.legal.find((a) => a.type === 'turn.useAll') ?? null
}

/** `turn.pick`: the Ready model with the lowest number. */
export function nextByNumber(ctx: OfficialContext): Action | null {
  const opts = ctx.legal.filter((a) => a.type === 'turn.pick')
  if (!opts.length) return null
  const nums = aiNumbers(ctx.view, ctx.seat, ctx.opts.numbers)
  const pick = [...opts].sort((a, b) => (nums[String(a.modelId)] ?? 0) - (nums[String(b.modelId)] ?? 0))[0]!
  ctx.trace.entries.push({ kind: 'order', picked: String(pick.modelId), number: nums[String(pick.modelId)] ?? 0 })
  return pick
}

// ---------- settings (s8.2) ----------
const isSetting = (v: unknown): v is AiSetting => !!v && typeof (v as AiSetting).objective === 'string' && typeof (v as AiSetting).subject === 'string'

/** Base setting for a model: opts.settings > scenario side ai > DEFAULT_SETTING (R-1). */
export function baseSetting(ctx: OfficialContext, modelId: ModelId): AiSetting {
  const o = ctx.opts.settings
  if (isSetting(o)) return o
  const per = o ? (o as Record<ModelId, AiSetting>)[modelId] : undefined
  if (per && isSetting(per)) return per
  const sc = ctx.opts.scenarioId ? recordOf(ctx.bundle, 'scenarios', ctx.opts.scenarioId) : undefined
  const side = sc?.sides.find((x) => (ctx.opts.side ? x.id === ctx.opts.side : !!x.ai))
  if (side?.ai) return { objective: side.ai.objective, subject: side.ai.subject }
  return DEFAULT_SETTING
}

/** Enemy models no longer on the table (removals), for completion limits. */
const removedEnemies = (ctx: OfficialContext): number =>
  Object.values(ctx.view.models).filter((m) => m.owner !== ctx.seat && (m.life !== 'active' || m.offTable)).length

/** Base setting after scenario switches and completion limits (R-3). */
export function currentSetting(ctx: OfficialContext, modelId: ModelId): AiSetting {
  const base = baseSetting(ctx, modelId)
  if (base.limit !== undefined && removedEnemies(ctx) >= base.limit) return DEFAULT_SETTING
  const hook = ctx.opts.scenarioId ? SWITCH_HOOKS[ctx.opts.scenarioId] : undefined
  return hook?.(ctx, modelId, base) ?? base
}

const liveModels = (ctx: OfficialContext, pred: (m: ModelState) => boolean): ModelState[] => Object.values(ctx.view.models).filter((m) => live(m) && pred(m))

/**
 * Name of a marker for Subject matching: props.name, else the face. Object markers are scenario objectives whose face
 * the scenario data names (the view redacts the face until revealed), so it is read from the scenario record by index.
 */
export function markerName(ctx: OfficialContext, k: MarkerState): string {
  const named = k.props?.name
  if (typeof named === 'string' && named) return named
  if (k.face) return k.face
  if (k.kind !== 'object') return ''
  const sc = recordOf(ctx.bundle, 'scenarios', String(ctx.opts.scenarioId ?? ctx.view.scenarioId ?? ''))
  const i = /^marker-(\d+)$/.exec(k.id)
  return (i ? sc?.markers[Number(i[1]) - 1]?.face : undefined) ?? ''
}

/** Resolve a Subject string for a model (R-2). */
export function resolveSubject(ctx: OfficialContext, modelId: ModelId, subject: string): SubjectSet {
  const me = ctx.view.models[modelId]
  const markers = ctx.view.markers ?? []
  const ofModels = (ms: ModelState[], fallback = false): SubjectSet => ({ models: ms.map((m) => m.id), markers: [], points: ms.map((m) => ({ ...m.pos })), ...(fallback ? { fallback: true } : {}) })
  const ofMarkers = (ks: typeof markers): SubjectSet => ({ models: [], markers: ks.map((k) => k.id), points: ks.map((k) => ({ ...k.pos })) })
  const enemies = () => liveModels(ctx, (m) => m.owner !== ctx.seat)
  if (subject === 'any-enemy') return ofModels(enemies())
  if (subject === 'any-model') return ofModels(liveModels(ctx, (m) => m.id !== modelId))
  if (subject === 'self') return me ? ofModels([me]) : ofModels([])
  const hook = SUBJECT_HOOKS[subject]
  if (hook) return hook(ctx, modelId)
  const named = (m: ModelState) => m.unitId === subject || m.profileId === subject
  const byUnit = enemies().filter(named)
  if (byUnit.length) return ofModels(byUnit)
  const anyone = liveModels(ctx, (m) => m.id !== modelId && named(m)) // a force's own or a captured model (the Tech)
  if (anyone.length) return ofModels(anyone)
  const marked = markers.filter((k) => k.id === subject || markerName(ctx, k) === subject)
  if (marked.length) return ofMarkers(marked)
  const nearest = /^nearest-(.+?)(?:-marker)?$/.exec(subject)
  if (nearest && me) {
    const pool = markers.filter((k) => k.kind === nearest[1] && !k.carriedBy && !k.revealed).sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos))
    return ofMarkers(pool.slice(0, 1))
  }
  ctx.trace.entries.push({ kind: 'note', text: `unknown subject '${subject}' -> any-enemy (R-2)` })
  return ofModels(enemies(), true)
}

// ---------- matrix (s8.3) ----------
/** Parse a column `when`: damageTaken range, `health:N+`, `health:A-B`, `code:<hook>`; empty = always. */
export function parseColumnWhen(when: AiCardDef['columns'][number]['when']): ColumnPredicate {
  if (when.damageTaken) return { kind: 'damageTaken', lo: when.damageTaken[0], hi: when.damageTaken[1] }
  const o = (when.other ?? '').trim()
  if (!o) return { kind: 'always' }
  let m = /^health:(\d+)\+$/.exec(o)
  if (m) return { kind: 'health', lo: Number(m[1]), hi: null }
  m = /^health:(\d+)-(\d+)$/.exec(o)
  if (m) return { kind: 'health', lo: Number(m[1]), hi: Number(m[2]) }
  m = /^code:([\w-]+)$/.exec(o)
  if (m) return { kind: 'code', hook: m[1]! }
  throw new Error(`official ai: bad column predicate '${o}'`)
}

/** Health left = Health (Heroic included) minus damage and rad tokens. */
export function healthLeft(ctx: OfficialContext, modelId: ModelId): number {
  const m = ctx.view.models[modelId]
  if (!m) return 0
  return healthOf(ctx.q, ctx.bundle, modelId) - tokensOn(ctx.bundle, m)
}

/** First column, left to right, whose predicate holds (R-6); the last column when none does. */
export function findColumn(ctx: OfficialContext, card: AiCardDef, modelId: ModelId): number {
  const m = ctx.view.models[modelId]
  for (let i = 0; i < card.columns.length; i++) {
    const p = parseColumnWhen(card.columns[i]!.when)
    const ok = p.kind === 'always' ? true
      : p.kind === 'damageTaken' ? (m ? tokensOn(ctx.bundle, m) : 0) >= p.lo && (m ? tokensOn(ctx.bundle, m) : 0) <= p.hi
        : p.kind === 'health' ? healthLeft(ctx, modelId) >= p.lo && (p.hi === null || healthLeft(ctx, modelId) <= p.hi)
          : COLUMN_HOOKS[p.hook]?.(ctx, modelId) ?? false
    if (ok) return i
  }
  return Math.max(0, card.columns.length - 1)
}

/** Face key for a blue-die face's icons. */
export function blueFaceKey(icons: readonly string[]): BlueFace {
  const b = icons.filter((i) => i === 'BOT').length, s = icons.filter((i) => i === 'STAR').length
  if (icons.includes('BLAST')) return 'BLAST'
  if (b && s) return 'BOT+STAR'
  if (b >= 2) return 'BOT2'
  if (s >= 2) return 'STAR2'
  return b ? 'BOT' : 'STAR'
}

/** Roll the activation's blue die from deriveSeed(seed, 'blue', key) over dice.json effect.blue. */
export function rollBlue(ctx: OfficialContext, key: string): BlueRoll {
  const faces = ctx.bundle.singletons.dice?.effect.blue ?? []
  if (!faces.length) throw new Error('official ai: dice.json has no blue faces')
  const faceIndex = Math.floor(ctx.roll('blue', key)() * faces.length)
  const icons = [...faces[faceIndex]!.icons]
  return { faceIndex, face: blueFaceKey(icons), icons }
}

/** Row for a face: exact key first, else the row holding the face's first icon (R-8), else row 0. */
export function findRow(card: AiCardDef, roll: BlueRoll): number {
  const exact = card.rows.findIndex((r) => r.blueIcons.includes(roll.face))
  if (exact >= 0) return exact
  const first = roll.icons[0] as BlueFace | undefined
  const loose = first ? card.rows.findIndex((r) => r.blueIcons.includes(first)) : -1
  return loose >= 0 ? loose : 0
}

/** Read the cell for a model now: column, roll (unless forced), row and cell (s8.3). */
export function readCell(ctx: OfficialContext, card: AiCardDef, modelId: ModelId, key: string, forced?: MatrixPick['response']): MatrixPick {
  const column = findColumn(ctx, card, modelId)
  const roll = forced ? null : rollBlue(ctx, key)
  const row = roll ? findRow(card, roll) : 0
  const cell = card.rows[row]?.cells[column] ?? card.rows[row]?.cells[0] ?? { response: 'A' as const, reckless: false, stayEngaged: false }
  return {
    cardId: card.id, modelId, column, columnLabel: card.columns[column]?.label ?? '', roll, row,
    response: forced ?? cell.response, attitude: cell.reckless ? 'reckless' : 'careful', stayEngaged: cell.stayEngaged,
    method: [...(card.rows[row]?.method ?? ['ranged', 'close'])], ...(forced ? { forced } : {}),
  }
}

/** Activation key `${round}:${modelId}` (s8.3). */
export function activationKey(ctx: OfficialContext, modelId: ModelId): string {
  return `${roundOf(ctx.official.base, ctx.view)}:${modelId}`
}

/** The plan for the activating model, created at its first `turn.activation` (s8.3 step 5); settings refresh each Action. */
export function planFor(ctx: OfficialContext, modelId: ModelId): ActivationPlan | null {
  const key = activationKey(ctx, modelId)
  const setting = currentSetting(ctx, modelId)
  const prev = ctx.official.settings[modelId]
  const switched = !!prev && (prev.objective !== setting.objective || prev.subject !== setting.subject)
  ctx.official.settings[modelId] = setting
  const have = ctx.official.plans[key]
  if (have) {
    if (switched) ctx.trace.entries.push({ kind: 'setting', modelId, setting, switched })
    have.setting = setting
    return have
  }
  const card = cardOfModel(ctx, modelId)
  if (!card) return null
  const forced = forcedResponse(ctx, modelId)
  const pick = readCell(ctx, card, modelId, key, forced)
  const plan: ActivationPlan = {
    key, modelId, number: aiNumbers(ctx.view, ctx.seat, ctx.opts.numbers)[modelId] ?? 0, setting, pick,
    actionsStarted: 0, quickTaken: false, activity: null, noContact: [],
  }
  ctx.official.plans[key] = plan
  ctx.trace.entries.push({ kind: 'setting', modelId, setting, switched })
  ctx.trace.entries.push({ kind: 'matrix', pick })
  return plan
}

/**
 * Answer one decision: turn kinds here, `turn.activation` and sub-decisions through responses.ts.
 * null = no opinion (the decider falls back to the M4a normal policy, then random).
 */
export function step(ctx: OfficialContext): Action | null {
  switch (ctx.pending.kind) {
    case 'turn.ready': return drawToken(ctx)
    case 'turn.choose': return useAll(ctx)
    case 'turn.pick': return nextByNumber(ctx)
    case 'turn.activation': return answerActivation(ctx)
    default: return answerSub(ctx)
  }
}
