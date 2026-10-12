// Top bar: round, whose turn, readiness per side, speed, skip, rails and menu.
import { SPEED_PRESETS, game, presentation, seatLabel, useGame, usePresented, usePresentedTurn, useSettings, useWaitingFor } from '../contract'
import { useUiStore } from './uiStore'

export function TopBar() {
  const turn = usePresentedTurn()
  const state = usePresented()
  const waiting = useWaitingFor()
  const g = useGame()
  const { speed } = useSettings()
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const counts = (seat: string) => {
    const mine = Object.values(state?.models ?? {}).filter((m) => m.owner === seat && m.life !== 'dead' && !m.offTable)
    return { ready: mine.filter((m) => m.readiness === 'ready').length, unready: mine.filter((m) => m.readiness === 'unready').length, used: mine.filter((m) => m.readiness === 'used').length }
  }
  return (
    <header className="topbar" data-testid="hud-topbar">
      <div className="topbar-main">
        <b data-testid="hud-round">Round {turn.round}{state?.maxRounds ? ` of ${state.maxRounds}` : ''}</b>
        <span data-testid="hud-turn">{turn.seat ? `${seatLabel(turn.seat)} is taking a turn` : 'Setting up'}</span>
        {waiting && <span className="dim" data-testid="hud-waiting">{waiting.controller === 'bot' ? `${waiting.label} is thinking` : waiting.hotSeat ? `${waiting.label}: your decision` : 'Your decision'}</span>}
      </div>
      <div className="topbar-seats">
        {g.seatOrder.map((seat) => {
          const c = counts(seat)
          return (
            <span key={seat} className={`seatpill${turn.seat === seat ? ' on' : ''}`} data-testid={`seat-${seat}`}>
              {seatLabel(seat)}{state?.advantage === seat ? ' *' : ''}: {c.ready} ready, {c.unready} not yet, {c.used} used{state?.seats[seat] ? `, score ${state.seats[seat]!.score}` : ''}
            </span>
          )
        })}
      </div>
      <div className="topbar-tools">
        <select aria-label="Animation speed" data-testid="hud-speed" value={String(speed)} onChange={(e) => presentation.setSpeed(Number(e.target.value))}>
          {SPEED_PRESETS.map((p) => <option key={p.id} value={String(p.speed)}>{p.label}</option>)}
        </select>
        <button data-testid="hud-skip" onClick={() => presentation.skipAll()}>Skip</button>
        <button data-testid="hud-rail-left" aria-pressed={leftOpen} title="Units rail ([)" onClick={toggleLeft}>Units [</button>
        <button data-testid="hud-rail-right" aria-pressed={rightOpen} title="Log rail (])" onClick={toggleRight}>Log ]</button>
        <button data-testid="hud-menu-top" onClick={() => game.backToMenu()}>Menu</button>
      </div>
    </header>
  )
}
