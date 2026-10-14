// Objective-object models for scenario markers. A face listed under "objects" in public/assets/models/manifest.json
// loads that GLB (fitted with ONE uniform scale); every other face is drawn from primitives in our own colours.
// Unknown faces get a labelled token, never a bare box. Y up, origin at the footprint centre on the table.
import { useMemo, type ReactElement } from 'react'
import { Box3, Group } from 'three'
import { useGlbInstance } from './glbLoader'
import { objectGlbUrl, useManifest, type ObjectEntry } from './glbModels'

type V3 = [number, number, number]
const Mat = ({ c, r = 0.7, m = 0 }: { c: string; r?: number; m?: number }) => <meshStandardMaterial color={c} roughness={r} metalness={m} />
const Box = ({ p, s, c, r, m, rot }: { p: V3; s: V3; c: string; r?: number; m?: number; rot?: V3 }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow><boxGeometry args={s} /><Mat c={c} r={r} m={m} /></mesh>
)
const Cyl = ({ p, a, h, c, r, m, rot, seg = 16 }: { p: V3; a: [number, number]; h: number; c: string; r?: number; m?: number; rot?: V3; seg?: number }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[a[0], a[1], h, seg]} /><Mat c={c} r={r} m={m} /></mesh>
)
const Ball = ({ p, r: rad, c, sy = 1 }: { p: V3; r: number; c: string; sy?: number }) => (
  <mesh position={p} scale={[1, sy, 1]} castShadow><sphereGeometry args={[rad, 16, 12]} /><Mat c={c} /></mesh>
)

const RUST = '#8a4a2a', GUN = '#4d5258', OLIVE = '#5f6a3c', CREAM = '#e6dcbc', RED = '#b3342a', WOOD = '#8a6a44', TIN = '#9a9a92'

