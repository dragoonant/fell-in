// Checklist (owner I): ITEM EXP SRCH. Spec 11 s8-9; 16.
// Owns 'item.*' (use/drop/pick up/share), 'expertise.*' (Search, Lockpick, Computers) and 'search.*'
// (searchable and investigation markers). Item effects run through the data Effect ops (spec 20).
import type { Attr, Condition, Effect, EditionBundle, ItemDef, OpEffect, Restriction, Skill, UnitDef } from '../data/types'
import { recordOf, rulerInches, ruleStr } from './edition'
import { baseRadius, edgeDistance, dist } from './geometry'
import { computeSv, rollColourDie, skillTest } from './dice'
import { removeModel, healthOf, heal } from './damage'
import { conditionSvMods, removeCondition } from './conditions'
import { hasLos } from './los'
import { isEngaged } from './attack'
import { sameTeam } from './sides'
import { roll } from './rng'
import { option, pushEvents, raiseDecision, reject, updateModel, type ModuleDef, type StepResult } from './registry'
import { modelDefaults } from './setup'
import { activationMenu } from './turnflow'
import { skillBase, unitOf } from './forces'
import type {
  Action, CarriedItem, CarriedKind, DecisionOption, GameState, MarkerState, Mod, ModelId, ModelState, WastelandDamageType,
} from './types'

/** What a modifier lookup is for, so items/effects can filter by their `when` conditions. */
export interface ModContext {
  purpose: 'sv' | 'armor' | 'attr' | 'move'
  skill?: Skill
  damageType?: WastelandDamageType
  attr?: Attr
  targetId?: ModelId
}

/** Geometry tolerance for "token touching a base" (a table fact, not an edition rule). */
const MARKER_REACH_IN = 0.5

/** Foundations-implemented: carried card instances of a model, optionally of one kind, not spent. */
export function carriedOf(state: GameState, modelId: ModelId, kind?: CarriedKind): CarriedItem[] {
  const m = state.models[modelId]
  if (!m) return []
  return m.carried.filter((c) => !c.spent && (kind === undefined || c.kind === kind))
}

// ---------- effects -> modifiers ----------
const isOp = (e: Effect): e is OpEffect => 'op' in e

function whenOk(when: Condition | undefined, ctx: ModContext): boolean {
  if (!when) return true
  if (when.skills && !(ctx.skill && when.skills.includes(ctx.skill))) return false
  if (when.damageTypes && !(ctx.damageType && when.damageTypes.includes(ctx.damageType))) return false
  return true
}

/** The Mods an effect list contributes to one lookup (attribute, skill, armor and move-step ops only). */
function effectMods(effects: readonly Effect[], ctx: ModContext, source: string, label: string): Mod[] {
  const out: Mod[] = []
  for (const e of effects) {
    if (!isOp(e) || !whenOk(e.when, ctx)) continue
    const n = e.n ?? 0
    const hit =
      (e.op === 'attrMod' && ctx.purpose === 'attr' && e.attr === ctx.attr) ||
      (e.op === 'skillMod' && ctx.purpose === 'sv' && e.skill === ctx.skill) ||
      (e.op === 'armorMod' && ctx.purpose === 'armor' && (!e.damageType || e.damageType === 'all' || e.damageType === ctx.damageType)) ||
      (e.op === 'rulerStep' && ctx.purpose === 'move' && e.stat === 'move')
    if (hit) out.push({ source, label, value: n, mode: 'add' })
  }
  return out
}

/** Columns of a diminishing item still showing: columns hide right to left, one per activation (ITEM-007). */
function activeColumns(def: ItemDef, step: number): Effect[] {
  if (typeof def.duration === 'string' || !('diminishing' in def.duration)) return []
  const cols = def.duration.diminishing
  return cols.slice(0, Math.max(0, cols.length - step)).flat()
}

