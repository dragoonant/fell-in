// Checklist (owner A): CHG BC CC (charge bonus, Battle Cry, close combat, slide, free attacks). Spec 11 s4.
// Owns 'charge.*', 'melee.*' and 'battleCry.*'. Charge movement itself is movement.chargeMove() (owner T).
//
// Pending kinds raised here: 'charge.marker' (black or green bonus), 'battleCry.push' (optional Push Back), 'battleCry.escape' (BC-006: a winning defender
// may back off for free), 'melee.slide'
// (optional reposition; the same action type with a `path` slides, without one stays put) and 'melee.luck' (see attack.ts).
// Charge Bonus bookkeeping: ModelState.chargeBonus holds the markers; tokens['charged:<targetId>'] = 1 names the charged model.
import type { Colour, DicePool, EditionBundle, Skill } from '../data/types'
import { hasCondition } from './conditions'
import { computeSv, opposed, skillTest } from './dice'
import { recordOf, ruleNum, rulerInches } from './edition'
import { attrOf, skillRow, unitOf } from './forces'
import { baseDiameter, isOnTable, sub } from './geometry'
import { sweepStraight } from './geometry'
import { carriedOf } from './items'
import { hasLos } from './los'
import { modelDistance } from './measure'
import { hostile } from './sides'
import { inObjectContact, markerById, meleeableMarkers, withProbe } from './objects'
import { breakContact, chargeMines, chargeMove, pushBack, retreatPath, validateMove } from './movement'
import {
  isRejection, option, pushEvents, raiseDecision, reject, updateModel, type ActionDone, type ModuleDef, type StepResult, type Trigger,
} from './registry'
import { conditionSvMods } from './conditions'
import {
  actionFlags, composePlan, criticalProblem, dropCharged, engagedWith, isEngaged, nameOf, resolveImmediate, startAttack, resolveLuck,
  weaponRef, improvisedUid, type AttackOptsEx, type AttackPlan, type WeaponRef,
  raiseFollow, raiseSlide,
} from './attack'
import { hooked } from './hooks'
import type { Action, DecisionOption, GameState, Mod, ModelId, Rejection, Vec2 } from './types'
import type { Band, CoverInfo } from './query'

export { engagedWith, isEngaged }

const EPS = 1e-6
/** RULING (CC-006): the Super Mutant faction tests ranged weapons in close combat with Melee. */
const SUPER_MUTANT_FACTION = 'super-mutants'

// ---------- weapons usable in close combat ----------
/** Weapon uids a model can swing or fire in close combat: melee weapons, the Improvised Weapon, and ranged weapons with no minimum range (CC-004/005). */
export function ccWeapons(state: GameState, bundle: EditionBundle, modelId: ModelId): string[] {
  const m = state.models[modelId]
  if (!m || !isOnTable(m)) return []
  const out: string[] = []
  for (const c of carriedOf(state, modelId, 'weapon')) {
    const def = recordOf(bundle, 'weapons', c.defId)
    if (!def || def.mine) continue
    if (!skillRow(state, bundle, modelId, def.skill)) continue
    if (def.skill !== 'melee') {
      if (def.minShortZero === false) continue // CC-005: a non-zero minimum short range rules the weapon out
      if (!def.dice.short) continue
      if (def.slowFiring && c.loaded === false) continue
      if (def.heavy && state.activation?.modelId === modelId && state.activation.heavyFired) continue
    }
    if (def.primed && (c.primed ?? 0) < def.primed.tokens) continue // WPN-005
    out.push(c.uid)
  }
  // melee weapons first (stable order), then the ranged ones, then the Improvised Weapon (CC-001)
  const rank = (uid: string): number => {
    const d = recordOf(bundle, 'weapons', m.carried.find((c) => c.uid === uid)!.defId)
    return d?.skill === 'melee' ? 0 : 1
  }
  out.sort((a, b) => rank(a) - rank(b))
  if (skillRow(state, bundle, modelId, 'melee') && recordOf(bundle, 'weapons', 'improvised-weapon')) out.push(improvisedUid(modelId))
  return out
}

function chargePools(state: GameState, attackerId: ModelId, targetId: ModelId): DicePool[] {
  const a = state.models[attackerId]!
  if (!a.tokens[`charged:${targetId}`]) return [] // CHG-004: only against the charged model
  return a.chargeBonus.map((c) => ({ [c]: 1 }))
}

