import { useEffect } from 'react'
import './ui/styles.css'
import { readParams } from './params'
import { useStore } from './store'
import { GameScreen } from './GameScreen'
import { StartScreen } from './ui/StartScreen'

export function App() {
  const screen = useStore((s) => s.screen)
  const start = useStore((s) => s.start)
  useEffect(() => {
    const p = readParams()
    if (p.test) {
      start(p.seed)
      ;(window as unknown as { __game: unknown }).__game = { getState: () => useStore.getState().game, params: p }
    }
  }, [start])
  return screen === 'start' ? <StartScreen onStart={() => start(readParams().seed)} /> : <GameScreen />
}
