// File-backed sound layer, part 2: fallback selection, throttling, music, and the voice queue with ducking.
import { describe, expect, it } from 'vitest'
import { AudioManager, DUCK_DB, MUSIC_DB } from '../../src/client/audio/manager'
import { VoiceQueue, type VoiceBackend, type VoiceHandle } from '../../src/client/audio/voice'
import { flush, stubContext, stubFetch } from './audio-stubs'

const MANIFEST = {
  version: 1,
  sfx: { hit: 'audio/sfx/hit.mp3', search: 'audio/sfx/search.mp3', 'death-robot': 'audio/sfx/death-robot.mp3' },
  music: { menu: 'audio/music/menu.mp3', victory: 'audio/music/victory.mp3' },
  voice: { welcome: 'audio/voice/welcome.mp3', 'round-1': 'audio/voice/round-1.mp3', 'your-turn': 'audio/voice/your-turn.mp3' },
}

async function rig(manifest: unknown | null, extra: { clock?: { t: number } } = {}) {
  const s = stubContext()
  const files: Record<string, unknown> = {}
  if (manifest) {
    files['/audio/manifest.json'] = manifest
    for (const kind of ['sfx', 'music', 'voice'] as const) for (const p of Object.values((manifest as Record<string, Record<string, string>>)[kind] ?? {})) files[`/${p}`] = 'x'
  }
  const f = stubFetch(files)
  const clock = extra.clock ?? { t: 0 }
  const a = new AudioManager({ createContext: () => s.ctx, fetch: f.fetch, baseUrl: '/', now: () => clock.t, random: () => 0.5 })
  await a.bank.loadManifest()
  await a.unlock()
  return { a, s, f, clock }
}

describe('audio manager fallback', () => {
  it('AUD-010 with no manifest every sound is synthesised, ids without a recipe borrow one or stay silent', async () => {
    const { a, s } = await rig(null)
    a.play('hit')
    a.play('death-robot') // borrows the death recipe
    a.play('search') // no recipe and no file: silent
    expect(a.stats.files).toEqual({ synth: 2 })
    expect(a.stats.played['death-robot']).toBe(1)
    expect(a.stats.played['search']).toBeUndefined()
    expect(s.fileSources()).toHaveLength(0)
  })

  it('AUD-011 a decoded file wins; the first play covers with the recipe while the file decodes', async () => {
    const { a, s, clock } = await rig(MANIFEST)
    a.play('hit')
    expect(a.stats.files).toEqual({ synth: 1 })
    await flush()
    expect(a.bank.cached('sfx', 'hit')).not.toBeNull()
    clock.t = 1000
    a.play('hit')
    expect(a.stats.files.file).toBe(1)
    const src = s.fileSources()
    expect(src).toHaveLength(1)
    expect(src[0]!.buffer!.tag).toBe('/audio/sfx/hit.mp3')
  })

  it('AUD-012 a file with no recipe plays late, once decoded, instead of never', async () => {
    const { a, s } = await rig(MANIFEST)
    a.play('search')
    expect(s.fileSources()).toHaveLength(0)
    await flush()
    expect(s.fileSources().map((x) => x.buffer!.tag)).toEqual(['/audio/sfx/search.mp3'])
  })

  it('AUD-013 retriggers inside the gap are throttled', async () => {
    const { a, clock } = await rig(null)
    a.play('hit'); clock.t = 10; a.play('hit'); clock.t = 100; a.play('hit')
    expect(a.stats.played['hit']).toBe(2)
    a.play('death'); clock.t = 400; a.play('death-robot'); a.play('death'); clock.t = 800; a.play('death')
    expect(a.stats.played['death']).toBe(2)
  })

  it('AUD-014 music: a file loops (victory plays once), a missing file keeps the procedural mood', async () => {
    const { a, s } = await rig(MANIFEST)
    a.setMood('menu')
    await flush()
    let m = s.fileSources().find((x) => x.buffer!.tag.includes('menu'))
    expect(m?.loop).toBe(true)
    a.setMood('victory')
    await flush()
    m = s.fileSources().find((x) => x.buffer!.tag.includes('victory'))
    expect(m?.loop).toBe(false)
    const before = s.fileSources().length
    a.setMood('battle') // no file: synthesised
    expect(a.currentMood).toBe('battle')
    expect(s.fileSources()).toHaveLength(before)
  })
})

