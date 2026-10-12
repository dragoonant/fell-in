// Unit card panel in our own design: stats, skills, weapons with ruler colours, armor, damage/rads, conditions.
import type { Attr, Colour, DamageType, WeaponDef } from '../../data/types'
import { conditionWord, modelName, rulerInches, seatLabel, useBundle, usePresented } from '../contract'
import { COLOUR_HEX, armorText, num } from './format'

const ATTR_ORDER: Attr[] = ['str', 'per', 'end', 'cha', 'int', 'agi', 'luc']
const DMG_TYPES: DamageType[] = ['physical', 'energy', 'radiation']
const READY_WORD = { unready: 'Unready', ready: 'Ready', used: 'Used' } as const

function Ruler({ colour, label }: { colour: Colour | null | undefined; label: string }) {
  if (!colour) return null
  return (
    <span className="ruler" title={`${label}: ${colour} ruler`}>
      <i className="swatch" style={{ background: COLOUR_HEX[colour] }} />{label} {num(rulerInches(colour))} in
    </span>
  )
}

function WeaponRow({ w }: { w: WeaponDef }) {
  const short = w.short === 'throw' ? null : w.short
  return (
    <li data-testid={`card-weapon-${w.id}`}>
      <b>{w.name}</b> <span className="dim">{w.skill}</span>
      <div className="weapon-line">
        {w.short === 'throw' ? <span>throw</span> : <Ruler colour={short} label="short" />}
        <Ruler colour={w.long} label="long" />
        <span>{w.damage.map((d) => `${d.value} ${d.type}`).join(' + ')}</span>
        {w.slowFiring && <span className="tag">slow firing</span>}
        {w.heavy && <span className="tag">heavy</span>}
      </div>
    </li>
  )
}

export function UnitCard({ id }: { id: string | null }) {
  const state = usePresented()
  const bundle = useBundle()
  const m = id && state ? state.models[id] : undefined
  if (!m || !state || !bundle) return <div className="card empty" data-testid="unit-card">No unit selected.</div>
  const unit = bundle.records.units.find((u) => u.id === m.profileId)
  const weapons = m.carried.filter((c) => c.kind === 'weapon').map((c) => bundle.records.weapons.find((w) => w.id === c.defId)).filter((w): w is WeaponDef => !!w)
  const carriedNames = (kind: 'armor' | 'item' | 'mod') => m.carried.filter((c) => c.kind === kind).map((c) => {
    const rec = (bundle.records[kind === 'armor' ? 'armor' : kind === 'item' ? 'items' : 'mods'] as { id: string; name: string }[]).find((r) => r.id === c.defId)
    return `${rec?.name ?? c.defId}${c.spent ? ' (spent)' : ''}`
  })
  const healthAttr = unit ? unit.attrs[unit.healthAttr] : null
  return (
    <div className={`card life-${m.life}`} data-testid="unit-card">
      <div className="card-head">
        <b data-testid="unit-card-name">{modelName(state, m.id)}</b>
        <span className="dim">{seatLabel(m.owner)}{unit?.faction ? ` · ${unit.faction}` : ''}</span>
      </div>
      <div className="chips">
        <span className={`chip ready-${m.readiness}`}>{READY_WORD[m.readiness]}</span>
        {m.life !== 'active' && <span className="chip bad">{m.life}</span>}
        {m.reaction && <span className="chip">Prepared</span>}
        {m.heroic && <span className="chip">Heroic</span>}
        {m.luck > 0 && <span className="chip">Luck x{m.luck}</span>}
        {m.armorBoost > 0 && <span className="chip">Armor boost x{m.armorBoost}</span>}
        {m.conditions.map((c) => <span key={c} className="chip bad" data-testid={`cond-${c}`}>{conditionWord(c)}</span>)}
      </div>
      <div className="wounds" data-testid="unit-card-wounds">
        <span>Damage <b>{m.damage}</b></span>
        <span>Radiation <b>{m.rad}</b></span>
        {healthAttr !== null && unit && <span className="dim">Health {healthAttr} ({unit.healthAttr.toUpperCase()})</span>}
      </div>
      {unit && (
        <>
          <div className="attrs">
            {ATTR_ORDER.map((a) => <span key={a}><i>{a.toUpperCase()}</i><b>{unit.attrs[a]}</b></span>)}
          </div>
          <div className="rulers">
            <Ruler colour={unit.move} label="move" />
            <Ruler colour={unit.charge} label="charge" />
            <Ruler colour={unit.awareness} label="aware" />
          </div>
          <div className="sect">Skills</div>
          <ul className="plain">
            {unit.skills.map((s) => (
              <li key={s.skill}>{s.skill} <span className="dim">({s.attr.toUpperCase()}{s.colour ? `, ${s.colour}` : ''}{s.white ? ', white' : ''})</span></li>
            ))}
          </ul>
          <div className="sect">Armor</div>
          <div className="armor-row">
            {DMG_TYPES.map((t) => <span key={t}>{t} <b>{armorText(unit.armor[t])}</b></span>)}
          </div>
          {carriedNames('armor').length > 0 && <div className="dim">Wearing {carriedNames('armor').join(', ')}</div>}
        </>
      )}
      <div className="sect">Weapons</div>
      <ul className="plain">{weapons.length ? weapons.map((w) => <WeaponRow key={w.id} w={w} />) : <li className="dim">Unarmed</li>}</ul>
      {(carriedNames('item').length > 0 || carriedNames('mod').length > 0) && (
        <div className="dim">Carrying {[...carriedNames('item'), ...carriedNames('mod')].join(', ')}</div>
      )}
      {unit && unit.abilities.length > 0 && (
        <>
          <div className="sect">Abilities</div>
          <ul className="plain">{unit.abilities.map((a) => <li key={a.id}><b>{a.name}</b></li>)}</ul>
        </>
      )}
    </div>
  )
}
