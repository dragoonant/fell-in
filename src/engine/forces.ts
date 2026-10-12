// Checklist (owner I): FORCE (force building, caps, unique, leaders, heroic, item restrictions). Spec 16.
// Also the stat lookups every module uses. unitOf/baseAttr/skillBase are foundations-implemented from the unit card
// only; I extends attrOf with item, chem and Power Armor bonuses (items.itemMods) without changing signatures.
import type { Attr, EditionBundle, Restriction, ScenarioForce, Skill, UnitDef, UnitSkill } from '../data/types'
import { recordOf } from './edition'
import { itemMods } from './items'
import type { GameState, ModelId } from './types'

export interface ForceProblem { code: string; message: string; unit?: string; item?: string }

/** The unit card of a model (ModelState.profileId = unit record id). */
export function unitOf(state: GameState, bundle: EditionBundle, modelId: ModelId): UnitDef | undefined {
  const m = state.models[modelId]
  return m ? recordOf(bundle, 'units', m.profileId) : undefined
}

/** Attribute value printed on the unit card (no modifiers). 0 for an unknown model. */
export function baseAttr(state: GameState, bundle: EditionBundle, modelId: ModelId, attr: Attr): number {
  return unitOf(state, bundle, modelId)?.attrs[attr] ?? 0
}

/** The unit card row carrying a skill icon, or undefined when the model lacks it (cannot test it, ACT-005). */
export function skillRow(state: GameState, bundle: EditionBundle, modelId: ModelId, skill: Skill): UnitSkill | undefined {
  return unitOf(state, bundle, modelId)?.skills.find((s) => s.skill === skill)
}

/** Base SV for a skill = the attribute on the icon's row (spec 13 s3.2), or null without the icon. */
export function skillBase(state: GameState, bundle: EditionBundle, modelId: ModelId, skill: Skill): number | null {
  const row = skillRow(state, bundle, modelId, skill)
  return row ? attrOf(state, bundle, modelId, row.attr) : null
}

/** Attribute after item/chem/Power Armor bonuses (set mods first, then adds), never below zero. */
export function attrOf(state: GameState, bundle: EditionBundle, modelId: ModelId, attr: Attr): number {
  const mods = itemMods(state, bundle, modelId, { purpose: 'attr', attr })
  let v = baseAttr(state, bundle, modelId, attr)
  for (const m of mods) if (m.mode === 'set') v = m.value
  for (const m of mods) if (m.mode === 'add') v += m.value
  return Math.max(0, v)
}

type Held = { kind: 'weapon' | 'armor' | 'item' | 'mod'; id: string }
function classify(bundle: EditionBundle, id: string): Held | null {
  if (recordOf(bundle, 'weapons', id)) return { kind: 'weapon', id }
  if (recordOf(bundle, 'armor', id)) return { kind: 'armor', id }
  if (recordOf(bundle, 'items', id)) return { kind: 'item', id }
  if (recordOf(bundle, 'mods', id)) return { kind: 'mod', id }
  return null
}
function costOfRecord(bundle: EditionBundle, id: string): number {
  const h = classify(bundle, id)
  if (!h) return 0
  const kind = h.kind === 'weapon' ? 'weapons' : h.kind === 'armor' ? 'armor' : h.kind === 'item' ? 'items' : 'mods'
  return (recordOf(bundle, kind, id) as { cost: number } | undefined)?.cost ?? 0
}

/** Caps cost of a force list (units, items, heroic, leader) from record costs (FORCE-011). Equipped items are free (FORCE-006). */
export function forceCost(bundle: EditionBundle, forces: readonly ScenarioForce[]): number {
  let total = 0
  for (const f of forces) {
    const unit = recordOf(bundle, 'units', f.unit)
    if (!unit) continue
    const n = Math.max(1, f.count)
    const free = new Set(unit.equipped)
    const perModel = unit.cost + f.items.filter((i) => !free.has(i)).reduce((a, i) => a + costOfRecord(bundle, i), 0) + (f.heroic ? bundle.singletons.heroic?.cost ?? 0 : 0)
    total += perModel * n
    if (f.leader) total += recordOf(bundle, 'leaders', f.leader)?.cost ?? 0
  }
  return total
}

function restrictOk(unit: UnitDef, r: Restriction | undefined): boolean {
  if (!r) return true
  if (r.units && !r.units.includes(unit.id)) return false
  if (r.types && !r.types.some((t) => unit.types.includes(t))) return false
  if (r.factions && !(unit.faction && r.factions.includes(unit.faction))) return false
  if (r.notFactions && unit.faction && r.notFactions.includes(unit.faction)) return false
  return true
}

