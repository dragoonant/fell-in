import { Board } from './board/Board'
import { useStore, type CameraPreset } from './store'

const PRESET_LABELS: [CameraPreset, string][] = [['overview', 'Overview'], ['near', 'Near seat'], ['far', 'Far seat'], ['top', 'Top down']]

export function GameScreen() {
  const preset = useStore((s) => s.preset)
  const setPreset = useStore((s) => s.setPreset)
  const back = useStore((s) => s.backToStart)
  return (
    <div className="game" data-testid="game-screen">
      <div className="hud">
        <span className="title">Fell-in: Wasteland Warfair</span>
        {PRESET_LABELS.map(([id, label]) => (
          <button key={id} aria-pressed={preset === id} data-testid={`cam-${id}`} onClick={() => setPreset(id)}>{label}</button>
        ))}
        <button onClick={back}>Menu</button>
      </div>
      <Board />
    </div>
  )
}
