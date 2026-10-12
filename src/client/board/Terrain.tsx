// Procedural placeholder terrain, one look per piece id. The engine only reads the rules type; the mesh is cosmetic.
import { PALETTE } from '../theme'
import { useMemo } from 'react'
import { Shape, Vector2 } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { TerrainInstance } from '../../engine/types'
import { usePresented } from '../contract'
import { clearTerrainHover, hoverTerrain } from './terrainHover'

/** Terrain from the presented state (spell-made pieces appear and vanish with it). */
export function TerrainPieces() {
  const terrain = usePresented()?.terrain
  return useMemo(() => <>{(terrain ?? []).map((t) => <TerrainPiece key={t.id} t={t} />)}</>, [terrain])
}

function TerrainHit({ t, children, ...rest }: { t: TerrainInstance; children: React.ReactNode; position: [number, number, number]; rotation?: [number, number, number]; name: string }) {
  return (
    <group {...rest}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { hoverTerrain(t.id, e.nativeEvent.clientX, e.nativeEvent.clientY) }}
      onPointerOut={() => clearTerrainHover(t.id)}>
      {children}
    </group>
  )
}

const BARREL_OFFSETS: [number, number][] = [[0, 0], [0.7, 0.5], [-0.6, 0.6], [0.1, -0.8]]

function TerrainPiece({ t }: { t: TerrainInstance }) {
  const { x, z } = t.pos
  const f = t.footprint
  const key = `${t.pieceId} ${t.id}`
  if ('circle' in f) {
    const r = f.circle.r
    return (
      <TerrainHit t={t} position={[x, 0, z]} name={`terrain-${t.id}`}>
        {BARREL_OFFSETS.map(([dx, dz], i) => (
          <mesh key={i} position={[dx * r * 0.5, t.height / 2 - (i === 0 ? 0 : 0.3), dz * r * 0.5]} castShadow receiveShadow>
            <cylinderGeometry args={[r * 0.38, r * 0.38, t.height - (i === 0 ? 0 : 0.6), 14]} />
            <meshStandardMaterial color={i % 2 ? PALETTE.teal : PALETTE.rust} roughness={0.7} metalness={0.3} />
          </mesh>
        ))}
      </TerrainHit>
    )
  }
  if ('rect' in f) {
    const { w, d } = f.rect
    const color = key.includes('wreck') ? PALETTE.tealDark : key.includes('wall') ? PALETTE.sandDark : key.includes('crates') ? PALETTE.rust : PALETTE.steel
    const rubble = t.rulesType === 'rubble'
    return (
      <TerrainHit t={t} position={[x, 0, z]} rotation={[0, t.rot, 0]} name={`terrain-${t.id}`}>
        <mesh position={[0, t.height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, t.height, d]} />
          <meshStandardMaterial color={color} roughness={rubble ? 1 : 0.8} metalness={key.includes('wreck') ? 0.4 : 0.05} />
        </mesh>
        {key.includes('wreck') && (
          <mesh position={[-w * 0.05, t.height + 0.45, 0]} castShadow>
            <boxGeometry args={[w * 0.5, 0.9, d * 0.85]} />
            <meshStandardMaterial color={PALETTE.rust} roughness={0.6} metalness={0.3} />
          </mesh>
        )}
        {key.includes('crates') && (
          <mesh position={[0.3, t.height + 0.6, 0.1]} rotation={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[w * 0.5, 1.2, d * 0.55]} />
            <meshStandardMaterial color={PALETTE.sandDark} roughness={0.85} />
          </mesh>
        )}
      </TerrainHit>
    )
  }
  if ('polygon' in f) return <TerrainHit t={t} position={[x, 0, z]} rotation={[0, t.rot, 0]} name={`terrain-${t.id}`}><PolyPrism pts={f.polygon} h={t.height} /></TerrainHit>
  return null
}

function PolyPrism({ pts, h }: { pts: { x: number; z: number }[]; h: number }) {
  const shape = useMemo(() => new Shape(pts.map((p) => new Vector2(p.x, -p.z))), [pts])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, { depth: h, bevelEnabled: false }]} />
      <meshStandardMaterial color={PALETTE.steel} roughness={0.9} />
    </mesh>
  )
}
