// Boosts (CH p5, p24; spec 19 s2.4): hand sizes, what each seat may see, and the one-per-Action rule. The engine does not play
// Boosts yet; these are the rules as pure functions, tested by checklist ID, for the engine module that will.
import type { CampaignData } from './data'
import { leaderHighestAttr } from './rules'
import type { CampaignPlayer, PoolCard, SeatKey } from './types'

/** Hand size without a settlement: up to half the Leader's highest attribute, rounded up (BOOST-001, CH p5). */
export const handLimitNoSettlement = (highestAttr: number): number => Math.ceil(highestAttr / 2)

/** The Boosts a player may take into a battle: with a settlement, the Leader's highest attribute (Stores allowing); without, half of it. */
export function handLimit(p: CampaignPlayer, d: CampaignData, settlement: boolean): number {
  const top = leaderHighestAttr(p, d)
  return settlement ? top : handLimitNoSettlement(top)
}

export interface HandView { owner: SeatKey; size: number; cards: PoolCard[] | null }

/** The hand is secret; its size is public (BOOST-002, CH p5). Only the owner sees the cards. */
export function handView(owner: SeatKey, hand: readonly PoolCard[], viewer: SeatKey): HandView {
  return { owner, size: hand.length, cards: viewer === owner ? hand.map((c) => ({ ...c })) : null }
}

export interface BoostTurn { hand: PoolCard[]; discard: PoolCard[]; usedThisAction: boolean }

/** Reveal and use a Boost: at most one per Action, and it is discarded after it resolves (BOOST-003). */
export function playBoost(t: BoostTurn, uid: string): BoostTurn {
  if (t.usedThisAction) throw new Error('only one Boost per Action')
  const card = t.hand.find((c) => c.uid === uid)
  if (!card) throw new Error(`no Boost ${uid} in the hand`)
  return { hand: t.hand.filter((c) => c.uid !== uid), discard: [...t.discard, card], usedThisAction: true }
}
/** A new Action opens the one-Boost allowance again. */
export const newAction = (t: BoostTurn): BoostTurn => ({ ...t, usedThisAction: false })
