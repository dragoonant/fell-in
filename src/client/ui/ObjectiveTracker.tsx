// Always-visible objective panel: scenario name, round, and each objective line as a bar, check or value.
import { useMemo } from 'react'
import { seatLabel, useObjectiveStatus, usePresented } from '../contract'
import { trackerView } from './briefingView'

export function ObjectiveTracker() {
  const status = useObjectiveStatus()
  const state = usePresented()
  const sideName = (side: string): string | null => {
    const seat = Object.values(state?.seats ?? {}).find((x) => x.side === side)?.id ?? (state?.seats?.[side] ? side : null)
    return seat ? seatLabel(seat) : null
  }
  const model = useMemo(() => (status ? trackerView(status) : null), [status])
  if (!model) return null
  return (
    <aside className="panel tracker" data-testid="objective-tracker" aria-label="Objectives">
      <div className="tracker-name" data-testid="tracker-name">{model.name}</div>
      <div className="tracker-round" data-testid="tracker-round">{model.round}</div>
      {model.lines.map((l) => (
        <div key={l.id} className={`tl${l.done ? ' done' : ''}`} data-testid={`tracker-line-${l.id}`}>
          <span className="tl-text">{l.kind === 'check' ? (l.done ? '✓ ' : '○ ') : ''}{l.text}{l.side && sideName(l.side) ? ` (${sideName(l.side)})` : ''}</span>
          {l.kind === 'bar' && <span className="tl-val">{l.value}/{l.max}</span>}
          {l.kind === 'value' && <span className="tl-val">{l.value}</span>}
          {l.kind === 'bar' && <span className="tl-bar" aria-hidden="true"><i style={{ width: `${l.pct}%` }} /></span>}
        </div>
      ))}
    </aside>
  )
}
