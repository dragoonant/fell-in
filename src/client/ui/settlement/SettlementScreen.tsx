// Settlement screen (lazy chunk): the campaign between battles. Walks the campaign layer's sequence step by step and shows
// what the player owns (roster, pool, structures). Every number on this screen comes from the campaign layer (adapter.ts); the
// screen only lays it out and sends the player's choices back. All copy is ours (stepCopy.ts).
import { useEffect, useMemo, useState } from 'react'
import type { ScenarioChoice } from '../../store/launch'
import { host, setHost, type SettlementHost } from './host'
import { opponentProblem } from './battleLaunch'
import { act, finishStep, goToStep, NEXT_KEY, openSettlement, prepareBattle, savedCampaignExists, useSettlement } from './campaignStore'
import { OPPONENTS, type Choice, type NextBattle, type StepView } from './model'
import { capsText, groupBy, PARTS, stepCopy } from './stepCopy'
import './settlement.css'


export function SettlementScreen({ onLeave, host: h }: { onLeave: () => void; host: SettlementHost }) {
  setHost(h)
  const { campaign, view, steps, cursor, error, loading, api } = useSettlement()
  const [needConfirm, setNeedConfirm] = useState(false)
  const [boot, setBoot] = useState<'pending' | 'ready'>('pending')

  // Open once: the mode and seed come from the launch store (start screen button, ?campaign= hook, or "Back to settlement").
  useEffect(() => {
    let alive = true
    void (async () => {
      const { mode: asked, seed: campaignSeed, faction: campaignFaction } = host().openRequest()
      const mode = asked ?? 'continue'
      if (mode === 'new' && !host().testMode() && (await savedCampaignExists())) { if (alive) { setNeedConfirm(true); setBoot('ready') } return }
      await openSettlement(mode, campaignSeed, campaignFaction)
      if (mode === 'new') sharedPick = null // the remembered pick went with the replaced campaign
      if (alive) setBoot('ready')
    })()
    return () => { alive = false }
  }, [])

  if (needConfirm) {
    return (
      <main className="settle" data-testid="campaign-screen">
        <div className="st-confirm st-panel" data-testid="campaign-confirm">
          <h2>New campaign</h2>
          <h3>Replace your saved settlement?</h3>
          <p className="st-note">You already have a campaign saved. Starting a new one wipes it for good.</p>
          <div className="st-actions">
            <button className="st-btn primary" data-testid="campaign-replace" onClick={() => { setNeedConfirm(false); void openSettlement('new', useSettlementSeed(), host().openRequest().faction).then(() => { sharedPick = null }) }}>Replace it</button>
            <button className="st-btn" data-testid="campaign-keep" onClick={() => { setNeedConfirm(false); void openSettlement('continue', null) }}>Keep the saved one</button>
            <button className="st-btn quiet" data-testid="campaign-leave" onClick={onLeave}>Back to the menu</button>
          </div>
        </div>
      </main>
    )
  }

  if (boot === 'pending' || loading) {
    return <main className="settle" data-testid="campaign-screen"><p className="st-center" data-testid="campaign-loading">Opening the settlement...</p></main>
  }

  if (!campaign || !view || !api) {
    return (
      <main className="settle" data-testid="campaign-screen">
        <div className="st-confirm st-panel" data-testid="campaign-error">
          <h2>Campaign</h2>
          <h3>The settlement could not open</h3>
          <p className="st-err">{error ?? 'The campaign could not be loaded.'}</p>
          <div className="st-actions"><button className="st-btn" data-testid="campaign-leave" onClick={onLeave}>Back to the menu</button></div>
        </div>
      </main>
    )
  }

  const step = steps[cursor]
  return (
    <main className="settle" data-testid="campaign-screen" data-round={view.round}>
      <SettlementHeader onLeave={onLeave} />
      <div className="st-main">
        <div className="st-col" aria-label="Steps">
          <StepList steps={steps} cursor={cursor} />
        </div>
        <div className="st-col" aria-label="This step">
          {step ? <StepPanel step={step} last={cursor >= steps.length - 1} /> : <p className="st-empty">Nothing to do right now.</p>}
          {error && <p className="st-err" role="alert" data-testid="settlement-error">{error}</p>}
          <NextBattlePanel />
        </div>
        <div className="st-col" aria-label="What you have">
          <RosterPanel />
          <PoolPanel />
          <StructuresPanel />
          <LogPanel />
        </div>
      </div>
    </main>
  )
}