/** Modifiers from carried cards and running effects (chems, food, mods, armor cards) for a lookup (ITEM-*). */
export function itemMods(state: GameState, bundle: EditionBundle, modelId: ModelId, ctx: ModContext): Mod[] {
  const m = state.models[modelId]
  if (!m) return []
  const mods: Mod[] = []
  for (const c of m.carried) {
    if (c.spent) continue
    if (c.kind === 'armor') {
      const def = recordOf(bundle, 'armor', c.defId)
      if (!def) continue
      if (ctx.purpose === 'attr' && ctx.attr) {
        const v = def.attrBonus?.[ctx.attr]
        if (v) mods.push({ source: def.id, label: def.name, value: v, mode: 'add' })
        const pa = def.powerArmor ? (c.degraded ? def.powerArmor.yellow : def.powerArmor.green) : undefined
        const pv = pa?.attrBonus[ctx.attr]
        if (pv) mods.push({ source: def.id, label: def.name, value: pv, mode: 'add' })
      }
      if (ctx.purpose === 'armor' && ctx.damageType) {
        const set = def.sets?.[ctx.damageType]
        if (set && typeof set === 'object') mods.push({ source: def.id, label: def.name, value: set.base, mode: 'set' })
        const add = def.modifies?.[ctx.damageType]
        if (add) mods.push({ source: def.id, label: def.name, value: add, mode: 'add' })
      }
      for (const a of def.abilities ?? []) mods.push(...effectMods(a.effects ?? [], ctx, def.id, a.name))
    }
    for (const modId of c.mods ?? []) {
      const md = recordOf(bundle, 'mods', modId)
      if (md) mods.push(...effectMods(md.effects, ctx, md.id, md.name))
    }
  }
  for (const ef of m.effects) {
    const def = recordOf(bundle, 'items', ef.defId)
    if (!def) continue
    const list = ef.duration === 'fixed' ? def.effects : activeColumns(def, ef.step)
    mods.push(...effectMods(list, ctx, def.id, def.name))
  }
  for (const itemId of m.addictions) {
    const def = recordOf(bundle, 'items', itemId)
    if (def?.addictive) mods.push(...effectMods(def.addictive.addicted, ctx, def.id, `${def.name} withdrawal`))
  }
  return mods
}

// ---------- restrictions ----------
function restrictionOk(unit: UnitDef | undefined, r: Restriction | undefined): boolean {
  if (!r || !unit) return true
  if (r.units && !r.units.includes(unit.id)) return false
  if (r.types && !r.types.some((t) => unit.types.includes(t))) return false
  if (r.factions && !(unit.faction && r.factions.includes(unit.faction))) return false
  if (r.notFactions && unit.faction && r.notFactions.includes(unit.faction)) return false
  return true
}

/** Why a unit may not use an item kind at all (FORCE-012: dogs food/drink only; creatures no consumables). */
function unitBars(unit: UnitDef | undefined, def: ItemDef): string | null {
  if (!unit) return null
  if (unit.types.includes('creature') && ['chem', 'food', 'alcohol'].includes(def.kind)) return 'creatures cannot use consumables'
  if (unit.types.includes('dog') && !['food', 'alcohol'].includes(def.kind) && !def.restriction?.types?.includes('dog')) return 'dogs only use food and drink'
  return null
}

// ---------- re-raising the menu after a no-Action step ----------
function reMenu(state: GameState, bundle: EditionBundle): StepResult {
  const act = state.activation
  if (!act) return { state }
  const opts = activationMenu(state, bundle, act.modelId)
  return { state: raiseDecision(state, { seat: state.models[act.modelId]!.owner, kind: 'turn.activation', context: { modelId: act.modelId }, options: opts, canPass: false }) }
}

const isRej = (r: unknown): r is { code: string; message: string } => typeof r === 'object' && r !== null && 'code' in r && !('state' in r)

