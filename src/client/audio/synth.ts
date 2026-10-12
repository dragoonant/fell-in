// Procedural sound recipes (Web Audio only, no files). Every recipe schedules nodes into `out` starting at time `t`.
// `p` is a pitch multiplier (detune jitter) and `v` a volume scale. Dependency free so public/sounds.html can load it.

export interface Ctx { ctx: BaseAudioContext; out: AudioNode; t: number; p: number; v: number }
export type Recipe = (c: Ctx) => void

const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>()
function noiseBuf(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBufs.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseBufs.set(ctx, b)
  }
  return b
}

/** Gain node with an attack/exponential decay envelope. */
function envGain(c: Ctx, t: number, peak: number, atk: number, dur: number): GainNode {
  const g = c.ctx.createGain()
  const pk = Math.max(0.0002, peak * c.v)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(pk, t + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur)
  g.connect(c.out)
  return g
}

/** Pitched oscillator sliding f0 -> f1 over dur. */
function tone(c: Ctx, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, atk = 0.003): OscillatorNode {
  const o = c.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0 * c.p, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * c.p), t + dur)
  o.connect(envGain(c, t, peak, atk, dur))
  o.start(t); o.stop(t + atk + dur + 0.05)
  return o
}

/** Filtered noise burst; the filter sweeps f0 -> f1. */
function hiss(c: Ctx, kind: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number, peak: number, atk = 0.002): void {
  const s = c.ctx.createBufferSource()
  s.buffer = noiseBuf(c.ctx)
  s.playbackRate.value = c.p
  const f = c.ctx.createBiquadFilter()
  f.type = kind; f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur)
  s.connect(f); f.connect(envGain(c, t, peak, atk, dur))
  s.start(t, Math.random() * 1.5); s.stop(t + atk + dur + 0.05)
}

const at = (c: Ctx, dt: number): Ctx => ({ ...c, t: c.t + dt })

function shot(c: Ctx, thump: number, crack: number, tail: number, body: number): void {
  hiss(c, 'highpass', crack, crack * 0.4, 0.7, c.t, 0.05, 0.9) // crest
  hiss(c, 'bandpass', body, body * 0.35, 0.8, c.t, tail * 0.5, 0.7) // body
  tone(c, 'sine', thump, thump * 0.35, c.t, 0.16, 0.9) // low thump
  hiss(c, 'lowpass', 1800, 250, 0.5, c.t + 0.01, tail, 0.35, 0.01) // tail
}

function click(c: Ctx, dt: number, f: number, peak: number): void {
  const k = at(c, dt)
  hiss(k, 'bandpass', f, f * 0.7, 6, k.t, 0.03, peak)
}

// D3 Eb3 F#3 G3 A3: a dusty Phrygian-dominant colour
const scale = [146.83, 155.56, 185, 196, 220]

