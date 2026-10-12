// Engine step -> timed beats. Pure. A beat carries one Cue, the events it shows, a base duration (scaled by speed) and
// an optional display patch that advances the presented state. Patches only copy engine results (after-state fields
// or event payloads); anything else waits for the batch-end snap to the true state, so the screen lags but never lies.
import type { DiceRolled } from '../../engine/rng'
import type { Action, EffectDieColour, GameState, ModelId, ModelState, Vec2 } from '../../engine/types'
import type { Cue, RolledDie, SeqEvent } from './cues'
import { seatLabel } from './labels'

export interface Beat {
  cue: Cue
  baseMs: number
  events: SeqEvent[]
  /** Display patch applied when the beat starts (moves apply at the end, after the tween). */
  patch?: (s: GameState) => GameState
  applyAt: 'start' | 'end'
}

export const BEAT_MS = {
  round: 1600, turn: 900, gameOver: 2400, moveBase: 420, movePerInch: 70, moveMax: 1600, dice: 1200, attack: 450,
  damage: 750, removed: 800, condition: 500, scatter: 700, luck: 700, note: 350,
} as const

const COLOURS: readonly EffectDieColour[] = ['black', 'green', 'yellow', 'blue']

function withModel(s: GameState, id: ModelId, f: (m: ModelState) => ModelState): GameState {
  const m = s.models[id]
  return m ? { ...s, models: { ...s.models, [id]: f(m) } } : s
}
/** Copy the engine's after-state token/life fields for one model. */
const copyHealth = (after: GameState, id: ModelId) => (s: GameState) => {
  const a = after.models[id]
  return a ? withModel(s, id, (m) => ({ ...m, damage: a.damage, rad: a.rad, life: a.life, offTable: a.offTable, conditions: a.conditions })) : s
}

/** Split a roll purpose: 'shoot:skill' -> base 'shoot', role skill; 'shoot:reroll:green' -> base 'shoot', effect green. */
export function parsePurpose(purpose: string): { base: string; role: RolledDie['role']; colour?: EffectDieColour; reroll: boolean } {
  const parts = purpose.split(':')
  const reroll = parts.includes('reroll')
  const kept = parts.filter((p) => p !== 'reroll')
  const last = kept[kept.length - 1] ?? ''
  if (last === 'skill') return { base: kept.slice(0, -1).join(':') || purpose, role: 'skill', reroll }
  if ((COLOURS as readonly string[]).includes(last)) return { base: kept.slice(0, -1).join(':') || purpose, role: 'effect', colour: last as EffectDieColour, reroll }
  return { base: kept.join(':'), role: 'other', reroll }
}

