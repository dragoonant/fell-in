// Mount once inside GameScreen: unlocks audio on first click, plays sounds from presentation cues, sets the music mood,
// speaks the round, turn and game-over voice lines, and shows the sound toggle + settings popover (data-testid audio-toggle).
import { useEffect, useState } from 'react'
import { onCue } from '../presentation/director'
import { usePresentedStore } from '../presentation/presentedStore'
import { useGameStore, ownerSeat } from '../store/gameStore'
import { SoundSettings } from '../ui/SoundSettings'
import { deathKindOf, soundsForCue } from './cueSounds'
import { audio, type AudioSettings } from './manager'
import { roundVoiceId } from './manifest'
import { yourTurnRound } from './triggers'

const box: React.CSSProperties = { position: 'fixed', right: 12, bottom: 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }

/** `death-<kind>` for a model, read from its unit record. */
function deathSoundFor(modelId: string): string {
  const { state, bundle } = useGameStore.getState()
  const m = state?.models[modelId]
  const unit = m && bundle ? bundle.records.units.find((u) => u.id === m.profileId) : null
  return `death-${deathKindOf(unit)}`
}

export function AudioHost() {
  const [s, setS] = useState<AudioSettings>(() => audio.getSettings())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    audio.attachAutoUnlock()
    audio.setMood('battle')
    let lastTurnRound = 0
    let wasOver = false
    const offSettings = audio.subscribe(setS)
    const offCue = onCue((cue, beat) => {
      let outcome: 'victory' | 'defeat' | null = null
      if (cue.kind === 'banner') {
        if (cue.tone === 'round') {
          const line = roundVoiceId(cue.round, useGameStore.getState().state?.maxRounds)
          if (line) audio.say(line)
        } else if (cue.tone === 'gameOver') {
          const humanWon = !!cue.winner && useGameStore.getState().controllers[cue.winner] === 'human'
          outcome = humanWon ? 'victory' : 'defeat'
          audio.setMood(outcome)
          audio.say(outcome)
        }
      }
      for (const c of soundsForCue(cue, beat.durationMs, outcome === 'victory', { deathSound: deathSoundFor })) {
        // A music file for the outcome is the sting; the synthesised sting only covers for a missing file.
        if (outcome && c.id === outcome && audio.hasMusicFile(outcome)) continue
        audio.play(c.id, { volume: c.volume, delayMs: c.delayMs })
      }
    })
    // The first decision of each round that belongs to the human seat, once the presentation has caught up.
    const offPresented = usePresentedStore.subscribe((p) => {
      const st = p.state
      if (!st) return
      if (st.phase === 'over') { wasOver = true; return }
      if (wasOver) { wasOver = false; lastTurnRound = 0; audio.setMood('battle') } // Play again
      if (st.round < lastTurnRound) lastTurnRound = 0
      const g = useGameStore.getState()
      const r = yourTurnRound({ round: st.round, phase: st.phase, seat: ownerSeat(st.pending, g) }, g.controllers, lastTurnRound)
      if (r !== null) { lastTurnRound = r; audio.say('your-turn') }
    })
    return () => { offCue(); offSettings(); offPresented(); audio.voice.clear(); audio.setMood('menu') }
  }, [])

  return (
    <div style={box}>
      {open && <SoundSettings settings={s} />}
      <div style={{ display: 'flex', gap: 6 }}>
        <button data-testid="audio-toggle" aria-pressed={!s.muted} aria-label={s.muted ? 'Unmute sound' : 'Mute sound'} title={s.muted ? 'Sound off' : 'Sound on'} onClick={() => audio.set({ muted: !s.muted })}>
          {s.muted ? 'Sound off' : 'Sound on'}
        </button>
        <button data-testid="audio-volume" aria-expanded={open} aria-label="Volume" onClick={() => setOpen((o) => !o)}>Vol</button>
      </div>
    </div>
  )
}