describe('audio voice', () => {
  it('AUD-020 a line plays through the voice bus and ducks the music 6 dB until it ends', async () => {
    const { a, s } = await rig(MANIFEST)
    a.say('round-1')
    await flush()
    expect(a.voice.playing).toBe('round-1')
    expect(a.isDucked).toBe(true)
    const music = s.gains[2]!.gain.setTargetAtTime.mock.calls.at(-1)!
    expect(music[0]).toBeCloseTo(0.8 * Math.pow(10, (MUSIC_DB + DUCK_DB) / 20), 4)
    const line = s.fileSources().find((x) => x.buffer!.tag.includes('round-1'))!
    line.onended!()
    expect(a.voice.playing).toBeNull()
    expect(a.isDucked).toBe(false)
    const back = s.gains[2]!.gain.setTargetAtTime.mock.calls.at(-1)!
    expect(back[0]).toBeCloseTo(0.8 * Math.pow(10, MUSIC_DB / 20), 4)
  })

  it('AUD-021 voice mute and a line with no file stay silent and never duck', async () => {
    const { a, s } = await rig(MANIFEST)
    a.say('last-round') // not in the manifest
    await flush()
    expect(a.isDucked).toBe(false)
    a.set({ voiceMuted: true })
    a.say('round-1')
    await flush()
    expect(a.isDucked).toBe(false)
    expect(s.fileSources()).toHaveLength(0)
    expect(s.gains[3]!.gain.setTargetAtTime.mock.calls.at(-1)![0]).toBe(0)
  })

  it('AUD-022 the welcome speaks once, on the unlocking click, and gives way to a real line', async () => {
    const s = stubContext()
    const f = stubFetch({ '/audio/manifest.json': MANIFEST, '/audio/voice/welcome.mp3': 'x', '/audio/voice/round-1.mp3': 'x' })
    const a = new AudioManager({ createContext: () => s.ctx, fetch: f.fetch, baseUrl: '/' })
    a.requestWelcome()
    await a.unlock() // the first click
    await flush()
    expect(a.voice.playing).toBe('welcome')
    a.say('round-1') // cuts the welcome off and takes over
    await flush()
    expect(a.voice.playing).toBe('round-1')
    a.requestWelcome() // asking again later never repeats it
    expect(a.stats.played['voice:welcome']).toBe(1)
  })

  it('AUD-023 a welcome request that is cancelled before any click never speaks', async () => {
    const s = stubContext()
    const a = new AudioManager({ createContext: () => s.ctx, fetch: stubFetch({ '/audio/manifest.json': MANIFEST, '/audio/voice/welcome.mp3': 'x' }).fetch, baseUrl: '/' })
    a.requestWelcome()
    a.cancelWelcome()
    await a.unlock()
    await flush()
    expect(a.voice.playing).toBeNull()
  })
})

/** A backend whose lines last until the test finishes them. */
function manualBackend() {
  const live = new Map<string, () => void>()
  const started: string[] = []
  const backend: VoiceBackend = {
    start: async (id, onEnd) => {
      started.push(id)
      live.set(id, onEnd)
      const h: VoiceHandle = { stop: () => { live.delete(id); onEnd() } }
      return h
    },
  }
  return { backend, started, finish: (id: string) => { live.get(id)?.(); live.delete(id) } }
}

describe('voice queue', () => {
  it('AUD-030 lines never overlap: the next one starts only when the last ends', async () => {
    const m = manualBackend()
    const ducks: boolean[] = []
    const q = new VoiceQueue(m.backend, { onDuck: (d) => ducks.push(d) })
    q.say('a'); q.say('b')
    await flush(0)
    expect(m.started).toEqual(['a'])
    expect(q.waiting).toEqual(['b'])
    m.finish('a')
    await flush(0)
    expect(m.started).toEqual(['a', 'b'])
    expect(ducks).toEqual([true]) // stays ducked across the hand-over
    m.finish('b')
    expect(ducks).toEqual([true, false])
  })

  it('AUD-031 stale lines are dropped, duplicates coalesce, and the queue is bounded', async () => {
    const m = manualBackend()
    const clock = { t: 0 }
    const q = new VoiceQueue(m.backend, { now: () => clock.t, maxWaitMs: 5000, maxQueue: 2 })
    q.say('a'); q.say('b'); q.say('b')
    expect(q.waiting).toEqual(['b'])
    q.say('c'); q.say('d')
    expect(q.waiting).toEqual(['c', 'd']) // b was the oldest and fell off the end
    clock.t = 9000
    await flush(0)
    m.finish('a')
    await flush(0)
    expect(m.started).toEqual(['a']) // c and d went stale while a was speaking
    expect(q.stats.dropped).toEqual(['b', 'c', 'd'])
  })

  it('AUD-032 cancel stops a playing line and passes on to the next', async () => {
    const m = manualBackend()
    const q = new VoiceQueue(m.backend)
    q.say('brief'); q.say('r1')
    await flush(0)
    q.cancel('brief')
    await flush(0)
    expect(m.started).toEqual(['brief', 'r1'])
    expect(q.playing).toBe('r1')
  })
})
