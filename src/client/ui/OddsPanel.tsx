// Odds preview for one attacker/target/weapon: every figure comes from the engine query hooks (contract).
import {
  colourFor, useCover, useExpectedDamage, useHitOdds, useKillOdds, useRangeBand, type AttackOpts,
} from '../contract'
import { COLOUR_HEX, num, pct, poolText } from './format'
import { useNamers } from './useNamers'

export interface OddsProps { attacker: string; target: string; weaponUid?: string; band?: 'short' | 'long' | 'melee' }

export function OddsPanel({ attacker, target, weaponUid, band }: OddsProps) {
  const n = useNamers()
  const opts: AttackOpts = { ...(weaponUid ? { weaponUid } : {}), ...(band ? { band } : {}) }
  const hit = useHitOdds(attacker, target, opts)
  const dmg = useExpectedDamage(attacker, target, opts)
  const kill = useKillOdds(attacker, target, opts)
  const range = useRangeBand(attacker, target, weaponUid)
  const cover = useCover(attacker, target)
  if (!hit) return null
  const colour = range && Number.isFinite(range.distance) ? colourFor(range.distance) : null
  return (
    <div className="odds" data-testid="odds-panel">
      <div className="odds-head">{n.name(attacker)} against {n.name(target)}</div>
      <div className="odds-grid">
        <div><b data-testid="odds-hit">{pct(hit.pHit)}</b><span>to hit</span></div>
        <div><b data-testid="odds-damage">{num(dmg?.expected)}</b><span>expected damage</span></div>
        <div><b data-testid="odds-kill">{pct(kill)}</b><span>to remove</span></div>
      </div>
      <ul className="odds-lines">
        <li data-testid="odds-sv">Success value {hit.sv}{hit.critical ? ' (Critical Attack, always hits)' : ''}. Dice: {poolText(hit.pool)}.</li>
        {hit.pHitAccurate !== undefined && hit.pHitAccurate > hit.pHit && <li>With a luck token spent to aim: {pct(hit.pHitAccurate)}.</li>}
        <li data-testid="odds-range">
          Range: {range?.band ? (range.band === 'both' ? 'short or long (your pick)' : range.band) : hit.band ?? 'out of range'}, {num(range?.distance)} in
          {colour && <> <i className="swatch" style={{ background: COLOUR_HEX[colour] }} />{colour} ruler</>}
        </li>
        <li data-testid="odds-cover">{cover?.cover ? `Target in cover (${cover.count} step${cover.count === 1 ? '' : 's'}, armor +${cover.armorBonus})` : 'No cover'}</li>
        {hit.breakdown.length > 1 && (
          <li>
            Modifiers: {hit.breakdown.map((m, i) => <span key={i} className="mod">{m.label} {m.mode === 'set' ? '=' : m.value >= 0 ? '+' : ''}{m.value}</span>)}
          </li>
        )}
        {dmg && dmg.byType.length > 1 && <li>By type: {dmg.byType.map((t) => `${t.type} ${num(t.expected)}`).join(', ')}</li>}
      </ul>
    </div>
  )
}