/** Close combat attack plan (CC-001..006): weapon skill, Str bonus, outnumbered, charge markers, ranged-in-melee penalties. */
export function meleePlan(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId, opts: AttackOptsEx = {}): AttackPlan | Rejection {
  const A = state.models[attackerId], B = state.models[targetId]
  if (!A || !B || !isOnTable(A) || !isOnTable(B) || attackerId === targetId) return reject('E_BAD_TARGET', 'Not a valid attacker and target.')
  if (!opts.objectContact && !engagedWith(state, attackerId).includes(targetId)) return reject('E_NOT_ENGAGED', 'Close combat needs base contact with an opposing model.') // CC-013
  const uid = opts.weaponUid ?? ccWeapons(state, bundle, attackerId)[0]
  if (!uid) return reject('E_NO_ITEM', 'No weapon to fight with.')
  const ref: WeaponRef | undefined = weaponRef(state, bundle, attackerId, uid)
  if (!ref) return reject('E_NO_ITEM', `Weapon ${uid} is not carried or already used up.`)
  if (!ccWeapons(state, bundle, attackerId).includes(uid)) return reject('E_NOT_LEGAL', `${ref.def.name} cannot be used in close combat.`)
  const isMelee = ref.def.skill === 'melee'
  const band: Band = isMelee ? 'melee' : 'short'
  const critical = !!opts.critical
  if (critical) {
    const bad = criticalProblem(state, bundle, attackerId, ref, band)
    if (bad) return bad
  }
  const flags = actionFlags(state, attackerId, opts)
  const unit = unitOf(state, bundle, attackerId)
  const mods: Mod[] = []
  if (hasCondition(B, 'stunned')) mods.push({ source: 'stunned', label: 'Target is stunned', value: ruleNum(bundle, 'intoMeleeBonus'), mode: 'add' }) // COND-008
  const pools: DicePool[] = chargePools(state, attackerId, targetId)
  if (isMelee && attrOf(state, bundle, attackerId, 'str') >= ruleNum(bundle, 'strBonusThreshold')) {
    pools.push({ black: ruleNum(bundle, 'strBonusBlackDice') }) // CC-002
  }
  if (engagedWith(state, targetId).length >= 2) pools.push({ green: ruleNum(bundle, 'outnumberedGreenDice') }) // CC-003
  // CC-004: a ranged or thrown weapon in melee counts as one cover, unless it answers the model that charged us.
  let cover: CoverInfo = { cover: false, count: 0, svMods: [], armorBonus: 0, sources: [] }
  if (!isMelee && !(flags.reaction && B.tokens[`charged:${attackerId}`])) {
    cover = {
      cover: true, count: 1, sources: ['melee'], armorBonus: ruleNum(bundle, 'coverArmorBonus'),
      svMods: [{ source: 'cover', label: 'Firing in close combat', value: ruleNum(bundle, 'coverPenalty'), mode: 'add' }],
    }
  }
  const svSkill: Skill | undefined = !isMelee && unit?.faction === SUPER_MUTANT_FACTION && skillRow(state, bundle, attackerId, 'melee') ? 'melee' : undefined
  return composePlan(state, bundle, {
    attackerId, targetId, ref, weaponUid: uid, band, critical, cover, intoMelee: false, flags, svSkill, extraMods: mods, extraPools: pools,
  })
}

/** Close Combat plan against a scenario object in base contact; never an engagement (SHOT-003, RR p2). */
export function objectMeleePlan(state: GameState, bundle: EditionBundle, attackerId: ModelId, markerId: string, opts: AttackOptsEx = {}): AttackPlan | Rejection {
  const mk = markerById(state, markerId)
  if (!mk || !meleeableMarkers(state).some((x) => x.id === markerId)) return reject('E_BAD_TARGET', 'That object cannot be struck.')
  if (!inObjectContact(state, attackerId, mk)) return reject('E_NOT_ENGAGED', 'Close combat with an object needs base contact.')
  const probed = withProbe(state, mk)
  const plan = meleePlan(probed.state, bundle, attackerId, probed.probeId, { ...opts, objectContact: true })
  if (isRejection(plan)) return plan
  return { ...plan, targetId: markerId, targetMarkerId: markerId }
}

