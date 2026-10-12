// Bot driver (KNOWLEDGE-BASE 1.4): answers bot-owned decisions through gameStore.dispatch, only while the presentation
// is idle, so a bot never acts over an animation the player has not seen. A watchdog force-answers when a bot decision
// has made no progress for WATCHDOG_MS, whatever the presentation is doing. Per-decision AI time budget: VITE_AI_MS.
import { view } from '../../engine/view'
import type { Action } from '../../engine/types'
import { skipAll } from '../presentation/director'
import { isPresentationIdle, usePresentedStore } from '../presentation/presentedStore'
import { dispatch, isBotDecision, legalFor, ownerSeat, preview, useGameStore } from '../store/gameStore'
import { scaled } from '../store/settingsStore'
import { completeAction, PARAMETERISED, randomBrain, type BotBrain, type BotContext } from './randomBot'

export const WATCHDOG_MS = 5000
/** Pause before a bot answers at speed 1 so a human can follow along (scaled by speed; 0 when instant). */
export const BOT_THINK_MS = 350
/** Per-decision AI budget (CI runners are slow): VITE_AI_MS, default 2000 ms. */
export const AI_MS: number = (() => {
  const v = Number((import.meta as { env?: Record<string, unknown> }).env?.VITE_AI_MS)
  return Number.isFinite(v) && v > 0 ? v : 2000
})()

let brain: BotBrain = randomBrain
/** Install the bot brain (M4 AI). null restores the random bot. */
export function setBotBrain(b: BotBrain | null): void { brain = b ?? randomBrain }

export interface BotDriverOptions {
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  watchdogMs?: number
  thinkMs?: number
  budgetMs?: number
}

export type TickResult = 'answered' | 'thinking' | 'forced' | 'waiting' | 'notBot' | 'paused'

export interface BotDriver {
  /** Try to answer the open bot decision now. */
  tick(): TickResult
  start(): void
  stop(): void
  /** Test hook: hold every bot answer (the watchdog too) until released. */
  setPaused(paused: boolean): void
  readonly running: boolean
  readonly paused: boolean
  /** Watchdog force-answers since creation. */
  readonly forced: number
}

function contextFor(seed: string, budgetMs: number): BotContext {
  return { seed, budgetMs, accepts: (a: Action) => preview(a).ok }
}

/** Synchronous fallback answer: the first non-parameterised legal option (or a filled template). */
function forcedAction(): Action | null {
  const s = useGameStore.getState()
  if (!s.state) return null
  const legal = legalFor(s.state)
  const seat = ownerSeat(s.state.pending, s)
  if (!legal.length || !seat) return null
  const pick = legal.find((a) => !PARAMETERISED.has(a.type)) ?? legal[0]!
  const p = s.state.pending
  const a = completeAction(view(s.state, seat), p, legal, pick, contextFor(s.seed, 0))
  return p.seat === 'all' ? { ...a, seat } : a
}

export function createBotDriver(opts: BotDriverOptions = {}): BotDriver {
  const now = opts.now ?? (() => Date.now())
  const setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const watchdogMs = opts.watchdogMs ?? WATCHDOG_MS
  const thinkMs = opts.thinkMs ?? BOT_THINK_MS
  const budgetMs = opts.budgetMs ?? AI_MS

  let seen: string | null = null
  let since = now()
  let forced = 0
  let running = false
  let paused = false
  let inflight: string | null = null
  let unsubs: (() => void)[] = []
  let tickTimer: unknown = null
  let dogTimer: unknown = null

  const decisionKey = () => {
    const s = useGameStore.getState()
    return s.state ? `${s.version}:${s.state.pending.id}` : null
  }
  function note(): void { const k = decisionKey(); if (k !== seen) { seen = k; since = now() } }

  function force(): boolean {
    const a = forcedAction()
    if (!a) return false
    forced++
    skipAll()
    return dispatch(a, 'watchdog') === null
  }

  /** Ask the brain (async, budgeted); the answer is dispatched only if the same decision is still open. */
  function think(): void {
    const s = useGameStore.getState()
    if (!s.state) return
    const key = decisionKey()!
    const p = s.state.pending
    const seat = ownerSeat(p, s)!
    const legal = legalFor(s.state)
    inflight = key
    const ctx = contextFor(s.seed, budgetMs)
    const timeout = new Promise<null>((res) => { setT(() => res(null), budgetMs) })
    Promise.race([Promise.resolve().then(() => brain(view(s.state!, seat), p, legal, ctx)), timeout])
      .catch(() => null)
      .then((a) => {
        if (inflight === key) inflight = null
        if (!running || paused || decisionKey() !== key || !isBotDecision()) return
        const answer = a ? (p.seat === 'all' ? { ...a, seat } : a) : null
        if (!answer || dispatch(answer, 'bot') !== null) force()
      })
  }

  function tick(): TickResult {
    note()
    const s = useGameStore.getState()
    if (!isBotDecision(s)) return 'notBot'
    if (paused) return 'paused'
    const key = decisionKey()
    if (now() - since >= watchdogMs) { inflight = null; return force() ? 'forced' : 'waiting' }
    if (inflight === key) return 'thinking'
    if (!isPresentationIdle()) return 'waiting'
    think()
    return inflight === key ? 'thinking' : 'answered'
  }

  function schedule(): void {
    if (!running || paused || tickTimer !== null) return
    if (!isBotDecision() || !isPresentationIdle() || inflight === decisionKey()) return
    const ms = scaled(thinkMs)
    tickTimer = setT(() => { tickTimer = null; if (running) { tick(); schedule() } }, ms)
  }

  function armWatchdog(): void {
    if (dogTimer !== null) clearT(dogTimer)
    dogTimer = null
    if (!running || paused) return
    note()
    if (!isBotDecision()) return
    const left = Math.max(0, since + watchdogMs - now())
    dogTimer = setT(() => { dogTimer = null; if (running) { tick(); schedule(); armWatchdog() } }, left + 1)
  }

  return {
    tick,
    start() {
      if (running) return
      running = true
      note()
      unsubs = [
        useGameStore.subscribe((s, prev) => { if (s.state !== prev.state || s.controllers !== prev.controllers) { schedule(); armWatchdog() } }),
        usePresentedStore.subscribe((s, prev) => { if (s.idle && !prev.idle) schedule() }),
      ]
      schedule()
      armWatchdog()
    },
    stop() {
      running = false
      inflight = null
      for (const u of unsubs) u()
      unsubs = []
      if (tickTimer !== null) clearT(tickTimer)
      if (dogTimer !== null) clearT(dogTimer)
      tickTimer = null
      dogTimer = null
    },
    setPaused(p: boolean) {
      if (paused === p) return
      paused = p
      if (!p) { since = now(); schedule(); armWatchdog() }
      else if (dogTimer !== null) { clearT(dogTimer); dogTimer = null }
    },
    get running() { return running },
    get paused() { return paused },
    get forced() { return forced },
  }
}

let appDriver: BotDriver | null = null
/** The app's single driver (started by bootClient). */
export function getBotDriver(): BotDriver { return (appDriver ??= createBotDriver()) }
export function startBotDriver(): BotDriver { const d = getBotDriver(); d.start(); return d }