// ---------- applying instant effect ops ----------
function applyOps(state: GameState, bundle: EditionBundle, modelId: ModelId, ops: readonly Effect[]): GameState {
  let s = state
  for (const e of ops) {
    if (!isOp(e)) continue
    const n = e.n ?? 0
    if (e.op === 'heal') s = heal(s, bundle, modelId, { regular: n })
    else if (e.op === 'healRad') s = heal(s, bundle, modelId, { rad: n })
    else if (e.op === 'addRad') {
      const m = s.models[modelId]
      if (!m) continue
      s = updateModel(s, modelId, { rad: m.rad + n })
      const after = s.models[modelId]!
      if (after.damage + after.rad >= healthOf(s, bundle, modelId)) s = removeModel(s, bundle, modelId, 'radiation')
    } else if (e.op === 'gainAP') {
      if (s.activation && s.activation.modelId === modelId) s = { ...s, activation: { ...s.activation, ap: s.activation.ap + n } }
    } else if (e.op === 'cureInjury') {
      const arm = e.injury === 'arm' || e.injury === 'all'
      const leg = e.injury === 'leg' || e.injury === 'all'
      if (arm) s = removeCondition(s, bundle, modelId, 'injuredArm')
      if (leg) s = removeCondition(s, bundle, modelId, 'injuredLeg')
    }
  }
  return s
}

const INSTANT_OPS = new Set(['heal', 'healRad', 'addRad', 'cureInjury'])

function setCarried(state: GameState, holderId: ModelId, uid: string, patch: Partial<CarriedItem>): GameState {
  const h = state.models[holderId]!
  return updateModel(state, holderId, { carried: h.carried.map((c) => (c.uid === uid ? { ...c, ...patch } : c)) })
}

function findHolder(state: GameState, bundle: EditionBundle, user: ModelState, itemUid: string): { holder: ModelState; c: CarriedItem } | { rej: StepResult } {
  const own = user.carried.find((c) => c.uid === itemUid)
  if (own) return { holder: user, c: own }
  for (const other of Object.values(state.models)) {
    if (other.id === user.id || !sameTeam(state, other.owner, user.owner) || other.life !== 'active' || other.offTable) continue
    const c = other.carried.find((x) => x.uid === itemUid)
    if (!c) continue
    const def = recordOf(bundle, 'items', c.defId)
    if (!def || !def.limitedUse || def.shareable === false || def.restriction?.assignedOnly) return { rej: reject('E_NOT_LEGAL', `${def?.name ?? 'That item'} cannot be shared`) }
    if (isEngaged(state, user.id) || isEngaged(state, other.id)) return { rej: reject('E_ENGAGED', 'Engaged models cannot share items (ITEM-003)') }
    const reach = rulerInches(bundle, ruleStr(bundle, 'sharingRange') as never)
    if (edgeDistance(user.pos, user.base, other.pos, other.base) > reach + 1e-9) return { rej: reject('E_OUT_OF_RANGE', 'The holder is too far away to share') }
    if (!hasLos(state, user.id, other.id)) return { rej: reject('E_NO_LOS', 'No line of sight to the holder') }
    return { holder: other, c }
  }
  return { rej: reject('E_NO_ITEM', `No carried item ${itemUid}`) }
}

