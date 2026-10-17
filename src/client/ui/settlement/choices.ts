// What a player can decide in each step, built from the campaign record and the campaign data (spec 19 s3-s5, s7).
// Pure: no React, no storage. Each Choice carries the exact CampaignAction the reducer takes; the reducer stays the judge of
// whether it is allowed (its message is shown when it refuses). The checks made here only grey a button out (not enough caps,
// the Build window is closed) and all come from src/campaign/rules.ts; no rule of ours lives in this file.
import type { CampaignData, StructureRec } from '../../../campaign/data'
import { cardInfo, cardValue, perkRec, powerNeed, structureRec, unitRec } from '../../../campaign/data'
import { buyBlocker, DEFAULT_FORCE_LIMIT, FORCE_LIMITS, forceValue, isLand, isPowered, powerPlan, questCredit, scrapRefund } from '../../../campaign/rules'
import { hasDecision } from '../../../campaign/sequence'
import { STEP_IDS, type Campaign, type CampaignAction, type CampaignPlayer, type PoolCard, type StepId } from '../../../campaign/types'
import type { Choice, StepState, StepView } from './model'
import { nameFromId } from './stepCopy'

const KIND_LABEL: Record<string, string> = { weapon: 'Weapons', armor: 'Armor and clothing', item: 'Items', mod: 'Mods', boost: 'Boosts' }
const GROUP_LABEL: Record<string, string> = {
  infrastructure: 'Power and water', crafting: 'Workshops', item: 'Shops', boost: 'Boost racks', other: 'Other buildings', exploration: 'Scouting', land: 'Land',
}

export const kindLabel = (k: string): string => KIND_LABEL[k] ?? nameFromId(k)

// ---------- names ----------
export function cardName(d: CampaignData, defId: string): string { return cardInfo(d, defId)?.name ?? nameFromId(defId) }
export const structureName = (d: CampaignData, defId: string): string => structureRec(d, defId)?.name ?? nameFromId(defId)
export const perkName = (d: CampaignData, id: string): string => perkRec(d, id)?.name ?? nameFromId(id)
export const unitName = (d: CampaignData, id: string): string => unitRec(d, id)?.name ?? nameFromId(id)
const modelName = (d: CampaignData, name: string | undefined, unitId: string): string => name ?? unitName(d, unitId)
const capFirst = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) + (t.endsWith('.') ? '' : '.') : t)

export function poolLabel(d: CampaignData, c: PoolCard): { name: string; note: string } {
  const bits: string[] = []
  if (c.unique) bits.push('unique')
  if (c.degraded) bits.push('degraded')
  if (c.spent) bits.push('used')
  if (c.mods?.length) bits.push(`mods: ${c.mods.map((m) => cardName(d, m)).join(', ')}`)
  return { name: cardName(d, c.defId), note: bits.join(', ') }
}

// ---------- the sequence ----------
/**
 * The step the screen shows as current. Using a scouting building puts the campaign on the Explore step; once that card is
 * resolved the player is still in the draw phase, so the screen goes back to "use your buildings".
 */
export function shownStep(p: CampaignPlayer): StepId {
  return p.step === 'draw.explore' && !p.phase.explore ? 'draw.structures' : p.step
}
export function stepIndex(p: CampaignPlayer): number { return Math.max(0, STEP_IDS.indexOf(shownStep(p))) }
function stepStateOf(p: CampaignPlayer, i: number): StepState {
  const cur = stepIndex(p)
  return i < cur ? 'done' : i === cur ? 'current' : 'later'
}

const act = (a: CampaignAction): CampaignAction => a
const cardChoice = (d: CampaignData, c: PoolCard, extra: Partial<Choice> = {}): Choice => {
  const l = poolLabel(d, c)
  return { id: c.uid, label: l.name, detail: [kindLabel(c.kind), l.note].filter(Boolean).join(', '), cost: cardValue(d, c.defId), group: kindLabel(c.kind), action: null, ...extra }
}

