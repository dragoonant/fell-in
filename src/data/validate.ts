// Data validator core (spec 20 s3.2). Pure: no fs, no Vite. tools/validate-data.ts wraps it for the CLI.
import {
  ADDICTION_ICONS, AI_BLUE_ICONS, AI_RESPONSES, AP_USES, ARMOR_KINDS, ATTRS, BASE_MMS, COLOURS, DAMAGE_TYPES,
  DIE_COLOURS, EFFECT_OPS, ICONS, INJURIES, ITEM_KINDS, KINDS, OUTCOMES, PRIMED_GAINS, RANGES, RULER_STATS,
  SCENARIO_MODES, SKILLS, UNIT_FLAGS, UNIT_TYPES,
  type EditionBundle, type EditionsFile, type Kind,
} from './types'

export interface ValidationError { file: string; id: string; path: string; message: string }

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Required fields per Effect op (spec 20 s2.1). */
export const OP_FIELDS: Record<(typeof EFFECT_OPS)[number], string[]> = {
  attrMod: ['attr', 'n'], skillMod: ['skill', 'n'], armorMod: ['damageType', 'n'], addDice: ['dice'],
  ensureDie: ['dice'], iconConvert: ['from', 'to', 'dieColours'], heal: ['n'], healRad: ['n'], addRad: ['n'],
  gainAP: ['n'], cureInjury: ['injury'], rulerStep: ['stat', 'n'], addSpecial: ['special'], grantFlag: ['flag'],
  choose: ['options'],
}

type Obj = Record<string, unknown>
type RefKind = Kind | 'equipment'
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

class Ctx {
  refs: { path: string; id: string; kinds: RefKind[] }[] = []
  constructor(public file: string, public id: string, private errs: ValidationError[]) {}
  err(path: string, message: string) { this.errs.push({ file: this.file, id: this.id, path, message }) }

