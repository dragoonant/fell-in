// The campaign reducer (spec 19 s7): pure (campaign, action) => campaign for every between-battle step of the Campaign
// Handbook sequence. An illegal action throws CampaignError (use tryReduce for a result). Every random draw takes its stream
// from deriveSeed(campaign.id, round, "<seat>.<step>", n), so the same choices replay to the same cards (CAMP-008).
import { ATTRS, type Attr } from '../data/types'
import {
  cardInfo, cardValue, classesOf, exploreRec, FALLBACK_AWARD, modAllowed, perkRec, questRec, standardEquipment, structureRec, unitRec,
  type CampaignData, type CapsAwardRec, type ExploreOutcome, type ItemClass, type QuestRec,
} from './data'
import { drawIds, ensureDecks, mintCard } from './decks'
import { addConsequence, runHook } from './hooks'
import { applyLinked } from './linked'
import { streamFor } from './rand'
import {
  buyBlocker, countOf, dependants, forceValue, isLand, isPowered, leaderAttr, leaderHighestAttr, leaderOf, powerPlan,
  questCredit, retainFits, scrapRefund, slotsTotal, structuresOf, working,
} from './rules'
import {
  CampaignError, STEP_IDS,
  type BattleOutcome, type Campaign, type CampaignAction, type CampaignPlayer, type PhaseState, type PoolCard, type QuestProgress, type SeatKey, type StepId,
} from './types'

const refuse = (code: string, msg: string): never => { throw new CampaignError(code, msg) }

// ---------- construction ----------
export const blankPhase = (): PhaseState => ({
  drawn: false, used: [], repaired: [], darkChoice: [], listeningUses: 0, n: 0, decks: null, pending: null, explore: null, rejects: [], gathered: [],
  perkBought: [], leaderMoved: false, market: null, marketsDone: [],
})

export interface NewPlayer {
  seat: SeatKey
  faction: string
  team?: string
  /** Starting roster; default one model per unit of the faction. */
  roster?: { unitId: string; name?: string }[]
  /** Leader unit id and card; default the first roster model and the first fitting Leader card. */
  leader?: { unitId: string; card: string }
}
export interface NewCampaignOpts { id?: string; seed?: string; name?: string; createdAt?: number; players: NewPlayer[] }

function startingRoster(d: CampaignData, faction: string): { unitId: string; name?: string }[] {
  const seen = new Set<string>()
  const out: { unitId: string; name?: string }[] = []
  for (const u of d.units) {
    if (u.faction !== faction) continue
    const key = u.versionGroup ?? u.id
    if (seen.has(key)) continue
    seen.add(key); out.push({ unitId: u.id })
  }
  return out
}

/** A new campaign: every player at 0 caps with the free starting settlement (CAMP-001, CH p18). */
export function newCampaign(o: NewCampaignOpts, d: CampaignData): Campaign {
  const id = o.id ?? `camp-${o.seed ?? 'default'}`
  const players: CampaignPlayer[] = o.players.map((np) => {
    const p: CampaignPlayer = {
      seat: np.seat, ...(np.team ? { team: np.team } : {}), faction: np.faction, caps: 0, pool: [], structures: [], roster: [], perks: [], quests: [], land: 0,
      step: 'build.market', phase: blankPhase(), leader: null, leaderRemoved: false, hand: [], selected: [], rewards: [], lockers: [],
      consequences: [], exploreEffects: [], questsSpent: 0, quest: null, force: null, lastForceValue: 0, linked: [], boostsOwed: 0, uidSeq: 0,
    }
    for (const s of d.structures) for (let i = 0; i < (s.starting ?? 0); i++) p.structures.push({ id: `st${++p.uidSeq}`, defId: s.id })
    for (const r of np.roster ?? startingRoster(d, np.faction)) {
      p.roster.push({ id: `m${++p.uidSeq}`, unitId: r.unitId, ...(r.name ? { name: r.name } : {}), injuries: [], xp: 0, perks: [], equipped: [] })
    }
    const lead = np.leader ? p.roster.find((m) => m.unitId === np.leader!.unitId) : p.roster[0]
    const card = np.leader?.card ?? d.leaders.find((l) => !l.factionLock || l.factionLock === np.faction)?.id
    if (lead && card) p.leader = { modelId: lead.id, card }
    return p
  })
  return { id, edition: d.edition, name: o.name ?? 'Wasteland campaign', createdAt: o.createdAt ?? 0, players, round: 1, log: [], version: 1 }
}

// ---------- step order ----------
const GROUP: Record<StepId, number> = {
  'afterBattle.caps': 0, 'afterBattle.strip': 0, 'afterBattle.retain': 0, 'afterBattle.lockers': 0, 'afterBattle.sell': 0, 'afterBattle.leader': 0,
  'build.market': 1, 'build.structures': 1, 'build.perks': 1, 'build.power': 1, 'draw.structures': 2, 'draw.explore': 2,
  'select.stores': 3, 'select.lockers': 3, 'select.sell': 3, 'force.create': 4, 'force.quest': 4, toBattle: 5,
}
const STRICT = new Set([0, 3])
const idx = (s: StepId): number => STEP_IDS.indexOf(s)

/** Move the step pointer to `step`'s group; the sequence never goes back (CAMP-002) and Build is closed after a Step 2 draw. */
function enter(p: CampaignPlayer, step: StepId): void {
  const from = GROUP[p.step], to = GROUP[step]
  if (to === 1 && p.phase.drawn && step !== 'build.market') refuse('E_BUILD_CLOSED', 'Build is closed once a Step 2 card has been drawn')
  if (to < from) refuse('E_STEP', `${step} is behind ${p.step}: the settlement sequence does not go back`)
  if (to === from && STRICT.has(to) && idx(step) < idx(p.step)) refuse('E_STEP', `${step} already passed (now at ${p.step})`)
  if (from === 0 && to > 0 && idx(p.step) < idx('afterBattle.sell') && p.phase.gathered.length) refuse('E_STEP', 'finish the after-battle steps first (retain and sell)')
  if (from === 2 && to > 2 && (p.phase.pending || p.phase.explore)) refuse('E_STEP', 'resolve the open draw first')
  if (idx(step) > idx(p.step)) p.step = step
}

export function stepAfter(step: StepId): StepId | null { return STEP_IDS[idx(step) + 1] ?? null }

