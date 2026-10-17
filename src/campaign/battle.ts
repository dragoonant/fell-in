// The bridge between the campaign and the engine (spec 19 s7): toBattle builds the setup bundle createGame takes from the
// rosters and the Step 3 pool; fromBattle reads a finished GameState (after game over the state is fully public) and applies
// caps, removed models, carried items, Quest progress and linked-scenario consequences. The campaign never reads a live game.
import type { ScenarioForce } from '../data/types'
import type { CampaignGameOpts, CreateGameOpts } from '../engine/setup'
import type { GameState, SeatController, SeatId } from '../engine/types'
import { cardInfo, FALLBACK_AWARD, unitRec, type CampaignData } from './data'
import { buildEventDeck, leftoverConsequences, type EventDeck } from './events'
import { streamFor } from './rand'
import { blankPhase, reduce } from './reducer'
import { applyLinked, type LinkedApplied } from './linked'
import { chosenStandard, freeEquipment } from './rules'
import {
  CampaignError, type Campaign, type CampaignPlayer, type LinkedConsequence, type PoolCard, type RosterModel, type SeatKey,
} from './types'

const fail = (code: string, msg: string): never => { throw new CampaignError(code, msg) }

/** Engine model id for the n-th model of a unit in a seat's force list (setup.ts createGame). */
export function engineIds(seat: SeatId, members: readonly RosterModel[]): Record<string, string> {
  const counts: Record<string, number> = {}
  const out: Record<string, string> = {}
  for (const m of members) {
    const n = (counts[m.unitId] = (counts[m.unitId] ?? 0) + 1)
    out[m.id] = `${seat.toLowerCase()}-${m.unitId}-${n}`
  }
  return out
}

export { applyLinked, type LinkedApplied }

export interface BattleExtras {
  /** Roster model id -> engine model id, per seat. */
  models: Record<SeatKey, Record<string, string>>
  /** Boost hands for the battle (secret; sizes are public). Includes random Boosts owed from Quests. */
  hands: Record<SeatKey, PoolCard[]>
  /** The Quest each seat runs (the opponent learns only that one exists). */
  quests: Record<SeatKey, string | null>
  /** The battle's Event Deck (CH p4); the engine does not run Events yet. */
  eventDeck: EventDeck
  /** Linked-scenario consequences for this scenario, per seat. */
  linked: Record<SeatKey, LinkedApplied[]>
  /** Force value per seat (the 1,000-caps bonus). */
  forceValues: Record<SeatKey, number>
}
export type BattleSetup = CreateGameOpts & { extras: BattleExtras }

export interface ToBattleOpts {
  /** A non-campaign opponent seat added when the campaign has one player. */
  opponent?: 'bot' | 'human' | 'official'
  seed?: string
  rounds?: number
}

/** The setup bundle for createGame: forces from rosters and pool, perks and damage through the campaign hand-off. */
export function toBattle(c: Campaign, scenarioId: string, d: CampaignData, o: ToBattleOpts = {}): BattleSetup {
  const forces: Record<SeatId, ScenarioForce[]> = {}
  const camp: CampaignGameOpts = { damage: {}, degraded: {}, mods: {} }
  const models: BattleExtras['models'] = {}
  const hands: BattleExtras['hands'] = {}
  const quests: BattleExtras['quests'] = {}
  const linked: BattleExtras['linked'] = {}
  const forceValues: BattleExtras['forceValues'] = {}
  const seats: SeatId[] = []
  const controllers: Record<SeatId, SeatController> = {}
  const sc = d.scenarios.find((s) => s.id === scenarioId) ?? fail('E_SCENARIO', `no scenario ${scenarioId}`)
  for (const p of c.players) {
    const plan = p.force ?? fail('E_FORCE', `seat ${p.seat} has not created a force`)
    const members = plan.members.map((id) => p.roster.find((m) => m.id === id) ?? fail('E_FORCE', `no roster model ${id}`))
    const cards = new Map([...p.selected, ...p.rewards].map((x) => [x.uid, x]))
    const ids = engineIds(p.seat, members)
    models[p.seat] = ids
    // CAMP-009: standard equipment, the Step 3 selections and equipped Perks only. Standard equipment is never shared (CAMP-011).
    forces[p.seat] = members.map((m): ScenarioForce & { perks: string[] } => {
      const assigned = (plan.assign[m.id] ?? []).map((uid) => cards.get(uid)).filter((x): x is PoolCard => !!x)
      const eid = ids[m.id]!
      for (const card of assigned) if (card.mods?.length) (camp.mods![eid] ??= {})[card.defId] = [...card.mods]
      if (m.degraded?.length) camp.degraded![eid] = [...m.degraded]
      return {
        unit: m.unitId, count: 1,
        items: [...new Set([...(unitRec(d, m.unitId)?.equipped ?? []), ...chosenStandard(d, plan, m.id, m.unitId), ...assigned.map((x) => x.defId)])],
        ...(plan.heroic.includes(m.id) ? { heroic: true } : {}), ...(plan.leader?.modelId === m.id ? { leader: plan.leader.card } : {}),
        perks: [...(plan.equipPerks[m.id] ?? [])],
      }
    })
    // Explore damage is dealt out to the force's models in order, at set-up, after the force is picked (EXPL-004).
    p.exploreEffects.forEach((e, i) => { const eid = ids[members[i % members.length]!.id]!; camp.damage![eid] = (camp.damage![eid] ?? 0) + e.damage })
    seats.push(p.seat)
    quests[p.seat] = p.quest
    forceValues[p.seat] = plan.value
    hands[p.seat] = [...p.hand] // owed random Boosts were drawn into the hand by force.quest (BOOST-005)
    linked[p.seat] = p.linked.filter((l) => l.scenarioId === scenarioId).map(applyLinked)
  }
  if (c.players.length === 1 && o.opponent) {
    const opp = o.opponent === 'official' ? 'ai' : 'B'
    seats.push(opp)
    controllers[opp] = o.opponent === 'official' ? 'official' : o.opponent === 'bot' ? 'bot' : 'human'
  }
  const rounds = o.rounds ?? sc.rounds ?? 6
  const consequences = c.players.flatMap((p) => p.consequences.map((id) => ({ seat: p.seat, id })))
  const eventDeck = buildEventDeck(d, { rounds, consequences }, streamFor(c, 'battle', 'events', 0))
  return {
    seed: o.seed ?? `${c.id}|${c.round}|battle`, seats, scenarioId, forces, controllers, campaign: camp,
    extras: { models, hands, quests, eventDeck, linked, forceValues },
  }
}