  has(o: Obj, key: string, path: string): boolean {
    if (o[key] === undefined) { this.err(`${path}${key}`, 'is required'); return false }
    return true
  }
  str(v: unknown, path: string, opt = false): boolean {
    if (v === undefined && opt) return true
    if (typeof v !== 'string' || v.trim() === '') { this.err(path, 'must be a non-empty string'); return false }
    return true
  }
  num(v: unknown, path: string, opt = false): boolean {
    if (v === undefined && opt) return true
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.err(path, 'must be a number'); return false }
    return true
  }
  bool(v: unknown, path: string, opt = true): void {
    if (v === undefined && opt) return
    if (typeof v !== 'boolean') this.err(path, 'must be true or false')
  }
  oneOf(v: unknown, list: readonly unknown[], path: string, opt = false): boolean {
    if (v === undefined && opt) return true
    if (!list.includes(v)) { this.err(path, `must be one of ${list.join('|')} (got ${JSON.stringify(v)})`); return false }
    return true
  }
  arr(v: unknown, path: string, each: (x: unknown, p: string) => void, opt = false): void {
    if (v === undefined && opt) return
    if (!Array.isArray(v)) { this.err(path, 'must be an array'); return }
    v.forEach((x, i) => each(x, `${path}[${i}]`))
  }
  obj(v: unknown, path: string, opt = false): v is Obj {
    if (v === undefined && opt) return false
    if (!isObj(v)) { this.err(path, 'must be an object'); return false }
    return true
  }
  ref(v: unknown, path: string, kinds: RefKind[], opt = false): void {
    if (v === undefined && opt) return
    if (this.str(v, path)) this.refs.push({ path, id: v as string, kinds })
  }
  record<T>(v: unknown, keys: readonly string[], path: string, each: (x: unknown, p: string) => void, opt = true): void {
    if (v === undefined && opt) return
    if (!this.obj(v, path)) return
    for (const [k, x] of Object.entries(v)) {
      if (!keys.includes(k)) this.err(`${path}.${k}`, `unknown key (expected ${keys.join('|')})`)
      else each(x, `${path}.${k}`)
    }
  }
  pool(v: unknown, path: string, opt = true): void {
    this.record(v, DIE_COLOURS, path, (x, p) => this.num(x, p), opt)
  }
  armorValue(v: unknown, path: string): void {
    if (v === 'none' || v === 'immune') return
    if (!this.obj(v, path)) return
    this.num(v.base, `${path}.base`); this.num(v.strong, `${path}.strong`, true)
  }
  armorTable(v: unknown, path: string, partial: boolean): void {
    if (!this.obj(v, path, partial)) return
    for (const t of DAMAGE_TYPES) if (!partial && v[t] === undefined) this.err(`${path}.${t}`, 'is required')
    this.record(v, DAMAGE_TYPES, path, (x, p) => this.armorValue(x, p))
  }
  attrMap(v: unknown, path: string, full: boolean): void {
    if (!this.obj(v, path, !full)) return
    if (full) for (const a of ATTRS) if (v[a] === undefined) this.err(`${path}.${a}`, 'is required')
    this.record(v, ATTRS, path, (x, p) => this.num(x, p))
  }
  code(v: Obj, path: string): void {
    this.str(v.code, `${path}.code`)
    if (v.args !== undefined) this.obj(v.args, `${path}.args`)
  }
  condition(v: unknown, path: string): void {
    if (!this.obj(v, path, true)) return
    this.ref(v.faction, `${path}.faction`, ['factions'], true)
    this.ref(v.notFaction, `${path}.notFaction`, ['factions'], true)
    this.arr(v.skills, `${path}.skills`, (x, p) => this.oneOf(x, SKILLS, p), true)
    this.arr(v.ranges, `${path}.ranges`, (x, p) => this.oneOf(x, RANGES, p), true)
    this.arr(v.damageTypes, `${path}.damageTypes`, (x, p) => this.oneOf(x, DAMAGE_TYPES, p), true)
    this.arr(v.targetTypes, `${path}.targetTypes`, (x, p) => this.oneOf(x, UNIT_TYPES, p), true)
    this.str(v.code, `${path}.code`, true)
  }
  effect(v: unknown, path: string): void {
    if (!this.obj(v, path)) return
    if (v.when !== undefined) this.condition(v.when, `${path}.when`)
    if (v.op === undefined) {
      if (v.code === undefined) { this.err(path, 'needs "op" or "code"'); return }
      this.code(v, path); return
    }
    if (!this.oneOf(v.op, EFFECT_OPS, `${path}.op`)) return
    for (const f of OP_FIELDS[v.op as keyof typeof OP_FIELDS]) this.has(v, f, `${path}.`)
    this.num(v.n, `${path}.n`, true)
    this.oneOf(v.attr, ATTRS, `${path}.attr`, true)
    this.oneOf(v.skill, SKILLS, `${path}.skill`, true)
    this.oneOf(v.damageType, [...DAMAGE_TYPES, 'all'], `${path}.damageType`, true)
    this.pool(v.dice, `${path}.dice`)
    this.arr(v.dieColours, `${path}.dieColours`, (x, p) => this.oneOf(x, DIE_COLOURS, p), true)
    this.oneOf(v.from, [...ICONS, 'blank'], `${path}.from`, true)
    this.oneOf(v.to, ICONS, `${path}.to`, true)
    this.oneOf(v.stat, RULER_STATS, `${path}.stat`, true)
    this.oneOf(v.apUse, AP_USES, `${path}.apUse`, true)
    this.oneOf(v.injury, INJURIES, `${path}.injury`, true)
    this.oneOf(v.flag, UNIT_FLAGS, `${path}.flag`, true)
    if (v.special !== undefined) this.special(v.special, `${path}.special`, false)
    this.arr(v.options, `${path}.options`, (o, p) => this.effects(o, p), true)
  }
  effects(v: unknown, path: string, opt = false): void { this.arr(v, path, (x, p) => this.effect(x, p), opt) }
  ability(v: unknown, path: string): void {
    if (!this.obj(v, path)) return
    this.str(v.id, `${path}.id`); this.str(v.name, `${path}.name`); this.str(v.text, `${path}.text`)
    this.bool(v.aura, `${path}.aura`); this.str(v.glyph, `${path}.glyph`, true)
    this.effects(v.effects, `${path}.effects`, true)
  }
  restriction(v: unknown, path: string): void {
    if (!this.obj(v, path, true)) return
    this.arr(v.units, `${path}.units`, (x, p) => this.ref(x, p, ['units']), true)
    this.arr(v.types, `${path}.types`, (x, p) => this.oneOf(x, UNIT_TYPES, p), true)
    this.arr(v.factions, `${path}.factions`, (x, p) => this.ref(x, p, ['factions']), true)
    this.arr(v.notFactions, `${path}.notFactions`, (x, p) => this.ref(x, p, ['factions']), true)
    this.bool(v.assignedOnly, `${path}.assignedOnly`); this.bool(v.setsArmor, `${path}.setsArmor`)
  }
  special(v: unknown, path: string, needCost: boolean): void {
    if (!this.obj(v, path)) return
    if (needCost && v.cost === undefined) this.err(`${path}.cost`, 'is required on a paid special')
    this.arr(v.cost, `${path}.cost`, (x, p) => this.oneOf(x, ICONS, p), true)
    this.num(v.max, `${path}.max`, true); this.num(v.n, `${path}.n`, true)
    if (isObj(v.outcome)) this.code(v.outcome, `${path}.outcome`)
    else this.oneOf(v.outcome, OUTCOMES, `${path}.outcome`)
    this.oneOf(v.colour, COLOURS, `${path}.colour`, true)
    this.oneOf(v.icon, ICONS, `${path}.icon`, true)
    this.oneOf(v.damageType, DAMAGE_TYPES, `${path}.damageType`, true)
  }
  damage(v: unknown, path: string, opt = false): void {
    this.arr(v, path, (d, p) => {
      if (!this.obj(d, p)) return
      this.oneOf(d.type, DAMAGE_TYPES, `${p}.type`); this.num(d.value, `${p}.value`)
      this.oneOf(d.area, COLOURS, `${p}.area`, true); this.bool(d.lowerOfPhysEnergy, `${p}.lowerOfPhysEnergy`)
    }, opt)
  }
}

