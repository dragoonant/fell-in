// ?gallery: every unit figure in a row on one table, each holding its default starter weapon, for checking poses,
// facing and hand sockets. The view buttons turn every figure in place (front, three-quarter, side) so the row never
// overlaps; the focus buttons move the camera onto one figure for a close-up. Orbit with the mouse as usual.
import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { FigureBody, HeldWeapon } from './Figures'
import { tintFor } from './view'
import { OBJECT_FACES, ObjectModel } from './ObjectModels'
import type { WeaponClass, WeaponMode } from './equipped'
import { useBundle } from '../contract'
import { recordOf } from '../../engine/edition'
import { weaponClassOf } from './equipped'
import { poseFor, setPosesEnabled, useManifest } from './glbModels'

if (typeof location !== 'undefined') setPosesEnabled(!new URLSearchParams(location.search).has('nopose'))


/** Default weapon per unit: the first ranged weapon in its scenario starting loadouts (data/1e/scenarios), the brute's
 * sledgehammer, and the beasts' natural attacks (which draw nothing). */
export const GALLERY: { id: string; baseMm: number; seat: number; weapon: string; mode: WeaponMode }[] = [
  { id: 'sole-survivor', baseMm: 32, seat: 0, weapon: 'hunting-rifle', mode: 'ranged' },
  { id: 'sole-survivor-day-one', baseMm: 32, seat: 0, weapon: '10mm-pistol', mode: 'ranged' },
  { id: 'settler', baseMm: 32, seat: 0, weapon: 'laser-rifle', mode: 'ranged' },
  { id: 'enslaved-tech', baseMm: 32, seat: 0, weapon: 'combat-shotgun', mode: 'ranged' },
  { id: 'dogmeat', baseMm: 32, seat: 0, weapon: 'dog-bite', mode: 'melee' },
  { id: 'aspirant-goddard', baseMm: 40, seat: 0, weapon: 'plasma-rifle', mode: 'ranged' },
  { id: 'super-mutant', baseMm: 40, seat: 1, weapon: 'bolt-action-pipe-rifle', mode: 'ranged' },
  { id: 'brute', baseMm: 40, seat: 1, weapon: 'sledgehammer', mode: 'melee' },
  { id: 'aviator', baseMm: 40, seat: 1, weapon: 'pipe-pistol', mode: 'ranged' },
  { id: 'mutant-hound', baseMm: 40, seat: 1, weapon: 'hound-bite', mode: 'melee' },
  { id: 'deathclaw', baseMm: 50, seat: 1, weapon: 'deathclaw-swipe', mode: 'melee' },
  { id: 'knight', baseMm: 40, seat: 0, weapon: 'laser-rifle', mode: 'ranged' },
  { id: 'initiate', baseMm: 32, seat: 0, weapon: 'laser-pistol', mode: 'ranged' },
  { id: 'scribe', baseMm: 25, seat: 0, weapon: 'laser-pistol', mode: 'ranged' },
  { id: 'paladin', baseMm: 40, seat: 0, weapon: 'laser-rifle', mode: 'ranged' },
  { id: 't-60-goddard', baseMm: 40, seat: 0, weapon: 'plasma-rifle', mode: 'ranged' },
  { id: 'turret', baseMm: 40, seat: 1, weapon: 'minigun', mode: 'ranged' },
]

/** Every objective object face, drawn in a second row behind the figures (review the models here). */
export const GALLERY_OBJECTS: readonly string[] = OBJECT_FACES
const OBJ_Z = -4.5
const objX = (i: number) => (i - (GALLERY_OBJECTS.length - 1) / 2) * SPACING

/** Weapon picker: one representative weapon per hold class, forced onto every figure so pose pilots can be reviewed. */
export const CLASS_WEAPONS: Record<WeaponClass, { weapon: string; mode: WeaponMode }> = {
  pistol: { weapon: '10mm-pistol', mode: 'ranged' },
  long: { weapon: 'hunting-rifle', mode: 'ranged' },
  heavy: { weapon: 'minigun', mode: 'ranged' },
  melee1: { weapon: 'baseball-bat', mode: 'melee' },
  melee2: { weapon: 'sledgehammer', mode: 'melee' },
  thrown: { weapon: 'fragmentation-grenade', mode: 'ranged' },
}

const SPACING = 3.4
const xOf = (i: number) => (i - (GALLERY.length - 1) / 2) * SPACING

/** Figure yaw per view: the camera stays in front (+z); figures turn to show their left side (where most fists are). */
export const GALLERY_VIEWS = { front: 0, 'three-quarter': -0.65, side: -Math.PI / 2 } as const
export type GalleryView = keyof typeof GALLERY_VIEWS

