// Checklist (owner D): DMG ARM PA RAD. Spec 15 s1-4. Conditions (COND) live in conditions.ts.
// Owns 'damage.*' (owner choices during a hit). M2 resolves those choices automatically: the card setup, Power Armor
// versus own ratings and lower-of ties pick whatever gives the target the least expected damage.
// One generic removal mechanism; the engine owns every number the UI shows.
import type { ArmorDef, ArmorValue, Attr, EditionBundle, UnitDef } from '../data/types'
import { armorRoll } from './dice'
import { diceDef, recordOf, ruleNum } from './edition'
import { unitOf } from './forces'
import { itemMods } from './items'
import { pushEvents, reject, TodoError, updateModel, type ModuleDef, type StepResult } from './registry'
import type { Action, CarriedItem, DecisionOption, GameState, Mod, ModelId, ModelState, WastelandDamageType } from './types'

/** Armor against one damage type after cards: rating (0 = '-'), Strong bonus, immunity ('X'). `has` = a rating exists (cover and AR only matter then). */
export interface ArmorRating { base: number; strong: number; immune: boolean; has: boolean }

/** One hit to resolve (spec 15 s1). Base damage per type plus the dice. */
export interface Hit {
  targetId: ModelId
  attackerId?: ModelId
  weaponUid?: string
  /** Base damage per type from the weapon (or its critical). */
  damage: { type: WastelandDamageType; value: number; lowerOfPhysEnergy?: boolean }[]
  /** DMG icons from the dice and outcomes (added to the attack's damage). */
  dmg: number
  /** AR icons (armor reduction). */
  ar: number
  /** Target is in cover against this attack (armor + rules.coverArmorBonus). */
  cover: boolean
  critical?: boolean
  /** Skip the armor roll entirely (poison, falling, scenario damage). */
  ignoreArmor?: boolean
}

export interface DamageReport {
  targetId: ModelId
  perType: { type: WastelandDamageType; total: number; rating: number; roll: number | null; blocked: number; applied: number }[]
  /** Damage applied after armor (and Luck Tough). */
  applied: number
  /** "If the target takes damage" effects fire when this is true (spec 13 s4). */
  tookDamage: boolean
  removed: boolean
}

// ---------- small pure helpers ----------
/** Rule constant with a data override: rules.json may define it; otherwise the documented default (spec 15 s5) applies. */
export function ruleOr(bundle: EditionBundle, key: string, fallback: number): number {
  const v = bundle.singletons.rules?.constants[key]
  return typeof v === 'number' ? v : fallback
}

const NO_ARMOR: ArmorRating = { base: 0, strong: 0, immune: false, has: false }
export function ratingOf(v: ArmorValue | undefined): ArmorRating {
  if (v === undefined || v === 'none') return NO_ARMOR
  if (v === 'immune') return { base: 0, strong: 0, immune: true, has: true }
  return { base: v.base, strong: v.strong ?? 0, immune: false, has: true }
}

function applyMods(base: number, mods: readonly Mod[]): number {
  let v = base
  for (const m of mods) v = m.mode === 'set' ? m.value : v + m.value
  return v
}

/** itemMods belongs to another module and may still be a stub; a missing implementation contributes nothing. */
function safeMods(state: GameState, bundle: EditionBundle, modelId: ModelId, ctx: Parameters<typeof itemMods>[3]): Mod[] {
  try { return itemMods(state, bundle, modelId, ctx) } catch (e) { if (e instanceof TodoError) return []; throw e }
}

/** Does a card restriction allow this unit? Only the fields that matter for armor cards. */
function allowed(r: ArmorDef['restriction'], unit: UnitDef | undefined): boolean {
  if (!r || !unit) return true
  if (r.units && !r.units.includes(unit.id)) return false
  if (r.types && !unit.types.some((t) => r.types!.includes(t))) return false
  if (r.factions && !(unit.faction && r.factions.includes(unit.faction))) return false
  if (r.notFactions && unit.faction && r.notFactions.includes(unit.faction)) return false
  return true
}

const TYPES: WastelandDamageType[] = ['physical', 'energy', 'radiation']
type RatingSet = Record<WastelandDamageType, ArmorRating>
const score = (s: RatingSet): number => TYPES.reduce((a, t) => a + (s[t].immune ? 99 : s[t].has ? s[t].base + s[t].strong : 0), 0)

