export const meta = {
  name: 'm4g-gaps',
  description: 'Close the M2/M4 rules gaps listed in STATUS.md (engine rules, official-AI gaps, placeholder AI cards, the drag e2e) with a verify pass',
  phases: [
    { title: 'Build', detail: 'engine rules, official AI gaps, AI card research, e2e drag fix: four owners on disjoint files' },
    { title: 'Verify', detail: 'rules verifier against the spec; findings routed back' },
  ],
}

// Usage: Workflow({ scriptPath, args: { root, sources } })
const ROOT = args && args.root
const SOURCES = args && args.sources
if (!ROOT || !SOURCES) throw new Error('pass args.root and args.sources')

const COMMON = `Project root: ${ROOT} (use absolute paths everywhere; the cwd resets). Orient from STATUS.md only (its "Gaps" and "Not built" lines are the work list), then only the files named below.
SOURCES: official PDFs in ${SOURCES} (gitignored; never copy or commit): errata_faq_v10.pdf overrides the rulebook; foww-campaign-handbook-digital-final_compress.pdf (book page = PDF page - 2), ai_handbook_v1.0.pdf, coop_handbook_v1.0.pdf, reference_cards_w9.pdf, 2p_cards.pdf. Extract with PyMuPDF (system Python, "import pymupdf"); render a page to PNG and Read it when text garbles.
IP rule: mechanics 1:1, all prose in our own words. Rules ambiguities never block: add "RULING: <rule> | <what we did> | <why> | <status>" to docs/needs-rules-check.md.
FROZEN CONTRACTS: src/engine/{types,decider,view,rng,pending}.ts (additive change = matching edit in docs/spec/00-architecture.md + an issues note). Deciders only see view(state, seat); exactly one PendingDecision; legalActions never empty; the engine owns every number the UI shows. Tests are named by checklist ID (docs/spec/12-rules-test-checklist.md).
Run long commands in the FOREGROUND. Never npm install, never git commit, never edit package.json or STATUS.md. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

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

const OWNERS = {
  rules: 'src/engine/modules/** (attack, melee, damage, items, movement; never the frozen files), data/1e/weapons/** and data/1e/items/** (only to add the fields these rules need), tests/engine/**',
  ai: 'src/ai/official/**, data/1e/ai/starter.json (the four placeholder cards are the research agent\'s; you may add fields other cards need), tests/ai/**',
  research: 'data/1e/ai/starter.json (the Settler, Enslaved Tech, Dogmeat and Mutant Hound cards only), docs/spec/sources/R2-photos.md (append), docs/needs-rules-check.md (append)',
  e2e: 'tests/e2e/**, src/client/interaction/** (drag only), src/client/board/** (pointer handling only)',
}

phase('Build')
const build = await parallel([
  () => agent(`${COMMON}
You own ONLY: ${OWNERS.rules}.
Close these engine gaps, each with the spec section found by grepping docs/spec for its name or ID and its checklist tests: BC-006 (battle cry), DMG-005, Walked Fire (the weapon effect; docs/spec/13 and 15), mines (placing, triggering, damage; docs/spec/15 and 16; add the data fields and an item record if the starter set has one, else the rule only), plus any "TODO(M2)" left in src/engine/modules that a starter-set card needs. Each gap: read the rule, read errata for overrides, implement, test by checklist ID, RULING for every ambiguity. npm run typecheck && npm test && npm run sim -- --games 20 --seed 1 must pass with 0 errors. ${KEEP}`,
    { label: 'build:rules', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWNERS.ai}.
Close the official-AI gaps named in STATUS.md's "Official AI (M4b)" Gaps line: ai-tech Presence and peek rules, the AI spending AP on card effects, Luck "Tough", no re-contact after a declined follow, and the coop-cage Stuffed Monkey card. For each read docs/spec/18-ai-system.md (the section the gap belongs to) and the Campaign Handbook pages it cites, and the co-op handbook for the cage scenario; implement in src/ai/official/* and the scenario data hooks already used by src/engine/scenarios; tests AI-032.. by the spec's numbering and a RULING per ambiguity. npm run typecheck && npm test && npm run sim -- --official --games 7 must pass, deterministic. ${KEEP}`,
    { label: 'build:ai', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWNERS.research}.
Fill the four placeholder AI cards (Settler, Enslaved Tech, Dogmeat, Mutant Hound) in data/1e/ai/starter.json with real matrices. Read docs/spec/18 section 2 (the card anatomy and how the three CH cards were entered), the existing complete cards in starter.json (format), docs/spec/sources/R2-photos.md (what was found before and where), and docs/KNOWLEDGE-BASE.md section 4.1 (research routes). Routes, in order, at most 6 fetches per route: the Campaign Handbook and reference_cards_w9.pdf in SOURCES (check whether these four cards are printed there first: render candidate pages to PNG and Read them); BGG image galleries (cf.geekdo-images.com downloads work with curl); eBay listings of the starter set AI deck (i.ebayimg.com); unboxing and review blog photos; fan wikis via their APIs. Read any photo with the Read tool and transcribe the matrix (mechanics only). Record each source in R2-photos.md with its URL and what it showed. A card you cannot source stays a placeholder but gets a RULING with the routes tried. Never commit photos. npm run validate:data must pass. ${KEEP}`,
    { label: 'build:research', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: ${OWNERS.e2e}.
Fix the pre-existing failing Playwright test "activate, move by drag" (tests/e2e). Run npm run e2e in the foreground to see the failure, read src/client/interaction/* (drag move with ruler) and the test, find the real cause (pointer events, timing, a changed text pick, a changed data-testid) and fix it at the root; do not loosen the test. Keep every text pick exact. npm run e2e must pass fully; npm run typecheck && npm test too. ${KEEP}`,
    { label: 'build:e2e', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])
log(`build: ${build.map((r) => (r ? r.summary : 'FAILED')).join(' | ')}`)

phase('Verify')
const verify = await agent(`${COMMON}
VERIFY ONLY (never edit). Check the work just done on the gaps listed in STATUS.md against the spec sections and errata, rule by rule: BC-006, DMG-005, Walked Fire, mines, the official-AI gaps (Presence/peek, AP on card effects, Luck "Tough", re-contact after a declined follow, Stuffed Monkey), the four AI card matrices (plausible against the card anatomy in spec 18 s2 and the sources cited in R2-photos.md), and that no frozen file changed without a spec note. Run npm test, npm run sim -- --official --games 7 and npm run e2e and read failures. Route each finding to its owner: rules (${OWNERS.rules}), ai (${OWNERS.ai}), research (${OWNERS.research}), e2e (${OWNERS.e2e}). 10 findings at most, the most serious first, each with the exact file and a concrete fix; ok=true only if nothing material is wrong.`,
  { label: 'verify:rules', phase: 'Verify', schema: FINDINGS, effort: 'high' })
const findings = verify ? verify.findings : []
log(`${findings.length} findings`)
const byOwner = {}
for (const f of findings) (byOwner[OWNERS[f.owner] ? f.owner : 'rules'] ||= []).push(f)
const fixes = await parallel(Object.keys(byOwner).map((o) => () => agent(`${COMMON}
You own ONLY: ${OWNERS[o]}. Fix these verified findings (read the spec section each cites), nothing else:
${byOwner[o].map((f, i) => `${i + 1}. ${f.where}: ${f.problem} -> ${f.fix}`).join('\n')}
Add a RULING line when a finding turns on an ambiguity. npm run typecheck && npm test must pass. ${KEEP}`,
  { label: `fix:${o}`, phase: 'Verify', schema: RESULT, model: 'sonnet' })))
return { build, findings, fixes }
