// Which carried weapon a figure shows in its hand. Pure.
import type { CarriedItem } from '../../engine/types'

export type WeaponMode = 'ranged' | 'melee'

/** Melee-only weapon records (a melee dice pool and no short or long pool) count as melee; the rest as ranged. */
export function modeOfWeapon(def: { dice?: { short?: unknown; long?: unknown; melee?: unknown }; short?: unknown; long?: unknown } | undefined): WeaponMode | undefined {
  if (!def) return undefined
  const d = def.dice ?? {}
  return d.melee && !d.short && !d.long && !def.short && !def.long ? 'melee' : 'ranged'
}

/** Natural attacks (bites, claws) are part of the body: they never render as a held weapon. */
export const NATURAL_WEAPON = /bite|swipe|crush|claw/i
export function isNaturalWeapon(defId: string, def?: { natural?: unknown; flags?: unknown } | undefined): boolean {
  if (NATURAL_WEAPON.test(defId)) return true
  if (!def) return false
  return def.natural === true || (Array.isArray(def.flags) && def.flags.includes('natural'))
}

/** Weapon def id to show: the first of the wanted mode, else any other weapon, else undefined (bare-handed). Natural attacks are skipped. */
export function pickEquipped(carried: readonly CarriedItem[], modeOf: (defId: string) => WeaponMode | undefined, want: WeaponMode,
  natural: (defId: string) => boolean = (d) => isNaturalWeapon(d)): string | undefined {
  const ws = carried.filter((c) => c.kind === 'weapon' && !c.spent && !natural(c.defId))
  const hit = ws.find((c) => modeOf(c.defId) === want) ?? ws[0]
  return hit?.defId
}
