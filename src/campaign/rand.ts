// Seeded streams for campaign draws (CAMP-008). Every random choice derives from deriveSeed(campaign.id, round, step, n)
// in src/engine/rng.ts, so the same choices replay to the same cards. Never Math.random.
import { deriveSeed, rollDie } from '../engine/rng'
import type { RngState } from '../engine/types'
import type { Campaign, SeatKey } from './types'

export class Stream {
  s: RngState
  constructor(s: RngState) { this.s = s }
  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 1) return 0
    const [v, next] = rollDie(this.s, n)
    this.s = next
    return v - 1
  }
  pick<T>(items: readonly T[]): T | undefined { return items.length ? items[this.int(items.length)] : undefined }
  /** Fisher-Yates over a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }
}

/** The stream for the n-th draw of a step: a pure function of the campaign seed (spec 19 s7). */
export const streamFor = (c: Pick<Campaign, 'id' | 'round'>, seat: SeatKey, step: string, n: number): Stream =>
  new Stream(deriveSeed(c.id, c.round, `${seat}.${step}`, n))
