// Prompt bodies per form: plain option list, target picker with odds, and path (the board handles the drag).
import { game, type ClientRejection } from '../contract'
import { OddsPanel } from './OddsPanel'
import type { PromptCopy } from './promptView'
import { pickedOption, useUiStore } from './uiStore'
import type { PendingDecision } from '../../engine/types'

export function answer(optionId: string): ClientRejection | null { return game.choose(optionId) }

export function ListForm({ copy }: { copy: PromptCopy }) {
  return (
    <div className="options" data-testid="prompt-options">
      {copy.options.map((o) => (
        <button key={o.id} className={o.tone === 'quiet' ? 'quiet' : ''} data-testid={`prompt-option-${o.id}`} onClick={() => answer(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function PathForm({ copy }: { copy: PromptCopy }) {
  return (
    <div className="options" data-testid="prompt-options">
      {copy.options.map((o) => (
        <button key={o.id} className="quiet" data-testid={`prompt-option-${o.id}`} onClick={() => answer(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function TargetsForm({ copy, pending }: { copy: PromptCopy; pending: PendingDecision }) {
  const pick = useUiStore((s) => s.pick)
  const setPick = useUiStore((s) => s.setPick)
  const chosenId = pickedOption(pick, pending.id, copy.options.map((o) => o.id))
  const chosen = copy.options.find((o) => o.id === chosenId)
  const a = chosen?.action
  const attacker = String(a?.modelId ?? pending.context.modelId ?? '')
  return (
    <>
      <div className="options" data-testid="prompt-options" role="radiogroup">
        {copy.options.map((o) => (
          <button key={o.id} role="radio" aria-checked={o.id === chosenId} className={o.id === chosenId ? 'on' : ''}
            data-testid={`prompt-option-${o.id}`} onClick={() => setPick(pending.id, o.id)}>{o.label}</button>
        ))}
      </div>
      {a && typeof a.targetId === 'string' && (
        <OddsPanel attacker={attacker} target={a.targetId}
          {...(typeof a.weaponUid === 'string' ? { weaponUid: a.weaponUid } : {})}
          {...(a.band === 'short' || a.band === 'long' || a.band === 'melee' ? { band: a.band } : {})} />
      )}
      <div className="options">
        <button className="primary" disabled={!chosen} data-testid="prompt-confirm" onClick={() => chosen && answer(chosen.id)}>Confirm attack</button>
      </div>
    </>
  )
}
