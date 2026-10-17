// HUD (owner U). DOM overlay rendered by GameScreen: top bar, collapsible rails ([ and ]), the prompt or activation
// panel, rejection toast, banner, thinking indicator and the game-over recap.
import { useEffect } from 'react'
import { game, useBanner, useFatal, useGameResult, useNarration, usePending, useRejection, useSettings, useWaitingFor } from '../contract'
import { Briefing, useBriefingEpoch } from './Briefing'
import { ObjectiveTracker } from './ObjectiveTracker'
import { AiCardPanel } from './AiCardPanel'
import { ActivationPanel } from './ActivationPanel'
import { EventFeed } from './EventFeed'
import { GameOver } from './GameOver'
import { Prompt } from './Prompt'
import { Roster } from './Roster'
import { SelectionChip } from './SelectionChip'
import { TopBar } from './TopBar'
import { useUiStore } from './uiStore'
import './hud.css'
import './briefing.css'

function useRailKeys() {
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === '[') toggleLeft()
      else if (e.key === ']') toggleRight()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleLeft, toggleRight])
}

export function Hud() {
  useRailKeys()
  const banner = useBanner()
  const pending = usePending()
  const waiting = useWaitingFor()
  const rejection = useRejection()
  const result = useGameResult()
  const fatal = useFatal()
  const narration = useNarration()
  const { narration: narrationOn } = useSettings()
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const epoch = useBriefingEpoch()
  const lastLine = narrationOn ? narration[narration.length - 1]?.text : null
  return (
    <div className="hud-root" data-testid="hud">
      <TopBar />
      {lastLine && <div className="ticker" data-testid="hud-narration">{lastLine}</div>}
      {banner && <div className={`banner banner-${banner.tone}`} data-testid="hud-banner">{banner.text}</div>}
      <ObjectiveTracker />
      <AiCardPanel />
      {leftOpen && <Roster />}
      <SelectionChip />
      {rightOpen && <EventFeed />}
      <div className="dock">
        {rejection && (
          <div className="toast" role="alert" data-testid="hud-rejection">
            {rejection.text} <button className="quiet" data-testid="hud-rejection-dismiss" onClick={() => game.clearRejection()}>Dismiss</button>
          </div>
        )}
        {fatal && <div className="toast" role="alert" data-testid="hud-fatal">The game hit a problem and stopped. Start a new game from the menu.</div>}
        {!result && pending && (pending.kind === 'turn.activation' ? <ActivationPanel pending={pending} /> : <Prompt pending={pending} />)}
        {!result && !pending && waiting && (
          <div className="panel waiting" data-testid="hud-thinking">
            {waiting.controller !== 'human' ? `${waiting.label} is thinking...` : `Waiting for ${waiting.label}...`}
          </div>
        )}
      </div>
      <GameOver />
      <Briefing key={epoch} />
    </div>
  )
}
