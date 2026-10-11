# Handoff

Start here in a new session opened on this folder. Read `CLAUDE.md`, then this file, `STATUS.md` and `PLAN.md`.
Cross-project lessons (stack, reusable code, pipelines, token traps) are in `docs/KNOWLEDGE-BASE.md`;
read only the section a task needs. The source map is `docs/spec/sources/WW-SOURCES.md`.

## Current state (2026-10-11)
- **M0 bootstrap shipped.** Public repo `dragoonant/fell-in`, Pages https://dragoonant.github.io/fell-in/ (deploy
  workflow green, also runs on `workflow_dispatch`). Start screen, 36x36 in wasteland table, camera presets,
  procedural terrain and 4 placeholder figures. `npm run typecheck`, `npm test` (12), `npm run build` and
  `npx playwright test` (2) pass. Dev server: `.claude/launch.json` entry `fell-dev`, port 5191.
- Engine core copied from whirr-machine and stripped: geometry, LOS, measure, terrain, rng, types, decider,
  view, pending, setup. `TODO(M2)` stubs in dice, attack, damage, turnflow, movement.
- **M0 rules spec: possibly unfinished.** An Opus agent in the kickoff session was writing `docs/spec/1x-2x`.
  Check which of these exist: 10-overview, 11-turn-and-actions, 12-rules-test-checklist, 13-dice-and-tests,
  14-range-los-cover-terrain, 15-damage-armor-radiation, 16-cards-and-forces, 17-scenarios, 18-ai-system,
  19-campaign-settlement, 20-data-schema, plus `docs/needs-rules-check.md`. If any are missing or uncommitted,
  finish them first: one agent on the session model at effort high, same brief (our own words, cite file and
  page for each section, ~150 checklist IDs, edition-specific numbers kept in data keyed by edition, a short
  "2nd edition migration" note in 20). Commit as `M0: rules spec`.
- Sources: the free 1st-edition PDFs are in gitignored `docs/sources/` (rules of play, Getting Acclimated v1.3,
  AI and Co-op handbooks, errata v10 (overrides the rulebook), wave 9 costs, dice/ruler sheet, 2P cards, Red
  Rocket AI scenario). Extract with PyMuPDF; render pages to PNG when layout garbles text.

## Owner decisions (settled 2026-10-11; do not re-ask)
- Title "Fell-in: Wasteland Warfair". Mallet IP posture; Vault Boy, Pip-Boy, Nuka-Cola and faction emblems get
  original markings.
- 1st edition now. 2nd edition releases about November 2026 and we migrate then, so dice faces, ruler
  colours/lengths and costs live in data keyed by edition, never in code.
- v1 = Two Player Starter Set, then more factions. All four opponent modes, in order: our bot AI, hot-seat,
  official AI card system (solo/co-op), campaign/settlement.
- Figures from the real sculpts at house proportions (Gemini + Hunyuan3D on the Windows PC); procedural
  placeholders until the owner's first playtest.
- Token ceiling about 2.5M per push. Sonnet implements, Opus integrates and writes specs, no review loops
  except the AI milestone.

## Next
1. Finish/commit the M0 spec (above).
2. **M1 data.** Dry-run the schema in `20-data-schema.md` on every starter-set card, then freeze it. Enter units,
   weapons, armor, items, perks, chems and AI cards from `docs/sources/2p_cards.pdf` and the BSData repo
   (github.com/BSData/fallout-wasteland-warfare, archived 2020), each record with a `source`. Add `src/data/`,
   `tools/validate-data.ts` and `npm run validate:data`. One or two Sonnet agents with exact file lists.
3. **M2 engine.** Replace the `TODO(M2)` stubs, tests named by checklist ID, bot-vs-bot sim in `tools/sim.ts`.
4. **M3 playable.** Rebuild interaction, presentation and the dice tray against the new contracts (whirr-machine
   paths in `docs/KNOWLEDGE-BASE.md` section 2.1), hot-seat + random bot, odds previews. Pages deploy, then
   stop for the owner's playtest.

## Gotchas
- Volume heights and base sizes in `src/engine/geometry.ts` are placeholders for this scale.
- Terrain rule types in `types.ts` are whirr-machine's set; trim them once spec 14 is final.
- The build warns about a 1.1 MB chunk; split it in M3.
- `tools/sim.ts` is a stub; `validate-data.ts` and `ai-bench.ts` were not copied (Warmachine-coupled).
- Privacy: never commit the owner's real name or a `C:\Users\<name>` path; workflow scripts derive their root at
  runtime. Grep staged changes before every commit. Stage by exact path.
