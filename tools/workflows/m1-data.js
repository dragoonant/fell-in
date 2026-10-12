export const meta = {
  name: 'm1-data',
  description: 'M1: dry-run and freeze the data schema, enter starter-set data, verify; AI/campaign gap research in parallel',
  phases: [
    { title: 'Dry run', detail: 'encode every starter card against spec 20, list schema gaps' },
    { title: 'Freeze', detail: 'amend spec 20, write src/data types/loader and validate-data' },
    { title: 'Enter', detail: 'two Sonnet agents, disjoint data folders' },
    { title: 'Verify', detail: 'adversarial check of data vs card PDF, then fix' },
    { title: 'Research', detail: 'open-source sweep for AI cards and campaign rules' },
  ],
}

// ROOT comes from args (workflow scripts have no Node API); never typed into the repo.
const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root = absolute project root')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: mechanics and card names 1:1; ALL prose (text, flavor, notes) in our own words from a one-line mechanical summary; never paraphrase card sentences.
Frozen contracts: never edit src/engine/{types,decider,view,rng,pending}.ts.
Run long commands in the FOREGROUND. Never run npm install or git commit; never edit STATUS.md; edit package.json only if told.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Card sources: ${ROOT}/docs/sources/*.pdf (gitignored). Extract with Python PyMuPDF (import pymupdf); render pages to PNG and Read them when layout garbles text. Put scratch extractions in ${ROOT}/docs/sources/extract/ (gitignored).
Rulings: append lines "RULING: <rule> | <what we did> | <why> | <status word>" to docs/needs-rules-check.md only if you are told you own it; otherwise return them in issues.`

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
      owner: { type: 'string', enum: ['A', 'B', 'freeze'] }, where: { type: 'string' },
      problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } },
  },
  required: ['ok', 'findings'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

const OWN_A = 'data/editions.json, data/1e/{dice,rulers,rules,costs}.json, data/1e/units/, data/1e/factions/, data/1e/leaders/, data/1e/heroic.json'
const OWN_B = 'data/1e/weapons/, data/1e/armor/, data/1e/items/, data/1e/mods/, data/1e/perks/, data/1e/scenarios/'

// ---------- Research track (starts immediately, runs beside M1) ----------
const RESEARCH_COMMON = `${COMMON}
Task context: read docs/spec/18-ai-system.md and docs/spec/19-campaign-settlement.md (gap lists), docs/spec/sources/WW-SOURCES.md, and docs/KNOWLEDGE-BASE.md section 4 only.
Budget: at most 6 WebFetch calls; curl (browser user agent) for direct file/API downloads is fine. Save raw downloads (images, zips, JSON) under ${ROOT}/docs/sources/research/ (gitignored) and Read images to extract mechanics.
Do NOT use any browser tool. If a page blocks you, list the exact URL under issues as "BLOCKED: <url>".
Write card mechanics as one-line summaries in our own words with a citation (URL + what was seen); never copy card sentences. Return proposed rulings in issues as "RULING: ..." lines.`

const RESEARCH = [
  { key: 'archives', file: 'docs/spec/sources/R1-archives.md', prompt: `Route: Vassal module library and Tabletop Simulator Steam workshop (search "Fallout Wasteland Warfare"; a module is a zip of card scans), then GitHub fan projects (BSData/fallout-wasteland-warfare, aslanator builder, spilth/foww, kairos25, Codsworth, plus GitHub code search for starter AI card names like "Super Mutant Brute" + "AI"), then the official companion app fallout.maloric.com and the JSON it loads. Goal: the AI card response matrices for the 11 starter units (spec 20 section 4) and any perk/boost/quest card data.` },
  { key: 'photos', file: 'docs/spec/sources/R2-photos.md', prompt: `Route: card photos. BGG image galleries for Fallout: Wasteland Warfare (cf.geekdo-images.com downloads work with curl), eBay listings of the Two Player Starter Set and the AI deck (i.ebayimg.com images), Bing image search via curl, unboxing/review/playthrough blogs, Reddit and YouTube thumbnails. Goal: legible photos of starter AI cards and the official AI activation procedure (Campaign Handbook p8-12).` },
  { key: 'campaign', file: 'docs/spec/sources/R3-campaign.md', prompt: `Route: fan wikis and forums through their APIs (Fandom api.php with curl, Reddit .json endpoints, Modiphius forum archives, BGG XML API threads), reviews and rules-explainer videos' descriptions. Goal: fill the spec 19 campaign/settlement gaps (settlement phase, structures, caps economy, experience/perks progression, quest structure) and the official AI procedure order as described by players.` },
]

phase('Research')
const researchP = parallel(RESEARCH.map(r => () => agent(`${RESEARCH_COMMON}
${r.prompt}
You own ONLY: ${r.file} (create it: findings table with value, citation, confidence; then a "Gaps remaining" list) and ${ROOT}/docs/sources/research/${r.key}/. ${KEEP}`,
  { label: `research:${r.key}`, phase: 'Research', schema: RESULT, model: 'sonnet' })))

// ---------- M1 track ----------
phase('Dry run')
const dry = await agent(`${COMMON}
Read docs/spec/20-data-schema.md fully and docs/spec/16-cards-and-forces.md. Extract docs/sources/2p_cards.pdf (render pages to PNG where stats are in boxes), plus wave9_costs.pdf for caps and dice_ruler_ref.pdf for dice/rulers. Clone or fetch github.com/BSData/fallout-wasteland-warfare (shallow clone into ${ROOT}/docs/sources/bsdata/) to cross-check stats.
Dry run: encode EVERY card in spec 20 section 4 against the spec 20 record interfaces as draft JSON in ${ROOT}/docs/sources/extract/dryrun/ (gitignored; one file per category). Also write ${ROOT}/docs/sources/extract/cards-index.md: one line per card with PDF page and any stat you could not place.
You own ONLY those gitignored scratch files. Report in issues every schema gap: a field the cards need that spec 20 lacks, a type that does not fit, or an ambiguity. Prefix each with the record type. ${KEEP}`,
  { label: 'dry-run', phase: 'Dry run', schema: RESULT, model: 'sonnet' })

phase('Freeze')
const freeze = await agent(`${COMMON}
The schema dry run of spec 20 against every starter card reported these gaps:
${JSON.stringify(dry && dry.issues)}
Drafts are in ${ROOT}/docs/sources/extract/dryrun/, the card index in ${ROOT}/docs/sources/extract/cards-index.md.
1. Amend docs/spec/20-data-schema.md to resolve every gap (keep it edition-keyed; one generic mechanism per concept; {"code": "<hook>"} escape hatches for odd card effects). Mark the schema FROZEN with today's milestone M1.
2. Write src/data/types.ts (TypeScript mirror of spec 20 records), src/data/index.ts (loader: import.meta.glob over data/<edition>/**/*.json, typed accessors by id, edition lookup with default from data/editions.json), and tools/validate-data.ts (runs with tsx: every record has id + source, ids unique, cross-references resolve, enums valid, prose fields present; exits non-zero with readable errors). Add "validate:data": "tsx tools/validate-data.ts" to package.json scripts (you may edit package.json for this line only).
3. Create the empty folder layout under data/ with data/editions.json and a .gitkeep per folder, and one tiny fixture test src/data/data.test.ts (it('DATA-001 every record validates') calling the validator's exported function, it('DATA-002 ids are unique')).
4. Run npm run typecheck and npm run validate:data (empty data must pass).
You own ONLY: docs/spec/20-data-schema.md, src/data/, tools/validate-data.ts, package.json (one line), data/editions.json and .gitkeep files. List schema changes in issues. ${KEEP}`,
  { label: 'freeze-schema', phase: 'Freeze', schema: RESULT, effort: 'high' })

phase('Enter')
const ENTER_COMMON = `${COMMON}
The data schema is FROZEN: docs/spec/20-data-schema.md and src/data/types.ts. Do not edit either; report needed changes in issues.
Use the dry-run drafts in ${ROOT}/docs/sources/extract/dryrun/ and ${ROOT}/docs/sources/extract/cards-index.md as a head start, but re-check each value against the PDF page and BSData (${ROOT}/docs/sources/bsdata/). Every record has a source citing file key + page (spec 20 header). Prose fields in our own words. When done, run npm run validate:data and npm run typecheck in the foreground and fix your own files until your records pass (errors in the other owner's files: ignore and list in issues).`
const [entA, entB] = await parallel([
  () => agent(`${ENTER_COMMON}
Enter: editions, edition tables (dice faces from dice_ruler_ref.pdf; rulers Orange 2, Yellow 4, Red 6, Green 8, Blue 10, Black 12 in; rules constants from spec 20 section 1; caps costs from wave9_costs.pdf), all 11 starter units, factions/reference (Survivors, Super Mutants, General Reference, Dogs, Creatures), the 4 leaders and Heroic.
You own ONLY: ${OWN_A}. ${KEEP}`, { label: 'enter:A units', phase: 'Enter', schema: RESULT, model: 'sonnet' }),
  () => agent(`${ENTER_COMMON}
Enter: all 22 weapons, armor, clothing, power armor, food/drink, alcohol, chems, gear, the 4 mods, and the box scenarios (docs/spec/17-scenarios.md plus the scenario PDFs in docs/sources/). Leader perks belong to the other agent; card-level perks only if any appear in 2p_cards.pdf.
You own ONLY: ${OWN_B}. ${KEEP}`, { label: 'enter:B gear', phase: 'Enter', schema: RESULT, model: 'sonnet' }),
])

phase('Verify')
const verify = await agent(`${COMMON}
You are a skeptical verifier. NEVER edit any file. Starter-set data was just entered under data/1e/. Owner A: ${OWN_A}. Owner B: ${OWN_B}. Owner freeze: src/data/, tools/validate-data.ts, spec 20.
Run npm run validate:data and npm run typecheck. Then sample hard: for every unit and at least 12 weapons, compare every stat, cost, range colour, effect die and keyword against the rendered PDF page (2p_cards.pdf, wave9_costs.pdf, errata_faq_v10.pdf overrides). Check that prose is not a near-copy of card wording, every record has a page-precise source, and no card in spec 20 section 4 (non physical-only) is missing.
Return each defect with owner, where (file + id), problem and the exact fix. 300 tokens or fewer per finding list is NOT required here: be complete but terse.`,
  { label: 'verify-data', phase: 'Verify', schema: FINDINGS, effort: 'high' })

let fix = null
const findings = (verify && verify.findings) || []
if (findings.length) {
  fix = await agent(`${COMMON}
Apply these verified data findings exactly (re-check each against the PDF before changing; skip and report any you can refute):
${JSON.stringify(findings)}
You own ONLY the files named in the findings plus docs/needs-rules-check.md (append RULING lines for any judgement call). The schema is frozen; if a finding needs a schema change, report it instead. Finish with npm run validate:data, npm run typecheck and npm test in the foreground, all green. ${KEEP}`,
    { label: 'fix-data', phase: 'Verify', schema: RESULT, model: 'sonnet' })
}

const research = await researchP
return { dry, freeze, entA, entB, verifyCount: findings.length, verifyOk: verify && verify.ok, fix, research }
