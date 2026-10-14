// Procedural looks for scenario pieces that have no model: flat hazard pools, school walls, the roadside diner and
// shipping containers. Local space (origin at the footprint centre, y up); the caller applies position and rotation.
import { Line } from '@react-three/drei'
import type { ReactElement } from 'react'
import { PALETTE } from '../theme'
import { idVariant } from './terrainFit'

type V3 = [number, number, number]
const Box = ({ p, s, c, r = 0.8, m = 0, e }: { p: V3; s: V3; c: string; r?: number; m?: number; e?: string }) => (
  <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} /><meshStandardMaterial color={c} roughness={r} metalness={m} {...(e ? { emissive: e, emissiveIntensity: 0.5 } : {})} />
  </mesh>
)

/** A flat glowing radiation / acid pool: lit rectangle with a bright edge and a few brighter blotches. */
export function HazardPatch({ w, d }: { w: number; d: number }) {
  const edge: V3[] = [[-w / 2, 0.045, -d / 2], [w / 2, 0.045, -d / 2], [w / 2, 0.045, d / 2], [-w / 2, 0.045, d / 2], [-w / 2, 0.045, -d / 2]]
  const blots: [number, number, number][] = [[-0.25, -0.2, 0.22], [0.2, 0.15, 0.28], [0.33, -0.28, 0.14], [-0.3, 0.3, 0.16]]
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#3fa52a" emissive="#35c81c" emissiveIntensity={0.8} transparent opacity={0.78} depthWrite={false} />
      </mesh>
      {blots.map(([x, z, r], i) => (
        <mesh key={i} position={[x * w, 0.04, z * d]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * Math.min(w, d), 20]} />
          <meshBasicMaterial color="#9af04a" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}
      <Line points={edge} color="#b6ff6a" lineWidth={2.5} />
    </group>
  )
}

/** Low brick school wall with a concrete cap, a base course, pilasters and a faded painted band. */
export function SchoolWall({ w, d, h }: { w: number; d: number; h: number }) {
  const n = Math.max(2, Math.round(w / 1.5))
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c="#9a5a3e" r={0.95} />
      <Box p={[0, 0.15, 0]} s={[w + 0.04, 0.3, d + 0.08]} c="#6b4634" r={1} />
      <Box p={[0, h * 0.55, 0]} s={[w + 0.02, 0.35, d + 0.03]} c="#d6c9a4" r={0.9} />
      <Box p={[0, h + 0.06, 0]} s={[w + 0.12, 0.12, d + 0.16]} c="#b8b2a4" r={0.9} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <Box key={i} p={[-w / 2 + (w * i) / n, h / 2, 0]} s={[0.24, h + 0.02, d + 0.18]} c="#85503a" r={1} />
      ))}
    </group>
  )
}

/** Low flat-roofed roadside diner: cream walls, red band, window strip, door and a rooftop sign. */
export function Diner({ w, d, h }: { w: number; d: number; h: number }) {
  const H = Math.min(h, 2.8)
  const front = d / 2 * 0.9
  return (
    <group>
      <Box p={[0, H / 2, 0]} s={[w * 0.92, H, d * 0.9]} c="#dccfae" r={0.85} />
      <Box p={[0, H * 0.78, 0]} s={[w * 0.93, 0.28, d * 0.91]} c="#b3342a" r={0.7} />
      <Box p={[0, H + 0.1, 0]} s={[w, 0.2, d]} c="#4a4a46" r={0.9} />
      <Box p={[0, H + 0.26, 0]} s={[w, 0.12, d]} c="#8d8b84" r={0.9} />
      {[-0.28, 0.18].map((fx, i) => (
        <Box key={i} p={[fx * w, H * 0.42, front + 0.01]} s={[w * 0.34, H * 0.4, 0.06]} c="#2c4a48" r={0.2} m={0.5} />
      ))}
      <Box p={[0.38 * w, H * 0.36, front + 0.02]} s={[0.7, H * 0.7, 0.07]} c="#7a3a22" r={0.7} />
      <Box p={[-w * 0.3, H + 0.75, 0]} s={[0.1, 1.1, 0.1]} c={PALETTE.steel} m={0.5} />
      <Box p={[-w * 0.3, H + 1.45, 0]} s={[1.5, 0.55, 0.12]} c="#b3342a" r={0.6} e="#5a1410" />
      <Box p={[0, 0.06, front + 0.5]} s={[w * 0.9, 0.12, 1]} c="#6e6a62" r={1} />
    </group>
  )
}

