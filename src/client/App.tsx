// App shell (start chunk). The game screen, engine and data load lazily on the first launch, so the start screen
// stays small. URL test hooks (?test=1, ?seats=, ?scenario=) skip straight into a game.
import { lazy, Suspense, useEffect } from 'react'
import './ui/styles.css'
import { readParams } from './params'
import { launchGame, useLaunchStore } from './store/launch'
import { StartScreen } from './ui/StartScreen'

const GameScreen = lazy(() => import('./GameScreen').then((m) => ({ default: m.GameScreen })))

function paramsLaunch() {
  const p = readParams()
  return { seats: p.seats, ...(p.seed ? { seed: p.seed } : {}), ...(p.scenario ? { scenarioId: p.scenario } : {}) }
}

export function App() {
  const screen = useLaunchStore((s) => s.screen)
  useEffect(() => {
    if (readParams().autostart && !useLaunchStore.getState().launch) launchGame(paramsLaunch())
  }, [])
  if (screen === 'start') return <StartScreen />
  return (
    <Suspense fallback={<div className="start" data-testid="loading"><p className="tag">Setting up the table...</p></div>}>
      <GameScreen />
    </Suspense>
  )
}