/** All steps with their choices for one player (solo campaigns have one). */
export function stepsFor(c: Campaign, d: CampaignData, seatIndex = 0): StepView[] {
  const p = c.players[seatIndex]
  if (!p) return []
  return STEP_IDS.map((id, i) => buildStep(c, id, i, p, d))
}

function buildStep(c: Campaign, id: StepId, i: number, p: CampaignPlayer, d: CampaignData): StepView {
  const s: StepView = { id, title: '', blurb: '', decision: '', choices: [], auto: false, optional: true, state: stepStateOf(p, i), finish: null }
  if (s.state !== 'current') return s
  const seat = p.seat
  // Steps with nothing to decide run on their own (the layer's autoAdvance); one that stops here is waiting for something else.
  if (id !== 'toBattle' && !hasDecision(c, seat, d, id)) return { ...s, auto: true }
  switch (id) {
    case 'afterBattle.caps':
    case 'afterBattle.strip':
    case 'afterBattle.lockers':
    case 'afterBattle.sell':
    case 'select.sell':
    case 'toBattle':
      return { ...s, auto: true }

    case 'afterBattle.retain': {
      const normal = p.phase.gathered.filter((x) => !x.unique)
      const uniques = p.phase.gathered.filter((x) => x.unique)
      return {
        ...s,
        choices: [
          ...normal.map((x) => cardChoice(d, x)),
          ...uniques.map((x) => cardChoice(d, x, { id: `sell:${x.uid}`, group: 'Unique items (kept free; pick one to sell it instead)', label: `Sell ${cardName(d, x.defId)}` })),
        ],
        multi: {
          min: 0, max: Math.max(1, p.phase.gathered.length), confirmLabel: 'Keep these',
          confirm: (ids) => act({ type: 'afterBattle.retain', seat, keep: ids.filter((x) => !x.startsWith('sell:')), sellUniques: ids.filter((x) => x.startsWith('sell:')).map((x) => x.slice(5)) }),
        },
      }
    }

    case 'afterBattle.leader':
      return {
        ...s,
        choices: p.roster.filter((m) => m.id !== p.leader?.modelId).map((m) => ({
          id: m.id, label: `Give the leader card to ${modelName(d, m.name, m.unitId)}`, detail: p.leader ? `Card: ${nameFromId(p.leader.card)}` : undefined,
          action: act({ type: 'afterBattle.leader', seat, modelId: m.id }),
        })),
      }

    case 'build.market': {
      const mk = p.phase.market
      if (mk) {
        return {
          ...s, choices: mk.cards.map((x) => cardChoice(d, x)), optional: false,
          multi: { min: 0, max: mk.cards.length, confirmLabel: 'Buy these', confirm: (ids) => act({ type: 'build.market', seat, structureId: mk.structureId, buy: ids }) },
        }
      }
      const markets = p.structures.filter((x) => structureRec(d, x.defId)?.effect.op === 'market' && !p.phase.marketsDone.includes(x.id))
      return { ...s, choices: markets.map((x) => ({ id: x.id, label: `Open the ${structureName(d, x.defId)}`, action: act({ type: 'build.market', seat, structureId: x.id }) })) }
    }

    case 'build.structures':
      return { ...s, choices: structureChoices(p, d) }

    case 'build.perks':
      return { ...s, choices: perkChoices(p, d) }

    case 'build.power': {
      const need = p.structures.filter((x) => powerNeed(structureRec(d, x.defId) ?? ({ power: 0 } as StructureRec)) > 0)
      const { supply, need: demand } = powerTotals(p, d)
      return {
        ...s, optional: false, decision: `You make ${supply} power and want ${demand}. Pick the buildings that stay dark until you are within supply.`,
        choices: need.map((x) => ({ id: x.id, label: structureName(d, x.defId), detail: 'Stays dark this visit', action: null })),
        multi: { min: 0, max: need.length, confirmLabel: 'Leave these dark', confirm: (ids) => act({ type: 'build.power', seat, dark: ids }) },
      }
    }

    case 'draw.structures':
      return drawStep(s, p, d)

    case 'draw.explore':
      return exploreStep(s, p, d)

    case 'select.stores':
      return {
        ...s, choices: p.pool.map((x) => cardChoice(d, x)),
        multi: { min: 0, max: Math.max(1, p.pool.length), confirmLabel: 'Take these into battle', confirm: (ids) => act({ type: 'select.stores', seat, take: ids }) },
      }

    case 'select.lockers':
      return {
        ...s, choices: p.pool.filter((x) => x.kind !== 'boost').map((x) => cardChoice(d, x)),
        multi: { min: 0, max: Math.max(1, p.pool.length), confirmLabel: 'Lock these away', confirm: (ids) => act({ type: 'select.lockers', seat, park: ids }) },
      }

    case 'force.create':
      return forceStep(s, p, d)

    case 'force.quest':
      return { ...s, choices: questChoices(p, d) }
  }
}

