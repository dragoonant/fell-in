// App shell (start chunk). The game screen, engine and data load lazily on the first launch, so the start screen
// stays small. URL test hooks (?test=1, ?seats=, ?scenario=) skip straight into a game.
import { lazy, Suspense, useEffect } from 'react'
import './ui/styles.css'
import { readParams } from './params'
import { launchGame, useLaunchStore } from './store/launch'
import { audio } from './audio/manager'
import { StartScreen } from './ui/StartScreen'

const Gallery = lazy(() => import('./figures/Gallery').then((m) => ({ default: m.Gallery })))
const GameScreen = lazy(() => import('./GameScreen').then((m) => ({ default: m.GameScreen })))

function paramsLaunch() {
  const p = readParams()
  return { seats: p.seats, ...(p.seed ? { seed: p.seed } : {}), ...(p.scenario ? { scenarioId: p.scenario } : {}) }
}

export function App() {
  const screen = useLaunchStore((s) => s.screen)
  useEffect(() => {
    audio.attachAutoUnlock()
    audio.setMood('calm')
    if (readParams().autostart && !useLaunchStore.getState().launch) launchGame(paramsLaunch())
  }, [])
  if (readParams().gallery) return <Suspense fallback={null}><Gallery /></Suspense>
  if (screen === 'start') return <StartScreen />
  return (
    <Suspense fallback={<div className="start" data-testid="loading"><p className="tag">Setting up the table...</p></div>}>
      <GameScreen />
    </Suspense>
  )
}