// ---------- helpers ----------
const seatOf = (c: Campaign, seat: SeatKey): CampaignPlayer => c.players.find((p) => p.seat === seat) ?? refuse('E_SEAT', `no player at seat ${seat}`)
const rm = <T>(list: T[], pred: (x: T) => boolean): T[] => { const out: T[] = []; for (let i = list.length - 1; i >= 0; i--) if (pred(list[i]!)) out.unshift(...list.splice(i, 1)); return out }
const say = (c: Campaign, p: CampaignPlayer | null, type: string, text: string, data?: Record<string, unknown>): void => {
  c.log.push({ round: c.round, seat: p?.seat ?? null, type, text, ...(data ? { data } : {}) })
}
const pay = (p: CampaignPlayer, n: number): void => {
  if (n < 0) refuse('E_BAD', 'negative price')
  if (p.caps < n) refuse('E_CAPS', `needs ${n} caps, has ${p.caps}`)
  p.caps -= n
}
/** The n-th stream of a step (CAMP-008). The counter advances once per call. */
const nextStream = (c: Campaign, p: CampaignPlayer, step: string) => streamFor(c, p.seat, step, p.phase.n++)

// ---------- caps awards ----------
export interface AwardQuery { scenarioId?: string; outcome: BattleOutcome; level?: 'major' | 'minor'; scenarioCaps?: number; bigForce?: boolean; side?: string }

/**
 * Caps a player gains after a battle (CAMP-003..006). A scenario record replaces the default only for the outcomes it names;
 * a per-side entry (bySide) beats the record's own win figure, and a draw pays the winner's amount (ERR p.10).
 */
export function capsAward(d: CampaignData, q: AwardQuery): number {
  const dflt: CapsAwardRec = d.awards.find((a) => !a.scenarioId) ?? FALLBACK_AWARD
  const own = q.scenarioId ? d.awards.find((a) => a.scenarioId === q.scenarioId) : undefined
  const named = (v: unknown): v is number => typeof v === 'number'
  const side = q.side ? own?.bySide?.[q.side] : undefined
  const lvl = q.level
  const win = named(q.scenarioCaps) && q.outcome !== 'lose' ? q.scenarioCaps
    : named(lvl && side?.[lvl]) ? side![lvl!]!
    : named(side?.win) ? side.win
    : named(lvl && own?.byLevel?.[lvl]) ? own!.byLevel![lvl!]!
    : named(own?.winner) ? own.winner : dflt.winner
  const lose = named(q.scenarioCaps) && q.outcome === 'lose' ? q.scenarioCaps : named(own?.loser) ? own.loser : dflt.loser
  const draw = named(own?.draw) ? own.draw : win // 'winner' (or silent) = the winner's amount (CAMP-003)
  const base = q.outcome === 'lose' ? lose : q.outcome === 'draw' ? draw : win
  // A scenario that pays nothing (a tutorial) pays no 1,000-caps bonus either.
  const none = own !== undefined && own.winner === 0 && own.loser === 0
  const bonus = own?.bigForceBonus ?? dflt.bigForceBonus
  return base + (q.bigForce && bonus && !none ? bonus.each : 0)
}

// ---------- per-action handlers ----------
type Handler<T extends CampaignAction> = (c: Campaign, p: CampaignPlayer, a: T, d: CampaignData) => void
type Of<K extends CampaignAction['type']> = Extract<CampaignAction, { type: K }>

function poolCard(p: CampaignPlayer, uid: string): PoolCard {
  return p.pool.find((x) => x.uid === uid) ?? refuse('E_CARD', `no card ${uid} in the pool`)
}

const afterBattleCaps: Handler<Of<'afterBattle.caps'>> = (c, p, a, d) => {
  if (a.newRound !== undefined) {
    // A battle just ended: close it and open a fresh Settlement Phase for this seat.
    c.round = a.newRound; delete c.current
    p.step = 'afterBattle.caps'; p.phase = blankPhase()
  }
  enter(p, 'afterBattle.caps')
  const gain = capsAward(d, a)
  p.caps += gain
  p.step = 'afterBattle.strip'
  say(c, p, a.type, `${a.outcome}: +${gain} caps (now ${p.caps})`)
}

const afterBattleStrip: Handler<Of<'afterBattle.strip'>> = (c, p, a, d) => {
  enter(p, 'afterBattle.strip')
  const refresh = (x: PoolCard): PoolCard => { const { spent: _s, ...rest } = x; return rest }
  // Everything non-standard comes off the force; unused Boosts leave the hand (SETT-001). Limited-use copies refresh (SETT-022).
  p.phase.gathered = [
    ...a.carried.map((x) => ({ ...refresh(x), from: 'carried' as const })),
    ...a.found.map((x) => ({ ...refresh(x), from: 'found' as const })),
    ...a.boosts.map((x) => ({ ...refresh(x), kind: 'boost' as const, from: 'hand' as const })),
  ]
  p.hand = []; p.selected = []; p.rewards = []; p.exploreEffects = []; p.force = null; p.capsLimitDelta = 0
  for (const m of p.roster) { m.equipped = []; m.perksEquipped = []; delete m.degraded }
  for (const g of a.degraded ?? []) { const m = p.roster.find((x) => x.id === g.modelId); if (m) (m.degraded ??= []).push(g.defId) }
  p.leaderRemoved = !!a.leaderRemoved
  p.phase.leaderMoved = false
  // A removed model is not dead: it keeps every Perk and returns (CAMP-007). Nothing to apply but the log line.
  for (const id of a.removed) say(c, p, 'model.returns', `${p.roster.find((m) => m.id === id)?.unitId ?? id} was removed and returns for the next battle`)
  p.step = 'afterBattle.retain'
  void d
}

/** The facts of a finished battle that are not cards or caps: Quest failure, Consequences, linked results, force value (CAMP-008). */
const afterBattleResult: Handler<Of<'afterBattle.result'>> = (c, p, a, d) => {
  p.lastForceValue = a.forceValue
  if (a.questFailed) {
    const rec = d.quests.find((q) => q.id === a.questFailed)
    const prog = p.quests.find((q) => q.title === rec?.title)
    if (prog) { if (!prog.failed.includes(a.questFailed)) prog.failed.push(a.questFailed) } else if (rec) p.quests.push({ title: rec.title, card: rec.id, completed: [], failed: [rec.id] })
    p.quest = null
  }
  if (a.consequencesLeft) p.consequences = [...a.consequencesLeft]
  p.linked = [...p.linked.filter((l) => l.scenarioId !== a.scenarioId), ...structuredClone(a.linked)]
  // Consequences for the scenario that comes next change the next force now, since the force is built before the scenario is picked.
  if (a.nextScenarioId) {
    for (const l of p.linked.filter((x) => x.scenarioId === a.nextScenarioId)) {
      const x = applyLinked(l)
      if (x.capsLimitDelta) p.capsLimitDelta = (p.capsLimitDelta ?? 0) + x.capsLimitDelta
      for (const id of x.freeCards ?? []) p.rewards.push(mintCard(d, p, id, 'linked'))
    }
  }
  say(c, p, a.type, `battle recorded${a.questFailed ? `, Quest ${a.questFailed} failed` : ''}`)
}