// ---------- power ----------
/** Power made and wanted with nothing left dark yet (the campaign layer's own plan, spec 19 s4.1). */
export function powerTotals(p: CampaignPlayer, d: CampaignData): { supply: number; need: number } {
  const raw = powerPlan({ ...p, phase: { ...p.phase, darkChoice: [] } }, d)
  // Short: the plan darkened buildings to fit, so the true want is the supply plus what is missing.
  return { supply: raw.powerSupply, need: raw.shortfall > 0 ? raw.powerSupply + raw.shortfall : raw.powerNeed }
}

// ---------- build ----------
function structureChoices(p: CampaignPlayer, d: CampaignData): Choice[] {
  const seat = p.seat
  const closed = p.phase.drawn
  const out: Choice[] = []
  for (const rec of d.structures) {
    if (rec.starting && !rec.cost) continue
    const owned = p.structures.filter((x) => x.defId === rec.id).length
    const needs: string[] = []
    if (rec.requires?.perks?.length) needs.push(`needs one perk of: ${rec.requires.perks.map((x) => perkName(d, x)).join(', ')}`)
    if (rec.requires?.structures?.length) needs.push(`needs ${rec.requires.structures.map((x) => structureName(d, x)).join(', ')}`)
    const why = buyBlocker(p, d, rec)
    const land = isLand(rec)
    const questsAlt = rec.questsAlt ?? 5
    const blocked = closed ? 'Building is closed until after the next battle.' : why ? capFirst(why) : p.caps < rec.cost && !(land && questCredit(p) >= questsAlt) ? 'Not enough caps.' : undefined
    out.push({
      id: `buy:${rec.id}`, label: rec.name, cost: rec.cost, group: GROUP_LABEL[rec.group] ?? nameFromId(rec.group),
      detail: [owned ? `you have ${owned}` : '', ...needs].filter(Boolean).join('; ') || undefined, ...(blocked ? { blocked } : {}),
      action: act({ type: 'build.structures', seat, op: 'buy', defId: rec.id, ...(land && p.caps < rec.cost ? { pay: 'quests' as const } : {}) }),
    })
  }
  for (const x of p.structures) {
    const rec = structureRec(d, x.defId)
    out.push({
      id: `scrap:${x.id}`, label: `Scrap ${structureName(d, x.defId)}`, cost: -scrapRefund(rec), group: 'Scrap a building',
      detail: 'Half its price back; buildings that need it go too.', ...(closed ? { blocked: 'Building is closed until after the next battle.' } : {}),
      action: act({ type: 'build.structures', seat, op: 'scrap', structureId: x.id }),
    })
  }
  return out
}

