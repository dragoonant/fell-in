// Checklist (owner T): TURN ACT AP PREP. Spec 11 s1, s2, s5, s6.
// The controller. Owns pending kinds 'turn.*' (start, first, ready, choose, pick, activation) and 'react.*' (reaction
// offers after a trigger), plus the Prepare action ('prepare.*'). It builds the activation menu from
// registry.allOptions(), forwards a chosen menu action to registry.moduleFor(action.type).resolve(), and runs
// afterAction() when a module reports `done`. setup.ts raises the first decision as kind 'turn.start'.
//
// Menu protocol: a full-Action entry is the module's own option; an AP-bought Quick Action entry is the same option
// with `quick: true`. While an Action resolves, state.action holds its ActionContext (quick / reaction flags).
import type { ApUse, EditionBundle } from '../data/types'
import { hasCondition, endOfActivation, startOfActivation } from './conditions'
import { rollColourDie } from './dice'
import { recordOf, rulerInches, ruleNum } from './edition'
import { unitOf } from './forces'
import { isOnTable } from './geometry'
import { tickEffects } from './items'
import { hasLos } from './los'
import { modelDistance } from './measure'
import { discardChargeBonus, engagedWith, gainPrimed, isEngaged } from './attack'
import {
  allOptions, isRejection, moduleFor, namespaceOf, option, pushEvents, raiseDecision, reject, updateModel,
  type ActionDone, type Controller, type StepResult, type Trigger,
} from './registry'
import { roll } from './rng'
import { checkVictory, endOfRound } from './scenario'
import { hostile, isAiSeat, sameTeam, teamSeats } from './sides'
import type { Action, ActionContext, DecisionOption, GameState, ModelId, ModelState, SeatId } from './types'

// ---------- small helpers ----------
const alive = (s: GameState, id: ModelId): boolean => { const m = s.models[id]; return !!m && isOnTable(m) }
const liveOf = (s: GameState, seat: SeatId): ModelState[] => Object.values(s.models).filter((m) => m.owner === seat && isOnTable(m))
const withReadiness = (s: GameState, seat: SeatId, r: ModelState['readiness']): ModelState[] => liveOf(s, seat).filter((m) => m.readiness === r)
const ownerOf = (s: GameState, id: ModelId): SeatId => s.models[id]?.owner ?? ''
/** Models of a seat's whole team with this readiness (a team of one seat is just that seat; COOP-001). */
const teamWith = (s: GameState, seat: SeatId, r: ModelState['readiness']): ModelState[] => teamSeats(s, seat).flatMap((x) => withReadiness(s, x, r))
/** First seat of each team in seat order: the seat that answers team-level decisions (spec 18 s8.4). */
const teamReps = (s: GameState): SeatId[] => s.seatOrder.filter((x, i) => s.seatOrder.findIndex((y) => sameTeam(s, x, y)) === i)
const repOf = (s: GameState, seat: SeatId): SeatId => teamSeats(s, seat)[0] ?? seat
/** AI Number Token of a model (CH p8); models without one sort last. */
const aiNumberOf = (m: ModelState): number => m.tokens.aiNumber ?? Number.MAX_SAFE_INTEGER
const byAiNumber = (a: ModelState, b: ModelState): number => aiNumberOf(a) - aiNumberOf(b) || a.id.localeCompare(b.id)
const setStep = (s: GameState, step: string): GameState => (s.turn ? { ...s, turn: { ...s.turn, step } } : s)

/** Which AP-use icon buys a Quick Action of this action type (spec 11 s5); null = cannot be bought. */
export function apUseOf(type: string): ApUse | null {
  switch (type.split('.')[0]) {
    case 'move': case 'charge': return 'movement'
    case 'shoot': case 'melee': case 'throw': return 'attack'
    case 'expertise': case 'search': return 'expertise'
    case 'prepare': return 'prepare'
    default: return null
  }
}

