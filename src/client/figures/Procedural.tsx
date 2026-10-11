// Procedural placeholder figure: a base disc, legs, torso, head and a weapon bar. Replaced by Hunyuan3D GLBs in M5.
import { PALETTE } from '../theme'

const MM = 25.4
export interface FigureProps { id: string; x: number; z: number; baseMm: number; color: string; accent: string; heightIn?: number }

export function ProceduralFigure({ id, x, z, baseMm, color, accent, heightIn }: FigureProps) {
  const r = baseMm / MM / 2
  // About four and a half heads tall; height grows a little with base size.
  const h = heightIn ?? 1.45 + (baseMm - 25) * 0.045
  const head = h / 4.5
  return (
    <group position={[x, 0, z]} name={`model-${id}`} userData={{ id, x, z }}>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.04, 0.12, 32]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.28, 0.12 + h * 0.2, 0]} castShadow>
          <boxGeometry args={[r * 0.3, h * 0.4, r * 0.3]} />
          <meshStandardMaterial color={PALETTE.rustDark} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.12 + h * 0.58, 0]} castShadow>
        <boxGeometry args={[r * 0.95, h * 0.36, r * 0.55]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.12 + h * 0.86, 0]} castShadow>
        <sphereGeometry args={[head * 0.5, 16, 12]} />
        <meshStandardMaterial color={PALETTE.dust} roughness={0.9} />
      </mesh>
      <mesh position={[r * 0.55, 0.12 + h * 0.6, r * 0.3]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[r * 0.14, r * 0.14, h * 0.55]} />
        <meshStandardMaterial color={accent} roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}
