// The CH between-battle sequence as a list of named steps with "what the player decides" per step (spec 19 s7).
// The settlement screen renders it generically: one panel per step, the step's legal choices as controls; a step with
// nothing to decide auto-advances (autoAdvance).
import { perkRec, powerNeed, structureRec, type CampaignData } from './data'
import { allOf, buyBlocker, isLand, isPowered, leaderOf, powerPlan, questCredit, working } from './rules'
import { reduce, stepAfter } from './reducer'
import { STEP_IDS, type Campaign, type CampaignAction, type CampaignPlayer, type SeatKey, type StepId } from './types'

export type StepGroup = 'afterBattle' | 'build' | 'draw' | 'select' | 'force' | 'battle'
export interface StepDef {
  id: StepId
  group: StepGroup
  title: string
  /** What the player decides here, in one sentence (our words). */
  decides: string
  /** True for steps the campaign resolves itself. */
  auto: boolean
  /** Source in the Campaign Handbook. */
  source: string
}

export const SEQUENCE: readonly StepDef[] = [
  { id: 'afterBattle.caps', group: 'afterBattle', title: 'Caps award', decides: 'Nothing: the winner and loser are paid.', auto: true, source: 'CH p19' },
  { id: 'afterBattle.strip', group: 'afterBattle', title: 'Strip the force', decides: 'Nothing: cards that are not standard equipment come off.', auto: true, source: 'CH p19' },
  { id: 'afterBattle.retain', group: 'afterBattle', title: 'Retain', decides: 'Which gathered cards each Maintenance Shed keeps, and whether to sell a Unique.', auto: false, source: 'CH p19, p22; ERR p.3' },
  { id: 'afterBattle.lockers', group: 'afterBattle', title: 'Open the Lockers', decides: 'Nothing: parked items rejoin the pool.', auto: true, source: 'SHEET; ERR p.3' },
  { id: 'afterBattle.sell', group: 'afterBattle', title: 'Sell the rest', decides: 'Nothing: everything not kept is sold.', auto: true, source: 'CH p19' },
  { id: 'afterBattle.leader', group: 'afterBattle', title: 'Move the Leader', decides: 'Whether to give the Leader card to another model (only if the Leader was removed).', auto: false, source: 'CH p19, p24' },
  { id: 'build.market', group: 'build', title: 'Markets', decides: 'Which Robot or Creature Mods to buy from the four on the table.', auto: false, source: 'SHEET; ERR p.3' },
  { id: 'build.structures', group: 'build', title: 'Build and scrap', decides: 'Which Structures and Land to buy, and which to scrap.', auto: false, source: 'CH p20-23' },
  { id: 'build.perks', group: 'build', title: 'Perks', decides: 'Which Perks to buy for the settlement or for a model.', auto: false, source: 'CH p24' },
  { id: 'build.power', group: 'build', title: 'Power and water', decides: 'Which Structures stay dark when supply is short.', auto: false, source: 'CH p20-21' },
  { id: 'draw.structures', group: 'draw', title: 'Use the Structures', decides: 'In what order to use each working Structure, and which drawn card to keep.', auto: false, source: 'CH p20-22' },
  { id: 'draw.explore', group: 'draw', title: 'Explore', decides: 'Whether to pay for Explore draws, which items to commit, and whether to pay for a card.', auto: false, source: 'CH p22' },
  { id: 'select.stores', group: 'select', title: 'Select', decides: 'Which pool cards each Stores takes into the next battle.', auto: false, source: 'CH p20, p24' },
  { id: 'select.lockers', group: 'select', title: 'Lockers', decides: 'Which items to park in a Locker instead of selling.', auto: false, source: 'SHEET; ERR p.3' },
  { id: 'select.sell', group: 'select', title: 'Sell what is left', decides: 'Nothing: the rest of the pool is sold.', auto: true, source: 'CH p20' },
  { id: 'force.create', group: 'force', title: 'Create the force', decides: 'Which models fight, their gear and equipped Perks, Heroic cards and the Leader.', auto: false, source: 'CH p24, p26' },
  { id: 'force.quest', group: 'force', title: 'Choose a Quest', decides: 'Which Quest card to run this battle, or none.', auto: false, source: 'CH p6' },
  { id: 'toBattle', group: 'battle', title: 'To battle', decides: 'Scenario, opponent and seed.', auto: false, source: 'CH p27' },
]

export const stepDef = (id: StepId): StepDef => SEQUENCE.find((s) => s.id === id)!

