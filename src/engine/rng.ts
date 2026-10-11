// FROZEN after M0: sfc32 seeded by cyrb128 (docs/spec/00-architecture.md). Pure: state in, state out; never Math.random.
import type { GameState, Id, RngState, RollPurpose } from './types'

export function cyrb128(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function seedRng(seed: string): RngState {
  let s = cyrb128(seed)
  for (let i = 0; i < 15; i++) s = nextU32(s)[1] // warm-up
  return s
}

export function nextU32(s: RngState): [number, RngState] {
  let [a, b, c, d] = s
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
  const t = (((a + b) | 0) + d) | 0
  d = (d + 1) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  c = (c + t) | 0
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]]
}

export function nextFloat(s: RngState): [number, RngState] {
  const [u, n] = nextU32(s)
  return [u / 4294967296, n]
}

/** Roll one die with `sides` faces (1..sides). */
export function rollDie(s: RngState, sides: number): [number, RngState] {
  const [f, n] = nextFloat(s)
  return [1 + Math.floor(f * sides), n]
}
export const rollD20 = (s: RngState): [number, RngState] => rollDie(s, 20)
export const rollD12 = (s: RngState): [number, RngState] => rollDie(s, 12)

export interface RollSpec { count: number; sides: number; purpose: RollPurpose; ownerId?: Id }
export interface DiceRolled { type: 'DiceRolled'; rollId: string; purpose: RollPurpose; ownerId?: Id; sides: number; dice: number[]; total: number }

// The only way the engine rolls: advances state.rng and rollSeq, returns the DiceRolled event.
// TODO(M2): the d20 skill die + coloured d12 effect-dice pool (dice.ts) builds on this.
export function roll(state: GameState, spec: RollSpec): { state: GameState; event: DiceRolled } {
  let cur = state.rng
  const dice: number[] = []
  for (let i = 0; i < Math.max(1, spec.count); i++) { const [v, n] = rollDie(cur, spec.sides); dice.push(v); cur = n }
  const rollId = `r:${state.rollSeq + 1}`
  const event: DiceRolled = { type: 'DiceRolled', rollId, purpose: spec.purpose, ownerId: spec.ownerId, sides: spec.sides, dice, total: dice.reduce((a, b) => a + b, 0) }
  return { state: { ...state, rng: cur, rollSeq: state.rollSeq + 1 }, event }
}

// Seed for out-of-engine randomness (AI, random bot): never touches state.rng.
export function deriveSeed(...parts: (string | number)[]): RngState {
  return seedRng(parts.join('|'))
}