const afterBattleRetain: Handler<Of<'afterBattle.retain'>> = (c, p, a, d) => {
  enter(p, 'afterBattle.retain')
  const g = p.phase.gathered
  const take = new Map<string, PoolCard>()
  for (const uid of a.keep) take.set(uid, g.find((x) => x.uid === uid) ?? refuse('E_CARD', `${uid} was not gathered`))
  const counted = [...take.values()].filter((x) => !x.unique)
  const items = counted.filter((x) => x.kind !== 'boost').length, boosts = counted.filter((x) => x.kind === 'boost').length
  if (!retainFits(p, d, items, boosts, 'retain')) refuse('E_SHEDS', `Maintenance Sheds cannot keep ${items} item(s) and ${boosts} boost(s)`)
  const sell = new Set(a.sellUniques ?? [])
  // Unique items always enter the pool without a Shed unless the player sells them (SETT-003, ERR p.3).
  for (const x of g) if (x.unique && !sell.has(x.uid)) take.set(x.uid, x)
  p.pool.push(...[...take.values()].map((x) => ({ ...x, from: 'retained' as const })))
  p.phase.gathered = g.filter((x) => !take.has(x.uid))
  p.step = 'afterBattle.lockers'
  say(c, p, a.type, `kept ${take.size} card(s)`)
}

const afterBattleLockers: Handler<Of<'afterBattle.lockers'>> = (c, p, a) => {
  enter(p, 'afterBattle.lockers')
  // Locker contents rejoin the pool after the Sheds have been applied (SETT-004).
  p.pool.push(...p.lockers.map((x) => ({ ...x, from: 'locker' as const })))
  say(c, p, a.type, `${p.lockers.length} locker card(s) rejoin the pool`)
  p.lockers = []
  p.step = 'afterBattle.sell'
}

const afterBattleSell: Handler<Of<'afterBattle.sell'>> = (c, p, a, d) => {
  enter(p, 'afterBattle.sell')
  const total = p.phase.gathered.reduce((n, x) => n + cardValue(d, x.defId), 0)
  p.caps += total
  say(c, p, a.type, `sold ${p.phase.gathered.length} card(s) for ${total} caps`)
  p.phase.gathered = []
  p.step = 'afterBattle.leader'
}

const afterBattleLeader: Handler<Of<'afterBattle.leader'>> = (c, p, a, d) => {
  enter(p, 'afterBattle.leader')
  if (!a.modelId && !a.card) return
  if (!p.leaderRemoved) refuse('E_LEADER', 'the Leader may be reassigned only after it was removed in the last battle')
  if (p.phase.leaderMoved) refuse('E_LEADER', 'the Leader card was already moved this time')
  const model = a.modelId ? p.roster.find((m) => m.id === a.modelId) : leaderOf(p)
  if (!model) refuse('E_LEADER', 'no such model')
  const card = a.card ?? p.leader?.card
  if (!card || !d.leaders.some((l) => l.id === card)) refuse('E_LEADER', 'no such Leader card')
  p.leader = { modelId: model!.id, card: card! }
  p.phase.leaderMoved = true
  say(c, p, a.type, `Leader card ${card} moves to ${model!.unitId}`)
}

const buildMarket: Handler<Of<'build.market'>> = (c, p, a, d) => {
  enter(p, 'build.market')
  const inst = p.structures.find((s) => s.id === a.structureId) ?? refuse('E_STRUCT', 'no such Structure')
  const rec = structureRec(d, inst!.defId)
  if (rec?.effect.op !== 'market') refuse('E_STRUCT', 'not a market')
  if (!isPowered(p, d, inst!.id)) refuse('E_POWER', 'the market has no Power')
  if (p.phase.marketsDone.includes(inst!.id)) refuse('E_USED', 'market already resolved this phase')
  if (p.phase.used.length) refuse('E_ORDER', 'markets resolve before any other settlement activity (SETT-018)')
  if (!p.phase.market || p.phase.market.structureId !== inst!.id) {
    const deck = ensureDecks(d, p).item
    const ids = drawIds(d, p, deck, { itemClass: String(rec!.effect.itemClass), ignorePerks: true }, Number(rec!.effect.draw ?? 4), nextStream(c, p, 'build.market'))
    p.phase.market = { structureId: inst!.id, cards: ids.map((id) => mintCard(d, p, id, 'market')) }
    p.phase.drawn = true
    say(c, p, a.type, `${rec!.name}: ${ids.join(', ')}`)
    if (!a.buy) return
  }
  const table = p.phase.market!.cards
  const chosen = (a.buy ?? []).map((uid) => table.find((x) => x.uid === uid) ?? refuse('E_CARD', `${uid} is not on the table`))
  pay(p, chosen.reduce((n, x) => n + cardValue(d, x.defId), 0))
  p.pool.push(...chosen)
  p.phase.market = null
  p.phase.marketsDone.push(inst!.id)
  say(c, p, a.type, `bought ${chosen.length} mod(s)`)
}

const buildStructures: Handler<Of<'build.structures'>> = (c, p, a, d) => {
  enter(p, 'build.structures')
  if (a.op === 'scrap') {
    const inst = p.structures.find((s) => s.id === a.structureId) ?? refuse('E_STRUCT', 'no such Structure')
    const rec = structureRec(d, inst!.defId)
    const dep = dependants(p, d, inst!.defId).filter((s) => s.id !== inst!.id)
    // Scrapping is refused while a built Structure requires it (SETT-006); scrap the dependant first.
    if (dep.length && countOf(p, inst!.defId) === 1) refuse('E_REQUIRED', `${dep.map((s) => s.defId).join(', ')} require it`)
    p.caps += scrapRefund(rec)
    p.structures = p.structures.filter((s) => s.id !== inst!.id)
    p.phase.darkChoice = p.phase.darkChoice.filter((id) => id !== inst!.id)
    say(c, p, a.type, `scrapped ${rec?.name ?? inst!.defId} for ${scrapRefund(rec)} caps`)
    return
  }
  const rec = structureRec(d, a.defId) ?? refuse('E_STRUCT', `unknown Structure ${a.defId}`)
  const blocker = buyBlocker(p, d, rec!)
  if (blocker) refuse('E_BUY', `${rec!.name}: ${blocker}`)
  if (isLand(rec!)) {
    if (a.pay === 'quests') {
      const need = rec!.questsAlt ?? 5
      if (questCredit(p) < need) refuse('E_LAND', `Land needs ${need} completed Quest cards (has ${questCredit(p)})`)
      p.questsSpent += need
    } else pay(p, rec!.cost)
    p.land += 1
    say(c, p, a.type, `bought Land (${p.land}); room for ${slotsTotal(p, d)} Structures`)
    return
  }
  pay(p, rec!.cost)
  p.structures.push({ id: `st${++p.uidSeq}`, defId: rec!.id })
  say(c, p, a.type, `built ${rec!.name}`)
}

function grantStructures(p: CampaignPlayer, d: CampaignData, ids: readonly string[]): void {
  for (const id of ids) if (structureRec(d, id)) p.structures.push({ id: `st${++p.uidSeq}`, defId: id })
}