const player = (c: Campaign, seat: SeatKey): CampaignPlayer => c.players.find((p) => p.seat === seat)!

/** True when the step offers the player something to decide right now. */
export function hasDecision(c: Campaign, seat: SeatKey, d: CampaignData, step?: StepId): boolean {
  const p = player(c, seat)
  const id = step ?? p.step
  switch (id) {
    case 'afterBattle.caps': case 'afterBattle.strip': case 'afterBattle.lockers': case 'afterBattle.sell': case 'select.sell': return false
    case 'afterBattle.retain': return p.phase.gathered.length > 0 && allOf(p, d, 'retain').length > 0
    case 'afterBattle.leader': return p.leaderRemoved && p.roster.length > 1 && !p.phase.leaderMoved
    case 'build.market': return !p.phase.used.length && p.structures.some((s) => structureRec(d, s.defId)?.effect.op === 'market' && !p.phase.marketsDone.includes(s.id))
    case 'build.structures': return !p.phase.drawn && d.structures.some((r) => !r.starting && buyBlocker(p, d, r) === null && (r.cost <= p.caps || (isLand(r) && questCredit(p) >= (r.questsAlt ?? 5))))
    case 'build.perks': return !p.phase.drawn && d.perks.some((r) => r.cost <= p.caps && !(r.settlementWide && p.perks.includes(r.id)))
    case 'build.power': return powerPlan(p, d).shortfall > 0
    case 'draw.structures': return !!p.phase.pending || p.structures.some((s) => {
      const e = structureRec(d, s.defId)?.effect
      if (!e || p.phase.used.includes(s.id) || !isPowered(p, d, s.id)) return false
      if (e.op === 'explore') return p.caps >= Number(e.capsPerUse ?? 0)
      return ['draw', 'drawPerCropField', 'repairPowerArmor', 'armorBoost'].includes(String(e.op))
    })
    case 'draw.explore': return !!p.phase.explore
    case 'select.stores': return p.pool.length > 0 && working(p, d, 'stores').length > 0
    case 'select.lockers': return p.pool.some((x) => x.kind !== 'boost') && working(p, d, 'locker').length > 0
    case 'force.create': return true
    case 'force.quest': return d.quests.length > 0
    case 'toBattle': return true
  }
}

/** The steps with no decision run on their own; stops at the first step the player must act on. */
export function autoAdvance(c: Campaign, seat: SeatKey, d: CampaignData): Campaign {
  let cur = c
  for (let guard = 0; guard < 40; guard++) {
    const p = player(cur, seat)
    if (p.step === 'toBattle' || hasDecision(cur, seat, d)) return cur
    // Steps that move cards or caps are real reducer actions; the rest just advance.
    const a: CampaignAction | null =
      p.step === 'afterBattle.lockers' ? { type: 'afterBattle.lockers', seat }
      : p.step === 'afterBattle.sell' ? { type: 'afterBattle.sell', seat }
      : p.step === 'select.sell' ? { type: 'select.sell', seat } : null
    if (a) { cur = reduce(cur, a, d); continue }
    if (p.step === 'afterBattle.caps' || p.step === 'afterBattle.strip') return cur // waits for fromBattle
    if (p.step === 'afterBattle.retain' && p.phase.gathered.length && !allOf(p, d, 'retain').length) {
      cur = reduce(cur, { type: 'afterBattle.retain', seat, keep: [] }, d); continue // no Shed: nothing can be kept
    }
    cur = reduce(cur, { type: 'step.next', seat }, d)
  }
  return cur
}

// ---------- legal choices (what the settlement screen renders) ----------
export interface StepOption { id: string; label: string; action: CampaignAction; enabled: boolean; why?: string }
export interface StepView { step: StepDef; decision: boolean; options: StepOption[]; note?: string }

