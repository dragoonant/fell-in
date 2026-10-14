export const meta = {
  name: 'm4d-scenarios',
  description: 'Fix every scenario setup from the audit: Brotherhood of Steel data, scenario forces/deploy/terrain/mechanics, real objective and figure models, terrain scaling',
  phases: [
    { title: 'Build', detail: 'BoS data, models (Gemini+Hunyuan), client visuals, then scenario fixes box+ga then ai+coop' },
    { title: 'Verify', detail: 'source fidelity + opening-setup screenshots of all 16 scenarios' },
    { title: 'Fix', detail: 'route findings, final gate, contact sheet' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
OWNER FEEDBACK: the Red Rocket was a yellow cube; Ad Victoriam fielded Survivors vs Super Mutants instead of the Brotherhood of Steel; the power armor suits are yellow boxes ("looks dumb"); the tire stack looks stretched. "Go through and make fixes."
THE AUDIT: ${ROOT}/docs/audits/m4d-scenario-audit.json lists, per scenario, every mismatch versus the source PDFs, what each object should look like, and the units needed. Treat it as a strong lead, but the PDFs are the authority: check the page it cites before changing data.
Source PDFs (gitignored, read-only, never copy into the repo): ${SRC} (box_scenarios_1-5.pdf, getting_acclimated_v1.3.pdf, red_rocket_ai_scenario.pdf, ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, wave9_costs.pdf, the Campaign Handbook foww-campaign-handbook-digital-final_compress.pdf, and the official card PDFs ${SRC}/w9cards/{unit,pa,weapon}.pdf with full stats). Extract with PyMuPDF (python -I); render pages to PNG and Read them for maps and card layouts.
IP rule: mechanics and names 1:1; all prose (card text, rules text, briefings, UI copy) in our own words; never Modiphius/Bethesda art, icons or trade dress; our own original markings on models.
Frozen contracts: src/engine/{types,decider,view,rng,pending}.ts. Data schema (docs/spec/20-data-schema.md, src/data/types.ts) may be EXTENDED additively; document every addition in spec 20 and in your issues. Every data value carries its source. Rules ambiguities: add a RULING line to docs/needs-rules-check.md, never block.
Owner rule: official rules only, never invent behaviour.
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
  data: 'data/1e/units/brotherhood.json (new), new or extended files under data/1e/{weapons,armor,items}/ for Brotherhood gear and power armor suits (add new files; append to existing ones only where the schema requires), docs/spec/sources/ for their source notes, docs/spec/20-data-schema.md additions, src/data/types.ts additive fields, tools/validate-data.ts',
  scenarios: 'data/1e/scenarios/**, src/engine/{setup,scenario,terrainCatalog}.ts, src/engine/scenarios/**, tests/engine/scenario*.test.ts, tests/engine/objective-status.test.ts, docs/spec/17-scenarios.md, and scenario RULING lines',
  client: 'src/client/** (not contract.ts), tests/client/**, tests/e2e/**',
  assets: 'public/assets/models/** (including manifest.json), tools/models/**',
}

// ---------------- Build ----------------
phase('Build')
const dataThenScenarios = async () => {
  const data = await agent(`${COMMON}
You own ONLY: ${OWN.data}.
Enter Brotherhood of Steel unit data from ${SRC}/w9cards/unit.pdf (and pa.pdf, weapon.pdf, wave9_costs.pdf, ${SRC}/bsdata/Library-BoS.cat for loadouts and costs) in the existing unit/weapon/armor schema (read data/1e/units/survivors.json and other.json for the shape; aspirant-goddard already exists in other.json, leave its id). At minimum: every unit and gear item box-1, box-4 and coop-sewer need per the audit (Knight, Initiate, Goddard able to fight out of armor, the box-4 turret, T-45, T-51 and T-60 power armor suits as wearable armor, and their weapons), plus Paladin and Scribe if their cards are in unit.pdf. Use frozen unit ids in kebab case: knight, initiate, paladin, scribe, brotherhood-turret (or the card's turret name in kebab case), t-45-power-armor, t-51-power-armor, t-60-power-armor. Add the brotherhood-of-steel faction under data/1e/factions/ if missing. npm run validate:data && npm test must pass. ${KEEP}`,
    { label: 'data:bos', phase: 'Build', schema: RESULT, model: 'sonnet' })
  const boxga = await agent(`${COMMON}
You own ONLY: ${OWN.scenarios}.
Brotherhood data now exists (${data ? data.files.join(', ') : 'see data/1e/units/'}). Fix ga-1..ga-4 and box-1..box-5 per the audit and the PDFs:
- Every side declares explicit forces with gear (no DEFAULT_FORCES fallback by seat index; make setup throw or the validator fail when a side has none). Faction-agnostic box sides get a concrete starter-set or Brotherhood force with equal caps, logged as a RULING.
- Use the current deploy zone format that src/engine/scenarios/deploy.ts reads (legacy {within, of} entries are ignored today); correct zones per map.
- Table size per scenario (the GA tutorials use small tables); scenario-specific terrain instead of the generic theme where the source specifies it (box-1 buildings, box-2 containers, box-3 school, box-5 ring of buildings, ai-rr diner as a building). Add catalog pieces as needed; a piece without a GLB uses a procedural shape, and a GLB-backed piece keeps its real proportions (footprint follows the model).
- Markers/objects at their source positions, with a 'face' id the client can model: power-armor-suit, red-rocket, mini-nuke, book, radio-tower, captive, crate, exit, hazard zones, can, mut-fruit-plant, mole-rat-mound.
- Missing mechanics the audit names (box-1 suit claim with a random T-45/T-51/T-60 and suits targetable, box-2 nuke detonation on shots and the round-9 defender win, box-4 turret and held-back reinforcements, box-5 captive becoming a Settler, GA crate-then-exit victory and hazards). Implement what the engine can support cleanly; list the rest in issues.
- Update briefings only where your fixes make them wrong.
npm run typecheck && npm test && npm run validate:data && npm run sim -- --games 5 must pass. ${KEEP}`,
    { label: 'scenarios:box+ga', phase: 'Build', schema: RESULT, model: 'sonnet' })
  const aicoop = await agent(`${COMMON}
You own ONLY: ${OWN.scenarios}.
Fix ai-rr, ai-missile, ai-breakin, ai-tech, coop-sewer, coop-cage, coop-munitions per the audit and the PDFs: AI model gear (every AI model is armed as the source lists), zone shapes and corners, patrol routes and their marker ids, the Red Rocket as a ~4 in long object lying on its side with face red-rocket (keep its Health/armor/push rules), the missile sled size, coop-munitions walls, coop-cage chain armor 2+1 and the bonus die if the engine supports it, ai-tech phases where feasible, and any other audit item. Keep the official AI decider working: npm run typecheck && npm test && npm run validate:data && npm run sim -- --official --games 10 (0 errors, all finish) must pass. ${KEEP}`,
    { label: 'scenarios:ai+coop', phase: 'Build', schema: RESULT, model: 'sonnet' })
  return { data, boxga, aicoop }
}

const built = await parallel([
  dataThenScenarios,
  () => agent(`${COMMON}
You own ONLY: ${OWN.client}.
1. Terrain stretch: find where terrain GLBs are fitted to their catalog footprint (src/client/board/** or figures/**) and fit them with ONE uniform scale that preserves the model's proportions (fit the footprint, then let height follow, or fit height and let footprint follow, whichever keeps it closest to the catalog size); no axis-independent scaling anywhere. Check tire-stack and every terrain piece in ?gallery.
2. Objective objects: src/client/board/Zones.tsx draws every object marker as a 0.8 in yellow box. Replace it with a per-face model registry: if public/assets/models/manifest.json lists the face under a new "objects" key ({ "<face>": { "file": "objects/<face>.glb", "lengthIn"?: n, "heightIn"?: n, "yaw"?: r } }), load that GLB and fit it uniformly; otherwise draw a decent procedural model for that face built from several primitives with our own colours: red-rocket (red finned retro rocket hull lying on its side, cream fins, ~4 in long), power-armor-suit (empty upright armored suit: torso, helmet, limbs, open back, gunmetal with rust, ~2 in tall), mini-nuke (domed shell in an open crate), missile-sled (low olive tracked platform with a finned warhead), radio-tower (lattice mast), book (stack of books), captive (bound kneeling figure), crate/footlocker, exit (marked hatch token), can, mut-fruit-plant, mole-rat-mound, chain, munitions crate, valve, hatch; flat glowing pools for hazard zones. Unknown faces: a labelled token, never a bare box. Extend the manifest parser in src/client/figures/glbModels.ts for the objects key.
3. New units: Brotherhood ids (knight, initiate, paladin, scribe, t-60 Goddard, turret) must render: GLB if listed in the manifest units, else a procedural placeholder that reads as an armored soldier or turret, not a generic pawn.
4. Show ?gallery entries for every object face so they can be reviewed.
npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:visuals', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWN.assets}.
Make real 3D models with the project's figure pipeline: read docs/KNOWLEDGE-BASE.md section 3 (3.1 Gemini via Claude in Chrome with the hidden file input, never the system clipboard; 3.2 the local Hunyuan3D pipeline outside the repo under the user's home folder; 3.x the GLB optimizer tools/models/optimize.mjs) and follow it exactly. First check Claude in Chrome is connected (load its tools via ToolSearch, list connected browsers). Priority order (stop when you run low on time; quality over count):
 1 power-armor-suit (an empty, upright suit of heavy powered armor, open back hatch, gunmetal and rust, our own original design and markings),
 2 red-rocket (a retro red scrap-built rocket, cream fins, lying on its side, roadside-attraction look),
 3 mini-nuke, 4 missile-sled, 5 radio-tower,
 6 Brotherhood figures: knight and initiate (and paladin if time), in the same figure style as public/assets/models/units/*.glb, original designs, proportion words from CLAUDE.md, never the banned words.
Objects go to public/assets/models/objects/<face>.glb with an "objects" entry in public/assets/models/manifest.json (file, lengthIn or heightIn, yaw so the long axis lies along +x and it sits on y=0). Figures go to units/<id>.glb with a units entry like the existing ones (yaw, hand socket per the manifest note). Run the optimizer on every GLB (<= ~2 MB each). Never commit, never put concept images in the repo. If Chrome or Hunyuan is unavailable, say so in issues and stop; the client has procedural fallbacks. ${KEEP}`,
    { label: 'assets:models', phase: 'Build', schema: RESULT }),
])
const chain = built[0] || {}
const client = built[1]
const assets = built[2]
log(`data: ${chain.data ? chain.data.summary : 'FAILED'}`)
log(`box+ga: ${chain.boxga ? chain.boxga.summary : 'FAILED'}`)
log(`ai+coop: ${chain.aicoop ? chain.aicoop.summary : 'FAILED'}`)
log(`client: ${client ? client.summary : 'FAILED'}`)
log(`assets: ${assets ? assets.summary : 'FAILED'}`)

// ---------------- Verify ----------------
phase('Verify')
const reviews = await parallel([
  () => agent(`${COMMON}
Adversarial source-fidelity review; you never edit files. For every scenario in data/1e/scenarios/ and the new Brotherhood unit/gear data, compare against the PDFs page by page: sides and factions, forces and gear, deployment zones, table size, terrain, every marker/object position and rules, rounds, victory. Re-check every audit item in docs/audits/m4d-scenario-audit.json: fixed, still wrong, or wrongly 'fixed'. Check stats of every new unit and weapon against w9cards. Check briefings still match the data. Flag copied source prose. Concrete findings only, owner data/scenarios/client/assets. 300 tokens or fewer.`,
    { label: 'verify:sources', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
  () => agent(`${COMMON}
Visual review; you never edit source files. Start the dev server in the background only if http://localhost:5191/fell-in/ is down (npx vite --port 5191). With Playwright (script in a temp dir, not the repo) at 1280x800, open every scenario (?seats=human,bot&scenario=<id> for ga/box, ?seats=human,official&scenario=<id> for ai/coop, close the briefing) and screenshot the opening table from the default camera and from Top down; also ?gallery. Read every screenshot. Check: correct factions and figures on each side, objects look like what they are (no bare boxes), nothing stretched or floating or sunk, terrain matches the scenario, models inside the table and in their zones, labels readable, table size right. Concrete findings only, owner data/scenarios/client/assets. 300 tokens or fewer.`,
    { label: 'verify:visual', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'low')
log(`verify: ${findings.length} medium/high findings`)

// ---------------- Fix ----------------
phase('Fix')
const byOwner = {}
for (const f of findings) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const fixes = await parallel(Object.keys(byOwner).filter(o => o !== 'assets').map(o => () => agent(`${COMMON}
You own ONLY: ${OWN[o]}. Fix these review findings (skip any you can show is wrong; say why in issues):
${byOwner[o].map((f, i) => `${i + 1}. [${f.severity}] ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
npm run typecheck && npm test && npm run validate:data must pass. ${KEEP}`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT, model: 'sonnet' })))

const gate = await agent(`${COMMON}
Final gate; fix only trivial breakages in files this stage touched. Run npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --games 10, npm run sim -- --official --games 10, npx playwright test (known pre-existing failure: 'human vs bot: activate, move by drag'). Then with Playwright at 1280x800 screenshot the opening table (briefing closed) of box-1 and ai-rr to ${ROOT}/screenshots/m4d-box-1.png and m4d-ai-rr.png, and build one contact sheet of all 16 scenario openings (4x4 grid, labelled) at ${ROOT}/screenshots/m4d-scenarios.png. Revert any change to screenshots/m0-table.png. Report pass/fail per command. ${KEEP}`,
  { label: 'final-gate', phase: 'Fix', schema: RESULT, model: 'sonnet' })

return {
  build: { ...chain, client, assets },
  findings: findings.map(f => `${f.owner}|${f.severity}|${f.where}: ${f.problem}`),
  assetFindings: (byOwner.assets || []).map(f => `${f.where}: ${f.problem}`),
  fixes: fixes.filter(Boolean).map(f => ({ ok: f.ok, summary: f.summary, issues: f.issues })),
  gate,
}
