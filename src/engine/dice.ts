// Checklist: DICE-001..010, SKILL-001..009 (+ the luck flip used by LUCK-*). Spec 13.
// Wasteland dice: one d20 skill die against a skill value (roll under) plus a pool of coloured d12 effect dice, and the
// red d12 armor die. Face tables come from data/<edition>/dice.json; every roll goes through rng.ts roll().
import type { DicePool, DieColour, EditionBundle, Icon } from '../data/types'
import { DIE_COLOURS } from '../data/types'
import { diceDef, ruleNum } from './edition'
import { roll, type DiceRolled } from './rng'
import type { GameState, Id, Mod, RollPurpose } from './types'

// ---------- faces and icons ----------
export interface EffectDie { colour: DieColour; face: number; icons: Icon[] }
/** Icon totals. `acc` sums ACC1/2/3 as 1/2/3 (lowers the skill result). */
export interface IconTally { DMG: number; AR: number; acc: number; BOT: number; STAR: number; BLAST: number }
export const emptyTally = (): IconTally => ({ DMG: 0, AR: 0, acc: 0, BOT: 0, STAR: 0, BLAST: 0 })

export function tallyIcons(icons: readonly Icon[]): IconTally {
  const t = emptyTally()
  for (const i of icons) {
    if (i === 'ACC1') t.acc += 1
    else if (i === 'ACC2') t.acc += 2
    else if (i === 'ACC3') t.acc += 3
    else if (i === 'DMG' || i === 'AR' || i === 'BOT' || i === 'STAR' || i === 'BLAST') t[i]++
  }
  return t
}

/** Skill die face (1-based, as rolled) -> its value and icons. */
export function skillFace(bundle: EditionBundle, face: number): { value: number | 'X'; icons: Icon[] } {
  const f = diceDef(bundle).skill.faces[face - 1]
  if (!f) throw new Error(`skill die has no face ${face}`)
  return f
}
/** Effect die face (1-based) -> icons. */
export function effectFace(bundle: EditionBundle, colour: DieColour, face: number): Icon[] {
  const f = diceDef(bundle).effect[colour][face - 1]
  if (!f) throw new Error(`${colour} die has no face ${face}`)
  return f.icons
}

// ---------- pools ----------
/**
 * Merge pool parts, add bonus-die tokens (at most one per colour, DICE-009) and cap each colour at
 * rules.maxDicePerColour (DICE-008). Extras are reported in `dropped` and never rolled.
 */
export function buildPool(bundle: EditionBundle, parts: readonly (DicePool | undefined)[], bonus: readonly DieColour[] = []): { pool: DicePool; dropped: DicePool } {
  const cap = ruleNum(bundle, 'maxDicePerColour')
  const raw: Record<DieColour, number> = { black: 0, green: 0, yellow: 0, blue: 0 }
  for (const p of parts) if (p) for (const c of DIE_COLOURS) raw[c] += p[c] ?? 0
  for (const c of new Set(bonus)) raw[c] += 1
  const pool: DicePool = {}, dropped: DicePool = {}
  for (const c of DIE_COLOURS) {
    const n = Math.max(0, raw[c])
    if (n > 0) pool[c] = Math.min(cap, n)
    if (n > cap) dropped[c] = n - cap
  }
  return { pool, dropped }
}

export const poolSize = (pool: DicePool): number => DIE_COLOURS.reduce((a, c) => a + (pool[c] ?? 0), 0)

// ---------- skill value ----------
/** SV = base, then any 'set' mod (last wins), then every 'add' mod summed (SKILL-002). */
export function computeSv(base: number, mods: readonly Mod[]): { sv: number; breakdown: Mod[] } {
  let sv = base
  for (const m of mods) if (m.mode === 'set') sv = m.value
  for (const m of mods) if (m.mode === 'add') sv += m.value
  return { sv, breakdown: [{ source: 'base', label: 'Base value', value: base, mode: 'set' }, ...mods] }
}
/** Speciality bonus (SKILL-006) from rules.speciality. */
export const specialityMod = (bundle: EditionBundle, label = 'Speciality'): Mod =>
  ({ source: 'speciality', label, value: ruleNum(bundle, 'speciality'), mode: 'add' })
/** Quick Action penalty (AP-001) from rules.quickActionPenalty. */
export const quickActionMod = (bundle: EditionBundle): Mod =>
  ({ source: 'quick', label: 'Quick Action', value: ruleNum(bundle, 'quickActionPenalty'), mode: 'add' })

