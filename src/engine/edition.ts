// Edition lookups. Every edition number the engine uses (dice faces, ruler inches, rule constants) comes
// through here from the EditionBundle (src/data), never from a literal in src/engine (spec 20 s1).
import type { Colour, DiceDef, EditionBundle, RulersDef, RulesDef } from '../data/types'

/** A missing singleton is a broken data tree, not bad player input, so these throw. */
function single<T>(bundle: EditionBundle, name: 'dice' | 'rulers' | 'rules'): T {
  const r = bundle.singletons[name]
  if (!r) throw new Error(`edition ${bundle.edition}: data/${bundle.edition}/${name}.json is missing`)
  return r as T
}
export const diceDef = (bundle: EditionBundle): DiceDef => single<DiceDef>(bundle, 'dice')
export const rulersDef = (bundle: EditionBundle): RulersDef => single<RulersDef>(bundle, 'rulers')
export const rulesDef = (bundle: EditionBundle): RulesDef => single<RulesDef>(bundle, 'rules')

/** Ruler colours from shortest to longest. */
export function rulerColours(bundle: EditionBundle): Colour[] {
  return [...rulersDef(bundle).rulers].sort((a, b) => a.inches - b.inches).map((r) => r.colour)
}

/** Length in inches of a ruler colour. */
export function rulerInches(bundle: EditionBundle, colour: Colour): number {
  const r = rulersDef(bundle).rulers.find((x) => x.colour === colour)
  if (!r) throw new Error(`edition ${bundle.edition}: no ruler "${colour}"`)
  return r.inches
}

/** Step a colour along the ruler order: negative = shorter (never below the shortest), positive = longer (capped). */
export function stepColour(bundle: EditionBundle, colour: Colour, steps: number): Colour {
  const order = rulerColours(bundle)
  const i = order.indexOf(colour)
  const j = Math.min(order.length - 1, Math.max(0, i + steps))
  return order[j]!
}
/** "One colour shorter" (ERR p.9 FAQ): never below the shortest ruler. */
export const colourShorter = (bundle: EditionBundle, colour: Colour, steps = 1): Colour => stepColour(bundle, colour, -steps)

/** Shortest ruler colour that covers `inches`, or null when it is beyond the longest ruler. */
export function colourFor(bundle: EditionBundle, inches: number): Colour | null {
  for (const c of rulerColours(bundle)) if (rulerInches(bundle, c) >= inches - 1e-9) return c
  return null
}

/** Numeric rule constants in data/<edition>/rules.json (spec 20 s1). */
export type NumericRule =
  | 'maxDicePerColour' | 'actionsPerActivation' | 'quickActionPenalty' | 'coverPenalty' | 'coverArmorBonus'
  | 'speciality' | 'strBonusThreshold' | 'intoMeleeBonus' | 'armorBoostMax' | 'luckBonus' | 'injuredArmPenalty'
  | 'frozenPenalty' | 'heroicHealthBonus' | 'outnumberedGreenDice' | 'strBonusBlackDice'

/** A numeric rule constant; throws when the data file lacks it (broken data, not player input). */
export function ruleNum(bundle: EditionBundle, key: NumericRule | (string & {})): number {
  const v = rulesDef(bundle).constants[key]
  if (typeof v !== 'number') throw new Error(`edition ${bundle.edition}: rules.constants.${key} is not a number`)
  return v
}
/** A string rule constant (e.g. sharingRange -> a ruler colour). */
export function ruleStr(bundle: EditionBundle, key: string): string {
  const v = rulesDef(bundle).constants[key]
  if (typeof v !== 'string') throw new Error(`edition ${bundle.edition}: rules.constants.${key} is not a string`)
  return v
}
/** An object rule constant (e.g. fallingTable). */
export function ruleObj<T extends object>(bundle: EditionBundle, key: string): T {
  const v = rulesDef(bundle).constants[key]
  if (typeof v !== 'object' || v === null) throw new Error(`edition ${bundle.edition}: rules.constants.${key} is not an object`)
  return v as T
}

/** Record lookup by id inside a bundle (no Vite glob; works in Node tests and tools). */
export function recordOf<K extends keyof EditionBundle['records']>(
  bundle: EditionBundle, kind: K, id: string,
): EditionBundle['records'][K][number] | undefined {
  return (bundle.records[kind] as { id: string }[]).find((r) => r.id === id) as EditionBundle['records'][K][number] | undefined
}