export interface FromBattleOpts {
  /** The Event Deck at battle end: undrawn Consequences return to their owners (EVENT-007). */
  eventDeck?: EventDeck
  /** Quest cards completed in the battle, by seat (rewards apply now, QUEST-003). */
  questsCompleted?: Record<SeatKey, { cardId: string; outcome?: number; next?: string; swapReward?: boolean }>
  /** Force value of a non-campaign opponent (for the 1,000-caps bonus). */
  opponentForceValue?: number
}

const KIND: Record<string, PoolCard['kind']> = { weapon: 'weapon', armor: 'armor', item: 'item', mod: 'mod' }

/** ScenarioDef.campaign (spec 20): read loosely so this file builds before and after src/data/types.ts gains the field. */
interface LinkedSpec { linkedId?: string; consequences?: { side: string; level?: 'major' | 'minor'; applyTo: string; effect: unknown; text: string }[] }
const linkedSpec = (sc: unknown): LinkedSpec | undefined => (sc as { campaign?: LinkedSpec } | undefined)?.campaign

/** Chain end: the last scenario reachable through campaign.linkedId, or the scenario itself. */
function finalOf(d: CampaignData, id: string): string {
  let cur = id; const seen = new Set<string>()
  for (;;) {
    const nxt = linkedSpec(d.scenarios.find((s) => s.id === cur))?.linkedId
    if (!nxt || seen.has(nxt)) return cur
    seen.add(cur); cur = nxt
  }
}

