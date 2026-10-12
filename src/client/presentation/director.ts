// Presentation director (spec 50 s1): plays each accepted engine step as timed beats and moves the presented state
// along with them. The engine already resolved everything; this only paces what the player sees.
//   gameStore -> enqueueBatch() -> buildBeats (beats.ts) -> presentedStore / announceStore / cue listeners
// Speed comes from settingsStore (0 = instant: batches drain synchronously). Any click skips the current beat.
import type { Action, GameState } from '../../engine/types'
import { getSettings, scaled } from '../store/settingsStore'
import { addNarration, clearBanner, resetAnnouncements, showBanner, type NarrationLine } from './announceStore'
import { buildBeats, type Beat } from './beats'
import type { Cue, SeqEvent } from './cues'
import { narrate } from './labels'
import {
  DICE_LOG_LIMIT, FEED_LIMIT, INITIAL_PRESENTED, usePresentedStore,
  type ActiveBeat, type DamagePop, type FeedEntry, type MoveTween, type PresentedState, type ShownRoll,
} from './presentedStore'

/** One accepted engine step. `before`/`after` are the true engine states around it. */
export interface Batch { before: GameState; after: GameState; events: SeqEvent[]; action: Action | null }

export interface DirectorClock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void }
const realClock: DirectorClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}
let clock: DirectorClock = realClock
/** Tests: replace the clock (null restores the real one). Tweens and pops are timed against it too. */
export function setDirectorClock(c: DirectorClock | null): void { clock = c ?? realClock }
export function directorNow(): number { return clock.now() }

// ---------- cue listeners ----------
export type CueListener = (cue: Cue, beat: ActiveBeat) => void
const listeners = new Set<CueListener>()
/** Subscribe to every beat as it starts (durationMs 0 when skipped or instant). Returns an unsubscribe. */
export function onCue(fn: CueListener): () => void { listeners.add(fn); return () => { listeners.delete(fn) } }

// ---------- internals ----------
interface Current { batch: Batch; beats: Beat[]; index: number; state: GameState }
const queue: Batch[] = []
let cur: Current | null = null
let timer: unknown = null
let timerBeat: Beat | null = null
let fastForward = false
let pumping = false
let seq = 0

interface Draft { patch: Partial<PresentedState>; feed: FeedEntry[]; dice: ShownRoll[]; lines: NarrationLine[] }
let draft: Draft = { patch: {}, feed: [], dice: [], lines: [] }

function commit(): void {
  const d = draft
  draft = { patch: {}, feed: [], dice: [], lines: [] }
  if (d.lines.length) addNarration(d.lines)
  if (!Object.keys(d.patch).length && !d.feed.length && !d.dice.length) return
  usePresentedStore.setState((s) => ({
    ...d.patch,
    feed: d.feed.length ? [...s.feed, ...d.feed].slice(-FEED_LIMIT) : s.feed,
    diceLog: d.dice.length ? [...s.diceLog, ...d.dice].slice(-DICE_LOG_LIMIT) : s.diceLog,
    rev: s.rev + 1,
  }))
}
function peek<K extends keyof PresentedState>(k: K): PresentedState[K] {
  return (k in draft.patch ? draft.patch[k] : usePresentedStore.getState()[k]) as PresentedState[K]
}

const lastSeqOf = (b: Beat) => (b.events.length ? b.events[b.events.length - 1]!.seq : peek('cursor'))

function applyPatch(beat: Beat): void {
  if (!cur) return
  if (beat.patch) { cur.state = beat.patch(cur.state); draft.patch.state = cur.state }
  draft.patch.cursor = Math.max(peek('cursor'), lastSeqOf(beat))
}

function popsFor(cue: Cue): Omit<DamagePop, 'id' | 'startedAt' | 'durationMs'>[] {
  switch (cue.kind) {
    case 'damage': return [{ modelId: cue.targetId, text: cue.applied > 0 ? `-${cue.applied}` : 'No damage', tone: cue.applied > 0 ? 'damage' : 'miss' }]
    case 'attack': return cue.success ? [] : [{ modelId: cue.targetId, text: 'Miss', tone: 'miss' }]
    case 'removed': return [{ modelId: cue.modelId, text: 'Out', tone: 'removed' }]
    case 'condition': return cue.added ? [{ modelId: cue.modelId, text: cue.condition, tone: 'condition' }] : []
    default: return []
  }
}

