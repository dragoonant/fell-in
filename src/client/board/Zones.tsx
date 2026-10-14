// Deployment zones (every zone shape the engine uses, plus the legacy own-edge strips) and scenario markers
// (objectives, searchables, investigation tokens, route flags) from the presented state and the scenario record.
import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { Shape, Vector2 } from 'three'
import type { Colour } from '../../data/types'
import { frameOf, type Lookup, type ZoneSpec } from '../../engine/scenarios/spec'
import { worldShape } from '../../engine/terrain'
import { rulerInches, useBundle, usePresented } from '../contract'
import { tintFor } from '../figures/view'
import { deployZones } from './layout'
import { MarkerBody } from './MarkerObjects'
import { markerHidden } from './markerLook'
import { zonePolys, type ZonePoly } from './zoneShapes'

interface DrawZone { key: string; seatIndex: number; poly: ZonePoly; soft: boolean }

function ZoneFill({ z }: { z: DrawZone }) {
  const colour = tintFor(z.seatIndex)[0]
  const shape = useMemo(() => new Shape(z.poly.pts.map((p) => new Vector2(p.x, -p.z))), [z.poly])
  const line = useMemo(() => [...z.poly.pts, z.poly.pts[0]!].map((p) => [p.x, 0.03, p.z] as [number, number, number]), [z.poly])
  return (
    <group name={`zone-${z.seatIndex}`}>
      {z.poly.fill && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={colour} transparent opacity={z.soft ? 0.09 : 0.16} depthWrite={false} />
        </mesh>
      )}
      <Line points={line} color={colour} lineWidth={z.poly.fill ? 1.2 : 2.4} transparent opacity={z.poly.fill ? 0.55 : 0.85} dashed={!z.poly.fill} dashSize={0.5} gapSize={0.3} />
    </group>
  )
}

export function Zones() {
  const state = usePresented()
  const bundle = useBundle()
  const zones = useMemo<DrawZone[]>(() => {
    if (!state || !bundle) return []
    const def = bundle.records.scenarios.find((s) => s.id === state.scenarioId)
    if (!def) return []
    const f = frameOf(state)
    const lookup: Lookup = (name) => {
      const t = state.terrain.find((x) => x.id === name)
      if (t) return { ...t.pos }
      const mk = state.markers.find((x) => x.id === name || x.face === name)
      return mk ? { ...mk.pos } : null
    }
    const shapeOf = (id: string) => { const t = state.terrain.find((x) => x.id === id); return t ? worldShape(t) : null }
    const out: DrawZone[] = []
    state.seatOrder.forEach((seat, seatIndex) => {
      const dep = def.sides.find((sd) => sd.id === state.seats[seat]?.side)?.deploy as { zone?: ZoneSpec; groups?: { zone: ZoneSpec; enters?: unknown }[]; within?: unknown } | undefined
      if (!dep) return
      const specs: { zone: ZoneSpec; soft: boolean }[] = []
      if (dep.zone && typeof dep.zone === 'object') specs.push({ zone: dep.zone, soft: false })
      for (const g of dep.groups ?? []) if (g.zone) specs.push({ zone: g.zone, soft: g.enters !== undefined })
      specs.forEach((s, i) => zonePolys(bundle, f, s.zone, lookup, shapeOf).forEach((poly, k) => out.push({ key: `${seat}-${i}-${k}`, seatIndex, poly, soft: s.soft })))
      if (specs.length === 0) {
        // Legacy record: { within: <ruler colour>, of: 'own edge' }, seat 0 on the near edge, seat 1 on the far one.
        for (const r of deployZones(f, seatIndex < 2 ? [...Array(seatIndex).fill(null), dep] : [], (c) => rulerInches(c as Colour))) {
          out.push({ key: `${seat}-legacy`, seatIndex, soft: false, poly: { fill: true, pts: [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }] } })
        }
      }
    })
    return out
  }, [state?.scenarioId, state?.seatOrder, state?.seats, state?.scenario.table, state?.terrain, bundle]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {zones.map((z) => <ZoneFill key={z.key} z={z} />)}
      {(state?.markers ?? []).map((mk) => {
        const holder = mk.carriedBy ? state?.models[mk.carriedBy] : undefined
        if (holder?.offTable || markerHidden(mk)) return null
        const p = holder ? holder.pos : mk.pos
        const y = holder ? 1.9 : 0
        return (
          <group key={mk.id} position={[p.x, y, p.z]} name={`marker-${mk.id}`}>
            <MarkerBody mk={mk} />
          </group>
        )
      })}
    </group>
  )
}
