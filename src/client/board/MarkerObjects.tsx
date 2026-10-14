// How one scenario marker looks on the table: the manifest GLB when the face has one (uniform scale, long side laid
// along the object's rotation), else the procedural model; patrol waypoints are small numbered flags.
import { useMemo } from 'react'
import { Box3, Group } from 'three'
import { Html } from '@react-three/drei'
import type { MarkerState } from '../../engine/types'
import { useGlbInstance } from '../figures/glbLoader'
import { objectGlbUrl, useManifest, type ObjectEntry } from '../figures/glbModels'
import { ObjectModel, objectKind, QuestionToken } from '../figures/ObjectModels'
import { PALETTE } from '../theme'
import { isRouteFlag, markerRect, objectEntryFor, routeLabel } from './markerLook'

function BoardGlb({ entry, rect }: { entry: ObjectEntry; rect: { length: number; yaw: number } | null }) {
  const inst = useGlbInstance(objectGlbUrl(entry.file))
  const fitted = useMemo(() => {
    if (!inst) return null
    const turned = new Group()
    turned.rotation.y = entry.yaw ?? 0
    inst.position.set(0, 0, 0)
    turned.add(inst)
    turned.updateMatrixWorld(true)
    let b = new Box3().setFromObject(turned)
    if (b.isEmpty()) return null
    // A long object lies along +x before its rotation is applied, whichever way the raw model points.
    if (rect && b.max.z - b.min.z > b.max.x - b.min.x) {
      turned.rotation.y += Math.PI / 2
      turned.updateMatrixWorld(true)
      b = new Box3().setFromObject(turned)
    }
    const long = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-6)
    const hgt = Math.max(b.max.y - b.min.y, 1e-6)
    const s = rect ? rect.length / long : entry.heightIn ? entry.heightIn / hgt : (entry.lengthIn ?? 1.2) / long
    const g = new Group()
    g.add(turned)
    g.scale.setScalar(s)
    g.position.set(-((b.min.x + b.max.x) / 2) * s, -b.min.y * s, -((b.min.z + b.max.z) / 2) * s)
    const outer = new Group()
    outer.add(g)
    outer.rotation.y = rect?.yaw ?? 0
    return outer
  }, [inst, entry.yaw, entry.heightIn, entry.lengthIn, rect?.length, rect?.yaw]) // eslint-disable-line react-hooks/exhaustive-deps
  return fitted ? <primitive object={fitted} /> : null
}

/** Small numbered flag for a patrol or route waypoint. */
export function RouteFlag({ label }: { label: string }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.025, 0.025, 0.9, 6]} /><meshStandardMaterial color={PALETTE.steel} metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[0.17, 0.78, 0]}><boxGeometry args={[0.34, 0.2, 0.02]} /><meshStandardMaterial color={PALETTE.rust} roughness={0.7} /></mesh>
      <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.12, 0.12, 0.04, 12]} /><meshStandardMaterial color={PALETTE.steel} roughness={0.8} /></mesh>
      {label && (
        <Html position={[0.17, 0.78, 0.05]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ font: '700 9px system-ui', color: '#fff3d6' }}>{label}</div>
        </Html>
      )}
    </group>
  )
}

/** Amber ground ring that keeps a small but important object (missile sled, mini nuke) findable among the figures. */
function Halo({ r }: { r: number }) {
  return (
    <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r * 0.86, r, 40]} /><meshBasicMaterial color="#ffcf4a" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}
const HALO: Record<string, number> = { 'missile-sled': 1.15, 'mini-nuke': 0.85 }

/** The body of one visible marker (position and hiding are handled by the caller). */
export function MarkerBody({ mk }: { mk: MarkerState }) {
  const halo = mk.face ? HALO[mk.face] : undefined
  return <>{halo ? <Halo r={halo} /> : null}<MarkerShape mk={mk} /></>
}

function MarkerShape({ mk }: { mk: MarkerState }) {
  const manifest = useManifest()
  if (isRouteFlag(mk)) return <RouteFlag label={routeLabel(mk)} />
  const rect = markerRect(mk)
  const face = mk.kind === 'searchable' ? 'crate' : mk.face
  const known = objectKind(face) !== 'unknown'
  const entry = mk.kind === 'object' ? objectEntryFor(manifest, mk.face) : undefined
  if (entry) return <BoardGlb entry={entry} rect={rect} />
  if (known && (mk.kind !== 'investigation' || mk.revealed || mk.face)) {
    return (
      <group rotation={[0, rect?.yaw ?? 0, 0]}>
        <ObjectModel face={face} revealed={mk.revealed} />
      </group>
    )
  }
  return <QuestionToken revealed={mk.revealed} />
}
