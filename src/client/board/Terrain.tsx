// Procedural placeholder terrain, one look per piece id. The engine only reads the rules type; the mesh is cosmetic.
import { PALETTE } from '../theme'
import type { TerrainInstance } from '@/engine/types'

export function TerrainPieces({ terrain }: { terrain: TerrainInstance[] }) {
  return <>{terrain.map((t) => <TerrainPiece key={t.id} t={t} />)}</>
}

const BARREL_OFFSETS: [number, number][] = [[0, 0], [0.7, 0.5], [-0.6, 0.6], [0.1, -0.8]]

function TerrainPiece({ t }: { t: TerrainInstance }) {
  const { x, z } = t.pos
  const f = t.footprint
  if ('circle' in f) {
    const r = f.circle.r
    return (
      <group position={[x, 0, z]} name={`terrain-${t.id}`}>
        {BARREL_OFFSETS.map(([dx, dz], i) => (
          <mesh key={i} position={[dx * r * 0.5, t.height / 2 - (i === 0 ? 0 : 0.3), dz * r * 0.5]} castShadow receiveShadow>
            <cylinderGeometry args={[r * 0.38, r * 0.38, t.height - (i === 0 ? 0 : 0.6), 14]} />
            <meshStandardMaterial color={i % 2 ? PALETTE.teal : PALETTE.rust} roughness={0.7} metalness={0.3} />
          </mesh>
        ))}
      </group>
    )
  }
  if ('rect' in f) {
    const { w, d } = f.rect
    const color = t.id === 'wreck' ? PALETTE.tealDark : t.id === 'wall' ? PALETTE.sandDark : t.id === 'crates' ? PALETTE.rust : PALETTE.steel
    const rubble = t.rulesType === 'rubble'
    return (
      <group position={[x, 0, z]} rotation={[0, t.rot, 0]} name={`terrain-${t.id}`}>
        <mesh position={[0, t.height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, t.height, d]} />
          <meshStandardMaterial color={color} roughness={rubble ? 1 : 0.8} metalness={t.id === 'wreck' ? 0.4 : 0.05} />
        </mesh>
        {t.id === 'wreck' && (
          <mesh position={[-w * 0.05, t.height + 0.45, 0]} castShadow>
            <boxGeometry args={[w * 0.5, 0.9, d * 0.85]} />
            <meshStandardMaterial color={PALETTE.rust} roughness={0.6} metalness={0.3} />
          </mesh>
        )}
        {t.id === 'crates' && (
          <mesh position={[0.3, t.height + 0.6, 0.1]} rotation={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[w * 0.5, 1.2, d * 0.55]} />
            <meshStandardMaterial color={PALETTE.sandDark} roughness={0.85} />
          </mesh>
        )}
      </group>
    )
  }
  return null
}
