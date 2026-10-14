// Procedural placeholder figure: a base disc, legs, torso, head and a weapon bar. Replaced by Hunyuan3D GLBs in M5.
import { PALETTE } from '../theme'

const MM = 25.4
export interface FigureProps { id: string; x: number; z: number; baseMm: number; color: string; accent: string; heightIn?: number; /** omit the built-in weapon bar (weapons are separate models) */ bare?: boolean; /** unit profile id, picks an armored or turret look */ profile?: string }

/** Brotherhood armor and turret looks by unit id (knight, paladin, initiate, scribe, t-60 Goddard, turret). */
export const proceduralLook = (profile?: string): 'turret' | 'power' | 'armor' | 'plain' => {
  const p = (profile ?? '').toLowerCase()
  if (/turret/.test(p)) return 'turret'
  if (/t-?60|power-?armor|paladin|goddard/.test(p) && !/aspirant/.test(p)) return 'power'
  if (/knight|initiate|scribe|brotherhood|elder|sentinel/.test(p)) return 'armor'
  return 'plain'
}

function Armored({ r, h, color, accent, power, scribe, bare }: { r: number; h: number; color: string; accent: string; power: boolean; scribe: boolean; bare?: boolean }) {
  const k = power ? 1.25 : 1
  const plate = scribe ? '#7a2f2a' : power ? '#5b626a' : '#6a6f72'
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.3, 0.12 + h * 0.2, 0]} castShadow><boxGeometry args={[r * 0.38 * k, h * 0.4, r * 0.38 * k]} /><meshStandardMaterial color={plate} metalness={0.55} roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 0.12 + h * 0.58, 0]} castShadow><boxGeometry args={[r * 1.1 * k, h * 0.38, r * 0.7 * k]} /><meshStandardMaterial color={plate} metalness={0.55} roughness={0.5} /></mesh>
      <mesh position={[0, 0.12 + h * 0.6, r * 0.36 * k]}><boxGeometry args={[r * 0.5, h * 0.12, 0.02]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={'p' + s} position={[s * r * 0.7 * k, 0.12 + h * 0.74, 0]} castShadow><boxGeometry args={[r * 0.4, h * 0.14, r * 0.5]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 0.12 + h * 0.88, 0]} castShadow><boxGeometry args={[r * 0.55 * k, h * 0.2, r * 0.55 * k]} /><meshStandardMaterial color={plate} metalness={0.6} roughness={0.45} /></mesh>
      <mesh position={[0, 0.12 + h * 0.89, r * 0.28 * k]}><boxGeometry args={[r * 0.4 * k, h * 0.05, 0.02]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} /></mesh>
      {!bare && <mesh position={[r * 0.55, 0.12 + h * 0.6, r * 0.3]} rotation={[0.4, 0, 0]} castShadow><boxGeometry args={[r * 0.14, r * 0.14, h * 0.55]} /><meshStandardMaterial color={accent} roughness={0.6} metalness={0.4} /></mesh>}
    </group>
  )
}

function Turret({ r, h, accent }: { r: number; h: number; accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[r * 0.5, r * 0.65, 0.16, 20]} /><meshStandardMaterial color="#4d5258" metalness={0.6} roughness={0.5} /></mesh>
      <mesh position={[0, 0.2 + h * 0.3, 0]} castShadow><cylinderGeometry args={[r * 0.12, r * 0.12, h * 0.5, 10]} /><meshStandardMaterial color="#3b3f44" metalness={0.6} /></mesh>
      <mesh position={[0, 0.2 + h * 0.6, 0]} castShadow><boxGeometry args={[r * 0.8, h * 0.28, r * 0.9]} /><meshStandardMaterial color="#5b626a" metalness={0.55} roughness={0.5} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.2, 0.2 + h * 0.6, r * 0.8]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[r * 0.06, r * 0.06, r * 0.9, 8]} /><meshStandardMaterial color="#25282b" metalness={0.7} /></mesh>
      ))}
      <mesh position={[0, 0.2 + h * 0.62, r * 0.46]}><boxGeometry args={[r * 0.3, h * 0.06, 0.02]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} /></mesh>
    </group>
  )
}

export function ProceduralFigure({ id, x, z, baseMm, color, accent, heightIn, bare, profile }: FigureProps) {
  const look = proceduralLook(profile)
  const r = baseMm / MM / 2
  // About four and a half heads tall; height grows a little with base size.
  const h = heightIn ?? 1.45 + (baseMm - 25) * 0.045
  const head = h / 4.5
  return (
    <group position={[x, 0, z]} name={`model-${id}`} userData={{ id, x, z }}>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.04, 0.12, 32]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.8} />
      </mesh>
      {look === 'turret' ? <Turret r={r} h={h} accent={accent} /> : look !== 'plain' ? <Armored r={r} h={h} color={color} accent={accent} power={look === 'power'} scribe={/scribe/i.test(profile ?? '')} bare={bare} /> : (<>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.28, 0.12 + h * 0.2, 0]} castShadow>
          <boxGeometry args={[r * 0.3, h * 0.4, r * 0.3]} />
          <meshStandardMaterial color={PALETTE.rustDark} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.12 + h * 0.58, 0]} castShadow>
        <boxGeometry args={[r * 0.95, h * 0.36, r * 0.55]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.12 + h * 0.86, 0]} castShadow>
        <sphereGeometry args={[head * 0.5, 16, 12]} />
        <meshStandardMaterial color={PALETTE.dust} roughness={0.9} />
      </mesh>
      {!bare && (
      <mesh position={[r * 0.55, 0.12 + h * 0.6, r * 0.3]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[r * 0.14, r * 0.14, h * 0.55]} />
        <meshStandardMaterial color={accent} roughness={0.6} metalness={0.4} />
      </mesh>
      )}
      </>)}
    </group>
  )
}
