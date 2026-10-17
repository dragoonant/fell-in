export const meta = {
  name: 'm6-campaign',
  description: 'M6 campaign and settlement mode from the Campaign Handbook: spec rewrite, then data + engine + client, then an adversarial verify loop',
  phases: [
    { title: 'Design', detail: 'spec 19 rewritten from CH p4-6 and p18-26, checklist IDs, schema additions, card-source inventory' },
    { title: 'Build', detail: 'campaign data, engine campaign layer, settlement client, in parallel on disjoint files' },
    { title: 'Verify', detail: 'rules-dense: two verifiers against the spec, findings routed back to the owner agent' },
    { title: 'Check', detail: 'typecheck, tests, build, e2e, screenshots, STATUS section' },
  ],
}

// Usage: Workflow({ scriptPath, args: { root, sources, stage } })
//   root     absolute path of this repo checkout
//   sources  absolute path of the gitignored PDF folder (the main checkout's docs/sources)
//   stage    design | build | check   (verify runs inside build)
const ROOT = args && args.root
const SOURCES = args && args.sources
const STAGE = args && args.stage
if (!ROOT || !SOURCES || !STAGE) throw new Error('pass args.root, args.sources and args.stage')

const COMMON = `Project root: ${ROOT} (use absolute paths everywhere; the cwd resets). Orient from STATUS.md only, then HANDOFF.md section "Current state (2026-10-17)", then only the files named below.
SOURCES: the official PDFs are in ${SOURCES} (gitignored; never copy, quote at length or commit them). The Campaign Handbook is foww-campaign-handbook-digital-final_compress.pdf; book page = PDF page - 2. Extract text with PyMuPDF (python -c "import pymupdf" with the system Python; render a page to PNG and Read it when the text comes out garbled or when a table or card is a picture). Other PDFs there: perk_cards_w9.pdf, reference_cards_w9.pdf (large), chem_cards_w5.pdf, heroic_cards_v4.pdf, leader_cards_w6.pdf, errata_faq_v10.pdf (overrides everything), 2p_cards.pdf, box_scenarios_1-5.pdf, machine_frequency_campaign.pdf.
IP rule: mechanics 1:1; names may match the cards; ALL prose in our own words, written from a one-line mechanical summary, never sentence-by-sentence paraphrase. Every data value carries a source (file, page) per docs/spec/20-data-schema.md.
Rules ambiguities never block: add "RULING: <rule> | <what we did> | <why> | <status>" lines to docs/needs-rules-check.md (Confirmed, Corrected, Unsourced, Fan-source).
FROZEN CONTRACTS: src/engine/{types,decider,view,rng,pending}.ts; an additive change needs a matching edit to docs/spec/00-architecture.md and a note in issues. Deciders only see view(state, seat); exactly one PendingDecision; legalActions never empty; the engine owns every number the UI shows.
Run long commands in the FOREGROUND (a dev server may go in the background). Never npm install, never git commit, never edit package.json or STATUS.md unless told to. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

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
    findings: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string' }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object only; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

// Frozen M6 interface (both the engine and the client agent code to it; the design agent writes it into spec 19 s7):
const CONTRACT = `src/campaign/ (NEW, outside the frozen engine):
  types.ts: Campaign { id, edition, name, createdAt, players: CampaignPlayer[], round: number, log: CampaignLogEntry[], current?: { scenarioId, seats } }
            CampaignPlayer { seat, faction, caps, pool: PoolCard[], structures: StructureInst[], roster: RosterModel[], perks, quests: QuestProgress[], land: number }
            RosterModel { id, unitId, name?, injuries: Injury[], xp, perks: string[], equipped: string[] }
  reducer.ts: pure (campaign, CampaignAction) => Campaign for every between-battle step; every random draw takes an rng seed from the campaign (src/engine/rng.ts) so it is deterministic and replayable.
  sequence.ts: the CH between-battle sequence as a list of named steps with "what the player decides" per step (the settlement screen renders it generically).
  battle.ts: toBattle(campaign, scenarioId) -> the setup bundle the existing createGame takes (forces from rosters and pool); fromBattle(campaign, finalState) -> campaign with caps, injuries, xp, items and quest progress applied.
  store: localStorage key "fell-in.campaign.v1", one campaign at a time (new campaign replaces after a confirm).
Data (declarative JSON, data/1e/campaign/): structures.json, perks.json, boosts.json, events.json, quests.json, explore.json, injuries.json, caps-awards.json; each record { id, name, cost?, effect: { "code": "<hook>" } | declarative fields, source }.
Client: a Settlement screen (src/client/ui/settlement/) reached from the start screen ("Campaign": new or continue), walking the sequence step by step, then "To battle" which launches the normal game with the campaign's forces versus the chosen opponent (bot, hot-seat or the Wasteland AI), and returns to the settlement on game over.`

