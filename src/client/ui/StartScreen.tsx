// Start screen (start chunk: imports only store/launch.ts, store/settingsStore.ts, store/storage.ts, no engine).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { closeCampaign, continueGame, hasAutosave, hasCampaignSave, launchGame, loadCampaignFactions, loadScenarioChoices, openCampaign, readAutosaveSummary, readCampaignSummary, useLaunchStore, type ScenarioChoice } from '../store/launch'
import { readParams } from '../params'
import type { SettlementHost } from './settlement/host'
import { SPEED_PRESETS, useSettingsStore } from '../store/settingsStore'
import { readJson, removeKey, writeJson } from '../store/storage'
import { PALETTE } from '../theme'
import { asTheme, THEMES } from '../board/themes'
import { audio } from '../audio/manager'
import { HowToPlay, HowToPlayButton } from './HowToPlay'
import { ArtImage } from './art'
import { keyArtUrl, scenarioArtUrl } from './artView'
import './start/start.css'
import {
  aiScenarios, ageLabel, asTeam, asTier, buildOptions, DEFAULT_SCENARIO_ID, groupScenarios, MODES, OFFICIAL_TIER, OPPONENTS, pickDefaultScenario, scenarioPreview, scenarioSummary,
  type OpponentTier, type PlayMode, type TeamSize,
} from './start/startView'

// The settlement is its own chunk (campaign layer + data), loaded only when the player opens a campaign.
const SettlementScreen = lazy(() => import('./settlement/SettlementScreen').then((m) => ({ default: m.SettlementScreen })))

const PREF_KEY = 'fell-in.start'
interface Prefs { scenarioId: string; mode: PlayMode; tier: OpponentTier; team: TeamSize; theme?: string | null; faction?: string | null }
/** Scenarios whose table is open (plain edge deployment), so a themed board can dress it. Others keep the terrain their rules are laid out on. */
const THEMEABLE = new Set(['box-1'])

export function StartScreen() {
  const campaignOpen = useLaunchStore((s) => s.campaignOpen)
  // ?campaign=1 / new / continue opens the settlement once, at boot.
  useEffect(() => {
    const p = readParams()
    if (p.campaign && !useLaunchStore.getState().campaignOpen && !bootedCampaign) { bootedCampaign = true; openCampaign(p.campaign, p.seed) }
  }, [])
  if (campaignOpen) {
    return (
      <Suspense fallback={<div className="start" data-testid="loading"><p className="tag">Opening the settlement...</p></div>}>
        <SettlementScreen onLeave={closeCampaign} host={SETTLEMENT_HOST} />
      </Suspense>
    )
  }
  return <StartMenu />
}
let bootedCampaign = false

/** What the lazy settlement chunk may use of the main chunk (see settlement/host.ts). */
const SETTLEMENT_HOST: SettlementHost = {
  launchGame, loadScenarioChoices, loadCampaignFactions, hasCampaignSave, readJson, writeJson, removeKey,
  openRequest: () => { const s = useLaunchStore.getState(); return { mode: s.campaignMode, seed: s.campaignSeed, faction: s.campaignFaction } },
  testMode: () => readParams().test,
}

