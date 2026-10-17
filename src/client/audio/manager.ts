// Web Audio manager. Buses: sfx, music and voice -> master. Unlocked on the first click, tap or key. Volumes and mute
// persist in localStorage (try/catch). Sounds come from files named in public/audio/manifest.json when a file exists
// and has been decoded, otherwise from the synth recipe (synth.ts); with no manifest everything is synthesised.
// Throttling: retrigger gap and a concurrency cap per sound id, plus a little random pitch jitter. Voice lines play one
// at a time through the voice bus and duck the music while they speak (voice.ts).
import { FileBank, type BankDeps } from './files'
import { FileMusicPlayer } from './filePlayer'
import { SFX_ALIASES } from './manifest'
import { RECIPES, MoodPlayer, proceduralMood, type Mood } from './synth'
import { VoiceQueue, type SayOptions, type VoiceHandle } from './voice'

export const MUSIC_DB = -14
export const DUCK_DB = -6
const dbToGain = (db: number): number => Math.pow(10, db / 20)
const KEY = 'fellin.audio.v1'
const MAX_CONCURRENT = 4
const MIN_RETRIGGER_MS = 35
const GAP_MS: Record<string, number> = {
  death: 600, geiger: 300, 'round-start': 800, victory: 2000, defeat: 2000,
  radiation: 300, objective: 800, search: 500, heal: 500, climb: 400, fall: 600,
}
const gapFor = (id: string): number => GAP_MS[id] ?? (id.startsWith('death-') ? 600 : MIN_RETRIGGER_MS)
const JITTER_CENTS = 35
const CROSSFADE_S = 1.8
/** Moods that play their file once instead of looping. */
const ONE_SHOT: ReadonlySet<Mood> = new Set<Mood>(['victory', 'defeat'])

export interface AudioSettings { master: number; sfx: number; music: number; voice: number; muted: boolean; voiceMuted: boolean }
const DEFAULTS: AudioSettings = { master: 0.8, sfx: 1, music: 0.8, voice: 1, muted: false, voiceMuted: false }
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))
const VOLUME_KEYS = ['master', 'sfx', 'music', 'voice'] as const

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const d = JSON.parse(raw) as Partial<AudioSettings>
    return {
      master: typeof d.master === 'number' ? clamp01(d.master) : DEFAULTS.master,
      sfx: typeof d.sfx === 'number' ? clamp01(d.sfx) : DEFAULTS.sfx,
      music: typeof d.music === 'number' ? clamp01(d.music) : DEFAULTS.music,
      voice: typeof d.voice === 'number' ? clamp01(d.voice) : DEFAULTS.voice,
      muted: d.muted === true,
      voiceMuted: d.voiceMuted === true,
    }
  } catch { return { ...DEFAULTS } }
}
function saveAudioSettings(s: AudioSettings): void { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }

/** Test seams: a fake context, fetch, base url and clock. Production passes nothing. */
export interface AudioDeps {
  createContext?: () => AudioContext | null
  fetch?: BankDeps['fetch']
  baseUrl?: string
  now?: () => number
  random?: () => number
}