/** The carried Power Armor card (and its def), if any. */
function powerArmorOf(bundle: EditionBundle, m: ModelState): { item: CarriedItem; def: ArmorDef } | null {
  for (const c of m.carried) {
    if (c.spent || c.kind !== 'armor') continue
    const def = recordOf(bundle, 'armor', c.defId)
    if (def?.kind === 'powerArmor' && def.powerArmor) return { item: c, def }
  }
  return null
}
/** Power Armor bonus on the Health row while undegraded; also the token capacity of the PA card (spec 15 s4). */
function paBonus(bundle: EditionBundle, m: ModelState, healthAttr: Attr): number {
  const pa = powerArmorOf(bundle, m)
  if (!pa || pa.item.degraded) return 0
  return pa.def.powerArmor!.green.attrBonus[healthAttr] ?? 0
}

/** Own ratings: unit card, best setting card, best one modifier card, flat item bonuses, then the Strong from boost tokens. */
function ownRatings(state: GameState, bundle: EditionBundle, modelId: ModelId): RatingSet {
  const m = state.models[modelId]
  const unit = unitOf(state, bundle, modelId)
  const unitSet = Object.fromEntries(TYPES.map((t) => [t, ratingOf(unit?.armor[t])])) as RatingSet
  if (!m) return unitSet
  const cards = m.carried.filter((c) => !c.spent && c.kind === 'armor')
    .map((c) => recordOf(bundle, 'armor', c.defId))
    .filter((d): d is ArmorDef => !!d && d.kind !== 'powerArmor' && allowed(d.restriction, unit))
  let best = unitSet
  for (const d of cards.filter((c) => c.sets)) {
    const cand = Object.fromEntries(TYPES.map((t) => [t, d.sets![t] !== undefined ? ratingOf(d.sets![t]) : unitSet[t]])) as RatingSet
    if (score(cand) > score(best)) best = cand
  }
  const modScore = (d: ArmorDef) => Object.values(d.modifies ?? {}).reduce((a, b) => a + b, 0)
  let modCard: ArmorDef | undefined
  for (const d of cards.filter((c) => !c.sets && c.modifies)) if (!modCard || modScore(d) > modScore(modCard)) modCard = d
  const cardIds = new Set(m.carried.filter((c) => c.kind === 'armor').map((c) => c.defId))
  const boost = Math.min(m.armorBoost, ruleNum(bundle, 'armorBoostMax'))
  const out = {} as RatingSet
  for (const t of TYPES) {
    let r = best[t]
    if (!r.immune && modCard?.modifies?.[t] !== undefined) r = { ...r, base: Math.max(0, r.base + modCard.modifies[t]!), has: true }
    // itemMods also lists the armor cards themselves; this function already resolved those, so keep only chems, food and mods.
    const flat = safeMods(state, bundle, modelId, { purpose: 'armor', damageType: t }).filter((x) => !cardIds.has(x.source))
    if (!r.immune && flat.length) r = { ...r, base: Math.max(0, applyMods(r.base, flat)), has: true }
    // Each boost icon is a Strong +1, but only one Strong bonus ever applies (ARM-003).
    out[t] = r.immune ? r : { ...r, strong: Math.max(r.strong, Math.sign(boost)) }
  }
  return out
}

/** Power Armor ratings (green or degraded yellow side), or null without Power Armor. */
function paRatings(bundle: EditionBundle, m: ModelState | undefined): RatingSet | null {
  if (!m) return null
  const pa = powerArmorOf(bundle, m)
  if (!pa) return null
  const side = pa.item.degraded ? pa.def.powerArmor!.yellow : pa.def.powerArmor!.green
  return Object.fromEntries(TYPES.map((t) => [t, ratingOf(side.armor[t])])) as RatingSet
}

/** Lower of two ratings compared without Strong; a tie goes to the larger Strong (the target picks, ERR p.15). */
export function lowerOf(a: ArmorRating, b: ArmorRating): ArmorRating {
  const eff = (r: ArmorRating) => (r.immune ? Infinity : r.has ? r.base : 0)
  if (eff(a) !== eff(b)) return eff(a) < eff(b) ? a : b
  return b.strong > a.strong ? b : a
}

