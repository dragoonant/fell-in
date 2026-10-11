// The 3 ft x 3 ft dusty wasteland mat, textured procedurally on a canvas (no binary assets).
import { useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { PALETTE } from '../theme'

function makeTexture(): CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = PALETTE.sand
  g.fillRect(0, 0, size, size)
  // deterministic speckle (xorshift) so the mat looks the same on every load
  let s = 0x9e3779b9
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000 }
  for (let i = 0; i < 5200; i++) {
    const t = rnd()
    g.fillStyle = t < 0.4 ? 'rgba(124,98,60,0.18)' : t < 0.7 ? 'rgba(236,222,186,0.16)' : t < 0.9 ? 'rgba(164,80,44,0.12)' : 'rgba(79,138,130,0.10)'
    const r = 1 + rnd() * 5
    g.beginPath(); g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2); g.fill()
  }
  g.strokeStyle = 'rgba(80,60,34,0.22)'; g.lineWidth = 1
  for (let i = 0; i < 38; i++) {
    let x = rnd() * size, y = rnd() * size
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y) }
    g.stroke()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}

export function Mat({ w, d }: { w: number; d: number }) {
  const map = useMemo(makeTexture, [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="mat">
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={map} roughness={1} />
      </mesh>
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.5, d + 1.2]} />
        <meshStandardMaterial color={PALETTE.rustDark} roughness={0.9} />
      </mesh>
    </group>
  )
}
