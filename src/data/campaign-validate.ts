// Campaign data validator (M6; spec 20 "Campaign records"). Pure: no fs, no Vite. tools/validate-data.ts wraps it.
// Checks: ids unique and kebab-case, sources present and tagged, hooks named, costs numbers, references resolve,
// placeholders only where spec 20 allows them. Perk effects reuse the main validator (validate.ts) through a one-kind bundle.
import { ATTRS, SKILLS, UNIT_TYPES, type EditionBundle } from './types'
import {
  BOOST_TYPES, CAMPAIGN_KINDS, EXPLORE_WHEN, ITEM_CLASSES, PLACEHOLDER, PLACEHOLDER_KINDS, STRUCTURE_GROUPS,
  type CampaignFiles, type CampaignKind,
} from './campaign-types'
import { emptyBundle } from './bundle'
import { ID_RE, validateBundle, type ValidationError } from './validate'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPosInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 1

export interface CampaignStats { records: Record<string, number>; placeholders: Record<string, number>; hooks: number }

export const campaignFileName = (edition: string, kind: CampaignKind) => `${edition}/campaign/${kind}.json`

export const isPlaceholderSource = (s: unknown): boolean =>
  s === PLACEHOLDER || (Array.isArray(s) && s.some((x) => x === PLACEHOLDER))

/** Every string stored under a key named "code", anywhere inside a record (effects, conditions, rewards, args). */
export function codesIn(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) codesIn(x, out)
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) {
    if (k === 'code' && typeof x === 'string') out.push(x)
    else codesIn(x, out)
  }
  return out
}

function recordsOf(f: unknown): Obj[] {
  return isObj(f) && Array.isArray(f.records) ? f.records.filter(isObj) : []
}
const idsOf = (f: unknown): Set<string> => new Set(recordsOf(f).map((r) => r.id).filter((x): x is string => typeof x === 'string'))

export function campaignStatsOf(files: CampaignFiles): CampaignStats {
  const records: Record<string, number> = {}, placeholders: Record<string, number> = {}
  let hooks = 0
  for (const kind of CAMPAIGN_KINDS) {
    const f = files[kind]
    const recs = recordsOf(f)
    records[kind] = recs.length
    placeholders[kind] = recs.filter((r) => isPlaceholderSource(r.source)).length
    if (isObj(f) && isObj(f.hooks)) hooks += Object.keys(f.hooks).length
  }
  return { records, placeholders, hooks }
}

