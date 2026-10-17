// Voice queue: one spoken line at a time. Lines wait their turn, stale ones are dropped, and music is ducked while a
// line plays. Playback itself is behind VoiceBackend so the rules can be tested without Web Audio.
export interface VoiceHandle { stop(): void }
export interface VoiceBackend {
  /** Start a line (load it first if needed). Resolves null when there is nothing to play. `onEnd` fires once when it finishes. */
  start(id: string, onEnd: () => void): Promise<VoiceHandle | null>
}
export interface VoiceOptions {
  now?: () => number
  /** A queued line older than this is dropped instead of played. */
  maxWaitMs?: number
  /** At most this many lines wait; the oldest is dropped first. */
  maxQueue?: number
  onDuck?: (ducked: boolean) => void
}
export interface SayOptions {
  /** A playing interruptible line (the welcome) is cut when another line is said. */
  interruptible?: boolean
}
interface Entry { id: string; at: number; interruptible: boolean }

export class VoiceQueue {
  private queue: Entry[] = []
  private current: { id: string; interruptible: boolean; handle: VoiceHandle | null; done: boolean } | null = null
  private ducked = false
  private readonly now: () => number
  private readonly maxWaitMs: number
  private readonly maxQueue: number
  readonly stats = { started: [] as string[], dropped: [] as string[] }

  constructor(private backend: VoiceBackend, opts: VoiceOptions = {}) {
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.maxWaitMs = opts.maxWaitMs ?? 8000
    this.maxQueue = opts.maxQueue ?? 2
    this.onDuck = opts.onDuck ?? (() => undefined)
  }
  private onDuck: (ducked: boolean) => void

  get isDucked(): boolean { return this.ducked }
  get playing(): string | null { return this.current?.id ?? null }
  get waiting(): string[] { return this.queue.map((e) => e.id) }

  say(id: string, opts: SayOptions = {}): void {
    if (this.current?.id === id || this.queue.some((e) => e.id === id)) return // the same line is already coming
    // Welcome-style lines never wait behind anything: anything newer replaces them in the queue.
    this.queue = this.queue.filter((e) => { if (e.interruptible) this.stats.dropped.push(e.id); return !e.interruptible })
    this.queue.push({ id, at: this.now(), interruptible: !!opts.interruptible })
    while (this.queue.length > this.maxQueue) this.stats.dropped.push(this.queue.shift()!.id)
    if (this.current?.interruptible && !opts.interruptible) this.stopCurrent()
    this.pump()
  }

  /** Drop a queued line or stop it if it is playing (the briefing closing cuts its own narration). */
  cancel(id: string): void {
    this.queue = this.queue.filter((e) => e.id !== id)
    if (this.current?.id === id) this.stopCurrent()
  }

  /** Forget everything (new game, audio off). */
  clear(): void {
    this.queue = []
    this.stopCurrent()
  }

  private stopCurrent(): void {
    const c = this.current
    if (!c) return
    this.finish(c)
    try { c.handle?.stop() } catch { /* already stopped */ }
  }

  private finish(c: NonNullable<VoiceQueue['current']>): void {
    if (c.done) return
    c.done = true
    if (this.current === c) this.current = null
    this.pump()
  }

  private setDuck(on: boolean): void {
    if (this.ducked === on) return
    this.ducked = on
    this.onDuck(on)
  }

  private pump(): void {
    if (this.current) return
    let e = this.queue.shift()
    while (e && this.now() - e.at > this.maxWaitMs) { this.stats.dropped.push(e.id); e = this.queue.shift() }
    if (!e) { this.setDuck(false); return }
    const c: NonNullable<VoiceQueue['current']> = { id: e.id, interruptible: e.interruptible, handle: null, done: false }
    this.current = c
    this.backend.start(e.id, () => this.finish(c)).then(
      (h) => {
        if (c.done) { try { h?.stop() } catch { /* ignore */ } return } // cancelled while loading
        if (!h) { this.finish(c); return } // no file: carry on with the next line
        c.handle = h
        this.stats.started.push(c.id)
        this.setDuck(true)
      },
      () => this.finish(c),
    )
  }
}
