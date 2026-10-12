// Presentation-driven figures (owner P). Mount inside the Board's <Canvas>. One figure per model from the PRESENTED
// state: faction tint, facing the nearest enemy, sliding along move tweens, tipped over when down, ring when active,
// damage and radiation pips on the base. DOM proxies for tests live in board/ModelProxies.tsx.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { tweenPosition, useGame, useModelIds, usePresented, usePresentedModel, useTween } from '../contract'
import { baseRadius } from '../../engine/geometry'
import { ProceduralFigure } from './Procedural'
import { facingYaw, lookOf, pipCounts, pipSlots, tintFor, turnToward } from './view'

const TURN_RATE = 9 // rad/s

function Pips({ id, r }: { id: string; r: number }) {
  const m = usePresentedModel(id)
  const { damage, rad } = m ? pipCounts(m) : { damage: 0, rad: 0 }
  const slots = useMemo(() => pipSlots(damage + rad, r + 0.12), [damage, rad, r])
  return (
    <group>
      {slots.map((p, i) => (
        <mesh key={i} position={[p.x, 0.16, p.z]}>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshStandardMaterial color={i < damage ? '#d04a2c' : '#8fd14f'} emissive={i < damage ? '#601808' : '#2f5a10'} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function Ring({ r }: { r: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} name="selection-ring">
      <ringGeometry args={[r + 0.12, r + 0.26, 40]} />
      <meshBasicMaterial color="#ffd866" transparent opacity={0.95} />
    </mesh>
  )
}

function Figure({ id, seatIndex }: { id: string; seatIndex: number }) {
  const m = usePresentedModel(id)
  const tween = useTween(id)
  const presented = usePresented()
  const invalidate = useThree((s) => s.invalidate)
  const outer = useRef<Group>(null)
  const body = useRef<Group>(null)
  const yaw = useRef<number | null>(null)
  const tip = useRef(0)

  useFrame((_, dt) => {
    if (!outer.current || !body.current || !m) return
    const p = tween ? tweenPosition(tween) : m.pos
    outer.current.position.set(p.x, m.elev, p.z)
    const want = facingYaw(presented, id, p)
    if (want !== null) {
      yaw.current = yaw.current === null ? want : turnToward(yaw.current, want, TURN_RATE * Math.min(dt, 0.1))
      body.current.rotation.y = yaw.current
      if (yaw.current !== want) invalidate()
    }
    const goal = m.life === 'down' ? 1 : 0
    tip.current += (goal - tip.current) * Math.min(1, dt * 10)
    if (Math.abs(goal - tip.current) < 0.01) tip.current = goal; else invalidate()
    body.current.rotation.x = -tip.current * (Math.PI / 2) * 0.96
    body.current.position.y = tip.current * 0.35
  })

  if (!m || lookOf(m) === 'gone') return null
  const [color, accent] = tintFor(seatIndex)
  const r = baseRadius(m.base)
  const active = presented?.activation?.modelId === id
  return (
    <group ref={outer} position={[m.pos.x, m.elev, m.pos.z]} name={`figure-${id}`}>
      {active && <Ring r={r} />}
      <group ref={body}>
        <ProceduralFigure id={id} x={0} z={0} baseMm={m.base} color={color} accent={accent} />
      </group>
      <Pips id={id} r={r} />
    </group>
  )
}

export function Figures() {
  const ids = useModelIds()
  const { state, seatOrder } = useGame()
  return (
    <>
      {ids.map((id) => {
        const owner = state?.models[id]?.owner
        return <Figure key={id} id={id} seatIndex={Math.max(0, owner ? seatOrder.indexOf(owner) : 0)} />
      })}
    </>
  )
}
