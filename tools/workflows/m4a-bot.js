export const meta = {
  name: 'm4a-bot',
  description: 'M4a: versus bot AI (design, build, bench to >=95% vs random, adversarial verify, fix)',
  phases: [
    { title: 'Design', detail: 'AI spec + frozen src/ai interfaces + bench harness' },
    { title: 'Build', detail: 'evaluator, planner, worker/client wiring' },
    { title: 'Bench', detail: 'tune loop until normal beats random >= 95%' },
    { title: 'Verify', detail: 'adversarial legality / leak / strength review, then fix' },
  ],
}

const ROOT = args && args.root
const WHI = args && args.whi
if (!ROOT || !WHI) throw new Error('pass args.root and args.whi')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: all prose and persona text in our own words.
Frozen: src/engine/** (except where told), src/data/**, data/**, src/client/{contract.ts,presentation/}. Deciders only ever see view(state, seat) and legalActions; never the raw state, never state.rng (derive randomness with deriveSeed(seed, decisionId)).
Run long commands in the FOREGROUND. Never npm install or git commit; never edit STATUS.md; edit package.json only if told.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Reference (read-only, copy and adapt): ${WHI}/src/ai (tiers, threat, assassin, prob, plan, moves, deploy, worker, decider) and ${WHI}/tools/ai-bench.ts; strip Warmachine rules (focus, fury, damage grids). Knowledge base: docs/KNOWLEDGE-BASE.md 1.4, 2.1 AI row.
Engine numbers come from src/engine/query.ts (hitOdds, expectedDamage, killOdds, rangeBand, coverFor) and dice.ts skillOdds; never re-derive rules in src/ai.
Per-decision AI time budget from process.env.AI_MS / import.meta.env.VITE_AI_MS (default 150 ms; CI slow).`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const BENCH = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, winRate: { type: 'number' }, games: { type: 'number' },
    msPerDecision: { type: 'number' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'winRate', 'games', 'summary', 'files', 'issues'],
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
You are the AI architect for the versus bot (our own AI, not the official card AI). Read docs/spec/00-architecture.md, 10-overview.md, 11-turn-and-actions.md (skim), src/engine/{types,registry,apply,query,pending,decider}.ts, the decision kinds the engine raises (grep raiseDecision / kind: in src/engine), src/client/bot/{botDriver,randomBot}.ts, and the WHI AI.
1. Write docs/spec/30-ai-bot.md: tiers (random, easy, normal), the per-decision-kind policy (activation choice, action menu, move destination search, target/weapon choice, charge, close combat, reactions/prepare, luck/rerolls, items, objectives), scoring (expected damage and kill odds from query, threat map, cover/LOS, objective value, survival), time budget, determinism, and the benchmark (normal beats random >= 95% over 100 games across box-1..5 with alternating seats; easy beats random >= 75%).
2. Freeze interfaces: src/ai/types.ts (AiContext, Tier, Policy per kind, Score), src/ai/decider.ts (createAiDecider(tier, opts): Decider, dispatching by pending.kind to policy modules), stubs src/ai/{eval,threat,moves,policies}.ts with exact exports and TODO bodies, src/ai/random.ts (wrap the existing random bot logic), src/ai/worker.ts (Web Worker host: {view, pending, legal, tier} -> action).
3. tools/ai-bench.ts: --games N --seed s --a normal --b random --scenarios box-1,...; alternate seats; prints JSON {games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors}. Add "bench:ai": "tsx tools/ai-bench.ts" to package.json (you may edit package.json for that one line).
4. Typecheck + test green (stubs may make the bench score low; that is fine now).
You own ONLY: docs/spec/30-ai-bot.md, src/ai/, tools/ai-bench.ts, package.json (one line). In issues, one line per build owner (E eval+threat, M moves+policies, W worker+client wiring) naming the exports they implement. ${KEEP}`,
  { label: 'ai-design', phase: 'Design', schema: RESULT, effort: 'high' })
if (!design || !design.ok) return { design, stopped: 'design not ok' }

phase('Build')
const NOTES = JSON.stringify(design.issues)
const OWNERS = [
  { key: 'E', own: 'src/ai/eval.ts, src/ai/threat.ts, tests/ai/eval.test.ts', task: 'Position and action evaluation: expected damage, kill odds (from query), threat map per enemy (who can shoot or charge a point next activation, with LOS and range band), cover value, objective value per scenario (read scenario state), focus-fire / finish-off bonus, survival penalty. Pure and fast (memoize per decision).' },
  { key: 'M', own: 'src/ai/moves.ts, src/ai/policies.ts, src/ai/random.ts, tests/ai/policies.test.ts', task: 'Candidate generation and policies per decision kind: activation order (most valuable action first, keep reactions in mind), action menu, move destinations (sample reachable points via the engine move validation / dry-run, prefer cover and objectives, avoid threat), shoot/throw target + weapon, charge targets, close combat, reactions and prepare, luck rerolls, items/chems, end activation. Easy tier = greedy with noise; normal = best by score with a one-step lookahead on the opponent threat. Always return a member of legal; fall back to the first legal on any error.' },
  { key: 'W', own: 'src/ai/worker.ts, src/client/bot/ (botDriver, aiWorkerClient.ts, randomBot kept), src/client/ui/start/ (tier picker only), tests/ai/worker.test.ts', task: 'Run the bot in a Web Worker (src/ai/worker.ts + src/client/bot/aiWorkerClient.ts), botDriver uses the tier from the launch options (default normal), keeps the 5 s watchdog, falls back to the in-thread decider if Worker is unavailable (tests/node). Start screen gets an "Opponent" picker: Easy, Normal (default), Random (data-testid opponent-tier).' },
]
const build = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are AI build owner ${o.key}. Interfaces are FROZEN in src/ai/types.ts and src/ai/decider.ts and docs/spec/30-ai-bot.md; do not edit them, report needed changes in issues.
Architect notes: ${NOTES}
Build: ${o.task}
Write about 6 focused tests. Finish with npm run typecheck and npm test green for your files.
You own ONLY: ${o.own}. ${KEEP}`, { label: `ai:${o.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))

phase('Bench')
let bench = null
const history = []
for (let round = 1; round <= 3; round++) {
  bench = await agent(`${COMMON}
Bench and tune round ${round} of 3. Previous rounds: ${JSON.stringify(history)}
Build reports: ${JSON.stringify(build.map(b => b && b.summary))}
1. Run npm run typecheck and npm test; fix breakage in src/ai first.
2. Run npm run bench:ai -- --games 100 --seed r${round} --a normal --b random and --games 60 --a easy --b random.
3. If normal < 95% or easy < 75% or msPerDecision > 150: profile the losses (replay a few lost seeds, find the worst policy decisions: wandering, not shooting, suicidal charges, ignoring objectives, timeouts), fix src/ai, re-run. Never weaken the random bot and never touch the engine.
You own ONLY: src/ai/, tests/ai/, tools/ai-bench.ts. winRate = normal vs random. Put both rates and ms in summary. ${KEEP}`,
    { label: `bench:r${round}`, phase: 'Bench', schema: BENCH, effort: 'high' })
  history.push(bench && { winRate: bench.winRate, summary: bench.summary })
  if (bench && bench.ok && bench.winRate >= 0.95) break
}

phase('Verify')
const LENSES = [
  'LEGALITY and ROBUSTNESS: every action the bot returns is in legal for every decision kind the engine can raise (enumerate kinds from src/engine), no throw paths, time budget respected, deterministic from seed. Run a 50-game normal vs normal sim with invariants.',
  'HIDDEN INFO and CONTRACT: src/ai reads only view(state, seat), never state.rng or the raw state, never re-derives rules numbers query already provides; worker message shapes are serializable; client wiring honours the watchdog.',
  'STRENGTH and BEHAVIOUR: read the policies against docs/spec/30-ai-bot.md and play/inspect a few seeded games (tools/ai-bench.ts with a verbose flag or a short script): obvious blunders (walking into open fire, ignoring a kill shot, never scoring objectives, wasting AP, charging out of range).',
]
const verdicts = await parallel(LENSES.map((lens, i) => () => agent(`${COMMON}
You are an adversarial reviewer of the new AI in src/ai (and src/client/bot). NEVER edit files. Lens: ${lens}
Report only real, reproducible defects with a precise fix. Default to fewer, verified findings.`,
  { label: `verify:${i + 1}`, phase: 'Verify', schema: FINDINGS, effort: 'high' })))
const findings = verdicts.filter(Boolean).flatMap(v => v.findings).filter(f => f.severity !== 'low')
let fix = null
if (findings.length) {
  fix = await agent(`${COMMON}
Apply these verified AI findings (re-check each; skip and report any you can refute):
${JSON.stringify(findings)}
Then run npm run typecheck, npm test, npm run sim -- --games 20 and npm run bench:ai -- --games 100 --seed fix --a normal --b random. Report the final win rate in summary (must stay >= 95%).
You own ONLY: src/ai/, tests/ai/, src/client/bot/, tools/ai-bench.ts. ${KEEP}`,
    { label: 'fix', phase: 'Verify', schema: BENCH, model: 'sonnet' })
}
return { design, build, bench, history, findingsCount: findings.length, fix }
