// Art paths and the small pure helpers behind them (no engine, no React: the start chunk imports this file).
// Every image is optional: a missing file hides itself (see art.tsx), so the UI works before the art lands.

export const artBase = (): string => {
  try { return import.meta.env.BASE_URL || '/' } catch { return '/' }
}
/** URL of a file under public/assets/art/. */
export const artUrl = (rel: string): string => `${artBase()}assets/art/${rel}`

export const keyArtUrl = (name: 'start-screen' | 'victory' | 'defeat'): string => artUrl(`key/${name}.webp`)
export const scenarioArtUrl = (scenarioId: string): string => artUrl(`scenarios/${encodeURIComponent(scenarioId)}.webp`)
export const portraitArtUrl = (unitId: string): string => artUrl(`portraits/${encodeURIComponent(unitId)}.webp`)

/** 'Brotherhood of Steel' and 'brotherhood-of-steel' both give 'brotherhood-of-steel'; nothing usable gives null. */
export function markSlug(faction: string | null | undefined): string | null {
  const s = (faction ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || null
}
export function markArtUrl(faction: string | null | undefined): string | null {
  const s = markSlug(faction)
  return s ? artUrl(`marks/${s}.svg`) : null
}
/** 'brotherhood-of-steel' -> 'Brotherhood of steel' (used for the mark's tooltip only). */
export const factionWord = (faction: string): string => {
  const w = faction.replace(/[-_]+/g, ' ').trim()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** Each seat's faction: the one most of its models belong to (ties go to the first seen). Neutral units are ignored. */
export function seatFactions(
  models: Record<string, { owner: string; profileId: string }>,
  units: readonly { id: string; faction: string | null }[],
): Record<string, string> {
  const factionOf = new Map(units.map((u) => [u.id, u.faction]))
  const tally = new Map<string, Map<string, number>>()
  for (const m of Object.values(models)) {
    const f = factionOf.get(m.profileId)
    if (!f) continue
    const per = tally.get(m.owner) ?? new Map<string, number>()
    per.set(f, (per.get(f) ?? 0) + 1)
    tally.set(m.owner, per)
  }
  const out: Record<string, string> = {}
  for (const [seat, per] of tally) {
    let best = ''
    let n = 0
    for (const [f, c] of per) if (c > n) { best = f; n = c }
    if (best) out[seat] = best
  }
  return out
}

/** Which end-of-game art to show: victory when a human seat won, defeat when a human lost, none for a draw or a bot-only game. */
export function resultArtKey(winner: string | null, controllers: Record<string, string>): 'victory' | 'defeat' | null {
  if (!winner) return null
  const humans = Object.entries(controllers).filter(([, c]) => c === 'human').map(([s]) => s)
  if (humans.length === 0) return null
  return humans.includes(winner) ? 'victory' : 'defeat'
}

const SWATCH: Record<string, string> = { survivors: '#4f8a82', 'super-mutants': '#6f8f3a', 'brotherhood-of-steel': '#5c6f86' }
/** Procedural stand-in for a portrait: faction colour plus the unit's first letter. */
export function portraitSwatch(faction: string | null | undefined, name: string): { background: string; letter: string } {
  const slug = markSlug(faction)
  return { background: (slug && SWATCH[slug]) || '#8a7a5c', letter: (name.trim().charAt(0) || '?').toUpperCase() }
}
