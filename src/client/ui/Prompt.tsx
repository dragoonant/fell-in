// The open decision as readable copy plus its form. Activation menus are drawn by ActivationPanel.
import type { PendingDecision } from '../../engine/types'
import { ListForm, PathForm, TargetsForm } from './PromptForms'
import { promptView } from './promptView'
import { useNamers } from './useNamers'

export function Prompt({ pending }: { pending: PendingDecision }) {
  const n = useNamers()
  const copy = promptView(pending, n)
  return (
    <section className="panel prompt" data-testid="hud-prompt" data-kind={pending.kind}>
      <h3 data-testid="prompt-title">{copy.title}</h3>
      <p className="hint" data-testid="prompt-hint">{copy.hint}</p>
      {copy.tip && <p className="tip" data-testid="prompt-tip">{copy.tip}</p>}
      {copy.form === 'targets' ? <TargetsForm copy={copy} pending={pending} />
        : copy.form === 'path' ? <PathForm copy={copy} />
        : <ListForm copy={copy} />}
    </section>
  )
}
