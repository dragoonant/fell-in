// The 3D table (owner P). Demand frameloop, dpr capped at 1.5. Renders only from the PRESENTED state.
import { useEffect, type ReactElement } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimating, usePresented, usePresentedRev } from '../contract'
import { Figures } from '../figures/Figures'
import { InteractionScene } from '../interaction/Interaction'
import { CameraRig } from './Camera'
import { FpsMeter, FpsProbe, fpsEnabled } from './FpsMeter'
import { Mat } from './Mat'
import { ModelProxies, ProxySync } from './ModelProxies'
import { TerrainPieces } from './Terrain'
import { TerrainTooltip } from './TerrainTooltip'
import { Zones } from './Zones'
import { cameraPose } from './layout'

/** Keeps a demand canvas drawing: once per presented change, every frame while a beat or tween plays. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const rev = usePresentedRev()
  const animating = useAnimating()
  useEffect(() => { invalidate() }, [rev, animating, invalidate])
  useFrame(() => { if (animating) invalidate() })
  return null
}

const START = cameraPose('overview', { w: 36, d: 36 })

export function Board(): ReactElement {
  const table = usePresented()?.scenario.table ?? { w: 36, d: 36 }
  const fps = fpsEnabled()
  return (
    <div style={{ position: 'absolute', inset: 0 }} data-testid="board">
      <Canvas frameloop="demand" dpr={[1, 1.5]} shadows camera={{ fov: 42, position: START.pos }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#241d15']} />
        <fog attach="fog" args={['#241d15', 70, 140]} />
        <hemisphereLight args={['#f1dfb8', '#4a3826', 0.9]} />
        <directionalLight position={[18, 36, 14]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-28} shadow-camera-right={28} shadow-camera-top={28} shadow-camera-bottom={-28} />
        <Mat w={table.w} d={table.d} />
        <Zones />
        <TerrainPieces />
        <Figures />
        <InteractionScene />
        <CameraRig />
        <Invalidator />
        <ProxySync />
        {fps && <FpsProbe />}
      </Canvas>
      <ModelProxies />
      <TerrainTooltip />
      {fps && <FpsMeter />}
    </div>
  )
}