/** AP-use icons the model owns: its unit card, plus the Heroic card when it carries one (AP-007). */
export function apUseIcons(state: GameState, bundle: EditionBundle, modelId: ModelId): ApUse[] {
  const m = state.models[modelId]
  const own = unitOf(state, bundle, modelId)?.apUse ?? []
  const heroic = m?.heroic ? bundle.singletons.heroic?.apUse ?? [] : []
  return [...new Set([...own, ...heroic])]
}

/** Grant AP to the activating model from a finished skill die. Ignored in Quick Actions and reactions (AP-005). */
export function gainAp(state: GameState, n: number): GameState {
  const a = state.action, act = state.activation
  if (!act || n <= 0 || (a && (a.quick || a.reaction))) return state
  return { ...state, activation: { ...act, ap: act.ap + n } }
}

const END_OPTION = (): DecisionOption => option('end', 'End activation', 'turn.end')

// ---------- rounds and turns ----------
/** Start round N+1: clear readiness (TURN-001), settle Advantage (TURN-010/011), let the holder pick the first seat (TURN-012). */
export function startRound(state: GameState, bundle: EditionBundle): GameState {
  const round = state.round + 1
  const models = Object.fromEntries(Object.entries(state.models).map(([id, m]) => [id, { ...m, readiness: 'unready' as const }]))
  const seats = Object.fromEntries(Object.entries(state.seats).map(([id, st]) => [id, { ...st, done: false }]))
  let s: GameState = { ...state, phase: 'play', round, models, seats, turn: null, activation: null, action: null }
  const reps = teamReps(s)
  const counts = Object.fromEntries(reps.map((rep) => [rep, teamSeats(s, rep).reduce((n, x) => n + liveOf(s, x).length, 0)]))
  const live = reps.filter((seat) => counts[seat]! > 0)
  if (live.length === 0) return { ...s, phase: 'over', result: s.result ?? { winner: null, reason: 'No models are left on the table.' } }
  const fewest = Math.min(...live.map((x) => counts[x]!))
  const tied = live.filter((x) => counts[x] === fewest)
  let holder: SeatId = tied[0]!
  if (tied.length > 1) {
    if (round === 1 || !s.advantage || !tied.includes(s.advantage)) {
      // TURN-010: a tie in round 1 is settled at random (the roll goes through roll() so replays match).
      const r = roll(s, { count: 1, sides: tied.length, purpose: 'advantage' })
      s = pushEvents(r.state, [r.event])
      holder = tied[r.event.dice[0]! - 1]!
    } else {
      // TURN-011: a tie from round 2 on passes the Advantage to the next tied seat.
      holder = tied[(tied.indexOf(s.advantage) + 1) % tied.length]!
    }
  }
  s = { ...s, advantage: holder }
  if (live.length === 1) return beginTurn(s, bundle, live[0]!, live[0]!)
  return raiseDecision(s, {
    seat: holder, kind: 'turn.first', context: { round }, canPass: false,
    options: live.map((seat) => option(`first:${seat}`, `${teamSeats(s, seat).length > 1 ? 'Team' : 'Seat'} ${seat} takes the first turn`, 'turn.first', { firstSeat: seat })),
  })
}

function beginTurn(state: GameState, bundle: EditionBundle, seat0: SeatId, firstSeat: SeatId): GameState {
  const seat = repOf(state, seat0)
  const unready = teamWith(state, seat, 'unready')
  const s = { ...state, activation: null, action: null, turn: { seat, step: 'ready', readied: null, firstSeat } }
  if (unready.length === 0) return nextTurn(s, bundle, seat)
  const team = teamSeats(s, seat)
  return raiseDecision(s, {
    seat, kind: 'turn.ready', context: team.length > 1 ? { round: s.round, team } : { round: s.round }, canPass: false,
    options: unready.map((m) => option(`ready:${m.id}`, `Ready ${m.id}`, 'turn.ready', { modelId: m.id })),
  })
}

