import { describe, expect, it } from 'vitest'
import { aimedPose, heldPose, parseManifest, poseGlbUrl, readyPose } from '../../src/client/figures/glbModels'

const m = parseManifest({ units: { brute: { hand: [0.3, 1, 0.2], poses: { melee2: { file: 'units/brute@melee2.glb', hand: [0.3, 1, 0.2], support: [0.1, 1.1, 0.5] } } } } })
const url = poseGlbUrl('units/brute@melee2.glb')

describe('pose readiness selects where the weapon sits', () => {
  it('POSE-001 no pose entry: nothing to wait for', () => {
    expect(readyPose(m, 'brute', 'long', () => 'ready')).toBeUndefined()
    expect(readyPose(m, 'brute', undefined, () => 'ready')).toBeUndefined()
  })
  it('POSE-002 pose still loading or failed: default figure, weapon at its HOLDS transform (never hidden)', () => {
    for (const st of ['idle', 'loading', 'failed'] as const) {
      const pe = readyPose(m, 'brute', 'melee2', () => st)
      expect(pe).toBeUndefined()
      const pose = pe ? aimedPose(pe.hand, pe.support) : heldPose('melee2', [0.3, 1, 0.2], undefined)
      expect(pose.position).toEqual([0.3, 1, 0.2])
    }
  })
  it('POSE-003 pose ready: swap to the aimed two-hand placement', () => {
    const pe = readyPose(m, 'brute', 'melee2', (u) => (u === url ? 'ready' : 'idle'))
    expect(pe?.file).toBe('units/brute@melee2.glb')
  })
})
