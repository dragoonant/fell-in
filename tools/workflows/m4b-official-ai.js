export const meta = {
  name: 'm4b-official-ai',
  description: 'M4b: official AI card system for solo/co-op (spec, AI card data, procedure decider, client mode), verified',
  phases: [
    { title: 'Design', detail: 'spec 18 addendum, interfaces, data plan' },
    { title: 'Build', detail: 'AI card data, procedure decider, solo/co-op client' },
    { title: 'Verify', detail: 'rules fidelity + legality review, then fix' },
  ],
}

const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: mechanics 1:1; AI card names may match; ALL card text, response wording and UI copy in our own words from one-line mechanical summaries; never copy card or handbook sentences.
Frozen: src/engine/{types,decider,view,rng,pending,registry,apply}.ts, src/data/types.ts (data schema FROZEN M1; AiCardDef exists), src/ai/{types,decider}.ts. Report needed changes in issues.
Run long commands in the FOREGROUND. Never npm install or git commit; never edit STATUS.md or package.json.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Sources (gitignored, extract with PyMuPDF; render pages to PNG and Read them when layout matters): docs/sources/ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, errata_faq_v10.pdf, red_rocket_ai_scenario.pdf, ai_response_flowcharts.pdf (fan-made flowcharts, Fan-source), and research notes docs/spec/sources/R1-archives.md, R2-photos.md (photos in docs/sources/research/photos/). Spec: docs/spec/18-ai-system.md, checklist AI-* and COOP-* in docs/spec/12-rules-test-checklist.md, rulings log docs/needs-rules-check.md.
Every AI matrix value gets a source and status: Confirmed (official), Fan-source, or Unsourced (our placeholder, built from the unit's card and the published response rules). Starter-unit AI matrices are NOT in any free source; build Unsourced matrices that follow the published card structure and mark them so they can be swapped when the owner photographs the real cards.`

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
      where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['where', 'problem', 'fix', 'severity'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

phase('Design')
const design = await agent(`${COMMON}
You are the architect for the official AI card system (solo and co-op play against AI-driven forces). Read spec 18 fully, the AI and co-op handbooks, the errata AI pages, the fan flowcharts PDF (all 5 pages, rendered), R2-photos.md, src/data/types.ts (AiCardDef), the engine decision kinds, and src/ai/decider.ts.
1. Add a section "8. Implementation (M4b)" to docs/spec/18-ai-system.md: the AI turn procedure step by step (readying, unit order, settings Objective/Subject, column predicate, row die, response letters A/O/D/M etc. and how each maps onto engine actions and decision kinds), co-op seat rules, where the flowcharts fill gaps (Fan-source), and every remaining guess as a numbered RULING.
2. Freeze interfaces: src/ai/official/types.ts and src/ai/official/decider.ts (createOfficialAiDecider(bundle, opts): Decider; deterministic, uses only view + legal, randomness via deriveSeed, every AI die roll visible through an event or pending context so the client can show it), plus stubs src/ai/official/{procedure,responses,targeting}.ts with exact exports.
3. Data plan: list in issues the AiCardDef records needed (11 starter units plus generic response/reference cards) and the file path data/1e/ai/<faction>.json.
Typecheck + test green. You own ONLY: docs/spec/18-ai-system.md, src/ai/official/. ${KEEP}`,
  { label: 'design', phase: 'Design', schema: RESULT, effort: 'high' })
if (!design || !design.ok) return { design, stopped: 'design not ok' }

phase('Build')
const NOTES = JSON.stringify(design.issues)
const OWNERS = [
  { key: 'data', own: 'data/1e/ai/, docs/spec/sources/AI-CARDS-sources.md', task: 'Enter the AI card data per the design notes: one AiCardDef per starter unit (11) and the generic reference/response records. Matrices: use any official value found in R2 photos or handbooks (Confirmed), flowchart-derived logic (Fan-source), else an Unsourced matrix following the published structure and the unit card (melee units favour Charge/Close Combat responses, shooters favour Attack/ranged, hounds and Deathclaw are Reckless). Every record has source and a status per cell or per card. Write docs/spec/sources/AI-CARDS-sources.md: per unit, which cells are Confirmed / Fan-source / Unsourced, and a short "photograph these cards to confirm" list for the owner. npm run validate:data must pass.', model: 'sonnet' },
  { key: 'proc', own: 'src/ai/official/ (except types.ts and decider.ts), tests/ai/official.test.ts', task: 'Implement procedure.ts, responses.ts, targeting.ts per spec 18 section 8: the AI turn, column predicate, row die, each response mapped to engine actions through the legal list (never invent actions), target priorities, Reckless/Careful variants, V.A.T.S. and Luck rules for the AI Heroic per the RULING lines. Tests named AI-0xx / COOP-0xx by checklist ID (about 10).', model: 'sonnet' },
  { key: 'client', own: 'src/client/bot/ (official AI brain wiring), src/client/ui/start/ and StartScreen.tsx (solo/co-op modes), src/client/ui/AiCardPanel.tsx (new), src/client/ui/Hud.tsx (mount line only), tests/client/official-*.test.ts', task: 'Solo mode ("Solo against the game": human vs official AI) and Co-op (2 humans hot-seat vs official AI) from the start screen with the AI scenarios (Red Rocket and the AI handbook scenarios in data/1e/scenarios). botDriver uses createOfficialAiDecider for AI seats in these modes. AiCardPanel shows the AI card being resolved in OUR design: unit, column chosen and why, the row die, the response and its plain-words meaning, so the player can follow the AI. Keep data-testids stable (start-mode-solo, start-mode-coop, ai-card-panel).', model: 'sonnet' },
]
const build = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are M4b build owner "${o.key}". Interfaces are FROZEN in src/ai/official/types.ts and decider.ts and spec 18 section 8; do not edit them.
Architect notes: ${NOTES}
Build: ${o.task}
Finish with npm run typecheck and npm test green for your files.
You own ONLY: ${o.own}. ${KEEP}`, { label: `build:${o.key}`, phase: 'Build', schema: RESULT, model: o.model })))

phase('Verify')
const LENSES = [
  'RULES FIDELITY: compare spec 18 section 8 and src/ai/official against the AI handbook, co-op handbook, errata and the fan flowcharts (render the PDF pages). Find responses mapped wrongly, wrong column/row logic, missing steps, Confirmed cells that disagree with sources, and copied card wording.',
  'LEGALITY and PLAY: run npm run sim with the official AI on both an AI seat vs random and vs the normal bot across the AI scenarios (write a small script under tools/ if the sim lacks a flag; do not commit it to the repo: put it in docs/sources/extract/). Find rejected actions, stalls, crashes, hidden-info reads beyond view, and responses that never fire.',
]
const verdicts = await parallel(LENSES.map((lens, i) => () => agent(`${COMMON}
You are an adversarial reviewer. NEVER edit repo files. Lens: ${lens}
Report only real, verified defects with a precise fix and the owner file.`,
  { label: `verify:${i + 1}`, phase: 'Verify', schema: FINDINGS, effort: 'high' })))
const findings = verdicts.filter(Boolean).flatMap(v => v.findings).filter(f => f.severity !== 'low')
let fix = null
if (findings.length) {
  fix = await agent(`${COMMON}
Apply these verified findings (re-check each; skip and report any you can refute):
${JSON.stringify(findings)}
Also append every RULING line from spec 18 section 8 and the build reports to docs/needs-rules-check.md:
${JSON.stringify(build.map(b => b && b.issues))}
Then run npm run typecheck, npm test, npm run validate:data, npm run sim -- --games 20, npm run bench:ai -- --games 40 --a normal --b random (must not regress below 0.9 on this short run).
You own ONLY: src/ai/official/, data/1e/ai/, src/client/bot/, src/client/ui/AiCardPanel.tsx, src/client/ui/start/, tests/, docs/spec/18-ai-system.md, docs/spec/sources/AI-CARDS-sources.md, docs/needs-rules-check.md. ${KEEP}`,
    { label: 'fix', phase: 'Verify', schema: RESULT, model: 'sonnet' })
}
return { design, build, findingsCount: findings.length, findings: findings.map(f => f.problem.slice(0, 120)), fix }
