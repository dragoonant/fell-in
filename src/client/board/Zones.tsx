// Deployment strips and scenario markers (objectives, searchables, investigation tokens) from the presented state and
// the scenario record. Shapes only, no text: original markings, not the printed tokens.
import { useMemo } from 'react'
import type { Colour } from '../../data/types'
import { rulerInches, useBundle, usePresented } from '../contract'
import { tintFor } from '../figures/view'
import { deployZones } from './layout'

export function Zones() {
  const state = usePresented()
  const bundle = useBundle()
  const zones = useMemo(() => {
    if (!state || !bundle) return []
    const def = bundle.records.scenarios.find((s) => s.id === state.scenarioId)
    if (!def) return []
    const bySeat = state.seatOrder.map((seat) => def.sides.find((sd) => sd.id === state.seats[seat]?.side)?.deploy)
    return deployZones(state.scenario.table, bySeat, (c) => rulerInches(c as Colour))
  }, [state?.scenarioId, state?.seatOrder, state?.seats, state?.scenario.table, bundle]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {zones.map((z) => (
        <mesh key={z.seatIndex} rotation={[-Math.PI / 2, 0, 0]} position={[(z.x0 + z.x1) / 2, 0.02, (z.z0 + z.z1) / 2]} name={`zone-${z.seatIndex}`}>
          <planeGeometry args={[z.x1 - z.x0, z.z1 - z.z0]} />
          <meshBasicMaterial color={tintFor(z.seatIndex)[0]} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ))}
      {(state?.markers ?? []).map((mk) => {
        const holder = mk.carriedBy ? state?.models[mk.carriedBy] : undefined
        if (holder?.offTable) return null
        const p = holder ? holder.pos : mk.pos
        const y = holder ? 1.9 : 0
        return (
          <group key={mk.id} position={[p.x, y, p.z]} name={`marker-${mk.id}`}>
            {mk.kind === 'object' ? (
              <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="#e0b54a" roughness={0.5} />
              </mesh>
            ) : mk.kind === 'searchable' ? (
              <mesh position={[0, 0.3, 0]} castShadow>
                <boxGeometry args={[1.1, 0.6, 0.8]} /><meshStandardMaterial color={mk.revealed ? '#8a7a55' : '#c9ad7c'} roughness={0.8} />
              </mesh>
            ) : (
              <mesh position={[0, 0.06, 0]}>
                <cylinderGeometry args={[0.55, 0.55, 0.12, 24]} /><meshStandardMaterial color={mk.revealed ? '#4f8a82' : '#d8c49a'} roughness={0.7} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