/** Begin a seat's turn: raise 'turn.ready' (exactly one Unready model, TURN-002). */
export function startTurn(state: GameState, bundle: EditionBundle, seat: SeatId): GameState {
  return beginTurn(state, bundle, seat, state.turn?.firstSeat ?? seat)
}

/** The next seat (cyclic, after `from`) with an Unready model takes a turn; if nobody has one the round ends (TURN-008/009). */
function nextTurn(state: GameState, bundle: EditionBundle, from: SeatId): GameState {
  const order = teamReps(state) // turns alternate between teams, not seats (COOP-001)
  const start = order.indexOf(repOf(state, from))
  for (let i = 1; i <= order.length; i++) {
    const seat = order[(start + i) % order.length]!
    if (teamWith(state, seat, 'unready').length > 0) return beginTurn(state, bundle, seat, state.turn?.firstSeat ?? seat)
  }
  const ended = endOfRound(state, bundle)
  return ended.phase === 'over' ? ended : startRound(ended, bundle)
}

function endTurn(state: GameState, bundle: EditionBundle): GameState {
  const seat = state.turn?.seat
  if (!seat) return state
  // TURN-007: Ready models left over become Used.
  let s = state
  for (const m of teamWith(state, seat, 'ready')) s = updateModel(s, m.id, { readiness: 'used' })
  const seats = { ...s.seats }
  for (const x of teamSeats(s, seat)) seats[x] = { ...seats[x]!, done: withReadiness(s, x, 'unready').length === 0 }
  s = { ...s, activation: null, action: null, seats }
  return nextTurn(s, bundle, seat)
}

/** After a model finishes: Use the next Ready model, or end the turn. A single Ready model starts without asking. */
function pickNext(state: GameState, bundle: EditionBundle): GameState {
  const seat = state.turn?.seat
  if (!seat) return state
  // Seats that chose "use none" already turned their Ready models Used, so every Ready team model is up for use.
  const ready = teamWith(state, seat, 'ready')
  if (ready.length === 0) return endTurn(state, bundle)
  if (ready.length === 1) {
    const r = beginActivation(state, bundle, ready[0]!.id)
    return isRejection(r) ? state : r.state
  }
  // The AI Uses its Ready models in ascending Number order (AI-001, CH p8); players interleave freely.
  const ai = isAiSeat(state, seat)
  const offered = ai ? [[...ready].sort(byAiNumber)[0]!] : ready
  const team = teamSeats(state, seat)
  const asker = team.find((x) => ready.some((m) => m.owner === x)) ?? seat
  return raiseDecision(setStep(state, 'pick'), {
    seat: asker, kind: 'turn.pick', context: team.length > 1 ? { round: state.round, team } : { round: state.round }, canPass: false,
    options: offered.map((m) => option(`pick:${m.id}`, `Use ${m.id}`, 'turn.pick', { modelId: m.id }, asker)),
  })
}

// ---------- use-all-or-none choice (TURN-003, COOP-001) ----------
const CHOOSE = 'choose:'
interface Choice { asking: SeatId; todo: SeatId[] }
function choiceState(s: GameState): Choice | null {
  const step = s.turn?.step
  if (!step || !step.startsWith(CHOOSE)) return null
  try { return JSON.parse(step.slice(CHOOSE.length)) as Choice } catch { return null }
}

/**
 * Ask the next team seat that still holds Ready models whether to Use them all or none (each player decides alone,
 * COOP-001). The AI seat is never offered "use none" (AI-001, CH p8). When nobody is left to ask, the Ready models
 * (those of seats that chose use all) are taken in turn, or the turn ends.
 */
