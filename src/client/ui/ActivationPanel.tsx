// Activation menu: actions left, AP, full Actions, Quick Actions (1 AP) and End. Odds appear on the attack prompt that follows.
import type { PendingDecision } from '../../engine/types'
import { game } from '../contract'
import { menuGroup } from './format'
import { promptView } from './promptView'
import { useNamers } from './useNamers'

const GROUPS: { id: ReturnType<typeof menuGroup>; label: string }[] = [
  { id: 'move', label: 'Move' }, { id: 'attack', label: 'Attack' }, { id: 'other', label: 'Other' },
  { id: 'quick', label: 'Quick Actions (cost 1 AP)' }, { id: 'end', label: '' },
]

export function ActivationPanel({ pending }: { pending: PendingDecision }) {
  const n = useNamers()
  const copy = promptView(pending, n)
  const left = Number(pending.context.actionsLeft ?? 0)
  const ap = Number(pending.context.ap ?? 0)
  return (
    <section className="panel prompt activation" data-testid="activation-panel" data-kind={pending.kind}>
      <h3 data-testid="prompt-title">{copy.title}</h3>
      {copy.tip && <p className="tip" data-testid="prompt-tip">{copy.tip}</p>}
      <div className="chips">
        <span className="chip" data-testid="actions-left">Actions left {left}</span>
        <span className="chip" data-testid="ap-count">AP {ap}</span>
      </div>
      {GROUPS.map((g) => {
        const opts = copy.options.filter((o) => menuGroup(o.id, o.action.type) === g.id)
        if (!opts.length) return null
        return (
          <div key={g.id} className="group">
            {g.label && <div className="sect">{g.label}</div>}
            <div className="options">
              {opts.map((o) => (
                <button key={o.id} className={g.id === 'end' ? 'quiet' : ''} data-testid={`prompt-option-${o.id}`} onClick={() => game.choose(o.id)}>
                  {g.id === 'end' ? 'End activation' : o.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
