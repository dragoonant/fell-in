// Board themes for open skirmish tables: picker labels, the ground tint per theme and the theme a presented board is using.
// Pure (no engine runtime imports) so the start screen can read it. The engine owns the layouts (src/engine/terrainCatalog.ts).
import type { TerrainTheme } from '../../engine/terrainCatalog'

export interface ThemeInfo { id: TerrainTheme; label: string; blurb: string; /** Colour multiplied over the CC0 ground mat. */ tint: string }

export const THEMES: readonly ThemeInfo[] = [
  { id: 'suburbs', label: 'Suburbs', blurb: 'Ruined houses, fences and a rusted playground on greyed-green lawns.', tint: '#b4b79a' },
  { id: 'red-rocket', label: 'Red Rocket', blurb: 'A sun-bleached filling station with pumps, a service bay and a billboard.', tint: '#d6cdb4' },
  { id: 'junkyard', label: 'Junkyard', blurb: 'Crushed car stacks, a scrap press and rust-stained ground.', tint: '#c0845a' },
]

/** Default ground colour (the original sand). */
export const DEFAULT_GROUND_TINT = '#c9ad7c'

export const asTheme = (v: unknown): TerrainTheme | null => (THEMES.some((t) => t.id === v) ? (v as TerrainTheme) : null)
export const tintFor = (theme: string | null | undefined): string => THEMES.find((t) => t.id === theme)?.tint ?? DEFAULT_GROUND_TINT

/** The theme a board is dressed in: the first terrain piece that carries props.theme. */
export function themeOfTerrain(terrain: readonly { props: Record<string, unknown> }[] | undefined): TerrainTheme | null {
  for (const t of terrain ?? []) { const a = asTheme(t.props['theme']); if (a) return a }
  return null
}