function perkChoices(p: CampaignPlayer, d: CampaignData): Choice[] {
  const seat = p.seat
  const out: Choice[] = []
  for (const rec of d.perks) {
    const who = rec.settlementWide ? [{ id: undefined as string | undefined, label: 'Whole settlement' }] : p.roster.map((m) => ({ id: m.id as string | undefined, label: modelName(d, m.name, m.unitId) }))
    for (const w of who) {
      const owned = w.id === undefined ? p.perks.includes(rec.id) : (p.roster.find((m) => m.id === w.id)?.perks ?? []).includes(rec.id)
      const blocked = owned ? 'Already owned.' : p.caps < rec.cost ? 'Not enough caps.' : w.id && p.phase.perkBought.includes(w.id) ? 'One new perk per model each visit.' : p.phase.drawn ? 'Building is closed until after the next battle.' : undefined
      out.push({
        id: `perk:${rec.id}:${w.id ?? 'settlement'}`, label: rec.name, cost: rec.cost, group: w.label, detail: rec.text, ...(blocked ? { blocked } : {}),
        action: act({ type: 'build.perks', seat, op: 'buy', perkId: rec.id, ...(w.id ? { modelId: w.id } : {}) }),
      })
    }
  }
  return out
}

// ---------- draw ----------
function drawStep(s: StepView, p: CampaignPlayer, d: CampaignData): StepView {
  const seat = p.seat
  const pend = p.phase.pending
  if (pend) {
    const want = Math.min(pend.keep, pend.cards.length)
    const extra: Choice[] = []
    if (!pend.modified) {
      for (const x of p.structures) {
        const eff = structureRec(d, x.defId)?.effect as { op?: string; how?: 'redrawAll' | 'drawExtra' | 'keepExtra' } | undefined
        if (eff?.op !== 'modifyDraw' || !eff.how || p.phase.used.includes(x.id) || !isPowered(p, d, x.id)) continue
        extra.push({
          id: `mod:${x.id}`, label: `Use the ${structureName(d, x.defId)}`, group: 'Brahmin help',
          detail: eff.how === 'redrawAll' ? 'Draw all of these again.' : eff.how === 'drawExtra' ? 'Draw one more card.' : 'Keep one more card.',
          action: act({ type: 'draw.modify', seat, how: eff.how, structureId: x.id }),
        })
      }
    }
    return {
      ...s, optional: false, decision: `Keep ${want} of the ${pend.cards.length} cards on the table; the rest are sold.`,
      choices: [...pend.cards.map((x) => cardChoice(d, x, { group: 'On the table' })), ...extra],
      multi: { min: want, max: want, confirmLabel: 'Keep these', confirm: (ids) => act({ type: 'draw.keep', seat, keep: ids }) },
    }
  }
  const choices: Choice[] = []
  const gear = p.pool.filter((x) => x.kind !== 'boost')
  for (const x of p.structures) {
    const rec = structureRec(d, x.defId)
    if (!rec) continue
    const used = p.phase.used.includes(x.id)
    const blocked = used ? 'Already used this visit.' : !isPowered(p, d, x.id) ? 'No power this visit.' : undefined
    const name = rec.name
    // A Structure can offer more than one use: its main effect, an alternative (Armor Workbench) or an extra (Power Armor Station, CH p21, p24).
    for (const eff of [rec.effect, ...(rec.alternatives ?? []), ...(rec.extra ?? [])]) {
      const op = String(eff.op)
      if (op === 'draw' || op === 'drawPerCropField') {
        choices.push({ id: `use:${x.id}`, label: `Use the ${name}`, group: 'Draw cards', detail: drawDetail(eff), ...(blocked ? { blocked } : {}), action: act({ type: 'draw.use', seat, structureId: x.id }) })
      } else if (op === 'explore') {
        const e = eff as { capsPerUse?: number; repeatable?: boolean }
        const costs = e.capsPerUse ?? 0
        const exBlocked = !e.repeatable && used ? 'Already used this visit.' : !isPowered(p, d, x.id) ? 'No power this visit.' : p.caps < costs ? 'Not enough caps.' : undefined
        choices.push({
          id: `scout:${x.id}`, label: `Scout from the ${name}`, group: 'Scouting', detail: gear.length ? 'Pick gear below first to commit it to the test.' : undefined, ...(costs ? { cost: costs } : {}),
          ...(exBlocked ? { blocked: exBlocked } : {}), action: act({ type: 'draw.explore', seat, structureId: x.id }),
          withPicks: (ids) => act({ type: 'draw.explore', seat, structureId: x.id, ...(ids.length ? { commit: ids } : {}) }),
        })
      } else if (op === 'armorBoost') {
        for (const m of p.roster) {
          const full = (m.armorBoost ?? 0) >= d.armorBoostMax
          const why = blocked ?? (full ? 'Already holds the most tokens allowed.' : undefined)
          choices.push({ id: `armor:${x.id}:${m.id}`, label: `Armor boost for ${modelName(d, m.name, m.unitId)}`, group: name, ...(why ? { blocked: why } : {}), action: act({ type: 'draw.armorBoost', seat, structureId: x.id, modelId: m.id }) })
        }
      } else if (op === 'repairPowerArmor') {
        for (const m of p.roster.filter((r) => r.degraded?.length)) choices.push({ id: `fix:${x.id}:${m.id}`, label: `Repair a suit for ${modelName(d, m.name, m.unitId)}`, group: name, ...(blocked ? { blocked } : {}), action: act({ type: 'draw.repair', seat, structureId: x.id, modelId: m.id }) })
        for (const k of p.pool.filter((r) => r.degraded)) choices.push({ id: `fixc:${x.id}:${k.uid}`, label: `Repair ${cardName(d, k.defId)}`, group: name, ...(blocked ? { blocked } : {}), action: act({ type: 'draw.repair', seat, structureId: x.id, uid: k.uid }) })
      } else if (op === 'reuse') {
        for (const u of p.structures.filter((y) => p.phase.used.includes(y.id) && y.id !== x.id)) {
          choices.push({ id: `reuse:${x.id}:${u.id}`, label: `Use the ${structureName(d, u.defId)} again`, group: name, ...(blocked ? { blocked } : {}), action: act({ type: 'draw.reuse', seat, structureId: x.id, target: u.id }) })
        }
      }
    }
  }
  const scouting = choices.some((x) => x.id.startsWith('scout:'))
  return {
    ...s, choices: [...choices, ...(scouting ? gear.map((x) => cardChoice(d, x, { group: 'Gear to commit to a scouting test' })) : [])],
    ...(scouting && gear.length ? { multi: { min: 0, max: gear.length } } : {}),
  }
}

