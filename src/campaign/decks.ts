// Phase decks (CH p20): the Item Deck (every available Item except Uniques), the Boost Deck and the Explore Deck.
// A deck is the list of record ids still in it; a draw picks uniformly among the cards that match, using the n-th stream of
// the step (CAMP-008). "Draw a card of type T" means draw until a T turns up: skipped cards go back, so it is a uniform pick
// among the matches (SETT-011).
import { cardInfo, classesOf, modAllowed, type CampaignData, type ItemClass } from './data'
import type { Stream } from './rand'
import type { CampaignPlayer, PhaseState, PoolCard } from './types'

const MOD_CLASSES: readonly ItemClass[] = ['mod', 'armorMod', 'powerArmorMod', 'robotMod', 'creatureMod']
export const isModClass = (c: string | undefined): boolean => !!c && (MOD_CLASSES as readonly string[]).includes(c)

/** The Item Deck: every non-Unique Item card that is not already in the player's hands or pool (one physical copy each). */
export function buildItemDeck(d: CampaignData, p: CampaignPlayer): string[] {
  const held = new Set<string>([...p.pool, ...p.selected, ...p.rewards, ...p.lockers].map((c) => c.defId))
  const ids = [
    ...d.weapons.filter((w) => !w.unique).map((w) => w.id),
    ...d.armor.filter((a) => a.kind !== 'powerArmor').map((a) => a.id),
    ...d.items.map((i) => i.id),
    ...d.mods.map((m) => m.id),
  ]
  return ids.filter((id) => !held.has(id) && !(cardInfo(d, id)?.unique))
}

export function ensureDecks(d: CampaignData, p: CampaignPlayer): NonNullable<PhaseState['decks']> {
  if (!p.phase.decks) p.phase.decks = { item: buildItemDeck(d, p), boost: d.boosts.map((b) => b.id), explore: d.explore.map((e) => e.id) }
  return p.phase.decks
}

export interface DrawFilter { itemClass?: string; boostType?: string; /** Markets draw Mods whatever Perks the settlement holds (SETT-018). */ ignorePerks?: boolean }

/** Whether a record id matches the draw filter. Mods also need a settlement Perk that allows them (SETT-013, SETT-020). */
export function matches(d: CampaignData, p: CampaignPlayer, id: string, f: DrawFilter): boolean {
  if (f.boostType) { const b = d.boosts.find((x) => x.id === id); return !!b && (b.type === f.boostType || b.typeUnknown === true) } // an unsourced type fits every rack (RULING in boosts.json)
  const cls = f.itemClass ?? 'any'
  if (!classesOf(d, id).has(cls as ItemClass)) return false
  return isModClass(cls) && !f.ignorePerks ? modAllowed(d, id, p.perks) : true
}

/** Remove up to `count` matching ids from a deck, chosen by the stream. */
export function drawIds(d: CampaignData, p: CampaignPlayer, deck: string[], f: DrawFilter, count: number, s: Stream): string[] {
  const out: string[] = []
  for (let k = 0; k < count; k++) {
    const pool = deck.filter((id) => matches(d, p, id, f))
    const pick = s.pick(pool)
    if (pick === undefined) break
    deck.splice(deck.indexOf(pick), 1)
    out.push(pick)
  }
  return out
}

export function mintCard(d: CampaignData, p: CampaignPlayer, defId: string, from: PoolCard['from']): PoolCard {
  const info = cardInfo(d, defId)
  const card: PoolCard = { uid: `${defId}#${++p.uidSeq}`, defId, kind: info?.kind ?? 'item', from }
  if (info?.unique) card.unique = true
  return card
}