function RedRocket() { // about 4 in retro rocket lying on its side
  return (
    <group position={[0, 0.5, 0]} rotation={[0, 0.3, 0]}>
      <Cyl p={[0, 0, 0]} a={[0.42, 0.42]} h={2.6} c={RED} r={0.45} m={0.3} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[1.6, 0, 0]} a={[0.02, 0.42]} h={1.1} c={RED} r={0.45} m={0.3} rot={[0, 0, -Math.PI / 2]} />
      <Cyl p={[-1.25, 0, 0]} a={[0.3, 0.42]} h={0.3} c={GUN} m={0.6} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[0.5, 0, 0]} a={[0.435, 0.435]} h={0.16} c={CREAM} rot={[0, 0, Math.PI / 2]} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[(i * Math.PI) / 2, 0, 0]}>
          <Box p={[-1.0, 0.62, 0]} s={[0.7, 0.55, 0.05]} c={CREAM} rot={[0, 0, -0.35]} />
        </group>
      ))}
      <Box p={[0, -0.5, 0]} s={[0.4, 0.14, 0.9]} c={WOOD} />
    </group>
  )
}
function PowerArmorSuit() { // empty upright suit, about 2 in tall, open back
  return (
    <group>
      <Cyl p={[0, 0.03, 0]} a={[0.55, 0.58]} h={0.06} c="#3b3f44" />
      {[-1, 1].map((s) => <Box key={s} p={[s * 0.2, 0.42, 0]} s={[0.22, 0.75, 0.26]} c={GUN} m={0.6} r={0.5} />)}
      {[-1, 1].map((s) => <Box key={'f' + s} p={[s * 0.2, 0.08, 0.1]} s={[0.26, 0.12, 0.4]} c={RUST} />)}
      <Box p={[0, 1.1, 0]} s={[0.78, 0.7, 0.5]} c="#5a6068" m={0.55} r={0.5} />
      <Box p={[0, 1.1, -0.27]} s={[0.56, 0.5, 0.04]} c="#1c1e20" />
      {[-1, 1].map((s) => (
        <group key={'a' + s}>
          <Box p={[s * 0.55, 1.3, 0]} s={[0.34, 0.26, 0.34]} c={RUST} m={0.4} />
          <Box p={[s * 0.58, 0.95, 0.04]} s={[0.2, 0.6, 0.22]} c={GUN} m={0.6} />
        </group>
      ))}
      <Box p={[0, 1.58, 0]} s={[0.46, 0.34, 0.42]} c="#5a6068" m={0.55} r={0.5} />
      <Box p={[0, 1.6, 0.22]} s={[0.36, 0.1, 0.02]} c="#d9a441" />
      <Box p={[0, 1.8, 0.04]} s={[0.1, 0.12, 0.3]} c={RUST} />
      <Box p={[0.38, 1.0, -0.3]} s={[0.12, 0.5, 0.12]} c={TIN} m={0.5} />
    </group>
  )
}
function MiniNuke() { // domed shell in an open crate
  return (
    <group>
      <Box p={[0, 0.17, 0]} s={[1.0, 0.34, 0.8]} c={WOOD} r={0.9} />
      <Box p={[0, 0.36, 0.41]} s={[1.0, 0.05, 0.04]} c="#6e5233" />
      <Cyl p={[0, 0.5, 0]} a={[0.3, 0.3]} h={0.4} c={OLIVE} m={0.3} />
      <Ball p={[0, 0.7, 0]} r={0.3} c={OLIVE} sy={0.9} />
      <Cyl p={[0, 0.5, 0]} a={[0.31, 0.31]} h={0.06} c="#d9c24a" />
      <Cyl p={[0, 0.9, 0]} a={[0.03, 0.03]} h={0.2} c={TIN} m={0.6} />
    </group>
  )
}
function MissileSled() { // low olive tracked platform with a finned warhead
  return (
    <group>
      <Box p={[0, 0.22, 0]} s={[2.0, 0.22, 0.9]} c={OLIVE} m={0.2} />
      {[-1, 1].map((s) => <Box key={s} p={[0, 0.14, s * 0.5]} s={[2.1, 0.28, 0.2]} c="#2c2f2a" r={0.95} />)}
      <Cyl p={[0, 0.58, 0]} a={[0.2, 0.2]} h={1.5} c={TIN} m={0.5} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[0.95, 0.58, 0]} a={[0.02, 0.2]} h={0.5} c={RED} rot={[0, 0, -Math.PI / 2]} />
      {[0, 1, 2, 3].map((i) => <group key={i} position={[0, 0.58, 0]} rotation={[(i * Math.PI) / 2, 0, 0]}><Box p={[-0.65, 0.28, 0]} s={[0.35, 0.3, 0.04]} c={RED} /></group>)}
    </group>
  )
}
function RadioTower() { // lattice mast about 3 in tall
  const h = 3
  return (
    <group>
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b], i) => (
        <Cyl key={i} p={[a! * 0.2, h / 2, b! * 0.2]} a={[0.02, 0.03]} h={h} c={RUST} m={0.4} seg={6} />
      ))}
      {[0.4, 1.0, 1.6, 2.2, 2.7].map((y) => <Box key={y} p={[0, y, 0]} s={[0.4 - y * 0.05, 0.03, 0.4 - y * 0.05]} c={RUST} />)}
      {[0.7, 1.3, 1.9, 2.45].map((y, i) => <Box key={y} p={[0, y, 0]} s={[0.46 - y * 0.06, 0.02, 0.02]} c={RUST} rot={[0, (i % 2) * 1.57, 0.6]} />)}
      <Cyl p={[0, h + 0.25, 0]} a={[0.015, 0.015]} h={0.5} c={TIN} />
      <Ball p={[0, h + 0.5, 0]} r={0.05} c="#d04a2c" />
      <Box p={[0, 0.1, 0]} s={[0.7, 0.2, 0.7]} c="#4d4a44" />
    </group>
  )
}
function Books() {
  const rows: [string, number, number, number][] = [['#7a2f2a', 0.9, 0.2, 0], ['#2f5a6a', 0.8, 0.16, 0.05], ['#6a5a2a', 0.85, 0.18, -0.04], ['#3a4a2a', 0.7, 0.14, 0.03]]
  return (
    <group>
      {rows.map(([c, w, h, dx], i) => <Box key={i} p={[dx, [0.1, 0.28, 0.45, 0.61][i]!, 0]} s={[w, h, 0.6]} c={c} rot={[0, (i - 1.5) * 0.12, 0]} />)}
    </group>
  )
}
function Captive() { // bound kneeling figure
  return (
    <group>
      <Cyl p={[0, 0.03, 0]} a={[0.5, 0.5]} h={0.06} c="#3b3f44" />
      <Box p={[0, 0.2, -0.1]} s={[0.4, 0.3, 0.5]} c="#5b4630" />
      <Box p={[0, 0.65, 0]} s={[0.42, 0.55, 0.28]} c="#6a6350" />
      <Ball p={[0, 1.08, 0.05]} r={0.16} c="#c8a27a" />
      <Box p={[0, 0.7, 0.01]} s={[0.46, 0.06, 0.32]} c="#a9884a" />
      <Box p={[0, 0.9, 0.16]} s={[0.3, 0.07, 0.02]} c={CREAM} />
      <Box p={[0.1, 0.45, 0.2]} s={[0.1, 0.4, 0.1]} c="#6a6350" rot={[0.5, 0, 0]} />
      <Box p={[-0.1, 0.45, 0.2]} s={[0.1, 0.4, 0.1]} c="#6a6350" rot={[0.5, 0, 0]} />
    </group>
  )
}
function Crate({ tint = WOOD, small = false }: { tint?: string; small?: boolean }) {
  return (
    <group scale={small ? 0.8 : 1}>
      <Box p={[0, 0.3, 0]} s={[1.0, 0.6, 0.7]} c={tint} r={0.9} />
      {[-0.4, 0.4].map((x) => <Box key={x} p={[x, 0.3, 0]} s={[0.07, 0.62, 0.72]} c="#4a3a26" />)}
      <Box p={[0, 0.62, 0]} s={[1.02, 0.05, 0.72]} c="#4a3a26" />
      <Box p={[0, 0.4, 0.36]} s={[0.14, 0.14, 0.03]} c="#d9c24a" m={0.5} />
    </group>
  )
}
function Footlocker() {
  return (
    <group>
      <Box p={[0, 0.2, 0]} s={[1.0, 0.4, 0.55]} c="#58623a" m={0.3} />
      <Cyl p={[0, 0.4, 0]} a={[0.275, 0.275]} h={1.0} c="#4d5632" m={0.3} rot={[0, 0, Math.PI / 2]} />
      <Box p={[0, 0.3, 0.29]} s={[0.12, 0.1, 0.03]} c={TIN} m={0.7} />
    </group>
  )
}
function ExitHatch() { // marked hatch token
  return (
    <group>
      <Cyl p={[0, 0.04, 0]} a={[0.6, 0.6]} h={0.08} c="#2f3a2c" r={0.9} />
      <Box p={[0, 0.1, 0]} s={[0.7, 0.04, 0.7]} c="#d9c24a" />
      <Box p={[0, 0.12, 0]} s={[0.56, 0.04, 0.56]} c="#2f3a2c" />
      <Box p={[0, 0.15, 0]} s={[0.5, 0.03, 0.1]} c="#d9c24a" rot={[0, 0.78, 0]} />
      <Box p={[0, 0.15, 0]} s={[0.5, 0.03, 0.1]} c="#d9c24a" rot={[0, -0.78, 0]} />
    </group>
  )
}
function CanObj() {
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} a={[0.22, 0.22]} h={0.6} c="#b7b2a0" m={0.6} r={0.45} />
      <Cyl p={[0, 0.32, 0]} a={[0.225, 0.225]} h={0.28} c="#a63a2c" />
      <Cyl p={[0, 0.61, 0]} a={[0.2, 0.2]} h={0.03} c={TIN} m={0.7} />
    </group>
  )
}
function MutFruitPlant() {
  return (
    <group>
      <Cyl p={[0, 0.15, 0]} a={[0.35, 0.4]} h={0.3} c="#4a3524" r={0.95} />
      <Cyl p={[0, 0.55, 0]} a={[0.04, 0.07]} h={0.6} c="#4f7a2c" />
      {[0, 1, 2, 3, 4].map((i) => <Box key={i} p={[Math.cos(i * 1.26) * 0.28, 0.75 + (i % 2) * 0.1, Math.sin(i * 1.26) * 0.28]} s={[0.32, 0.03, 0.14]} c="#5f9a34" rot={[0, -i * 1.26, 0.4]} />)}
      {[0, 1, 2].map((i) => <Ball key={i} p={[Math.cos(i * 2.1 + 0.5) * 0.17, 0.5, Math.sin(i * 2.1 + 0.5) * 0.17]} r={0.1} c="#c4522e" />)}
    </group>
  )
}
function MoleRatMound() {
  return (
    <group>
      <Ball p={[0, 0.1, 0]} r={0.65} c="#6a5236" sy={0.5} />
      <Ball p={[0.15, 0.2, 0.1]} r={0.2} c="#1f1710" sy={0.45} />
      {[0, 1, 2, 3, 4].map((i) => <Ball key={i} p={[Math.cos(i * 1.3) * 0.55, 0.04, Math.sin(i * 1.3) * 0.55]} r={0.07} c="#5a432b" />)}
    </group>
  )
}
function ChainObj() {
  return (
    <group>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[(i - 3) * 0.17, 0.08, (i % 2) * 0.03]} rotation={[(i % 2) * Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.08, 0.025, 6, 12]} /><Mat c={TIN} m={0.7} r={0.4} />
        </mesh>
      ))}
      <Box p={[0.6, 0.1, 0]} s={[0.2, 0.2, 0.2]} c={RUST} m={0.4} />
    </group>
  )
}
function Valve() {
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} a={[0.08, 0.1]} h={0.6} c={RUST} m={0.5} />
      <mesh position={[0, 0.65, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.28, 0.04, 8, 20]} /><Mat c={RED} m={0.3} /></mesh>
      <Box p={[0, 0.65, 0]} s={[0.56, 0.04, 0.04]} c={RED} />
      <Box p={[0, 0.65, 0]} s={[0.04, 0.04, 0.56]} c={RED} />
      <Box p={[0, 0.06, 0]} s={[0.7, 0.12, 0.7]} c="#4d4a44" />
    </group>
  )
}
function Hatch() { // round cast-iron manhole cover set in a rim: ribbed face, ring groove, two lift slots
  return (
    <group>
      <Cyl p={[0, 0.04, 0]} a={[0.66, 0.66]} h={0.08} c="#2e302d" m={0.3} r={0.9} seg={28} />
      <Cyl p={[0, 0.1, 0]} a={[0.55, 0.55]} h={0.06} c="#5a5e5e" m={0.55} r={0.5} seg={28} />
      <mesh position={[0, 0.135, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.46, 0.018, 6, 28]} /><Mat c="#3a3d3d" m={0.5} /></mesh>
      {[-0.3, -0.15, 0, 0.15, 0.3].map((z) => <Box key={z} p={[0, 0.14, z]} s={[2 * Math.sqrt(Math.max(0.1, 0.2 - z * z)), 0.02, 0.045]} c="#43474a" m={0.5} r={0.6} />)}
      {[-0.4, 0.4].map((x) => <Box key={x} p={[x, 0.14, 0]} s={[0.1, 0.02, 0.2]} c="#151616" />)}
    </group>
  )
}
/** Hidden investigation token: a plain disc with a big '?' lying flat on it. */
export function QuestionToken({ revealed = false }: { revealed?: boolean }) {
  return (
    <group>
      <Cyl p={[0, 0.05, 0]} a={[0.52, 0.52]} h={0.1} c={revealed ? '#4f8a82' : '#d8c49a'} r={0.75} seg={28} />
      <Cyl p={[0, 0.105, 0]} a={[0.42, 0.42]} h={0.02} c="#3a3226" r={0.8} seg={28} />
      {!revealed && (
        <group position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh position={[0, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]}><torusGeometry args={[0.13, 0.04, 8, 20, 5.06]} /><meshStandardMaterial color="#f1dfb8" roughness={0.6} /></mesh>
          <mesh position={[0, -0.08, 0]}><boxGeometry args={[0.08, 0.1, 0.04]} /><meshStandardMaterial color="#f1dfb8" roughness={0.6} /></mesh>
          <mesh position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.04, 12]} /><meshStandardMaterial color="#f1dfb8" roughness={0.6} /></mesh>
        </group>
      )}
    </group>
  )
}
/** Ammunition crate: olive steel box open on top showing rows of brass shells, a hazard stripe, tin cans beside it. */
function Munitions() {
  return (
    <group>
      <Box p={[0, 0.04, 0]} s={[1.0, 0.08, 0.7]} c="#4b5430" m={0.3} />
      <Box p={[0, 0.25, 0.34]} s={[1.0, 0.42, 0.04]} c="#58623a" m={0.3} />
      <Box p={[0, 0.25, -0.34]} s={[1.0, 0.42, 0.04]} c="#58623a" m={0.3} />
      {[-0.48, 0.48].map((x) => <Box key={x} p={[x, 0.25, 0]} s={[0.04, 0.42, 0.7]} c="#58623a" m={0.3} />)}
      {[0, 1, 2, 3].map((i) => [-0.14, 0.14].map((z) => (
        <group key={`${i}${z}`} position={[-0.33 + i * 0.22, 0.3, z]}>
          <Cyl p={[0, 0, 0]} a={[0.07, 0.07]} h={0.4} c="#c49a3c" m={0.7} r={0.35} seg={10} />
          <Cyl p={[0, 0.25, 0]} a={[0.01, 0.065]} h={0.12} c="#6b6f70" m={0.6} seg={10} />
        </group>
      )))}
      <Box p={[0, 0.3, 0.365]} s={[0.7, 0.1, 0.01]} c="#d9c24a" />
      <Box p={[0, 0.16, 0.365]} s={[0.7, 0.04, 0.01]} c={RED} />
      <Box p={[0.1, 0.72, -0.4]} s={[1.0, 0.05, 0.4]} c="#4d5632" m={0.3} rot={[-1.0, 0, 0]} />
      {[0, 1].map((i) => <Cyl key={i} p={[0.62 + i * 0.3, 0.2, 0.35 - i * 0.55]} a={[0.13, 0.13]} h={0.4} c="#b7b2a0" m={0.55} r={0.45} />)}
    </group>
  )
}
function KeyToken({ revealed }: { revealed: boolean }) {
  return (
    <group>
      <Cyl p={[0, 0.04, 0]} a={[0.45, 0.45]} h={0.08} c={revealed ? '#4f8a82' : '#d8c49a'} r={0.7} />
      <Cyl p={[0, 0.12, -0.12]} a={[0.1, 0.1]} h={0.05} c={TIN} m={0.7} />
      <Box p={[0, 0.12, 0.08]} s={[0.07, 0.04, 0.34]} c={TIN} m={0.7} />
    </group>
  )
}
/** Flat glowing pool for hazard zones. */
export function HazardPool({ r = 0.9, color = '#6bd04a' }: { r?: number; color?: string }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 32]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.9, r, 32]} /><meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}
/** Canonical object kind for a marker face (substring match). */
export function objectKind(face: string | undefined): string {
  const f = (face ?? '').toLowerCase()
  if (!f) return 'unknown'
  const rules: [RegExp, string][] = [
    [/red-?rocket|^rocket/, 'red-rocket'], [/power-?armor|^pa$|armor-suit/, 'power-armor-suit'], [/nuke/, 'mini-nuke'],
    [/sled|missile/, 'missile-sled'], [/radio|tower|antenna/, 'radio-tower'], [/book|holotape|tome/, 'book'],
    [/captive|prisoner|hostage/, 'captive'], [/munition/, 'munitions'], [/foot-?locker/, 'footlocker'],
    [/crate|box|supply|cache|^item/, 'crate'], [/exit/, 'exit'], [/^can$|nuka|soda/, 'can'],
    [/plant|fruit/, 'mut-fruit-plant'], [/mound|mole|^hole/, 'mole-rat-mound'], [/chain/, 'chain'], [/valve/, 'valve'],
    [/hatch|door|vault/, 'hatch'], [/key|route/, 'key'], [/hazard|pool|rad|acid|gas|fire/, 'hazard'],
  ]
  for (const [re, k] of rules) if (re.test(f)) return k
  return 'unknown'
}
/** Every object kind with a model, for the ?gallery review. */
export const OBJECT_FACES = ['red-rocket', 'power-armor-suit', 'mini-nuke', 'missile-sled', 'radio-tower', 'book', 'captive', 'crate', 'footlocker', 'munitions', 'exit', 'can', 'mut-fruit-plant', 'mole-rat-mound', 'chain', 'valve', 'hatch', 'key', 'hazard'] as const