// ---------- skill test ----------
export interface SkillTestSpec {
  /** Adjusted skill value (computeSv). */
  sv: number
  pool?: DicePool
  purpose: RollPurpose
  ownerId?: Id
  /** Declared before rolling: the skill die counts as X, effect dice still roll (SKILL-008). */
  chooseFail?: boolean
  /** Getting Acclimated tutorials: icon faces count as 1 and always succeed (SCN-005). */
  tutorial?: boolean
  /** Reroll hooks run in order after the roll (perks, cards). Each may reroll the skill die and/or effect dice. */
  rerolls?: readonly RerollHook[]
}

export interface SkillTestResult {
  sv: number
  /** Skill die face rolled (1-based), or null when the test chose to fail. */
  skillFace: number | null
  value: number | 'X'
  skillIcons: Icon[]
  effect: EffectDie[]
  /** Sum of ACC icons on all effect dice. */
  acc: number
  /** Extra result modifier after the roll: Luck Accurate -2, Luck Dodge +2 (LUCK-002/003). */
  resultMod: number
  /** value - acc + resultMod; null on an X. Lower is better; success iff <= sv. */
  result: number | null
  success: boolean
  /** Why the result was forced: X face, SV below 1 (only a CP face wins), tutorial icon face, or chose to fail. */
  forced: 'X' | 'svBelow1' | 'tutorial' | 'choseFail' | null
  /** AP icons on the skill die: count on success or failure (AP-004); the caller ignores them in Quick Actions/reactions (AP-005). */
  ap: number
  /** CP gained: CP face on a success (crit meter, CRIT-002). */
  cp: number
  /** Effect icons that apply: all of them on a success, none on a failure (SKILL-005). */
  icons: IconTally
  /** Every icon rolled, for display. */
  rolled: IconTally
  rollIds: string[]
}

export interface RerollRequest { skill?: boolean; effect?: number[] }
/** A reroll hook looks at a result and asks for dice to reroll (indices into `effect`), or returns null. */
export type RerollHook = (test: SkillTestResult) => RerollRequest | null

/** Recompute success, icons, AP and CP from the dice and modifiers (spec 13 s3). Pure. */
export function scoreTest(t: Omit<SkillTestResult, 'result' | 'success' | 'forced' | 'ap' | 'cp' | 'icons' | 'rolled'> & { choseFail?: boolean; tutorial?: boolean }): SkillTestResult {
  const rolled = tallyIcons(t.effect.flatMap((d) => d.icons))
  const acc = rolled.acc
  const ap = t.skillIcons.filter((i) => i === 'AP').length
  const cpFace = t.skillIcons.includes('CP')
  const iconFace = t.skillIcons.length > 0 && t.value !== 'X'
  let success: boolean, result: number | null, forced: SkillTestResult['forced'] = null
  if (t.choseFail) { success = false; result = null; forced = 'choseFail' }
  else if (t.value === 'X') { success = false; result = null; forced = 'X' }
  else {
    result = t.value - acc + t.resultMod
    if (t.tutorial && iconFace) { success = true; forced = 'tutorial' }
    else if (t.sv < 1) { success = cpFace; forced = 'svBelow1' }
    else success = result <= t.sv
  }
  const { choseFail: _c, tutorial: _t, ...rest } = t
  return {
    ...rest, acc, result, success, forced, ap,
    cp: success && cpFace ? 1 : 0,
    icons: success ? rolled : emptyTally(),
    rolled,
  }
}

/** Roll an effect-dice pool through roll(); one roll() per colour, in DIE_COLOURS order. */
export function rollEffectDice(state: GameState, bundle: EditionBundle, pool: DicePool | undefined, purpose: RollPurpose, ownerId?: Id): { state: GameState; dice: EffectDie[]; events: DiceRolled[] } {
  const dice: EffectDie[] = [], events: DiceRolled[] = []
  let s = state
  for (const colour of DIE_COLOURS) {
    const n = pool?.[colour] ?? 0
    if (n <= 0) continue
    const sides = diceDef(bundle).effect[colour].length
    const r = roll(s, { count: n, sides, purpose: `${purpose}:${colour}`, ownerId })
    s = r.state
    events.push(r.event)
    for (const face of r.event.dice) dice.push({ colour, face, icons: effectFace(bundle, colour, face) })
  }
  return { state: s, dice, events }
}