const phaseOf = { design: 'Design', build: 'Build', check: 'Check' }
if (!phaseOf[STAGE]) throw new Error('unknown stage ' + STAGE)
phase(phaseOf[STAGE])

if (STAGE === 'design') {
  const r = await agent(`${COMMON}
You own ONLY: docs/spec/19-campaign-settlement.md (rewrite), docs/spec/12-rules-test-checklist.md (append a campaign section), docs/spec/20-data-schema.md (append section "Campaign records"), docs/spec/00-architecture.md (append section "Campaign layer"), docs/spec/sources/CH-CAMPAIGN.md (new: page map and card-source inventory), docs/needs-rules-check.md (append RULINGs).
Read docs/spec/19 as it stands (its "Gaps" list is what you close), docs/spec/17-scenarios.md section 5, docs/spec/18-ai-system.md section 1 (the CH citation style), docs/spec/20 (schema style), docs/spec/12 (ID style), docs/needs-rules-check.md (the two campaign rulings), src/engine/setup.ts createGame (what a battle needs), and errata_faq_v10.pdf's campaign and settlement answers.
Extract the Campaign Handbook's campaign rules (events, perks, boosts, quests; the between-battle sequence; caps, land, structures with costs and effects, storage, injuries and casualties, experience and perk purchase, explore, settlement scenarios, anything else the book's contents page lists) and rewrite spec 19 in our own words: numbered sections, every rule with (CH p<n>) and errata overrides, a worked example of one full between-battle round, and a final section 7 that records this frozen interface verbatim: ${CONTRACT}
Add checklist IDs CAMP-001.., SETT-001.., PERK-001.., BOOST-001.., QUEST-001.., EVENT-001.., EXPL-001.. (one testable sentence each, 40-80 total). In CH-CAMPAIGN.md list, for each card type the campaign needs (perk, boost, event, quest, explore, structure), which PDF and pages hold the actual cards (open perk_cards_w9.pdf, reference_cards_w9.pdf, chem_cards_w5.pdf, 2p_cards.pdf with PyMuPDF and look at a few rendered pages), how many cards, and which belong to the Two Player Starter Set; mark what has no source as GAP with a RULING. Replace the stale "no free copy" wording. ${KEEP}`,
    { label: 'design:spec19', phase: 'Design', schema: RESULT, effort: 'high' })
  return { design: r }
}

