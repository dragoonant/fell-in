// Unit figure from a generated GLB: scaled to the figure height, centred on the base, feet on the table (y up,
// origin at the bottom centre, front +z). Weapons are separate models (see Weapon.tsx); figures are bare-handed.
import { useMemo, type ReactElement } from 'react'
import { Box3, Group, Vector3 } from 'three'
import { useGlbInstance } from './glbLoader'

const MM = 25.4

/** Scale/offset that stands a model of bbox `min`..`max` on the origin at `height` inches. Pure. */
export function fitFigure(min: readonly [number, number, number], max: readonly [number, number, number], height: number) {
  const sy = height / Math.max(max[1] - min[1], 1e-6)
  return { scale: sy, offset: [-((min[0] + max[0]) / 2) * sy, -min[1] * sy, -((min[2] + max[2]) / 2) * sy] as [number, number, number] }
}

/** Fitted GLB group for `url`, or null while loading / when it failed (draw the procedural body). `yaw` (radians about
 * +y, from the manifest) first turns the raw model so its head looks along +z; the fit and the hand socket are both
 * measured after that turn, so sockets live in the fitted figure frame (inches, base centre on the table). */
export function useFittedFigure(url: string | undefined, height: number, yaw = 0): Group | null {
  const inst = useGlbInstance(url)
  return useMemo(() => {
    if (!inst) return null
    const turned = new Group()
    turned.rotation.y = yaw
    inst.position.set(0, 0, 0)
    turned.add(inst)
    turned.updateMatrixWorld(true)
    const b = new Box3().setFromObject(turned)
    if (b.isEmpty()) return null
    const f = fitFigure(b.min.toArray() as [number, number, number], b.max.toArray() as [number, number, number], height)
    const g = new Group()
    g.add(turned)
    g.scale.setScalar(f.scale)
    g.position.fromArray(f.offset).add(new Vector3(0, 0.12, 0))
    return g
  }, [inst, height, yaw])
}

export function GlbBase({ baseMm, color }: { baseMm: number; color: string }): ReactElement {
  const r = baseMm / MM / 2
  return (
    <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r * 1.04, 0.12, 32]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  )
}

export function GlbBody({ group }: { group: Group }): ReactElement {
  return <primitive object={group} />
}