function CameraRig({ focus }: { focus: number | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: { set(x: number, y: number, z: number): void }; update(): void } | null
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const isObj = focus !== null && focus >= GALLERY.length
    const x = focus === null ? 0 : isObj ? objX(focus - GALLERY.length) : xOf(focus)
    const y = focus === null ? 1.2 : 1.25
    const dist = focus === null ? 74 : 6.5
    const z0 = isObj ? OBJ_Z : 0
    camera.position.set(x, y + (focus === null ? 1.5 : 0.4), z0 + dist)
    camera.lookAt(x, y, z0)
    if (controls) { controls.target.set(x, y, z0); controls.update() }
    invalidate()
  }, [focus, camera, controls, invalidate])
  return null
}

function GalleryFigure({ g, x, yaw, pick }: { g: (typeof GALLERY)[number]; x: number; yaw: number; pick: WeaponClass | null }) {
  const bundle = useBundle()
  const manifest = useManifest()
  const [color, accent] = tintFor(g.seat)
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('weapon') : null // review hook: ?weapon=<id> on every figure
  const weapon = forced || (pick ? CLASS_WEAPONS[pick].weapon : g.weapon)
  const mode = forced ? 'ranged' : pick ? CLASS_WEAPONS[pick].mode : g.mode
  const cls = weapon && !/bite|swipe|crush|claw/i.test(weapon)
    ? weaponClassOf(weapon, bundle ? (recordOf(bundle, 'weapons', weapon) as Parameters<typeof weaponClassOf>[1]) : undefined) : undefined
  const pe = poseFor(manifest, g.id, cls)
  const marks = typeof location !== 'undefined' && new URLSearchParams(location.search).has('marks') // review hook: dots at the pose sockets (red hand, blue support)
  return (
    <group position={[x, 0, 0]} rotation={[0, yaw, 0]} name={`gallery-${g.id}`}>
      <FigureBody id={`gallery-${g.id}`} slug={g.id} baseMm={g.baseMm} color={color} accent={accent} profile={g.id} cls={cls} />
      <HeldWeapon profileId={g.id} baseMm={g.baseMm} weaponId={weapon} mode={mode} accent={accent} />
      {marks && pe && ([['hand', pe.hand, '#ff2020'], ['support', pe.support, '#2060ff']] as const).map(([n, p, c]) => (<mesh key={n} position={p}><sphereGeometry args={[0.05, 12, 8]} /><meshBasicMaterial color={c} depthTest={false} /></mesh>))}
    </group>
  )
}

export function Gallery() {
  const [view, setView] = useState<GalleryView>('front')
  const [focus, setFocus] = useState<number | null>(null)
  const [pick, setPick] = useState<WeaponClass | null>(null)
  const yaw = GALLERY_VIEWS[view]
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2a2520' }} data-testid="gallery">
      <Canvas frameloop="demand" dpr={[1, 2]} shadows camera={{ fov: 30, position: [0, 2.7, 74] }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#2a2520']} />
        <hemisphereLight args={['#f1dfb8', '#4a3826', 1.0]} />
        <directionalLight position={[8, 20, 18]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={8} shadow-camera-bottom={-8} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[Math.max(44, GALLERY.length * SPACING + 4), 20]} />
          <meshStandardMaterial color="#8a7454" roughness={0.95} />
        </mesh>
        {GALLERY.map((g, i) => (
          <GalleryFigure key={g.id} g={g} x={xOf(i)} yaw={yaw} pick={pick} />
        ))}
        {GALLERY_OBJECTS.map((f, i) => (
          <group key={f} position={[objX(i), 0, OBJ_Z]} name={`gallery-object-${f}`}><ObjectModel face={f} revealed /></group>
        ))}
        <OrbitControls makeDefault />
        <CameraRig focus={focus} />
      </Canvas>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 'calc(100vw - 16px)' }}>
        {(Object.keys(GALLERY_VIEWS) as GalleryView[]).map((v) => (
          <button key={v} type="button" data-testid={`gallery-cam-${v}`} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>
        ))}
        {(Object.keys(CLASS_WEAPONS) as WeaponClass[]).map((c) => (
          <button key={c} type="button" data-testid={`gallery-weapon-${c}`} aria-pressed={pick === c} onClick={() => setPick(pick === c ? null : c)}>weapon: {c}</button>
        ))}
        <button type="button" data-testid="gallery-focus-all" aria-pressed={focus === null} onClick={() => setFocus(null)}>all</button>
        {GALLERY.map((g, i) => (
          <button key={g.id} type="button" data-testid={`gallery-focus-${g.id}`} aria-pressed={focus === i} onClick={() => setFocus(i)}>{g.id}</button>
        ))}
        {GALLERY_OBJECTS.map((f, i) => (
          <button key={f} type="button" data-testid={`gallery-focus-obj-${f}`} aria-pressed={focus === GALLERY.length + i} onClick={() => setFocus(GALLERY.length + i)}>{f}</button>
        ))}
      </div>
    </div>
  )
}