/** The current step and its legal choices for one seat. Pure and cheap. */
export function describeStep(c: Campaign, seat: SeatKey, d: CampaignData): StepView {
  const p = player(c, seat)
  const step = stepDef(p.step)
  const options: StepOption[] = []
  const opt = (id: string, label: string, action: CampaignAction, enabled = true, why?: string) => options.push({ id, label, action, enabled, ...(why ? { why } : {}) })
  switch (p.step) {
    case 'afterBattle.retain':
      for (const x of p.phase.gathered) opt(x.uid, `Keep ${x.defId}${x.unique ? ' (Unique, no Shed needed)' : ''}`, { type: 'afterBattle.retain', seat, keep: [x.uid] })
      break
    case 'afterBattle.leader':
      for (const m of p.roster) if (m.id !== leaderOf(p)?.id) opt(m.id, `Leader card to ${m.unitId}`, { type: 'afterBattle.leader', seat, modelId: m.id }, p.leaderRemoved && !p.phase.leaderMoved)
      break
    case 'build.market':
      for (const s of p.structures) if (structureRec(d, s.defId)?.effect.op === 'market') opt(s.id, `Draw at the ${structureRec(d, s.defId)!.name}`, { type: 'build.market', seat, structureId: s.id }, !p.phase.marketsDone.includes(s.id))
      break
    case 'build.structures':
      for (const r of d.structures) {
        if (r.starting && r.cost === 0) continue
        const why = buyBlocker(p, d, r) ?? (r.cost > p.caps && !(isLand(r) && questCredit(p) >= (r.questsAlt ?? 5)) ? 'not enough caps' : undefined)
        opt(`buy:${r.id}`, `Buy ${r.name} (${r.cost})`, { type: 'build.structures', seat, op: 'buy', defId: r.id }, !why && !p.phase.drawn, why)
      }
      for (const s of p.structures) opt(`scrap:${s.id}`, `Scrap ${structureRec(d, s.defId)?.name ?? s.defId}`, { type: 'build.structures', seat, op: 'scrap', structureId: s.id })
      break
    case 'build.perks':
      for (const r of d.perks) {
        if (r.settlementWide) opt(`perk:${r.id}`, `${r.name} (${r.cost})`, { type: 'build.perks', seat, op: 'buy', perkId: r.id }, !p.perks.includes(r.id) && r.cost <= p.caps && !!perkRec(d, r.id))
        else for (const m of p.roster) opt(`perk:${r.id}:${m.id}`, `${r.name} for ${m.unitId} (${r.cost})`, { type: 'build.perks', seat, op: 'buy', perkId: r.id, modelId: m.id }, !m.perks.includes(r.id) && r.cost <= p.caps)
      }
      break
    case 'build.power': {
      const plan = powerPlan(p, d)
      for (const s of p.structures) if (powerNeed(structureRec(d, s.defId)!) > 0) opt(s.id, `Leave ${structureRec(d, s.defId)!.name} dark`, { type: 'build.power', seat, dark: [s.id] }, plan.shortfall > 0)
      break
    }
    case 'draw.structures':
      if (p.phase.pending) for (const x of p.phase.pending.cards) opt(x.uid, `Keep ${x.defId}`, { type: 'draw.keep', seat, keep: [x.uid] })
      else for (const s of p.structures) {
        const op = String(structureRec(d, s.defId)?.effect.op)
        if (op === 'draw' || op === 'drawPerCropField') opt(s.id, `Use ${structureRec(d, s.defId)!.name}`, { type: 'draw.use', seat, structureId: s.id }, !p.phase.used.includes(s.id) && isPowered(p, d, s.id))
        if (op === 'explore') opt(s.id, `Explore with ${structureRec(d, s.defId)!.name}`, { type: 'draw.explore', seat, structureId: s.id }, isPowered(p, d, s.id))
      }
      break
    case 'draw.explore':
      if (p.phase.explore) {
        if (!p.phase.explore.tested) opt('test', 'Make the test', { type: 'draw.explore.test', seat })
        opt('resolve', 'Resolve the card', { type: 'draw.explore.resolve', seat }, true)
      }
      break
    case 'select.stores':
      for (const x of p.pool) opt(x.uid, `Take ${x.defId}`, { type: 'select.stores', seat, take: [x.uid] })
      break
    case 'select.lockers':
      for (const x of p.pool) if (x.kind !== 'boost') opt(x.uid, `Park ${x.defId}`, { type: 'select.lockers', seat, park: [x.uid] })
      break
    case 'force.create':
      for (const m of p.roster) opt(m.id, `${m.unitId}${m.name ? ` (${m.name})` : ''}`, { type: 'step.next', seat }, true)
      break
    case 'force.quest':
      for (const q of d.quests.filter((x) => !x.part || x.part === '1' || p.quests.some((pr) => pr.card === x.id))) opt(q.id, q.name, { type: 'force.quest', seat, questId: q.id })
      opt('none', 'No Quest', { type: 'force.quest', seat, questId: null })
      break
    default: break
  }
  return { step, decision: hasDecision(c, seat, d), options, ...(p.step === 'build.market' && !options.length ? { note: 'No market built yet.' } : {}) }
}

export { STEP_IDS, stepAfter }