function startBeat(beat: Beat, dur: number): void {
  if (!cur) return
  const now = clock.now()
  const id = ++seq
  const active: ActiveBeat = { id, cue: beat.cue, startedAt: now, durationMs: dur, firstSeq: beat.events[0]?.seq ?? peek('cursor'), lastSeq: lastSeqOf(beat) }
  const text = narrate(cur.state, beat.cue)
  draft.feed.push({ id, seq: active.lastSeq, cue: beat.cue, text })
  if (text && getSettings().narration) draft.lines.push({ seq: active.lastSeq, text })
  if (beat.applyAt === 'start') applyPatch(beat)
  if (beat.cue.kind === 'dice') {
    const shown: ShownRoll = { id, cue: beat.cue, startedAt: now, durationMs: dur }
    draft.patch.roll = shown
    draft.dice.push(shown)
  }
  if (dur > 0) {
    if (beat.cue.kind === 'move') {
      const t: MoveTween = { modelId: beat.cue.modelId, points: beat.cue.points, startedAt: now, durationMs: dur }
      draft.patch.tweens = { ...peek('tweens'), [t.modelId]: t }
    }
    const pops = popsFor(beat.cue)
    if (pops.length) {
      const live = peek('pops').filter((p) => now < p.startedAt + p.durationMs)
      draft.patch.pops = [...live, ...pops.map((p) => ({ ...p, id: ++seq, startedAt: now, durationMs: Math.max(dur, 900) }))]
    }
    if (beat.cue.kind === 'banner') showBanner(beat.cue.text, beat.cue.tone, now, dur)
    draft.patch.beat = active
  }
  for (const fn of listeners) { try { fn(beat.cue, active) } catch { /* a listener never stops the show */ } }
}

function endBeat(beat: Beat): void {
  if (beat.applyAt === 'end') applyPatch(beat)
  if (beat.cue.kind === 'move' && peek('tweens')[beat.cue.modelId]) {
    const next = { ...peek('tweens') }
    delete next[beat.cue.modelId]
    draft.patch.tweens = next
  }
  if (beat.cue.kind === 'banner') clearBanner()
  if (peek('beat')) draft.patch.beat = null
}

function finishBatch(): void {
  if (!cur) return
  // snap to the true engine state: once a batch is shown the presented state never disagrees
  draft.patch.state = cur.batch.after
  draft.patch.cursor = Math.max(peek('cursor'), cur.batch.after.events.length)
  cur = null
}

function pump(): void {
  if (pumping) return
  pumping = true
  try {
    for (;;) {
      if (timer !== null || peek('paused')) break
      if (!cur) {
        const b = queue.shift()
        if (!b) {
          fastForward = false
          if (!peek('idle')) draft.patch.idle = true
          if (Object.keys(peek('tweens')).length) draft.patch.tweens = {}
          break
        }
        cur = { batch: b, beats: buildBeats(b.before, b.after, b.events, b.action), index: 0, state: peek('state') ?? b.before }
      }
      if (cur.index >= cur.beats.length) { finishBatch(); continue }
      const beat = cur.beats[cur.index]!
      const dur = fastForward ? 0 : scaled(beat.baseMs)
      startBeat(beat, dur)
      if (dur > 0) {
        timerBeat = beat
        timer = clock.setTimeout(() => {
          timer = null; timerBeat = null
          endBeat(beat)
          if (cur) cur.index++
          pump()
        }, dur)
        break
      }
      endBeat(beat)
      cur.index++
    }
  } finally {
    pumping = false
    commit()
  }
}

// ---------- public API ----------
/** gameStore: queue one accepted step for presentation. */
export function enqueueBatch(batch: Batch): void {
  queue.push(batch)
  if (peek('idle')) draft.patch.idle = false
  pump()
}
/** Skip the beat now playing (wired to any pointerdown by bootClient). */
export function skipBeat(): void {
  if (timer === null || !timerBeat) return
  clock.clearTimeout(timer)
  const beat = timerBeat
  timer = null; timerBeat = null
  endBeat(beat)
  if (cur) cur.index++
  pump()
}
/** Show everything queued at once (feed and dice log still get every entry). */
export function skipAll(): void {
  fastForward = true
  if (timer !== null) skipBeat()
  else pump()
}
export function setPaused(paused: boolean): void {
  if (peek('paused') === paused) return
  draft.patch.paused = paused
  commit()
  if (!paused) pump()
}
/** New game or load: drop everything queued and present `state` with no animation. */
export function resetPresentation(state: GameState | null): void {
  if (timer !== null) clock.clearTimeout(timer)
  timer = null; timerBeat = null
  queue.length = 0
  cur = null
  fastForward = false
  draft = { patch: {}, feed: [], dice: [], lines: [] }
  resetAnnouncements()
  const prev = usePresentedStore.getState()
  usePresentedStore.setState({ ...INITIAL_PRESENTED, paused: prev.paused, state, cursor: state?.events.length ?? 0, rev: prev.rev + 1 })
}
/** Batches waiting plus the one playing (diagnostics). */
export function queuedBatches(): number { return queue.length + (cur ? 1 : 0) }
