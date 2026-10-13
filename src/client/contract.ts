// FROZEN client contract (M3). Board, figures, interaction, HUD and dice code import ONLY from here (plus engine/data
// types). The start screen is the exception: it stays in the start chunk and imports store/launch.ts and
// store/settingsStore.ts. Additive changes only; log them at the bottom of this file.
//
// Rules for callers:
//  - Render from the PRESENTED state (usePresented*), never the true state: it trails the animations.
//  - Never compute a rules number. Odds, range band, cover, damage, LOS and distances come from the query* helpers,
//    pending.context / pending.options, or cue payloads. Ruler colours come from rulerColours()/colourFor().
//  - Answer decisions only through game.submit / game.answer / game.choose / game.pass.
//  - Selectors return stable references, so they are safe as React hooks.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Colour, DieColour, EditionBundle } from '../data/types'
import * as dice from '../engine/dice'
import * as edition from '../engine/edition'
import { losVerdict } from '../engine/los'
import { distanceBetween } from '../engine/measure'
import * as query from '../engine/query'
import type { ObjectiveStatus } from '../engine/scenarios/status'
import { view as playerView } from '../engine/view'
import type { AttackOpts, CoverInfo, DamageOdds, HitOdds, RangeInfo } from '../engine/query'
import type { Action, GameResult, GameState, LosVerdict, ModelId, ModelState, PendingDecision, SeatId, Vec2 } from '../engine/types'
import { getBotDriver, setBotBrain, startBotDriver } from './bot/botDriver'
import type { BotBrain, BotContext } from './bot/randomBot'
import type { Params } from './params'
import { useAnnounceStore, type Banner, type NarrationLine } from './presentation/announceStore'
import type { BannerTone, Cue, CueKind, CueOf, DieRole, RolledDie, SeqEvent } from './presentation/cues'
import { directorNow, onCue, setPaused, skipAll, skipBeat, type CueListener } from './presentation/director'
import { conditionWord, dataName, modelName, narrate, rollLabel, seatLabel } from './presentation/labels'
import { usePresentedStore, type ActiveBeat, type DamagePop, type FeedEntry, type MoveTween, type ShownRoll } from './presentation/presentedStore'
import {
  actionFor, clearRejection, deleteAutosave, dispatch, installAutosave, isHotSeat, isHumanDecision, legalFor, loadAutosave,
  newGame, ownerSeat, preview, saveGame, setController, useGameStore,
  type ClientRejection, type GameStoreState, type NewGameOptions, type SeatController,
} from './store/gameStore'
import { backToMenu, hasAutosave, type Launch } from './store/launch'
import { SPEED_PRESETS, useSettingsStore, type Settings } from './store/settingsStore'
import { installTestHooks, type GameTestApi } from './store/testHooks'

// ---------- types callers need ----------
export type {
  ActiveBeat, AttackOpts, Banner, BannerTone, BotBrain, BotContext, ClientRejection, CoverInfo, Cue, CueKind, CueListener, CueOf,
  DamageOdds, DamagePop, DieRole, FeedEntry, GameTestApi, HitOdds, MoveTween, NarrationLine, NewGameOptions, RangeInfo,
  RolledDie, SeatController, SeqEvent, Settings, ShownRoll,
}
export { SPEED_PRESETS }

// =====================================================================================================
// Presented state (render from these)
// =====================================================================================================
/** Engine state as of the animation cursor; null before a game. */
export const usePresented = (): GameState | null => usePresentedStore((s) => s.state)
/** One model as presented (its END position while a tween plays: use useTween/tweenPosition). */
export const usePresentedModel = (id: ModelId | null | undefined): ModelState | undefined =>
  usePresentedStore((s) => (id ? s.state?.models[id] : undefined))
