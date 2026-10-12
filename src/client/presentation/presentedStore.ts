// State AS OF THE ANIMATION CURSOR (spec 50 s1). Everything on screen renders from here; nothing shows a number ahead
// of its animation. The director is the only writer. Arrays are replaced, never mutated (selectors can return them).
import { create } from 'zustand'
import type { GameState, ModelId, Vec2 } from '../../engine/types'
import type { Cue, CueOf } from './cues'

export interface MoveTween { modelId: ModelId; points: Vec2[]; startedAt: number; durationMs: number }

/** The beat playing now. */
export interface ActiveBeat { id: number; cue: Cue; startedAt: number; durationMs: number; firstSeq: number; lastSeq: number }

/** A dice cue as shown in the tray (stays after its beat ends; still rolling while now < startedAt + durationMs). */
export interface ShownRoll { id: number; cue: CueOf<'dice'>; startedAt: number; durationMs: number }

/** A floating number/word over a model. */
export interface DamagePop { id: number; modelId: ModelId; text: string; tone: 'damage' | 'miss' | 'removed' | 'condition'; startedAt: number; durationMs: number }

/** One feed line per beat. */
export interface FeedEntry { id: number; seq: number; cue: Cue; text: string | null }

export const FEED_LIMIT = 500
export const DICE_LOG_LIMIT = 400

export interface PresentedState {
  /** Engine state at the animation cursor; null before a game exists. */
  state: GameState | null
  /** Seq (1-based index into GameState.events) of the last event shown. */
  cursor: number
  /** Nothing queued or playing. Prompts and the bot wait for this. */
  idle: boolean
  /** Playback paused (menu open). The bot watchdog still runs. */
  paused: boolean
  beat: ActiveBeat | null
  tweens: Record<ModelId, MoveTween>
  roll: ShownRoll | null
  pops: DamagePop[]
  diceLog: ShownRoll[]
  feed: FeedEntry[]
  /** Bumped on every presented change: demand-frameloop canvases invalidate on it. */
  rev: number
}

export const INITIAL_PRESENTED: PresentedState = {
  state: null, cursor: 0, idle: true, paused: false, beat: null, tweens: {}, roll: null, pops: [], diceLog: [], feed: [], rev: 0,
}

export const usePresentedStore = create<PresentedState>(() => ({ ...INITIAL_PRESENTED }))

export function isPresentationIdle(): boolean { return usePresentedStore.getState().idle }
