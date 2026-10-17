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

export type DeathKind = 'human' | 'mutant' | 'dog' | 'deathclaw' | 'robot'
/** The slice of a unit record the death sound reads (data/1e/units). */
export interface DeathUnit { id: string; types?: readonly string[]; faction?: string | null }
/** Death kind from the unit's own data: robot and dog types, the Deathclaw, Super Mutants, otherwise human. */
export function deathKindOf(u: DeathUnit | null | undefined): DeathKind {
  if (!u) return 'human'
  const types = u.types ?? []
  if (types.includes('robot')) return 'robot'
  if (types.includes('dog')) return 'dog'
  if (u.id.includes('deathclaw')) return 'deathclaw'
  if (u.faction === 'super-mutants' || u.id.includes('mutant')) return 'mutant'
  return 'human'
}

/** What a cue mapping may look up besides the cue itself. */
export interface CueEnv {
  /** Death sound id for a model, `death-<kind>`; a human death when absent. */
  deathSound?: (modelId: string) => string
}

/** `humanWon` tells a game-over banner whether to sting victory or defeat. */
export function soundsForCue(cue: Cue, durationMs: number, humanWon?: boolean, env: CueEnv = {}): SoundCall[] {
  const death = (id: string): string => env.deathSound?.(id) ?? 'death-human'
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
      // The Agility test for a climb and the black fall die are the engine's own words for these two moments.
      const base = cue.purpose.split(':')[0]
      if (base === 'climb') out.push({ id: 'climb', delayMs: 250 })
      else if (base === 'fall') out.push({ id: 'fall', delayMs: 250 })
      return out
    }
    case 'attack': {
      const id = SHOT[weaponFlavour(cue.weaponId, cue.ns)]
      return [{ id, volume: cue.critical ? 1 : 0.85 }]
    }
    case 'damage':
      if (cue.removed) return [{ id: death(cue.targetId), delayMs: 80 }]
      if (cue.applied > 0) return [{ id: 'hit', delayMs: cue.direct ? 0 : 60 }]
      return cue.direct ? [] : [{ id: 'armor-clink', delayMs: 60 }]
    case 'removed':
      return [...(/fell|fall/i.test(cue.reason) ? [{ id: 'fall' }] : []), { id: death(cue.modelId), delayMs: 60 }]
    case 'condition':
      if (cue.added) return /rad/i.test(cue.condition) ? [{ id: 'radiation' }] : []
      return /injur/i.test(cue.condition) ? [{ id: 'heal' }] : [] // an injury cured by an item
    case 'note':
      switch (String((cue.event as { type?: unknown }).type)) {
        case 'itemFound': case 'searchEmpty': return [{ id: 'search' }]
        case 'interacted': case 'claimed': case 'keyTaken': return [{ id: 'objective' }]
        default: return []
      }
    case 'scatter':
      return [{ id: 'step', volume: 0.5 }]
    case 'luck':
      return [{ id: cue.lucky ? 'ui-confirm' : 'ui-cancel', volume: 0.6 }]
    default:
      return []
  }
}
