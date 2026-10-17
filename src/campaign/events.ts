// The battle's Event Deck (CH p4-5, p24; spec 19 s2.1-2.2). Pure functions over a plain-JSON deck so the battle layer can keep
// it in game state; every shuffle takes a Stream (CAMP-008). The engine does not run Events yet (frozen contracts), so these
// are the rules, tested by checklist ID, ready for the engine module that will call them.
import type { CampaignData, EventRec } from './data'
import type { Stream } from './rand'
import type { SeatKey } from './types'

export interface DeckCard {
  id: string
  consequence: boolean
  /** Owner of a Consequence card. */
  owner?: SeatKey
  /** Flip icon: turned face up when it lies on top (EVENT-003). */
  flip: boolean
  persists: boolean
}
export interface EventDeck {
  cards: DeckCard[]
  /** The Event in play this round; blocks the next draw while it stays (CH p4). */
  inPlay: DeckCard | null
  discard: DeckCard[]
  /** Consequences that surfaced and were resolved at once. */
  resolved: DeckCard[]
  /** Consequences gained mid-battle, waiting for the round end (EVENT-006). */
  waiting: DeckCard[]
}

const toCard = (e: EventRec, owner?: SeatKey): DeckCard => ({ id: e.id, consequence: !!e.consequence, ...(owner ? { owner } : {}), flip: !!e.flip, persists: !!e.persists })

export interface DeckOpts {
  /** The scenario's round count: rounds - 1 Events are drawn (EVENT-001). */
  rounds: number
  /** Every Consequence each player brings. */
  consequences: { seat: SeatKey; id: string }[]
  /** The players may pick the mix instead of drawing at random (CH p4). */
  picked?: string[]
}

/** Build the Event Deck (EVENT-001, EVENT-005). Events face down, Consequences face up, shuffled together. */
export function buildEventDeck(d: CampaignData, o: DeckOpts, s: Stream): EventDeck {
  const events = d.events.filter((e) => !e.consequence)
  const want = Math.max(0, o.rounds - 1)
  const chosen = o.picked ? o.picked.map((id) => events.find((e) => e.id === id)).filter((e): e is EventRec => !!e) : s.shuffle(events).slice(0, want)
  // No player adds the same Consequence twice; the same card from two players is one card with a random owner (EVENT-005).
  const claims = new Map<string, SeatKey[]>()
  for (const c of o.consequences) { const l = claims.get(c.id) ?? []; if (!l.includes(c.seat)) l.push(c.seat); claims.set(c.id, l) }
  const cons: DeckCard[] = []
  for (const [id, seats] of claims) {
    const rec = d.events.find((e) => e.id === id)
    cons.push({ id, consequence: true, owner: s.pick(seats), flip: !!rec?.flip, persists: !!rec?.persists })
  }
  return { cards: s.shuffle([...chosen.map((e) => toCard(e)), ...cons]), inPlay: null, discard: [], resolved: [], waiting: [] }
}

/** Resolve every Consequence on top at once; they never count as the round's Event (EVENT-004). */
function surface(deck: EventDeck): EventDeck {
  const cards = [...deck.cards]; const resolved = [...deck.resolved]
  while (cards[0]?.consequence) resolved.push(cards.shift()!)
  return { ...deck, cards, resolved }
}

/** Start of a round: from round 2, draw the top Event when none is in play (EVENT-002). */
export function startRound(deck: EventDeck, round: number): EventDeck {
  if (round < 2) return deck
  let next = surface(deck)
  if (!next.inPlay && next.cards.length) {
    const cards = [...next.cards]
    next = { ...next, inPlay: cards.shift()!, cards }
    next = surface(next)
  }
  return next
}

/** End of a round: discard the Event in play unless it stays; then file mid-battle Consequences under the kept top card (EVENT-006). */
export function endRound(deck: EventDeck, s: Stream): EventDeck {
  let next: EventDeck = { ...deck }
  if (next.inPlay && !next.inPlay.persists) next = { ...next, discard: [...next.discard, next.inPlay], inPlay: null }
  if (next.waiting.length) {
    const [top, ...rest] = next.cards
    const mixed = s.shuffle([...rest, ...next.waiting])
    next = { ...next, cards: top ? [top, ...mixed] : mixed, waiting: [] }
  }
  return next
}

/** A Consequence gained during the battle waits for the round end (EVENT-006). A duplicate is refused (EVENT-005). */
export function addMidBattle(d: CampaignData, deck: EventDeck, id: string, owner: SeatKey): EventDeck {
  const dup = [...deck.cards, ...deck.waiting, ...deck.resolved].some((c) => c.id === id)
  if (dup) return deck
  const rec = d.events.find((e) => e.id === id)
  return { ...deck, waiting: [...deck.waiting, { id, consequence: true, owner, flip: !!rec?.flip, persists: !!rec?.persists }] }
}

/** The top card as every seat sees it: a Flip card or a Consequence is face up, anything else is hidden (EVENT-003). */
export function revealedTop(deck: EventDeck): string | null {
  const t = deck.cards[0]
  return t && (t.flip || t.consequence) ? t.id : null
}

/** Consequences still in the deck at battle end return to their owners' next battle (EVENT-007). */
export function leftoverConsequences(deck: EventDeck): { seat: SeatKey; id: string }[] {
  return [...deck.cards, ...deck.waiting].filter((c) => c.consequence && c.owner).map((c) => ({ seat: c.owner!, id: c.id }))
}
