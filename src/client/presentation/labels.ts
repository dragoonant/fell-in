// Player-facing names and narration (our words). Names of units come from data records. gameStore sets the context.
import type { EditionBundle } from '../../data/types'
import type { GameEvent, GameState, ModelId, SeatId } from '../../engine/types'
import type { Cue } from './cues'

export type SeatControllerLabel = 'human' | 'bot'
interface LabelContext { bundle: EditionBundle | null; controllers: Record<SeatId, SeatControllerLabel>; seatOrder: SeatId[] }
let ctx: LabelContext = { bundle: null, controllers: {}, seatOrder: [] }

export function setLabelContext(c: Partial<LabelContext>): void { ctx = { ...ctx, ...c } }

/** "Player 1", "Player 2 (bot)". */
export function seatLabel(seat: SeatId | null | undefined): string {
  if (!seat) return 'Nobody'
  const i = ctx.seatOrder.indexOf(seat)
  const base = `Player ${i >= 0 ? i + 1 : seat}`
  return ctx.controllers[seat] === 'bot' ? `${base} (bot)` : base
}

/** Unit name for a model (data record name), falling back to its id. */
export function modelName(state: GameState | null, id: ModelId | null | undefined): string {
  if (!id) return 'someone'
  const m = state?.models[id]
  if (!m) return id
  const rec = ctx.bundle?.records.units.find((u) => u.id === m.profileId)
  return rec?.name ?? m.profileId
}

/** Record name for any data id (weapon, item, unit, ...). */
export function dataName(id: string | null | undefined): string {
  if (!id) return ''
  const b = ctx.bundle
  if (b) for (const list of Object.values(b.records)) {
    const r = (list as { id: string; name?: string }[]).find((x) => x.id === id)
    if (r?.name) return r.name
  }
  return id
}

/** One feed line per cue (null = nothing worth a line). */
export function narrate(state: GameState | null, cue: Cue): string | null {
  const n = (id: string | undefined) => modelName(state, id)
  switch (cue.kind) {
    case 'banner': return cue.text
    case 'move': return `${n(cue.modelId)} moves.`
    case 'dice': return null
    case 'attack': return `${n(cue.attackerId)} attacks ${n(cue.targetId)} with ${dataName(cue.weaponId)}: ${cue.critical ? 'a critical hit' : cue.success ? 'hit' : 'miss'}.`
    case 'damage':
      if (cue.applied <= 0) return `${n(cue.targetId)} shrugs it off.`
      return `${n(cue.targetId)} takes ${cue.applied} damage${cue.removed ? ' and is out of the fight' : ''}.`
    case 'removed': return `${n(cue.modelId)} is removed from the table.`
    case 'condition': return `${n(cue.modelId)} ${cue.added ? 'is now' : 'is no longer'} ${conditionWord(cue.condition)}.`
    case 'scatter': return 'The shot scatters.'
    case 'luck': return cue.lucky ? 'Luck holds.' : 'Luck runs out.'
    case 'note': return noteLine(state, cue.event)
  }
}

const CONDITION_WORDS: Record<string, string> = {
  frozen: 'frozen', injuredArm: 'nursing an injured arm', injuredLeg: 'limping on an injured leg', onFire: 'burning',
  poisoned: 'poisoned', slow: 'slowed', stunned: 'stunned',
}
export const conditionWord = (c: string): string => CONDITION_WORDS[c] ?? c

function noteLine(state: GameState | null, event: GameEvent): string | null {
  const ev = event as { type: string; [k: string]: unknown }
  const s = (k: string) => (typeof ev[k] === 'string' ? (ev[k] as string) : undefined)
  switch (ev.type) {
    case 'battleCry': return `Battle cry: ${ev.winner === 'charger' ? 'the charger wins' : ev.winner === 'defender' ? 'the defender holds' : 'nobody gives ground'}.`
    case 'itemFound': return `${modelName(state, s('modelId'))} finds ${dataName(s('defId'))}.`
    case 'searchEmpty': return `${modelName(state, s('modelId'))} searches and finds nothing.`
    case 'danger': return `${modelName(state, s('modelId'))} sets off a danger.`
    case 'peek': return `${seatLabel(s('seat'))} takes a look at a marker.`
    default: return null
  }
}

/** Roll purpose to a short label for the dice tray ("Shoot", "Armor", ...). */
export function rollLabel(purpose: string): string {
  const head = purpose.split(':')[0] ?? purpose
  const words: Record<string, string> = {
    shoot: 'Ranged attack', throw: 'Throw', melee: 'Close combat', battleCry: 'Battle cry', advantage: 'Advantage roll',
    armor: 'Armor', luck: 'Luck', search: 'Search', move: 'Move', climb: 'Climb', fall: 'Fall', scatter: 'Scatter',
  }
  return words[head] ?? head.charAt(0).toUpperCase() + head.slice(1)
}
