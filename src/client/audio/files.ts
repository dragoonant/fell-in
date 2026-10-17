// File bank: fetches the manifest once (a 404 is fine) and decodes audio files lazily, one decode per file, cached.
import { EMPTY_MANIFEST, MANIFEST_PATH, parseManifest, resolveAudioUrl, type AudioKind, type AudioManifest } from './manifest'

export interface BankDeps {
  fetch?: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>
  baseUrl?: string
  getContext: () => BaseAudioContext | null
}

const defaultBase = (): string => { try { return import.meta.env.BASE_URL || '/' } catch { return '/' } }

export class FileBank {
  manifest: AudioManifest = EMPTY_MANIFEST
  private manifestPromise: Promise<AudioManifest> | null = null
  private manifestDone = false
  private buffers = new Map<string, AudioBuffer>()
  private pending = new Map<string, Promise<AudioBuffer | null>>()
  private failed = new Set<string>()
  constructor(private deps: BankDeps) {}

  private get base(): string { return this.deps.baseUrl ?? defaultBase() }
  private doFetch(url: string) {
    const f = this.deps.fetch ?? (typeof fetch === 'function' ? (fetch as unknown as NonNullable<BankDeps['fetch']>) : null)
    if (!f) return Promise.reject(new Error('no fetch'))
    return f(url)
  }

  /** Fetch the manifest once. Never rejects: any failure leaves the empty manifest in place. */
  loadManifest(): Promise<AudioManifest> {
    this.manifestPromise ??= (async () => {
      try {
        const r = await this.doFetch(resolveAudioUrl(this.base, MANIFEST_PATH))
        if (r.ok) this.manifest = parseManifest(await r.json())
      } catch { /* offline, 404 or bad json: stay synthesised */ }
      this.manifestDone = true
      return this.manifest
    })()
    return this.manifestPromise
  }

  /** True once the manifest fetch has finished (found or not). */
  get loaded(): boolean { return this.manifestDone }
  path(kind: AudioKind, id: string): string | null { return this.manifest[kind][id] ?? null }
  has(kind: AudioKind, id: string): boolean { return this.path(kind, id) !== null }
  cached(kind: AudioKind, id: string): AudioBuffer | null { return this.buffers.get(`${kind}:${id}`) ?? null }

  /** Decode a file on first use; later calls reuse the buffer. Resolves null when there is no file or it fails. */
  async load(kind: AudioKind, id: string): Promise<AudioBuffer | null> {
    await this.loadManifest()
    const key = `${kind}:${id}`
    const hit = this.buffers.get(key)
    if (hit) return hit
    const rel = this.path(kind, id)
    if (!rel || this.failed.has(key)) return null
    const ctx = this.deps.getContext()
    if (!ctx) return null
    let p = this.pending.get(key)
    if (!p) {
      p = (async () => {
        try {
          const r = await this.doFetch(resolveAudioUrl(this.base, rel))
          if (!r.ok) throw new Error('http')
          const buf = await ctx.decodeAudioData(await r.arrayBuffer())
          this.buffers.set(key, buf)
          return buf
        } catch { this.failed.add(key); return null } finally { this.pending.delete(key) }
      })()
      this.pending.set(key, p)
    }
    return p
  }
}