const buildPerks: Handler<Of<'build.perks'>> = (c, p, a, d) => {
  enter(p, 'build.perks')
  const rec = perkRec(d, a.perkId) ?? refuse('E_PERK', `unknown Perk ${a.perkId}`)
  const model = a.modelId ? p.roster.find((m) => m.id === a.modelId) ?? refuse('E_PERK', 'no such model') : undefined
  if (a.op === 'remove') {
    const owned = rec!.settlementWide ? p.perks : model!.perks
    if (!owned.includes(rec!.id)) refuse('E_PERK', 'not owned')
    const dependant = [...p.perks, ...(model ? model.perks : [])].find((id) => id !== rec!.id && (perkRec(d, id)?.requires?.perks ?? []).includes(rec!.id))
    if (dependant) refuse('E_REQUIRED', `${dependant} requires ${rec!.id}`)
    ;(rec!.settlementWide ? p.perks : model!.perks).splice(owned.indexOf(rec!.id), 1)
    say(c, p, a.type, `removed ${rec!.name} (no refund)`)
    return
  }
  const rq = rec!.requires
  if (rec!.settlementWide) {
    if (model) refuse('E_PERK', 'a settlement-wide Perk is assigned to no model')
    if (p.perks.includes(rec!.id)) refuse('E_PERK', 'already owned by the settlement')
  } else {
    if (!model) refuse('E_PERK', 'this Perk needs a model')
    if (model!.perks.includes(rec!.id)) refuse('E_PERK', 'that model already has this Perk')
    if (p.phase.perkBought.includes(model!.id)) refuse('E_PERK', 'one new Perk per model per Settlement Phase')
    const u = unitRec(d, model!.unitId)
    if (!u) refuse('E_PERK', 'unknown unit')
    for (const [attr, min] of Object.entries(rq?.attrs ?? {})) if (!ATTRS.includes(attr as Attr) || (u!.attrs[attr as Attr] ?? 0) < min) refuse('E_PERK', `${attr.toUpperCase()} ${min}+ needed`)
    // A skill requirement is the skill value (the attribute on its row) at the minimum or more.
    for (const [skill, min] of Object.entries(rq?.skills ?? {})) {
      const row = u!.skills.find((x) => x.skill === skill)
      if (!row || u!.attrs[row.attr] < min) refuse('E_PERK', `${skill} ${min}+ needed`)
    }
    for (const ab of rq?.abilities ?? []) if (!u!.abilities.some((x) => x.id === ab)) refuse('E_PERK', `needs the ${ab} ability`)
    if (rq?.faction && rq.faction !== p.faction) refuse('E_PERK', `only the ${rq.faction} faction`)
    if (rq?.unique && !u!.unique) refuse('E_PERK', 'unique characters only')
    if (rq?.notTypes?.some((t) => (u!.types as readonly string[]).includes(t))) refuse('E_PERK', 'this unit cannot take the Perk')
  }
  for (const need of rq?.perks ?? []) if (!(p.perks.includes(need) || model?.perks.includes(need))) refuse('E_PERK', `needs the ${need} Perk first`)
  pay(p, rec!.cost)
  if (rec!.settlementWide) {
    p.perks.push(rec!.id)
    grantStructures(p, d, (rec!.grants ?? []).map((g) => g.structure)) // free Workbench (PERK-007)
  } else {
    model!.perks.push(rec!.id)
    p.phase.perkBought.push(model!.id)
  }
  say(c, p, a.type, `bought ${rec!.name}${model ? ` for ${model.unitId}` : ''}`)
}

const buildPower: Handler<Of<'build.power'>> = (c, p, a, d) => {
  enter(p, 'build.power')
  for (const id of a.dark) if (!p.structures.some((s) => s.id === id)) refuse('E_STRUCT', `no Structure ${id}`)
  p.phase.darkChoice = [...new Set(a.dark)]
  const plan = powerPlan(p, d)
  if (plan.shortfall > 0) refuse('E_POWER_SHORT', `still ${plan.shortfall} Power short: choose more Structures to leave dark`)
  say(c, p, a.type, `${plan.dark.size} Structure(s) dark`)
}

// ---- Step 2 ----
function startDraw(c: Campaign, p: CampaignPlayer): void {
  enter(p, 'draw.structures')
  p.phase.drawn = true
  if (p.phase.pending) refuse('E_DRAW', 'keep cards from the open draw first')
  if (p.phase.explore) refuse('E_DRAW', 'resolve the open Explore card first')
  void c
}
function usable(p: CampaignPlayer, d: CampaignData, id: string, ops: readonly string[], allowRepeat = false): { inst: CampaignPlayer['structures'][number]; rec: NonNullable<ReturnType<typeof structureRec>> } {
  const inst = p.structures.find((s) => s.id === id) ?? refuse('E_STRUCT', `no Structure ${id}`)
  const rec = structureRec(d, inst.defId) ?? refuse('E_STRUCT', 'unknown Structure')
  const have = [rec.effect, ...(rec.extra ?? []), ...(rec.alternatives ?? [])].map((e) => String(e.op))
  if (!ops.some((o) => have.includes(o))) refuse('E_STRUCT', `${rec.name} cannot do that`)
  if (!isPowered(p, d, inst.id)) refuse('E_POWER', `${rec.name} has no Power this phase`)
  if (!allowRepeat && p.phase.used.includes(inst.id)) refuse('E_USED', `${rec.name} was already used this phase`)
  return { inst, rec }
}

const drawUse: Handler<Of<'draw.use'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['draw', 'drawPerCropField'])
  const e = rec.effect as Record<string, unknown>
  let draw = Number(e.draw ?? 1)
  const keep = Number(e.keep ?? 1)
  if (rec.effect.op === 'drawPerCropField') {
    const fields = (rec.requires?.structures ?? []).flatMap((sid) => structuresOf(p, sid)).filter((s) => isPowered(p, d, s.id)).length
    draw = Math.min(Number(e.maxDraw ?? 5), fields)
  }
  const spec = { deck: (e.deck === 'boost' ? 'boost' : 'item') as 'item' | 'boost', itemClass: e.itemClass as string | undefined, boostType: e.boostType as string | undefined, draw, keep }
  const decks = ensureDecks(d, p)
  const ids = drawIds(d, p, decks[spec.deck], spec, draw, nextStream(c, p, 'draw.structures'))
  p.phase.pending = { structureId: inst.id, cards: ids.map((id) => mintCard(d, p, id, 'drawn')), keep, spec }
  p.phase.used.push(inst.id)
  p.step = 'draw.structures'
  say(c, p, a.type, `${rec.name}: drew ${ids.join(', ') || 'nothing'}`)
}

