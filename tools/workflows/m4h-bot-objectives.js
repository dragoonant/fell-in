export const meta = {
  name: 'm4h-bot-objectives',
  description: 'Versus bot: objective play for the box scenarios and the new decision kinds, benchmarked back to >= 95% over random with no losses, then verified',
  phases: [
    { title: 'Build', detail: 'objective-aware policies + new decision kinds, bench loop' },
    { title: 'Verify', detail: 'hidden-information and contract check, findings routed back' },
  ],
}

// Usage: Workflow({ scriptPath, args: { root } })
const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root')

const COMMON = `Project root: ${ROOT} (use absolute paths everywhere; the cwd resets). Orient from STATUS.md only (sections "AI (M4a)" and "M4g"), then docs/spec/30-ai-bot.md and the files named below.
FROZEN CONTRACTS: src/engine/{types,decider,view,rng,pending}.ts. The bot only ever sees view(state, seat) and engine.query.* numbers; it never computes a rules number itself and never reads hidden state. legalActions is never empty.
Run long commands in the FOREGROUND. Never npm install, never git commit, never edit package.json or STATUS.md. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
    winRate: { type: 'number' }, draws: { type: 'number' }, losses: { type: 'number' },
  },
  required: ['ok', 'summary', 'files', 'issues', 'winRate', 'draws', 'losses'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['where', 'problem', 'fix'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object only; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'
const OWN = 'src/ai/** except src/ai/official/**, tests/ai/bot-*.test.ts, tools/ai-bench.ts (reporting only), docs/spec/30-ai-bot.md (append a short section on objective play)'

phase('Build')
let result = null
for (let round = 0; round < 3; round++) {
  const prior = result ? `Previous round: winRate ${result.winRate}, draws ${result.draws}, losses ${result.losses}; issues: ${result.issues.join(' / ')}. ` : ''
  result = await agent(`${COMMON}
You own ONLY: ${OWN}.
${prior}Baseline measured 2026-10-17: "npm run bench:ai -- --games 30 --a normal --b random" gives winRate 0.80, 24 wins, 0 losses, 6 draws (box-1 4 of 8 drawn, box-2 2 of 8), 12 fallbacks (decision kinds the bot does not handle, falling back to random). Target: winRate >= 0.95 over box-1..4 with 0 losses and 0 fallbacks, at <= 40 ms per decision.
Do: (1) handle the new decision kinds battleCry.escape and damage.dying (and any other kind the bench's fallbacks counter reports; read src/ai/decider.ts dispatch and the kinds in src/engine/pending.ts) with sensible policies; (2) objective play: read each scenario's objectives from the view / objectiveStatus (src/engine/scenarios/status.ts) and raise the objective weight in eval so the bot claims suits, holds markers and chases goal-based wins when a kill advantage will not end the game; keep the versus play strong; (3) bench after each change with --games 30 and a second seed set, and report the final numbers in winRate / draws / losses. Tests named BOT-<n> for the new policies. npm run typecheck && npm test must pass. ${KEEP}`,
    { label: `build:bot-r${round + 1}`, phase: 'Build', schema: RESULT, model: 'sonnet' })
  if (!result) break
  log(`round ${round + 1}: winRate ${result.winRate}, draws ${result.draws}, losses ${result.losses}`)
  if (result.ok && result.winRate >= 0.95 && result.losses === 0) break
}

phase('Verify')
const verify = await agent(`${COMMON}
VERIFY ONLY (never edit). Check the bot work in ${OWN}: (a) hidden information: the bot reads only view(state, seat) and engine.query.*, never state fields a seat must not see, and computes no rules number of its own (grep for dice math, armour math or range tables inside src/ai); (b) contracts: frozen engine files unchanged; (c) determinism: same seed, same bench result twice; (d) run "npm run bench:ai -- --games 30 --a normal --b random" and "npm run bench:ai -- --games 30 --a easy --b random" yourself and compare with the agent's claim; (e) the policies do not special-case scenario ids (generic over objectives). At most 8 findings, most serious first, each with file and concrete fix; ok=true only if nothing material is wrong.`,
  { label: 'verify:bot', phase: 'Verify', schema: FINDINGS, effort: 'high' })
const findings = verify ? verify.findings : []
log(`${findings.length} findings`)
let fix = null
if (findings.length) {
  fix = await agent(`${COMMON}
You own ONLY: ${OWN}. Fix these verified findings, nothing else:
${findings.map((f, i) => `${i + 1}. ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
Re-run the bench (--games 30, normal vs random) and report winRate / draws / losses. npm run typecheck && npm test must pass. ${KEEP}`,
    { label: 'fix:bot', phase: 'Verify', schema: RESULT, model: 'sonnet' })
}
return { result, findings, fix }
