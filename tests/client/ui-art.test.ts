// Art wiring helpers: URLs, faction marks, seat factions, result art, portrait fallback.
import { describe, expect, it } from 'vitest'
import { artUrl, keyArtUrl, markArtUrl, markSlug, portraitArtUrl, portraitSwatch, resultArtKey, scenarioArtUrl, seatFactions } from '../../src/client/ui/artView'

describe('UI art helpers', () => {
  it('ART-001 art URLs sit under assets/art and mark slugs are stable', () => {
    expect(artUrl('x.webp')).toMatch(/assets\/art\/x\.webp$/)
    expect(keyArtUrl('start-screen')).toMatch(/assets\/art\/key\/start-screen\.webp$/)
    expect(scenarioArtUrl('ai-rr')).toMatch(/assets\/art\/scenarios\/ai-rr\.webp$/)
    expect(portraitArtUrl('sole-survivor')).toMatch(/assets\/art\/portraits\/sole-survivor\.webp$/)
    expect(markSlug('Brotherhood of Steel')).toBe('brotherhood-of-steel')
    expect(markSlug('super-mutants')).toBe('super-mutants')
    expect(markSlug(null)).toBeNull()
    expect(markArtUrl('survivors')).toMatch(/assets\/art\/marks\/survivors\.svg$/)
    expect(markArtUrl('')).toBeNull()
  })

  it('ART-002 each seat gets the faction most of its models belong to; neutrals are ignored', () => {
    const units = [{ id: 'a', faction: 'survivors' }, { id: 'b', faction: 'super-mutants' }, { id: 'dog', faction: null }]
    const models = { m1: { owner: 'A', profileId: 'a' }, m2: { owner: 'A', profileId: 'dog' }, m3: { owner: 'ai', profileId: 'b' }, m4: { owner: 'ai', profileId: 'b' }, m5: { owner: 'ai', profileId: 'a' } }
    expect(seatFactions(models, units)).toEqual({ A: 'survivors', ai: 'super-mutants' })
    expect(seatFactions({ x: { owner: 'A', profileId: 'dog' } }, units)).toEqual({})
  })

  it('ART-003 game over shows victory for a human winner, defeat when a human loses, nothing for draws and bot-only games', () => {
    expect(resultArtKey('A', { A: 'human', ai: 'official' })).toBe('victory')
    expect(resultArtKey('ai', { A: 'human', ai: 'official' })).toBe('defeat')
    expect(resultArtKey(null, { A: 'human', ai: 'official' })).toBeNull()
    expect(resultArtKey('A', { A: 'bot', B: 'bot' })).toBeNull()
  })

  it('ART-004 portrait fallback swatch uses the faction colour and the first letter', () => {
    expect(portraitSwatch('survivors', 'sole survivor').letter).toBe('S')
    expect(portraitSwatch('survivors', 'x').background).not.toBe(portraitSwatch('super-mutants', 'x').background)
    expect(portraitSwatch(null, '').letter).toBe('?')
  })
})
