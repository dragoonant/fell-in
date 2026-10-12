export const meta = {
  name: 'm3-playable',
  description: 'M3: playable client (store, presentation, interaction, UI, dice tray) adapted from whirr-machine; box scenarios from the real PDF',
  phases: [
    { title: 'Scenarios', detail: 're-enter box scenarios 1-5, victory conditions fire' },
    { title: 'Client core', detail: 'contract, game store, bot driver, test hooks' },
    { title: 'Client build', detail: 'four Sonnet agents, disjoint folders' },
    { title: 'Integrate', detail: 'wire, chunk split, e2e playthrough, screenshots' },
  ],
}

const ROOT = args && args.root
const WHI = args && args.whi
if (!ROOT || !WHI) throw new Error('pass args.root and args.whi (absolute paths)')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: all UI copy, labels and card faces are our own words and designs; no Fallout/Modiphius/Bethesda art, logos, Vault Boy, Pip-Boy screens or trade dress (use original markings). Card names and numbers may match.
Frozen: src/engine/{types,decider,view,rng,pending,registry,apply}.ts and src/data/types.ts, data/1e/** unless you are told you own them.
The client never mutates GameState and never computes a rules number: odds, range band, cover, damage come from src/engine/query.ts or pending.context.
Run long commands in the FOREGROUND. Never run npm install or git commit; never edit STATUS.md or package.json unless told.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Reference implementation (read-only, copy and adapt freely, it is the owner's own earlier project): ${WHI} (whirr-machine). Its client map is in docs/KNOWLEDGE-BASE.md sections 1.4, 1.5 and 2.1. Strip anything Warmachine-specific (focus, fury, damage grids, factions).
Specs: docs/spec/50-client.md, docs/spec/00-architecture.md sections 3, 5, 8.`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

// Scenario data fix runs beside the client work (disjoint files).
phase('Scenarios')
const scnP = agent(`${COMMON}
Box scenarios in data/1e/scenarios/ were entered from a spec summary and random-bot games always draw. The real free PDF is now at ${ROOT}/docs/sources/box_scenarios_1-5.pdf (extract with PyMuPDF; render pages to PNG and Read them for maps).
1. Re-enter box scenarios 1-5 from the PDF against the frozen schema (docs/spec/20-data-schema.md): forces, deployment zones, objectives/markers, terrain hints, round limit, scoring, victory. Cite pages. Prose in our own words.
2. Fix src/engine/scenario.ts so objectives score and victory fires for these scenarios (and the default skirmish has a sensible VP/elimination end). Update docs/spec/17-scenarios.md to match the PDF.
3. Run npm run validate:data, npm test, then npm run sim -- --games 40 --seed scn. Target: 0 errors and fewer than 50% draws in box-1.
You own ONLY: data/1e/scenarios/, src/engine/scenario.ts, src/engine/setup.ts (default scenario wiring only), tests/engine/scenario.test.ts, docs/spec/17-scenarios.md. Return RULING lines in issues. Put the sim JSON in summary. ${KEEP}`,
  { label: 'box-scenarios', phase: 'Scenarios', schema: RESULT, model: 'sonnet' })

phase('Client core')
const core = await agent(`${COMMON}
You are the M3 client architect. Read the WHI client core (${WHI}/src/client/{contract.ts,store/,bot/,presentation/} and GameScreen.tsx) and our src/client/ + src/engine/index.ts, apply.ts, query.ts, types.ts (GameEvent, events).
Build the frozen client surface the four UI agents code against:
1. src/client/contract.ts: hooks and helpers (useGame, usePending, usePresented, useQuery wrappers over engine query.*), game.* commands (submit(action), legal(), newGame(opts)), bootClient.
2. src/client/store/gameStore.ts: the ONLY engine apply caller; createGame from the data bundle (src/data edition()); seats human|bot per seat; hot-seat (two human seats, prompt shows whose turn); autosave per round to localStorage (try/catch) with Continue.
3. src/client/bot/botDriver.ts: random-bot answers bot-owned decisions only when presentation is idle, 5 s no-progress watchdog that force-answers; AI time budget behind import.meta.env.VITE_AI_MS.
4. src/client/presentation/: director (GameEvent batches to timed beats, any click skips, speed setting), presentedStore (state as of the animation cursor), announceStore. Beats emit typed cues the dice tray, figures and feed subscribe to (export the cue types).
5. Test hooks in params.ts: ?test=1 exposes window.__game {getState, view, pending, legalActions, submit, pauseBots}; ?seats=human,bot|bot,bot|human,human; ?seed=; ?scenario=; ?fps; ?speed=fast.
6. GameScreen.tsx composes slots: <Board/>, <Interaction/>, <Hud/>, <DiceTray/> from four folders (create placeholder components with the final export names: src/client/interaction/Interaction.tsx, src/client/ui/Hud.tsx, src/client/dice/DiceTray.tsx; presentation-driven figures in src/client/figures/Figures.tsx). Lazy-load GameScreen and the engine/data so the start chunk stays small.
Typecheck, test and build green. In issues: one line per owner (P figures/board, I interaction, U ui, D dice+start) naming the contract exports they use. You own ONLY: src/client/{contract.ts,store/,bot/,presentation/,params.ts,GameScreen.tsx,App.tsx} and the four placeholder files. ${KEEP}`,
  { label: 'client-core', phase: 'Client core', schema: RESULT, effort: 'high' })

if (!core || !core.ok) return { core, stopped: 'client core not ok', scn: await scnP }

phase('Client build')
const CORE = JSON.stringify(core.issues)
const OWNERS = [
  { key: 'P', label: 'client:P board+figures', own: 'src/client/board/, src/client/figures/',
    task: 'Figures driven by presentedStore: one figure per model on its base (25/32/40/50 mm), faction tint, facing nearest enemy, move tweening along paths, down/dead states, selection ring, damage/radiation pips. Invisible DOM proxies data-testid="model-<id>" with data-x/data-z. Terrain pieces from GameState.terrain with rules-type hover tooltip. Camera presets and transitions (copy WHI Board/Camera), demand frameloop, dpr cap 1.5, ?fps meter. Deployment-zone and objective markers from scenario state.' },
  { key: 'I', label: 'client:I interaction', own: 'src/client/interaction/',
    task: 'Per-decision controllers keyed by pending.kind: click a model to select/activate, drag movement with ghost preview clamped to the farthest legal point and a colour-ruler readout (engine edition rulers, never hardcoded), target picking for shoot/charge/throw with LOS line and cover badge (from query), keys M ruler, L LOS view, Esc cancel. Everything submits through contract game.submit with an action from legal().' },
  { key: 'U', label: 'client:U ui', own: 'src/client/ui/ (except StartScreen.tsx and start/)',
    task: 'Hud: TopBar (round, whose activation, readiness), Prompt + PromptForms with promptView text per decision kind (every kind in the engine gets readable own-words copy, fallback lists options), ActivationPanel (actions left, AP, quick actions), unit card panel in OUR design (stats, skills, weapons with ruler colours, armor, damage/rads, conditions), odds preview before confirming an attack (hit %, expected damage, kill %, range band, cover, all from query), EventFeed with per-attack breakdown, GameOver recap with winner and Play again. Collapsible rails on [ and ]. data-testid on every button.' },
  { key: 'D', label: 'client:D dice+start', own: 'src/client/dice/, src/client/ui/StartScreen.tsx, src/client/ui/start/',
    task: 'Dice tray: every roll cue renders the d20 skill die and coloured d12 effect dice (faces/icons from the edition dice table; our own icon glyphs), success/fail and crit highlight, reroll/luck indication, a DiceLog history. Start screen: scenario picker (box 1-5, default skirmish), mode picker (vs bot, hot-seat, bot vs bot watch), seed field, speed, Continue when an autosave exists. Footer disclaimer: unofficial fan project, not affiliated with Modiphius Entertainment, Bethesda Softworks or ZeniMax.' },
]
const build = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are client owner ${o.key}. The client surface is FROZEN by the client architect: src/client/{contract.ts,store/,bot/,presentation/,params.ts,GameScreen.tsx}. Do not edit those; report needed changes in issues.
Architect notes: ${CORE}
Build: ${o.task}
Adapt matching WHI files where they exist rather than writing from scratch. Add 2-4 focused unit tests for pure view helpers in tests/client/${o.key.toLowerCase()}-*.test.ts.
Finish with npm run typecheck and npm test green for your files (list other owners' failures in issues).
You own ONLY: ${o.own} and your test files. ${KEEP}`, { label: o.label, phase: 'Client build', schema: RESULT, model: 'sonnet' })))

const scn = await scnP

phase('Integrate')
const integ = await agent(`${COMMON}
You are the M3 integrator. Reports from the client owners and the scenario agent:
${JSON.stringify([...build, scn].map(r => r && { summary: r.summary, issues: r.issues }))}
1. Wire everything into one playable game: start screen -> game -> game over, vs bot / hot-seat / bot vs bot. Fix contract mismatches (you may now edit any src/client file, src/engine/scenario.ts and setup.ts; engine contracts stay frozen).
2. Split chunks so no chunk exceeds ~800 KB (vite build.rolldownOptions or dynamic import).
3. tests/e2e/play.spec.ts: (a) ?test=1&seats=bot,bot&seed=e2e&speed=fast plays to game over; (b) ?test=1&seats=human,bot&seed=e2e: a human activates a model, moves it with the UI and shoots or ends activation through real clicks, to round 2. Save screenshots e2e-out/m3-start.png, e2e-out/m3-midgame.png (an attack with the dice tray and odds visible), e2e-out/m3-gameover.png; copy the midgame one to screenshots/m3-playable.png. Keep the existing boot test passing.
4. Append owners' RULING lines to docs/needs-rules-check.md. Run npm run typecheck, npm test, npm run validate:data, npm run build, npx playwright test, npm run sim -- --games 30: all green.
You own every file under src/client/, tests/, screenshots/, e2e-out/, vite.config.ts, playwright.config.ts and docs/needs-rules-check.md. ${KEEP}`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT, effort: 'high' })

return { core, build, scn, integ }
