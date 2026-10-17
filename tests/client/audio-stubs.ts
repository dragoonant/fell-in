// Shared stubs for the audio tests: a Web Audio context that records what it was asked to play, and a fetch over an
// in-memory file map. Not a test file (no .test suffix).
import { vi } from 'vitest'

export interface StubSource { buffer: { tag: string; duration: number } | null; loop: boolean; playbackRate: { value: number }; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }
export interface StubGain { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }

/** Anything not modelled explicitly (oscillators, filters, delays) is a permissive proxy, enough for the synth recipes. */
function loose(): unknown {
  const store: Record<string | symbol, unknown> = {}
  return new Proxy(function () { /* callable */ }, {
    get: (_t, p) => (p === 'then' ? undefined : p in store ? store[p] : (store[p] = loose())),
    set: (_t, p, v) => { store[p] = v; return true },
    apply: () => loose(),
  })
}

export function stubContext() {
  const gains: StubGain[] = []
  const sources: StubSource[] = []
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: loose(),
    resume: async () => undefined,
    createGain: () => {
      const g: StubGain = { gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
      gains.push(g)
      return g
    },
    createBufferSource: () => {
      const s: StubSource = { buffer: null, loop: false, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }
      sources.push(s)
      return s
    },
    createBuffer: () => ({ tag: 'noise', duration: 2, getChannelData: () => new Float32Array(8) }),
    createDynamicsCompressor: () => ({ connect: vi.fn() }),
    createOscillator: () => loose(), createBiquadFilter: () => loose(), createDelay: () => loose(),
    /** The "file" is its own path as bytes, so the decoded buffer says which file it came from. */
    decodeAudioData: async (ab: ArrayBuffer) => ({ tag: new TextDecoder().decode(ab), duration: 2 }),
  }
  /** Sources that play a decoded file (not synth noise). */
  const fileSources = () => sources.filter((s) => s.buffer && s.buffer.tag !== 'noise' && s.start.mock.calls.length > 0)
  return { ctx: ctx as unknown as AudioContext, raw: ctx, gains, sources, fileSources }
}

/** Fetch over a url -> json map; anything else is a 404. A file's bytes are its own url. */
export function stubFetch(files: Record<string, unknown>) {
  const calls: string[] = []
  const fn = async (url: string) => {
    calls.push(url)
    if (!(url in files)) return { ok: false, json: async () => { throw new Error('404') }, arrayBuffer: async () => new ArrayBuffer(0) }
    const body = files[url]
    return { ok: true, json: async () => body, arrayBuffer: async () => new TextEncoder().encode(url).buffer as ArrayBuffer }
  }
  return { fetch: fn, calls }
}

export const flush = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms))
