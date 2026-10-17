// File-backed sound layer, part 1: manifest parsing, the lazy decode cache, cue-to-sound mapping and voice triggers.
import { describe, expect, it } from 'vitest'
import { deathKindOf, soundsForCue } from '../../src/client/audio/cueSounds'
import { FileBank } from '../../src/client/audio/files'
import { EMPTY_MANIFEST, parseManifest, roundVoiceId } from '../../src/client/audio/manifest'
import { yourTurnRound } from '../../src/client/audio/triggers'
import type { Cue } from '../../src/client/presentation/cues'
import { flush, stubContext, stubFetch } from './audio-stubs'

const MANIFEST = { version: 1, sfx: { hit: 'audio/sfx/hit.mp3' }, music: { menu: 'audio/music/menu.mp3' }, voice: { welcome: 'audio/voice/welcome.mp3' } }

describe('audio manifest', () => {
  it('AUD-001 parses the frozen shape and drops anything unsafe', () => {
    const m = parseManifest({ version: 1, sfx: { hit: 'audio/sfx/hit.mp3', evil: 'https://x.test/a.mp3', up: '../a.mp3', abs: '/a.mp3', n: 5 }, music: [], voice: { a: 'audio/voice/a.mp3' } })
    expect(m.sfx).toEqual({ hit: 'audio/sfx/hit.mp3' })
    expect(m.music).toEqual({})
    expect(m.voice).toEqual({ a: 'audio/voice/a.mp3' })
    expect(parseManifest({ version: 2, sfx: { hit: 'a.mp3' } })).toBe(EMPTY_MANIFEST)
    expect(parseManifest(null)).toBe(EMPTY_MANIFEST)
    expect(parseManifest('nope')).toBe(EMPTY_MANIFEST)
  })

  it('AUD-002 a 404 or bad json leaves everything synthesised', async () => {
    const { ctx } = stubContext()
    const none = new FileBank({ fetch: stubFetch({}).fetch, baseUrl: '/', getContext: () => ctx })
    expect(await none.loadManifest()).toBe(EMPTY_MANIFEST)
    expect(none.loaded).toBe(true)
    expect(none.has('sfx', 'hit')).toBe(false)
    expect(await none.load('sfx', 'hit')).toBeNull()
    const throwing = new FileBank({ fetch: async () => { throw new Error('offline') }, baseUrl: '/', getContext: () => ctx })
    expect(await throwing.loadManifest()).toBe(EMPTY_MANIFEST)
  })

  it('AUD-003 files decode lazily, once, and are cached', async () => {
    const { ctx } = stubContext()
    const f = stubFetch({ '/fell-in/audio/manifest.json': MANIFEST, '/fell-in/audio/sfx/hit.mp3': 'x' })
    const bank = new FileBank({ fetch: f.fetch, baseUrl: '/fell-in/', getContext: () => ctx })
    await bank.loadManifest()
    expect(f.calls).toEqual(['/fell-in/audio/manifest.json']) // nothing decoded yet
    expect(bank.cached('sfx', 'hit')).toBeNull()
    const [a, b] = await Promise.all([bank.load('sfx', 'hit'), bank.load('sfx', 'hit')])
    expect(a).toBe(b)
    expect(await bank.load('sfx', 'hit')).toBe(a)
    expect(bank.cached('sfx', 'hit')).toBe(a)
    expect(f.calls.filter((u) => u.endsWith('hit.mp3'))).toHaveLength(1)
    expect((a as unknown as { tag: string }).tag).toBe('/fell-in/audio/sfx/hit.mp3')
  })

  it('AUD-004 a file that fails to load is not retried', async () => {
    const { ctx } = stubContext()
    const f = stubFetch({ '/audio/manifest.json': MANIFEST }) // the mp3 itself 404s
    const bank = new FileBank({ fetch: f.fetch, baseUrl: '/', getContext: () => ctx })
    expect(await bank.load('sfx', 'hit')).toBeNull()
    expect(await bank.load('sfx', 'hit')).toBeNull()
    await flush()
    expect(f.calls.filter((u) => u.endsWith('hit.mp3'))).toHaveLength(1)
  })
})

