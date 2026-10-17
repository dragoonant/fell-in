// Compact panel for the Wasteland AI: what its latest card lookup said.
import { useMemo } from 'react'
import { useFeed, usePresented } from '../contract'
import { aiCardRows, latestAiDecision } from './aiCardView'
import { useUiStore } from './uiStore'

export function AiCardPanel() {
  const feed = useFeed()
  const state = usePresented()
  const open = useUiStore((s) => s.aiCardOpen)
  const toggle = useUiStore((s) => s.toggleAiCard)
  const rows = useMemo(() => {
    const ev = latestAiDecision(feed)
    return ev ? aiCardRows(state, ev) : null
  }, [feed, state])
  if (!rows) return null
  return (
    <div className="panel ai-card" data-testid="ai-card">
      <div className="sect ai-head">
        <span>Wasteland AI card</span>
        <button data-testid="ai-card-toggle" aria-expanded={open} aria-label={open ? 'Hide the AI card' : 'Show the AI card'} onClick={toggle}>{open ? '-' : '+'}</button>
      </div>
      {!open && <div className="ai-line" data-testid="ai-card-unit">{rows.unit}: {rows.response}</div>}
      {open && <dl>
        <dt>Unit</dt><dd data-testid="ai-card-unit">{rows.unit}</dd>
        <dt>Column</dt><dd>{rows.column}</dd>
        <dt>Die row</dt><dd>{rows.row}</dd>
        <dt>Response</dt><dd>{rows.response}</dd>
        {rows.target && <><dt>Target</dt><dd>{rows.target}</dd></>}
      </dl>}
    </div>
  )
}
