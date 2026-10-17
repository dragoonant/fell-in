// Campaign-side `{code: "<hook>"}` escape hatches (spec 20 "Campaign records", spec 00 s11). The data records name a hook and
// pass args; this file implements the ones the campaign layer can run. A hook the data names but this file lacks is STUBBED:
// it changes nothing and logs a RULING line, so a missing hook never blocks a campaign (owner rule).
import type { CampaignData, EventRec } from './data'
import { drawIds, ensureDecks, mintCard } from './decks'
import type { Stream } from './rand'
import type { Campaign, CampaignPlayer } from './types'

export interface HookCtx {
  campaign: Campaign
  player: CampaignPlayer
  data: CampaignData
  args: Record<string, unknown>
  stream: Stream
  /** The hook's source (a record id) for the log. */
  source: string
  log: (text: string) => void
}
export type CampaignHook = (ctx: HookCtx) => void

const num = (v: unknown, dflt = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : dflt)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Add a Consequence card to the player's next Event Deck. A player never adds the same Consequence twice (EVENT-005). */
export function addConsequence(p: CampaignPlayer, id: string): boolean {
  if (p.consequences.includes(id)) return false
  p.consequences.push(id)
  return true
}

/** Hooks keyed by the names the data uses. Aliases cover the spellings a data author may reasonably pick. */
export const campaignHooks: Record<string, CampaignHook> = {
  // Add a Consequence card: args.id (or args.consequence).
  consequence: ({ player, args }) => { const id = str(args.id) ?? str(args.consequence); if (id) addConsequence(player, id) },
  // Gun for Hire: the player pays args.caps (30) and a mercenary Consequence joins the next Event Deck (EXPL-006).
  gunForHire: ({ player, args, log }) => {
    const cost = num(args.caps, 30)
    if (player.caps < cost) { log(`Gun for Hire: cannot pay ${cost} caps`); return }
    player.caps -= cost
    addConsequence(player, str(args.consequence) ?? 'mercenary')
  },
  // Caps change: args.n (negative to pay), never below 0 (CAMP-012).
  capsChange: ({ player, args }) => { player.caps = Math.max(0, player.caps + num(args.n)) },
  // Draw args.n Item cards of args.itemClass straight into the pool (Hand-Written Note pass reward, EXPL-007).
  gainItems: ({ campaign, player, data, args, stream, source }) => {
    const deck = ensureDecks(data, player).item
    for (const id of drawIds(data, player, deck, { itemClass: str(args.itemClass) }, num(args.n, 1), stream)) {
      const c = mintCard(data, player, id, 'explore'); player.pool.push(c)
      campaign.log.push({ round: campaign.round, seat: player.seat, type: 'hook.gainItems', text: `${source}: gained ${c.defId}` })
    }
  },
  // A named free card (linked scenario rewards, Quest items): lands among the next battle's reward cards, no Stores needed.
  freeCard: ({ player, data, args }) => { const id = str(args.defId) ?? str(args.id); if (id) player.rewards.push(mintCard(data, player, id, 'quest')) },
  // Random Boosts owed at the next battle's start (BOOST-005).
  boostsOwed: ({ player, args }) => { player.boostsOwed += num(args.n, 2) },
}
campaignHooks.handWrittenNote = (ctx) => campaignHooks.gainItems!({ ...ctx, args: { n: 2, ...ctx.args } })
campaignHooks.mercenary = campaignHooks.gunForHire!

/** Run a hook. Returns false when it is stubbed (unknown name), after logging the RULING. */
export function runHook(name: string, ctx: HookCtx): boolean {
  const h = campaignHooks[name]
  if (!h) {
    const line = `RULING: hook ${name} | stubbed as a no-op | the data names it but src/campaign/hooks.ts does not implement it | Unsourced | ${ctx.source}`
    ctx.campaign.log.push({ round: ctx.campaign.round, seat: ctx.player.seat, type: 'ruling', text: line })
    return false
  }
  h(ctx)
  return true
}

// ---------- battle-side rules the engine does not model yet, as pure functions with tests ----------
/** A skill-die face as the campaign sees it for Boost re-rolls. */
export interface DieFace { value: number | 'X'; ap?: number }

/** Second Chance (BOOST-004): re-roll an X result, X+AP face included; the AP on the old face is not kept (ERR p.13). */
export function secondChance(old: DieFace, rerolled: DieFace): { face: DieFace; allowed: boolean } {
  if (old.value !== 'X') return { face: old, allowed: false }
  return { face: { value: rerolled.value, ap: rerolled.ap ?? 0 }, allowed: true }
}

/** Fortunate Deflection cancels one damage icon, from any source, not one point of damage (ERR p.15). */
export function fortunateDeflection(icons: number): number { return Math.max(0, icons - 1) }

/** The battle-side flags of an Event record. Dust Cloud blocks long-range attacks for its round (EVENT-008, CH p4). */
export function eventRules(e: EventRec): { blocksLongRange: boolean; flip: boolean; persists: boolean } {
  const code = e.effect && typeof e.effect === 'object' && 'code' in e.effect ? String((e.effect as { code: unknown }).code) : ''
  return { blocksLongRange: code === 'eventNoLongRange' || code === 'dustCloud' || code === 'blockLongRange', flip: !!e.flip, persists: !!e.persists }
}
