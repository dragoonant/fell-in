// Left rail: roster of every model (click to inspect) above the unit card.
import { modelName, seatLabel, useOpenDecision, usePresented } from '../contract'
import { UnitCard } from './UnitCard'
import { useUiStore } from './uiStore'

export function Roster() {
  const state = usePresented()
  const open = useOpenDecision()
  const inspected = useUiStore((s) => s.inspected)
  const inspect = useUiStore((s) => s.inspect)
  if (!state) return null
  const ctxModel = typeof open?.context.modelId === 'string' ? open.context.modelId : null
  const current = inspected && state.models[inspected] ? inspected : state.activation?.modelId ?? ctxModel ?? Object.keys(state.models)[0] ?? null
  const bySeat = state.seatOrder.map((seat) => ({ seat, ids: Object.values(state.models).filter((m) => m.owner === seat).map((m) => m.id) }))
  return (
    <aside className="rail rail-left" data-testid="rail-left">
      <div className="panel roster" data-testid="roster">
        {bySeat.map(({ seat, ids }) => (
          <div key={seat}>
            <div className="sect">{seatLabel(seat)}</div>
            {ids.map((id) => {
              const m = state.models[id]!
              return (
                <button key={id} className={`roster-row${id === current ? ' on' : ''} life-${m.life}`} data-testid={`roster-${id}`} onClick={() => inspect(id)}>
                  <i className={`dot ready-${m.readiness}`} />
                  <span>{modelName(state, id)}</span>
                  <span className="dim">{m.life !== 'active' ? m.life : `${m.damage} dmg ${m.rad} rad`}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <UnitCard id={current} />
    </aside>
  )
}