/** Seed typed for a new campaign (?seed= on the address, or none). */
function useSettlementSeed(): string | null {
  try { return new URLSearchParams(window.location.search).get('seed') } catch { return null }
}

// ---------- header ----------
function SettlementHeader({ onLeave }: { onLeave: () => void }) {
  const view = useSettlement((s) => s.view)!
  const pick = useNextBattle()
  return (
    <header className="st-head">
      <h1 data-testid="campaign-name">{view.name}</h1>
      <Stat label="Battle" value={`#${view.round}`} testId="stat-round" />
      <Stat label="Caps" value={String(view.caps)} testId="stat-caps" />
      <Stat label="Buildings" value={view.room === null ? String(view.structureCount) : `${view.structureCount} of ${view.room}`} testId="stat-land" />
      <Stat label="Land bought" value={String(view.land)} testId="stat-land-bought" />
      {view.power && <Stat label="Power" value={`${view.power.need} needed, ${view.power.supply} made`} testId="stat-power" />}
      <span className="st-spacer" />
      <button className="st-btn quiet" data-testid="campaign-leave" onClick={onLeave}>Menu</button>
      <button className="st-btn primary" data-testid="to-battle" disabled={!pick.ready} title={pick.problem ?? undefined} onClick={pick.go}>To battle</button>
    </header>
  )
}
function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className="st-stat"><span>{label}</span><b data-testid={testId}>{value}</b></div>
}