function drawDetail(eff: StructureRec['effect']): string | undefined {
  const e = eff as { op?: string; draw?: number; keep?: number }
  if (e.op === 'draw' && e.draw !== undefined && e.keep !== undefined) return `Draw ${e.draw}, keep ${e.keep}.`
  if (e.op === 'drawPerCropField') return 'Draw one per crop field, keep one.'
  return undefined
}

function exploreStep(s: StepView, p: CampaignPlayer, d: CampaignData): StepView {
  const seat = p.seat
  const ex = p.phase.explore
  if (!ex) return { ...s, auto: true }
  const card = d.explore.find((e) => e.id === ex.cardId)
  const choices: Choice[] = []
  const scout = p.structures.find((x) => structureRec(d, x.defId)?.effect.op === 'exploreRedraw' && !p.phase.used.includes(x.id) && isPowered(p, d, x.id))
  if (!ex.tested) {
    if (card?.test) choices.push({ id: 'test', label: 'Take the test', group: 'Next', action: act({ type: 'draw.explore.test', seat }) })
    if (scout) choices.push({ id: 'redraw', label: 'Draw a different card', group: 'Next', detail: `${structureName(d, scout.defId)}; only before the test.`, action: act({ type: 'draw.explore.redraw', seat, structureId: scout.id }) })
    if (!card?.test) choices.push({ id: 'resolve', label: 'Resolve the card', group: 'Next', action: act({ type: 'draw.explore.resolve', seat }) })
  } else {
    const pay = card?.outcomes.find((o) => o.when === 'pay')
    const price = pay ? pay.payCaps ?? pay.caps ?? 0 : 0
    if (pay) choices.push({ id: 'pay', label: 'Pay the price', group: 'Next', cost: price, ...(p.caps < price ? { blocked: 'Not enough caps.' } : {}), action: act({ type: 'draw.explore.resolve', seat, pay: true }) })
    choices.push({ id: 'resolve', label: pay ? 'Decline and move on' : 'Resolve the card', group: 'Next', action: act({ type: 'draw.explore.resolve', seat }) })
  }
  return {
    ...s, optional: false, blurb: card?.text ?? s.blurb,
    decision: ex.tested ? (ex.passed ? 'The test passed.' : 'The test failed.') : `${card?.name ?? nameFromId(ex.cardId)}: take the test when you are ready.`,
    choices,
  }
}