/** Rusted shipping container: corrugated sides, door-end frame with locking bars, corner posts. */
export function Container({ w, d, h, id }: { w: number; d: number; h: number; id: string }) {
  const tints = ['#8a4a2a', '#4a7a74', '#7a3a2e', '#5a6a4a']
  const body = tints[idVariant(id) % tints.length]!
  const ribs = Math.max(4, Math.floor(w / 0.7))
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c={body} r={0.7} m={0.25} />
      {Array.from({ length: ribs }, (_, i) => {
        const x = -w / 2 + 0.45 + ((w - 0.9) * i) / (ribs - 1)
        return (
          <group key={i}>
            <Box p={[x, h / 2, d / 2 + 0.03]} s={[0.12, h - 0.3, 0.06]} c={body} r={0.6} m={0.3} />
            <Box p={[x, h / 2, -d / 2 - 0.03]} s={[0.12, h - 0.3, 0.06]} c={body} r={0.6} m={0.3} />
          </group>
        )
      })}
      <Box p={[0, h + 0.03, 0]} s={[w + 0.05, 0.08, d + 0.05]} c="#3a3a38" r={0.8} m={0.3} />
      <Box p={[0, 0.06, 0]} s={[w + 0.05, 0.12, d + 0.05]} c="#3a3a38" r={0.8} m={0.3} />
      {[-1, 1].map((sx) => [-1, 1].map((sz) => (
        <Box key={`${sx}${sz}`} p={[sx * (w / 2), h / 2, sz * (d / 2)]} s={[0.16, h + 0.1, 0.16]} c="#34322e" r={0.8} m={0.4} />
      )))}
      {[-0.2, 0.2].map((bx, i) => <Box key={i} p={[w / 2 + 0.04, h / 2, bx * d]} s={[0.05, h * 0.85, 0.06]} c="#bcb7a8" r={0.4} m={0.7} />)}
    </group>
  )
}

/** Poured concrete barrier wall: formwork seams, tie holes, a capped top, a chipped base and rebar stubs. */
export function ConcreteWall({ w, d, h, id }: { w: number; d: number; h: number; id: string }) {
  const n = Math.max(2, Math.round(w / 2))
  const v = idVariant(id)
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c="#8d8c86" r={1} />
      <Box p={[0, 0.2, 0]} s={[w + 0.06, 0.4, d + 0.1]} c="#6f6e69" r={1} />
      <Box p={[0, h + 0.07, 0]} s={[w + 0.1, 0.14, d + 0.14]} c="#a29f96" r={0.95} />
      {Array.from({ length: n - 1 }, (_, i) => {
        const x = -w / 2 + (w * (i + 1)) / n
        return (
          <group key={i}>
            <Box p={[x, h / 2, d / 2 + 0.012]} s={[0.05, h, 0.03]} c="#55544f" r={1} />
            <Box p={[x, h / 2, -d / 2 - 0.012]} s={[0.05, h, 0.03]} c="#55544f" r={1} />
          </group>
        )
      })}
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + (w * (i + 0.5)) / n
        return [0.3, 0.7].map((fy) => [1, -1].map((sz) => (
          <Box key={`${i}-${fy}-${sz}`} p={[x, h * fy, sz * (d / 2 + 0.015)]} s={[0.1, 0.1, 0.03]} c="#4a4944" r={1} />
        )))
      })}
      {Array.from({ length: 3 }, (_, i) => (
        <Box key={`b${i}`} p={[-w / 2 + (((i * 7 + v) % 10) * w) / 11 + w / 22, h * 0.18 + (i % 2) * 0.35, d / 2 + 0.02]} s={[0.5, 0.3, 0.03]} c="#74726b" r={1} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <Box key={`r${i}`} p={[-w / 2 + (((i * 3 + v) % 9) * w) / 9 + w / 18, h + 0.3, 0]} s={[0.04, 0.32, 0.04]} c="#8a4a2a" m={0.4} r={0.6} />
      ))}
    </group>
  )
}

/** The procedural model for a pieceId with a custom look, or null (the generic box handles the rest). */
export function customTerrain(pieceId: string, id: string, w: number, d: number, h: number): ReactElement | null {
  switch (pieceId) {
    case 'hazard-zone': return <HazardPatch w={w} d={d} />
    case 'school-wall': return <SchoolWall w={w} d={d} h={h} />
    case 'impassable-wall': return <ConcreteWall w={w} d={d} h={h} id={id} />
    case 'diner': return <Diner w={w} d={d} h={h} />
    case 'shipping-container-rusted': return <Container w={w} d={d} h={h} id={id} />
    default: return null
  }
}