/** All models as presented. */
export const usePresentedModels = (): Record<ModelId, ModelState> | null => usePresentedStore((s) => s.state?.models ?? null)
/** Every model id in the presented state (shallow-stable). */
export const useModelIds = (): ModelId[] => usePresentedStore(useShallow((s) => (s.state ? Object.keys(s.state.models) : [])))
/** Round and the seat whose turn it is, as presented. */
export const usePresentedTurn = (): { round: number; seat: SeatId | null; phase: GameState['phase'] | null } =>
  usePresentedStore(useShallow((s) => ({ round: s.state?.round ?? 0, seat: s.state?.turn?.seat ?? null, phase: s.state?.phase ?? null })))
/** Game result once the presented state reaches the end, else null. */
export const useGameResult = (): GameResult | null => usePresentedStore((s) => (s.state?.phase === 'over' ? s.state.result : null))

/** Active move tween for a model, if any. */
export const useTween = (id: ModelId): MoveTween | undefined => usePresentedStore((s) => s.tweens[id])
export const useTweens = (): Record<ModelId, MoveTween> => usePresentedStore((s) => s.tweens)
/** Where a tweening figure is at `now` (directorNow()), eased along its path. Display only. */
export function tweenPosition(t: MoveTween, now = directorNow()): Vec2 {
  const f = t.durationMs > 0 ? Math.min(1, Math.max(0, (now - t.startedAt) / t.durationMs)) : 1
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2
  return pointAlong(t.points, e)
}
/** Point at fraction f (0..1) of a polyline's length. */
export function pointAlong(pts: readonly Vec2[], f: number): Vec2 {
  if (pts.length === 0) return { x: 0, z: 0 }
  if (pts.length === 1 || f <= 0) return pts[0]!
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.z - pts[i]!.z))
  let left = seg.reduce((a, b) => a + b, 0) * Math.min(1, f)
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]! || i === seg.length - 1) {
      const t = seg[i]! > 0 ? Math.min(1, left / seg[i]!) : 1
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, z: pts[i]!.z + (pts[i + 1]!.z - pts[i]!.z) * t }
    }
    left -= seg[i]!
  }
  return pts[pts.length - 1]!
}
/** Clock beats, tweens, pops and banners are timed against. */
export { directorNow }
/** True while a beat plays or a tween runs (keep invalidating a demand canvas). */
export const useAnimating = (): boolean => usePresentedStore((s) => s.beat !== null || Object.keys(s.tweens).length > 0)
/** Nothing queued or playing. */
export const usePresentationIdle = (): boolean => usePresentedStore((s) => s.idle)
export const usePresentationPaused = (): boolean => usePresentedStore((s) => s.paused)
/** The beat playing now (with its cue), or null. */
export const useCurrentBeat = (): ActiveBeat | null => usePresentedStore((s) => s.beat)
/** Last dice cue shown in the tray (still rolling while directorNow() < startedAt + durationMs). */
export const useShownRoll = (): ShownRoll | null => usePresentedStore((s) => s.roll)
/** Every dice cue shown this game, oldest first. */
export const useDiceLog = (): ShownRoll[] => usePresentedStore((s) => s.diceLog)
/** Floating pops; drop each after startedAt + durationMs. */
export const useDamagePops = (): DamagePop[] => usePresentedStore((s) => s.pops)
/** One entry per beat shown (cue + our-words text), oldest first. */
export const useFeed = (): FeedEntry[] => usePresentedStore((s) => s.feed)
/** Bumps on every presented change (demand frameloop invalidation). */
export const usePresentedRev = (): number => usePresentedStore((s) => s.rev)
/** Big centred banner, or null. */
export const useBanner = (): Banner | null => useAnnounceStore((s) => s.banner)
/** Narration lines, oldest first. */
export const useNarration = (): NarrationLine[] => useAnnounceStore((s) => s.lines)
/** Subscribe to every cue as its beat starts (dice tray, VFX, audio). Returns an unsubscribe. */
export { onCue }