function diceOf(ev: DiceRolled): RolledDie[] {
  const p = parsePurpose(ev.purpose)
  return ev.dice.map((face) => ({ role: p.role, ...(p.colour ? { colour: p.colour } : {}), sides: ev.sides, face, reroll: p.reroll, rollId: ev.rollId }))
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
const pathLen = (pts: Vec2[]) => pts.reduce((acc, p, i) => (i ? acc + dist(pts[i - 1]!, p) : 0), 0)

function moveBeats(before: GameState, after: GameState, action: Action | null): Beat[] {
  const out: Beat[] = []
  const moverHint = (before.pending.context as { modelId?: unknown }).modelId
  const path = Array.isArray(action?.path) ? (action!.path as Vec2[]).filter((p) => p && typeof p.x === 'number' && typeof p.z === 'number') : null
  for (const [id, a] of Object.entries(after.models)) {
    const b = before.models[id]
    if (!b || dist(b.pos, a.pos) < 0.01) continue
    let points: Vec2[] = [b.pos, a.pos]
    if (path && path.length && id === moverHint) points = [b.pos, ...path.slice(0, -1), a.pos]
    const ms = Math.min(BEAT_MS.moveMax, BEAT_MS.moveBase + BEAT_MS.movePerInch * pathLen(points))
    out.push({
      cue: { kind: 'move', modelId: id, points }, baseMs: ms, events: [], applyAt: 'end',
      patch: (s) => withModel(s, id, (m) => ({ ...m, pos: a.pos, elev: a.elev })),
    })
  }
  return out
}

function eventBeats(before: GameState, after: GameState, events: SeqEvent[]): Beat[] {
  const out: Beat[] = []
  let dice: { base: string; ownerId?: string; events: SeqEvent[] } | null = null
  const flushDice = () => {
    if (!dice) return
    const rolls = dice.events.map((e) => e.event as DiceRolled)
    out.push({ cue: { kind: 'dice', purpose: dice.base, ...(dice.ownerId ? { ownerId: dice.ownerId } : {}), dice: rolls.flatMap(diceOf), rolls }, baseMs: BEAT_MS.dice, events: dice.events, applyAt: 'start' })
    dice = null
  }
  for (const se of events) {
    const ev = se.event
    if (ev.type === 'DiceRolled') {
      const r = ev as DiceRolled
      const base = parsePurpose(r.purpose).base
      if (dice && (dice.base !== base || dice.ownerId !== r.ownerId)) flushDice()
      dice ??= { base, ...(r.ownerId ? { ownerId: r.ownerId } : {}), events: [] }
      dice.events.push(se)
      continue
    }
    flushDice()
    const e = ev as { type: string; [k: string]: unknown }
    const str = (k: string) => String(e[k] ?? '')
    const one = (cue: Cue, baseMs: number, patch?: Beat['patch']) => out.push({ cue, baseMs, events: [se], applyAt: 'start', ...(patch ? { patch } : {}) })
    switch (e.type) {
      case 'attack':
        one({ kind: 'attack', attackerId: str('attackerId'), targetId: str('targetId'), weaponId: str('weaponId'), ns: str('ns'), success: !!e.success, critical: !!e.critical, sv: Number(e.sv ?? 0), result: e.result }, BEAT_MS.attack)
        break
      case 'damage':
      case 'directDamage': {
        const id = str('targetId')
        one({ kind: 'damage', targetId: id, ...(e.attackerId ? { attackerId: str('attackerId') } : {}), applied: Number(e.applied ?? 0), removed: !!e.removed, direct: e.type === 'directDamage', ...(e.reason ? { reason: str('reason') } : {}) }, BEAT_MS.damage, copyHealth(after, id))
        break
      }
      case 'removed': { const id = str('modelId'); one({ kind: 'removed', modelId: id, reason: str('reason') }, BEAT_MS.removed, copyHealth(after, id)); break }
      case 'conditionAdded':
      case 'conditionRemoved': {
        const id = str('modelId'), c = str('condition'), added = e.type === 'conditionAdded'
        one({ kind: 'condition', modelId: id, condition: c, added }, BEAT_MS.condition,
          (s) => withModel(s, id, (m) => ({ ...m, conditions: added ? (m.conditions.includes(c) ? m.conditions : [...m.conditions, c]) : m.conditions.filter((x) => x !== c) })))
        break
      }
      case 'scatter': one({ kind: 'scatter', from: e.from as Vec2, to: e.to as Vec2 }, BEAT_MS.scatter); break
      case 'luck': one({ kind: 'luck', who: str('who'), lucky: !!e.lucky }, BEAT_MS.luck); break
      case 'gameOver': {
        const winner = (e.winner as string | null) ?? null
        one({ kind: 'banner', tone: 'gameOver', text: winner ? `${seatLabel(winner)} wins` : 'The game ends in a draw', round: after.round, seat: null, winner }, BEAT_MS.gameOver)
        break
      }
      default: one({ kind: 'note', event: ev }, BEAT_MS.note)
    }
  }
  flushDice()
  void before
  return out
}

function turnBeats(before: GameState, after: GameState): Beat[] {
  if (after.phase === 'over') return []
  if (after.round > 0 && after.round !== before.round) {
    return [{ cue: { kind: 'banner', tone: 'round', text: `Round ${after.round}`, round: after.round, seat: after.turn?.seat ?? null }, baseMs: BEAT_MS.round, events: [], applyAt: 'start' }]
  }
  const seat = after.turn?.seat ?? null
  if (seat && seat !== (before.turn?.seat ?? null)) {
    return [{ cue: { kind: 'banner', tone: 'turn', text: `${seatLabel(seat)} to act`, round: after.round, seat }, baseMs: BEAT_MS.turn, events: [], applyAt: 'start' }]
  }
  return []
}

/** Beats for one accepted engine step. Moves first for move/charge actions, after the events otherwise (pushes). */
export function buildBeats(before: GameState, after: GameState, events: SeqEvent[], action: Action | null): Beat[] {
  const moves = moveBeats(before, after, action)
  const evs = eventBeats(before, after, events)
  const t = action?.type ?? ''
  const movesFirst = t.startsWith('move.') || t.startsWith('charge')
  return [...(movesFirst ? [...moves, ...evs] : [...evs, ...moves]), ...turnBeats(before, after)]
}
