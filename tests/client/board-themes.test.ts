// Board themes: ground tint lookup, theme detection from the presented terrain, and the ?theme param.
import { describe, expect, it } from 'vitest'
import { asTheme, DEFAULT_GROUND_TINT, THEMES, themeOfTerrain, tintFor } from '../../src/client/board/themes'
import { readParams } from '../../src/client/params'
import { themedTerrain, TERRAIN_THEMES } from '../../src/engine/terrainCatalog'

describe('board themes', () => {
  it('lists the engine themes with distinct tints and falls back to the sand', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...TERRAIN_THEMES])
    expect(new Set(THEMES.map((t) => t.tint)).size).toBe(THEMES.length)
    expect(tintFor('junkyard')).not.toBe(DEFAULT_GROUND_TINT)
    expect(tintFor(null)).toBe(DEFAULT_GROUND_TINT)
    expect(tintFor('nonsense')).toBe(DEFAULT_GROUND_TINT)
    expect(asTheme('suburbs')).toBe('suburbs')
    expect(asTheme('x')).toBeNull()
  })
  it('reads the theme off the terrain and finds none on a plain board', () => {
    expect(themeOfTerrain(themedTerrain('box-1', 'red-rocket'))).toBe('red-rocket')
    expect(themeOfTerrain(themedTerrain('box-1'))).toBeNull()
    expect(themeOfTerrain(undefined)).toBeNull()
  })
  it('the theme param is read, lower-cased, and starts a game', () => {
    expect(readParams('?theme=Suburbs').theme).toBe('suburbs')
    expect(readParams('?theme=Suburbs').autostart).toBe(true)
    expect(readParams('').theme).toBeNull()
  })
})