const drawModify: Handler<Of<'draw.modify'>> = (c, p, a, d) => {
  enter(p, 'draw.structures')
  const pend = p.phase.pending ?? refuse('E_DRAW', 'no draw to modify')
  const { inst, rec } = usable(p, d, a.structureId, ['modifyDraw'])
  if (rec.effect.how !== a.how) refuse('E_STRUCT', `${rec.name} does ${String(rec.effect.how)}, not ${a.how}`)
  const n = Number(rec.effect.n ?? 1)
  const decks = ensureDecks(d, p)
  const deck = decks[pend!.spec.deck]
  if (a.how === 'keepExtra') pend!.keep += n
  else {
    if (a.how === 'redrawAll') { p.phase.rejects.push(...pend!.cards); pend!.cards = [] } // discarded, not shuffled back (CH p22; SHEET p2)
    const count = a.how === 'redrawAll' ? pend!.spec.draw : n
    const ids = drawIds(d, p, deck, pend!.spec, count, nextStream(c, p, 'draw.structures'))
    pend!.cards.push(...ids.map((id) => mintCard(d, p, id, 'drawn')))
    if (a.how === 'drawExtra') pend!.spec.draw += n
  }
  pend!.modified = a.how
  p.phase.used.push(inst.id)
  say(c, p, a.type, `${rec.name}: ${a.how}`)
}

const drawKeep: Handler<Of<'draw.keep'>> = (c, p, a, d) => {
  enter(p, 'draw.structures')
  const pend = p.phase.pending ?? refuse('E_DRAW', 'nothing is waiting to be kept')
  const want = Math.min(pend!.keep, pend!.cards.length)
  if (a.keep.length !== want || new Set(a.keep).size !== want) refuse('E_KEEP', `keep exactly ${want} card(s)`)
  const kept = a.keep.map((uid) => pend!.cards.find((x) => x.uid === uid) ?? refuse('E_CARD', `${uid} was not drawn`))
  // Draw X keep Y: exactly Y stay; the rest are sold at the end of the phase (SETT-012).
  p.pool.push(...kept)
  p.phase.rejects.push(...pend!.cards.filter((x) => !a.keep.includes(x.uid)))
  p.phase.pending = null
  say(c, p, a.type, `kept ${kept.map((x) => x.defId).join(', ') || 'nothing'}`)
  void d
}

const drawReuse: Handler<Of<'draw.reuse'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['reuse'])
  if (!p.phase.used.includes(a.target) || a.target === inst.id) refuse('E_USED', 'pick a Structure that was already used')
  const tgt = p.structures.find((s) => s.id === a.target)
  if (tgt && structureRec(d, tgt.defId)?.effect.op === 'explore' && structureRec(d, tgt.defId)?.effect.repeatable) refuse('E_USED', 'that Structure is already repeatable')
  p.phase.used = p.phase.used.filter((id) => id !== a.target)
  p.phase.used.push(inst.id)
  say(c, p, a.type, `${rec.name}: ${tgt?.defId ?? a.target} may be used again`)
}

const drawName: Handler<Of<'draw.name'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['nameItem'])
  const tgt = usable(p, d, a.target, ['draw'])
  const spec = tgt.rec.effect as Record<string, unknown>
  if (spec.deck === 'boost') refuse('E_STRUCT', 'name an Item, not a Boost')
  const info = cardInfo(d, a.defId) ?? refuse('E_CARD', `unknown card ${a.defId}`)
  if (info!.unique || info!.kind === 'boost') refuse('E_CARD', 'Uniques and Boosts cannot be named')
  const cls = spec.itemClass as string | undefined
  if (cls && !classesOf(d, a.defId).has(cls as ItemClass)) refuse('E_CARD', `${info!.name} is not a ${cls} card`)
  pay(p, info!.cost)
  p.pool.push(mintCard(d, p, a.defId, 'drawn'))
  p.phase.used.push(inst.id, tgt.inst.id)
  say(c, p, a.type, `${rec.name}: named ${info!.name} for ${info!.cost} caps`)
}

const drawArmorBoost: Handler<Of<'draw.armorBoost'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['armorBoost'])
  const m = p.roster.find((x) => x.id === a.modelId) ?? refuse('E_MODEL', 'no such model')
  if ((m!.armorBoost ?? 0) >= d.armorBoostMax) refuse('E_BOOST', `a model holds at most ${d.armorBoostMax} Armor Boost tokens`)
  m!.armorBoost = (m!.armorBoost ?? 0) + 1
  p.phase.used.push(inst.id)
  say(c, p, a.type, `${rec.name}: +1 Armor Boost on ${m!.unitId}`)
}

const drawRepair: Handler<Of<'draw.repair'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['repairPowerArmor'], true) // a repair is on top of the station's own draw (CH p21, p24)
  const repaired = (p.phase.repaired ??= [])
  if (repaired.includes(inst.id)) refuse('E_USED', `${rec.name} already repaired a suit this phase`)
  if (a.uid) {
    const card = p.pool.find((x) => x.uid === a.uid) ?? refuse('E_CARD', 'no such card in the pool')
    if (!card!.degraded) refuse('E_CARD', 'that suit is not degraded')
    delete card!.degraded
  } else {
    const m = p.roster.find((x) => x.id === a.modelId)
    if (!m?.degraded?.length) refuse('E_CARD', 'no degraded suit to repair')
    m!.degraded!.shift()
    if (!m!.degraded!.length) delete m!.degraded
  }
  repaired.push(inst.id)
  say(c, p, a.type, `${rec.name}: one suit repaired`)
}

function pickExplore(c: Campaign, p: CampaignPlayer, d: CampaignData): string {
  const deck = ensureDecks(d, p).explore
  const id = nextStream(c, p, 'draw.explore').pick(deck) ?? refuse('E_DECK', 'the Explore Deck is empty')
  deck.splice(deck.indexOf(id), 1)
  return id
}

const drawExplore: Handler<Of<'draw.explore'>> = (c, p, a, d) => {
  startDraw(c, p)
  const { inst, rec } = usable(p, d, a.structureId, ['explore'], true)
  const repeat = !!rec.effect.repeatable
  if (!repeat && p.phase.used.includes(inst.id)) refuse('E_USED', `${rec.name} was already used this phase`)
  // Items for the test are committed before the draw; the draw itself never enters the pool (EXPL-001, EXPL-003).
  for (const uid of a.commit ?? []) poolCard(p, uid)
  const cost = Number(rec.effect.capsPerUse ?? 0)
  pay(p, cost)
  const cardId = pickExplore(c, p, d)
  p.phase.explore = { structureId: inst.id, cardId, tested: false, committed: [...(a.commit ?? [])] }
  if (repeat) p.phase.listeningUses += 1
  else p.phase.used.push(inst.id)
  p.step = 'draw.explore'
  say(c, p, a.type, `${rec.name}: Explore card ${cardId}${cost ? ` (-${cost} caps)` : ''}`)
}

