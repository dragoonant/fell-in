// The official AI card decider (spec 18 s8; FROZEN interface at M4b). Implements the engine Decider for the AI seat:
// turn.ready = draw a Number Token, turn.choose = always use all, turn.pick = lowest Number (CH p8); activation
// decisions follow the matrix and the activity lists (CH p10-16). Randomness only from deriveSeed(opts.seed, ...).
import type { AiCardDef } from '../../data/types'
import type { Decider } from '../../engine/decider'
import { deriveSeed, nextFloat } from '../../engine/rng'
import type { Action, Id, ModelId, ModelState, PendingDecision, PlayerView } from '../../engine/types'
import type { AiView } from '../types'
import { isLegalShape, shimAccepts } from '../world'
import { blueFaces, resolveCell } from './matrix'
import { resolveSubject, settingsWith } from './objectives'
import { followUpPushBack, pathFor, planAction, slide, type Intent, type ResponseCtx } from './responses'
import { rankTargets } from './targeting'
import type { AiDecisionLog, AiSettings, OfficialAiOpts, OfficialDecision, ResolvedCell, TargetRanking } from './types'
import { cardOfModel, qOf } from './util'

/** Decision kinds the official decider answers itself; anything else gets the first legal action and a log entry. */
export const OFFICIAL_KINDS = [
  'turn.ready', 'turn.choose', 'turn.pick', 'turn.activation', 'move.path', 'shoot.target', 'throw.target',
  'charge.marker', 'battleCry.push', 'battleCry.follow', 'melee.slide', 'react.offer', 'shoot.luck', 'throw.luck', 'melee.luck',
  'item.choose', 'search.found',
] as const
export type OfficialKind = typeof OFFICIAL_KINDS[number]

export interface OfficialAiDecider extends Decider {
  /** Synchronous core (tests, bench, worker). */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): OfficialDecision
  /** Every decision made so far, oldest first (AI-015). */
  readonly log: readonly AiDecisionLog[]
}

const floatOf = (...parts: (string | number)[]): number => nextFloat(deriveSeed(...parts))[0]

/** Number per AI model (CH p8): model.tokens.aiNumber when the engine set it, else a deriveSeed(seed,'ai-numbers') permutation of the sorted ids. */
export function aiNumbersOf(view: AiView, seed: string): Record<ModelId, number> {
  const mine = Object.values(view.models).filter((m) => m.owner === view.seat).sort((a, b) => a.id.localeCompare(b.id))
  if (mine.length && mine.every((m) => m.tokens.aiNumber !== undefined)) return Object.fromEntries(mine.map((m) => [m.id, m.tokens.aiNumber!]))
  const nums = mine.map((_, i) => i + 1)
  let st = deriveSeed(seed, 'ai-numbers')
  for (let i = nums.length - 1; i > 0; i--) {
    const [f, n] = nextFloat(st)
    st = n
    const j = Math.floor(f * (i + 1))
    ;[nums[i], nums[j]] = [nums[j]!, nums[i]!]
  }
  return Object.fromEntries(mine.map((m, i) => [m.id, m.tokens.aiNumber ?? nums[i]!]))
}

/** Blue-die face for this model's activation this round: deriveSeed(seed, 'ai-blue', round, modelId). */
export function blueFaceFor(seed: string, round: number, modelId: ModelId, faces: number): number {
  return Math.min(faces - 1, Math.floor(floatOf(seed, 'ai-blue', round, modelId) * faces))
}

/** Number Token draw: one of the legal turn.ready options, uniform, deriveSeed(seed, 'ai-token', pending.id). */
export function drawToken(seed: string, pending: PendingDecision, legal: readonly Action[]): Action {
  const opts = legal.filter((a) => a.type === 'turn.ready')
  const pool = opts.length ? opts : legal
  return pool[Math.min(pool.length - 1, Math.floor(floatOf(seed, 'ai-token', pending.id) * pool.length))]!
}

