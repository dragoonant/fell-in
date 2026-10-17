// Game over recap: winner, reason, final scores and a Play again button (same seat setup, fresh seed).
import { useEffect, useState } from 'react'
import { ArtImage } from './art'
import { keyArtUrl, resultArtKey } from './artView'
import { game, seatLabel, useControllers, useGame, useGameResult, usePresented } from '../contract'
import { backToSettlement, useLaunchStore } from '../store/launch'
import { useGameStore } from '../store/gameStore'

export function GameOver() {
  const result = useGameResult()
  const state = usePresented()
  const controllers = useControllers()
  const g = useGame()
  const fromCampaign = useLaunchStore((s) => s.inCampaignBattle)
  // A campaign battle with a Quest card: the engine does not model Quests, so the player says whether it was done.
  const [quest, setQuest] = useState<{ cardId: string; name: string } | null>(null)
  const [questDone, setQuestDone] = useState(false)
  const over = !!result
  useEffect(() => {
    if (!fromCampaign || !over) return
    let alive = true
    void import('./settlement/battleResult').then((m) => m.battleQuest()).then((q) => { if (alive) setQuest(q) }).catch(() => undefined)
    return () => { alive = false }
  }, [fromCampaign, over])
  if (!result || !state) return null
  const again = () => { game.newGame({ seats: g.seatOrder.map((s) => controllers[s] ?? 'bot'), ...(g.scenarioId ? { scenarioId: g.scenarioId } : {}) }) }
  // The campaign layer reads the whole final state (the game is over, nothing is hidden any more).
  const toSettlement = () => {
    const final = useGameStore.getState().state
    // The settlement code loads only now (it is not part of the game screen).
    void import('./settlement/battleResult').then((m) => m.applyBattleResult(final, { questCompleted: !!quest && questDone })).catch(() => undefined).finally(() => backToSettlement())
  }
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
        {fromCampaign && quest && (
          <label className="plain" data-testid="quest-done">
            <input type="checkbox" checked={questDone} onChange={(e) => setQuestDone(e.target.checked)} data-testid="quest-done-box" /> We completed the Quest: {quest.name}
          </label>
        )}
        <div className="options">
          {fromCampaign
            ? <button className="primary" data-testid="back-to-settlement" onClick={toSettlement}>Back to settlement</button>
            : <button className="primary" data-testid="play-again" onClick={again}>Play again</button>}
          <button className="quiet" data-testid="hud-menu" onClick={() => game.backToMenu()}>Back to the menu</button>
        </div>
      </div>
    </div>
  )
}