/** Force-building problems (unique, one leader, heroic on single-model units, item restrictions); empty = legal. */
export function validateForce(bundle: EditionBundle, forces: readonly ScenarioForce[], opts: { caps?: number; faction?: string } = {}): ForceProblem[] {
  const out: ForceProblem[] = []
  const add = (code: string, message: string, unit?: string, item?: string) => out.push({ code, message, ...(unit ? { unit } : {}), ...(item ? { item } : {}) })
  const groups = new Map<string, number>()
  const leaders = forces.filter((f) => f.leader)
  if (leaders.length !== 1) add('leader-count', `A force needs exactly one leader (has ${leaders.length})`)
  const leaderDef = leaders[0]?.leader ? recordOf(bundle, 'leaders', leaders[0].leader) : undefined
  if (leaders[0]?.leader && !leaderDef) add('unknown-leader', `Unknown leader ${leaders[0].leader}`, leaders[0].unit)
  const holder = leaders[0] ? recordOf(bundle, 'units', leaders[0].unit) : undefined
  const faction = opts.faction ?? leaderDef?.factionLock ?? holder?.faction ?? undefined
  if (leaderDef?.factionLock && holder && holder.faction !== leaderDef.factionLock) add('leader-faction', `${leaderDef.name} needs a ${leaderDef.factionLock} model`, holder.id)
  for (const f of forces) {
    const unit = recordOf(bundle, 'units', f.unit)
    if (!unit) { add('unknown-unit', `Unknown unit ${f.unit}`, f.unit); continue }
    const count = Math.max(1, f.count)
    const group = unit.versionGroup ?? unit.id
    if (unit.unique) {
      groups.set(group, (groups.get(group) ?? 0) + count)
      if ((groups.get(group) ?? 0) > 1) add('unique', `${unit.name} is unique: one model per version`, unit.id)
    }
    if (faction && unit.faction && unit.faction !== faction) add('faction', `${unit.name} does not belong to the ${faction} force`, unit.id)
    if (f.heroic && count !== 1) add('heroic-single', 'Heroic only goes on single-model units', unit.id)
    const free = new Set(unit.equipped)
    const kinds = { clothing: 0, power: 0, setter: 0 }
    const hosts: { id: string; fits: string[]; used: boolean }[] = []
    const mods: string[] = []
    const dogBar = (id: string) => add('dog-items', 'Dogs only use food and drink', unit.id, id)
    for (const id of f.items) {
      const h = classify(bundle, id)
      if (!h) { add('unknown-item', `Unknown item ${id}`, unit.id, id); continue }
      const only1 = (why: string) => { if (count > 1) add('single-only', `${why} only goes on single-model units`, unit.id, id) }
      if (h.kind === 'weapon') {
        const w = recordOf(bundle, 'weapons', id)!
        if (!restrictOk(unit, w.restriction)) add('restriction', `${w.name} cannot be carried by ${unit.name}`, unit.id, id)
        if (w.slowFiring) only1(`${w.name} (slow-firing)`)
        if (w.unique) only1(`${w.name} (unique)`)
        if (unit.types.includes('dog') && !free.has(id) && !w.restriction?.types?.includes('dog') && !w.restriction?.units?.includes(unit.id)) dogBar(id)
        hosts.push({ id, fits: [w.skill, ...(w.unique ? ['__unique'] : [])], used: false })
      } else if (h.kind === 'armor') {
        const a = recordOf(bundle, 'armor', id)!
        if (!restrictOk(unit, a.restriction)) add('restriction', `${a.name} cannot be worn by ${unit.name}`, unit.id, id)
        if (a.kind === 'clothing' && ++kinds.clothing > 1) add('clothing-max', 'One clothing per model', unit.id, id)
        if (a.kind === 'powerArmor') {
          if (++kinds.power > 1) add('power-max', 'One Power Armor per model', unit.id, id)
          only1(a.name)
          if (unit.types.includes('creature')) add('creature-items', 'Creatures cannot wear Power Armor', unit.id, id)
        }
        if (unit.types.includes('dog')) dogBar(id)
        if (a.kind === 'armor' && a.sets && ++kinds.setter > 1) add('armor-setter', 'Only one armor sets the ratings', unit.id, id)
        hosts.push({ id, fits: [a.kind], used: false })
      } else if (h.kind === 'item') {
        const it = recordOf(bundle, 'items', id)!
        if (!restrictOk(unit, it.restriction)) add('restriction', `${it.name} cannot be carried by ${unit.name}`, unit.id, id)
        if (unit.types.includes('creature') && ['chem', 'food', 'alcohol'].includes(it.kind)) add('creature-items', 'Creatures use no consumables', unit.id, id)
        if (unit.types.includes('dog') && !['food', 'alcohol'].includes(it.kind) && !it.restriction?.types?.includes('dog')) dogBar(id)
      } else mods.push(id)
    }
    for (const id of mods) {
      const md = recordOf(bundle, 'mods', id)!
      if (!restrictOk(unit, md.requires)) add('restriction', `${md.name} cannot be fitted by ${unit.name}`, unit.id, id)
      const host = hosts.find((hst) => !hst.used && md.fitsTo.some((t) => hst.fits.includes(t)))
      if (!host) { add('mod-host', `${md.name} needs a free matching item (one mod per item)`, unit.id, id); continue }
      host.used = true
      if (host.fits.includes('__unique')) add('mod-unique', 'No mods on unique weapons', unit.id, id)
    }
  }
  if (opts.caps !== undefined) {
    const cost = forceCost(bundle, forces)
    if (cost > opts.caps) add('over-caps', `Force costs ${cost}, over the ${opts.caps} limit`)
  }
  return out
}