// ---- per-kind checks ----
type Check = (c: Ctx, r: Obj) => void

const checkUnit: Check = (c, r) => {
  c.str(r.name, 'name')
  if (r.faction !== null) c.ref(r.faction, 'faction', ['factions'])
  c.bool(r.unique, 'unique', false)
  c.str(r.versionGroup, 'versionGroup', true)
  c.arr(r.types, 'types', (x, p) => c.oneOf(x, UNIT_TYPES, p))
  c.oneOf(r.baseMm, BASE_MMS, 'baseMm')
  for (const k of ['move', 'charge', 'awareness']) c.oneOf(r[k], COLOURS, k)
  c.attrMap(r.attrs, 'attrs', true)
  c.arr(r.skills, 'skills', (s, p) => {
    if (!c.obj(s, p)) return
    c.oneOf(s.skill, SKILLS, `${p}.skill`); c.oneOf(s.attr, ATTRS, `${p}.attr`)
    c.oneOf(s.colour, COLOURS, `${p}.colour`, true); c.bool(s.white, `${p}.white`)
  })
  c.oneOf(r.healthAttr, ATTRS, 'healthAttr')
  c.armorTable(r.armor, 'armor', false)
  c.arr(r.apUse, 'apUse', (x, p) => c.oneOf(x, AP_USES, p))
  c.bool(r.critical, 'critical'); c.bool(r.luck, 'luck')
  c.arr(r.flags, 'flags', (x, p) => c.oneOf(x, UNIT_FLAGS, p))
  c.arr(r.abilities, 'abilities', (x, p) => c.ability(x, p))
  c.arr(r.equipped, 'equipped', (x, p) => c.ref(x, p, ['equipment']))
  c.arr(r.specialities, 'specialities', (s, p) => {
    if (!c.obj(s, p)) return
    c.str(s.target, `${p}.target`); c.num(s.bonus, `${p}.bonus`); c.str(s.extra, `${p}.extra`, true)
  })
  if (c.obj(r.provenance, 'provenance', true)) for (const [k, v] of Object.entries(r.provenance)) checkSource(c, v, `provenance.${k}`)
  c.num(r.cost, 'cost')
}