/** Roll the skill die (unless choosing to fail) and the effect pool, apply reroll hooks, and score (spec 13 s3). */
export function skillTest(state: GameState, bundle: EditionBundle, spec: SkillTestSpec): { state: GameState; test: SkillTestResult; events: DiceRolled[] } {
  let s = state
  const events: DiceRolled[] = []
  let skillFaceN: number | null = null
  let value: number | 'X' = 'X', skillIcons: Icon[] = []
  if (!spec.chooseFail) {
    const r = roll(s, { count: 1, sides: diceDef(bundle).skill.faces.length, purpose: `${spec.purpose}:skill`, ownerId: spec.ownerId })
    s = r.state; events.push(r.event)
    skillFaceN = r.event.dice[0]!
    ;({ value, icons: skillIcons } = skillFace(bundle, skillFaceN))
  }
  const fx = rollEffectDice(s, bundle, spec.pool, spec.purpose, spec.ownerId)
  s = fx.state; events.push(...fx.events)
  let test = scoreTest({
    sv: spec.sv, skillFace: skillFaceN, value, skillIcons, effect: fx.dice, acc: 0, resultMod: 0,
    rollIds: events.map((e) => e.rollId), choseFail: spec.chooseFail, tutorial: spec.tutorial,
  })
  // SKILL-008: no rerolls or changes on a chosen failure.
  if (!spec.chooseFail) for (const hook of spec.rerolls ?? []) {
    const req = hook(test)
    if (!req) continue
    const rr = rerollDice(s, bundle, test, req, spec)
    s = rr.state; events.push(...rr.events); test = rr.test
  }
  return { state: s, test, events }
}

/** Reroll the skill die and/or chosen effect dice of a finished test, then rescore. */
export function rerollDice(state: GameState, bundle: EditionBundle, test: SkillTestResult, req: RerollRequest, spec: Pick<SkillTestSpec, 'purpose' | 'ownerId' | 'tutorial'>): { state: GameState; test: SkillTestResult; events: DiceRolled[] } {
  let s = state
  const events: DiceRolled[] = []
  let { skillFace: sf, value, skillIcons } = test
  if (req.skill && sf !== null) {
    const r = roll(s, { count: 1, sides: diceDef(bundle).skill.faces.length, purpose: `${spec.purpose}:reroll:skill`, ownerId: spec.ownerId })
    s = r.state; events.push(r.event)
    sf = r.event.dice[0]!
    ;({ value, icons: skillIcons } = skillFace(bundle, sf))
  }
  const effect = [...test.effect]
  for (const i of req.effect ?? []) {
    const d = effect[i]
    if (!d) continue
    const r = roll(s, { count: 1, sides: diceDef(bundle).effect[d.colour].length, purpose: `${spec.purpose}:reroll:${d.colour}`, ownerId: spec.ownerId })
    s = r.state; events.push(r.event)
    effect[i] = { colour: d.colour, face: r.event.dice[0]!, icons: effectFace(bundle, d.colour, r.event.dice[0]!) }
  }
  const next = scoreTest({ ...test, skillFace: sf, value, skillIcons, effect, rollIds: [...test.rollIds, ...events.map((e) => e.rollId)], tutorial: spec.tutorial })
  return { state: s, test: next, events }
}

/** Add a result modifier after the roll (luck) and rescore. X and chosen failures stay failures. */
export function adjustResult(test: SkillTestResult, delta: number, tutorial = false): SkillTestResult {
  return scoreTest({ ...test, resultMod: test.resultMod + delta, choseFail: test.forced === 'choseFail', tutorial })
}

/**
 * Opposed test (SKILL-007): the higher successful result wins; a winner must succeed; on a tie the higher SV
 * wins, unless `tie` names a side (Battle Cry ties go to the charger). Both fail (or equal SVs on a tie) = null.
 */
export function opposed(a: SkillTestResult, b: SkillTestResult, tie: 'higherSv' | 'a' | 'b' = 'higherSv'): 'a' | 'b' | null {
  const ra = a.success ? a.result ?? 0 : null
  const rb = b.success ? b.result ?? 0 : null
  if (ra === null && rb === null) return null
  if (rb === null) return 'a'
  if (ra === null) return 'b'
  if (ra !== rb) return ra > rb ? 'a' : 'b'
  if (tie !== 'higherSv') return tie
  return a.sv === b.sv ? null : a.sv > b.sv ? 'a' : 'b'
}

