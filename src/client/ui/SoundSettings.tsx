// Sound settings panel (data-testid audio-panel): master, effects, music and voice sliders plus a voice mute.
// Rendered by AudioHost; values persist through the audio manager.
import { audio, type AudioSettings } from '../audio/manager'

const panel: React.CSSProperties = { background: 'rgba(29,26,22,.94)', border: '1px solid #8a7a5c', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: '#e8dfc8', display: 'grid', gridTemplateColumns: 'auto 110px', gap: '6px 8px', alignItems: 'center' }

type VolumeKey = 'master' | 'sfx' | 'music' | 'voice'
const SLIDERS: [string, VolumeKey][] = [['Master', 'master'], ['Effects', 'sfx'], ['Music', 'music'], ['Voice', 'voice']]

export function SoundSettings({ settings: s }: { settings: AudioSettings }) {
  return (
    <div style={panel} data-testid="audio-panel">
      {SLIDERS.map(([label, key]) => (
        <SliderRow key={key} label={label} id={key} value={s[key]} onChange={(v) => audio.set({ [key]: v })} />
      ))}
      <label htmlFor="aud-voice-mute">Mute voice</label>
      <input id="aud-voice-mute" data-testid="audio-voice-mute" type="checkbox" checked={s.voiceMuted} onChange={(e) => audio.set({ voiceMuted: e.target.checked })} />
    </div>
  )
}

function SliderRow({ label, id, value, onChange }: { label: string; id: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <label htmlFor={`aud-${id}`}>{label}</label>
      <input id={`aud-${id}`} data-testid={`audio-${id}`} type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </>
  )
}
