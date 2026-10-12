export const meta = {
  name: 'm2-engine',
  description: 'M2: freeze rules-module interfaces, build turn/attack/damage/items modules in parallel, integrate with a bot-vs-bot sim',
  phases: [
    { title: 'Foundations', detail: 'additive contract, dispatch, dice, createGame, stubs' },
    { title: 'Rules', detail: 'four Sonnet agents, disjoint modules and tests' },
    { title: 'Integrate', detail: 'wire, sim bot vs bot, fix to green' },
  ],
}

const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root = absolute project root')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: mechanics 1:1; all prose (labels, log text, comments) in our own words.
Run long commands in the FOREGROUND. Never run npm install or git commit; never edit STATUS.md or package.json unless told.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Engine rules (docs/spec/00-architecture.md): pure TS, no DOM, no Math.random; only roll() advances state.rng; exactly one PendingDecision; legalActions never empty; bad input returns a Rejection, never throws; every edition number (dice faces, ruler inches, rule constants, costs) comes from the EditionBundle (src/data), never a literal.
Data: src/data/types.ts and data/1e/** are FROZEN; read them, do not edit. Rulings: append "- RULING: <rule> | <what we did> | <why> | <status> | <source>" lines to docs/needs-rules-check.md ONLY if you own it; otherwise return them in issues.
Tests: Vitest, file names given below, each it() named by checklist ID from docs/spec/12-rules-test-checklist.md (e.g. it('SHOT-003 ...')). About 10-15 focused tests per agent; cover the core of each ID group, not every ID.`

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

phase('Foundations')
const found = await agent(`${COMMON}
You are the M2 foundations architect. Read docs/spec/00-architecture.md, 10-overview.md, 11-turn-and-actions.md, 13-dice-and-tests.md, 20-data-schema.md (skim), src/engine/*.ts and src/data/types.ts.
Build the frozen interfaces the four rules agents will code against, so that their work only fills function bodies in disjoint files:
1. ADDITIVE edits to src/engine/types.ts (never rename/remove): game rules state (round, seats with readiness/advantage, per-model ready/used token, damage, radiation, injuries, conditions, prepared state, carried items/ammo/luck, per-activation action count and AP), RejectionCode additions, ConditionId/DamageType narrowed as spec allows. Log each addition in docs/spec/00-architecture.md section 10 "M2" and expand section 1 with the module map below.
2. src/engine/registry.ts: the action protocol. Each rules module exports a ModuleDef { kinds: string[] (pending kinds it owns); options(state, bundle, modelId) -> DecisionOption[] (its main actions for the active model); resolve(state, bundle, action) -> {state} | Rejection }. apply(state, bundle, action) in src/engine/apply.ts checks decisionId/seat/legality, then dispatches by state.pending.kind prefix to the owning module. Also src/engine/query.ts with SIGNATURES (bodies may throw TODO) for every engine-owned display number: hitOdds, rangeBand, coverFor, expectedDamage, killOdds.
3. src/engine/dice.ts: COMPLETE. Skill test (d20 vs attribute+skill, speciality, crits/complication per spec 13) and effect dice pools (faces from bundle dice.json), rerolls hook, all through roll(). Tests tests/engine/dice.test.ts (DICE-*, SKILL-*).
4. src/engine/setup.ts: createGame(bundle, {seed, seats, scenarioId, forces?}) building a real game from data/1e/scenarios (default a starter box scenario with Survivors vs Super Mutants, table 36x36, simple terrain), keeping createDemoGame working. src/engine/edition.ts helpers: ruler inches by colour, rule constants.
5. Stub files with the exact exported names and signatures, bodies TODO, so typecheck passes: src/engine/turnflow.ts (owner T), movement.ts (T), attack.ts (A), melee.ts (A), damage.ts (D), conditions.ts (D), items.ts (I), scenario.ts (I), forces.ts (I). Write one comment line at the top of each naming which checklist ID groups it must satisfy (T: TURN ACT AP MOVE PREP CHG-movement; A: SHOT RANGE COVER THR WPN CRIT LUCK CHG BC CC; D: DMG ARM PA RAD COND; I: ITEM EXP SRCH SCN FORCE).
6. A tests/engine/helpers.ts with fixtures (loadBundle from disk via node:fs like tools/validate-data.ts, a two-model duel state, a deterministic decider runner).
Run npm run typecheck and npm test until green. You own ONLY the files named above (types.ts additively, registry.ts, apply.ts, query.ts, dice.ts, setup.ts, edition.ts, the stubs, tests/engine/dice.test.ts, tests/engine/helpers.ts, docs/spec/00-architecture.md, src/engine/index.ts). In issues, give the interface each owner (T, A, D, I) must implement in one line each. ${KEEP}`,
  { label: 'foundations', phase: 'Foundations', schema: RESULT, effort: 'high' })

if (!found || !found.ok) return { found, stopped: 'foundations not ok' }

phase('Rules')
const IFACE = JSON.stringify(found.issues)
const OWNERS = [
  { key: 'T', label: 'rules:T turn+move', specs: '11 sections 1, 2, 3, 5, 6; 14 (movement, terrain parts)', files: 'src/engine/turnflow.ts, src/engine/movement.ts, tests/engine/turnflow.test.ts, tests/engine/movement.test.ts',
    task: 'Round structure, readiness/advantage, activation (pick model, 2 actions, quick actions/AP), end of round; Move, Back off, Climb/Jump/Fall, Get Up, Prepare and reactions (interrupts as pending decisions owned by turnflow). Turnflow is the main loop: it raises "turn.*" decisions and calls every module options() to build the action menu.' },
  { key: 'A', label: 'rules:A attacks', specs: '11 sections 3 (Shoot detail), 4, 7; 13; 14 (range, LOS, cover)', files: 'src/engine/attack.ts, src/engine/melee.ts, tests/engine/attack.test.ts, tests/engine/melee.test.ts',
    task: 'Shoot (target, weapon, range band from rulers, LOS via los.ts, cover, skill test, effect dice, criticals, luck rerolls as pending decisions), Throw, advanced weapons (blast etc.), Charge, Battle Cry, close combat. Call damage.ts applyHit() for wounds. query.ts belongs to the integrator, so expose pure helpers for hit odds, range band and cover from your files.' },
  { key: 'D', label: 'rules:D damage', specs: '15; 11 conditions parts', files: 'src/engine/damage.ts, src/engine/conditions.ts, tests/engine/damage.test.ts, tests/engine/conditions.test.ts',
    task: 'applyHit (damage vs armor by damage type, power armor, radiation, injuries, wounds, down/dead per spec 15), conditions (apply, tick, remove), heal effects used by items. Pure helpers with exact numbers for expectedDamage/killOdds.' },
  { key: 'I', label: 'rules:I items+scn', specs: '11 section 8; 16; 17', files: 'src/engine/items.ts, src/engine/scenario.ts, src/engine/forces.ts, tests/engine/items.test.ts, tests/engine/scenario.test.ts',
    task: 'Use Expertise, Search and scavenging, item cards (food, chems with diminishing/addiction, gear, armor swaps, mods) via the data Effect ops, scenario objectives/scoring/victory and end-of-game, force building validation (caps, leaders, heroic).' },
]
const rules = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are rules owner ${o.key}. Interfaces are FROZEN by the foundations agent: src/engine/types.ts, registry.ts, apply.ts, dice.ts, setup.ts, edition.ts, query.ts. Do not edit them; report needed changes in issues.
Foundations notes: ${IFACE}
Spec to read (only these): docs/spec/${o.specs.replace(/; /g, ' and docs/spec/')} and the matching ID groups in docs/spec/12-rules-test-checklist.md, plus docs/needs-rules-check.md for existing rulings.
Implement: ${o.task}
Other owners build their modules at the same time; call their exported functions by the frozen signatures (they may still throw TODO, so isolate your tests with tests/engine/helpers.ts fixtures and stub calls where needed).
Finish with npm run typecheck and npm test green for your files (ignore failures in other owners' files and list them).
You own ONLY: ${o.files}. ${KEEP}`, { label: o.label, phase: 'Rules', schema: RESULT, model: 'sonnet' })))

phase('Integrate')
const integ = await agent(`${COMMON}
You are the M2 integrator. Four rules agents just filled src/engine/{turnflow,movement,attack,melee,damage,conditions,items,scenario,forces}.ts. Their reports:
${JSON.stringify(rules.map(r => r && { summary: r.summary, issues: r.issues }))}
1. Make it one engine: resolve cross-module TODOs and mismatches, implement query.ts bodies (hitOdds, rangeBand, coverFor, expectedDamage, killOdds) from the owners' pure helpers, finish view.ts only if hidden info now exists.
2. Rewrite tools/sim.ts: createGame + apply loop with random deciders for both seats until the scenario ends; flags --games N --seed s; checks invariants from docs/spec/60-testing.md (legalActions never empty, every legal action accepted, determinism replay from seed + log, step time); prints JSON {games, finished, avgRounds, winners, decisions, errors}. Run npm run sim -- --games 50 and fix every error.
3. Append all RULING lines from the owners' issues to docs/needs-rules-check.md.
4. Run npm run typecheck, npm test, npm run validate:data, npm run build; all green.
You own every file under src/engine/, tests/engine/, tools/sim.ts and docs/needs-rules-check.md. Do not edit src/data/ or data/. Put the sim JSON line in summary. ${KEEP}`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT, effort: 'high' })

return { found, rules, integ }
