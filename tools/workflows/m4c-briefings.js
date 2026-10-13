export const meta = {
  name: 'm4c-briefings',
  description: 'Scenario briefings, live objective tracker, objective marker labels and start-screen previews so players know what to do',
  phases: [
    { title: 'Build', detail: 'briefing data + objective status + client, in parallel on frozen shapes' },
    { title: 'Review', detail: 'new-player usability pass in a real browser' },
    { title: 'Fix', detail: 'apply review findings, final gate + screenshots' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
OWNER FEEDBACK driving this stage: "The game doesn't tell me anything about the scenario - objectives, what to do, nothing. It feels very unfriendly." Goal: a new player opening any scenario knows the situation, their goal, the enemy's goal, how to win, how many rounds, and where the objectives are on the table, at all times.
Source PDFs (gitignored, read-only, never copy): ${SRC} (Campaign Handbook foww-campaign-handbook-digital-final_compress.pdf, red_rocket_ai_scenario.pdf, ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, box_scenarios_1-5.pdf, getting_acclimated_v1.3.pdf).
IP rule: all prose in our own words, written from a one-line mechanical summary; never paraphrase source sentences; no Modiphius/Bethesda art or trade dress.
Frozen contracts: src/engine/{types,decider,view,rng,pending}.ts. The data schema change below is approved: mirror it in docs/spec/20-data-schema.md.
FROZEN SHAPES for this stage (all agents code to these exactly):
1) Scenario data gains an optional field: briefing: { story: string; goals: Record<string /* side id */, string>; howToWin: string[]; tips: string[] }. story 2-3 sentences of flavour + situation; goals one sentence per side id, phrased to that side's player ("Keep the rocket standing..."); howToWin 2-5 short bullets incl. round limit, scoring and draw; tips 1-3 practical bullets for a new player.
2) src/engine/scenarios/status.ts exports
   export interface ObjectiveLine { id: string; text: string; side?: string; value?: number; max?: number; done?: boolean }
   export interface ObjectiveStatus { scenarioId: string; name: string; round: number; rounds: number; lines: ObjectiveLine[]; markers: { id: string; label: string; x: number; z: number }[] }
   export function objectiveStatus(view: PlayerView): ObjectiveStatus | null
   re-exported from src/engine/query.ts. Lines are short UI strings from the engine (e.g. "Red Rocket Health", value 7, max 10; "Victory points" per side; "Tech escaped", done). markers = every objective marker/object on the table with a 1-3 word label and its position in inches.
Run long commands in the FOREGROUND. Never npm install, git commit, or edit STATUS.md/package.json. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', enum: ['data', 'engine', 'client'] },
      where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['owner', 'where', 'problem', 'fix', 'severity'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'
const OWN = {
  data: 'data/1e/scenarios/scenarios.json (briefing fields only), src/data/types.ts and tools/validate-data.ts (briefing schema only), docs/spec/20-data-schema.md, src/data/data.test.ts',
  engine: 'src/engine/scenarios/status.ts (new), the re-export line in src/engine/query.ts, tests/engine/objective-status.test.ts',
  client: 'src/client/** and tests/client/**, tests/e2e/**',
}

phase('Build')
const [data, engine, client] = await parallel([
  () => agent(`${COMMON}
You own ONLY: ${OWN.data}.
Write a briefing (frozen shape 1) for EVERY scenario in data/1e/scenarios/scenarios.json (ga-1..4, box-1..5, ai-*, coop-*). Base the mechanics strictly on that scenario's own victory, rules, rounds, markers and sides data, plus docs/spec/17-scenarios.md; check the PDFs only to get the situation right (mechanics only, own words). goals keys must be that scenario's side ids. For ai-/coop- scenarios the human side's goal is the one that matters; the AI side's goal says what the AI will try to do. Keep each string plain and friendly; no rules jargon without a short gloss. Add the optional field to the data types and validator, document it in spec 20, and make validate-data fail if any scenario lacks a briefing or a goal for one of its sides. npm run validate:data && npm test must pass. ${KEEP}`,
    { label: 'data:briefings', phase: 'Build', schema: RESULT, effort: 'high' }),
  () => agent(`${COMMON}
You own ONLY: ${OWN.engine}.
Implement objectiveStatus (frozen shape 2) for every scenario, reading the scenario's victory data and runtime state through the PlayerView only (no hidden info). Read src/engine/scenario.ts and src/engine/scenarios/* to see how victory is scored and what counters exist; derive values the same way the engine scores them, never re-implement scoring differently. Cover: VP per side, object Health (Red Rocket, missile sled, chain), counts of items/markers secured, escaped/rescued models, rounds. markers: every objective marker or object (rocket, sled, loot/item/investigation markers, exits) with a short label. Tests in tests/engine/objective-status.test.ts for box-1, ai-rr (rocket Health drops after damage), and one coop scenario. npm run typecheck && npm test must pass. ${KEEP}`,
    { label: 'engine:status', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWN.client}.
Read src/client/ui/{StartScreen.tsx,start/startView.ts,Hud.tsx,TopBar.tsx,Prompt.tsx}, src/client/store/gameStore.ts and how the bundle exposes scenario data. Code against the frozen shapes even if the other agents' files are not there yet (import objectiveStatus from src/engine/query; tolerate briefing being undefined with a sensible fallback built from scenario name/rounds).
Build:
1. Start screen: when a scenario is selected, show its story, the player's goal and the round count beside the list.
2. Briefing modal: opens automatically at the start of every scenario game before the first decision (the "Begin the battle" step), titled with the scenario name: story, "Your goal", "Enemy goal" (or "The Wasteland AI will..."), "How to win" bullets, "Tips", key special rules (scenario rules[].text, collapsed under "Special rules"), round count. One clear button "Start". In co-op/hot-seat show the goal for each human side.
3. A "Briefing" button in the top bar to reopen it any time.
4. Objective tracker: a compact always-visible HUD panel (top-left under the top bar, not overlapping the AI card panel at top centre, the prompt dock at bottom or the rails) with the scenario name, "Round r of n", and each objectiveStatus line (value/max as a small bar, done as a check). Updates as the presented state changes.
5. Objective marker labels in the 3D scene: a small billboard label (drei Html or Text) above each objectiveStatus marker, readable from the default camera, our own styling.
6. A one-line hint on the prompt dock for the turn-flow decisions a new player hits first (making a unit ready, use or skip ready units, activation), in plain words, from data in promptView.ts.
Our own styling consistent with hud.css. Tests: unit tests for the view helpers, and an e2e test that opens ?seats=human,official&scenario=ai-rr, sees the briefing, clicks Start, and sees the tracker with "Round 1 of 4". npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:briefing-ui', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])
log(`data: ${data ? data.summary : 'FAILED'}`)
log(`engine: ${engine ? engine.summary : 'FAILED'}`)
log(`client: ${client ? client.summary : 'FAILED'}`)

phase('Review')
const review = await agent(`${COMMON}
You are a first-time player and usability reviewer; you never edit source files. Start the dev server yourself in the background only if http://localhost:5191/fell-in/ is not already up (npx vite --port 5191), then use Playwright (node script in your scratch/temp dir, not the repo) at 1280x800 to open: the start screen (pick ai-rr, box-1, coop-sewer in turn and screenshot the preview), ?seats=human,official&scenario=ai-rr, ?seats=human,bot&scenario=box-1, and ?seats=human,human&scenario=coop-sewer if supported. Screenshot the briefing, then the table after Start, then after a few turns. Read the screenshots. Judge: does a new player understand the situation, their goal, how to win, and where the objectives are? Is anything overlapping, cut off, unreadable, wrong vs the scenario data, or missing? Is any prose copied from the source PDFs? Also run npm run typecheck && npm test. Concrete findings only, each with owner (data/engine/client). 300 tokens or fewer.`,
  { label: 'review:new-player', phase: 'Review', schema: FINDINGS, effort: 'high' })
const findings = (review ? review.findings : []).filter(f => f.severity !== 'low')
log(`review: ${findings.length} medium/high findings`)

phase('Fix')
const byOwner = {}
for (const f of findings) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const fixes = await parallel(Object.keys(byOwner).map(o => () => agent(`${COMMON}
You own ONLY: ${OWN[o]}. Fix these review findings (skip any you can show is wrong; say why in issues):
${byOwner[o].map((f, i) => `${i + 1}. [${f.severity}] ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
npm run typecheck && npm test must pass. ${KEEP}`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT, model: o === 'data' ? undefined : 'sonnet', effort: o === 'data' ? 'high' : undefined })))

const gate = await agent(`${COMMON}
Final gate; fix only trivial breakages in files this stage touched. Run npm run typecheck, npm test, npm run validate:data, npm run build, npx playwright test (note pre-existing failure 'human vs bot: activate, move by drag'). Save two Playwright screenshots at 1280x800: ${ROOT}/screenshots/m4c-briefing.png (the ai-rr briefing modal) and ${ROOT}/screenshots/m4c-tracker.png (ai-rr table after Start and one AI turn, tracker and marker labels visible). Revert any change the e2e run makes to screenshots/m0-table.png. Report pass/fail per command. ${KEEP}`,
  { label: 'final-gate', phase: 'Fix', schema: RESULT, model: 'sonnet' })

return { build: { data, engine, client }, findings: findings.map(f => `${f.owner}|${f.severity}|${f.where}: ${f.problem}`), fixes: fixes.filter(Boolean).map(f => ({ ok: f.ok, summary: f.summary, issues: f.issues })), gate }
