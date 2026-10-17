// Scenario briefing: opens at the start of a game (before "Begin the battle") and from the top bar any time.
import { useEffect, useMemo } from 'react'
import { seatLabel, useBundle, useGame, usePresented } from '../contract'
import { useGameStore } from '../store/gameStore'
import { audio } from '../audio/manager'
import { readParams } from '../params'
import { buildBriefing } from './briefingView'
import { useUiStore } from './uiStore'
import { HowToPlayButton } from './HowToPlay'
import { ArtImage, FactionMark, useSeatFactions } from './art'
import { scenarioArtUrl } from './artView'

/** Mount with key={epoch}: opens once per new game (not on a mid-game load, nor under ?test=1 unless ?briefing=1). */
export function Briefing() {
  const open = useUiStore((s) => s.briefingOpen)
  const setOpen = useUiStore((s) => s.setBriefing)
  const bundle = useBundle()
  const g = useGame()
  const state = usePresented()
  const scn = useMemo(() => bundle?.records.scenarios.find((s) => s.id === (state?.scenarioId ?? g.scenarioId)) ?? null, [bundle, state?.scenarioId, g.scenarioId])
  const factions = useSeatFactions()
  const round0 = (state?.round ?? 0) === 0
  useEffect(() => {
    let quiet = false
    try { quiet = readParams().test && new URLSearchParams(location.search).get('briefing') !== '1' } catch { /* no location */ }
    setOpen(!!scn && round0 && !quiet)
    return () => setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const model = useMemo(() => {
    if (!scn) return null
    const briefing = (scn as { briefing?: Parameters<typeof buildBriefing>[0]['briefing'] }).briefing ?? null
    return buildBriefing({ name: scn.name, rounds: scn.rounds, sideIds: scn.sides.map((x) => x.id), briefing, rules: scn.rules },
      g.seatOrder, g.controllers, seatLabel, Object.fromEntries(Object.entries(state?.seats ?? {}).map(([k, v]) => [k, v.side])))
  }, [scn, g.seatOrder, g.controllers, state?.seats])
  // Narrate the briefing when it opens (a no-op without a voice file); closing it cuts the line off.
  const scnId = scn?.id
  useEffect(() => {
    if (!open || !scnId) return
    const line = `briefing-${scnId}`
    audio.say(line)
    return () => audio.cancelVoice(line)
  }, [open, scnId])
  if (!open || !model) return null
  return (
    <div className="briefing-back" data-testid="briefing" role="dialog" aria-modal="true" aria-label={`${model.title} briefing`}>
      <div className="panel briefing">
        {scn && <ArtImage src={scenarioArtUrl(scn.id)} className="b-art" testId="briefing-art" />}
        <h2 data-testid="briefing-title">{model.title}</h2>
        <p className="b-story">{model.story}</p>
        {model.goals.map((r) => <p key={r.seat} className="b-goal" data-testid="briefing-goal"><FactionMark faction={factions[r.seat]} size={16} /><b>{r.label}</b> {r.text}</p>)}
        {model.enemy.map((r) => <p key={r.seat} className="b-goal enemy" data-testid="briefing-enemy"><FactionMark faction={factions[r.seat]} size={16} /><b>{r.label}</b> {r.text}</p>)}
        <div className="sect">How to win</div>
        <ul>{model.howToWin.map((t, i) => <li key={i}>{t}</li>)}{!model.howToWin.some((t) => /round/i.test(t)) && <li>{model.rounds}.</li>}</ul>
        {model.tips.length > 0 && <><div className="sect">Tips</div><ul>{model.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        {model.rules.length > 0 && (
          <details><summary>Special rules</summary><ul>{model.rules.map((r) => <li key={r.id}>{r.text}</li>)}</ul></details>
        )}
        <p className="b-howto">First game? <HowToPlayButton link testId="briefing-how-to-play" label="How to play: turns, actions and dice" /></p>
        <div className="b-actions"><button className="primary" data-testid="briefing-start" onClick={() => setOpen(false)}>Start</button></div>
      </div>
    </div>
  )
}

export const useBriefingEpoch = (): number => useGameStore((s) => s.epoch)