if (STAGE === 'build') {
  const build = await parallel([
    () => agent(`${COMMON}
You own ONLY: data/1e/campaign/** (new), data/1e/perks/ (move its records into data/1e/campaign/perks.json and delete the folder if spec 19 says so), src/data/campaign*.ts (loader + validator additions), src/data/types.ts (ONLY the additive ScenarioForce.perks and ScenarioDef.campaign fields spec 20 names), tools/validate-data.ts (campaign checks only), tests/data/campaign-*.test.ts.
Read docs/spec/19 (all), docs/spec/20 section "Campaign records", docs/spec/sources/CH-CAMPAIGN.md (where each card lives), src/data/* (loader pattern), one existing data file per kind for style.
Enter every record the spec and the inventory name, starter set first: structures (cost, prerequisites, effect), perks (cost, who may buy, effect; starter-set perks and the errata-named ones), boosts, events, quests (parts), explore cards, injuries table, caps awards per scenario result. Effects are declarative where a field fits (caps, draws, rerolls, stat mods) and {"code": "<hook>"} otherwise; name each hook in a short list at the top of the file. Every record carries source {file, page}. Prose fields are written from a one-line mechanical summary in our own words. Validator: ids unique, sources present, hooks named, costs numbers. npm run validate:data and npm test must pass. ${KEEP}`,
      { label: 'build:data', phase: 'Build', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
You own ONLY: src/campaign/** (new), tests/campaign/**, and additive hooks in src/engine/setup.ts (only to accept a campaign force bundle) with a note in issues.
Read docs/spec/19 (all, section 7 is the frozen interface), docs/spec/12 campaign IDs, docs/spec/00-architecture.md "Campaign layer", src/engine/{setup,rng,types}.ts, src/engine/scenarios/spec.ts (forces format), data/1e/scenarios/scenarios.json (one scenario's forces).
Implement the frozen interface: types, the pure reducer for every between-battle step in the CH sequence (caps income and spend, land purchase, structures build and effects, pool storage rules, injuries and recovery, experience and perk purchase, quests progress, explore and event draws with seeded rng), sequence.ts, battle.ts (toBattle/fromBattle), the localStorage store with a version field and a migration stub. Data comes through src/data loaders by id; code hooks live in src/campaign/hooks.ts keyed by the hook names the data agent lists (stub any hook you cannot find with a logged RULING). Tests named by checklist ID (CAMP-/SETT-/PERK-/...): at least one per ID in the spec, plus a full-round replay test with a fixed seed. npm run typecheck && npm test must pass. ${KEEP}`,
      { label: 'build:engine', phase: 'Build', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
You own ONLY: src/client/ui/settlement/** (new), src/client/ui/StartScreen.tsx (a "Campaign" entry only), src/client/store/launch.ts and src/client/params.ts (campaign launch + ?campaign=1 hook only), src/client/ui/GameOver.tsx (a "Back to settlement" button only), tests/client/settlement-*.test.ts, tests/e2e/campaign.spec.ts.
Read docs/spec/19 section 7 (frozen interface; code against it, the engine agent is implementing it right now: import from src/campaign/* by the names in the contract and stub-tolerate a missing export at runtime with a clear message), docs/spec/50-client.md, src/client/ui/StartScreen.tsx and GameOver.tsx, src/client/store/*.
Build the Settlement screen: campaign header (name, round, caps, land), the between-battle sequence as steps with the decisions each step offers (buy structures, store or sell pool cards, heal injuries, buy perks, choose quests, resolve explore/event draws, pick the next scenario and opponent), a roster panel with injuries and perks, a pool panel, and "To battle" which launches the normal game; on game over "Back to settlement" applies fromBattle. Plain words everywhere, our own copy; data-testids campaign-screen, campaign-new, campaign-continue, settlement-step, to-battle. ?test=1 exposes the campaign on window.__campaign. E2E: new campaign -> one step -> to battle -> game screen. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
      { label: 'build:client', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  ])
  log(`build: ${build.map((r) => (r ? r.summary : 'FAILED')).join(' | ')}`)

  phase('Verify')
  const lenses = [
    ['rules', 'Compare src/campaign/** and data/1e/campaign/** against docs/spec/19 rule by rule and against errata_faq_v10.pdf: wrong numbers, missing steps, order errors, effects that do not match the card, prose copied from the book.'],
    ['contract', 'Check the frozen contracts (src/engine/{types,decider,view,rng,pending}.ts unchanged except documented additive edits), hidden information (the client never reads campaign state it should not), determinism (seeded draws, replay test), the localStorage schema, and that the settlement screen only shows numbers the campaign layer computed.'],
  ]
  const findings = (await parallel(lenses.map(([lens, what]) => () => agent(`${COMMON}
VERIFY ONLY (never edit): ${what} Read the spec and the code; run npm test and read failures. Route each finding to its owner: "data" (data/1e/campaign, src/data), "engine" (src/campaign, tests/campaign), "client" (src/client/ui/settlement, launch, GameOver). Return ok=true only if nothing material is wrong. 10 findings at most, the most serious first, each with the exact file and a concrete fix.`,
    { label: `verify:${lens}`, phase: 'Verify', schema: FINDINGS, effort: 'high' })))).filter(Boolean).flatMap((f) => f.findings)
  log(`${findings.length} findings`)
  const byOwner = { data: [], engine: [], client: [] }
  for (const f of findings) (byOwner[f.owner] || byOwner.engine).push(f)
  const owns = {
    data: 'data/1e/campaign/**, src/data/campaign*.ts, tools/validate-data.ts, tests/data/campaign-*.test.ts',
    engine: 'src/campaign/**, tests/campaign/**',
    client: 'src/client/ui/settlement/**, src/client/ui/StartScreen.tsx, src/client/store/launch.ts, src/client/params.ts, src/client/ui/GameOver.tsx, tests/client/settlement-*.test.ts, tests/e2e/campaign.spec.ts',
  }
  const fixes = await parallel(Object.keys(byOwner).filter((o) => byOwner[o].length).map((o) => () => agent(`${COMMON}
You own ONLY: ${owns[o]}. Fix these verified findings (read docs/spec/19 for the rule each one cites), nothing else:
${byOwner[o].map((f, i) => `${i + 1}. ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
Add a RULING line when a finding turns on an ambiguity. npm run typecheck && npm test must pass. ${KEEP}`,
    { label: `fix:${o}`, phase: 'Verify', schema: RESULT, model: 'sonnet' })))
  return { build, findings, fixes }
}

if (STAGE === 'check') {
  const r = await agent(`${COMMON}
You own ONLY: screenshots/m6-*.png, STATUS.md (a new "## Campaign and settlement (M6)" section only, 8-14 lines, facts only), docs/spec/19 (only to mark what shipped vs what is stubbed, one short section), and trivial fixes anywhere they block the checks below.
Run npm run typecheck, npm test, npm run validate:data, npm run build and npm run e2e in the foreground; report failures verbatim (first 10 lines each). Start the dev server in the background only if http://localhost:5191/fell-in/ is down (npx vite --port 5191). With Playwright at 1280x800 capture the start screen's Campaign entry, the settlement screen on a new campaign (each step once), the roster and pool panels, and the game screen launched from "To battle". Read every screenshot and list in issues anything wrong. Write the STATUS section from what you verified. ${KEEP}`,
    { label: 'check:all', phase: 'Check', schema: RESULT, model: 'sonnet' })
  return { check: r }
}
