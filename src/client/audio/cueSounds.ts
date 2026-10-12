// Maps presentation cues to sounds. Pure mapping: never computes rules, only restates what the cue already says.
import { weaponFlavour, type WeaponFlavour } from '../weaponFlavour'
import type { Cue } from '../presentation/cues'

export interface SoundCall { id: string; delayMs?: number; volume?: number }

const SHOT: Record<WeaponFlavour, string> = {
  pistol: 'shot-pistol', rifle: 'shot-rifle', shotgun: 'shot-shotgun', laser: 'laser', plasma: 'plasma', explosive: 'explosion',
  blunt: 'melee-bat', blade: 'melee-blade', bite: 'melee-bite', claw: 'melee-claw',
}
export const soundForFlavour = (f: WeaponFlavour): string => SHOT[f]

export type Outcome = 'victory' | 'defeat'

/** `humanWon` tells a game-over banner whether to sting victory or defeat. */
export function soundsForCue(cue: Cue, durationMs: number, humanWon?: boolean): SoundCall[] {
  switch (cue.kind) {
    case 'banner':
      if (cue.tone === 'round') return [{ id: 'round-start' }]
      if (cue.tone === 'turn') return [{ id: 'ui-confirm', volume: 0.4 }]
      return [{ id: humanWon ? 'victory' : 'defeat' }]
    case 'move': {
      let len = 0
      for (let i = 1; i < cue.points.length; i++) len += Math.hypot(cue.points[i].x - cue.points[i - 1].x, cue.points[i].z - cue.points[i - 1].z)
      const steps = Math.max(2, Math.min(8, Math.round(len / 1.1)))
      const span = Math.max(200, durationMs * 0.85)
      return Array.from({ length: steps }, (_, i) => ({ id: 'step', delayMs: (i / steps) * span, volume: 0.6 }))
    }
    case 'dice': {
      const out: SoundCall[] = []
      if (cue.dice.some((d) => d.role === 'skill' || d.sides === 20)) out.push({ id: 'dice-d20' })
      if (cue.dice.some((d) => d.sides === 12)) out.push({ id: 'dice-d12', delayMs: 60 })
      if (out.length === 0) out.push({ id: 'dice-d12', volume: 0.7 })
      return out
    }
    case 'attack': {
      const id = SHOT[weaponFlavour(cue.weaponId, cue.ns)]
      return [{ id, volume: cue.critical ? 1 : 0.85 }]
    }
    case 'damage':
      if (cue.removed) return [{ id: 'death', delayMs: 80 }]
      if (cue.applied > 0) return [{ id: 'hit', delayMs: cue.direct ? 0 : 60 }]
      return cue.direct ? [] : [{ id: 'armor-clink', delayMs: 60 }]
    case 'removed':
      return [{ id: 'death' }]
    case 'condition':
      return cue.added && /rad/i.test(cue.condition) ? [{ id: 'geiger' }] : []
    case 'scatter':
      return [{ id: 'step', volume: 0.5 }]
    case 'luck':
      return [{ id: cue.lucky ? 'ui-confirm' : 'ui-cancel', volume: 0.6 }]
    default:
      return []
  }
}