/** Free Quick Action attack against a withdrawing model (CC-009..011). Called by movement before the move. Not a trigger. */
export function freeAttack(state: GameState, bundle: EditionBundle, attackerId: ModelId, targetId: ModelId): { state: GameState } {
  const A = state.models[attackerId]
  if (!A || !isOnTable(A) || hasCondition(A, 'stunned')) return { state } // COND-008
  const eng = engagedWith(state, attackerId)
  if (eng.length !== 1 || eng[0] !== targetId) return { state } // only a model engaged with nobody else
  const plan = meleePlan(state, bundle, attackerId, targetId, { free: true })
  if (isRejection(plan)) return { state }
  return { state: resolveImmediate(state, bundle, 'melee', plan) }
}

// ---------- charge ----------
const validPath = (p: unknown): p is Vec2[] => Array.isArray(p) && p.every((v) => v && typeof v.x === 'number' && typeof v.z === 'number')

/** Can this model start a charge on the target (reach by the Charge ruler, LoS, not engaged)? Cheap check for menus. */
function canCharge(state: GameState, bundle: EditionBundle, modelId: ModelId, targetId: ModelId): boolean {
  const A = state.models[modelId], B = state.models[targetId]
  const unit = unitOf(state, bundle, modelId)
  if (!A || !B || !unit || !isOnTable(A) || !isOnTable(B) || !hostile(state, A.owner, B.owner) || isEngaged(state, modelId)) return false
  const reach = rulerInches(bundle, unit.charge) + baseDiameter(A.base) // front-to-rear measuring (MOVE-001)
  if (!(modelDistance(A, B) <= reach + EPS) || !hasLos(state, modelId, targetId)) return false
  // The menu entry is the straight charge (no waypoints): offer it only when that charge resolves, so every listed
  // option is accepted. A client may still send a path round blockers through charge.go.
  const moved = chargeMove(state, bundle, modelId, targetId, [], { charge: true, quick: actionFlags(state, modelId).quick })
  return !isRejection(moved) && engagedWith(moved.state, modelId).includes(targetId)
}

function ownedModel(state: GameState, action: Action): { m: GameState['models'][string]; id: ModelId } | Rejection {
  const id = String(action.modelId ?? '')
  const m = state.models[id]
  if (!m) return reject('E_BAD_PARAM', 'Unknown model.')
  if (m.owner !== action.seat) return reject('E_WRONG_SEAT', 'That model belongs to another seat.')
  return { m, id }
}

const chargeDone = (modelId: ModelId, won: boolean, defenderId: ModelId): ActionDone => {
  // CHG: a charge is a movement trigger. A winning Battle Cry exempts the charged model (BC-004); `exempt` is read by turnflow.
  const t = { kind: 'action', sourceId: modelId, movement: true, ...(won ? { exempt: [defenderId] } : {}) } as Trigger
  return { modelId, type: 'charge.go', triggers: [t] }
}

function chargeGo(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const own = ownedModel(state, action)
  if (isRejection(own)) return own
  const { id, m } = own
  const targetId = String(action.targetId ?? '')
  const B = state.models[targetId]
  if (!B || !isOnTable(B) || !hostile(state, B.owner, m.owner)) return reject('E_BAD_TARGET', 'Charge an opposing model on the table.')
  if (isEngaged(state, id)) return reject('E_ENGAGED', 'A model cannot charge while engaged.') // CHG-002 / CC-011
  if (!hasLos(state, id, targetId)) return reject('E_NO_LOS', 'A charge needs line of sight to its target.')
  if (action.path !== undefined && !validPath(action.path)) return reject('E_BAD_PARAM', 'Malformed path.')
  const flags = actionFlags(state, id)
  const path = action.path !== undefined ? (action.path as Vec2[]) : [{ ...B.pos }]
  const moved = chargeMove(state, bundle, id, targetId, path, { charge: true, quick: flags.quick })
  if (isRejection(moved)) return moved
  let s = moved.state
  if (!engagedWith(s, id).includes(targetId)) return reject('E_TOO_FAR', 'The charge did not end in base contact.') // CHG-001
  // WPN-003: crossing a live enemy mine's area on the way pauses the charge for the blast; a dead charger or target ends it here.
  const mined = chargeMines(s, bundle, id, targetId, m.pos, path)
  s = mined.state
  if (mined.stopped) return { state: s, done: chargeDone(id, false, targetId) }
  // CHG-005: starting a new charge drops any older markers.
  s = updateModel(s, id, { chargeBonus: [], tokens: dropCharged(s.models[id]!.tokens) })
  return {
    state: raiseDecision(s, {
      seat: m.owner, kind: 'charge.marker', canPass: false, context: { modelId: id, targetId },
      options: (['black', 'green'] as const).map((c) => option(c, `Take a ${c} charge die`, 'charge.marker', { modelId: id, targetId, colour: c }, m.owner)),
    }),
  }
}

