// Which carried weapon a figure shows in its hand. Pure.
import type { CarriedItem } from '../../engine/types'

export type WeaponMode = 'ranged' | 'melee'

/** Melee-only weapon records (a melee dice pool and no short or long pool) count as melee; the rest as ranged. */
export function modeOfWeapon(def: { dice?: { short?: unknown; long?: unknown; melee?: unknown }; short?: unknown; long?: unknown } | undefined): WeaponMode | undefined {
  if (!def) return undefined
  const d = def.dice ?? {}
  return d.melee && !d.short && !d.long && !def.short && !def.long ? 'melee' : 'ranged'
}

/** Weapon def id to show: the first of the wanted mode, else any other weapon, else undefined (bare-handed). */
export function pickEquipped(carried: readonly CarriedItem[], modeOf: (defId: string) => WeaponMode | undefined, want: WeaponMode): string | undefined {
  const ws = carried.filter((c) => c.kind === 'weapon' && !c.spent)
  const hit = ws.find((c) => modeOf(c.defId) === want) ?? ws[0]
  return hit?.defId
}
