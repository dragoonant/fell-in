// Always-visible objective panel: scenario name, round, and each objective line as a bar, check or value.
import { useMemo } from 'react'
import { seatLabel, useObjectiveStatus, usePresented } from '../contract'
import { trackerView } from './briefingView'
import { FactionMark, useSeatFactions } from './art'
import { useUiStore } from './uiStore'

export function ObjectiveTracker() {
  const status = useObjectiveStatus()
  const state = usePresented()
  const factions = useSeatFactions()
  const open = useUiStore((s) => s.trackerOpen)
  const toggle = useUiStore((s) => s.toggleTracker)
  const seatOfSide = (side: string): string | null => Object.values(state?.seats ?? {}).find((x) => x.side === side)?.id ?? (state?.seats?.[side] ? side : null)
  const sideName = (side: string): string | null => {
    const seat = seatOfSide(side)
    return seat ? seatLabel(seat) : null
  }
  const markedSeats = (state?.seatOrder ?? []).filter((s) => factions[s])
  const model = useMemo(() => (status ? trackerView(status) : null), [status])
  if (!model) return null
  return (
    <aside className="panel tracker" data-testid="objective-tracker" aria-label="Objectives">
      <button className="tracker-fold" data-testid="tracker-toggle" aria-expanded={open} aria-label={open ? 'Hide objectives' : 'Show objectives'} onClick={toggle}>{open ? '-' : '+'}</button>
      <div className="tracker-name" data-testid="tracker-name">{model.name}</div>
      <div className="tracker-round" data-testid="tracker-round">{model.round}</div>
      {open && markedSeats.length > 0 && (
        <div className="tracker-forces" data-testid="tracker-forces">
          {markedSeats.map((s) => <span key={s}><FactionMark faction={factions[s]} size={16} />{seatLabel(s)}</span>)}
        </div>
      )}
      {open && model.lines.map((l) => (
        <div key={l.id} className={`tl${l.done ? ' done' : ''}`} data-testid={`tracker-line-${l.id}`}>
          <span className="tl-text">{l.kind === 'check' ? (l.done ? '✓ ' : '○ ') : ''}{l.side && factions[seatOfSide(l.side) ?? ''] ? <FactionMark faction={factions[seatOfSide(l.side) ?? '']} size={13} /> : null}{l.text}{l.side && sideName(l.side) ? ` (${sideName(l.side)})` : ''}</span>
          {l.kind === 'bar' && <span className="tl-val">{l.value}/{l.max}</span>}
          {l.kind === 'value' && <span className="tl-val">{l.value}</span>}
          {l.kind === 'bar' && <span className="tl-bar" aria-hidden="true"><i style={{ width: `${l.pct}%` }} /></span>}
        </div>
      ))}
    </aside>
  )
}