/** Armor of a model against a damage type, after the setting card and modifier cards (ARM-*). Power Armor counts when it is the better pick. */
export function armorOf(state: GameState, bundle: EditionBundle, modelId: ModelId, type: WastelandDamageType): ArmorRating {
  const own = ownRatings(state, bundle, modelId)[type]
  const pa = paRatings(bundle, state.models[modelId])?.[type]
  if (!pa) return own
  const s = (r: ArmorRating) => (r.immune ? 99 : r.has ? r.base + r.strong : 0)
  return s(pa) >= s(own) ? pa : own
}

/** Distribution of applied damage 0..total for one type: red die roll <= R blocks the rolled amount, Strong always blocks (ARM-001..004). */
export function appliedDist(bundle: EditionBundle, total: number, r: ArmorRating, ar: number, cover: boolean): number[] {
  const dist = new Array<number>(Math.max(0, total) + 1).fill(0)
  if (total <= 0 || r.immune) { dist[0] = 1; return dist }
  const R = r.has ? Math.max(0, r.base + (cover ? ruleNum(bundle, 'coverArmorBonus') : 0) - ar) : 0
  const faces = diceDef(bundle).armor
  for (const f of faces) {
    const blocked = R > 0 && f <= R ? f : 0
    dist[Math.max(0, total - blocked - r.strong)]! += 1 / faces.length
  }
  return dist
}
const mean = (d: number[]): number => d.reduce((a, p, i) => a + p * i, 0)

/** Candidate ratings for one damage entry (Power Armor first, then own), lower-of rule applied. */
function candidates(state: GameState, bundle: EditionBundle, modelId: ModelId, entry: Hit['damage'][number]): ArmorRating[] {
  const own = ownRatings(state, bundle, modelId)
  const pa = paRatings(bundle, state.models[modelId])
  const pick = (s: RatingSet) => (entry.lowerOfPhysEnergy ? lowerOf(s.physical, s.energy) : s[entry.type])
  return pa ? [pick(pa), pick(own)] : [pick(own)]
}
/** The candidate with the least expected damage (first wins ties). */
function bestFor(bundle: EditionBundle, cands: ArmorRating[], total: number, ar: number, cover: boolean): ArmorRating {
  let bi = 0, bm = Infinity
  cands.forEach((c, i) => { const e = mean(appliedDist(bundle, total, c, ar, cover)); if (e < bm - 1e-12) { bm = e; bi = i } })
  return cands[bi]!
}

// ---------- health and tokens ----------
/** Health = the heart-row attribute + Heroic/Power Armor/item bonuses (spec 15 s2). */
export function healthOf(state: GameState, bundle: EditionBundle, modelId: ModelId): number {
  const m = state.models[modelId], unit = unitOf(state, bundle, modelId)
  if (!m || !unit) return 0
  const attr = unit.healthAttr
  const base = applyMods(unit.attrs[attr], safeMods(state, bundle, modelId, { purpose: 'attr', attr }))
  // itemMods('attr') already includes the undegraded Power Armor bonus and clothing, so it is not added again here.
  return Math.max(0, base + (m.heroic ? ruleNum(bundle, 'heroicHealthBonus') : 0))
}

/** All tokens that count toward Health: regular, radiation, and those parked on an undegraded Power Armor card. */
export function tokensOn(bundle: EditionBundle, m: ModelState): number {
  const pa = powerArmorOf(bundle, m)
  return m.damage + m.rad + (pa && !pa.item.degraded ? pa.item.paDamage ?? 0 : 0)
}

/** Remove the model when its tokens reach its Health (also call after any change that lowers Health, spec 15 s2). */
export function checkRemoval(state: GameState, bundle: EditionBundle, modelId: ModelId, reason = 'damage'): GameState {
  const m = state.models[modelId]
  if (!m || m.life === 'dead') return state
  return tokensOn(bundle, m) >= healthOf(state, bundle, modelId) ? removeModel(state, bundle, modelId, reason) : state
}