/** What the decider remembers about one model's activation (the matrix cell is fixed for it, CH p10). */
interface ActMem {
  cell: ResolvedCell
  actionIndex: 0 | 1 | 'quick'
  intent: Intent | null
  decisions: number
  moveFailed: boolean
  /** The single Quick Action of this activation has been taken (CH p16). */
  quickTaken?: boolean
  settings: AiSettings | null
  /** Response performed and chain of the last planned Action, repeated on its follow-up decisions. */
  performed: AiDecisionLog['performed']
  chain: string[]
}

const MAX_DECISIONS_PER_ACTIVATION = 16

/** Build the official decider for one AI seat. Same seed and inputs -> same answers. */
export function createOfficialAiDecider(opts: OfficialAiOpts): OfficialAiDecider {
  const log: AiDecisionLog[] = []
  const cards: readonly AiCardDef[] = opts.cards ?? opts.bundle.records.ai
  const acts = new Map<string, ActMem>()
  const latched = new Map<ModelId, Set<number>>()
  const bundle = opts.bundle

  function decideSync(view0: PlayerView, pending: PendingDecision, legal: Action[]): OfficialDecision {
    if (legal.length === 0) throw new Error(`official ai: no legal actions for ${pending.id}`)
    const view = view0 as AiView
    const round = view.round ?? 1
    const draws: string[] = []
    const accepts = opts.accepts ? (a: Action) => opts.accepts!(a, view) : shimAccepts(view, bundle)
    const pickTie = (among: Id[], key: string): Id => {
      draws.push(key)
      const sorted = [...among].sort()
      return sorted[Math.min(sorted.length - 1, Math.floor(floatOf(opts.seed, key) * sorted.length))]!
    }
    const coin = (key: string): boolean => { draws.push(key); return floatOf(opts.seed, key) < 0.5 }

    const modelId = typeof pending.context.modelId === 'string' ? (pending.context.modelId as ModelId) : null
    const me: ModelState | undefined = modelId ? view.models[modelId] : undefined
    const entry: AiDecisionLog = {
      type: 'ai.decision', decisionId: pending.id, kind: pending.kind, round, modelId: me?.id ?? null, actionIndex: null,
      cell: null, settings: null, performed: null, chain: [], activity: 'default', draws,
    }
    let action: Action = legal[0]!
    let fallback = false

    try {
      switch (pending.kind) {
        case 'turn.ready': {
          action = drawToken(opts.seed, pending, legal)
          draws.push(`ai-token:${pending.id}`)
          entry.activity = 'turn.ready.draw'
          break
        }
        case 'turn.choose': {
          action = legal.find((a) => a.type === 'turn.useAll') ?? legal[0]!
          entry.activity = 'turn.useAll'
          break
        }
        case 'turn.pick': {
          const nums = aiNumbersOf(view, opts.seed)
          const sorted = [...legal].sort((a, b) => (nums[String(a.modelId)] ?? 1e9) - (nums[String(b.modelId)] ?? 1e9) || String(a.modelId).localeCompare(String(b.modelId)))
          action = sorted[0]!
          entry.modelId = String(action.modelId ?? '') || null
          entry.activity = 'turn.pick.lowestNumber'
          break
        }
        case 'react.offer': {
          action = legal.find((a) => a.type === 'react.pass') ?? legal[0]!
          entry.activity = 'react.pass'
          break
        }
        case 'shoot.luck': case 'throw.luck': case 'melee.luck': {
          // The engine offers Accurate, Dodge and Critical flips only; the AI spends Luck on Tough alone (CH p16).
          action = legal.find((a) => a.use === false) ?? legal[0]!
          entry.activity = 'luck.keep'
          break
        }
        case 'search.found': {
          action = legal.find((a) => a.type === 'search.keep') ?? legal[0]!
          entry.activity = 'search.keep'
          break
        }
        case 'item.choose': {
          action = [...legal].sort((a, b) => Number(a.index) - Number(b.index))[0]!
          entry.activity = 'item.firstBranch'
          break
        }
        case 'charge.marker': {
          const flip = coin(`ai-charge:${pending.id}`)
          action = legal.find((a) => a.colour === (flip ? 'green' : 'black')) ?? legal[0]!
          entry.activity = 'charge.marker.flip'
          break
        }
        case 'turn.activation':
        case 'move.path':
        case 'shoot.target':
        case 'throw.target':
        case 'battleCry.push':
        case 'battleCry.follow':
        case 'melee.slide': {
          if (!me) { entry.activity = 'default.noModel'; break }
          action = activationKinds(view, pending, legal, me, round, entry, accepts, pickTie, coin) ?? legal[0]!
          break
        }
        default:
          entry.activity = 'default.firstLegal'
      }
    } catch (e) {
      fallback = true
      entry.activity = `fallback.error:${e instanceof Error ? e.message.slice(0, 60) : 'error'}`
    }

    // Never return an illegal answer.
    const ok = isLegalShape(action, legal) && (action.path === undefined || accepts(action))
    if (!ok) {
      fallback = true
      action = safeFallback(pending, legal)
      entry.activity = `fallback.${entry.activity}`
    }
    void fallback
    log.push(entry)
    opts.onLog?.(entry)
    return { action: { ...action, aiLog: entry }, log: entry }
  }

  function safeFallback(pending: PendingDecision, legal: Action[]): Action {
    return legal.find((a) => a.type === 'move.cancel') ?? legal.find((a) => a.type === 'turn.end') ?? legal.find((a) => a.path === undefined) ?? legal[0]!
  }

  function memFor(view: AiView, round: number, me: ModelState, pending: PendingDecision, entry: AiDecisionLog): { mem: ActMem; card: AiCardDef; key: string } {
    const key = `${round}|${me.id}`
    const card = cardOfModel(cards, me)
    let mem = acts.get(key)
    if (!mem) {
      const face = blueFaceFor(opts.seed, round, me.id, blueFaces(bundle))
      entry.draws.push(`ai-blue:${round}:${me.id}`)
      const cell = resolveCell(card, me, face, view, bundle)
      mem = { cell, actionIndex: 0, intent: null, decisions: 0, moveFailed: false, settings: null, performed: null, chain: [] }
      acts.set(key, mem)
    }
    void pending
    return { mem, card, key }
  }

  function ctxFor(view: AiView, pending: PendingDecision, legal: Action[], me: ModelState, mem: ActMem, card: AiCardDef, accepts: (a: Action) => boolean, pickTie: (among: Id[], key: string) => Id, coin: (key: string) => boolean): ResponseCtx {
    const lat = latched.get(me.id) ?? new Set<number>()
    const { settings, active } = settingsWith(view, bundle, me, lat)
    for (const i of active) lat.add(i)
    latched.set(me.id, lat)
    mem.settings = settings
    const subject = resolveSubject(view, bundle, me, settings)
    return { view, bundle, pending, legal, me, card, cell: mem.cell, settings, subject, actionIndex: mem.actionIndex, accepts, pickTie, coin }
  }

  function activationKinds(
    view: AiView, pending: PendingDecision, legal: Action[], me: ModelState, round: number, entry: AiDecisionLog,
    accepts: (a: Action) => boolean, pickTie: (among: Id[], key: string) => Id, coin: (key: string) => boolean,
  ): Action | null {
    const { mem, card } = memFor(view, round, me, pending, entry)
    const q = qOf(view, bundle)
    void q
    entry.cell = mem.cell
    if (pending.kind === 'turn.activation') {
      const left = Number(pending.context.actionsLeft ?? 2)
      mem.actionIndex = left >= 2 ? 0 : left === 1 ? 1 : 'quick'
      entry.actionIndex = mem.actionIndex
      mem.decisions++
      const end = legal.find((a) => a.type === 'turn.end')
      const quickOptions = legal.filter((a) => a.quick === true)
      // Only a Heroic model with V.A.T.S. Action Points takes a Quick Action, after its two Actions (CH p16).
      if (mem.actionIndex === 'quick' && (mem.quickTaken || !(me.heroic && quickOptions.length))) { entry.activity = 'turn.end'; entry.chain = ['activation']; return end ?? null }
      if (mem.actionIndex === 'quick') mem.quickTaken = true // one Quick Action per activation, whatever the AP left (CH p16)
      if (mem.decisions > MAX_DECISIONS_PER_ACTIVATION && end) { entry.activity = 'turn.end.cap'; entry.chain = ['cap']; return end }
      const usable = mem.moveFailed ? legal.filter((a) => a.type !== 'move.go') : legal
      const ctx = ctxFor(view, pending, usable, me, mem, card, accepts, pickTie, coin)
      entry.settings = ctx.settings
      const planned = planAction(ctx)
      mem.intent = planned.intent ?? null
      mem.performed = planned.log.performed
      mem.chain = planned.log.chain
      entry.performed = planned.log.performed
      entry.chain = planned.log.chain
      entry.activity = planned.log.activity
      if (planned.log.weapon) entry.weapon = planned.log.weapon
      if (planned.log.target) entry.target = planned.log.target
      if (planned.log.ranking) entry.ranking = planned.log.ranking
      return planned.action
    }
    entry.actionIndex = mem.actionIndex
    entry.performed = mem.performed
    const ctx = ctxFor(view, pending, legal, me, mem, card, accepts, pickTie, coin)
    entry.settings = ctx.settings
    switch (pending.kind) {
      case 'move.path': {
        const to = legal.find((a) => a.type === 'move.to')
        const cancel = legal.find((a) => a.type === 'move.cancel')
        const intent = mem.intent
        const path = to && intent?.kind === 'move' ? pathFor(ctx, intent.req) : null
        if (to && path && accepts({ ...to, path })) { entry.activity = 'move.go'; entry.chain = [...mem.chain]; return { ...to, path } }
        mem.moveFailed = true
        entry.activity = 'move.cancel'; entry.chain = [...mem.chain, 'noPath']
        return cancel ?? null
      }
      case 'shoot.target': case 'throw.target': {
        const rows = legal.filter((a) => a.type === pending.kind)
        const intent = mem.intent
        const want = intent?.kind === 'shoot' ? intent : null
        const idOf = (a: Action): Id => String(a.targetMarkerId ?? a.targetId)
        let pool = want ? rows.filter((a) => idOf(a) === want.targetId) : []
        let ranking: TargetRanking | undefined
        if (!pool.length) {
          const models = [...new Set(rows.filter((a) => a.targetId !== undefined && a.targetMarkerId === undefined).map((a) => String(a.targetId)))]
            .map((id) => view.models[id]).filter((m): m is ModelState => !!m)
          if (models.length) {
            ranking = rankTargets(view, bundle, me, card, ctx.cell, models, 'shoot', ctx.subject.ids, pickTie)
            pool = rows.filter((a) => idOf(a) === ranking!.winner)
          }
          if (!pool.length) pool = rows
        }
        const pHit = (a: Action): number => {
          const t = (pending.context.targets as { targetId: Id; band: string; pHit: number }[] | undefined) ?? []
          return t.find((x) => x.targetId === idOf(a) && x.band === a.band)?.pHit ?? 0
        }
        const best = [...pool].sort((a, b) => pHit(b) - pHit(a) || (a.band === 'short' ? -1 : 1))[0]!
        entry.activity = 'shoot.target'; entry.chain = [...mem.chain]
        entry.target = { id: idOf(best), kind: best.targetMarkerId !== undefined ? 'marker' : 'model' }
        if (best.weaponUid) entry.weapon = String(best.weaponUid)
        if (ranking) entry.ranking = ranking
        return best
      }
      case 'battleCry.push': {
        // Always use Battle Cry and its Push Back (CH p11); the follow-up is the next decision.
        entry.activity = 'battleCry.push'; entry.chain = [...mem.chain]
        return legal.find((a) => a.push === true) ?? null
      }
      case 'battleCry.follow': {
        // CH p15 follow-up rule; after a Charge it is always yes. Declining bars a new base-contact attack (ERR p.16).
        const charged = Object.keys(ctx.me.tokens ?? {}).some((k) => k.startsWith('charged:'))
        const follow = followUpPushBack(ctx.cell.response, ctx.cell.method, ctx.cell.reckless, charged)
        entry.activity = follow ? 'battleCry.followUp' : 'battleCry.hold'; entry.chain = [...mem.chain]
        return legal.find((a) => a.follow === follow) ?? null
      }
      case 'melee.slide': {
        const a = slide(ctx)
        entry.activity = a.path ? 'melee.slide.away' : 'melee.slide.stay'; entry.chain = [...mem.chain]
        return a
      }
      default: return null
    }
  }

  return {
    log,
    decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
