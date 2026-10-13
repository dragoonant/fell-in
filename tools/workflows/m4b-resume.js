export const meta = {
  name: 'm4b-resume',
  description: 'M4b resume: finish the official AI decider, fold in photo-confirmed AI cards, AI panel, AI scenarios and sim, verify, fix, gate',
  phases: [
    { title: 'Build', detail: 'decider + data + client in parallel, then scenarios/sim' },
    { title: 'Verify', detail: 'rules fidelity and play/legality review' },
    { title: 'Fix', detail: 'route findings to owners, then final gate' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
Source PDFs (gitignored, read-only, never copy into the repo): ${SRC}. PRIMARY SOURCE: ${SRC}/foww-campaign-handbook-digital-final_compress.pdf, the Campaign Handbook (cite "CH p<book page>"; PDF page index = book page + 2). Extract with PyMuPDF (python -I); render a page to PNG and Read it when layout garbles.
Context: M4b was redone from the Campaign Handbook. docs/spec/18-ai-system.md (section 8 = implementation), the engine AI-turn hooks (src/engine/{turnflow,objects,sides,scenario}.ts, tests/engine/ai-turns.test.ts) and the frozen interfaces in src/ai/official/types.ts are DONE. src/ai/official/*.ts bodies are todo() stubs.
OWNER RULE: official rules only, no house rules, never invent behaviour. New ambiguity: add a RULING line to docs/needs-rules-check.md (status Unsourced/Fan-source) and say so in issues.
IP rule: mechanics 1:1; all prose (card text, UI copy, comments) in our own words; never paste source sentences.
Frozen contracts: src/engine/{types,decider,view,rng,pending}.ts, src/ai/official/types.ts and the data schema (docs/spec/20-data-schema.md, src/data/types.ts). Change only if unavoidable, with a matching spec edit and a note in issues.
Deciders see only view(state, seat) and legalActions; all AI randomness via deriveSeed, never Math.random.
Tests are named by checklist ID from docs/spec/12-rules-test-checklist.md (AI-*, COOP-*, SCN-*).
Run long commands in the FOREGROUND. Never npm install, git commit, or edit STATUS.md/package.json unless told.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

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
      owner: { type: 'string', enum: ['engine', 'decider', 'client', 'scenarios', 'data'] },
      where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['owner', 'where', 'problem', 'fix', 'severity'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

const OWN = {
  decider: 'src/ai/official/** and tests/ai/official-*.test.ts',
  data: 'data/1e/ai/**, docs/spec/sources/ai-cards-photo/** (delete the folder when folded in), docs/spec/sources/AI-CARDS-sources.md, and the AI-card RULING lines in docs/needs-rules-check.md',
  client: 'src/client/** (not contract.ts) and tests/client/**, tests/e2e/**',
  scenarios: 'data/1e/scenarios/**, src/engine/scenario*.ts or src/engine/scenarios/**, tools/sim.ts, tests/engine/scenario*.test.ts',
  engine: 'src/engine/** except scenario files, and tests/engine/** except scenario tests',
}

// ---------------- Build ----------------
phase('Build')
const [decider, data, client] = await parallel([
  () => agent(`${COMMON}
You own ONLY: ${OWN.decider}.
Implement every todo() in src/ai/official/{decider,matrix,targeting,responses,objectives}.ts against the frozen src/ai/official/types.ts and docs/spec/18-ai-system.md sections 1-4 and 8 (CH p8-16): AI numbers and number-token draw, blue-die face (weights from data/1e/dice.json), column/row cell reading with reckless/stayEngaged, settings and objective switches, responses A M O F D S, Careful vs Reckless, target priority factors and class-first lists, weapon choice (Improvised only if nothing better), reactions, seeded tie-breaks with a logged tie, and an AiDecisionLog per choice. Use src/engine/query.ts for odds/range/cover; never re-derive rules. Never return an illegal action: if no rule applies, pick per the spec fallback and log it. Tests AI-001..015 in tests/ai/official-*.test.ts, including a determinism test and a full ai-rr game with the official decider on the AI seat and the random decider on the player seat reaching a result. npm run typecheck && npm test must pass. ${KEEP}`,
    { label: 'decider', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWN.data}.
data/1e/ai/starter.json is the CH-sourced AI card set; most matrices are 'placeholder'. docs/spec/sources/ai-cards-photo/{survivors,super-mutants,other}.json hold an earlier entry in an older shape with values read from card photos (Confirmed for Super Mutant, Aviator, Sole Survivor, Deathclaw, Aspirant Goddard; see docs/spec/sources/AI-CARDS-sources.md). For each card: where CH gives a value keep CH; where starter.json is placeholder and the photo entry is Confirmed, port the photo values into the starter.json schema with their source. Do not port Unsourced values over placeholders. Add Aspirant Goddard and Deathclaw if missing. Then delete docs/spec/sources/ai-cards-photo/ and update AI-CARDS-sources.md and the AI-card RULING lines. npm run validate:data && npm test must pass. ${KEEP}`,
    { label: 'data', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWN.client}.
The official brain is wired (src/client/bot/{officialBrain,botDriver}.ts; answers carry aiLog and the engine emits an 'ai.decision' event). Finish the client: (1) start screen Solo (1 human vs Wasteland AI) and Co-op (2 hot-seat humans vs Wasteland AI) with the scenario list filtered to ai-*/coop-* scenarios; check what src/client/ui/StartScreen.tsx and start/startView.ts already do and complete only what's missing. (2) A compact AI card panel in the HUD (src/client/ui/AiCardPanel.tsx, mounted in Hud.tsx) showing for the latest 'ai.decision' event: unit, card column, die row, response and target, in our own words, with original styling. (3) The feed line for each AI decision. (4) ?seats=human,official works. Do not touch src/ai/**. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])
log(`decider: ${decider ? decider.summary : 'FAILED'}`)
log(`data: ${data ? data.summary : 'FAILED'}`)
log(`client: ${client ? client.summary : 'FAILED'}`)
if (!decider || !decider.ok) return { stage: 'decider', decider, data, client }

const scenarios = await agent(`${COMMON}
You own ONLY: ${OWN.scenarios}.
The official decider (src/ai/official/decider.ts, createOfficialAiDecider) now works. Make the AI and co-op scenarios in data/1e/scenarios/scenarios.json playable end to end per docs/spec/17-scenarios.md section 4, with numbers from CH AI scenarios first, then ${SRC}/red_rocket_ai_scenario.pdf, ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf: ai-rr first, then ai-missile, ai-breakin, ai-tech, coop-sewer, coop-cage, coop-munitions (deployment, objects, AI settings/switches/phases as data, round limit, victory). Add a sim flag so npm run sim -- --official --games 20 runs every AI/co-op scenario with the official decider on the AI side and random/normal bots on the player seats: 0 errors, every game reaches a result, same seed gives the same results. List any scenario you cannot finish in issues. npm run typecheck && npm test must pass. ${KEEP}`,
  { label: 'scenarios', phase: 'Build', schema: RESULT, model: 'sonnet' })
log(`scenarios: ${scenarios ? scenarios.summary : 'FAILED'}`)

// ---------------- Verify ----------------
phase('Verify')
const reviews = await parallel([
  () => agent(`${COMMON}
Adversarial rules-fidelity review; you never edit files. Compare src/ai/official/**, the AI turn flow and co-op readying in src/engine/**, data/1e/ai/starter.json and the AI scenario data against the Campaign Handbook section 3 and AI scenarios (primary), docs/spec/18-ai-system.md, 17-scenarios.md section 4, the AI rulings, and the free PDFs (ai_handbook, coop_handbook, ai_response_flowcharts, red_rocket, errata). Hunt for: invented behaviour, wrong response procedures, wrong target-priority semantics, Careful/Reckless/stayEngaged errors, scenario or card numbers that differ from sources, copied source prose. Concrete, verifiable findings only, each with an owner (${Object.keys(OWN).join('/')}). 300 tokens or fewer.`,
    { label: 'verify:rules', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
  () => agent(`${COMMON}
Adversarial legality, determinism and play review; you never edit files. Run npm run typecheck, npm test, npm run sim -- --official --games 30 --seed v1 twice (results must match) and npm run sim -- --games 20. Check: the official decider reads only view(state, seat); it never returns an illegal action or stalls an open decision; every AI decision emits the log event; no Math.random; 2-seat co-op games and ?seats=human,official reach game over; the AI actually pursues its objective (e.g. reaches and damages the Red Rocket in ai-rr). Concrete findings only, each with an owner (${Object.keys(OWN).join('/')}). 300 tokens or fewer.`,
    { label: 'verify:play', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'low')
log(`verify: ${findings.length} medium/high findings`)

// ---------------- Fix ----------------
phase('Fix')
const byOwner = {}
for (const f of findings) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const fixes = await parallel(Object.keys(byOwner).map(o => () => agent(`${COMMON}
You own ONLY: ${OWN[o]}. Fix these review findings (skip any you can show is wrong; say why in issues):
${byOwner[o].map((f, i) => `${i + 1}. [${f.severity}] ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
npm run typecheck && npm test must pass. ${KEEP}`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT, model: 'sonnet' })))

const gate = await agent(`${COMMON}
Final gate; you may fix only trivial breakages in files this stage touched. Run npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --official --games 20, npm run sim -- --games 20, npx playwright test. Then take a Playwright screenshot of a ?seats=human,official game on ai-rr a few AI activations in with the AI card panel visible, saved as ${ROOT}/screenshots/m4b-official-ai.png. Report pass/fail per command in summary. ${KEEP}`,
  { label: 'final-gate', phase: 'Fix', schema: RESULT, model: 'sonnet' })

return {
  build: { decider, data, client, scenarios },
  findings: findings.map(f => `${f.owner}|${f.severity}|${f.where}: ${f.problem}`),
  fixes: fixes.filter(Boolean).map(f => ({ ok: f.ok, summary: f.summary, issues: f.issues })),
  gate,
}