// =====================================================================================================
// Decisions (a prompt opens only when the presentation is idle: it never refers to an unseen event)
// =====================================================================================================
const promptOf = (g: GameStoreState, idle: boolean): PendingDecision | null => (idle && isHumanDecision(g) ? g.state!.pending : null)
/** The open decision when a human answers it AND the presentation is idle; else null. */
export function usePending(): PendingDecision | null {
  const idle = usePresentedStore((s) => s.idle)
  return useGameStore((g) => promptOf(g, idle))
}
const EMPTY: Action[] = []
/** Legal answers for usePending() (option templates; parameterised ones such as move.to need extra fields). */
export function usePendingLegal(): Action[] {
  const p = usePending()
  const state = useGameStore((g) => g.state)
  return p && state ? legalFor(state) : EMPTY
}
/** The true open decision whoever owns it (for "the bot is thinking" and spectators). */
export const useOpenDecision = (): PendingDecision | null => useGameStore((g) => (g.state && g.state.phase !== 'over' ? g.state.pending : null))
/** Who answers the open decision. Hot-seat: show `label` ("Player 2") so the right person takes the mouse. */
export function useWaitingFor(): { seat: SeatId; controller: SeatController; label: string; hotSeat: boolean } | null {
  return useGameStore(useShallow((g) => {
    if (!g.state || g.state.phase === 'over') return null
    const seat = ownerSeat(g.state.pending, g)
    if (!seat) return null
    return { seat, controller: g.controllers[seat] ?? 'bot', label: seatLabel(seat), hotSeat: isHotSeat(g) }
  }))
}
/** Overview of the running game (true state). */
export function useGame(): { state: GameState | null; controllers: Record<SeatId, SeatController>; seatOrder: SeatId[]; hotSeat: boolean; version: number; seed: string; scenarioId: string | null } {
  return useGameStore(useShallow((g) => ({ state: g.state, controllers: g.controllers, seatOrder: g.seatOrder, hotSeat: isHotSeat(g), version: g.version, seed: g.seed, scenarioId: g.scenarioId })))
}
export const useHasGame = (): boolean => useGameStore((g) => g.state !== null)
export const useControllers = (): Record<SeatId, SeatController> => useGameStore((g) => g.controllers)
/** Last rejection (our words in .text, the engine's in .detail); cleared by the next accepted step. */
export const useRejection = (): ClientRejection | null => useGameStore((g) => g.lastRejection)
/** Engine crashed (bug): show a recovery prompt. */
export const useFatal = (): string | null => useGameStore((g) => g.fatal)
/** The data bundle the game runs on (records for names, cards, weapon stats). */
export const useBundle = (): EditionBundle | null => useGameStore((g) => g.bundle)
export const getBundle = (): EditionBundle | null => useGameStore.getState().bundle

// =====================================================================================================
// Commands
// =====================================================================================================
export const game = {
  /** Start a new game. Returns a rejection or null. */
  newGame: (opts: NewGameOptions = {}): ClientRejection | null => newGame(opts),
  /** Submit a full Action as a human (refused when the open decision is a bot's). */
  submit: (a: Action): ClientRejection | null => dispatch(a, 'human'),
  /** Submit a payload for the open decision; decisionId and seat are filled in. E.g. answer({ ...opt.action, path }). */
  answer(payload: { type: string; [k: string]: unknown }): ClientRejection | null {
    const a = actionFor(payload)
    return a ? dispatch(a, 'human') : null
  },
  /** Pick one of pending.options by id (non-parameterised options). */
  choose(optionId: string): ClientRejection | null {
    const opt = useGameStore.getState().state?.pending.options.find((o) => o.id === optionId)
    return opt ? dispatch(opt.action, 'human') : null
  },
  /** Pass the open decision when it offers a 'pass' option. */
  pass(): ClientRejection | null {
    const opt = useGameStore.getState().state?.pending.options.find((o) => o.action.type === 'pass' || o.id === 'pass')
    return opt ? dispatch(opt.action, 'human') : null
  },
  /** Legal answers for the true open decision (cached per state). */
  legal: (): Action[] => legalFor(useGameStore.getState().state),
  /** Dry run (no commit): would the engine accept this, and with what result state? For drag previews. */
  preview,
  clearRejection,
  setController,
  /** Save now to the autosave slot. */
  save: () => saveGame(),
  /** Resume the autosave (replays its log). */
  continue: loadAutosave,
  hasAutosave,
  deleteAutosave,
  /** Back to the start screen. */
  backToMenu,
}

