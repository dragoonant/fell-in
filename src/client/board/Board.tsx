import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PALETTE } from '../theme'
import { useStore, type CameraPreset } from '../store'
import { Mat } from './Mat'
import { TerrainPieces } from './Terrain'
import { ProceduralFigure } from '../figures/Procedural'

// Camera presets: [position, target]. The human seat is the near edge (+z).
export const PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 30, 38], target: [0, 0, 2] },
  near: { pos: [0, 14, 30], target: [0, 0, 6] },
  far: { pos: [0, 18, -30], target: [0, 0, -4] },
  top: { pos: [0, 62, 0.01], target: [0, 0, 0] },
}

type OrbitRef = { target: { set: (x: number, y: number, z: number) => void }; update: () => void }

function CameraRig() {
  const { camera } = useThree()
  const controls = useRef<OrbitRef | null>(null)
  const preset = useStore((s) => s.preset)
  const tick = useStore((s) => s.presetTick)
  useEffect(() => {
    const p = PRESETS[preset]
    camera.position.set(...p.pos)
    controls.current?.target.set(...p.target)
    controls.current?.update()
  }, [preset, tick, camera])
  return <OrbitControls ref={controls as never} makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={8} maxDistance={80} />
}

export function Board() {
  const game = useStore((s) => s.game)
  const { w, d } = game.scenario.table
  return (
    <Canvas shadows camera={{ fov: 42, position: PRESETS.overview.pos }} gl={{ preserveDrawingBuffer: true }} data-testid="board">
      <color attach="background" args={['#241d15']} />
      <fog attach="fog" args={['#241d15', 70, 140]} />
      <hemisphereLight args={['#f1dfb8', '#4a3826', 0.9]} />
      <directionalLight position={[18, 36, 14]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
        shadow-camera-left={-28} shadow-camera-right={28} shadow-camera-top={28} shadow-camera-bottom={-28} />
      <Mat w={w} d={d} />
      <TerrainPieces terrain={game.terrain} />
      {Object.values(game.models).map((m) => (
        <ProceduralFigure key={m.id} id={m.id} x={m.pos.x} z={m.pos.z} baseMm={m.base}
          color={m.owner === 'A' ? PALETTE.teal : PALETTE.rust} accent={m.owner === 'A' ? PALETTE.dust : PALETTE.steel} />
      ))}
      <CameraRig />
    </Canvas>
  )
}