const checkWeapon: Check = (c, r) => {
  c.str(r.name, 'name')
  c.oneOf(r.skill, SKILLS, 'skill')
  c.restriction(r.restriction, 'restriction')
  if (c.obj(r.skillRoll, 'skillRoll', true)) {
    c.oneOf(r.skillRoll.attr, ATTRS, 'skillRoll.attr'); c.oneOf(r.skillRoll.minusTargetAttr, ATTRS, 'skillRoll.minusTargetAttr', true)
  }
  c.oneOf(r.short, [...COLOURS, 'throw'], 'short', true)
  c.oneOf(r.long, COLOURS, 'long', true)
  c.bool(r.minShortZero, 'minShortZero')
  c.record(r.dice, RANGES, 'dice', (x, p) => c.pool(x, p, false), false)
  c.damage(r.damage, 'damage')
  if (c.obj(r.targetExtra, 'targetExtra', true)) {
    c.num(r.targetExtra.damage, 'targetExtra.damage', true)
    c.arr(r.targetExtra.specials, 'targetExtra.specials', (x, p) => c.special(x, p, false), true)
  }
  c.arr(r.specials, 'specials', (x, p) => c.special(x, p, true))
  if (c.obj(r.critical, 'critical', true)) {
    const k = r.critical
    c.num(k.rating, 'critical.rating'); c.damage(k.damage, 'critical.damage', true); c.pool(k.extraDice, 'critical.extraDice')
    c.oneOf(k.restriction, ['shortOnly', 'longOnly'], 'critical.restriction', true)
    c.arr(k.effects, 'critical.effects', (x, p) => c.special(x, p, false), true)
  }
  for (const k of ['slowFiring', 'noEmpty', 'unique', 'grenade', 'limitedUse', 'heavy']) c.bool(r[k], k)
  if (c.obj(r.primed, 'primed', true)) {
    const pr = r.primed
    c.num(pr.tokens, 'primed.tokens')
    if (isObj(pr.gain)) c.code(pr.gain, 'primed.gain'); else c.oneOf(pr.gain, PRIMED_GAINS, 'primed.gain')
    c.oneOf(pr.use, ['attack'], 'primed.use')
    c.arr(pr.onUse, 'primed.onUse', (x, p) => c.special(x, p, false))
    if (pr.spend !== 'all') c.num(pr.spend, 'primed.spend')
  }
  if (c.obj(r.walkedFire, 'walkedFire', true)) { c.num(r.walkedFire.shots, 'walkedFire.shots'); c.oneOf(r.walkedFire.colour, COLOURS, 'walkedFire.colour') }
  c.arr(r.scatter, 'scatter', (s, p) => {
    if (!c.obj(s, p)) return
    c.oneOf(s.colour, COLOURS, `${p}.colour`)
    if (!Array.isArray(s.failBy) || s.failBy.length !== 2 || typeof s.failBy[0] !== 'number' || (s.failBy[1] !== null && typeof s.failBy[1] !== 'number'))
      c.err(`${p}.failBy`, 'must be [number, number|null]')
  }, true)
  if (c.obj(r.mine, 'mine', true)) c.oneOf(r.mine.trigger, COLOURS, 'mine.trigger')
  c.num(r.cost, 'cost')
}

const checkArmor: Check = (c, r) => {
  c.str(r.name, 'name'); c.oneOf(r.kind, ARMOR_KINDS, 'kind'); c.str(r.text, 'text', true)
  c.armorTable(r.sets, 'sets', true)
  c.record(r.modifies, DAMAGE_TYPES, 'modifies', (x, p) => c.num(x, p))
  c.attrMap(r.attrBonus, 'attrBonus', false)
  c.restriction(r.restriction, 'restriction')
  c.arr(r.abilities, 'abilities', (x, p) => c.ability(x, p), true)
  if (r.kind === 'powerArmor' && r.powerArmor === undefined) c.err('powerArmor', 'is required when kind is powerArmor')
  if (c.obj(r.powerArmor, 'powerArmor', true)) for (const side of ['green', 'yellow']) {
    const s = r.powerArmor[side]
    if (!c.obj(s, `powerArmor.${side}`)) continue
    c.attrMap(s.attrBonus, `powerArmor.${side}.attrBonus`, false)
    c.armorTable(s.armor, `powerArmor.${side}.armor`, false)
  }
  c.num(r.cost, 'cost')
}

const checkItem: Check = (c, r) => {
  c.str(r.name, 'name'); c.oneOf(r.kind, ITEM_KINDS, 'kind'); c.str(r.text, 'text')
  c.bool(r.limitedUse, 'limitedUse', false)
  const d = r.duration
  if (d !== 'instant') {
    if (!c.obj(d, 'duration')) { /* reported */ } else if (d.fixed !== undefined) c.num(d.fixed, 'duration.fixed')
    else if (d.diminishing !== undefined) c.arr(d.diminishing, 'duration.diminishing', (st, p) => c.effects(st, p))
    else c.err('duration', 'must be "instant", {fixed} or {diminishing}')
  }
  c.effects(r.effects, 'effects')
  c.effects(r.cooked, 'cooked', true)
  if (c.obj(r.addictive, 'addictive', true)) {
    c.oneOf(r.addictive.icon, ADDICTION_ICONS, 'addictive.icon'); c.effects(r.addictive.addicted, 'addictive.addicted')
  }
  c.bool(r.shareable, 'shareable'); c.restriction(r.restriction, 'restriction')
  c.num(r.cost, 'cost')
}

