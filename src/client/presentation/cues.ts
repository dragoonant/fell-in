// Presentation cues (FROZEN M3 client contract). Each beat the director plays carries exactly one Cue. The dice tray,
// figures, VFX, audio and the event feed subscribe to cues (contract: onCue / useCurrentBeat / useShownRoll / useFeed).
// Cues only restate what the engine already resolved (event payloads and before/after positions); no rules numbers.
import type { DiceRolled } from '../../engine/rng'
import type { EffectDieColour, GameEvent, ModelId, SeatId, Vec2 } from '../../engine/types'

/** An engine event with its 1-based index in GameState.events. */
export interface SeqEvent { seq: number; event: GameEvent }

/** skill = the d20 skill die; effect = a coloured d12 effect die; other = any plain roll (advantage, scatter, armor, luck). */
export type DieRole = 'skill' | 'effect' | 'other'

/** One die shown in the tray. Face meaning (value, icons) comes from contract.dieFace(), i.e. the edition dice table. */
export interface RolledDie {
  role: DieRole
  colour?: EffectDieColour
  sides: number
  /** 1-based face index rolled. */
  face: number
  /** Part of a reroll of an earlier die in the same test. */
  reroll: boolean
  rollId: string
}

export type BannerTone = 'round' | 'turn' | 'gameOver'

export type Cue =
  /** Big centred text: a new round, the turn passing to another seat, game over. */
  | { kind: 'banner'; tone: BannerTone; text: string; round: number; seat: SeatId | null; winner?: SeatId | null }
  /** A figure slides along `points` (first = start, last = engine end position). */
  | { kind: 'move'; modelId: ModelId; points: Vec2[] }
  /** One test or roll: the skill die plus its effect dice (and any rerolls), grouped by purpose. */
  | { kind: 'dice'; purpose: string; ownerId?: ModelId; dice: RolledDie[]; rolls: DiceRolled[] }
  /** An attack resolved (ns = attack namespace, e.g. 'shoot', 'melee', 'throw'). */
  | { kind: 'attack'; attackerId: ModelId; targetId: ModelId; weaponId: string; ns: string; success: boolean; critical: boolean; sv: number; result: unknown }
  /** Damage applied to a model (direct = not from an attack: fire, poison, falls, dangers). */
  | { kind: 'damage'; targetId: ModelId; attackerId?: ModelId; applied: number; removed: boolean; direct: boolean; reason?: string }
  | { kind: 'removed'; modelId: ModelId; reason: string }
  | { kind: 'condition'; modelId: ModelId; condition: string; added: boolean }
  | { kind: 'scatter'; from: Vec2; to: Vec2 }
  | { kind: 'luck'; who: string; lucky: boolean }
  /** Anything else the engine logged (battle cry, peek, item found, search empty, danger, ...). */
  | { kind: 'note'; event: GameEvent }

export type CueKind = Cue['kind']
export type CueOf<K extends CueKind> = Extract<Cue, { kind: K }>