const drawExploreRedraw: Handler<Of<'draw.explore.redraw'>> = (c, p, a, d) => {
  enter(p, 'draw.explore')
  const ex = p.phase.explore ?? refuse('E_DRAW', 'no Explore card is open')
  if (ex!.tested) refuse('E_TESTED', 'a test was already attempted on this card (EXPL-005)')
  const { inst, rec } = usable(p, d, a.structureId, ['exploreRedraw'])
  ensureDecks(d, p).explore.push(ex!.cardId) // the discarded card goes back; the new draw may not be the same by seed
  ex!.cardId = pickExplore(c, p, d)
  p.phase.used.push(inst.id)
  say(c, p, a.type, `${rec.name}: re-drew ${ex!.cardId}`)
}

/** The Leader's skill value for an Explore test: attribute from the Leader card's row, -2 to everything if removed (EXPL-002). */
export function exploreSv(p: CampaignPlayer, d: CampaignData, test: { skill?: string; attr?: string; mod?: number }, committed: readonly PoolCard[]): number | null {
  const m = leaderOf(p); const u = m ? unitRec(d, m.unitId) : undefined
  if (!u) return null
  let attr = test.attr as Attr | undefined
  if (test.skill) {
    const row = u.skills.find((s) => s.skill === test.skill)
    if (!row) return null // the Leader lacks the skill: cannot test
    attr = attr ?? row.attr
  }
  if (!attr) return null
  let sv = leaderAttr(p, d, attr) + (test.mod ?? 0)
  if (p.leaderRemoved) sv -= 2 // -2 to every skill and attribute (EXPL-002)
  for (const c of committed) {
    const it = d.items.find((i) => i.id === c.defId)
    for (const e of it?.effects ?? []) if ('op' in e && e.op === 'attrMod' && e.attr === attr) sv += e.n ?? 0
  }
  return sv
}

const drawExploreTest: Handler<Of<'draw.explore.test'>> = (c, p, a, d) => {
  enter(p, 'draw.explore')
  const ex = p.phase.explore ?? refuse('E_DRAW', 'no Explore card is open')
  if (ex!.tested) refuse('E_TESTED', 'already tested')
  const rec = exploreRec(d, ex!.cardId)
  if (!rec?.test) refuse('E_TEST', 'this card has no test')
  const committed = ex!.committed.map((uid) => p.pool.find((x) => x.uid === uid)).filter((x): x is PoolCard => !!x)
  const sv = exploreSv(p, d, rec!.test!, committed)
  const s = nextStream(c, p, 'draw.explore.test')
  const faces = d.dieFaces
  const face = faces.length ? faces[s.int(faces.length)]! : s.int(20) + 1
  const pass = sv !== null && sv >= 1 && face !== 'X' && face <= sv
  ex!.tested = true; ex!.passed = pass
  // Committed limited-use items are used up by the test; food cannot prevent the card's damage (EXPL-003).
  for (const cm of committed) if (d.items.find((i) => i.id === cm.defId)?.limitedUse) p.pool = p.pool.filter((x) => x.uid !== cm.uid)
  say(c, p, a.type, `${rec!.name}: rolled ${face} vs ${sv ?? 'no skill'}: ${pass ? 'pass' : 'fail'}`, { face, sv })
}

function applyOutcome(c: Campaign, p: CampaignPlayer, d: CampaignData, o: ExploreOutcome, source: string): void {
  if (o.when !== 'pay' && o.caps) p.caps = Math.max(0, p.caps + o.caps)
  if (o.items) {
    const deck = ensureDecks(d, p).item
    for (const id of drawIds(d, p, deck, { itemClass: o.itemClass }, o.items, nextStream(c, p, 'draw.explore.items'))) p.pool.push(mintCard(d, p, id, 'explore'))
  }
  // Damage and effects are assigned to models at the next set-up, after the force is picked (EXPL-004).
  if (o.damage) p.exploreEffects.push({ source, damage: o.damage })
  if (o.consequence) addConsequence(p, o.consequence)
  if (o.code) runHook(o.code.code, { campaign: c, player: p, data: d, args: o.code.args ?? {}, stream: nextStream(c, p, 'draw.explore.hook'), source, log: (t) => say(c, p, 'hook', t) })
}

const drawExploreResolve: Handler<Of<'draw.explore.resolve'>> = (c, p, a, d) => {
  enter(p, 'draw.explore')
  const ex = p.phase.explore ?? refuse('E_DRAW', 'no Explore card is open')
  const rec = exploreRec(d, ex!.cardId) ?? refuse('E_DRAW', 'unknown Explore card')
  if (rec!.test && !ex!.tested) refuse('E_TEST', 'make the test first')
  for (const o of rec!.outcomes) {
    if (o.when === 'always' || (o.when === 'pass' && ex!.passed) || (o.when === 'fail' && ex!.tested && !ex!.passed)) applyOutcome(c, p, d, o, rec!.id)
    else if (o.when === 'pay' && a.pay) {
      pay(p, o.payCaps ?? o.caps ?? 0) // a pay outcome's caps is the price (Gun for Hire: 30)
      applyOutcome(c, p, d, { ...o, caps: 0 }, rec!.id)
    }
  }
  p.phase.explore = null
  say(c, p, a.type, `${rec!.name} resolved`)
}

// ---- Step 3 ----
const selectStores: Handler<Of<'select.stores'>> = (c, p, a, d) => {
  enter(p, 'select.stores')
  const cards = a.take.map((uid) => poolCard(p, uid))
  if (new Set(a.take).size !== a.take.length) refuse('E_CARD', 'duplicate card')
  const items = cards.filter((x) => x.kind !== 'boost'), boosts = cards.filter((x) => x.kind === 'boost')
  if (!retainFits(p, d, items.length, boosts.length, 'stores')) refuse('E_STORES', `the working Stores cannot take ${items.length} item(s) and ${boosts.length} boost(s)`)
  if (boosts.length > leaderHighestAttr(p, d)) refuse('E_STORES', `at most ${leaderHighestAttr(p, d)} Boosts (the Leader's highest attribute)`)
  for (const m of items.filter((x) => x.kind === 'mod')) {
    const cls = classesOf(d, m.defId)
    const needsPerk = ['mod', 'armorMod', 'powerArmorMod', 'robotMod', 'creatureMod'].some((k) => cls.has(k as ItemClass))
    if (needsPerk && !modAllowed(d, m.defId, p.perks)) refuse('E_MOD', `${m.defId} needs a Perk the settlement does not hold`)
  }
  rm(p.pool, (x) => a.take.includes(x.uid))
  p.selected.push(...items.map((x) => ({ ...x })))
  p.hand.push(...boosts.map((x) => ({ ...x })))
  say(c, p, a.type, `took ${items.length} item(s) and ${boosts.length} boost(s) into battle`)
  p.step = 'select.lockers'
}

