// Right rail: event feed with a per-attack breakdown.
import { useEffect, useMemo, useRef } from 'react'
import { useFeed } from '../contract'
import { groupFeed } from './feedView'
import { useNamers } from './useNamers'

export function EventFeed() {
  const feed = useFeed()
  const n = useNamers()
  const rows = useMemo(() => groupFeed(feed, n), [feed, n])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [rows.length])
  return (
    <aside className="rail rail-right" data-testid="rail-right">
      <span className="rail-tab" aria-hidden="true">Log</span>
      <div className="panel feed" data-testid="event-feed">
        <div className="sect">What happened</div>
        {rows.length === 0 && <p className="dim">Nothing yet.</p>}
        {rows.slice(-80).map((r) => (
          <div key={r.id} className={`feed-row feed-${r.tone}`} data-testid="feed-row">
            <div>{r.text}</div>
            {r.lines.length > 0 && <ul>{r.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          </div>
        ))}
        <div ref={end} />
      </div>
    </aside>
  )
}
