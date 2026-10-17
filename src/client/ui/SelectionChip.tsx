// Always-visible chip for the model the HUD is about: portrait (or faction swatch), name and wounds.
import { modelName, seatLabel, useBundle, usePresented } from '../contract'
import { Portrait } from './art'
import { useCurrentModelId } from './useCurrent'

export function SelectionChip() {
  const state = usePresented()
  const bundle = useBundle()
  const id = useCurrentModelId()
  const m = id && state ? state.models[id] : undefined
  if (!m || !state) return null
  const unit = bundle?.records.units.find((u) => u.id === m.profileId)
  const name = modelName(state, m.id)
  return (
    <div className={`sel-chip life-${m.life}`} data-testid="selection-chip" aria-label={`Selected: ${name}`}>
      <Portrait unitId={m.profileId} faction={unit?.faction} name={name} size={40} />
      <span className="sel-text">
        <b>{name}</b>
        <span className="dim">{seatLabel(m.owner)} · {m.life !== 'active' ? m.life : `${m.damage} dmg ${m.rad} rad`}</span>
      </span>
    </div>
  )
}
