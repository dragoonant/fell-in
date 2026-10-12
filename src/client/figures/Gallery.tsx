// ?gallery: every unit figure in a row on one table, each holding its default starter weapon, for checking poses,
// facing and hand sockets. The view buttons turn every figure in place (front, three-quarter, side) so the row never
// overlaps; the focus buttons move the camera onto one figure for a close-up. Orbit with the mouse as usual.
import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { FigureBody, HeldWeapon } from './Figures'
import { tintFor } from './view'
import type { WeaponMode } from './equipped'

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
]

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
    const x = focus === null ? 0 : xOf(focus)
    const y = focus === null ? 1.2 : 1.25
    const dist = focus === null ? 44 : 6.5
    camera.position.set(x, y + (focus === null ? 1.5 : 0.4), dist)
    camera.lookAt(x, y, 0)
    if (controls) { controls.target.set(x, y, 0); controls.update() }
    invalidate()
  }, [focus, camera, controls, invalidate])
  return null
}

export function Gallery() {
  const [view, setView] = useState<GalleryView>('front')
  const [focus, setFocus] = useState<number | null>(null)
  const yaw = GALLERY_VIEWS[view]
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2a2520' }} data-testid="gallery">
      <Canvas frameloop="demand" dpr={[1, 2]} shadows camera={{ fov: 30, position: [0, 2.7, 44] }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#2a2520']} />
        <hemisphereLight args={['#f1dfb8', '#4a3826', 1.0]} />
        <directionalLight position={[8, 20, 18]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={8} shadow-camera-bottom={-8} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[44, 10]} />
          <meshStandardMaterial color="#8a7454" roughness={0.95} />
        </mesh>
        {GALLERY.map((g, i) => {
          const [color, accent] = tintFor(g.seat)
          return (
            <group key={g.id} position={[xOf(i), 0, 0]} rotation={[0, yaw, 0]} name={`gallery-${g.id}`}>
              <FigureBody id={`gallery-${g.id}`} slug={g.id} baseMm={g.baseMm} color={color} accent={accent} />
              <HeldWeapon profileId={g.id} baseMm={g.baseMm} weaponId={g.weapon} mode={g.mode} accent={accent} />
            </group>
          )
        })}
        <OrbitControls makeDefault />
        <CameraRig focus={focus} />
      </Canvas>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 'calc(100vw - 16px)' }}>
        {(Object.keys(GALLERY_VIEWS) as GalleryView[]).map((v) => (
          <button key={v} type="button" data-testid={`gallery-cam-${v}`} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>
        ))}
        <button type="button" data-testid="gallery-focus-all" aria-pressed={focus === null} onClick={() => setFocus(null)}>all</button>
        {GALLERY.map((g, i) => (
          <button key={g.id} type="button" data-testid={`gallery-focus-${g.id}`} aria-pressed={focus === i} onClick={() => setFocus(i)}>{g.id}</button>
        ))}
      </div>
    </div>
  )
}