const selectLockers: Handler<Of<'select.lockers'>> = (c, p, a, d) => {
  enter(p, 'select.lockers')
  const cap = working(p, d, 'locker').length * Number(structureRec(d, working(p, d, 'locker')[0]?.defId ?? '')?.effect.items ?? 1)
  if (a.park.length > cap) refuse('E_LOCKERS', `only ${cap} Locker slot(s) work`)
  const cards = a.park.map((uid) => poolCard(p, uid))
  if (cards.some((x) => x.kind === 'boost')) refuse('E_LOCKERS', 'Lockers hold Items, not Boosts')
  rm(p.pool, (x) => a.park.includes(x.uid))
  p.lockers.push(...cards)
  say(c, p, a.type, `parked ${cards.length} item(s)`)
  p.step = 'select.sell'
}

const selectSell: Handler<Of<'select.sell'>> = (c, p, a, d) => {
  enter(p, 'select.sell')
  const rest = [...p.pool, ...p.phase.rejects]
  const total = rest.reduce((n, x) => n + cardValue(d, x.defId), 0)
  p.caps += total
  say(c, p, a.type, `sold ${rest.length} card(s) for ${total} caps`)
  p.pool = []; p.phase.rejects = []
  p.step = 'force.create'
}

// ---- force ----
const forceCreate: Handler<Of<'force.create'>> = (c, p, a, d) => {
  enter(p, 'force.create')
  const plan = a.plan
  if (!plan.members.length) refuse('E_FORCE', 'a force needs at least one model')
  const uids = new Set<string>()
  const cards = new Map<string, PoolCard>([...p.selected, ...p.rewards].map((x) => [x.uid, x]))
  for (const id of plan.members) {
    if (!p.roster.some((m) => m.id === id)) refuse('E_FORCE', `no roster model ${id}`)
    for (const uid of plan.assign[id] ?? []) {
      if (!cards.has(uid)) refuse('E_FORCE', `card ${uid} is not a Step 3 or Quest card`) // only Step 3 cards (SETT-024)
      if (uids.has(uid)) refuse('E_FORCE', `card ${uid} is assigned twice`)
      uids.add(uid)
    }
    const m = p.roster.find((x) => x.id === id)!
    for (const perk of plan.equipPerks[id] ?? []) if (!m.perks.includes(perk)) refuse('E_FORCE', `${id} did not buy ${perk}`)
  }
  for (const id of Object.keys(plan.assign)) if (!plan.members.includes(id)) refuse('E_FORCE', `${id} is not in the force`)
  for (const id of plan.heroic) if (!plan.members.includes(id)) refuse('E_FORCE', 'Heroic goes on a member')
  if (plan.leader) {
    if (!plan.members.includes(plan.leader.modelId)) refuse('E_FORCE', 'the Leader must be in the force')
    if (p.leader && (p.leader.modelId !== plan.leader.modelId || p.leader.card !== plan.leader.card)) refuse('E_LEADER', 'the Leader is fixed once the Settlement Phase starts')
    if (!d.leaders.some((l) => l.id === plan.leader!.card)) refuse('E_FORCE', 'unknown Leader card')
  }
  for (const [id, list] of Object.entries(plan.standard ?? {})) {
    const m = p.roster.find((x) => x.id === id)
    if (!plan.members.includes(id) || !m) refuse('E_FORCE', `${id} is not in the force`)
    const have = standardEquipment(d, m!.unitId)
    for (const item of list) if (!have.includes(item)) refuse('E_FORCE', `${item} is not standard equipment for ${m!.unitId}`)
  }
  // A linked-scenario result may have moved this force's limit (CAMP-016).
  const limit = plan.capsLimit + (p.capsLimitDelta ?? 0)
  const value = forceValue(p, d, plan)
  if (value > limit) refuse('E_FORCE', `force value ${value} is over the ${limit} caps limit`)
  for (const m of p.roster) {
    m.equipped = plan.members.includes(m.id) ? [...(plan.assign[m.id] ?? [])] : []
    m.perksEquipped = plan.members.includes(m.id) ? [...(plan.equipPerks[m.id] ?? [])] : []
  }
  if (plan.leader && !p.leader) p.leader = plan.leader
  p.force = { ...plan, leader: plan.leader ?? p.leader, capsLimit: limit, value }
  say(c, p, a.type, `force of ${plan.members.length} model(s), ${value}/${limit} caps`)
  p.step = 'force.quest'
}

/** The card a Quest title is on for this player: Part 1 until a completed card names the next part (QUEST-002). */
export function questCardFor(d: CampaignData, p: CampaignPlayer, idOrTitle: string): QuestRec | undefined {
  const prog = p.quests.find((q) => q.title === idOrTitle || q.card === idOrTitle)
  if (prog) return questRec(d, prog.card)
  const direct = questRec(d, idOrTitle)
  const title = direct?.title ?? idOrTitle
  const parts = d.quests.filter((q) => q.title === title)
  return parts.find((q) => !q.part || q.part === '1') ?? parts[0]
}

/** Random Boosts owed from Quests join the hand at the next battle's start, drawn by the seat's own stream (BOOST-005). */
function drawOwedBoosts(c: Campaign, p: CampaignPlayer, d: CampaignData): void {
  if (p.boostsOwed <= 0) return
  const ids = drawIds(d, p, d.boosts.map((b) => b.id), {}, p.boostsOwed, nextStream(c, p, 'owed-boosts'))
  p.hand.push(...ids.map((id) => mintCard(d, p, id, 'hand')))
  say(c, p, 'boost.owed', `drew ${p.boostsOwed} owed Boost(s): ${ids.join(', ') || 'none left'}`)
  p.boostsOwed = 0
}

const forceQuest: Handler<Of<'force.quest'>> = (c, p, a, d) => {
  enter(p, 'force.quest')
  drawOwedBoosts(c, p, d)
  if (a.questId === null) { p.quest = null; p.step = 'toBattle'; return }
  const rec = questCardFor(d, p, a.questId) ?? refuse('E_QUEST', `unknown Quest ${a.questId}`)
  const prog = p.quests.find((q) => q.title === rec!.title)
  if (prog?.completed.includes(rec!.id) && !rec!.repeatable) refuse('E_QUEST', 'each Quest card completes once')
  if (prog?.failed.includes(rec!.id) && rec!.noRetry) refuse('E_QUEST', 'this card cannot be retried')
  // Teammates in co-op never run the same Quest (QUEST-007).
  if (p.team) for (const o of c.players) if (o !== p && o.team === p.team && o.quest && questRec(d, o.quest)?.title === rec!.title) refuse('E_QUEST', 'a teammate already runs this Quest')
  p.quest = rec!.id
  say(c, p, a.type, `Quest ${rec!.title} (${rec!.id}) chosen`)
  p.step = 'toBattle'
}