export const RECIPES: Record<string, Recipe> = {
  'shot-pistol': (c) => shot(c, 150, 3500, 0.22, 1500),
  'shot-rifle': (c) => { shot(c, 110, 3000, 0.45, 1000); hiss(at(c, 0.09), 'bandpass', 600, 200, 1, c.t + 0.09, 0.3, 0.1) },
  'shot-shotgun': (c) => { shot(c, 80, 2500, 0.55, 700); shot(at(c, 0.004), 120, 4000, 0.2, 1800) },
  laser: (c) => {
    tone(c, 'sawtooth', 2400, 220, c.t, 0.22, 0.45)
    tone(c, 'square', 1800, 160, c.t, 0.18, 0.2)
    hiss(c, 'highpass', 5000, 2000, 0.5, c.t, 0.05, 0.3)
  },
  plasma: (c) => {
    const car = c.ctx.createOscillator(), mod = c.ctx.createOscillator(), mg = c.ctx.createGain()
    car.type = 'sine'; mod.type = 'sine'
    car.frequency.setValueAtTime(180 * c.p, c.t); car.frequency.exponentialRampToValueAtTime(620 * c.p, c.t + 0.35)
    mod.frequency.setValueAtTime(37 * c.p, c.t); mod.frequency.linearRampToValueAtTime(90 * c.p, c.t + 0.35)
    mg.gain.setValueAtTime(260, c.t); mg.gain.linearRampToValueAtTime(40, c.t + 0.35)
    mod.connect(mg); mg.connect(car.frequency)
    car.connect(envGain(c, c.t, 0.6, 0.02, 0.4))
    car.start(c.t); mod.start(c.t); car.stop(c.t + 0.5); mod.stop(c.t + 0.5)
    hiss(c, 'bandpass', 900, 3000, 3, c.t, 0.3, 0.25, 0.05)
  },
  explosion: (c) => {
    hiss(c, 'lowpass', 3000, 90, 0.7, c.t, 1.1, 1.0, 0.004)
    tone(c, 'sine', 90, 28, c.t, 0.9, 1.0)
    hiss(c, 'lowpass', 400, 60, 1, c.t + 0.1, 1.6, 0.5, 0.1) // rumble
    hiss(c, 'highpass', 4000, 1500, 0.5, c.t, 0.08, 0.5)
  },
  'melee-bat': (c) => { tone(c, 'sine', 170, 55, c.t, 0.13, 0.9); hiss(c, 'lowpass', 1200, 300, 0.8, c.t, 0.09, 0.7); hiss(c, 'bandpass', 2500, 1800, 2, c.t, 0.02, 0.3) },
  'melee-blade': (c) => { hiss(c, 'bandpass', 1500, 6000, 2.5, c.t, 0.18, 0.55, 0.05); tone(c, 'triangle', 2600, 2200, c.t + 0.15, 0.12, 0.12, 0.002) },
  'melee-bite': (c) => { hiss(c, 'bandpass', 1800, 700, 4, c.t, 0.05, 0.6); hiss(at(c, 0.06), 'bandpass', 1400, 500, 4, c.t + 0.06, 0.07, 0.5); tone(c, 'sine', 120, 70, c.t, 0.1, 0.4) },
  'melee-claw': (c) => { for (let i = 0; i < 3; i++) hiss(at(c, i * 0.035), 'bandpass', 3500 - i * 500, 1200, 2, c.t + i * 0.035, 0.1, 0.4, 0.01); tone(c, 'sine', 100, 50, c.t + 0.1, 0.15, 0.5) },
  'armor-clink': (c) => { tone(c, 'triangle', 2100, 2050, c.t, 0.25, 0.3, 0.001); tone(c, 'sine', 3340, 3300, c.t, 0.18, 0.18, 0.001); hiss(c, 'highpass', 5000, 4000, 1, c.t, 0.02, 0.2) },
  hit: (c) => { hiss(c, 'bandpass', 700, 300, 1.5, c.t, 0.08, 0.7); tone(c, 'sine', 140, 80, c.t, 0.08, 0.35) },
  death: (c) => { tone(c, 'sine', 110, 38, c.t, 0.4, 0.9); hiss(c, 'lowpass', 900, 120, 0.8, c.t, 0.35, 0.6, 0.01); hiss(at(c, 0.28), 'lowpass', 500, 100, 0.8, c.t + 0.28, 0.12, 0.3) },
  step: (c) => { hiss(c, 'lowpass', 900 + Math.random() * 500, 250, 0.8, c.t, 0.07, 0.35, 0.008); hiss(c, 'bandpass', 3500, 2500, 1, c.t + 0.01, 0.04, 0.08) },
  'dice-d20': (c) => { for (let i = 0; i < 7; i++) click(c, i * 0.055 + Math.random() * 0.02, 1800 + Math.random() * 1400, 0.4 * (1 - i * 0.1)) },
  'dice-d12': (c) => { for (let i = 0; i < 5; i++) click(c, i * 0.06 + Math.random() * 0.025, 1100 + Math.random() * 900, 0.45 * (1 - i * 0.12)) },
  'ui-click': (c) => { hiss(c, 'bandpass', 2400, 1800, 3, c.t, 0.025, 0.35); tone(c, 'square', 900, 700, c.t, 0.025, 0.06) },
  'ui-confirm': (c) => { tone(c, 'triangle', 440, 440, c.t, 0.12, 0.35); tone(c, 'triangle', 660, 660, c.t + 0.07, 0.18, 0.35) },
  'ui-cancel': (c) => { tone(c, 'triangle', 392, 392, c.t, 0.1, 0.3); tone(c, 'triangle', 262, 262, c.t + 0.07, 0.16, 0.3) },
  'round-start': (c) => { // low horn-ish fifth, then a bell
    tone(c, 'sawtooth', 146.8, 146.8, c.t, 0.9, 0.22, 0.08); tone(c, 'sawtooth', 220, 220, c.t, 0.9, 0.16, 0.08)
    tone(c, 'sine', 880, 880, c.t + 0.2, 0.9, 0.18, 0.003); tone(c, 'sine', 1318, 1318, c.t + 0.2, 0.5, 0.08, 0.003)
  },
  victory: (c) => { [293.7, 370, 440, 587].forEach((f, i) => { tone(c, 'triangle', f, f, c.t + i * 0.16, 0.9, 0.3, 0.01); tone(c, 'sawtooth', f / 2, f / 2, c.t + i * 0.16, 0.9, 0.08, 0.02) }) },
  defeat: (c) => { [293.7, 277, 261.6, 196].forEach((f, i) => { tone(c, 'triangle', f, f * 0.97, c.t + i * 0.28, 1.1, 0.28, 0.02); tone(c, 'sawtooth', f / 2, f / 2, c.t + i * 0.28, 1.1, 0.07, 0.03) }) },
  geiger: (c) => { const n = 6 + Math.floor(Math.random() * 6); let x = 0; for (let i = 0; i < n; i++) { x += Math.random() * 0.09; hiss(at(c, x), 'highpass', 4500, 3500, 1, c.t + x, 0.012, 0.35, 0.0005) } },
}
export const SOUND_IDS = Object.keys(RECIPES)