/** Put regular damage on the model; Power Armor soaks it first unless `toModel`, degrading when its card fills (PA-001, PA-005). */
function addRegular(state: GameState, bundle: EditionBundle, modelId: ModelId, n: number, toModel: boolean): GameState {
  const m = state.models[modelId]
  const unit = unitOf(state, bundle, modelId)
  if (!m || !unit || n <= 0) return state
  let rest = n
  let carried = m.carried
  const pa = powerArmorOf(bundle, m)
  if (pa && !pa.item.degraded && !toModel) {
    const cap = paBonus(bundle, m, unit.healthAttr)
    const room = Math.max(0, cap - (pa.item.paDamage ?? 0))
    const put = Math.min(room, rest)
    rest -= put
    const filled = (pa.item.paDamage ?? 0) + put
    const next: CarriedItem = filled >= cap && cap > 0 ? { ...pa.item, paDamage: 0, degraded: true } : { ...pa.item, paDamage: filled }
    carried = m.carried.map((c) => (c.uid === pa.item.uid ? next : c))
  }
  return updateModel(state, modelId, { carried, damage: m.damage + rest })
}

/** Radiation: each point flips a regular token to radiation, or adds a radiation token when none are left (DMG-004). */
function addRadiation(state: GameState, modelId: ModelId, n: number): GameState {
  const m = state.models[modelId]
  if (!m || n <= 0) return state
  return updateModel(state, modelId, { damage: Math.max(0, m.damage - n), rad: m.rad + n })
}

function putTokens(state: GameState, bundle: EditionBundle, modelId: ModelId, type: WastelandDamageType, n: number, toModel: boolean): GameState {
  if (n <= 0) return state
  return type === 'radiation' ? addRadiation(state, modelId, n) : addRegular(state, bundle, modelId, n, toModel)
}

/** Resolve a hit: per type armor roll (dice.armorRoll), Strong, Power Armor first, radiation flips, removal check. */
export function applyHit(state: GameState, bundle: EditionBundle, hit: Hit): { state: GameState; report: DamageReport } {
  const m0 = state.models[hit.targetId]
  const report: DamageReport = { targetId: hit.targetId, perType: [], applied: 0, tookDamage: false, removed: false }
  if (!m0 || m0.life === 'dead') return { state, report }
  let s = state
  for (const entry of hit.damage) {
    const total = Math.max(0, entry.value + hit.dmg)
    const rating = bestFor(bundle, candidates(s, bundle, hit.targetId, entry), total, hit.ar, hit.cover)
    let R = 0, rollVal: number | null = null, blocked = 0
    if (rating.immune) blocked = total
    else if (!hit.ignoreArmor) {
      R = rating.has ? Math.max(0, rating.base + (hit.cover ? ruleNum(bundle, 'coverArmorBonus') : 0) - hit.ar) : 0
      if (R > 0 && total > 0) {
        const r = armorRoll(s, bundle, `armor:${entry.type}`, hit.targetId)
        s = pushEvents(r.state, [r.event])
        rollVal = r.value
        if (r.value <= R) blocked += r.value
      }
      if (total > 0) blocked += rating.strong
    }
    const applied = Math.max(0, total - blocked)
    s = putTokens(s, bundle, hit.targetId, entry.type, applied, false)
    report.perType.push({ type: entry.type, total, rating: R, roll: rollVal, blocked: total - applied, applied })
    report.applied += applied
  }
  // ARM-005: one armor boost is spent after every hit, even when it gave nothing.
  const boost = s.models[hit.targetId]!.armorBoost
  if (!hit.ignoreArmor && boost > 0) s = updateModel(s, hit.targetId, { armorBoost: boost - 1 })
  report.tookDamage = report.applied > 0
  s = checkRemoval(s, bundle, hit.targetId, 'hit')
  report.removed = s.models[hit.targetId]!.life === 'dead'
  s = pushEvents(s, [{ type: 'damage', targetId: hit.targetId, attackerId: hit.attackerId, perType: report.perType, applied: report.applied, removed: report.removed }])
  return { state: s, report }
}

/**
 * Direct damage with no attack (On Fire, Poisoned, table edge, falling, scenario). `strongBlocks` for On Fire (spec 15 s5).
 * Reason 'poison' always goes to the model (PA-005); reason 'fall' is negated by Power Armor.
 */
