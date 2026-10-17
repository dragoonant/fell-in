// Game over recap: winner, reason, final scores and a Play again button (same seat setup, fresh seed).
import { ArtImage } from './art'
import { keyArtUrl, resultArtKey } from './artView'
import { game, seatLabel, useControllers, useGame, useGameResult, usePresented } from '../contract'

export function GameOver() {
  const result = useGameResult()
  const state = usePresented()
  const controllers = useControllers()
  const g = useGame()
  if (!result || !state) return null
  const again = () => { game.newGame({ seats: g.seatOrder.map((s) => controllers[s] ?? 'bot'), ...(g.scenarioId ? { scenarioId: g.scenarioId } : {}) }) }
  const art = resultArtKey(result.winner, controllers)
  const dead = Object.values(state.models).filter((m) => m.life === 'dead' || m.offTable).length
  return (
    <div className="gameover" data-testid="hud-result" role="dialog" aria-label="Game over">
      {art && <ArtImage src={keyArtUrl(art)} className="go-art" testId={`result-art-${art}`} />}
      <div className="panel">
        <h2 data-testid="result-title">{result.winner ? `${seatLabel(result.winner)} wins${result.level ? ` (${result.level} victory)` : ''}` : 'A draw'}</h2>
        <p data-testid="result-reason">{result.reason}</p>
        <ul className="plain">
          {g.seatOrder.map((s) => <li key={s}>{seatLabel(s)}: score {state.seats[s]?.score ?? 0}</li>)}
          <li>Rounds played: {state.round}</li>
          <li>Models out of the fight: {dead}</li>
        </ul>
        <div className="options">
          <button className="primary" data-testid="play-again" onClick={again}>Play again</button>
          <button className="quiet" data-testid="hud-menu" onClick={() => game.backToMenu()}>Back to the menu</button>
        </div>
      </div>
    </div>
  )
}
