// Start screen (start chunk: imports only store/launch.ts, store/settingsStore.ts, store/storage.ts, no engine).
import { useEffect, useMemo, useState } from 'react'
import { continueGame, hasAutosave, launchGame, loadScenarioChoices, readAutosaveSummary, type ScenarioChoice } from '../store/launch'
import { SPEED_PRESETS, useSettingsStore } from '../store/settingsStore'
import { readJson, writeJson } from '../store/storage'
import { PALETTE } from '../theme'
import { audio } from '../audio/manager'
import { HowToPlay, HowToPlayButton } from './HowToPlay'
import './start/start.css'
import {
  aiScenarios, ageLabel, asTeam, asTier, buildOptions, DEFAULT_SCENARIO_ID, groupScenarios, MODES, OFFICIAL_TIER, OPPONENTS, pickDefaultScenario, scenarioPreview, scenarioSummary,
  type OpponentTier, type PlayMode, type TeamSize,
} from './start/startView'

const PREF_KEY = 'fell-in.start'
interface Prefs { scenarioId: string; mode: PlayMode; tier: OpponentTier; team: TeamSize }

export function StartScreen() {
  const saved = useMemo(() => readJson<Partial<Prefs>>(PREF_KEY) ?? {}, [])
  const [list, setList] = useState<ScenarioChoice[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [scenarioId, setScenarioId] = useState<string>(saved.scenarioId ?? DEFAULT_SCENARIO_ID)
  const [mode, setMode] = useState<PlayMode>(saved.mode ?? 'bot')
  const [tier, setTier] = useState<OpponentTier>(asTier(saved.tier))
  const [team, setTeam] = useState<TeamSize>(asTeam(saved.team))
  const [seed, setSeed] = useState('')
  const speed = useSettingsStore((s) => s.speed)
  const setSettings = useSettingsStore((s) => s.set)
  const autosave = hasAutosave() ? readAutosaveSummary() : null

  // The welcome line speaks once, on the first click (which also unlocks Web Audio).
  useEffect(() => {
    audio.requestWelcome()
    return () => audio.cancelWelcome()
  }, [])

  useEffect(() => {
    let alive = true
    loadScenarioChoices().then(
      (l) => { if (alive) { setList(l); setScenarioId((cur) => pickDefaultScenario(l, cur) ?? cur) } },
      () => { if (alive) setLoadFailed(true) },
    )
    return () => { alive = false }
  }, [])

  const official = tier === OFFICIAL_TIER
  const shown = useMemo(() => (official ? aiScenarios(list) : list), [list, official])
  const groups = useMemo(() => groupScenarios(shown), [shown])
  // Switching to the official AI drops skirmish scenarios; keep the pick valid.
  useEffect(() => {
    if (official && shown.length && !shown.some((s) => s.id === scenarioId)) setScenarioId(shown[0]!.id)
    else if (!official && list.length && !list.some((s) => s.id === scenarioId)) setScenarioId((cur) => pickDefaultScenario(list, cur) ?? cur)
  }, [official, shown, list, scenarioId])
  const chosen = list.find((s) => s.id === scenarioId)
  const boxes = groups.find((g) => g.id === 'box')
  const others = groups.filter((g) => g.id !== 'box')

  const start = () => {
    writeJson(PREF_KEY, { scenarioId, mode, tier, team })
    launchGame(buildOptions({ scenarioId: list.length ? scenarioId : null, mode, seed, sides: chosen?.sides ?? 2, tier, team }))
  }
  const pick = (s: ScenarioChoice) => (
    <button key={s.id} className="sc-chip" aria-pressed={s.id === scenarioId} data-testid={`scenario-${s.id}`} onClick={() => setScenarioId(s.id)}>
      {s.name}<small>{scenarioSummary(s)}</small>
    </button>
  )

  return (
    <main className="start" data-testid="start-screen">
      <div className="start-card sc">
        <p className="eyebrow">An unofficial fan project</p>
        <h1>Fell-in: Wasteland Warfair</h1>
        <p className="tag">A 3D tabletop skirmish on a dusty 3 by 3 foot table.</p>
        <p className="sc-note">New to the game? <HowToPlayButton link testId="start-how-to-play" label="Read how to play" /></p>

        <section className="sc-sec" aria-label="Scenario">
          <h2 className="sc-h">Scenario</h2>
          {boxes ? <div className="sc-row">{boxes.items.map(pick)}</div> : official && list.length ? null : <p className="sc-note">{loadFailed ? 'Could not load the scenario list; the default skirmish will start.' : 'Loading scenarios...'}</p>}
          {others.map((g) => (
            <details key={g.id} open={g.items.some((s) => s.id === scenarioId)}>
              <summary>{g.label}</summary>
              <div className="sc-row" style={{ marginTop: 6 }}>{g.items.map(pick)}</div>
            </details>
          ))}
          <p className="sc-note" data-testid="scenario-note">{chosen ? scenarioSummary(chosen) : ''}</p>
          {chosen && (() => {
            const pv = scenarioPreview(chosen)
            return (
              <div className="sc-brief" data-testid="scenario-preview">
                <p className="sc-story">{pv.story}</p>
                <p><b>Your goal:</b> {pv.goal}</p>
                <p><b>Length:</b> {pv.rounds}</p>
              </div>
            )
          })()}
        </section>

        {!official && <section className="sc-sec" aria-label="Mode">
          <h2 className="sc-h">Mode</h2>
          <div className="sc-row">
            {MODES.map((m) => (
              <button key={m.id} className="sc-chip" aria-pressed={m.id === mode} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>
                {m.label}<small>{m.blurb}</small>
              </button>
            ))}
          </div>
        </section>}

        <section className="sc-sec" aria-label="Opponent">
          <h2 className="sc-h">Opponent</h2>
          <div className="sc-row" data-testid="opponent-tier">
            {OPPONENTS.map((o) => (
              <button key={o.id} className="sc-chip" aria-pressed={o.id === tier} data-testid={`opponent-${o.id}`} onClick={() => setTier(o.id)}>
                {o.label}<small>{o.blurb}</small>
              </button>
            ))}
          </div>
        </section>

        {official && (
          <section className="sc-sec" aria-label="Team">
            <h2 className="sc-h">Your team</h2>
            <div className="sc-row" data-testid="team-size">
              {([1, 2] as const).map((n) => (
                <button key={n} className="sc-chip" aria-pressed={team === n} data-testid={`team-${n}`} onClick={() => setTeam(n)}>
                  {n === 1 ? '1 player' : '2 players'}<small>{n === 1 ? 'Solo against the game.' : 'Co-op on one screen, taking turns.'}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="sc-sec" aria-label="Options">
          <h2 className="sc-h">Speed</h2>
          <div className="sc-row">
            {SPEED_PRESETS.map((p) => (
              <button key={p.id} className="sc-chip" aria-pressed={p.speed === speed} data-testid={`speed-${p.id}`} onClick={() => setSettings({ speed: p.speed })}>{p.label}</button>
            ))}
          </div>
          <h2 className="sc-h" style={{ marginTop: 14 }}><label htmlFor="seed">Seed</label></h2>
          <input id="seed" type="text" data-testid="seed-input" placeholder="random" value={seed} maxLength={40} onChange={(e) => setSeed(e.target.value)} />
          <p className="sc-note">Same seed, same dice. Leave it blank for a fresh game.</p>
        </section>

        <div className="sc-actions">
          <button className="go" data-testid="start-button" onClick={start} style={{ background: PALETTE.rust }}>Open the table</button>
          {autosave && (
            <button className="go alt" data-testid="continue-button" onClick={() => continueGame()}>
              Continue (round {autosave.round}{autosave.savedAt ? `, ${ageLabel(autosave.savedAt)}` : ''})
            </button>
          )}
        </div>

        <p className="fine" data-testid="disclaimer">
          Unofficial fan project, not affiliated with Modiphius Entertainment, Bethesda Softworks or ZeniMax. By evilgouki.
        </p>
      </div>
      <HowToPlay />
    </main>
  )
}