interface MusicPlayer { tick(until: number): void; fadeOut(s: number): void }

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private voiceBus: GainNode | null = null
  private settings: AudioSettings = loadAudioSettings()
  private listeners = new Set<(s: AudioSettings) => void>()
  private throttle = new Map<string, { active: number; last: number }>()
  private attached = false
  private unlocked = false
  private ducked = false
  private mood: Mood | null = null
  private wantMood: Mood | null = null
  private moodToken = 0
  private playerKey: string | null = null
  private players: MusicPlayer[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private welcomePending = false
  private welcomeDone = false
  private readonly deps: AudioDeps
  private readonly now: () => number
  private readonly random: () => number
  readonly bank: FileBank
  readonly voice: VoiceQueue
  readonly stats = { played: {} as Record<string, number>, mood: '' as string, files: {} as Record<string, number> }

  constructor(deps: AudioDeps = {}) {
    this.deps = deps
    this.now = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.random = deps.random ?? Math.random
    this.bank = new FileBank({
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(deps.baseUrl !== undefined ? { baseUrl: deps.baseUrl } : {}),
      getContext: () => this.ctx,
    })
    this.voice = new VoiceQueue({ start: (id, onEnd) => this.startVoice(id, onEnd) }, { now: this.now, onDuck: (d) => this.setDuck(d) })
  }

  get isUnlocked(): boolean { return this.unlocked }
  get currentMood(): Mood | null { return this.mood }
  get isDucked(): boolean { return this.ducked }
  getSettings(): AudioSettings { return { ...this.settings } }
  subscribe(fn: (s: AudioSettings) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }

  set(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch }
    for (const k of VOLUME_KEYS) this.settings[k] = clamp01(this.settings[k])
    saveAudioSettings(this.settings)
    this.applyGains()
    if (this.settings.voiceMuted || this.settings.muted) this.voice.clear()
    for (const fn of this.listeners) fn(this.getSettings())
  }

  private applyGains(tc = 0.03): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus || !this.voiceBus) return
    const t = this.ctx.currentTime
    const s = this.settings
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03)
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03)
    this.musicBus.gain.setTargetAtTime(s.music * dbToGain(MUSIC_DB) * (this.ducked ? dbToGain(DUCK_DB) : 1), t, tc)
    this.voiceBus.gain.setTargetAtTime(s.voiceMuted ? 0 : s.voice, t, 0.03)
  }

  private setDuck(on: boolean): void {
    this.ducked = on
    this.applyGains(0.15)
  }

  /** One-time listeners: the first pointer, key or touch unlocks audio. Safe to call repeatedly. */
  attachAutoUnlock(): void {
    if (this.attached || typeof window === 'undefined') return
    this.attached = true
    void this.bank.loadManifest()
    const handler = () => {
      window.removeEventListener('pointerdown', handler, true)
      window.removeEventListener('keydown', handler, true)
      window.removeEventListener('touchstart', handler, true)
      void this.unlock()
    }
    window.addEventListener('pointerdown', handler, true)
    window.addEventListener('keydown', handler, true)
    window.addEventListener('touchstart', handler, true)
    window.addEventListener('pointerdown', (e) => {
      const t = e.target as Element | null
      if (this.unlocked && t?.closest?.('button') && !t.closest('[data-testid="audio-toggle"], [data-testid="audio-panel"]')) this.play('ui-click', { volume: 0.5 })
    })
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return
    try {
      let ctx: AudioContext | null = null
      if (this.deps.createContext) ctx = this.deps.createContext()
      else if (typeof window !== 'undefined') {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        ctx = AC ? new AC() : null
      }
      if (!ctx) return
      this.ctx = ctx
      this.master = ctx.createGain(); this.sfxBus = ctx.createGain(); this.musicBus = ctx.createGain(); this.voiceBus = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      this.sfxBus.connect(this.master); this.musicBus.connect(this.master); this.voiceBus.connect(this.master)
      this.master.connect(comp); comp.connect(ctx.destination)
      this.applyGains()
      if (ctx.state === 'suspended') await ctx.resume()
      this.unlocked = true
      void this.bank.loadManifest()
      if (this.wantMood) this.setMood(this.wantMood)
      if (this.welcomePending) { this.welcomePending = false; this.welcomeDone = true; this.say('welcome', { interruptible: true }) }
    } catch { /* audio unavailable: stay silent */ }
  }

  /** Fire-and-forget sfx. A decoded file wins over the synth recipe; ids with neither stay silent. */
  play(id: string, opts: { volume?: number; delayMs?: number; detune?: number } = {}): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxBus || !this.unlocked || this.settings.muted) return
    const buffer = this.bank.cached('sfx', id)
    const recipe = RECIPES[id] ?? RECIPES[SFX_ALIASES[id] ?? '']
    const hasFile = this.bank.has('sfx', id)
    if (!buffer && !recipe && !hasFile) return
    const th = this.throttle.get(id) ?? { active: 0, last: -1e9 }
    const n = this.now()
    if (n - th.last < gapFor(id) || th.active >= MAX_CONCURRENT) return
    th.last = n; th.active++
    this.throttle.set(id, th)
    let released = false
    const release = () => { if (!released) { released = true; th.active = Math.max(0, th.active - 1) } }
    const delay = opts.delayMs ?? 0
    const jitter = opts.detune ?? JITTER_CENTS
    const p = Math.pow(2, ((this.random() * 2 - 1) * jitter) / 1200)
    const v = opts.volume ?? 1
    const out = this.sfxBus
    const when = () => ctx.currentTime + 0.01 + delay / 1000
    const bump = (source: string) => {
      this.stats.played[id] = (this.stats.played[id] ?? 0) + 1
      this.stats.files[source] = (this.stats.files[source] ?? 0) + 1
    }
    if (buffer) {
      this.startBuffer(buffer, out, when(), p, v, release, delay)
      bump('file')
      return
    }
    if (recipe) {
      try { recipe({ ctx, out, t: when(), p, v }) } catch { /* ignore */ }
      bump('synth')
      setTimeout(release, 400 + delay)
      if (hasFile) void this.bank.load('sfx', id) // decode now so the next play uses the file
      return
    }
    // A file with no recipe to cover the first play: wait for the decode, then play late rather than never.
    void this.bank.load('sfx', id).then((b) => {
      if (!b || this.settings.muted) { release(); return }
      this.startBuffer(b, out, when(), p, v, release, delay)
      bump('file')
    })
  }

  private startBuffer(buf: AudioBuffer, out: AudioNode, t: number, p: number, v: number, release: () => void, delay: number): void {
    const ctx = this.ctx!
    try {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = p
      const g = ctx.createGain()
      g.gain.value = v
      src.connect(g); g.connect(out)
      src.onended = () => { release(); try { src.disconnect(); g.disconnect() } catch { /* ignore */ } }
      src.start(t)
      setTimeout(release, (buf.duration / p) * 1000 + delay + 500) // onended never fires on a closed context
    } catch { release() }
  }

  // ---------- voice ----------
  /** Queue a spoken line (a no-op until audio is unlocked, and when the line has no file). */
  say(id: string, opts: SayOptions = {}): void {
    if (!this.unlocked || this.settings.muted || this.settings.voiceMuted) return
    this.voice.say(id, opts)
  }
  cancelVoice(id: string): void { this.voice.cancel(id) }
  hasVoice(id: string): boolean { return this.bank.has('voice', id) }
  hasMusicFile(m: Mood): boolean { return this.bank.has('music', m) }

  /** The start screen asks for the welcome line; it speaks once, on the first click that unlocks audio. */
  requestWelcome(): void {
    if (this.welcomeDone) return
    if (this.unlocked) { this.welcomeDone = true; return }
    this.welcomePending = true
  }
  /** The start screen is leaving before any click: no stray welcome later. */
  cancelWelcome(): void { this.welcomePending = false }

  private async startVoice(id: string, onEnd: () => void): Promise<VoiceHandle | null> {
    const buf = await this.bank.load('voice', id)
    const ctx = this.ctx
    if (!buf || !ctx || !this.voiceBus || this.settings.muted || this.settings.voiceMuted) return null
    let src: AudioBufferSourceNode
    try {
      src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.voiceBus)
    } catch { return null }
    let ended = false
    const end = () => { if (ended) return; ended = true; try { src.disconnect() } catch { /* ignore */ } onEnd() }
    src.onended = end
    try { src.start(ctx.currentTime + 0.02) } catch { return null }
    this.stats.played[`voice:${id}`] = (this.stats.played[`voice:${id}`] ?? 0) + 1
    return { stop: () => { try { src.stop() } catch { /* not started */ } end() } }
  }

  // ---------- music ----------
  /** Crossfades to a mood (1.8 s). Remembered until audio unlocks. Files win over the synth; victory and defeat play once. */
  setMood(m: Mood | null): void {
    this.wantMood = m
    if (!this.ctx || !this.musicBus || !this.unlocked || m === this.mood) return
    this.mood = m
    this.stats.mood = m ?? ''
    const token = ++this.moodToken
    if (!m) { this.enter(null, null); return }
    const procedural = () => this.enter(`proc:${proceduralMood(m)}`, () => new MoodPlayer(this.ctx!, this.musicBus!, proceduralMood(m), CROSSFADE_S))
    if (this.bank.loaded && !this.bank.has('music', m)) { procedural(); return }
    void this.bank.load('music', m).then((buf) => {
      if (token !== this.moodToken || !this.ctx || !this.musicBus) return // a newer mood was asked for meanwhile
      if (!buf) { procedural(); return }
      this.enter(`file:${m}`, () => new FileMusicPlayer(this.ctx!, this.musicBus!, buf, !ONE_SHOT.has(m), CROSSFADE_S))
    })
  }

  private enter(key: string | null, make: (() => MusicPlayer) | null): void {
    if (key !== null && key === this.playerKey) return
    for (const old of this.players) old.fadeOut(CROSSFADE_S)
    this.players = []
    this.playerKey = key
    if (!key || !make) return
    this.players.push(make())
    if (!this.timer) this.timer = setInterval(() => this.pump(), 120)
  }

  private pump(): void {
    if (!this.ctx) return
    for (const p of this.players) p.tick(this.ctx.currentTime + 0.5)
  }
}

export const audio = new AudioManager()