function askNextChoice(state: GameState, bundle: EditionBundle, seats: readonly SeatId[]): GameState {
  const rest = seats.filter((x) => withReadiness(state, x, 'ready').length > 0)
  if (rest.length === 0) return pickNext(setStep(state, 'pick'), bundle)
  const [asking, ...todo] = rest as [SeatId, ...SeatId[]]
  const ai = isAiSeat(state, asking)
  const opts = [
    option('useAll', 'Use the Ready models', 'turn.useAll'),
    ...(ai ? [] : [option('useNone', 'Use none (they become Used)', 'turn.useNone')]),
  ]
  return raiseDecision(setStep(state, CHOOSE + JSON.stringify({ asking, todo } satisfies Choice)), {
    seat: asking, kind: 'turn.choose', context: { modelId: state.turn?.readied ?? null, seat: asking }, canPass: false,
    options: opts.map((o) => ({ ...o, action: { ...o.action, seat: asking } })),
  })
}

// ---------- activation ----------
/** Activation start in order (ACT-007, spec 11 s2): reaction discard, conditions.startOfActivation, items.tickEffects, reload, V.A.T.S. */
export function beginActivation(state: GameState, bundle: EditionBundle, modelId: ModelId): StepResult {
  if (!state.models[modelId]) return reject('E_BAD_PARAM', `Unknown model ${modelId}.`)
  let s = updateModel(state, modelId, { reaction: false }) // 1. PREP-005 / ACT-007
  s = {
    ...s, action: null,
    activation: { modelId, actionsTaken: 0, ap: 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
  }
  s = setStep(s, 'use')
  s = startOfActivation(s, bundle, modelId) // 2. fire, poison
  if (!alive(s, modelId)) return { state: endActivation(s, bundle) }
  s = tickEffects(s, bundle, modelId) // 3. item durations
  // 4. slow-firing weapons reload (SHOT-005)
  const m = s.models[modelId]!
  const carried = m.carried.map((c) => (c.kind === 'weapon' && recordOf(bundle, 'weapons', c.defId)?.slowFiring ? { ...c, loaded: true } : c))
  s = updateModel(s, modelId, { carried })
  // 5. V.A.T.S. (AP-003): one blue die, 1 AP per bottle icon
  const vats = bundle.singletons.heroic?.vats
  if (m.heroic && vats) {
    const r = rollColourDie(s, bundle, 'blue', 'vats', modelId)
    s = pushEvents(r.state, [r.event])
    const ap = r.die.icons.filter((i) => i === vats).length
    if (ap > 0 && s.activation) s = { ...s, activation: { ...s.activation, ap: s.activation.ap + ap } }
  }
  return { state: raiseMenu(s, bundle) }
}

/** Menu entries for a spent activation: Quick-Action variants appear only while AP and an unused icon remain. */
function menuEntries(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
  const act = state.activation
  const m = state.models[modelId]
  if (!act || !m) return [END_OPTION()]
  const full = act.actionsTaken < ruleNum(bundle, 'actionsPerActivation')
  const icons = apUseIcons(state, bundle, modelId)
  const stunned = hasCondition(m, 'stunned')
  const out: DecisionOption[] = []
  // Quick variants are offered only for entries the owning module still lists under a Quick context (a quick charge
  // uses a shorter ruler, so a target in full-charge reach may be out of quick reach): every option stays legal.
  const quickCtx: ActionContext = { modelId, type: 'menu', quick: true, reaction: false, free: false, itemUsed: false }
  const quickIds = act.ap > 0 ? new Set(allOptions({ ...state, action: quickCtx }, bundle, modelId).map((o) => o.id)) : new Set<string>()
  for (const o of allOptions({ ...state, action: null }, bundle, modelId)) {
    if (o.action.type.startsWith('turn.')) continue
    if (stunned && o.action.type !== 'move.shakeOff') continue // COND-007
    if (full) out.push(o)
    const use = apUseOf(o.action.type)
    if (act.ap > 0 && use && icons.includes(use) && !act.apIconsUsed.includes(use) && quickIds.has(o.id)) {
      out.push({ ...o, id: `quick:${o.id}`, label: `${o.label} (Quick, 1 AP)`, action: { ...o.action, quick: true } })
    }
  }
  out.push(END_OPTION())
  return out
}

/** The activation menu for the active model: allOptions() entries (full Actions while actions remain, AP-bought Quick Actions) plus End activation. Never empty. */
export function activationMenu(state: GameState, bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
  return menuEntries(state, bundle, modelId)
}

/** Raise the activation menu, or finish the activation at once when nothing but End is left (ACT-001). */
function raiseMenu(state: GameState, bundle: EditionBundle): GameState {
  const act = state.activation
  if (!act) return state
  const menu = activationMenu(state, bundle, act.modelId)
  const spent = act.actionsTaken >= ruleNum(bundle, 'actionsPerActivation')
  if (menu.length === 1 && spent) return endActivation(state, bundle)
  return raiseDecision(setStep(state, 'use'), {
    seat: ownerOf(state, act.modelId), kind: 'turn.activation',
    context: { modelId: act.modelId, actionsLeft: Math.max(0, ruleNum(bundle, 'actionsPerActivation') - act.actionsTaken), ap: act.ap },
    options: menu, canPass: false,
  })
}

/** End the activation: drop leftover AP (AP-006), Frozen ends (COND-002), mark Used, continue the turn or pass it on. */
export function endActivation(state: GameState, bundle: EditionBundle): GameState {
  const act = state.activation
  let s = state
  if (act) {
    if (alive(s, act.modelId)) s = endOfActivation(s, bundle, act.modelId)
    s = updateModel(s, act.modelId, { readiness: 'used' })
  }
  s = { ...s, activation: null, action: null }
  if (s.phase === 'over') return s
  return pickNext(s, bundle)
}

/** Spend the cost of a menu Action and forward it to the module owning its namespace. */
function forwardMenuAction(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const act = state.activation
  if (!act) return reject('E_NOT_LEGAL', 'No model is activating.')
  const quick = action.quick === true
  const use = apUseOf(action.type)
  let next = act
  if (quick) {
    if (act.ap < 1 || !use || act.apIconsUsed.includes(use)) return reject('E_NO_AP', 'No Action Point can buy that Quick Action.')
    next = { ...act, ap: act.ap - 1, apIconsUsed: [...act.apIconsUsed, use] }
  } else {
    if (act.actionsTaken >= ruleNum(bundle, 'actionsPerActivation')) return reject('E_NO_ACTIONS_LEFT', 'This model has no Actions left.')
    next = { ...act, actionsTaken: act.actionsTaken + 1 }
  }
  const ctx: ActionContext = { modelId: act.modelId, type: action.type, quick, reaction: false, free: false, itemUsed: false }
  const s: GameState = { ...state, activation: next, action: ctx }
  const clean = { ...action }
  if (action.type === 'prepare.go') return prepare(s, bundle, act.modelId)
  const mod = moduleFor(action.type)
  if (!mod || mod.id === 'turnflow') return reject('E_UNKNOWN_KIND', `Nothing resolves ${action.type}.`)
  return mod.resolve(s, bundle, clean)
}

function prepare(state: GameState, bundle: EditionBundle, modelId: ModelId): StepResult {
  const m = state.models[modelId]
  if (!m) return reject('E_BAD_PARAM', 'Unknown model.')
  if (hasCondition(m, 'frozen')) return reject('E_CONDITION', 'A Frozen model cannot Prepare.') // PREP-006
  if (m.reaction) return reject('E_NOT_LEGAL', 'Already holding a Reaction marker.') // PREP-001
  void bundle
  return { state: updateModel(state, modelId, { reaction: true }), done: { modelId, type: 'prepare.go', triggers: [] } }
}

// ---------- reactions (PREP-007..016) ----------
interface Offer { r: ModelId; t: Trigger }
interface Declared { r: ModelId; src: ModelId; action: Action }
interface ReactState { offers: Offer[]; declared: Declared[]; src: ModelId }
const REACT = 'react:'

function reactState(s: GameState): ReactState | null {
  const step = s.turn?.step
  if (!step || !step.startsWith(REACT)) return null
  try { return JSON.parse(step.slice(REACT.length)) as ReactState } catch { return null }
}
const putReact = (s: GameState, rs: ReactState): GameState => setStep(s, REACT + JSON.stringify(rs))

/** While a reaction resolves: the model whose Action caused it. Attack reactions may target only that model (PREP-011). */
export function reactionTargetOf(state: GameState): ModelId | null {
  if (!state.action?.reaction) return null
  return reactState(state)?.src ?? null
}

/** Does the reacting model notice this trigger (awareness lengths, LoS, engagement; PREP-007..009, PREP-012)? */
function notices(s: GameState, bundle: EditionBundle, r: ModelState, t: Trigger): boolean {
  const src = s.models[t.sourceId]
  if (!src || !isOnTable(src) || !isOnTable(r) || r.id === src.id || !r.reaction) return false
  if ((t as Trigger & { exempt?: ModelId[] }).exempt?.includes(r.id)) return false // BC-004: a won Battle Cry
  const u = unitOf(s, bundle, r.id)
  if (!u) return false
  if (t.kind === 'damaged') return t.targetId === r.id && isEngaged(s, r.id) // engaged models may Move after taking damage
  if (t.kind === 'action' && !hostile(s, r.owner, src.owner)) return false // COOP-002: only the opposing side's Actions
  if (t.kind === 'hit') {
    const tgt = t.targetId ? s.models[t.targetId] : undefined
    if (!tgt || !sameTeam(s, tgt.owner, r.owner)) return false // PREP-009 / COOP-002: a model of the team being hit
  }
  const one = rulerInches(bundle, u.awareness)
  const reach = t.movement || t.attack ? one * 2 : one
  if (modelDistance(r, src) > reach + 1e-6) return false
  if (!t.attack && !hasLos(s, r.id, src.id)) return false
  if (isEngaged(s, r.id) && !engagedWith(s, r.id).includes(src.id)) return false
  return true
}

function reactionOptions(s: GameState, bundle: EditionBundle, o: Offer): DecisionOption[] {
  const engagedDamage = o.t.kind === 'damaged'
  return allOptions({ ...s, action: null }, bundle, o.r)
    .filter((x) => {
      const use = apUseOf(x.action.type)
      if (!use || use === 'prepare') return false
      return !engagedDamage || use === 'movement'
    })
    .map((x) => {
      const { decisionId: _d, seat: _s, ...inner } = x.action
      return option(`take:${x.id}`, `React: ${x.label}`, 'react.take', { modelId: o.r, inner }, ownerOf(s, o.r))
    })
}

/** Open the declaration phase for the triggers of a finished Action; false when nobody can react. */
function openReactions(state: GameState, bundle: EditionBundle, triggers: Trigger[]): GameState | null {
  const offers: Offer[] = []
  for (const r of Object.values(state.models)) {
    const t = triggers.find((x) => notices(state, bundle, r, x))
    if (t) offers.push({ r: r.id, t })
  }
  if (offers.length === 0) return null
  return nextOffer(putReact(state, { offers, declared: [], src: triggers[0]!.sourceId }), bundle)
}

/** Ask the next reactor; skips reactors with nothing legal. When all are asked, resolve what was declared. */
function nextOffer(state: GameState, bundle: EditionBundle): GameState {
  let rs = reactState(state)!
  while (rs.offers.length) {
    const offer = rs.offers[0]!
    rs = { ...rs, offers: rs.offers.slice(1) }
    const opts = reactionOptions(state, bundle, offer)
    if (opts.length === 0) continue
    return raiseDecision(putReact(state, rs), {
      seat: ownerOf(state, offer.r), kind: 'react.offer',
      context: { modelId: offer.r, sourceId: offer.t.sourceId, trigger: offer.t.kind }, canPass: false,
      options: [...opts, option('pass', 'Do not react', 'react.pass', { modelId: offer.r }, ownerOf(state, offer.r))],
    })
  }
  return runReactions(putReact(state, rs), bundle)
}

function finishReactions(state: GameState, bundle: EditionBundle): GameState {
  return resume(setStep({ ...state, action: null }, 'use'), bundle)
}

/** Resolve declared reactions one after another (PREP-010, PREP-014). A reaction's own triggers do not provoke more (RULING). */
function runReactions(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  for (;;) {
    const rs = reactState(s)
    if (!rs) return resume(s, bundle)
    const d = rs.declared[0]
    if (!d) return finishReactions(s, bundle)
    s = putReact(s, { ...rs, declared: rs.declared.slice(1) })
    if (!alive(s, d.r) || !s.models[d.r]!.reaction) continue
    s = updateModel(s, d.r, { reaction: false }) // PREP-005: spent when used
    s = { ...s, action: { modelId: d.r, type: d.action.type, quick: true, reaction: true, free: false, itemUsed: false } }
    const mod = moduleFor(d.action.type)
    const res = mod ? mod.resolve(s, bundle, { ...d.action, decisionId: s.pending.id, seat: ownerOf(s, d.r) }) : null
    if (!res || isRejection(res)) { s = { ...s, action: null }; continue }
    if (!res.done) return res.state // the module raised its own decision; its done comes back through afterAction
    s = afterActionTokens({ ...res.state, action: null }, bundle, res.done)
    const v = checkVictory(s, bundle)
    if (v) return { ...s, result: v, phase: 'over' }
  }
}

function resolveReact(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const rs = reactState(state)
  if (!rs) return reject('E_NOT_LEGAL', 'No reaction is being declared.')
  if (action.type === 'react.pass') return { state: nextOffer(state, bundle) }
  if (action.type === 'react.take') {
    const inner = action.inner as Action | undefined
    if (!inner || typeof inner.type !== 'string') return reject('E_BAD_PARAM', 'Missing reaction action.')
    const r = String(action.modelId)
    const next = putReact(state, { ...rs, declared: [...rs.declared, { r, src: rs.src, action: inner }] })
    return { state: nextOffer(next, bundle) }
  }
  return reject('E_NOT_LEGAL', `${action.type} is not a reaction choice.`)
}

// ---------- after an Action ----------
/** Namespaces whose Actions keep Charge bonus markers: the charge itself and the Close Combat attack that spends them. */
const KEEPS_CHARGE = new Set(['charge', 'battleCry', 'melee'])

/** Bookkeeping on the acting model after any finished Action: CHG-005 charge markers, WPN-009 primed tokens. */
function afterActionTokens(state: GameState, bundle: EditionBundle, done: ActionDone): GameState {
  const id = done.modelId
  const m = state.models[id]
  if (!m || !isOnTable(m)) return state
  let s = KEEPS_CHARGE.has(namespaceOf(done.type)) ? state : discardChargeBonus(state, id)
  const primedGain = m.carried.some((c) => c.kind === 'weapon' && typeof recordOf(bundle, 'weapons', c.defId)?.primed?.gain === 'string')
  if (primedGain) {
    const seen = Object.values(s.models).some((o) => hostile(s, o.owner, m.owner) && isOnTable(o) && hasLos(s, id, o.id))
    s = gainPrimed(s, bundle, id, seen)
  }
  return s
}

/** Back to the activation after an Action or reactions: end it when the model is gone, else show the menu. */
function resume(state: GameState, bundle: EditionBundle): GameState {
  const act = state.activation
  if (!act || state.phase === 'over') return state
  if (!alive(state, act.modelId)) return endActivation(state, bundle)
  return raiseMenu(state, bundle)
}

/** Take back what a cancelled menu Action cost (a cancelled Move is not an Action). */
function refund(state: GameState): GameState {
  const act = state.activation, ctx = state.action
  if (!act || !ctx) return state
  if (ctx.quick) {
    const use = apUseOf(ctx.type)
    return { ...state, activation: { ...act, ap: act.ap + 1, apIconsUsed: act.apIconsUsed.filter((x) => x !== use) } }
  }
  return { ...state, activation: { ...act, actionsTaken: Math.max(0, act.actionsTaken - 1) } }
}

export const turnflow: Controller = {
  id: 'turnflow',
  kinds: ['turn', 'react', 'prepare'],
  options(state: GameState, _bundle: EditionBundle, modelId: ModelId): DecisionOption[] {
    const m = state.models[modelId]
    if (!m || m.reaction || hasCondition(m, 'frozen') || !isOnTable(m)) return []
    return [option('prepare', 'Prepare', 'prepare.go')]
  },
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    const t = action.type
    if (t.startsWith('react.')) return resolveReact(state, bundle, action)
    switch (t) {
      case 'turn.start': return { state: startRound(state, bundle) }
      case 'turn.first': {
        const seat = String(action.firstSeat)
        if (!state.seats[seat]) return reject('E_BAD_PARAM', `Unknown seat ${seat}.`)
        return { state: beginTurn(state, bundle, seat, seat) }
      }
      case 'turn.ready': {
        const m = state.models[String(action.modelId)]
        if (!m || !sameTeam(state, m.owner, action.seat) || m.readiness !== 'unready' || !isOnTable(m)) return reject('E_BAD_TARGET', 'That model cannot be made Ready.')
        let s = updateModel(state, m.id, { readiness: 'ready' })
        s = { ...s, turn: s.turn ? { ...s.turn, readied: m.id } : s.turn }
        if (teamWith(s, m.owner, 'unready').length === 0) return { state: pickNext(s, bundle) } // TURN-004
        return { state: askNextChoice(s, bundle, teamSeats(s, m.owner)) }
      }
      case 'turn.useAll':
      case 'turn.useNone': {
        const cs = choiceState(state)
        if (!cs || cs.asking !== action.seat) return reject('E_NOT_LEGAL', 'Nobody is choosing whether to use their Ready models.')
        let s = state
        if (t === 'turn.useNone') for (const m of withReadiness(s, cs.asking, 'ready')) s = updateModel(s, m.id, { readiness: 'used' }) // TURN-007
        return { state: askNextChoice(s, bundle, cs.todo) }
      }
      case 'turn.pick': {
        const m = state.models[String(action.modelId)]
        if (!m || !sameTeam(state, m.owner, action.seat) || m.readiness !== 'ready' || !isOnTable(m)) return reject('E_BAD_TARGET', 'That model is not Ready.')
        return beginActivation(state, bundle, m.id)
      }
      case 'turn.end': return state.activation ? { state: endActivation(state, bundle) } : reject('E_NOT_LEGAL', 'No activation to end.')
      default:
        if (t.startsWith('turn.')) return reject('E_NOT_LEGAL', `${t} is not a turn choice.`)
        return forwardMenuAction(state, bundle, action)
    }
  },
  afterAction(state: GameState, bundle: EditionBundle, done: ActionDone): GameState {
    let s = state
    if (done.type.endsWith('.cancel')) return resume({ ...refund(s), action: null }, bundle)
    const wasReaction = !!s.action?.reaction
    s = afterActionTokens({ ...s, action: null }, bundle, done)
    const v = checkVictory(s, bundle)
    if (v) return { ...s, result: v, phase: 'over' }
    if (wasReaction) return runReactions(s, bundle)
    if (s.activation && done.triggers.length) {
      const opened = openReactions(s, bundle, done.triggers)
      if (opened) return opened
    }
    return resume(s, bundle)
  },
}
