// The panels' read of a campaign: header numbers, roster, pool, structures, quests. Pure; names come from the campaign data.
import type { CampaignData } from '../../../campaign/data'
import { eventRec, questRec, structureRec } from '../../../campaign/data'
import { STEP_IDS, type Campaign } from '../../../campaign/types'
import { slotsTotal, powerPlan } from '../../../campaign/rules'
import { cardName, kindLabel, stepIndex, perkName, poolLabel, powerTotals, structureName, unitName } from './choices'
import type { CampaignView, PoolRow } from './model'
import { cardValue } from '../../../campaign/data'
import { groupBy, nameFromId } from './stepCopy'

export function viewOf(c: Campaign, d: CampaignData, seatIndex = 0): CampaignView {
  const p = c.players[seatIndex]
  if (!p) throw new Error('This campaign has no player.')
  const cardOf = (uid: string) => [...p.pool, ...p.selected, ...p.hand, ...p.rewards, ...p.lockers].find((x) => x.uid === uid)
  const counts = groupBy(p.structures, (x) => x.defId)
  const power = powerTotals(p, d)
  const plan = powerPlan(p, d)
  const pool: PoolRow[] = p.pool.map((card) => {
    const l = poolLabel(d, card)
    return { id: card.uid, name: l.name, kind: kindLabel(card.kind), value: cardValue(d, card.defId), ...(l.note ? { note: l.note } : {}) }
  })
  return {
    name: c.name,
    round: c.round,
    caps: p.caps,
    land: p.land,
    structureCount: p.structures.length,
    room: slotsTotal(p, d),
    power: power.need > 0 || power.supply > 0 ? power : null,
    faction: p.faction,
    settlementPerks: p.perks.map((x) => perkName(d, x)),
    handCount: p.hand.length,
    roster: p.roster.map((m) => ({
      id: m.id,
      name: m.name ?? unitName(d, m.unitId),
      unit: unitName(d, m.unitId),
      leader: p.leader?.modelId === m.id,
      perks: m.perks.map((x) => perkName(d, x)),
      injuries: m.injuries.map((i) => nameFromId(i.id)),
      equipped: m.equipped.map((uid) => { const card = cardOf(uid); return card ? cardName(d, card.defId) : nameFromId(uid) }),
    })),
    pool,
    structures: counts.map((g) => {
      const rec = structureRec(d, g.key)
      const dark = stepIndex(p) > STEP_IDS.indexOf('build.power') ? g.items.filter((x) => plan.dark.has(x.id)).length : 0
      return { id: g.key, name: structureName(d, g.key), count: g.items.length, ...(dark ? { powered: false, note: `${dark} without power this visit` } : rec?.provides?.power ? { note: `makes ${rec.provides.power} power` } : {}) }
    }),
    quests: p.quests.map((q) => ({ id: q.card, name: questRec(d, q.card)?.name ?? nameFromId(q.card), progress: `${q.completed.length} done${q.failed.length ? `, ${q.failed.length} failed` : ''}` })),
    log: c.log.filter((e) => e.type !== 'step.next' && e.text !== e.type).slice(-40).map((e) => e.text),
    carry: [
      ...p.consequences.map((id) => eventRec(d, id)?.name ?? nameFromId(id)),
      ...p.exploreEffects.map((e) => `${e.damage} damage waiting from ${nameFromId(e.source)}`),
      ...p.linked.map((l) => l.text),
      ...(p.boostsOwed ? [`${p.boostsOwed} random boost${p.boostsOwed === 1 ? '' : 's'} owed`] : []),
    ],
  }
}