describe('audio cue mapping', () => {
  const deathSound = (id: string) => `death-${id}`
  it('AUD-005 death sounds follow the unit data', () => {
    expect(deathKindOf({ id: 'machine-gun-turret-mk1', types: ['robot'] })).toBe('robot')
    expect(deathKindOf({ id: 'mutant-hound', types: ['dog'], faction: 'super-mutants' })).toBe('dog')
    expect(deathKindOf({ id: 'deathclaw', types: ['creature'] })).toBe('deathclaw')
    expect(deathKindOf({ id: 'brute', types: [], faction: 'super-mutants' })).toBe('mutant')
    expect(deathKindOf({ id: 'settler', types: [], faction: 'survivors' })).toBe('human')
    expect(deathKindOf(undefined)).toBe('human')
    const removed: Cue = { kind: 'removed', modelId: 'robot', reason: 'killed' }
    expect(soundsForCue(removed, 800, false, { deathSound }).map((c) => c.id)).toEqual(['death-robot'])
    const dmg: Cue = { kind: 'damage', targetId: 'dog', applied: 2, removed: true, direct: false }
    expect(soundsForCue(dmg, 750, false, { deathSound })[0]!.id).toBe('death-dog')
  })

  it('AUD-006 radiation, search, objective, climb, fall and heal come only from what the engine already says', () => {
    const ids = (c: Cue) => soundsForCue(c, 500).map((s) => s.id)
    expect(ids({ kind: 'condition', modelId: 'm', condition: 'irradiated', added: true })).toEqual(['radiation'])
    expect(ids({ kind: 'condition', modelId: 'm', condition: 'injuredArm', added: false })).toEqual(['heal'])
    expect(ids({ kind: 'condition', modelId: 'm', condition: 'burning', added: false })).toEqual([])
    expect(ids({ kind: 'note', event: { type: 'itemFound', defId: 'x' } })).toEqual(['search'])
    expect(ids({ kind: 'note', event: { type: 'searchEmpty' } })).toEqual(['search'])
    expect(ids({ kind: 'note', event: { type: 'interacted' } })).toEqual(['objective'])
    expect(ids({ kind: 'note', event: { type: 'peek' } })).toEqual([])
    const die = { role: 'other', sides: 12, face: 3, reroll: false, rollId: 'r' } as const
    expect(ids({ kind: 'dice', purpose: 'climb', dice: [die], rolls: [] })).toContain('climb')
    expect(ids({ kind: 'dice', purpose: 'fall', dice: [die], rolls: [] })).toContain('fall')
    expect(ids({ kind: 'dice', purpose: 'shoot', dice: [die], rolls: [] })).not.toContain('climb')
    expect(ids({ kind: 'removed', modelId: 'm', reason: 'fell too far' })).toEqual(['fall', 'death-human'])
  })
})

describe('audio voice triggers', () => {
  it('AUD-007 round lines: 1 to 4, the last round wins, later rounds are silent', () => {
    expect(roundVoiceId(1, 6)).toBe('round-1')
    expect(roundVoiceId(4, 6)).toBe('round-4')
    expect(roundVoiceId(5, 6)).toBeNull()
    expect(roundVoiceId(6, 6)).toBe('last-round')
    expect(roundVoiceId(4, 4)).toBe('last-round')
    expect(roundVoiceId(2, null)).toBe('round-2')
  })

  it('AUD-008 your-turn fires once per round for a human seat only', () => {
    const ctrl = { a: 'human', b: 'official' }
    expect(yourTurnRound({ round: 1, phase: 'play', seat: 'a' }, ctrl, 0)).toBe(1)
    expect(yourTurnRound({ round: 1, phase: 'play', seat: 'a' }, ctrl, 1)).toBeNull()
    expect(yourTurnRound({ round: 1, phase: 'play', seat: 'b' }, ctrl, 0)).toBeNull()
    expect(yourTurnRound({ round: 0, phase: 'setup', seat: 'a' }, ctrl, 0)).toBeNull()
    expect(yourTurnRound({ round: 2, phase: 'over', seat: 'a' }, ctrl, 1)).toBeNull()
    expect(yourTurnRound({ round: 2, phase: 'play', seat: 'a' }, ctrl, 1)).toBe(2)
  })
})
