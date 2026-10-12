// URL test hooks (spec 00 s8, KNOWLEDGE-BASE 1.5). Parsing only: this file stays in the start chunk (no engine imports).
//   ?test=1              skip the start screen and expose window.__game (installed by store/testHooks.ts at boot):
//                        { getState, view(seat), pending, legalActions, submit(action), pauseBots(bool), params }
//   ?seats=human,bot     one controller per seat in seat order: human,bot | bot,bot | human,human (hot-seat)
//   ?seed=<word>         repeatable games; put the seed in every bug report
//   ?scenario=<id>       scenario id from data/1e/scenarios (default: the engine's default skirmish)
//   ?speed=fast          animation speed: instant | fast | normal | slow | <number> (0 = instant)
//   ?fps                 frame-rate meter;  ?gallery  figure gallery
// Any of seats/scenario/test also skips the start screen.
export type SeatController = 'human' | 'bot'

export interface Params {
  test: boolean
  /** Controllers in seat order (seat 0 is the near edge). */
  seats: SeatController[]
  /** True when ?seats was given explicitly. */
  seatsGiven: boolean
  seed: string | null
  scenario: string | null
  /** Speed multiplier from ?speed, or null to keep the saved setting. */
  speed: number | null
  gallery: boolean
  fps: boolean
  /** Start straight into a game (test=1, seats= or scenario= present). */
  autostart: boolean
}

export const SPEED_WORDS: Record<string, number> = { instant: 0, fast: 3, normal: 1, slow: 0.5 }

export function parseSpeed(v: string | null): number | null {
  if (v === null || v === '') return null
  if (v in SPEED_WORDS) return SPEED_WORDS[v]!
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function readParams(search = typeof location === 'undefined' ? '' : location.search): Params {
  const q = new URLSearchParams(search)
  const seatsRaw = q.get('seats')
  const seats = (seatsRaw ?? 'human,bot').split(',').map((s) => s.trim().toLowerCase())
    .filter(Boolean).map((s): SeatController => (s === 'bot' || s === 'ai' ? 'bot' : 'human'))
  const test = q.get('test') === '1'
  return {
    test,
    seats: seats.length >= 2 ? seats : ['human', 'bot'],
    seatsGiven: seatsRaw !== null,
    seed: q.get('seed'),
    scenario: q.get('scenario'),
    speed: parseSpeed(q.get('speed')),
    gallery: q.has('gallery'),
    fps: q.has('fps'),
    autostart: test || seatsRaw !== null || q.has('scenario'),
  }
}