function StartMenu() {
  const saved = useMemo(() => readJson<Partial<Prefs>>(PREF_KEY) ?? {}, [])
  const [list, setList] = useState<ScenarioChoice[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [scenarioId, setScenarioId] = useState<string>(saved.scenarioId ?? DEFAULT_SCENARIO_ID)
  const [mode, setMode] = useState<PlayMode>(saved.mode ?? 'bot')
  const [tier, setTier] = useState<OpponentTier>(asTier(saved.tier))
  const [team, setTeam] = useState<TeamSize>(asTeam(saved.team))
  const [theme, setTheme] = useState<string | null>(asTheme(saved.theme))
  const [seed, setSeed] = useState('')
  const speed = useSettingsStore((s) => s.speed)
  const setSettings = useSettingsStore((s) => s.set)
  const autosave = hasAutosave() ? readAutosaveSummary() : null
  const campaignSave = hasCampaignSave() ? readCampaignSummary() : null
  const [factions, setFactions] = useState<{ id: string; name: string }[]>([])
  const [faction, setFaction] = useState<string | null>(saved.faction ?? null)
  useEffect(() => {
    let alive = true
    loadCampaignFactions().then((l) => { if (alive) setFactions(l) }, () => undefined)
    return () => { alive = false }
  }, [])
  const campaignFaction = factions.find((f) => f.id === faction)?.id ?? factions[0]?.id ?? null

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
    writeJson(PREF_KEY, { scenarioId, mode, tier, team, theme, faction })
    const themed = !official && theme && THEMEABLE.has(scenarioId) ? { theme } : {}
    launchGame({ ...buildOptions({ scenarioId: list.length ? scenarioId : null, mode, seed, sides: chosen?.sides ?? 2, tier, team }), ...themed })
  }
  const pick = (s: ScenarioChoice) => (
    <button key={s.id} className="sc-chip" aria-pressed={s.id === scenarioId} data-testid={`scenario-${s.id}`} onClick={() => setScenarioId(s.id)}>
      <ArtImage src={scenarioArtUrl(s.id)} className="sc-thumb" testId={`scenario-art-${s.id}`} />
      {s.name}<small>{scenarioSummary(s)}</small>
    </button>
  )

  return (
    <main className="start" data-testid="start-screen" style={{ '--start-art': `url("${keyArtUrl('start-screen')}")` } as React.CSSProperties}>
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
                <ArtImage src={scenarioArtUrl(chosen.id)} className="sc-brief-art" testId="scenario-preview-art" />
                <p className="sc-story">{pv.story}</p>
                <p><b>Your goal:</b> {pv.goal}</p>
                <p><b>Length:</b> {pv.rounds}</p>
              </div>
            )
          })()}
        </section>

        {!official && (
          <section className="sc-sec" aria-label="Table theme">
            <h2 className="sc-h">Table theme</h2>
            <div className="sc-row" data-testid="theme-picker">
              <button className="sc-chip" aria-pressed={theme === null} data-testid="theme-none" disabled={!THEMEABLE.has(scenarioId)} style={THEMEABLE.has(scenarioId) ? undefined : { opacity: 0.45 }} onClick={() => setTheme(null)}>
                Scenario layout<small>The terrain the scenario was written for.</small>
              </button>
              {THEMES.map((t) => (
                <button key={t.id} className="sc-chip" aria-pressed={theme === t.id} data-testid={`theme-${t.id}`} disabled={!THEMEABLE.has(scenarioId)} style={THEMEABLE.has(scenarioId) ? undefined : { opacity: 0.45 }} onClick={() => setTheme(t.id)}>
                  {t.label}<small>{t.blurb}</small>
                </button>
              ))}
            </div>
            <p className="sc-note" data-testid="theme-note">
              {THEMEABLE.has(scenarioId) ? 'Dresses the open skirmish table. Dice and objectives do not change.' : 'Only the open skirmish table (Skirmish 1) can be re-dressed; this scenario keeps its own terrain.'}
            </p>
          </section>
        )}

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

        <section className="sc-sec" aria-label="Campaign">
          <h2 className="sc-h">Campaign</h2>
          <p className="sc-note">Build a settlement between battles: spend caps, store gear, pick the next fight.</p>
          {factions.length > 1 && (
            <div className="sc-row" data-testid="campaign-faction" style={{ marginTop: 6 }}>
              {factions.map((f) => (
                <button key={f.id} className="sc-chip" aria-pressed={campaignFaction === f.id} data-testid={`campaign-faction-${f.id}`} onClick={() => { setFaction(f.id); writeJson(PREF_KEY, { scenarioId, mode, tier, team, theme, faction: f.id }) }}>{f.name}</button>
              ))}
            </div>
          )}
          <div className="sc-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
            <button className="go alt" data-testid="campaign-new" onClick={() => openCampaign('new', null, campaignFaction)}>New campaign</button>
            {campaignSave && (
              <button className="go alt" data-testid="campaign-continue" onClick={() => openCampaign('continue')}>
                Continue campaign ({campaignSave.name}, round {campaignSave.round}, {campaignSave.caps} caps)
              </button>
            )}
          </div>
        </section>

        <p className="fine" data-testid="disclaimer">
          Unofficial fan project, not affiliated with Modiphius Entertainment, Bethesda Softworks or ZeniMax. By evilgouki.
        </p>
      </div>
      <HowToPlay />
    </main>
  )
}