export const presentation = {
  /** Skip the beat now playing (bootClient already wires any pointerdown). */
  skip: skipBeat,
  skipAll,
  setPaused,
  /** 0 instant, 0.5 slow, 1 normal, 3 fast (SPEED_PRESETS). */
  setSpeed: (speed: number) => useSettingsStore.getState().set({ speed }),
}

export const useSettings = (): Settings => useSettingsStore(useShallow((s) => ({ speed: s.speed, narration: s.narration })))
export const settings = { set: (patch: Partial<Settings>) => useSettingsStore.getState().set(patch) }

export const bots = {
  /** Install the bot brain (M4 AI); null restores the random bot. */
  setBrain: setBotBrain,
  setPaused: (p: boolean) => getBotDriver().setPaused(p),
}

// =====================================================================================================
// Engine queries (bound to the TRUE state; prompts and tools run only while idle, when true == presented)
// =====================================================================================================
const truth = (): { s: GameState; b: EditionBundle } | null => {
  const g = useGameStore.getState()
  return g.state && g.bundle ? { s: g.state, b: g.bundle } : null
}
export const queryHitOdds = (attacker: ModelId, target: ModelId, opts?: AttackOpts): HitOdds | null => { const t = truth(); return t ? query.hitOdds(t.s, t.b, attacker, target, opts) : null }
export const queryRangeBand = (attacker: ModelId, target: ModelId, weaponUid?: string): RangeInfo | null => { const t = truth(); return t ? query.rangeBand(t.s, t.b, attacker, target, weaponUid) : null }
export const queryCover = (attacker: ModelId, target: ModelId): CoverInfo | null => { const t = truth(); return t ? query.coverFor(t.s, t.b, attacker, target) : null }
export const queryExpectedDamage = (attacker: ModelId, target: ModelId, opts?: AttackOpts): DamageOdds | null => { const t = truth(); return t ? query.expectedDamage(t.s, t.b, attacker, target, opts) : null }
export const queryKillOdds = (attacker: ModelId, target: ModelId, opts?: AttackOpts): number | null => { const t = truth(); return t ? query.killOdds(t.s, t.b, attacker, target, opts) : null }
export const queryLos = (viewer: ModelId, target: ModelId): LosVerdict | null => { const t = truth(); return t ? losVerdict(t.s, viewer, target) : null }
/** Base-edge distance in inches between two models. */
export const queryDistance = (a: ModelId, b: ModelId): number => { const t = truth(); return t ? distanceBetween(t.s, a, b) : NaN }
/** Edition ruler colours, shortest first; their lengths; the shortest ruler covering a distance. */
export const rulerColours = (): Colour[] => { const b = getBundle(); return b ? edition.rulerColours(b) : [] }
export const rulerInches = (c: Colour): number => { const b = getBundle(); return b ? edition.rulerInches(b, c) : NaN }
export const colourFor = (inches: number): Colour | null => { const b = getBundle(); return b ? edition.colourFor(b, inches) : null }
/** Face meaning from the edition dice table (dice tray). */
export const skillDieFace = (face: number) => { const b = getBundle(); return b ? dice.skillFace(b, face) : null }
export const effectDieFace = (colour: DieColour, face: number) => { const b = getBundle(); return b ? dice.effectFace(b, colour, face) : null }

/**
 * Memoised query hook, recomputed when the true state changes or deps change:
 *   const odds = useQuery((s, b) => query.hitOdds(s, b, a, t), [a, t])
 * Prefer the named hooks below.
 */
