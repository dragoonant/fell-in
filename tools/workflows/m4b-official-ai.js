export const meta = {
  name: 'm4b-official-ai',
  description: 'M4b: official AI card system (solo/co-op) from the Campaign Handbook: design, engine, decider, scenarios, verify, fix',
  phases: [
    { title: 'Design', detail: 'spec 18 impl notes, frozen src/ai/official interfaces, placeholder AI cards' },
    { title: 'Build', detail: 'engine hooks + official decider + client mode, then AI scenarios' },
    { title: 'Verify', detail: 'adversarial rules-fidelity and legality review' },
    { title: 'Fix', detail: 'route findings to owners' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
Free 1st-edition source PDFs (gitignored, read-only, never copy into the repo): ${SRC} (ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, ai_response_flowcharts.pdf, red_rocket_ai_scenario.pdf, errata_faq_v10.pdf (overrides older text), rules_of_play.pdf). Extract with PyMuPDF (python -I); render a page to PNG and Read it when layout garbles.
PRIMARY SOURCE: ${SRC}/foww-campaign-handbook-digital-final_compress.pdf = the official Campaign Handbook (cite "CH p<book page>"; PDF page index = book page + 2, e.g. book p10 is PDF page 12). Section 3 "Against the Wasteland" (book p8-17: Solo/Co-op Mode, Activating AI Models, Responses, Other Rules for AI Play) and the AI scenarios (section 5) override any fan-source ruling or blog-derived text in docs/spec/18-ai-system.md.
OWNER RULE FOR THIS MILESTONE: official rules only, no house rules, never invent behaviour. New ambiguities: add a RULING line to docs/needs-rules-check.md (status Unsourced/Fan-source).
IP rule: mechanics 1:1, all prose (card text, scenario text, UI copy, comments) in our own words; never paste source sentences.
Frozen contracts: src/engine/{types,decider,view,rng,pending}.ts and the data schema (docs/spec/20-data-schema.md, src/data/types.ts). Change them only if unavoidable, with a matching edit to docs/spec/00-architecture.md (or 20) and a note in your issues.
Deciders only ever receive view(state, seat) and legalActions; all AI randomness (number tokens, blue die, ties) from the seeded RNG / deriveSeed, never Math.random.
Tests are named by checklist ID from docs/spec/12-rules-test-checklist.md (AI-001..015, COOP-001..002, SCN-*).
Run long commands in the FOREGROUND. Never npm install or git commit; never edit STATUS.md or package.json unless told.
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

// ---------------- Design ----------------
phase('Design')
const design = await agent(`${COMMON}
You are the architect for M4b, the official AI card system (solo and co-op). FIRST read the Campaign Handbook section 3 (book p8-17) in full, and its AI scenarios. Rewrite docs/spec/18-ai-system.md sections 1-6 in our own words so they match CH exactly (cite CH p<n>), and update every AI ruling in docs/needs-rules-check.md: status Confirmed or Corrected with the CH page, and remove the Fan-source labels CH now settles. Update the AI- checklist lines in docs/spec/12-rules-test-checklist.md where CH changes them (add new AI-0xx IDs for rules CH adds). If CH contains real AI card matrices or examples for any starter unit, use them. Then read docs/spec/18-ai-system.md, 17-scenarios.md section 4, 00-architecture.md, 20-data-schema.md (AiCardDef and scenario defs), the AI-/COOP-/SCN- checklist lines, the AI rulings in docs/needs-rules-check.md, src/engine/{types,registry,turnflow,scenario,setup}.ts (skim exports), src/ai/{types,decider}.ts, and the free PDFs ai_response_flowcharts.pdf and ai_handbook_v1.0.pdf (mechanics only).
1. Append a section "## 8. Implementation (M4b)" to docs/spec/18-ai-system.md: module layout, the seat model (an AI-controlled side and a player team of 1-2 human seats), how the engine raises AI turns (number-token readying, AI never passes), how co-op team readying works (COOP-001), object targets (the Red Rocket, the Missile sled: Health, armor, shootable/meleeable, not an engagement), objective switches and phases as scenario data, and the event log shape for AI decisions (AI-015). Fold in anything the flowcharts PDF adds to the response procedures, cited "AIRF".
2. Freeze interfaces with exact exports and TODO bodies: src/ai/official/types.ts (AiSettings {objective, subject}, ResolvedCell, TargetRanking, AiDecisionLog), src/ai/official/decider.ts (createOfficialAiDecider(opts): Decider), stubs src/ai/official/{matrix,targeting,responses,objectives}.ts. List the engine hooks the decider needs (new decision kinds, query helpers, events) in your issues as precise TODOs for the engine agent.
3. Data: data/1e/ai/starter.json with one AiCardDef per starter unit (Super Mutant, Brute, Aviator, Mutant Hound, Settler, Enslaved Tech, Sole Survivor, Dogmeat, Aspirant Goddard, Deathclaw). Use any real values that the free PDFs (AI handbook examples, errata AI card fixes, Red Rocket sheet) actually give, cited; every other value is a placeholder matrix marked source "placeholder" with a RULING. npm run validate:data must pass.
Run npm run typecheck. ${KEEP}`, { label: 'design', phase: 'Design', schema: RESULT, effort: 'high' })
log(`design: ${design ? design.summary : 'FAILED'}`)
if (!design || !design.ok) return { stage: 'design', design }
const HOOKS = (design.issues || []).join('\n- ')

// ---------------- Build, wave 1: engine + data in parallel with nothing else touching engine ----------------
phase('Build')
const engine = await agent(`${COMMON}
You own ONLY: src/engine/** except the frozen contracts (edit those only if unavoidable, per the rule), plus new engine test files. Implement the engine side of M4b from docs/spec/18-ai-system.md sections 4, 6 and 8:
- AI side turn flow: number-token readying (draw one token per AI turn, Ready that model, Use all Ready AI models in ascending number order, AI never passes; no more AI turns once all are Used) (AI-001).
- Co-op team readying: the player team readies one model per team turn, then each player uses all or none of their Ready models (COOP-001); co-op reaction triggers (COOP-002).
- Object/point targets (SHOT-003): scenario objects with Health, armor, immunities, shootable and meleeable in contact, never an engagement; push actions where a scenario defines them.
- Whatever query helpers and decision kinds the architect listed:
- ${HOOKS}
Tests by checklist ID. npm run typecheck && npm test && npm run sim -- --games 20 must pass. ${KEEP}`, { label: 'engine', phase: 'Build', schema: RESULT, model: 'sonnet' })
log(`engine: ${engine ? engine.summary : 'FAILED'}`)
if (!engine || !engine.ok) return { stage: 'engine', design, engine }

// ---------------- Build, wave 2: decider and client (disjoint) ----------------
const [decider, client] = await parallel([
  () => agent(`${COMMON}
You own ONLY: src/ai/official/** and its tests. Implement the official AI procedure from docs/spec/18-ai-system.md sections 1-4 and 8 against the frozen src/ai/official/types.ts: settings and objective switches, column selection, blue-die row (use the special-die face weights from data/1e/dice.json), cell reading with reckless/stayEngaged, responses A M O F D S, Careful vs Reckless, target priority factors (Nearest, Vulnerable, Leader, Importance, Prepared, Most damaged, Highest max Health, class-first lists), weapon choice (Improvised only if nothing better), reactions, seeded tie-breaks with a logged tie, and an AiDecisionLog event per choice. Use engine query helpers (src/engine/query.ts) for odds, range and cover; never re-derive rules. Tests AI-001..015. npm run typecheck && npm test must pass. ${KEEP}`, { label: 'decider', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/client/** (not contract.ts unless the engine changed it) and e2e tests. Add the solo/co-op mode to the start screen: an "Opponent" choice "Wasteland AI (official cards)" that uses createOfficialAiDecider from src/ai/official/decider.ts for the AI side (run it in the existing worker if practical, else main thread behind the watchdog), a 1 or 2 player team toggle (2 = hot-seat co-op), and a scenario list filtered to AI/co-op scenarios when that opponent is picked. Show the AI's choice in the feed in our own words (column, die row, response, target), from the AiDecisionLog event. Test hook ?seats=human,official works. npm run typecheck && npm test && npm run build must pass. ${KEEP}`, { label: 'client', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])
log(`decider: ${decider ? decider.summary : 'FAILED'}; client: ${client ? client.summary : 'FAILED'}`)

// ---------------- Build, wave 3: AI scenarios ----------------
const scenarios = await agent(`${COMMON}
You own ONLY: data/1e/scenarios/** (AI and co-op entries), scenario hook code under src/engine/scenario*.ts or a new src/engine/scenarios/ folder, and their tests. Make the free-source AI and co-op scenarios playable end to end from docs/spec/17-scenarios.md section 4, re-entering numbers from the Campaign Handbook AI scenarios (section 5.6) where present, then ${SRC}/red_rocket_ai_scenario.pdf, ai_handbook_v1.0.pdf and coop_handbook_v1.0.pdf: AI-RR first, then AI-MISSILE, AI-BREAKIN, AI-TECH, COOP-SEWER, COOP-CAGE, COOP-MUNITIONS. Each gets deployment, objects, AI settings/switches/phases as data, round limit and victory with caps. Add a sim flag so npm run sim -- --official --games 20 runs every AI scenario with the official decider on the AI side and random/normal bots on the player side, with 0 errors and every game reaching a result. Scenarios you cannot finish: list them in issues. ${KEEP}`, { label: 'scenarios', phase: 'Build', schema: RESULT, model: 'sonnet' })
log(`scenarios: ${scenarios ? scenarios.summary : 'FAILED'}`)

// ---------------- Verify ----------------
phase('Verify')
const reviews = await parallel([
  () => agent(`${COMMON}
Adversarial rules-fidelity review; you never edit files. Compare src/ai/official/**, the AI turn flow and co-op readying in src/engine/**, and the AI scenario data against docs/spec/18-ai-system.md, 17-scenarios.md section 4, the AI rulings, the Campaign Handbook section 3 and AI scenarios (primary), and the free PDFs (ai_handbook, coop_handbook, ai_response_flowcharts, red_rocket, errata). Hunt for: behaviour that is invented rather than sourced (owner rule: official only), wrong response procedures, wrong target-priority semantics, Careful/Reckless/stayEngaged errors, scenario numbers that differ from the PDFs, any copied source prose. Report only concrete, verifiable findings with an owner. 300 tokens or fewer.`, { label: 'verify:rules', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
  () => agent(`${COMMON}
Adversarial legality, determinism and play review; you never edit files. Run npm run typecheck, npm test, npm run sim -- --official --games 30 --seed v1 and the same seed twice (results must match). Check: the official decider only reads view(state, seat); it never returns an illegal action or stalls an open decision; every AI decision emits the log event; no Math.random; co-op 2-seat games and the client mode path (?seats=human,official) reach game over; the AI actually pursues its scenario objective (e.g. reaches and damages the Red Rocket). Report only concrete findings with an owner. 300 tokens or fewer.`, { label: 'verify:play', phase: 'Verify', schema: FINDINGS, effort: 'high' }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'low')
log(`verify: ${findings.length} medium/high findings`)

// ---------------- Fix ----------------
phase('Fix')
const OWNS = {
  engine: 'src/engine/** (frozen-contract rule applies) and engine tests',
  decider: 'src/ai/official/** and its tests',
  client: 'src/client/** and e2e tests',
  scenarios: 'data/1e/scenarios/**, scenario hook code and tests',
  data: 'data/1e/ai/** and docs/needs-rules-check.md',
}
const byOwner = {}
for (const f of findings) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const owners = Object.keys(byOwner)
// engine first (others may depend on it), then the rest in parallel on disjoint files
const fixes = []
if (byOwner.engine) {
  fixes.push(await agent(`${COMMON}
You own ONLY: ${OWNS.engine}. Fix these review findings:
${JSON.stringify(byOwner.engine)}
npm run typecheck && npm test must pass. ${KEEP}`, { label: 'fix:engine', phase: 'Fix', schema: RESULT, model: 'sonnet' }))
}
const rest = owners.filter(o => o !== 'engine')
fixes.push(...await parallel(rest.map(o => () => agent(`${COMMON}
You own ONLY: ${OWNS[o]}. Fix these review findings:
${JSON.stringify(byOwner[o])}
npm run typecheck && npm test must pass. ${KEEP}`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT, model: 'sonnet' }))))

const final = await agent(`${COMMON}
Final gate; you may fix only trivial breakages in files the M4b stage touched. Run npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --official --games 20 and npm run sim -- --games 20. Then take a Playwright screenshot of a ?seats=human,official game on AI-RR a few AI activations in, saved as screenshots/m4b-official-ai.png. Report pass/fail per command in summary. ${KEEP}`, { label: 'final-gate', phase: 'Fix', schema: RESULT, model: 'sonnet' })

return {
  design: design.summary, engine: engine.summary,
  decider: decider && decider.summary, client: client && client.summary, scenarios: scenarios && scenarios.summary,
  findings: findings.map(f => `${f.owner}: ${f.problem}`),
  fixes: fixes.filter(Boolean).map(f => f.summary),
  final: final && final.summary,
  issues: [design, engine, decider, client, scenarios, final].filter(Boolean).flatMap(r => r.issues),
}