const checkMod: Check = (c, r) => {
  c.str(r.name, 'name'); c.str(r.text, 'text')
  c.arr(r.fitsTo, 'fitsTo', (x, p) => c.oneOf(x, [...SKILLS, 'armor', 'clothing', 'powerArmor'], p))
  c.restriction(r.requires, 'requires')
  if (c.obj(r.altName, 'altName', true)) { c.str(r.altName.name, 'altName.name'); c.oneOf(r.altName.whenDamage, DAMAGE_TYPES, 'altName.whenDamage') }
  c.effects(r.effects, 'effects'); c.num(r.cost, 'cost')
}

const checkPerk: Check = (c, r) => {
  c.str(r.name, 'name'); c.str(r.text, 'text'); c.effects(r.effects, 'effects')
  c.bool(r.settlementWide, 'settlementWide'); c.num(r.cost, 'cost')
}

const checkLeader: Check = (c, r) => {
  c.str(r.name, 'name'); c.ref(r.factionLock, 'factionLock', ['factions'], true)
  c.arr(r.abilities, 'abilities', (x, p) => c.ability(x, p)); c.num(r.cost, 'cost')
}

const checkFaction: Check = (c, r) => {
  c.str(r.name, 'name')
  c.arr(r.rules, 'rules', (x, p) => {
    if (!c.obj(x, p)) return
    c.str(x.id, `${p}.id`); c.str(x.text, `${p}.text`); c.effects(x.effects, `${p}.effects`)
  })
}

const checkAi: Check = (c, r) => {
  c.ref(r.unitId, 'unitId', ['units'])
  c.arr(r.standardEquipment, 'standardEquipment', (x, p) => c.ref(x, p, ['equipment']))
  c.arr(r.columns, 'columns', (x, p) => { if (c.obj(x, p)) { c.str(x.label, `${p}.label`); c.obj(x.when, `${p}.when`) } })
  c.arr(r.rows, 'rows', (row, p) => {
    if (!c.obj(row, p)) return
    c.arr(row.blueIcons, `${p}.blueIcons`, (x, q) => c.oneOf(x, AI_BLUE_ICONS, q))
    c.arr(row.cells, `${p}.cells`, (cell, q) => {
      if (!c.obj(cell, q)) return
      c.oneOf(cell.response, AI_RESPONSES, `${q}.response`); c.bool(cell.reckless, `${q}.reckless`, false); c.bool(cell.stayEngaged, `${q}.stayEngaged`, false)
    })
    c.arr(row.method, `${p}.method`, (x, q) => c.oneOf(x, ['ranged', 'close'], q))
  })
  c.arr(r.targetPriority, 'targetPriority', (x, p) => c.str(x, p))
}

const checkScenario: Check = (c, r) => {
  c.str(r.name, 'name'); c.oneOf(r.mode, SCENARIO_MODES, 'mode')
  if (!Array.isArray(r.tableIn) || r.tableIn.length !== 2 || r.tableIn.some((x) => typeof x !== 'number')) c.err('tableIn', 'must be [number, number]')
  if (r.rounds !== null) c.num(r.rounds, 'rounds')
  c.arr(r.sides, 'sides', (s, p) => {
    if (!c.obj(s, p)) return
    c.str(s.id, `${p}.id`); c.ref(s.faction, `${p}.faction`, ['factions'], true); c.obj(s.deploy, `${p}.deploy`)
    c.arr(s.forces, `${p}.forces`, (f, q) => {
      if (!c.obj(f, q)) return
      c.ref(f.unit, `${q}.unit`, ['units']); c.num(f.count, `${q}.count`)
      c.arr(f.items, `${q}.items`, (x, z) => c.ref(x, z, ['equipment']))
      c.bool(f.heroic, `${q}.heroic`); c.ref(f.leader, `${q}.leader`, ['leaders'], true)
    }, true)
  })
  c.arr(r.markers, 'markers', (m, p) => { if (c.obj(m, p)) c.oneOf(m.kind, ['investigation', 'searchable', 'object'], `${p}.kind`) })
  c.arr(r.rules, 'rules', (x, p) => {
    if (!c.obj(x, p)) return
    c.str(x.id, `${p}.id`); c.str(x.text, `${p}.text`); c.effects(x.effects, `${p}.effects`, true)
  })
  c.arr(r.victory, 'victory', (v, p) => { if (c.obj(v, p)) { c.str(v.side, `${p}.side`); c.str(v.when, `${p}.when`) } })
}