// ---------- steps ----------
function StepList({ steps, cursor }: { steps: StepView[]; cursor: number }) {
  const groups = groupBy(steps.map((s, i) => ({ s, i })), ({ s }) => stepCopy(s.id, s).part)
  const order = [...PARTS, 'Other'] as string[]
  groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return (
    <nav className="st-panel" aria-label="Between-battle steps">
      <h2>Between battles</h2>
      <ol className="st-steps" style={{ listStyle: 'none' }}>
        {groups.map((g) => (
          <li key={g.key} style={{ listStyle: 'none' }}>
            <div className="st-part">{g.key}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.items.map(({ s, i }) => (
                <li key={s.id} className="st-step" data-testid="settlement-step" data-step-id={s.id} data-state={i === cursor && s.state !== 'done' ? 'current' : s.state} aria-current={i === cursor ? 'step' : undefined}>
                  <button onClick={() => goToStep(i)}>
                    <span className="st-tick" aria-hidden>{s.state === 'done' ? 'x' : i === cursor ? '>' : ''}</span>
                    {stepCopy(s.id, s).title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function StepPanel({ step, last }: { step: StepView; last: boolean }) {
  const copy = stepCopy(step.id, step)
  const [picked, setPicked] = useState<string[]>([])
  // A different step starts with nothing picked.
  useEffect(() => { setPicked([]) }, [step.id, step.state])
  const groups = useMemo(() => groupBy(step.choices, (c) => c.group ?? ''), [step.choices])
  const ungrouped = groups.find((g) => g.key === '')
  const named = groups.filter((g) => g.key !== '')
  const many = step.choices.length > 14
  const multi = step.multi
  // A choice with an action of its own is a plain click; one without is a toggle for the pick-several confirm.
  const toggle = (c: Choice) => {
    if (c.withPicks) { if (act(c.withPicks(picked))) setPicked([]); return }
    if (c.action) { act(c.action); return }
    setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : multi && p.length >= multi.max ? p : [...p, c.id]))
  }
  const grid = (items: Choice[]) => <ChoiceGrid choices={items} picked={multi ? picked : undefined} onPick={multi ? toggle : undefined} />
  return (
    <section className="st-panel" data-testid="settlement-step-panel" data-step-id={step.id}>
      <h2>{copy.part}</h2>
      <h3 data-testid="settlement-step-title">{copy.title}</h3>
      <p className="st-note">{copy.blurb || step.blurb}</p>
      <p className="st-note"><b>{copy.decision || step.decision}</b></p>
      {step.auto && step.choices.length === 0 && <p className="st-empty" data-testid="step-auto">Nothing to decide here.</p>}
      {step.choices.length === 0 && !step.auto && <p className="st-empty" data-testid="step-nothing">Nothing on offer right now.</p>}
      {multi && <p className="st-note" data-testid="step-picked">Picked {picked.length} of up to {multi.max}.</p>}
      {ungrouped && grid(ungrouped.items)}
      {named.map((g, i) => (
        <details className="st-group" key={g.key} open={!many || i === 0}>
          <summary>{g.key} ({g.items.length})</summary>
          {grid(g.items)}
        </details>
      ))}
      <div className="st-actions">
        {multi?.confirm && (
          <button className="st-btn primary" data-testid="step-confirm" disabled={picked.length < multi.min} onClick={() => { if (act(multi.confirm!(picked))) setPicked([]) }}>{multi.confirmLabel ?? 'Confirm'}</button>
        )}
        {step.id === 'toBattle'
          ? <p className="st-note" data-testid="step-battle-note">Pick the scenario and opponent below, then press To battle.</p>
          : <button className={multi ? 'st-btn' : 'st-btn primary'} data-testid="step-next" onClick={finishStep}>{last ? 'Done' : step.optional || step.auto ? 'Next step' : 'Done with this step'}</button>}
      </div>
    </section>
  )
}

function ChoiceGrid({ choices, picked, onPick }: { choices: Choice[]; picked?: string[]; onPick?: (c: Choice) => void }) {
  return (
    <div className="st-choices">
      {choices.map((c) => (
        <button
          key={c.id} className="st-btn" data-testid="step-choice" data-choice-id={c.id} disabled={!!c.blocked} title={c.blocked}
          aria-pressed={picked ? picked.includes(c.id) : undefined} onClick={() => (onPick ? onPick(c) : act(c.action))}
        >
          {c.cost !== undefined && <span className="st-cost">{capsText(c.cost)}</span>}
          {c.label}
          {(c.detail || c.blocked) && <small>{c.blocked ?? c.detail}</small>}
        </button>
      ))}
    </div>
  )
}

// ---------- next battle ----------
interface NextBattleState { pick: NextBattle; set: (p: Partial<NextBattle>) => void; scenarios: ScenarioChoice[]; problem: string | null; ready: boolean; go: () => void }

let sharedPick: NextBattle | null = null
const pickListeners = new Set<() => void>()
function readPick(): NextBattle {
  if (!sharedPick) {
    const saved = host().readJson<Partial<NextBattle>>(NEXT_KEY) ?? {}
    sharedPick = { scenarioId: saved.scenarioId ?? 'box-1', opponent: saved.opponent ?? 'bot', seed: '' }
  }
  return sharedPick
}
function setPick(p: Partial<NextBattle>): void {
  sharedPick = { ...readPick(), ...p }
  host().writeJson(NEXT_KEY, { scenarioId: sharedPick.scenarioId, opponent: sharedPick.opponent })
  pickListeners.forEach((f) => f())
}

function useNextBattle(): NextBattleState {
  const [, bump] = useState(0)
  const [scenarios, setScenarios] = useState<ScenarioChoice[]>([])
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    pickListeners.add(f)
    return () => { pickListeners.delete(f) }
  }, [])
  useEffect(() => {
    let alive = true
    host().loadScenarioChoices().then((l) => { if (alive) setScenarios(l.filter((s) => s.sides >= 2 || s.aiSideId)) }, () => undefined)
    return () => { alive = false }
  }, [])
  const pick = readPick()
  // Keep the pick valid once the scenario list is known.
  useEffect(() => {
    if (scenarios.length && !scenarios.some((s) => s.id === pick.scenarioId)) setPick({ scenarioId: scenarios[0]!.id })
  }, [scenarios, pick.scenarioId])
  const chosen = scenarios.find((s) => s.id === pick.scenarioId)
  const problem = scenarios.length ? opponentProblem(pick.opponent, chosen) : null
  const go = () => {
    const r = prepareBattle(pick)
    if (r) host().launchGame(r.options)
  }
  return { pick, set: setPick, scenarios, problem, ready: problem === null, go }
}

function NextBattlePanel() {
  const nb = useNextBattle()
  const { pick } = nb
  return (
    <section className="st-panel" data-testid="next-battle">
      <h2>Next battle</h2>
      <label className="st-note" htmlFor="nb-scenario">Scenario</label>
      <div>
        <select id="nb-scenario" data-testid="next-scenario" value={pick.scenarioId} onChange={(e) => nb.set({ scenarioId: e.target.value })}>
          {nb.scenarios.length === 0 && <option value={pick.scenarioId}>{pick.scenarioId}</option>}
          {nb.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <p className="st-note">Who do you face?</p>
      <div className="st-pick" data-testid="next-opponent">
        {OPPONENTS.map((o) => (
          <button key={o.id} aria-pressed={pick.opponent === o.id} data-testid={`next-opponent-${o.id}`} onClick={() => nb.set({ opponent: o.id })}>
            {o.label}<small>{o.blurb}</small>
          </button>
        ))}
      </div>
      <p className="st-note"><label htmlFor="nb-seed">Dice seed (optional)</label></p>
      <input id="nb-seed" type="text" data-testid="next-seed" placeholder="random" maxLength={40} value={pick.seed} onChange={(e) => nb.set({ seed: e.target.value })} />
      {nb.problem && <p className="st-err" data-testid="next-problem">{nb.problem}</p>}
      <div className="st-actions">
        <button className="st-btn primary" data-testid="to-battle-panel" disabled={!nb.ready} onClick={nb.go}>To battle</button>
      </div>
    </section>
  )
}

// ---------- what you have ----------
function RosterPanel() {
  const view = useSettlement((s) => s.view)!
  return (
    <section className="st-panel" data-testid="roster-panel">
      <h2>Roster</h2>
      {view.roster.length === 0 && <p className="st-empty">No models yet. They join when you pick your force.</p>}
      <ul className="st-list">
        {view.roster.map((m) => (
          <li key={m.id} data-testid="roster-row">
            <span>
              {m.leader && <span className="st-tag leader">Leader</span>}{m.name}
              {(m.unit !== m.name || m.equipped.length > 0) && <small>{m.unit !== m.name ? m.unit : ''}{m.equipped.length ? `${m.unit !== m.name ? ' - ' : ''}carrying ${m.equipped.join(', ')}` : ''}</small>}
              {m.perks.length > 0 && <small>Perks: {m.perks.join(', ')}</small>}
              {m.injuries.length > 0 && <small>Hurt: {m.injuries.join(', ')}</small>}
            </span>
          </li>
        ))}
      </ul>
      {view.settlementPerks.length > 0 && <p className="st-note">Settlement perks: {view.settlementPerks.join(', ')}</p>}
      {view.roster.length > 0 && view.roster.every((m) => m.injuries.length === 0) && <p className="st-note">Nobody is hurt: in this rule set a model knocked out returns for the next fight.</p>}
    </section>
  )
}

function PoolPanel() {
  const view = useSettlement((s) => s.view)!
  const groups = groupBy(view.pool, (p) => p.kind)
  return (
    <section className="st-panel" data-testid="pool-panel">
      <h2>Pool</h2>
      {view.pool.length === 0 && <p className="st-empty">The pool is empty. Gear you keep or draw lands here.</p>}
      {groups.map((g) => (
        <div key={g.key}>
          <p className="st-note"><b>{g.key}</b></p>
          <ul className="st-list">
            {g.items.map((p) => <li key={p.id} data-testid="pool-row"><span>{p.name}{p.note && <small>{p.note}</small>}</span>{p.value !== null && <span>{capsText(p.value)}</span>}</li>)}
          </ul>
        </div>
      ))}
      {view.handCount > 0 && <p className="st-note">Boost hand: {view.handCount} card{view.handCount === 1 ? '' : 's'} (kept secret in battle).</p>}
    </section>
  )
}

function StructuresPanel() {
  const view = useSettlement((s) => s.view)!
  return (
    <section className="st-panel" data-testid="structures-panel">
      <h2>Settlement</h2>
      <ul className="st-list">
        {view.structures.map((s) => <li key={s.id} data-testid="structure-row"><span>{s.name}{s.note && <small>{s.note}</small>}</span><span>{s.count > 1 ? `x${s.count}` : ''}</span></li>)}
      </ul>
      {view.quests.length > 0 && (
        <>
          <p className="st-note"><b>Quests</b></p>
          <ul className="st-list">{view.quests.map((q) => <li key={q.id}><span>{q.name}<small>{q.progress}</small></span></li>)}</ul>
        </>
      )}
      {view.carry.length > 0 && (
        <>
          <p className="st-note"><b>Coming to the next fight</b></p>
          <ul className="st-list">{view.carry.map((t, i) => <li key={i}><span>{t}</span></li>)}</ul>
        </>
      )}
    </section>
  )
}

function LogPanel() {
  const view = useSettlement((s) => s.view)!
  const lines = view.log.slice(-8).reverse()
  if (!lines.length) return null
  return (
    <section className="st-panel" data-testid="campaign-log">
      <h2>What happened</h2>
      <ul className="st-list">{lines.map((t, i) => <li key={i}><span>{t}</span></li>)}</ul>
    </section>
  )
}
