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

/** How a weapon is carried: decides the hold transform (see heldPose in glbModels). */
export type WeaponClass = 'pistol' | 'long' | 'heavy' | 'melee1' | 'melee2' | 'thrown'

interface ClassDef { dice?: { short?: unknown; long?: unknown; melee?: unknown }; short?: unknown; long?: unknown; grenade?: unknown; heavy?: unknown; twoHanded?: unknown; flags?: unknown }

const HEAVY_NAME = /missile|minigun|mini-gun|fat-man|flamer|launcher|gatling|machine-gun|turret|cannon/i
const TWO_HAND_MELEE = /sledge|board|ripper|chainsaw|axe-two|greatsword|battle-?axe/i
const PISTOL_NAME = /pistol|revolver|handgun|\.?44|10mm|magnum|derringer|smg/i
const LONG_NAME = /rifle|shotgun|carbine|musket|sniper/i
const THROWN_NAME = /grenade|mine|molotov|throw|dynamite/i

/** Classify a weapon from its record (range pools, grenade/heavy flags) falling back to its id/name. Pure. */
export function weaponClassOf(id: string, def?: ClassDef): WeaponClass {
  const flags = Array.isArray(def?.flags) ? (def?.flags as unknown[]) : []
  const hasShort = !!(def?.short ?? def?.dice?.short)
  const hasLong = !!(def?.long ?? def?.dice?.long)
  const ranged = hasShort || hasLong
  if (def?.grenade || flags.includes('grenade') || (!ranged && THROWN_NAME.test(id))) return 'thrown'
  if (def?.heavy || flags.includes('heavy') || HEAVY_NAME.test(id)) return 'heavy'
  if (!def) return PISTOL_NAME.test(id) ? 'pistol' : LONG_NAME.test(id) ? 'long' : TWO_HAND_MELEE.test(id) ? 'melee2' : 'melee1'
  if (!ranged) return def.twoHanded || flags.includes('two-handed') || TWO_HAND_MELEE.test(id) ? 'melee2' : 'melee1'
  if (PISTOL_NAME.test(id) && !LONG_NAME.test(id)) return 'pistol'
  if (LONG_NAME.test(id)) return 'long'
  return hasLong ? 'long' : 'pistol'
}