/** Use a carried item now (no Action for most consumables, ITEM-004); one limited-use item per Action (ITEM-001). */
export function useItem(state: GameState, bundle: EditionBundle, modelId: ModelId, itemUid: string, targetId?: ModelId): StepResult {
  if (state.phase === 'over') return reject('E_GAME_OVER', 'The game is over')
  const m = state.models[modelId]
  if (!m || m.life !== 'active' || m.offTable) return reject('E_BAD_TARGET', `Model ${modelId} cannot act`)
  if (targetId !== undefined && targetId !== modelId) return reject('E_BAD_TARGET', 'Items are used on the user')
  const found = findHolder(state, bundle, m, itemUid)
  if ('rej' in found) return found.rej
  const { holder, c } = found
  const def = recordOf(bundle, 'items', c.defId)
  if (c.kind !== 'item' || !def) return reject('E_NO_ITEM', `${itemUid} is not a usable item`)
  if (c.spent) return reject('E_ITEM_USED', `${def.name} is already used up`)
  const unit = unitOf(state, bundle, modelId)
  const bar = unitBars(unit, def)
  if (bar) return reject('E_NOT_LEGAL', bar)
  if (!restrictionOk(unit, def.restriction)) return reject('E_NOT_LEGAL', `${def.name} is restricted to other units`)
  if (def.limitedUse && state.action?.itemUsed) return reject('E_ITEM_USED', 'Only one limited-use item per Action (ITEM-001)')
  const dur = def.duration
  if (!def.limitedUse && typeof dur !== 'string' && m.effects.some((e) => e.defId === def.id)) return reject('E_ITEM_USED', `${def.name} is already running`)
  if (typeof dur !== 'string' && 'diminishing' in dur && m.effects.some((e) => e.duration === 'diminishing')) return reject('E_ITEM_USED', 'Only one diminishing item at a time (ITEM-007)')

  let s = state
  if (def.limitedUse) s = setCarried(s, holder.id, c.uid, { spent: true })
  if (def.limitedUse && s.action) s = { ...s, action: { ...s.action, itemUsed: true } }
  if (typeof dur !== 'string') {
    const seq = s.models[modelId]!.effects.length
    const eff = 'fixed' in dur
      ? { id: `${def.id}#${seq}`, defId: def.id, duration: 'fixed' as const, counters: dur.fixed, step: 0 }
      : { id: `${def.id}#${seq}`, defId: def.id, duration: 'diminishing' as const, counters: 0, step: 0 }
    s = updateModel(s, modelId, { effects: [...s.models[modelId]!.effects, eff] })
  }
  // ITEM-011: cooked side when the card was equipped at battle start, or always for Super Mutants.
  const cooked = !!def.cooked && (c.starting || unit?.faction === 'super-mutants')
  const list = cooked ? def.cooked! : def.effects
  const choose = list.find((e) => isOp(e) && e.op === 'choose') as OpEffect | undefined
  s = applyOps(s, bundle, modelId, list.filter((e) => isOp(e) && INSTANT_OPS.has(e.op) || (isOp(e) && e.op === 'gainAP' && typeof dur === 'string')))
  if (choose?.options?.length) {
    const opts: DecisionOption[] = choose.options.map((branch, i) => option(`b${i}`, branchLabel(branch), 'item.choose', { modelId, index: i, itemId: def.id }))
    s = raiseDecision(s, { seat: m.owner, kind: 'item.choose', context: { modelId, itemId: def.id }, options: opts, canPass: false })
  }
  return { state: s }
}

function branchLabel(branch: readonly Effect[]): string {
  const bits = branch.map((e) => (isOp(e) ? (e.op === 'heal' ? `Heal ${e.n}` : e.op === 'cureInjury' ? 'Cure injuries' : e.op) : 'special'))
  return bits.join(', ') || 'Nothing'
}

/** Activation start, step 3 (spec 11 s2): fixed counters tick, diminishing steps slide, addiction rolls on expiry (ITEM-006..009). */
export function tickEffects(state: GameState, bundle: EditionBundle, modelId: ModelId): GameState {
  const m0 = state.models[modelId]
  if (!m0) return state
  let s = state
  const keep = [] as ModelState['effects']
  const ended: ItemDef[] = []
  for (const ef of m0.effects) {
    const def = recordOf(bundle, 'items', ef.defId)
    if (!def) continue
    if (ef.duration === 'fixed') {
      if (ef.counters <= 0) ended.push(def)
      else keep.push({ ...ef, counters: ef.counters - 1 })
    } else {
      const cols = typeof def.duration !== 'string' && 'diminishing' in def.duration ? def.duration.diminishing.length : 0
      const step = ef.step + 1
      if (step >= cols) ended.push(def)
      else keep.push({ ...ef, step })
    }
  }
  s = updateModel(s, modelId, { effects: keep })
  for (const ef of keep) {
    const def = recordOf(bundle, 'items', ef.defId)
    if (def && ef.duration === 'diminishing') s = applyOps(s, bundle, modelId, activeColumns(def, ef.step).filter((e) => isOp(e) && e.op === 'gainAP'))
  }
  for (const def of ended) {
    if (!def.addictive) continue
    const r = rollColourDie(s, bundle, 'blue', `addiction:${def.id}`, modelId)
    s = pushEvents(r.state, [r.event])
    // A bottle+star face counts as the star only (ITEM-008).
    const icons = r.die.icons.includes('STAR') ? ['STAR'] : r.die.icons
    const cur = s.models[modelId]!
    if (icons.includes(def.addictive.icon) && !cur.addictions.includes(def.id)) s = updateModel(s, modelId, { addictions: [...cur.addictions, def.id] })
  }
  return s
}