// ---------- music ----------
export type Mood = 'calm' | 'battle'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** One mood's generator: a drone, a twangy plucked line through an echo, and sparse percussion. */
export class MoodPlayer {
  private gain: GainNode
  private nodes: AudioNode[] = []
  private oscs: OscillatorNode[] = []
  private echoIn: GainNode
  private next: number
  private step = 0
  private rand: () => number
  private phrase: number[] = []
  private stopped = false
  private readonly bpm: number
  private ctx: BaseAudioContext
  readonly mood: Mood
  constructor(ctx: BaseAudioContext, dest: AudioNode, mood: Mood, fadeIn: number, seed = 7) {
    this.ctx = ctx
    this.mood = mood
    this.bpm = mood === 'calm' ? 60 : 88
    this.rand = rng(seed + (mood === 'calm' ? 1 : 2))
    this.gain = ctx.createGain()
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    this.gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn)
    this.gain.connect(dest)
    this.echoIn = ctx.createGain()
    const delay = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter()
    delay.delayTime.value = (60 / this.bpm) * 0.75; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 1800
    this.echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(this.gain)
    this.nodes.push(this.echoIn, delay, fb, lp)
    this.buildDrone()
    this.next = ctx.currentTime + 0.1
    this.newPhrase()
  }
  private buildDrone(): void {
    const c = this.ctx
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.mood === 'calm' ? 420 : 620; lp.Q.value = 2
    const dg = c.createGain(); dg.gain.value = this.mood === 'calm' ? 0.2 : 0.26
    const lfo = c.createOscillator(), lg = c.createGain()
    lfo.frequency.value = this.mood === 'calm' ? 0.07 : 0.13; lg.gain.value = 180
    lfo.connect(lg); lg.connect(lp.frequency)
    const freqs = this.mood === 'calm' ? [73.42, 73.9, 110.2] : [73.42, 73.0, 110.0, 146.8]
    for (const f of freqs) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); this.oscs.push(o) }
    lfo.start(); this.oscs.push(lfo)
    lp.connect(dg); dg.connect(this.gain)
    this.nodes.push(lp, dg, lg)
  }
  private newPhrase(): void {
    const ph: number[] = []
    let i = this.rand() < 0.5 ? 0 : 4
    for (let k = 0; k < 8; k++) {
      if (this.rand() < (this.mood === 'calm' ? 0.45 : 0.25)) ph.push(-1)
      else { i = Math.max(0, Math.min(scale.length * 2 - 1, i + Math.round((this.rand() - 0.5) * 3))); ph.push(i) }
    }
    this.phrase = ph
  }
  private pluck(t: number, idx: number): void {
    const c = this.ctx
    const f = scale[idx % scale.length] * (idx >= scale.length ? 4 : 2)
    const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 1.004
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.35); lp.Q.value = 4
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(this.mood === 'calm' ? 0.2 : 0.25, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.gain); g.connect(this.echoIn)
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2)
  }
  private perc(t: number): void {
    const c = this.ctx
    const s = this.step % 16
    const kick = (vol: number) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.3) }
    const tick = (vol: number) => { const b = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); b.buffer = noiseBuf(c); f.type = 'highpass'; f.frequency.value = 6000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); b.connect(f); f.connect(g); g.connect(this.gain); b.start(t, this.rand()); b.stop(t + 0.06) }
    if (this.mood === 'calm') { if (s === 0) kick(0.25); if (s === 10 && this.rand() < 0.6) tick(0.05) }
    else { if (s === 0 || s === 8) kick(0.45); if (s === 6 || s === 14) kick(0.2); if (s % 2 === 0) tick(s % 4 === 0 ? 0.08 : 0.04) }
  }
  /** Schedule everything that falls before `until` (AudioContext time). */
  tick(until: number): void {
    if (this.stopped) return
    const stepLen = 60 / this.bpm / 2 // eighth notes
    while (this.next < until) {
      if (this.step > 0 && this.step % 16 === 0) this.newPhrase()
      const n = this.phrase[this.step % 8]
      if (n >= 0) this.pluck(this.next, n)
      this.perc(this.next)
      this.step++; this.next += stepLen
    }
  }
  fadeOut(s: number): void {
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now)
    this.gain.gain.exponentialRampToValueAtTime(0.0001, now + s)
    this.stopped = true
    setTimeout(() => {
      for (const o of this.oscs) { try { o.stop() } catch { /* already stopped */ } }
      for (const n of [...this.nodes, this.gain]) { try { n.disconnect() } catch { /* ignore */ } }
    }, s * 1000 + 1500)
  }
}
