// Dice tray (owner D). DOM overlay rendered by GameScreen: the latest roll as d20 skill die + coloured d12 effect dice
// with icons, reroll/luck marks and the attack verdict, plus a DiceLog history. Rolling dice tumble until the beat ends.
import { useEffect, useMemo, useState } from 'react'
import { directorNow, effectDieFace, rollLabel, skillDieFace, useDiceLog, useFeed, useShownRoll, type ShownRoll } from '../contract'
import './dice.css'
import { ICON_GLYPH, outcomeAfter, trayFocus, viewRoll, type DieView, type FaceLookup, type RollView } from './diceView'

const lookup: FaceLookup = {
  skill: (f) => { try { return skillDieFace(f) } catch { return null } },
  effect: (c, f) => { try { return effectDieFace(c as never, f) } catch { return null } },
}

function Die({ d, rolling }: { d: DieView; rolling: boolean }) {
  const kind = d.role === 'skill' ? 'die-skill' : d.role === 'effect' ? `die-${d.colour}` : d.text === 'Luck' || d.text === 'Blank' ? `die-luck${d.text === 'Luck' ? ' on' : ''}` : ''
  const cls = ['die', kind, d.crit && 'die-crit', d.reroll && 'die-reroll', d.superseded && 'die-old', rolling && 'die-rolling'].filter(Boolean).join(' ')
  const title = [d.role === 'skill' ? 'd20 skill die' : d.colour ? `${d.colour} d12` : `d${d.sides}`, ...d.icons.map((i) => ICON_GLYPH[i].word), d.reroll ? 're-roll' : '', d.superseded ? 'replaced' : ''].filter(Boolean).join(', ')
  return (
    <span className={cls} title={title} aria-label={title} data-testid={`die-${d.role}-${d.key}`} data-face={d.face} data-colour={d.colour ?? ''}>
      <b>{d.text}</b>
      <i>{d.icons.map((i, n) => <span key={n}>{ICON_GLYPH[i].glyph}</span>)}</i>
    </span>
  )
}

function Faces({ v }: { v: RollView }) {
  return <>{v.dice.map((d) => (d.role === 'skill' ? d.text : d.colour ? `${d.colour[0]}${d.face}` : d.text)).join(' ')}</>
}

/** True while the roll's tumble plays; ticks once when it ends so the dice settle. */
function useRolling(roll: ShownRoll | null): boolean {
  const [, bump] = useState(0)
  const left = roll ? roll.startedAt + roll.durationMs - directorNow() : 0
  useEffect(() => {
    if (!roll || left <= 0) return
    const t = setTimeout(() => bump((n) => n + 1), left + 20)
    return () => clearTimeout(t)
  }, [roll, left])
  return left > 0
}

export function DiceTray() {
  const roll = useShownRoll()
  const log = useDiceLog()
  const feed = useFeed()
  const rolling = useRolling(roll)
  const [open, setOpen] = useState(false)
  // Headline the attack roll; an armor roll right after it shows as a second row.
  const focus = useMemo(() => {
    const f = trayFocus(log)
    return f && log[f.main] ? { main: log[f.main]!, extra: f.extra !== null ? log[f.extra] ?? null : null } : null
  }, [log])
  const shown = focus?.main ?? roll
  const view = useMemo(() => (shown ? viewRoll(shown.cue, lookup, outcomeAfter(feed, shown.cue), rollLabel(shown.cue.purpose)) : null), [shown, feed])
  const extra = useMemo(() => (focus?.extra ? viewRoll(focus.extra.cue, lookup, null, rollLabel(focus.extra.cue.purpose)) : null), [focus])
  if (!roll || !view) return null
  return (
    <div className={`dt dt-${rolling ? 'neutral' : view.verdict.tone}`} data-testid="dice-tray" data-verdict={rolling ? '' : view.verdict.word}>
      <div className="dt-head">
        <span className="dt-label" data-testid="dice-label">{view.label}</span>
        {!rolling && view.verdict.word && <span className="dt-verdict" data-testid="dice-verdict">{view.verdict.word}</span>}
      </div>
      <div className="dt-dice">{view.dice.map((d) => <Die key={d.key} d={d} rolling={rolling} />)}</div>
      {extra && (
        <div className="dt-extra" data-testid="dice-extra">
          <span className="dt-label">{extra.label}</span>
          <div className="dt-dice">{extra.dice.map((d) => <Die key={d.key} d={d} rolling={rolling} />)}</div>
        </div>
      )}
      {!rolling && (
        <div className="dt-meta">
          {view.acc > 0 && <span>Accuracy -{view.acc}</span>}
          {view.outcome && <span>Needs {view.outcome.sv} or lower</span>}
          {view.rerolled && <span className="dt-tag" data-testid="dice-reroll">Re-rolled</span>}
        </div>
      )}
      {log.length > 1 && (
        <>
          <button className="dt-toggle" data-testid="dice-log-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide log' : `Dice log (${log.length})`}</button>
          {open && <DiceLog log={log} feed={feed} />}
        </>
      )}
    </div>
  )
}

/** History of recent rolls this game, newest first. */
export function DiceLog({ log, feed }: { log: ShownRoll[]; feed: ReturnType<typeof useFeed> }) {
  const rows = useMemo(() => log.slice(-40).reverse().map((r) => ({ id: r.id, v: viewRoll(r.cue, lookup, outcomeAfter(feed, r.cue), rollLabel(r.cue.purpose)) })), [log, feed])
  return (
    <ul className="dtl" data-testid="dice-log">
      {rows.map(({ id, v }) => (
        <li key={id}>
          <span>{v.label}</span>
          <span className="dtl-faces"><Faces v={v} /></span>
          {v.verdict.word && <span className={`dtl-v-${v.verdict.tone}`}>{v.verdict.word}</span>}
        </li>
      ))}
    </ul>
  )
}
