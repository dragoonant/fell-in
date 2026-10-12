// A weapon in the figure's hand: the generated GLB (grip at the origin, barrel along +z, scaled to a nominal length)
// or a simple procedural stand-in (gun = box + barrel, melee = bar) until the model exists.
import { useMemo } from 'react'
import { Box3, Group } from 'three'
import { PALETTE } from '../theme'
import { useGlbInstance } from './glbLoader'
import type { WeaponMode } from './equipped'

export const NOMINAL_LENGTH: Record<WeaponMode, number> = { ranged: 1.1, melee: 0.9 }

function StandIn({ mode, accent }: { mode: WeaponMode; accent: string }) {
  if (mode === 'melee') {
    return (
      <mesh position={[0, 0, 0.4]} castShadow>
        <boxGeometry args={[0.09, 0.09, 0.9]} />
        <meshStandardMaterial color={accent} roughness={0.6} metalness={0.4} />
      </mesh>
    )
  }
  return (
    <group>
      <mesh position={[0, 0, 0.2]} castShadow>
        <boxGeometry args={[0.14, 0.2, 0.5]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.04, 0.7]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.55]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  )
}

export interface WeaponProps {
  mode: WeaponMode
  accent: string
  /** weapon GLB url when listed in the manifest, else undefined */
  url: string | undefined
  length?: number
  position: [number, number, number]
  rotation: [number, number, number]
}

export function Weapon({ mode, accent, url, length, position, rotation }: WeaponProps) {
  const inst = useGlbInstance(url)
  const fitted = useMemo(() => {
    if (!inst) return null
    inst.updateMatrixWorld(true)
    const b = new Box3().setFromObject(inst)
    if (b.isEmpty()) return null
    const longest = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1e-6)
    const g = new Group()
    g.add(inst)
    g.scale.setScalar((length ?? NOMINAL_LENGTH[mode]) / longest)
    return g
  }, [inst, length, mode])
  return (
    <group position={position} rotation={rotation} name="weapon">
      {fitted ? <primitive object={fitted} /> : <StandIn mode={mode} accent={accent} />}
    </group>
  )
}
