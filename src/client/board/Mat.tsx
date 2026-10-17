// The 3 ft x 3 ft dusty wasteland mat: tiled CC0 ground detail plus a macro tint layer (see groundMaterial.ts).
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { PALETTE } from '../theme'
import { makeGroundMaterial } from './groundMaterial'
import { tintFor } from './themes'

export function Mat({ w, d, theme }: { w: number; d: number; theme?: string | null }) {
  const gl = useThree((s) => s.gl)
  const material = useMemo(() => makeGroundMaterial(w, d, gl, tintFor(theme)), [w, d, gl, theme])
  useEffect(() => () => material.dispose(), [material])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="mat" material={material}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.5, d + 1.2]} />
        <meshStandardMaterial color={PALETTE.rustDark} roughness={0.9} />
      </mesh>
    </group>
  )
}