export function applyDirectDamage(state: GameState, bundle: EditionBundle, modelId: ModelId, n: number, opts: { type?: WastelandDamageType; strongBlocks?: boolean; reason: string }): { state: GameState; applied: number; removed: boolean } {
  const m = state.models[modelId]
  if (!m || m.life === 'dead') return { state, applied: 0, removed: m?.life === 'dead' }
  const type = opts.type ?? 'physical'
  const own = ownRatings(state, bundle, modelId)[type]
  let applied = Math.max(0, n)
  if (own.immune) applied = 0
  else if (opts.reason === 'fall' && powerArmorOf(bundle, m)) applied = 0
  else if (opts.strongBlocks) applied = Math.max(0, applied - own.strong)
  let s = putTokens(state, bundle, modelId, type, applied, opts.reason === 'poison')
  s = checkRemoval(s, bundle, modelId, opts.reason)
  const removed = s.models[modelId]!.life === 'dead'
  s = pushEvents(s, [{ type: 'directDamage', targetId: modelId, reason: opts.reason, applied, removed }])
  return { state: s, applied, removed }
}

/** Heal regular tokens and/or flip radiation back (RAD-*); never below zero. A removed model stays removed. */
export function heal(state: GameState, bundle: EditionBundle, modelId: ModelId, amount: { regular?: number; rad?: number }): GameState {
  const m = state.models[modelId]
  if (!m || m.life === 'dead') return state
  let damage = m.damage, rad = m.rad, carried = m.carried
  let reg = Math.max(0, amount.regular ?? 0)
  const fromModel = Math.min(reg, damage)
  damage -= fromModel; reg -= fromModel
  const pa = powerArmorOf(bundle, m)
  if (reg > 0 && pa && !pa.item.degraded && (pa.item.paDamage ?? 0) > 0) {
    const take = Math.min(reg, pa.item.paDamage ?? 0)
    carried = carried.map((c) => (c.uid === pa.item.uid ? { ...c, paDamage: (c.paDamage ?? 0) - take } : c))
  }
  const flip = Math.min(Math.max(0, amount.rad ?? 0), rad)
  rad -= flip; damage += flip
  return updateModel(state, modelId, { damage, rad, carried })
}

/** Remove a model from play (tokens >= Health). Marks it dead and Used, and drops any scenario object it carried. */
export function removeModel(state: GameState, _bundle: EditionBundle, modelId: ModelId, reason: string): GameState {
  const m = state.models[modelId]
  if (!m || m.life === 'dead') return state
  let s = updateModel(state, modelId, { life: 'dead', offTable: true, readiness: 'used', reaction: false, chargeBonus: [], conditions: [], bonusDice: [] })
  s = { ...s, markers: s.markers.map((k) => (k.carriedBy === modelId ? { ...k, carriedBy: undefined, pos: m.pos } : k)) }
  return pushEvents(s, [{ type: 'removed', modelId, reason }])
}

/**
 * Exact applied-damage distribution for a hit on targetId (spec 13 s7.2-3). `onHit` comes from dice.skillOdds()
 * (its p sums to P(hit)); the result is conditioned on a hit: dist[i] = P(applied = i | hit).
 */
export function damageDistribution(state: GameState, bundle: EditionBundle, targetId: ModelId, input: { damage: Hit['damage']; onHit: { dmg: number; ar: number; p: number }[]; cover: boolean }): number[] {
  const pHit = input.onHit.reduce((a, o) => a + o.p, 0)
  if (pHit <= 0) return [1]
  const per = input.onHit.map((o) => {
    let acc: number[] = [1]
    for (const e of input.damage) {
      const total = Math.max(0, e.value + o.dmg)
      const rating = bestFor(bundle, candidates(state, bundle, targetId, e), total, o.ar, input.cover)
      const d = appliedDist(bundle, total, rating, o.ar, input.cover)
      const next = new Array<number>(acc.length + d.length - 1).fill(0)
      acc.forEach((pa, i) => d.forEach((pb, j) => { next[i + j]! += pa * pb }))
      acc = next
    }
    return { acc, w: o.p / pHit }
  })
  const out = new Array<number>(Math.max(1, ...per.map((x) => x.acc.length))).fill(0)
  for (const { acc, w } of per) acc.forEach((p, i) => { out[i]! += p * w })
  return out
}

export const damage: ModuleDef = {
  id: 'damage',
  kinds: ['damage'],
  options(_state: GameState, _bundle: EditionBundle, _modelId: ModelId): DecisionOption[] {
    return []
  },
  resolve(state: GameState, _bundle: EditionBundle, action: Action): StepResult {
    // Armor picks are automatic in M2, so no 'damage.*' decision is ever open.
    return reject('E_UNKNOWN_KIND', `no damage decision is open (${action.type} vs ${state.pending.kind})`)
  },
}