function svOf(state: GameState, bundle: EditionBundle, modelId: ModelId, skill: Skill): number | null {
  const row = skillRow(state, bundle, modelId, skill)
  return row ? computeSv(attrOf(state, bundle, modelId, row.attr), conditionSvMods(state, bundle, modelId)).sv : null
}

function chargeMarker(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const own = ownedModel(state, action)
  if (isRejection(own)) return own
  const { id, m } = own
  const targetId = String(action.targetId ?? '')
  const colour = action.colour === 'black' || action.colour === 'green' ? action.colour : null
  if (!colour || !state.models[targetId]) return reject('E_BAD_PARAM', 'Choose black or green.')
  let s = updateModel(state, id, { chargeBonus: [colour], tokens: { ...dropCharged(m.tokens), [`charged:${targetId}`]: 1 } }) // CHG-003
  // Battle Cry (BC-001..006): only a coloured Battle Cry icon can start one; immune models cannot be targeted.
  const row = skillRow(s, bundle, id, 'battleCry')
  const target = unitOf(s, bundle, targetId)
  if (!row?.colour || target?.flags.includes('battleCryImmune')) return { state: s, done: chargeDone(id, false, targetId) }
  const aSv = svOf(s, bundle, id, 'battleCry')!
  const a = skillTest(s, bundle, { sv: aSv, pool: {}, purpose: 'battleCry:charger', ownerId: id })
  s = pushEvents(a.state, a.events)
  const defSkill: Skill = skillRow(s, bundle, targetId, 'resistBattleCry') ? 'resistBattleCry' : 'battleCry'
  const dSv = svOf(s, bundle, targetId, defSkill)
  const d = dSv === null
    ? skillTest(s, bundle, { sv: 0, pool: {}, purpose: 'battleCry:defender', ownerId: targetId, chooseFail: true }) // cannot resist
    : skillTest(s, bundle, { sv: dSv, pool: {}, purpose: 'battleCry:defender', ownerId: targetId })
  s = pushEvents(d.state, d.events)
  const who = opposed(a.test, d.test, 'a') // BC-002: ties go to the charger
  s = pushEvents(s, [{ type: 'battleCry', chargerId: id, targetId, winner: who === 'a' ? 'charger' : who === 'b' ? 'defender' : 'none' }])
  if (who === 'b') { // BC-006: the charger loses the marker and gets no push; the charge stays a trigger
    s = updateModel(s, id, { chargeBonus: [], tokens: dropCharged(s.models[id]!.tokens) })
    const escape = escapeDecision(s, bundle, id, targetId)
    return escape ? { state: escape } : { state: s, done: chargeDone(id, false, targetId) }
  }
  if (who === null) return { state: s, done: chargeDone(id, false, targetId) }
  s = updateModel(s, id, { chargeBonus: ['black', 'green'] }) // BC-003
  const done = chargeDone(id, true, targetId)
  return {
    state: raiseDecision(s, {
      seat: m.owner, kind: 'battleCry.push', canPass: false, context: { modelId: id, targetId, colour: row.colour, done },
      options: [
        option('push', `Shove ${nameOf(s, bundle, targetId)} back`, 'battleCry.push', { modelId: id, targetId, push: true }, m.owner),
        option('stay', 'Hold position', 'battleCry.push', { modelId: id, targetId, push: false }, m.owner),
      ],
    }),
  }
}

/**
 * BC-006 (RoP p36): a defender that wins the Battle Cry may at once use a Reaction to leave the engagement with no free attack.
 * A Reaction needs a Reaction marker next to the model (RoP p41), so a defender without one gets no offer. Offered only to a
 * defender that can act (not Stunned or Frozen) and has somewhere to go; 'stay' is listed first.
 */