// ---------- force and quest ----------
export type ForcePlanInput = Extract<CampaignAction, { type: 'force.create' }>['plan']

/**
 * A sensible force: the leader first, then the roster in order while the value stays inside `limit`, then the chosen gear handed
 * round the table (each card goes to the first model it still fits on). Values come from the layer's own forceValue.
 */
export function autoForce(p: CampaignPlayer, d: CampaignData, limit: number): ForcePlanInput {
  const order = [...p.roster].sort((a, b) => (a.id === p.leader?.modelId ? -1 : 0) - (b.id === p.leader?.modelId ? -1 : 0))
  const plan: ForcePlanInput = { members: [], assign: {}, equipPerks: {}, heroic: [], leader: p.leader, capsLimit: limit }
  const fits = () => forceValue(p, d, plan) <= limit
  for (const m of order) {
    plan.members.push(m.id); plan.assign[m.id] = []; plan.equipPerks[m.id] = []
    if (!fits()) { plan.members.pop(); delete plan.assign[m.id]; delete plan.equipPerks[m.id] }
  }
  if (!plan.members.length && order[0]) { plan.members.push(order[0].id); plan.assign[order[0].id] = []; plan.equipPerks[order[0].id] = [] }
  // Perks the models bought are worth their price only when equipped: put each on while the force still fits (CH p24).
  for (const id of plan.members) {
    for (const perk of p.roster.find((m) => m.id === id)?.perks ?? []) {
      plan.equipPerks[id]!.push(perk)
      if (!fits()) plan.equipPerks[id]!.pop()
    }
  }
  for (const card of [...p.selected, ...p.rewards]) {
    for (const id of plan.members) {
      plan.assign[id]!.push(card.uid)
      if (fits()) break
      plan.assign[id]!.pop()
    }
  }
  return plan
}