const CHECKS: Record<Kind, Check> = {
  units: checkUnit, weapons: checkWeapon, armor: checkArmor, items: checkItem, mods: checkMod, perks: checkPerk,
  leaders: checkLeader, factions: checkFaction, ai: checkAi, scenarios: checkScenario,
}

function checkSource(c: Ctx, v: unknown, path: string): void {
  if (Array.isArray(v) && v.length > 0) v.forEach((x, i) => c.str(x, `${path}[${i}]`))
  else if (!(typeof v === 'string' && v.trim() !== '')) c.err(path, 'is required (string or non-empty array)')
}

const EQUIPMENT: Kind[] = ['weapons', 'armor', 'items']

/** Validate one edition bundle. Returns every problem found; empty array = valid. */
export function validateBundle(b: EditionBundle): ValidationError[] {
  const errs: ValidationError[] = []
  const owner = new Map<string, Kind | 'singleton'>()
  const ctxs: Ctx[] = []
  const counts = new Map<string, number>()

  const visit = (kind: Kind | 'singleton', rec: unknown, fallbackFile: string, check?: Check) => {
    const id = isObj(rec) && typeof rec.id === 'string' ? rec.id : '(no id)'
    const c = new Ctx(b.origin[id] ?? fallbackFile, id, errs)
    if (!isObj(rec)) { c.err('', 'record must be an object'); return }
    if (!c.str(rec.id, 'id')) { /* reported */ } else if (!ID_RE.test(rec.id as string)) c.err('id', 'must be kebab-case (a-z, 0-9, single hyphens)')
    checkSource(c, rec.source, 'source')
    counts.set(id, (counts.get(id) ?? 0) + 1)
    if (!owner.has(id)) owner.set(id, kind)
    check?.(c, rec)
    ctxs.push(c)
  }

  for (const kind of KINDS) for (const rec of b.records[kind] as unknown[]) visit(kind, rec, `${b.edition}/${kind}/?`, CHECKS[kind])
  for (const [name, rec] of Object.entries(b.singletons)) {
    visit('singleton', rec, `${b.edition}/${name}.json`)
    if (isObj(rec) && rec.id !== name) errs.push({ file: `${b.edition}/${name}.json`, id: String(rec.id), path: 'id', message: `must be "${name}"` })
  }

  for (const [id, n] of counts) if (n > 1 && id !== '(no id)') errs.push({ file: b.origin[id] ?? b.edition, id, path: 'id', message: `duplicate id (${n} records)` })

  const peers = new Map<string, number>()
  for (const u of b.records.units) if (typeof u.versionGroup === 'string') peers.set(u.versionGroup, (peers.get(u.versionGroup) ?? 0) + 1)

  for (const c of ctxs) for (const r of c.refs) {
    const k = owner.get(r.id)
    const want = r.kinds.flatMap((x) => (x === 'equipment' ? EQUIPMENT : [x]))
    if (k === undefined) c.err(r.path, `unknown id "${r.id}" (expected ${want.join('|')})`)
    else if (k === 'singleton' || !want.includes(k)) c.err(r.path, `"${r.id}" is a ${k} record, expected ${want.join('|')}`)
  }
  return errs
}

/** Validate editions.json against the bundles found on disk. */
export function validateEditions(editions: unknown, found: string[]): ValidationError[] {
  const errs: ValidationError[] = []
  const e = (path: string, message: string) => errs.push({ file: 'editions.json', id: '-', path, message })
  if (!isObj(editions)) { e('', 'must be an object { default, editions }'); return errs }
  const ed = editions as unknown as EditionsFile
  if (!Array.isArray(ed.editions) || ed.editions.some((x) => typeof x !== 'string')) e('editions', 'must be a string array')
  else {
    if (!ed.editions.includes(ed.default)) e('default', `"${ed.default}" is not listed in editions`)
    for (const f of found) if (!ed.editions.includes(f)) e('editions', `folder data/${f}/ is not listed`)
  }
  return errs
}

export function formatError(x: ValidationError): string {
  return `data/${x.file} [${x.id}] ${x.path || '(record)'}: ${x.message}`
}
