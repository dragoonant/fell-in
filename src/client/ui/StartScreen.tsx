// Start screen (start chunk: imports only store/launch.ts, store/settingsStore.ts, store/storage.ts, no engine).
import { useEffect, useMemo, useState } from 'react'
import { continueGame, hasAutosave, launchGame, loadScenarioChoices, readAutosaveSummary, type ScenarioChoice } from '../store/launch'
import { SPEED_PRESETS, useSettingsStore } from '../store/settingsStore'
import { readJson, writeJson } from '../store/storage'
import { PALETTE } from '../theme'
import './start/start.css'
import {
  ageLabel, asTier, buildOptions, DEFAULT_SCENARIO_ID, groupScenarios, MODES, OPPONENTS, pickDefaultScenario, scenarioSummary, type OpponentTier, type PlayMode,
} from './start/startView'

const PREF_KEY = 'fell-in.start'
interface Prefs { scenarioId: string; mode: PlayMode; tier: OpponentTier }

export function StartScreen() {
  const saved = useMemo(() => readJson<Partial<Prefs>>(PREF_KEY) ?? {}, [])
  const [list, setList] = useState<ScenarioChoice[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [scenarioId, setScenarioId] = useState<string>(saved.scenarioId ?? DEFAULT_SCENARIO_ID)
  const [mode, setMode] = useState<PlayMode>(saved.mode ?? 'bot')
  const [tier, setTier] = useState<OpponentTier>(asTier(saved.tier))
  const [seed, setSeed] = useState('')
  const speed = useSettingsStore((s) => s.speed)
  const setSettings = useSettingsStore((s) => s.set)
  const autosave = hasAutosave() ? readAutosaveSummary() : null

  useEffect(() => {
    let alive = true
    loadScenarioChoices().then(
      (l) => { if (alive) { setList(l); setScenarioId((cur) => pickDefaultScenario(l, cur) ?? cur) } },
      () => { if (alive) setLoadFailed(true) },
    )
    return () => { alive = false }
  }, [])

  const groups = useMemo(() => groupScenarios(list), [list])
  const chosen = list.find((s) => s.id === scenarioId)
  const boxes = groups.find((g) => g.id === 'box')
  const others = groups.filter((g) => g.id !== 'box')

  const start = () => {
    writeJson(PREF_KEY, { scenarioId, mode, tier })
    launchGame(buildOptions({ scenarioId: list.length ? scenarioId : null, mode, seed, sides: chosen?.sides ?? 2, tier }))
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

        <section className="sc-sec" aria-label="Scenario">
          <h2 className="sc-h">Scenario</h2>
          {boxes ? <div className="sc-row">{boxes.items.map(pick)}</div> : <p className="sc-note">{loadFailed ? 'Could not load the scenario list; the default skirmish will start.' : 'Loading scenarios...'}</p>}
          {others.map((g) => (
            <details key={g.id} open={g.items.some((s) => s.id === scenarioId)}>
              <summary>{g.label}</summary>
              <div className="sc-row" style={{ marginTop: 6 }}>{g.items.map(pick)}</div>
            </details>
          ))}
          <p className="sc-note" data-testid="scenario-note">{chosen ? scenarioSummary(chosen) : ''}</p>
        </section>

        <section className="sc-sec" aria-label="Mode">
          <h2 className="sc-h">Mode</h2>
          <div className="sc-row">
            {MODES.map((m) => (
              <button key={m.id} className="sc-chip" aria-pressed={m.id === mode} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>
                {m.label}<small>{m.blurb}</small>
              </button>
            ))}
          </div>
        </section>

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
    </main>
  )
}