function forceStep(s: StepView, p: CampaignPlayer, d: CampaignData): StepView {
  const seat = p.seat
  // Every unit is on offer (CH p24); its price counts inside the force value, nothing is paid here.
  const hire = d.units.filter((u) => u.faction === p.faction).map((u) => ({
    id: `hire:${u.id}`, label: `Hire ${u.name}`, group: 'Hire a unit', detail: 'counts toward the force limit', action: act({ type: 'roster.add', seat, unitId: u.id }),
  }))
  const auto: Choice[] = FORCE_LIMITS.map((z) => ({
    id: `auto:${z.id}`, label: `Pick a ${z.label.toLowerCase()} force for me (${z.caps} caps)`, group: 'Quick pick',
    detail: 'Leader first, then your roster in order, with your bought perks and chosen gear.', action: act({ type: 'force.create', seat, plan: autoForce(p, d, z.caps) }),
  }))
  const members: Choice[] = p.roster.map((m) => ({ id: m.id, label: modelName(d, m.name, m.unitId), cost: unitRec(d, m.unitId)?.cost, detail: p.leader?.modelId === m.id ? 'Leader' : undefined, group: 'Pick who fights', action: null }))
  // Perks a model bought can be equipped for the fight (CH p24); Heroic cards go on any fielded model.
  const perks: Choice[] = p.roster.flatMap((m) => m.perks.map((perk) => ({
    id: `perk:${m.id}:${perk}`, label: `${perkName(d, perk)} on ${modelName(d, m.name, m.unitId)}`, cost: perkRec(d, perk)?.cost, group: 'Equip a perk', action: null,
  })))
  const heroic: Choice[] = (d.heroicCost ?? 0) > 0 ? p.roster.map((m) => ({
    id: `heroic:${m.id}`, label: `Heroic card for ${modelName(d, m.name, m.unitId)}`, cost: d.heroicCost, group: 'Heroic cards', action: null,
  })) : []
  const dismiss: Choice[] = p.roster.filter((m) => m.id !== p.leader?.modelId).map((m) => ({ id: `drop:${m.id}`, label: `Send ${modelName(d, m.name, m.unitId)} home`, group: 'Send home', action: act({ type: 'roster.remove', seat, modelId: m.id }) }))
  const cardUids = [...p.selected, ...p.rewards].map((x) => x.uid)
  const limit = p.force?.capsLimit ?? DEFAULT_FORCE_LIMIT
  const toggles = [...members, ...perks, ...heroic]
  return {
    ...s, optional: false,
    decision: p.force ? `Your force is set: ${p.force.members.length} model${p.force.members.length === 1 ? '' : 's'}, ${p.force.value} of ${p.force.capsLimit} caps. Change it, or head to battle.` : 'Pick who fights, or take a quick pick.',
    choices: [...auto, ...toggles, ...hire, ...dismiss],
    multi: {
      min: 1, max: Math.max(1, toggles.length), confirmLabel: 'Field these models',
      confirm: (ids) => {
        const fielded = ids.filter((id) => p.roster.some((m) => m.id === id))
        const assign: Record<string, string[]> = {}
        const equipPerks: Record<string, string[]> = {}
        fielded.forEach((id) => { assign[id] = []; equipPerks[id] = [] })
        if (fielded.length) cardUids.forEach((uid, i) => { assign[fielded[i % fielded.length]!]!.push(uid) })
        // `perk:<modelId>:<perkId>` and `heroic:<modelId>` only count for a model that is fielded.
        for (const id of ids) {
          const [kind, modelId, ...rest] = id.split(':')
          if (kind === 'perk' && modelId && equipPerks[modelId]) equipPerks[modelId].push(rest.join(':'))
        }
        const heroicIds = ids.filter((id) => id.startsWith('heroic:')).map((id) => id.slice(7)).filter((id) => fielded.includes(id))
        return act({ type: 'force.create', seat, plan: { members: fielded, assign, equipPerks, heroic: heroicIds, leader: p.leader, capsLimit: limit } })
      },
    },
  }
}

function questChoices(p: CampaignPlayer, d: CampaignData): Choice[] {
  const seat = p.seat
  const out: Choice[] = [{ id: 'none', label: 'No quest this time', detail: p.quest === null ? 'Chosen' : undefined, action: act({ type: 'force.quest', seat, questId: null }) }]
  for (const q of d.quests.filter((x) => !x.part || x.part === '1' || p.quests.some((pr) => pr.card === x.id))) {
    const started = p.quests.some((pr) => pr.card === q.id)
    out.push({ id: q.id, label: q.name, detail: [p.quest === q.id ? 'Chosen' : '', q.task ?? ''].filter(Boolean).join(': ') || undefined, group: started ? 'Quests under way' : 'New quests', action: act({ type: 'force.quest', seat, questId: q.id }) })
  }
  return out
}