function escapeDecision(state: GameState, bundle: EditionBundle, chargerId: ModelId, defenderId: ModelId): GameState | null {
  const d = state.models[defenderId]
  if (!d || !isOnTable(d) || !d.reaction || hasCondition(d, 'stunned') || hasCondition(d, 'frozen')) return null
  if (!engagedWith(state, defenderId).includes(chargerId) || !retreatPath(state, bundle, defenderId, chargerId)) return null
  return raiseDecision(state, {
    seat: d.owner, kind: 'battleCry.escape', canPass: false, context: { modelId: defenderId, chargerId },
    options: [
      option('stay', 'Stand your ground', 'battleCry.escape', { modelId: defenderId, go: false }, d.owner),
      option('go', `Back away from ${nameOf(state, bundle, chargerId)} (free Reaction, no free attack)`, 'battleCry.escape', { modelId: defenderId, go: true }, d.owner),
    ],
  })
}

/**
 * Answer to 'battleCry.escape'. Leaving uses the defender's Reaction: its marker is removed (RoP p41) and the Move is a Quick
 * Action (RULING). The defender then gets no second Reaction to the charge; everyone else still may react to it.
 */
function battleCryEscape(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.pending.context as { modelId: ModelId; chargerId: ModelId }
  if (typeof action.go !== 'boolean') return reject('E_BAD_PARAM', 'Choose to back away or stay.')
  if (!action.go) return { state, done: chargeDone(ctx.chargerId, false, ctx.modelId) }
  if (action.path !== undefined && !validPath(action.path)) return reject('E_BAD_PARAM', 'Malformed path.')
  const moved = breakContact(state, bundle, ctx.modelId, ctx.chargerId, action.path as Vec2[] | undefined)
  if (isRejection(moved)) return moved
  const s = pushEvents(updateModel(moved.state, ctx.modelId, { reaction: false }), [{ type: 'battleCryEscape', modelId: ctx.modelId, chargerId: ctx.chargerId, to: { ...moved.state.models[ctx.modelId]!.pos } }])
  return { state: s, done: chargeDone(ctx.chargerId, true, ctx.modelId) } // the reaction is used: no second one for the defender
}

function battleCryPush(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.pending.context as { modelId: ModelId; targetId: ModelId; colour: Colour; done: ActionDone }
  if (typeof action.push !== 'boolean') return reject('E_BAD_PARAM', 'Choose push or stay.')
  if (!action.push) return { state, done: ctx.done }
  const A = state.models[ctx.modelId]!
  const s = pushBack(state, bundle, ctx.targetId, A.pos, ctx.colour).state // BC-005, CC-012
  // The follow-up is a separate choice (CH p15): declining it still leaves the target pushed.
  if (!isOnTable(s.models[ctx.targetId]!) || !isOnTable(s.models[ctx.modelId]!)) return { state: s, done: ctx.done }
  return { state: raiseFollow(s, ctx.modelId, ctx.targetId, ctx.done, 'done') }
}

/** Answer to 'battleCry.follow': the pusher steps after its target, or declines (ERR p.16: that bars a new base-contact attack on it). */
function pushFollow(state: GameState, _bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.pending.context as { modelId: ModelId; targetId: ModelId; done: ActionDone; then: 'slide' | 'done' }
  if (typeof action.follow !== 'boolean') return reject('E_BAD_PARAM', 'Choose follow or hold.')
  let s = state
  const a = s.models[ctx.modelId], b = s.models[ctx.targetId]
  if (action.follow && a && b && isOnTable(a) && isOnTable(b)) {
    const gap = modelDistance(a, b)
    if (gap > EPS) {
      const sw = sweepStraight(s, ctx.modelId, sub(b.pos, a.pos), gap)
      s = updateModel(s, ctx.modelId, { pos: sw.end })
    }
  } else if (!action.follow && a) {
    s = updateModel(s, ctx.modelId, { tokens: { ...a.tokens, [`noFollow:${ctx.targetId}`]: 1 } }) // cleared when the next activation begins
  }
  if (ctx.then === 'slide' && s.models[ctx.modelId] && isOnTable(s.models[ctx.modelId]!)) return { state: raiseSlide(s, ctx.modelId, ctx.done) }
  return { state: s, done: ctx.done }
}