// ---------- items on the table: drop and pick up (ITEM-010) ----------
function dropItem(state: GameState, bundle: EditionBundle, modelId: ModelId, itemUid: string): StepResult {
  const m = state.models[modelId]
  const c = m?.carried.find((x) => x.uid === itemUid)
  if (!m || !c) return reject('E_NO_ITEM', `No carried item ${itemUid}`)
  if (c.starting) return reject('E_NOT_LEGAL', 'Starting items cannot be dropped or passed (ITEM-010)')
  const marker: MarkerState = {
    id: `drop-${state.markers.length + 1}-${c.uid}`, kind: 'object', face: `item:${c.defId}`, pos: { ...m.pos }, revealed: true, seenBy: [],
    props: { dropped: c },
  }
  const s = updateModel(state, modelId, { carried: m.carried.filter((x) => x.uid !== itemUid) })
  return { state: { ...s, markers: [...s.markers, marker] } }
}

function pickUpItem(state: GameState, bundle: EditionBundle, modelId: ModelId, markerId: string): StepResult {
  const m = state.models[modelId]
  const mk = state.markers.find((x) => x.id === markerId)
  const c = mk?.props.dropped as CarriedItem | undefined
  if (!m || !mk || !c) return reject('E_BAD_TARGET', `No dropped item at ${markerId}`)
  if (!inReach(m, mk)) return reject('E_OUT_OF_RANGE', 'Not touching that item')
  const s = updateModel(state, modelId, { carried: [...m.carried, { ...c, starting: false }] })
  return { state: { ...s, markers: s.markers.filter((x) => x.id !== markerId) } }
}

// ---------- markers: peek, search, expertise ----------
function inReach(m: ModelState, mk: MarkerState): boolean {
  return dist(m.pos, mk.pos) - baseRadius(m.base) <= MARKER_REACH_IN
}

/** Can this seat see the marker: partly within a model's Awareness colour and in LoS of it (SRCH-001). Returns the viewer id. */
function peekViewer(state: GameState, bundle: EditionBundle, seat: string, mk: MarkerState): ModelId | null {
  for (const m of Object.values(state.models)) {
    if (m.owner !== seat || m.life !== 'active' || m.offTable) continue
    const unit = unitOf(state, bundle, m.id)
    if (!unit) continue
    const reach = rulerInches(bundle, unit.awareness)
    if (Math.max(0, dist(m.pos, mk.pos) - baseRadius(m.base)) > reach + 1e-9) continue
    const probe: ModelState = { ...modelDefaults(), id: '__marker__', profileId: '__marker__', owner: '__none__', pos: mk.pos, elev: 0, base: 25, life: 'active', conditions: [] }
    const probed: GameState = { ...state, models: { ...state.models, [probe.id]: probe } }
    if (hasLos(probed, m.id, probe.id)) return m.id
  }
  return null
}

function peek(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const mk = state.markers.find((x) => x.id === action.markerId)
  if (!mk || mk.kind !== 'investigation') return reject('E_BAD_TARGET', 'No investigation marker there')
  if (state.action?.type.startsWith('move.')) return reject('E_NOT_LEGAL', 'Cannot peek in the middle of a move (SRCH-002)')
  if (!peekViewer(state, bundle, action.seat, mk)) return reject('E_NO_LOS', 'No model of yours can see that marker closely enough (SRCH-001)')
  const markers = state.markers.map((x) => (x.id === mk.id && !x.seenBy.includes(action.seat) ? { ...x, seenBy: [...x.seenBy, action.seat] } : x))
  return { state: pushEvents({ ...state, markers }, [{ type: 'peek', markerId: mk.id, seat: action.seat }]) }
}

