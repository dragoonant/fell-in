// Left rail: roster of every model (click to inspect) above the unit card.
import { modelName, seatLabel, usePresented } from '../contract'
import { FactionMark, useSeatFactions } from './art'
import { UnitCard } from './UnitCard'
import { useCurrentModelId } from './useCurrent'
import { useUiStore } from './uiStore'

export function Roster() {
  const state = usePresented()
  const current = useCurrentModelId()
  const inspect = useUiStore((s) => s.inspect)
  const factions = useSeatFactions()
  if (!state) return null
  const bySeat = state.seatOrder.map((seat) => ({ seat, ids: Object.values(state.models).filter((m) => m.owner === seat).map((m) => m.id) }))
  return (
    <aside className="rail rail-left" data-testid="rail-left">
      <span className="rail-tab" aria-hidden="true">Crew</span>
      <div className="panel roster" data-testid="roster">
        {bySeat.map(({ seat, ids }) => (
          <div key={seat}>
            <div className="sect"><FactionMark faction={factions[seat]} size={14} />{seatLabel(seat)}</div>
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
