// AI card panel (our design): shows how the official AI chose its response so the player can follow it: the unit, the
// column that fit and why, the blue die, the row, the response letter and what it means in plain words, then the
// concrete things it did. Renders nothing outside Solo / Co-op (no AI card has resolved yet).
import { useAiPanelStore } from '../bot/aiPanelStore'
import { describeActivity, describePick } from '../bot/officialView'
import { useNamers } from './useNamers'

export function AiCardPanel() {
  const panel = useAiPanelStore((s) => s.panel)
  const n = useNamers()
  if (!panel.pick) return null
  const lines = describePick(panel.pick, n.name)
  return (
    <aside className="panel ai-card" data-testid="ai-card-panel" aria-label="AI card" style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', width: 'min(360px, calc(100vw - 24px))' }}>
      <h3 data-testid="ai-card-unit">{lines.unit}</h3>
      <dl style={{ margin: 0 }}>
        <dt className="dim">Column</dt><dd data-testid="ai-card-column" style={{ margin: 0 }}>{lines.column}</dd>
        <dt className="dim">Die</dt><dd data-testid="ai-card-roll" style={{ margin: 0 }}>{lines.roll} ({lines.row})</dd>
        <dt className="dim">Response</dt><dd data-testid="ai-card-response" style={{ margin: 0 }}><b>{lines.response}</b>. {lines.meaning}</dd>
        <dt className="dim">Manner</dt><dd data-testid="ai-card-attitude" style={{ margin: 0 }}>{lines.attitude}</dd>
      </dl>
      {panel.activities.length > 0 && (
        <ol data-testid="ai-card-activities" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {panel.activities.map((a, i) => <li key={i}>{describeActivity(a.activity, n.name)}</li>)}
        </ol>
      )}
      {panel.notes.length > 0 && <p className="dim" data-testid="ai-card-notes" style={{ margin: '6px 0 0' }}>{panel.notes[panel.notes.length - 1]}</p>}
    </aside>
  )
}
