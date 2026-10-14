export const meta = {
  name: 'm4d-audit',
  description: 'Audit every scenario setup (forces, deployment, objects, terrain, rounds, victory) against the source PDFs; research Brotherhood of Steel unit data',
  phases: [
    { title: 'Audit', detail: '3 scenario auditors + 1 Brotherhood of Steel data researcher; read-only' },
  ],
}

const ROOT = args && args.root
const SRC = args && args.src
if (!ROOT || !SRC) throw new Error('pass args.root and args.src')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
OWNER FEEDBACK: "Is the Red Rocket that yellow cube? I don't understand where it is. On Ad Victoriam the sides are Sole Survivor with Settlers and Dogmeat versus Super Mutants. Where are the Brotherhood of Steel? The scenario is set up incorrectly. Go through and make fixes."
Known: box-1..5 sides in data/1e/scenarios/scenarios.json have NO forces, so src/engine/setup.ts falls back to the default Survivors vs Super Mutants. There is no Brotherhood of Steel unit data (data/1e/units/ has survivors, super-mutants, other). Objective objects without a 3D model render as a generic block.
Source PDFs (gitignored, read-only, never copy into the repo): ${SRC}. Extract with PyMuPDF (python -I); render pages to PNG and Read them, because maps, deployment diagrams and force lists are often images. Cite "<file> p<n>".
You are READ-ONLY: never edit repo files. Run long commands in the FOREGROUND.
Report everything that is wrong or missing versus the source, per scenario: sides and which faction each side is, forces (units, counts, gear, heroic/leader), force-building rules if the scenario lets players pick (caps), deployment zones and edges, table size, terrain pieces named by the scenario, every marker/object (what it physically is, size, where it starts, its rules), rounds, turn order quirks, victory and scoring. Also say what each object should LOOK like on the table so the client can model it (e.g. "Red Rocket: a large red scrap rocket on a ~100 mm base, upright, about 4 in tall").
Return JSON only, 600 tokens or fewer: be terse, one line per issue.`

const AUDIT = {
  type: 'object',
  properties: {
    scenarios: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },
      ok: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string' } },
      objects: { type: 'array', items: { type: 'string' } },
      unitsNeeded: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'ok', 'issues', 'objects', 'unitsNeeded'] } },
    notes: { type: 'string' },
  },
  required: ['scenarios', 'notes'],
}
const RESEARCH = {
  type: 'object',
  properties: {
    units: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, source: { type: 'string' }, complete: { type: 'boolean' }, gaps: { type: 'string' },
    }, required: ['id', 'source', 'complete', 'gaps'] } },
    sourceFiles: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['units', 'sourceFiles', 'notes'],
}

phase('Audit')
const results = await parallel([
  () => agent(`${COMMON}
Audit ga-1..ga-4 and box-1..box-5 in data/1e/scenarios/scenarios.json against ${SRC}/getting_acclimated_v1.3.pdf and ${SRC}/box_scenarios_1-5.pdf (and docs/spec/17-scenarios.md sections 2-3, which may itself be wrong). Also read src/engine/setup.ts and src/engine/scenarios/deploy.ts enough to say how forces are chosen when a side has none. For box scenarios that are faction-agnostic (roles like attacker/defender), say what the source expects players to field (points, caps, any faction) and propose a concrete starter-set force pair; for box-1 say exactly which Brotherhood of Steel units/gear it needs.`,
    { label: 'audit:ga+box', phase: 'Audit', schema: AUDIT, effort: 'high' }),
  () => agent(`${COMMON}
Audit ai-rr, ai-missile, ai-breakin, ai-tech in data/1e/scenarios/scenarios.json against ${SRC}/red_rocket_ai_scenario.pdf, ${SRC}/ai_handbook_v1.0.pdf and the Campaign Handbook AI scenarios (${SRC}/foww-campaign-handbook-digital-final_compress.pdf, book p40-42; PDF page = book page + 2), plus docs/spec/17-scenarios.md section 4.`,
    { label: 'audit:ai', phase: 'Audit', schema: AUDIT, effort: 'high' }),
  () => agent(`${COMMON}
Audit coop-sewer, coop-cage, coop-munitions in data/1e/scenarios/scenarios.json against ${SRC}/coop_handbook_v1.0.pdf and any co-op scenarios in the Campaign Handbook (${SRC}/foww-campaign-handbook-digital-final_compress.pdf), plus docs/spec/17-scenarios.md section 4. Check especially which side the AI controls and which models each human player gets.`,
    { label: 'audit:coop', phase: 'Audit', schema: AUDIT, effort: 'high' }),
  () => agent(`${COMMON}
Research Brotherhood of Steel unit data for 1st edition, enough to field a box-1 Brotherhood force (read box_scenarios_1-5.pdf p1-2 to see what it asks for) and a small general Brotherhood list: e.g. Paladin, Knight, Initiate/Aspirant, Scribe, Elder Maxson, Paladin Danse, plus their weapons/armor/power armor. Look in ${SRC} first (wave9_full_card_list.pdf, wave9_costs.pdf, reference_cards_w9.pdf, leader_cards_w6.pdf, heroic_cards_v4.pdf, perk_cards_w9.pdf) and the existing data/1e/units/other.json (aspirant-goddard) and docs/spec/sources/WW-SOURCES.md. Then public sources, at most 6 fetches: the BSData repo github.com/BSData/fallout-wasteland-warfare (raw .cat/.gst files have stats), fan builders. Read docs/spec/20-data-schema.md for what a unit record needs (stats, SPECIAL, health, base size, cost, keywords, gear). Do not write repo files; you may save raw downloads ONLY under ${ROOT}/docs/sources/ (gitignored). Report per unit whether every schema field is sourced, and where.`,
    { label: 'research:bos', phase: 'Audit', schema: RESEARCH, effort: 'high' }),
])
return { ga_box: results[0], ai: results[1], coop: results[2], bos: results[3] }
