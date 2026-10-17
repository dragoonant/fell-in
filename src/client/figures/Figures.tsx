// Presentation-driven figures (owner P). Mount inside the Board's <Canvas>. One figure per model from the PRESENTED
// state: faction tint, facing the nearest enemy, sliding along move tweens, tipped over when down, ring when active,
// damage and radiation pips on the base. DOM proxies for tests live in board/ModelProxies.tsx.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { tweenPosition, useBundle, useGame, useModelIds, usePresented, usePresentedModel, useTween } from '../contract'
import { baseRadius } from '../../engine/geometry'
import { engagedWith } from '../../engine/attack'
import { recordOf } from '../../engine/edition'
import { ProceduralFigure } from './Procedural'
import { GlbBase, GlbBody, useFittedFigure } from './GlbBody'
import { glbStatus, useGlbStatus } from './glbLoader'
import { NOMINAL_LENGTH, Weapon } from './Weapon'
import { isNaturalWeapon, modeOfWeapon, pickEquipped, weaponClassOf, type WeaponClass, type WeaponMode } from './equipped'
import { aimedPose, figureHeight, heldPose, poseFor, poseGlbUrl, readyPose, socketFor, unitGlbUrl, useManifest, weaponGlbUrl } from './glbModels'
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

/** Generated GLB when listed and loaded, else the bare procedural figure. */
export function FigureBody({ id, slug, baseMm, color, accent, profile, cls }: { id: string; slug: string | undefined; baseMm: number; color: string; accent: string; profile?: string; cls?: WeaponClass }) {
  const manifest = useManifest()
  const entry = slug ? manifest.units[slug] : undefined
  const pose = poseFor(manifest, slug, cls)
  const base = useFittedFigure(slug ? unitGlbUrl(slug) : undefined, entry?.height || figureHeight(baseMm), entry?.yaw ?? 0)
  // The pose GLB (loaded lazily, only when a weapon of that class is held) is fitted like the default; until it is ready the default shows.
  const posed = useFittedFigure(pose ? poseGlbUrl(pose.file) : undefined, pose?.height || entry?.height || figureHeight(baseMm), pose?.yaw ?? entry?.yaw ?? 0)
  const group = posed ?? base
  if (!group) return <ProceduralFigure id={id} x={0} z={0} baseMm={baseMm} color={color} accent={accent} bare profile={profile ?? slug} />
  return (
    <group name={`model-${id}`} userData={{ id, x: 0, z: 0 }}>
      <GlbBase baseMm={baseMm} color={color} />
      <GlbBody group={group} />
    </group>
  )
}

/** The weapon in the unit's hand socket (bigger figures carry proportionally bigger guns), or nothing: no weapon, a natural attack, or a unit without a hand socket. */
export function HeldWeapon({ profileId, baseMm, weaponId, mode, accent }: { profileId: string; baseMm: number; weaponId: string | undefined; mode: WeaponMode; accent: string }) {
  const manifest = useManifest()
  const bundle = useBundle()
  const held = !!weaponId && !isNaturalWeapon(weaponId)
  const def = held && bundle ? (recordOf(bundle, 'weapons', weaponId) as Parameters<typeof weaponClassOf>[1]) : undefined
  const cls = held ? weaponClassOf(weaponId, def) : undefined
  // Until the pose GLB is ready the default figure shows, so the weapon sits at its HOLDS transform (never hidden); then swap.
  const wanted = poseFor(manifest, profileId, cls)
  useGlbStatus(wanted ? poseGlbUrl(wanted.file) : undefined)
  const sock = held ? socketFor(manifest, profileId, baseMm) : undefined
  if (!weaponId || !held || !sock) return null
  const pe = readyPose(manifest, profileId, cls, glbStatus)
  const pose = pe ? aimedPose(pe.hand, pe.support) : heldPose(cls!, sock.hand, sock.rot)
  return (
    <Weapon mode={mode} accent={accent} url={manifest.weapons[weaponId] ? weaponGlbUrl(weaponId) : undefined}
      length={(manifest.weapons[weaponId]?.length ?? NOMINAL_LENGTH[mode]) * Math.max(1, figureHeight(baseMm) / figureHeight(32))}
      position={pose.position} rotation={pose.rotation} />
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
  const manifest = useManifest()
  const bundle = useBundle()

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
  // Only slugs listed in the manifest are ever requested (no 404s); unit slug = unit id, weapon slug = weapon id.
  const unitSlug = manifest.units[m.profileId] ? m.profileId : undefined
  const mode = presented && engagedWith(presented, id).length > 0 ? 'melee' : 'ranged'
  const defOf = (d: string) => (bundle ? recordOf(bundle, 'weapons', d) : undefined) as Parameters<typeof modeOfWeapon>[0] & { natural?: unknown; flags?: unknown }
  const weaponId = pickEquipped(m.carried, (d) => modeOfWeapon(defOf(d)), mode, (d) => isNaturalWeapon(d, defOf(d)))
  const cls = weaponId && !isNaturalWeapon(weaponId) ? weaponClassOf(weaponId, bundle ? (recordOf(bundle, 'weapons', weaponId) as Parameters<typeof weaponClassOf>[1]) : undefined) : undefined
  const weaponMode = (weaponId && bundle ? modeOfWeapon(recordOf(bundle, 'weapons', weaponId)) : undefined) ?? mode
  return (
    <group ref={outer} position={[m.pos.x, m.elev, m.pos.z]} name={`figure-${id}`}>
      {active && <Ring r={r} />}
      <group ref={body}>
        <FigureBody id={id} slug={unitSlug} baseMm={m.base} color={color} accent={accent} profile={m.profileId} cls={cls} />
        <HeldWeapon profileId={m.profileId} baseMm={m.base} weaponId={weaponId} mode={weaponMode} accent={accent} />
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