const rosterAdd: Handler<Of<'roster.add'>> = (c, p, a, d) => {
  const u = unitRec(d, a.unitId) ?? refuse('E_UNIT', `unknown unit ${a.unitId}`)
  if (u!.faction && u!.faction !== p.faction) refuse('E_UNIT', `${u!.name} is not in the ${p.faction} faction`)
  if (u!.unique && p.roster.some((m) => unitRec(d, m.unitId)?.id === u!.id || (u!.versionGroup && unitRec(d, m.unitId)?.versionGroup === u!.versionGroup))) refuse('E_UNIT', `${u!.name} is unique`)
  p.roster.push({ id: `m${++p.uidSeq}`, unitId: u!.id, ...(a.name ? { name: a.name } : {}), injuries: [], xp: 0, perks: [], equipped: [] })
}
const rosterRemove: Handler<Of<'roster.remove'>> = (c, p, a) => {
  if (p.leader?.modelId === a.modelId) refuse('E_UNIT', 'the Leader cannot be removed')
  if (!p.roster.some((m) => m.id === a.modelId)) refuse('E_UNIT', 'no such model')
  p.roster = p.roster.filter((m) => m.id !== a.modelId)
}

const questComplete: Handler<Of<'quest.complete'>> = (c, p, a, d) => {
  // Rewards apply at battle end; one card per battle (QUEST-003).
  if (!p.quest) refuse('E_QUEST', 'no Quest is in play (a card ends Quest play for the battle)')
  if (p.quest !== a.cardId) refuse('E_QUEST', 'that is not the Quest card in play')
  const rec = questRec(d, a.cardId) ?? refuse('E_QUEST', 'unknown Quest card')
  let prog = p.quests.find((q) => q.title === rec.title)
  if (!prog) { prog = { title: rec.title, card: rec.id, completed: [], failed: [] } as QuestProgress; p.quests.push(prog) }
  if (!prog.completed.includes(rec.id)) prog.completed.push(rec.id)
  prog.failed = prog.failed.filter((x) => x !== rec.id)
  const nexts = rec.next ?? []
  const next = a.next ?? nexts[0]
  if (a.next && !nexts.includes(a.next)) refuse('E_QUEST', 'that part is not named by the completed card') // QUEST-002
  if (next) prog.card = next
  const reward = rec.reward?.[a.outcome ?? 0]
  if (reward) {
    if (reward.caps) p.caps += reward.caps
    // Reward items belong to the earner, bypass Stores and never enter the Item Deck (QUEST-005, QUEST-006).
    for (const id of reward.items ?? []) { const card = mintCard(d, p, id, 'quest'); p.rewards.push(card) }
    if (reward.consequence) addConsequence(p, reward.consequence)
    if (a.swapReward) p.boostsOwed += 2 // a settlement-only reward swapped for two random Boosts (BOOST-005, CH p6)
    else {
      if (reward.boosts) p.boostsOwed += reward.boosts
      if (reward.code) runHook(reward.code.code, { campaign: c, player: p, data: d, args: reward.code.args ?? {}, stream: nextStream(c, p, 'quest.reward'), source: rec.id, log: (t) => say(c, p, 'hook', t) })
    }
  } else if (a.swapReward) p.boostsOwed += 2
  p.quest = null
  say(c, p, a.type, `Quest card ${rec.id} completed`)
}

const stepNext: Handler<Of<'step.next'>> = (c, p, _a, d) => {
  const nxt = stepAfter(p.step) ?? refuse('E_STEP', 'already at the last step')
  if (GROUP[p.step] === 0 && idx(p.step) < idx('afterBattle.sell') && p.phase.gathered.length) refuse('E_STEP', 'retain and sell the gathered cards first')
  if (GROUP[p.step] === 2 && (p.phase.pending || p.phase.explore)) refuse('E_STEP', 'resolve the open draw first')
  if (GROUP[nxt] === 1 && p.phase.drawn && nxt !== 'build.market') {
    // Build is closed: jump over it to the draw step.
    p.step = 'draw.structures'; return
  }
  if (nxt === 'toBattle') drawOwedBoosts(c, p, d)
  p.step = nxt
}

const HANDLERS: { [K in CampaignAction['type']]: Handler<Of<K>> } = {
  'afterBattle.caps': afterBattleCaps, 'afterBattle.strip': afterBattleStrip, 'afterBattle.result': afterBattleResult, 'afterBattle.retain': afterBattleRetain,
  'afterBattle.lockers': afterBattleLockers, 'afterBattle.sell': afterBattleSell, 'afterBattle.leader': afterBattleLeader,
  'build.market': buildMarket, 'build.structures': buildStructures, 'build.perks': buildPerks, 'build.power': buildPower,
  'draw.use': drawUse, 'draw.modify': drawModify, 'draw.keep': drawKeep, 'draw.reuse': drawReuse, 'draw.name': drawName,
  'draw.armorBoost': drawArmorBoost, 'draw.repair': drawRepair, 'draw.explore': drawExplore, 'draw.explore.redraw': drawExploreRedraw,
  'draw.explore.test': drawExploreTest, 'draw.explore.resolve': drawExploreResolve,
  'select.stores': selectStores, 'select.lockers': selectLockers, 'select.sell': selectSell,
  'force.create': forceCreate, 'force.quest': forceQuest, 'roster.add': rosterAdd, 'roster.remove': rosterRemove,
  'quest.complete': questComplete, 'step.next': stepNext,
}

/** Apply one action. Pure: the input campaign is untouched. Throws CampaignError when the action is illegal. */
export function reduce(c: Campaign, action: CampaignAction, d: CampaignData): Campaign {
  const next = structuredClone(c)
  const p = seatOf(next, action.seat)
  const h = HANDLERS[action.type] as unknown as Handler<CampaignAction>
  const mark = next.log.length
  h(next, p, action, d)
  if (p.caps < 0) p.caps = 0 // the balance never goes below 0 (CAMP-012)
  // The log keeps every action, so replaying it from the seed rebuilds the campaign (CAMP-008).
  if (next.log.length === mark) say(next, p, action.type, action.type)
  const first = next.log[mark]!
  first.data = { ...first.data, action }
  return next
}

/** The actions recorded in a campaign's log, in order (the replay script). */
export function actionsFromLog(c: Campaign): CampaignAction[] {
  return c.log.flatMap((e) => (e.data && 'action' in e.data ? [e.data.action as CampaignAction] : []))
}

export type ReduceResult = { ok: true; campaign: Campaign } | { ok: false; code: string; message: string }
export function tryReduce(c: Campaign, action: CampaignAction, d: CampaignData): ReduceResult {
  try { return { ok: true, campaign: reduce(c, action, d) } } catch (e) {
    if (e instanceof CampaignError) return { ok: false, code: e.code, message: e.message }
    throw e
  }
}

/** Replay a list of actions from a starting campaign (CAMP-008). */
export function replay(start: Campaign, actions: readonly CampaignAction[], d: CampaignData): Campaign {
  return actions.reduce((c, a) => reduce(c, a, d), start)
}
