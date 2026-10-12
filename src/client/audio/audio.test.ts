import { describe, expect, it } from 'vitest'
import { weaponFlavour } from '../weaponFlavour'
import { soundsForCue } from './cueSounds'
import { RECIPES, SOUND_IDS } from './synth'

describe('audio', () => {
  it('weaponFlavour picks the longest substring match', () => {
    expect(weaponFlavour('laser-rifle')).toBe('laser')
    expect(weaponFlavour('combat-shotgun')).toBe('shotgun')
    expect(weaponFlavour('baseball-bat')).toBe('blunt')
    expect(weaponFlavour('mystery', 'throw')).toBe('explosive')
  })
  it('every recipe id used by cues exists', () => {
    const cue = { kind: 'attack', attackerId: 'a', targetId: 'b', weaponId: 'plasma-rifle', ns: 'shoot', success: true, critical: false, sv: 1, result: null } as const
    for (const c of soundsForCue(cue, 400)) expect(RECIPES[c.id]).toBeTypeOf('function')
    expect(SOUND_IDS.length).toBeGreaterThan(20)
  })
  it('move cue yields footsteps', () => {
    const calls = soundsForCue({ kind: 'move', modelId: 'm', points: [{ x: 0, z: 0 }, { x: 0, z: 6 }] }, 800)
    expect(calls.length).toBeGreaterThan(2)
  })
})