function ProceduralObject({ kind, face, revealed }: { kind: string; face?: string; revealed?: boolean }): ReactElement {
  switch (kind) {
    case 'red-rocket': return <RedRocket />
    case 'power-armor-suit': return <PowerArmorSuit />
    case 'mini-nuke': return <MiniNuke />
    case 'missile-sled': return <MissileSled />
    case 'radio-tower': return <RadioTower />
    case 'book': return <Books />
    case 'captive': return <Captive />
    case 'crate': return <Crate />
    case 'munitions': return <Munitions />
    case 'footlocker': return <Footlocker />
    case 'exit': return <ExitHatch />
    case 'can': return <CanObj />
    case 'mut-fruit-plant': return <MutFruitPlant />
    case 'mole-rat-mound': return <MoleRatMound />
    case 'chain': return <ChainObj />
    case 'valve': return <Valve />
    case 'hatch': return <Hatch />
    case 'key': return <KeyToken revealed={!!revealed} />
    case 'hazard': return <HazardPool />
    default: return <QuestionToken revealed={!!revealed} />
  }
}

function GlbObject({ entry }: { entry: ObjectEntry }) {
  const inst = useGlbInstance(objectGlbUrl(entry.file))
  const fitted = useMemo(() => {
    if (!inst) return null
    const turned = new Group()
    turned.rotation.y = entry.yaw ?? 0
    inst.position.set(0, 0, 0)
    turned.add(inst)
    turned.updateMatrixWorld(true)
    const b = new Box3().setFromObject(turned)
    if (b.isEmpty()) return null
    const len = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-6)
    const hgt = Math.max(b.max.y - b.min.y, 1e-6)
    // One uniform scale from the requested height or longest side (default 1.2 in).
    const s = entry.heightIn ? entry.heightIn / hgt : (entry.lengthIn ?? 1.2) / len
    const g = new Group()
    g.add(turned)
    g.scale.setScalar(s)
    g.position.set(-((b.min.x + b.max.x) / 2) * s, -b.min.y * s, -((b.min.z + b.max.z) / 2) * s)
    return g
  }, [inst, entry.yaw, entry.heightIn, entry.lengthIn])
  return fitted ? <primitive object={fitted} /> : null
}

/** One objective object by marker face. GLB when listed under manifest "objects" (keyed by the face or its kind). */
export function ObjectModel({ face, revealed }: { face?: string; revealed?: boolean }) {
  const manifest = useManifest()
  const kind = objectKind(face)
  const entry = (face ? manifest.objects[face] : undefined) ?? manifest.objects[kind]
  if (entry) return <GlbObject entry={entry} />
  return <ProceduralObject kind={kind} face={face} revealed={revealed} />
}
