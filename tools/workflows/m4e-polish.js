export const meta = {
  name: 'm4e-polish',
  description: 'Wire new scenario objects/zones/models into the client, weapon hold poses by class, How to play guide, then verify all 16 scenarios and gate (no GPU work)',
  phases: [
    { title: 'Polish', detail: 'client wiring, weapon holds, turn rules guide' },
    { title: 'Verify', detail: 'source fidelity + opening-setup screenshots of all 16 scenarios' },
    { title: 'Fix', detail: 'route findings, final gate, contact sheet' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
CONTEXT: the previous stage (uncommitted in the working tree; see git status) fixed every scenario from docs/audits/m4d-scenario-audit.json, entered Brotherhood of Steel data (data/1e/units/brotherhood.json, armor/power-armor.json, weapons/brotherhood.json; turret id machine-gun-turret-mk1), made the terrain fit uniform, added a per-face object registry with procedural fallbacks (src/client/board/Zones.tsx, figures/glbModels.ts), and generated GLBs: public/assets/models/objects/{power-armor,red-rocket,nuke,missile-sled,tower}.glb and units/{knight,initiate,paladin}.glb (manifest.json lists them).
OWNER FEEDBACK still open: objects must look like what they are (no yellow boxes); "explain the basic turn rules somewhere"; "all guns are held as if they were pistols, even rifles and shotguns, which looks dumb".
HARD RULE: NO GPU or asset-pipeline work in this stage: never run Hunyuan3D, Gemini, or anything under the user's Hunyuan folders; never regenerate GLBs.
Source PDFs (gitignored, read-only): ${SRC} (box_scenarios_1-5.pdf, getting_acclimated_v1.3.pdf, red_rocket_ai_scenario.pdf, ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, rules_of_play.pdf, errata_faq_v10.pdf, Campaign Handbook foww-campaign-handbook-digital-final_compress.pdf, w9cards/{unit,pa,weapon}.pdf). PyMuPDF (python -I); render pages to PNG for maps.
IP rule: mechanics 1:1; all prose (rules guide, UI copy) in our own words, written from a one-line mechanical summary, never paraphrasing source sentences; no Modiphius/Bethesda art or trade dress.
Frozen: src/engine/{types,decider,view,rng,pending}.ts. Official rules only. Ambiguities -> RULING line in docs/needs-rules-check.md.
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
      owner: { type: 'string', enum: ['data', 'scenarios', 'client', 'assets'] },
      where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['owner', 'where', 'problem', 'fix', 'severity'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'
const OWN = {
  data: 'data/1e/{units,weapons,armor,items,factions}/**, docs/spec/sources/**, src/data/types.ts additive, tools/validate-data.ts',
  scenarios: 'data/1e/scenarios/**, src/engine/** (not the frozen files), tests/engine/**, tests/ai/**, docs/spec/17-scenarios.md',
  client: 'src/client/** (not contract.ts unless needed), tests/client/**, tests/e2e/**, public/assets/models/manifest.json (sockets/rot/yaw values only)',
}

phase('Polish')
const [wiring, holds, guide] = await parallel([
  () => agent(`${COMMON}
You own ONLY: src/client/board/** and tests/client/board-*.test.ts (create as needed).
Wire the scenario changes into the table (the scenario agents left these for the client):
- Object markers: map every marker face in data/1e/scenarios/ to a model: the GLB from manifest "objects" when present (faces power-armor, red-rocket, nuke, missile-sled, tower; check the exact face strings used in the data and the manifest keys match, add aliases if not), else the procedural model. Read props.rotDeg, lengthIn/widthIn and baseMm to orient and size them (the rocket lies on its side ~4 in long; the sled ~1.2x0.8 in). Fit GLBs with one uniform scale.
- Hide markers flagged props.destroyed / offTable / freed / claimed (cans hit, suits claimed, captive freed).
- Draw every deploy zone shape the engine now uses (boxes, rings, triangles, legacy {within,of} strips) for all scenarios, and hazard zones as flat glowing pools.
- Skip engine-only terrain entries named obj-<marker> (they duplicate an object), and give procedural pieces school-wall, hazard-zone, diner (a low roadside diner building, ~7x6 in) and containers a decent look.
- Route/patrol markers ('1','2','A', etc.): small numbered flags, not big tokens.
Check every scenario at 1280x800 with Playwright (temp dir script) and Read the screenshots. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:wiring', phase: 'Polish', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/client/figures/**, tests/client/figures-*.test.ts and tests/client/glb-pipeline.test.ts, and the socket/rot values in public/assets/models/manifest.json.
Weapon holds by class (owner-approved option A; no mesh changes): today every weapon GLB is placed at the single fist socket like a pistol. Classify every weapon (data/1e/weapons/**: type, range, keywords, two-handed/heavy flags; fall back to name) into: pistol/one-hand, long gun (rifles, shotguns, laser/plasma/gauss rifles), heavy (missile launcher, minigun, fat man, flamer), one-hand melee, two-hand melee (sledgehammer, super sledge, board), thrown. Give each class a hold transform relative to the fist socket and the figure frame so it reads correctly from the default camera: long guns angled across the body at low ready (stock toward the opposite hip, barrel forward-up), heavy weapons on the shoulder pointing forward, two-hand melee resting on the shoulder, pistols and one-hand melee as now. Respect per-unit manifest overrides. Make sure nothing clips badly through the torso on the 11 starter figures and knight/initiate/paladin; check in ?gallery with Playwright (temp script), Read the screenshots, and tune. Unit tests for the classifier. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:weapon-holds', phase: 'Polish', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/client/ui/HowToPlay.tsx, src/client/ui/howToPlay.css, src/client/ui/howToPlayContent.ts (new), small mount points in src/client/ui/{StartScreen.tsx,TopBar.tsx,Briefing.tsx} only to add buttons/links, and tests/client/how-to-play.test.ts.
Write a "How to play" guide in our own words from rules_of_play.pdf + errata (mechanics only) and docs/spec/ (read the turn-flow and activation spec sections): what a round is; turns alternate; on your turn you make one unit Ready and then use all your Ready units or skip them; activation = 2 Actions; the main actions (Move, Shoot, Charge/close combat, Get Ready/Prepare, Search/Use, Climb/Jump, Rally) each in one plain line with what it costs; reactions and Prepared tokens; the dice in one short paragraph (skill die vs SPECIAL, armor dice, what the colours mean, the ruler colours and their inches from data/1e/rulers.json); how a round ends and the game ends; where the game shows odds. Keep it short and scannable: sections with headings, bullets, a few small diagrams built from HTML/CSS (no source art). Reachable from the start screen, a "How to play" button in the in-game top bar/menu, and a link in the scenario briefing. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:how-to-play', phase: 'Polish', schema: RESULT, effort: 'high' }),
])
log(`wiring: ${wiring ? wiring.summary : 'FAILED'}`)
log(`holds: ${holds ? holds.summary : 'FAILED'}`)
log(`guide: ${guide ? guide.summary : 'FAILED'}`)

phase('Verify')
const reviews = await parallel([
  () => agent(`${COMMON}
Adversarial source-fidelity review; you never edit files. For every scenario in data/1e/scenarios/ and the new Brotherhood unit/gear data, compare against the PDFs: sides and factions, forces and gear, deployment, table size, terrain, every marker/object position and rules, rounds, victory. Re-check every item in docs/audits/m4d-scenario-audit.json (fixed / still wrong / wrongly fixed). Check new unit and weapon stats against w9cards. Check briefings match the data, and the How to play guide (src/client/ui/howToPlayContent.ts) matches the rules and errata. Flag copied source prose. Concrete findings only, owner data/scenarios/client. 300 tokens or fewer.`,
    { label: 'verify:sources', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
  () => agent(`${COMMON}
Visual review; you never edit source files. Start the dev server in the background only if http://localhost:5191/fell-in/ is down (npx vite --port 5191). With Playwright (temp dir script) at 1280x800 open every scenario (?seats=human,bot&scenario=<id> for ga/box, ?seats=human,official&scenario=<id> for ai/coop), close the briefing, screenshot the opening table from the default camera and Top down; also ?gallery and the How to play guide. Read every screenshot. Check: correct factions and figures per side, objects look like what they are (no bare boxes), weapons held sensibly for their type, nothing stretched/floating/sunk, terrain matches the scenario, models in their zones, labels readable, table size right, guide readable. Concrete findings only, owner data/scenarios/client (use 'assets' only for a GLB that is itself broken). 300 tokens or fewer.`,
    { label: 'verify:visual', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'low')
log(`verify: ${findings.length} medium/high findings`)

phase('Fix')
const byOwner = {}
for (const f of findings) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const fixes = await parallel(Object.keys(byOwner).filter(o => o !== 'assets').map(o => () => agent(`${COMMON}
You own ONLY: ${OWN[o]}. Fix these review findings (skip any you can show is wrong; say why in issues):
${byOwner[o].map((f, i) => `${i + 1}. [${f.severity}] ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
npm run typecheck && npm test && npm run validate:data must pass. ${KEEP}`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT, model: 'sonnet' })))

const gate = await agent(`${COMMON}
Final gate; fix only trivial breakages. Run npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --games 10, npm run sim -- --official --games 10, npx playwright test (known pre-existing failure: 'human vs bot: activate, move by drag'). Then with Playwright at 1280x800 save: ${ROOT}/screenshots/m4d-box-1.png and m4d-ai-rr.png (opening table, briefing closed), ${ROOT}/screenshots/m4d-holds.png (?gallery figures holding rifle, shotgun, missile launcher, sledgehammer, pistol), ${ROOT}/screenshots/m4d-how-to-play.png, and a labelled 4x4 contact sheet of all 16 scenario openings at ${ROOT}/screenshots/m4d-scenarios.png. Revert any change to screenshots/m0-table.png. Report pass/fail per command. ${KEEP}`,
  { label: 'final-gate', phase: 'Fix', schema: RESULT, model: 'sonnet' })

return {
  polish: { wiring, holds, guide },
  findings: findings.map(f => `${f.owner}|${f.severity}|${f.where}: ${f.problem}`),
  assetFindings: (byOwner.assets || []).map(f => `${f.where}: ${f.problem}`),
  fixes: fixes.filter(Boolean).map(f => ({ ok: f.ok, summary: f.summary, issues: f.issues })),
  gate,
}
