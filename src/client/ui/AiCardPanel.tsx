// Compact panel for the Wasteland AI: what its latest card lookup said.
import { useMemo } from 'react'
import { useFeed, usePresented } from '../contract'
import { aiCardRows, latestAiDecision } from './aiCardView'

export function AiCardPanel() {
  const feed = useFeed()
  const state = usePresented()
  const rows = useMemo(() => {
    const ev = latestAiDecision(feed)
    return ev ? aiCardRows(state, ev) : null
  }, [feed, state])
  if (!rows) return null
  return (
    <div className="panel ai-card" data-testid="ai-card">
      <div className="sect">Wasteland AI card</div>
      <dl>
        <dt>Unit</dt><dd data-testid="ai-card-unit">{rows.unit}</dd>
        <dt>Column</dt><dd>{rows.column}</dd>
        <dt>Die row</dt><dd>{rows.row}</dd>
        <dt>Response</dt><dd>{rows.response}</dd>
        {rows.target && <><dt>Target</dt><dd>{rows.target}</dd></>}
      </dl>
    </div>
  )
}
