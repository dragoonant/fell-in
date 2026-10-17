// Plays one decoded music file with a fade in. Loops seamlessly (menu, calm, battle) or plays once (victory, defeat).
// Same shape as the synth's MoodPlayer so the manager can crossfade between the two kinds.
export class FileMusicPlayer {
  private gain: GainNode
  private src: AudioBufferSourceNode
  private stopped = false
  ended = false
  constructor(private ctx: BaseAudioContext, dest: AudioNode, buffer: AudioBuffer, readonly loop: boolean, fadeIn: number) {
    this.gain = ctx.createGain()
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    this.gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn)
    this.gain.connect(dest)
    this.src = ctx.createBufferSource()
    this.src.buffer = buffer
    this.src.loop = loop
    this.src.connect(this.gain)
    this.src.onended = () => { this.ended = true }
    this.src.start(ctx.currentTime + 0.02)
  }
  /** Files need no scheduling. */
  tick(_until: number): void { void _until }
  fadeOut(s: number): void {
    if (this.stopped) return
    this.stopped = true
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now)
    this.gain.gain.exponentialRampToValueAtTime(0.0001, now + s)
    setTimeout(() => {
      try { this.src.stop() } catch { /* already stopped */ }
      try { this.src.disconnect(); this.gain.disconnect() } catch { /* ignore */ }
    }, s * 1000 + 300)
  }
}