// ---------- other rolls ----------
/** Red armor die (spec 13 s2): rolled face -> armor value from dice.json. Also the 1-4 randomiser (RoP s2.13). */
export function armorRoll(state: GameState, bundle: EditionBundle, purpose: RollPurpose, ownerId?: Id): { state: GameState; value: number; event: DiceRolled } {
  const faces = diceDef(bundle).armor
  const r = roll(state, { count: 1, sides: faces.length, purpose, ownerId })
  return { state: r.state, value: faces[r.event.dice[0]! - 1]!, event: r.event }
}

/** One effect die of a colour (V.A.T.S. and addiction rolls use blue). */
export function rollColourDie(state: GameState, bundle: EditionBundle, colour: DieColour, purpose: RollPurpose, ownerId?: Id): { state: GameState; die: EffectDie; event: DiceRolled } {
  const r = rollEffectDice(state, bundle, { [colour]: 1 }, purpose, ownerId)
  return { state: r.state, die: r.dice[0]!, event: r.events[0]! }
}

/** Luck token faces: a token is two-sided (luck face / blank), so a flip is a fair coin (spec 13 s6). */
const LUCK_TOKEN_SIDES = 2
/** Flip a luck token through roll(); `lucky` = the luck face came up. The caller discards the token either way. */
export function flipLuck(state: GameState, purpose: RollPurpose, ownerId?: Id): { state: GameState; lucky: boolean; event: DiceRolled } {
  const r = roll(state, { count: 1, sides: LUCK_TOKEN_SIDES, purpose, ownerId })
  return { state: r.state, lucky: r.event.dice[0] === 1, event: r.event }
}

// ---------- exact odds (spec 13 s7; never sampled) ----------
export interface PoolOutcome { acc: number; dmg: number; ar: number; p: number }

/** Joint distribution of (ACC sum, DMG count, AR count) over an effect pool, by DP over the dice. */
export function poolJoint(bundle: EditionBundle, pool: DicePool | undefined): PoolOutcome[] {
  let dist = new Map<string, PoolOutcome>([['0|0|0', { acc: 0, dmg: 0, ar: 0, p: 1 }]])
  for (const colour of DIE_COLOURS) {
    const faces = diceDef(bundle).effect[colour]
    for (let k = 0; k < (pool?.[colour] ?? 0); k++) {
      const next = new Map<string, PoolOutcome>()
      for (const o of dist.values()) for (const f of faces) {
        const t = tallyIcons(f.icons)
        const acc = o.acc + t.acc, dmg = o.dmg + t.DMG, ar = o.ar + t.AR
        const key = `${acc}|${dmg}|${ar}`
        const cur = next.get(key)
        const p = o.p / faces.length
        if (cur) cur.p += p
        else next.set(key, { acc, dmg, ar, p })
      }
      dist = next
    }
  }
  return [...dist.values()]
}

export interface SkillOdds {
  /** P(success). */
  pHit: number
  /** P(success) when a Luck Accurate flip (-2 on a luck face) is used after a non-X failure (LUCK-002). */
  pHitAccurate: number
  /** Joint (dmg, ar) outcomes on a success; their p sums to pHit. Feed damage odds with these. */
  onHit: { dmg: number; ar: number; p: number }[]
}

/** Exact hit odds for an adjusted SV and pool (SKILL-009). */
export function skillOdds(bundle: EditionBundle, sv: number, pool?: DicePool, opts: { tutorial?: boolean } = {}): SkillOdds {
  const faces = diceDef(bundle).skill.faces
  const joint = poolJoint(bundle, pool)
  const luck = ruleNum(bundle, 'luckBonus')
  let pHit = 0, pRescue = 0
  const onHit = new Map<string, { dmg: number; ar: number; p: number }>()
  for (const f of faces) {
    for (const o of joint) {
      const p = o.p / faces.length
      let hit = false, rescuable = false
      if (f.value !== 'X') {
        const iconFace = f.icons.length > 0
        if (opts.tutorial && iconFace) hit = true
        else if (sv < 1) hit = f.icons.includes('CP')
        else {
          const result = f.value - o.acc
          hit = result <= sv
          rescuable = !hit && result - luck <= sv
        }
      }
      if (hit) {
        pHit += p
        const key = `${o.dmg}|${o.ar}`
        const cur = onHit.get(key)
        if (cur) cur.p += p
        else onHit.set(key, { dmg: o.dmg, ar: o.ar, p })
      } else if (rescuable) pRescue += p
    }
  }
  return { pHit, pHitAccurate: pHit + pRescue / LUCK_TOKEN_SIDES, onHit: [...onHit.values()] }
}