/** Apply a finished battle: caps, strip, Quest results, linked consequences. Leaves each player at afterBattle.retain. */
export function fromBattle(c: Campaign, state: GameState, d: CampaignData, o: FromBattleOpts = {}): Campaign {
  const result = state.result ?? fail('E_BATTLE', 'the battle has no result yet')
  const scenarioId = state.scenarioId ?? c.current?.scenarioId ?? ''
  const sc = d.scenarios.find((s) => s.id === scenarioId)
  const winnerSeat = result.winner
  const teamOf = (seat: SeatKey): string => state.seats[seat]?.team ?? state.seats[seat]?.side ?? seat
  const outcomeOf = (seat: SeatKey): 'win' | 'lose' | 'draw' => (winnerSeat === null ? 'draw' : teamOf(seat) === teamOf(winnerSeat) ? 'win' : 'lose')
  const award = d.awards.find((a) => a.scenarioId === scenarioId) ?? d.awards.find((a) => !a.scenarioId) ?? FALLBACK_AWARD
  const bonusFrom = award.bigForceBonus?.from ?? FALLBACK_AWARD.bigForceBonus!.from
  const values = c.players.map((p) => p.force?.value ?? p.lastForceValue)
  const foreign = Object.keys(state.seats).some((s) => !c.players.some((p) => p.seat === s))
  if (foreign && o.opponentForceValue !== undefined) values.push(o.opponentForceValue)
  const bigForce = values.length > 0 && values.every((v) => v >= bonusFrom) && (!foreign || o.opponentForceValue !== undefined)

  // Every change goes through reduce(): afterBattle.caps closes the battle and opens the new phase, afterBattle.strip takes the cards
  // off, afterBattle.result records the rest, so replaying the log rebuilds the campaign across the battle (CAMP-008).
  let cur: Campaign = structuredClone(c)
  const nextId = linkedSpec(sc)?.linkedId ?? null
  for (const p0 of c.players) {
    const seat = p0.seat
    const plan = p0.force
    const ids = plan ? engineIds(seat, plan.members.map((id) => p0.roster.find((m) => m.id === id)!).filter(Boolean)) : {}
    const outcome = outcomeOf(seat)
    const scenarioCaps = outcome === 'win' ? result.caps : undefined
    cur = reduce(cur, { type: 'afterBattle.caps', seat, outcome, ...(scenarioCaps !== undefined ? { scenarioCaps } : {}), bigForce, scenarioId, newRound: c.round + 1, ...(state.seats[seat]?.side ? { side: state.seats[seat]!.side } : {}), ...(result.level ? { level: result.level } : {}) }, d)
    // Gather what the battle left: carried and found cards that are not standard equipment, and the unused Boosts (CH p19).
    const carried: PoolCard[] = [], found: PoolCard[] = [], removed: string[] = [], degraded: { modelId: string; defId: string }[] = []
    let leaderRemoved = false
    for (const [rid, eid] of Object.entries(ids)) {
      const rm = p0.roster.find((m) => m.id === rid)!
      const model = state.models[eid]
      if (!model) continue
      const gone = model.life !== 'active' || !!model.offTable
      if (gone) removed.push(rid)
      if (gone && p0.leader?.modelId === rid) leaderRemoved = true
      const free = new Set(freeEquipment(d, rm.unitId))
      for (const it of model.carried) {
        if (free.has(it.defId) && it.starting) { if (it.degraded) degraded.push({ modelId: rid, defId: it.defId }); continue }
        const info = cardInfo(d, it.defId)
        const card: PoolCard = { uid: it.uid, defId: it.defId, kind: KIND[it.kind] ?? 'item' }
        if (info?.unique) card.unique = true
        if (it.spent) card.spent = true
        if (it.degraded) card.degraded = true
        if (it.mods?.length) card.mods = [...it.mods]
        ;(it.starting ? carried : found).push(card)
      }
    }
    cur = reduce(cur, { type: 'afterBattle.strip', seat, carried, found, boosts: p0.hand, removed, leaderRemoved, degraded }, d)
    // Linked scenario consequences (CAMP-016): the winning side's result stores a consequence for a later scenario.
    const earned: LinkedConsequence[] = []
    const spec = linkedSpec(sc)
    if (outcome === 'win' && spec?.consequences) {
      for (const k of spec.consequences) {
        const side = state.seats[seat]?.side
        if (k.side !== side || (k.level && result.level && k.level !== result.level)) continue
        const target = k.applyTo === 'final' ? finalOf(d, scenarioId) : spec.linkedId ?? scenarioId
        earned.push({ scenarioId: target, applyTo: k.applyTo, text: k.text, effect: k.effect })
      }
    }
    // A Quest left unfinished is marked failed and may be retried; a completed one pays out below (QUEST-003, QUEST-004).
    const done = p0.quest ? o.questsCompleted?.[seat] : undefined
    const questFailed = p0.quest && !(done && done.cardId === p0.quest) ? p0.quest : null
    // Consequences still in the deck go back to their owners; drawn ones are used up (EVENT-007).
    const consequencesLeft = o.eventDeck ? leftoverConsequences(o.eventDeck).filter((x) => x.seat === seat).map((x) => x.id) : null
    cur = reduce(cur, { type: 'afterBattle.result', seat, scenarioId, nextScenarioId: nextId, forceValue: plan?.value ?? p0.lastForceValue, questFailed, consequencesLeft, linked: earned }, d)
    if (p0.quest && done && done.cardId === p0.quest) cur = reduce(cur, { type: 'quest.complete', seat, ...done }, d)
  }
  return cur
}

/** Mark a battle as running (QUEST-001: the Quest cannot change now) and return its setup. */
export function beginBattle(c: Campaign, scenarioId: string, d: CampaignData, o: ToBattleOpts = {}): { campaign: Campaign; setup: BattleSetup } {
  const setup = toBattle(c, scenarioId, d, o)
  const campaign: Campaign = { ...structuredClone(c), current: { scenarioId, seats: setup.seats ?? [], models: setup.extras.models } }
  for (const p of campaign.players) p.step = 'toBattle'
  return { campaign, setup }
}


export interface QuestView { owner: SeatKey; inPlay: boolean; id: string | null }
/** The opponent knows a Quest is in play, not which (QUEST-001, CH p6). */
export function questView(owner: SeatKey, questId: string | null, viewer: SeatKey): QuestView {
  return { owner, inPlay: questId !== null, id: viewer === owner ? questId : null }
}
