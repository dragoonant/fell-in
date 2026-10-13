// Small billboard labels above each objective marker on the table (positions come from the engine's objective status).
import { Html } from '@react-three/drei'
import { useObjectiveStatus } from '../contract'

export function ObjectiveLabels() {
  const status = useObjectiveStatus()
  if (!status) return null
  return (
    <>
      {status.markers.map((m) => (
        <Html key={m.id} position={[m.x, 2.2, m.z]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <div className="obj-label" data-testid={`obj-label-${m.id}`}>{m.label}</div>
        </Html>
      ))}
    </>
  )
}