export function validateCampaign(edition: string, files: CampaignFiles, scenarioIds: ReadonlySet<string>): ValidationError[] {
  const errs: ValidationError[] = []
  const at = (kind: CampaignKind, id: string, path: string, message: string) =>
    errs.push({ file: campaignFileName(edition, kind), id, path, message })

  const perkIds = idsOf(files.perks), structureIds = idsOf(files.structures)
  const consequenceIds = new Set(recordsOf(files.events).filter((e) => e.consequence === true).map((e) => e.id as string))

  // ---- per-kind record checks ----
  type E = (path: string, message: string) => void
  const cost = (v: unknown, e: E, path = 'cost', opt = false) => {
    if (v === undefined && opt) return
    if (!isNum(v) || v < 0) e(path, 'must be a number >= 0')
  }
  const posIntOpt = (v: unknown, e: E, path: string) => { if (v !== undefined && !isPosInt(v)) e(path, 'must be an integer >= 1') }
  const numOpt = (v: unknown, e: E, path: string) => { if (v !== undefined && !(isNum(v) && v >= 0)) e(path, 'must be a number >= 0') }
  const strOrNull = (v: unknown, e: E, path: string, allowNull: boolean) => {
    if (v === null) { if (!allowNull) e(path, 'must be a non-empty string (null is only allowed on placeholder records)') }
    else if (!nonEmpty(v)) e(path, 'must be a non-empty string' + (allowNull ? ' or null' : ''))
  }
  const refs = (v: unknown, ids: Set<string>, what: string, e: E, path: string) => {
    if (v === undefined) return
    if (!Array.isArray(v)) { e(path, 'must be an array of ids'); return }
    v.forEach((x, i) => { if (!nonEmpty(x) || !ids.has(x)) e(`${path}[${i}]`, `unknown ${what} id "${String(x)}"`) })
  }
  const effectShape = (v: unknown, e: E, path: string) => {
    const one = (x: unknown, p: string) => {
      if (!isObj(x)) { e(p, 'must be an object'); return }
      if (x.code !== undefined) { if (!nonEmpty(x.code)) e(`${p}.code`, 'must be a non-empty string'); if (x.args !== undefined && !isObj(x.args)) e(`${p}.args`, 'must be an object') }
      else if (!nonEmpty(x.op)) e(p, 'needs "op" or "code"')
    }
    if (Array.isArray(v)) v.forEach((x, i) => one(x, `${path}[${i}]`)); else one(v, path)
  }
  const STRUCTURE_OPS = ['draw', 'drawPerCropField', 'retain', 'stores', 'locker', 'explore', 'exploreRedraw', 'modifyDraw', 'reuse', 'nameItem', 'market', 'repairPowerArmor', 'armorBoost', 'none']
  const structureEffect = (v: unknown, e: E, path: string) => {
    if (!isObj(v)) { e(path, 'must be an object'); return }
    if (v.code !== undefined) { if (!nonEmpty(v.code)) e(`${path}.code`, 'must be a non-empty string'); return }
    if (!STRUCTURE_OPS.includes(v.op as string)) { e(`${path}.op`, `must be one of ${STRUCTURE_OPS.join('|')}`); return }
    if (v.itemClass !== undefined && !ITEM_CLASSES.includes(v.itemClass as never)) e(`${path}.itemClass`, 'unknown item class')
    if (v.op === 'draw') {
      if (v.deck !== 'item' && v.deck !== 'boost') e(`${path}.deck`, 'must be item|boost')
      if (!isPosInt(v.draw)) e(`${path}.draw`, 'must be an integer >= 1')
      if (!isPosInt(v.keep)) e(`${path}.keep`, 'must be an integer >= 1')
      else if (isPosInt(v.draw) && v.draw < v.keep) e(`${path}.draw`, 'must be >= keep')
      if (v.boostType !== undefined && !BOOST_TYPES.includes(v.boostType as never)) e(`${path}.boostType`, 'unknown boost type')
      if (v.deck === 'boost' && v.itemClass !== undefined) e(`${path}.itemClass`, 'a boost draw has no item class')
    }
    if (v.op === 'drawPerCropField' && (!isPosInt(v.maxDraw) || !isPosInt(v.keep))) e(path, 'needs maxDraw and keep >= 1')
    if (v.op === 'market' && !isPosInt(v.draw)) e(`${path}.draw`, 'must be an integer >= 1')
    if (v.op === 'explore') numOpt(v.capsPerUse, e, `${path}.capsPerUse`)
    if (v.op === 'modifyDraw' && !['redrawAll', 'drawExtra', 'keepExtra'].includes(v.how as string)) e(`${path}.how`, 'must be redrawAll|drawExtra|keepExtra')
  }

  const checkStructure = (r: Obj, e: E) => {
    if (!STRUCTURE_GROUPS.includes(r.group as never)) e('group', `must be one of ${STRUCTURE_GROUPS.join('|')}`)
    cost(r.cost, e)
    numOpt(r.power, e, 'power'); numOpt(r.water, e, 'water')
    posIntOpt(r.max, e, 'max'); posIntOpt(r.starting, e, 'starting'); posIntOpt(r.questsAlt, e, 'questsAlt')
    if (r.provides !== undefined) {
      if (!isObj(r.provides)) e('provides', 'must be an object')
      else for (const [k, x] of Object.entries(r.provides)) { if (!['power', 'water', 'slots'].includes(k)) e(`provides.${k}`, 'unknown key'); else if (!isNum(x) || x < 0) e(`provides.${k}`, 'must be a number >= 0') }
    }
    if (r.requires !== undefined) {
      if (!isObj(r.requires)) e('requires', 'must be an object')
      else { refs(r.requires.perks, perkIds, 'perk', e, 'requires.perks'); refs(r.requires.structures, structureIds, 'structure', e, 'requires.structures') }
    }
    if (!nonEmpty(r.text)) e('text', 'must be a non-empty string')
    if (r.effect === undefined) e('effect', 'is required'); else structureEffect(r.effect, e, 'effect')
    for (const k of ['alternatives', 'extra'] as const) {
      const v = r[k]
      if (v === undefined) continue
      if (!Array.isArray(v) || v.length === 0) e(k, 'must be a non-empty array'); else v.forEach((x, i) => structureEffect(x, e, `${k}[${i}]`))
    }
    if (r.group === 'boost' && r.power !== 0) e('power', 'boost racks need no Power (power must be 0)')
    if (r.id === 'land' && r.questsAlt !== 5) e('questsAlt', 'Land can also be bought with 5 Quests')
  }

  const checkPerkExtras = (r: Obj, e: E) => {
    if (r.settlementWide !== undefined && typeof r.settlementWide !== 'boolean') e('settlementWide', 'must be true or false')
    if (Array.isArray(r.grants)) r.grants.forEach((g, i) => { if (!isObj(g) || !nonEmpty(g.structure) || !structureIds.has(g.structure)) e(`grants[${i}].structure`, 'unknown structure id') })
    else if (r.grants !== undefined) e('grants', 'must be an array')
    if (Array.isArray(r.allowsMods)) r.allowsMods.forEach((c, i) => { if (!ITEM_CLASSES.includes(c as never)) e(`allowsMods[${i}]`, 'unknown item class') })
    else if (r.allowsMods !== undefined) e('allowsMods', 'must be an array')
    if (r.modFits !== undefined && (!Array.isArray(r.modFits) || r.modFits.some((x) => !nonEmpty(x)))) e('modFits', 'must be an array of strings')
    if (r.requires !== undefined) {
      if (!isObj(r.requires)) { e('requires', 'must be an object'); return }
      const q = r.requires
      refs(q.perks, perkIds, 'perk', e, 'requires.perks')
      if (isObj(q.attrs)) for (const [k, x] of Object.entries(q.attrs)) { if (!ATTRS.includes(k as never)) e(`requires.attrs.${k}`, 'unknown attribute'); if (!isNum(x)) e(`requires.attrs.${k}`, 'must be a number') }
      if (isObj(q.skills)) for (const [k, x] of Object.entries(q.skills)) { if (!SKILLS.includes(k as never)) e(`requires.skills.${k}`, 'unknown skill'); if (!isNum(x)) e(`requires.skills.${k}`, 'must be a number') }
      if (Array.isArray(q.notTypes)) q.notTypes.forEach((t, i) => { if (!UNIT_TYPES.includes(t as never)) e(`requires.notTypes[${i}]`, 'unknown unit type') })
      if (q.unique !== undefined && typeof q.unique !== 'boolean') e('requires.unique', 'must be true or false')
      if (q.faction !== undefined && !nonEmpty(q.faction)) e('requires.faction', 'must be a non-empty string')
      if (q.abilities !== undefined && (!Array.isArray(q.abilities) || q.abilities.some((x) => !nonEmpty(x)))) e('requires.abilities', 'must be an array of strings')
    }
  }

  const checkBoost = (r: Obj, e: E, placeholder: boolean) => {
    if (r.type === null) { if (r.typeUnknown !== true) e('type', 'null needs typeUnknown: true') }
    else if (!BOOST_TYPES.includes(r.type as never)) e('type', `must be one of ${BOOST_TYPES.join('|')}`)
    else if (r.typeUnknown === true) e('typeUnknown', 'must be absent when the type is known')
    cost(r.cost, e, 'cost', true)
    strOrNull(r.text, e, 'text', placeholder); strOrNull(r.timing, e, 'timing', placeholder)
    if (r.effect === undefined) e('effect', 'is required'); else effectShape(r.effect, e, 'effect')
  }
  const checkEvent = (r: Obj, e: E, placeholder: boolean) => {
    strOrNull(r.text, e, 'text', placeholder)
    if (r.flip === null) { if (!placeholder && r.partial !== true) e('flip', 'null is only allowed on placeholder or partial records') }
    else if (typeof r.flip !== 'boolean') e('flip', 'must be true, false or null')
    for (const k of ['persists', 'consequence', 'partial']) if (r[k] !== undefined && typeof r[k] !== 'boolean') e(k, 'must be true or false')
    if (r.consequence === true && r.owner !== 'player') e('owner', 'a Consequence needs owner "player"')
    if (r.consequence !== true && r.owner !== undefined) e('owner', 'only a Consequence has an owner')
    if (r.effect === undefined) e('effect', 'is required'); else effectShape(r.effect, e, 'effect')
  }
  const questById = new Map(recordsOf(files.quests).map((q) => [q.id as string, q]))
  const checkQuest = (r: Obj, e: E, placeholder: boolean) => {
    if (!nonEmpty(r.title)) e('title', 'must be a non-empty string')
    if (r.part !== undefined && !nonEmpty(r.part)) e('part', 'must be a non-empty string')
    // a story may be null on a placeholder; a task is null until a card face is found (no local source prints one)
    if (r.story !== null) { if (!nonEmpty(r.story)) e('story', 'must be a non-empty string or null') } else if (!placeholder) e('story', 'null is only allowed on placeholder records')
    if (r.task !== null) { if (!nonEmpty(r.task)) e('task', 'must be a non-empty string or null') } else if (!placeholder) e('task', 'null is only allowed on placeholder records')
    if (r.next !== undefined) {
      if (!Array.isArray(r.next) || r.next.length === 0) e('next', 'must be a non-empty array of Quest ids')
      else r.next.forEach((n, i) => {
        const q = typeof n === 'string' ? questById.get(n) : undefined
        if (!q) e(`next[${i}]`, `unknown quest id "${String(n)}"`)
        else if (q.title !== r.title) e(`next[${i}]`, 'a follow-on part must share the title')
        else if (q.id === r.id) e(`next[${i}]`, 'a part cannot follow itself')
      })
    }
    if (!Array.isArray(r.reward)) e('reward', 'must be an array')
    else r.reward.forEach((w, i) => {
      if (!isObj(w)) { e(`reward[${i}]`, 'must be an object'); return }
      numOpt(w.caps, e, `reward[${i}].caps`); numOpt(w.boosts, e, `reward[${i}].boosts`)
      if (w.items !== undefined && (!Array.isArray(w.items) || w.items.some((x) => !nonEmpty(x)))) e(`reward[${i}].items`, 'must be an array of ids')
      if (w.consequence !== undefined && !(nonEmpty(w.consequence) && consequenceIds.has(w.consequence))) e(`reward[${i}].consequence`, 'unknown Consequence event id')
    })
    if (r.repeatable !== undefined && typeof r.repeatable !== 'boolean') e('repeatable', 'must be true or false')
  }
  const checkExplore = (r: Obj, e: E, placeholder: boolean) => {
    strOrNull(r.text, e, 'text', placeholder)
    if (r.test !== undefined) {
      if (!isObj(r.test)) e('test', 'must be an object')
      else { if (r.test.skill !== undefined && !SKILLS.includes(r.test.skill as never)) e('test.skill', 'unknown skill'); if (r.test.attr !== undefined && !ATTRS.includes(r.test.attr as never)) e('test.attr', 'unknown attribute'); numOpt(r.test.mod === undefined ? undefined : Math.abs(r.test.mod as number), e, 'test.mod') }
    }
    if (!Array.isArray(r.outcomes)) { e('outcomes', 'must be an array'); return }
    r.outcomes.forEach((o, i) => {
      if (!isObj(o)) { e(`outcomes[${i}]`, 'must be an object'); return }
      if (!EXPLORE_WHEN.includes(o.when as never)) e(`outcomes[${i}].when`, `must be one of ${EXPLORE_WHEN.join('|')}`)
      if (o.when === 'pay' && !(isNum(o.payCaps) && o.payCaps >= 0)) e(`outcomes[${i}].payCaps`, 'a pay outcome needs payCaps >= 0')
      for (const k of ['caps', 'payCaps', 'items', 'damage']) numOpt(o[k], e, `outcomes[${i}].${k}`)
      if (o.itemClass !== undefined && !ITEM_CLASSES.includes(o.itemClass as never)) e(`outcomes[${i}].itemClass`, 'unknown item class')
      if (o.consequence !== undefined && !(nonEmpty(o.consequence) && consequenceIds.has(o.consequence))) e(`outcomes[${i}].consequence`, `unknown Consequence event id "${String(o.consequence)}"`)
    })
    if (r.outcomes.some((o) => isObj(o) && o.when === 'pass') && !isObj(r.test)) e('test', 'a pass outcome needs a test')
    if (r.viaItem !== undefined && !nonEmpty(r.viaItem)) e('viaItem', 'must be a non-empty string')
  }
  const checkInjury = (r: Obj, e: E) => {
    if (!nonEmpty(r.text)) e('text', 'must be a non-empty string')
    if (!Array.isArray(r.effects)) e('effects', 'must be an array'); else effectShape(r.effects, e, 'effects')
  }
  const checkAward = (r: Obj, e: E) => {
    cost(r.winner, e, 'winner'); cost(r.loser, e, 'loser')
    if (r.draw !== undefined && r.draw !== 'winner' && !(isNum(r.draw) && r.draw >= 0)) e('draw', 'must be "winner" or a number')
    if (r.bigForceBonus !== undefined) { if (!isObj(r.bigForceBonus) || !isNum(r.bigForceBonus.from) || !isNum(r.bigForceBonus.each)) e('bigForceBonus', 'must be { from, each } numbers') }
    if (r.byLevel !== undefined) { if (!isObj(r.byLevel)) e('byLevel', 'must be an object'); else for (const [k, x] of Object.entries(r.byLevel)) { if (k !== 'major' && k !== 'minor') e(`byLevel.${k}`, 'unknown key'); else if (!isNum(x) || x < 0) e(`byLevel.${k}`, 'must be a number >= 0') } }
    if (r.bySide !== undefined) {
      if (!isObj(r.bySide)) e('bySide', 'must be an object keyed by side id')
      else for (const [side, v] of Object.entries(r.bySide)) {
        if (!isObj(v)) { e(`bySide.${side}`, 'must be an object'); continue }
        for (const [k, x] of Object.entries(v)) { if (!['win', 'major', 'minor'].includes(k)) e(`bySide.${side}.${k}`, 'unknown key'); else if (!isNum(x) || x < 0) e(`bySide.${side}.${k}`, 'must be a number >= 0') }
      }
    }
    if (r.scenarioId !== undefined) {
      if (!nonEmpty(r.scenarioId)) e('scenarioId', 'must be a non-empty string')
      else if (r.scenarioPending === true) { if (scenarioIds.has(r.scenarioId)) e('scenarioPending', 'the scenario exists now: remove scenarioPending') }
      else if (!scenarioIds.has(r.scenarioId)) e('scenarioId', `unknown scenario "${r.scenarioId}" (mark scenarioPending until it is entered)`)
    } else if (r.scenarioPending !== undefined) e('scenarioPending', 'only a scenario award can be pending')
  }
  function checkAwardSet(recs: Obj[], err: (id: string, path: string, message: string) => void) {
    const defaults = recs.filter((r) => r.scenarioId === undefined)
    if (defaults.length !== 1) err('-', 'records', `exactly one default record (no scenarioId) is required, found ${defaults.length}`)
    const seen = new Set<string>()
    for (const r of recs) if (typeof r.scenarioId === 'string') { if (seen.has(r.scenarioId)) err(String(r.id), 'scenarioId', 'duplicate scenario award'); seen.add(r.scenarioId) }
  }

  const CHECK: Partial<Record<CampaignKind, (r: Obj, e: E, placeholder: boolean) => void>> = {
    structures: checkStructure, perks: (r, e) => checkPerkExtras(r, e), boosts: checkBoost, events: checkEvent,
    quests: checkQuest, explore: checkExplore, injuries: checkInjury, 'caps-awards': checkAward,
  }
  for (const kind of CAMPAIGN_KINDS) {
    const f = files[kind]
    const err = (id: string, path: string, message: string) => at(kind, id, path, message)
    if (f === undefined) { err('-', '', 'file is missing'); continue }
    if (!isObj(f)) { err('-', '', 'must be an object { kind, sources, hooks, records }'); continue }
    if (f.kind !== kind) err('-', 'kind', `must be "${kind}"`)
    const sources = isObj(f.sources) ? f.sources : (err('-', 'sources', 'must be an object (tag -> file and page note)'), {})
    for (const [t, d] of Object.entries(sources)) if (!nonEmpty(d)) err('-', `sources.${t}`, 'must be a non-empty string')
    const hooks = isObj(f.hooks) ? f.hooks : (err('-', 'hooks', 'must be an object (hook name -> one-line description)'), {})
    for (const [h, d] of Object.entries(hooks)) if (!nonEmpty(d)) err('-', `hooks.${h}`, 'needs a one-line description')
    if (f.rulings !== undefined && (!Array.isArray(f.rulings) || f.rulings.some((r) => !nonEmpty(r) || !r.startsWith('RULING:'))))
      err('-', 'rulings', 'must be a list of "RULING: ..." strings')
    if (!Array.isArray(f.records)) { err('-', 'records', 'must be an array'); continue }

    const seen = new Set<string>(), used = new Set<string>()
    for (const r of f.records) {
      if (!isObj(r)) { err('(no id)', '', 'record must be an object'); continue }
      const id = typeof r.id === 'string' ? r.id : '(no id)'
      const e = (path: string, message: string) => err(id, path, message)
      if (!nonEmpty(r.id)) e('id', 'must be a non-empty string')
      else if (!ID_RE.test(r.id)) e('id', 'must be kebab-case (a-z, 0-9, single hyphens)')
      else if (seen.has(r.id)) e('id', 'duplicate id')
      else seen.add(r.id)
      if (!nonEmpty(r.name)) e('name', 'must be a non-empty string')
      // source: string or non-empty array of strings, each tagged with a key of the file's `sources` map
      const srcs = typeof r.source === 'string' ? [r.source] : Array.isArray(r.source) ? r.source : []
      if (srcs.length === 0 || srcs.some((s) => !nonEmpty(s))) e('source', 'is required (string or non-empty array of strings)')
      else for (const s of srcs as string[]) {
        for (const part of s.split(';')) {
          const tag = part.trim().split(/\s+/)[0]
          if (!(tag in sources)) e('source', `tag "${tag}" is not in the file's sources map`)
        }
      }
      const placeholder = isPlaceholderSource(r.source)
      if (placeholder && !PLACEHOLDER_KINDS.includes(kind)) e('source', `"placeholder" is only allowed on ${PLACEHOLDER_KINDS.join(', ')} records`)
      for (const c of codesIn(r)) { used.add(c); if (!(c in hooks)) e('effect', `hook "${c}" is not named in the file's hooks list`) }
      if (placeholder && kind !== 'quests' && kind !== 'explore') {
        const eff = r.effect
        if (!(isObj(eff) && eff.code === 'todo')) e('effect', 'a placeholder record must have effect {code: "todo"}')
      }
      CHECK[kind]?.(r, e, placeholder)
    }
    for (const h of Object.keys(hooks)) if (!used.has(h)) err('-', `hooks.${h}`, 'hook is named but no record uses it')
    if (kind === 'caps-awards') checkAwardSet(f.records.filter(isObj), err)
  }

  errs.push(...validatePerkEffects(edition, recordsOf(files.perks)))
  return errs
}

/** Run the main validator over the perks (their effects are ordinary Effects) and relabel the result. */
export function validatePerkEffects(edition: string, perks: unknown): ValidationError[] {
  const b: EditionBundle = emptyBundle(edition)
  b.records.perks = (Array.isArray(perks) ? perks : []) as never
  return validateBundle(b)
    .filter((x) => !x.path.startsWith('id') && !x.path.startsWith('source'))
    .map((x) => ({ ...x, file: campaignFileName(edition, 'perks') }))
}