/** Draw the next Wasteland item card: deck order is a roll over the cards not yet found (SRCH-008). */
function drawItem(state: GameState, bundle: EditionBundle, modelId: ModelId, mk: MarkerState): { state: GameState; defId: string | null } {
  const fixed = mk.props.item
  if (typeof fixed === 'string') return { state, defId: fixed }
  const sc = state.scenarioId ? recordOf(bundle, 'scenarios', state.scenarioId) : undefined
  const deck = [...(sc?.wastelandDecks?.items ?? [])]
  for (const ev of state.events) {
    if (ev.type !== 'itemFound') continue
    const i = deck.indexOf(ev.defId as string)
    if (i >= 0) deck.splice(i, 1)
  }
  if (deck.length === 0) return { state, defId: null }
  const r = roll(state, { count: 1, sides: deck.length, purpose: `search:draw:${mk.id}`, ownerId: modelId })
  return { state: pushEvents(r.state, [r.event]), defId: deck[r.event.dice[0]! - 1]! }
}

function interact(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const act = state.activation
  const modelId = (act?.modelId ?? action.modelId) as string
  const m = state.models[modelId]
  const mk = state.markers.find((x) => x.id === action.markerId)
  if (!m || m.life !== 'active' || m.offTable) return reject('E_BAD_TARGET', 'That model cannot act')
  if (!mk) return reject('E_BAD_TARGET', 'No such marker')
  if (isEngaged(state, modelId)) return reject('E_ENGAGED', 'Engaged models cannot interact (EXP-001)')
  if (!inReach(m, mk)) return reject('E_OUT_OF_RANGE', 'Not in contact with the marker (EXP-001)')
  const skill = (mk.props.skill as Skill | undefined) ?? 'search'
  if (mk.props.lockedRound === state.round && mk.props.lockedSeat === state.turn?.seat) return reject('E_NOT_LEGAL', 'That terminal is locked for this turn (EXP-002)')
  const base = skillBase(state, bundle, modelId, skill)
  if (base === null) return reject('E_NO_SKILL', `${m.id} has no ${skill} skill`)
  const mods = [...itemMods(state, bundle, modelId, { purpose: 'sv', skill }), ...conditionSvMods(state, bundle, modelId)]
  const { sv } = computeSv(base, mods)
  const t = skillTest(state, bundle, { sv, purpose: `expertise:${skill}:${mk.id}`, ownerId: modelId })
  let s = pushEvents(t.state, t.events)
  const done = (st: GameState): StepResult => ({ state: st, done: { modelId, type: action.type, triggers: [] } })
  const patchMarker = (id: string, props: Record<string, unknown>) => ({ ...s, markers: s.markers.map((x) => (x.id === id ? { ...x, props: { ...x.props, ...props } } : x)) })
  if (skill === 'computers' && t.test.value === 'X') {
    s = patchMarker(mk.id, { lockedRound: s.round, lockedSeat: s.turn?.seat ?? m.owner })
    return done(s)
  }
  if (mk.kind !== 'searchable') {
    if (t.test.success) s = patchMarker(mk.id, { done: true })
    return done(s)
  }
  const trapped = mk.props.trapped === true
  if (!t.test.success && !trapped) return done(s)
  if (!t.test.success && trapped) s = pushEvents(s, [{ type: 'danger', markerId: mk.id, modelId }])
  const drawn = drawItem(s, bundle, modelId, mk)
  s = drawn.state
  const resolved = { ...s, markers: s.markers.filter((x) => x.id !== mk.id) }
  if (!drawn.defId) return done(pushEvents(resolved, [{ type: 'searchEmpty', markerId: mk.id, modelId }]))
  s = pushEvents(resolved, [{ type: 'itemFound', defId: drawn.defId, markerId: mk.id, modelId }])
  const keep = option('keep', 'Keep it', 'search.keep', { modelId, defId: drawn.defId, markerId: mk.id })
  const leave = option('leave', 'Leave it here', 'search.leave', { modelId, defId: drawn.defId, markerId: mk.id })
  return { state: raiseDecision({ ...s, markers: [...s.markers, { ...mk, props: { ...mk.props, pending: true } }] }, { seat: m.owner, kind: 'search.found', context: { modelId, defId: drawn.defId, markerId: mk.id }, options: [keep, leave], canPass: false }) }
}