// ---------- slide ----------
function meleeSlide(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.pending.context as { modelId: ModelId; engagedBefore: ModelId[]; done: ActionDone }
  if (action.path === undefined || (Array.isArray(action.path) && action.path.length === 0)) return { state, done: ctx.done }
  if (!validPath(action.path)) return reject('E_BAD_PARAM', 'Malformed path.')
  const v = validateMove(state, bundle, ctx.modelId, action.path)
  if (isRejection(v)) return v
  const moved = updateModel(state, ctx.modelId, { pos: v.end })
  const me = moved.models[ctx.modelId]!
  for (const id of ctx.engagedBefore) { // CC-007: every existing engagement survives the slide
    const o = moved.models[id]
    if (o && isOnTable(o) && modelDistance(me, o) > EPS) return reject('E_NOT_LEGAL', 'A slide must keep every engagement.')
  }
  return { state: moved, done: ctx.done }
}

// ---------- the module ----------
export const melee: ModuleDef = hooked({
  id: 'melee',
  kinds: ['charge', 'melee', 'battleCry'],
  options(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m || !isOnTable(m)) return []
    const out: DecisionOption[] = []
    const foes = engagedWith(state, modelId).sort()
    for (const mk of meleeableMarkers(state)) { // SHOT-003: an object in contact can be struck, without any engagement
      if (!inObjectContact(state, modelId, mk)) continue
      for (const uid of ccWeapons(state, bundle, modelId)) {
        const ref = weaponRef(state, bundle, modelId, uid)
        if (ref) out.push(option(`melee:${uid}:obj:${mk.id}`, `Strike the ${mk.face ?? 'object'} with ${ref.def.name}`, 'melee.attack', { modelId, weaponUid: uid, targetMarkerId: mk.id }, m.owner))
      }
    }
    if (foes.length) {
      for (const uid of ccWeapons(state, bundle, modelId)) {
        const ref = weaponRef(state, bundle, modelId, uid)
        if (!ref) continue
        for (const t of foes) {
          out.push(option(`melee:${uid}:${t}`, `Fight ${nameOf(state, bundle, t)} with ${ref.def.name}`, 'melee.attack', { modelId, weaponUid: uid, targetId: t }, m.owner))
          if (ref.def.skill === 'melee' && ref.def.critical && criticalProblem(state, bundle, modelId, ref, 'melee') === null) {
            out.push(option(`melee:${uid}:${t}:crit`, `Critical strike on ${nameOf(state, bundle, t)} with ${ref.def.name}`, 'melee.attack', { modelId, weaponUid: uid, targetId: t, critical: true }, m.owner))
          }
        }
      }
    } else {
      for (const o of Object.values(state.models).sort((a, b) => a.id.localeCompare(b.id))) {
        if (canCharge(state, bundle, modelId, o.id)) out.push(option(`charge:${o.id}`, `Charge ${nameOf(state, bundle, o.id)}`, 'charge.go', { modelId, targetId: o.id }, m.owner))
      }
    }
    return out
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    switch (action.type) {
      case 'melee.attack': {
        const own = ownedModel(state, action)
        if (isRejection(own)) return own
        const mopts = { weaponUid: String(action.weaponUid ?? ''), critical: action.critical === true }
        const plan = action.targetMarkerId !== undefined
          ? objectMeleePlan(state, bundle, own.id, String(action.targetMarkerId), mopts)
          : meleePlan(state, bundle, own.id, String(action.targetId ?? ''), mopts)
        if (isRejection(plan)) return plan
        return startAttack(state, bundle, 'melee', plan)
      }
      case 'melee.luck': return resolveLuck(state, bundle, action)
      case 'melee.slide': return meleeSlide(state, bundle, action)
      case 'charge.go': return chargeGo(state, bundle, action)
      case 'charge.marker': return chargeMarker(state, bundle, action)
      case 'battleCry.push': return battleCryPush(state, bundle, action)
      case 'battleCry.follow': return pushFollow(state, bundle, action)
      case 'battleCry.escape': return battleCryEscape(state, bundle, action)
      default: return reject('E_UNKNOWN_KIND', `Unknown action ${action.type}.`)
    }
  },
})