export function useQuery<T>(fn: (state: GameState, bundle: EditionBundle) => T, deps: readonly unknown[]): T | null {
  const state = useGameStore((g) => g.state)
  const bundle = useGameStore((g) => g.bundle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (state && bundle ? fn(state, bundle) : null), [state, bundle, ...deps])
}
export const useHitOdds = (a: ModelId | null, t: ModelId | null, opts?: AttackOpts) =>
  useQuery((s, b) => (a && t ? query.hitOdds(s, b, a, t, opts) : null), [a, t, opts?.weaponUid, opts?.band, opts?.quick, opts?.reaction])
export const useExpectedDamage = (a: ModelId | null, t: ModelId | null, opts?: AttackOpts) =>
  useQuery((s, b) => (a && t ? query.expectedDamage(s, b, a, t, opts) : null), [a, t, opts?.weaponUid, opts?.band, opts?.quick, opts?.reaction])
export const useKillOdds = (a: ModelId | null, t: ModelId | null, opts?: AttackOpts) =>
  useQuery((s, b) => (a && t ? query.killOdds(s, b, a, t, opts) : null), [a, t, opts?.weaponUid, opts?.band, opts?.quick, opts?.reaction])
export const useRangeBand = (a: ModelId | null, t: ModelId | null, weaponUid?: string) =>
  useQuery((s, b) => (a && t ? query.rangeBand(s, b, a, t, weaponUid) : null), [a, t, weaponUid])
export const useCover = (a: ModelId | null, t: ModelId | null) => useQuery((s, b) => (a && t ? query.coverFor(s, b, a, t) : null), [a, t])
export const useLos = (a: ModelId | null, t: ModelId | null) => useQuery((s) => (a && t ? losVerdict(s, a, t) : null), [a, t])

/** Scenario objectives (lines + marker positions) as the first human seat sees them; null when the scenario has none. */
export function useObjectiveStatus(): ObjectiveStatus | null {
  const state = usePresented()
  const seatOrder = useGameStore((g) => g.seatOrder)
  const controllers = useGameStore((g) => g.controllers)
  return useMemo(() => {
    if (!state) return null
    const seat = seatOrder.find((x) => controllers[x] === 'human') ?? seatOrder[0]
    return seat ? query.objectiveStatus(playerView(state, seat)) : null
  }, [state, seatOrder, controllers])
}

// ---------- labels (our words; names from data) ----------
export { conditionWord, dataName, modelName, narrate, rollLabel, seatLabel }

// =====================================================================================================
// Boot
// =====================================================================================================
let booted: (() => void) | null = null
/**
 * Call once from GameScreen (idempotent): applies ?speed for this session, starts the bot driver, autosave per round,
 * click-to-skip and, with ?test=1, window.__game. Returns a teardown.
 */
export function bootClient(params: Params): () => void {
  if (booted) return booted
  if (params.speed !== null) useSettingsStore.getState().set({ speed: params.speed }, false)
  const offs: (() => void)[] = []
  const d = startBotDriver()
  offs.push(() => d.stop())
  offs.push(installAutosave())
  if (typeof window !== 'undefined') {
    const onDown = () => { if (!usePresentedStore.getState().idle) skipBeat() }
    window.addEventListener('pointerdown', onDown, { capture: true })
    offs.push(() => window.removeEventListener('pointerdown', onDown, { capture: true }))
  }
  installTestHooks(params)
  booted = () => { for (const f of offs) f(); booted = null }
  return booted
}

/** Start the game a launch asks for: a new game, or the autosave (falls back to a new game if it will not load). */
export function startLaunch(launch: Launch, params: Params): ClientRejection | null {
  if (launch.mode === 'continue') {
    const r = loadAutosave()
    if (!r) return null
    deleteAutosave()
    return newGame({ seats: params.seats })
  }
  return newGame(launch.opts)
}

// Additive changes after the M3 freeze:
//  - useGame() also returns scenarioId (Play again keeps the scenario).
//  - useObjectiveStatus(): objectiveStatus for the first human seat's view of the presented state (briefing tracker, scene labels).