function foundChoice(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const modelId = action.modelId as string
  const defId = action.defId as string
  const m = state.models[modelId]
  const mk = state.markers.find((x) => x.id === action.markerId)
  if (!m || !mk) return reject('E_BAD_TARGET', 'Stale search')
  const markers = state.markers.filter((x) => x.id !== mk.id)
  const kind: CarriedKind = recordOf(bundle, 'items', defId) ? 'item' : recordOf(bundle, 'weapons', defId) ? 'weapon' : recordOf(bundle, 'armor', defId) ? 'armor' : 'item'
  const card: CarriedItem = { uid: `${modelId}/${defId}#${state.events.length}`, defId, kind, starting: false }
  let s: GameState = { ...state, markers }
  if (action.type === 'search.keep') s = updateModel(s, modelId, { carried: [...m.carried, card] })
  else s = { ...s, markers: [...markers, { ...mk, id: `${mk.id}-item`, kind: 'object', face: `item:${defId}`, revealed: true, props: { dropped: { ...card, uid: `left/${mk.id}/${defId}` } } }] }
  return { state: s, done: { modelId, type: 'search.interact', triggers: [] } }
}

export const items: ModuleDef = {
  id: 'items',
  kinds: ['item', 'expertise', 'search'],
  options(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m || m.life !== 'active' || m.offTable) return []
    const out: DecisionOption[] = []
    for (const c of m.carried) {
      const def = c.kind === 'item' && !c.spent ? recordOf(bundle, 'items', c.defId) : undefined
      if (!def || unitBars(unitOf(state, bundle, modelId), def) || !restrictionOk(unitOf(state, bundle, modelId), def.restriction)) continue
      out.push(option(`use:${c.uid}`, `Use ${def.name}`, 'item.use', { modelId, itemUid: c.uid }))
      if (!c.starting) out.push(option(`drop:${c.uid}`, `Drop ${def.name}`, 'item.drop', { modelId, itemUid: c.uid }))
    }
    const free = !isEngaged(state, modelId)
    for (const mk of state.markers) {
      if (mk.props.dropped && inReach(m, mk)) out.push(option(`pickup:${mk.id}`, 'Pick up the item', 'item.pickup', { modelId, markerId: mk.id }))
      if (mk.kind === 'investigation' && !mk.seenBy.includes(m.owner) && peekViewer(state, bundle, m.owner, mk)) out.push(option(`peek:${mk.id}`, 'Peek at a marker', 'search.peek', { modelId, markerId: mk.id }))
      if (free && inReach(m, mk) && (mk.kind === 'searchable' || (mk.kind === 'object' && typeof mk.props.skill === 'string')) && !mk.props.pending) {
        const skill = (mk.props.skill as Skill | undefined) ?? 'search'
        if (skillBase(state, bundle, modelId, skill) !== null) out.push(option(`interact:${mk.id}`, `Use ${skill} on the marker`, mk.kind === 'searchable' ? 'search.interact' : 'expertise.use', { modelId, markerId: mk.id }))
      }
    }
    return out
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    const modelId = (action.modelId ?? state.activation?.modelId) as string | undefined
    if (!modelId || typeof modelId !== 'string') return reject('E_BAD_PARAM', 'modelId is required')
    const after = (r: StepResult): StepResult => (isRej(r) || 'done' in r && r.done || r.state.pending.id !== state.pending.id ? r : reMenu(r.state, bundle))
    switch (action.type) {
      case 'item.use': return after(useItem(state, bundle, modelId, action.itemUid as string))
      case 'item.drop': return after(dropItem(state, bundle, modelId, action.itemUid as string))
      case 'item.pickup': return after(pickUpItem(state, bundle, modelId, action.markerId as string))
      case 'item.choose': {
        const def = recordOf(bundle, 'items', action.itemId as string)
        const choose = def?.effects.concat(def.cooked ?? []).find((e) => isOp(e) && e.op === 'choose') as OpEffect | undefined
        const branch = choose?.options?.[action.index as number]
        if (!def || !branch) return reject('E_BAD_PARAM', 'Unknown choice')
        return after({ state: applyOps(state, bundle, modelId, branch) })
      }
      case 'search.peek': return after(peek(state, bundle, action))
      case 'search.interact':
      case 'expertise.use': return interact(state, bundle, action)
      case 'search.keep':
      case 'search.leave': return foundChoice(state, bundle, action)
      default: return reject('E_UNKNOWN_KIND', `items does not handle ${action.type}`)
    }
  },
}
