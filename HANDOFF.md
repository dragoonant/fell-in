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
- **M0 rules spec done** (`docs/spec/10`-`20`, 261 checklist IDs, 41 rulings in `docs/needs-rules-check.md`).
  Edition-specific numbers live under `data/1e/` per spec 20, which ends with a 2nd-edition migration note.
  Rulers: Orange 2, Yellow 4, Red 6, Green 8, Blue 10, Black 12 inches.
- **Known source gaps:** the official AI procedure (Campaign Handbook p8-12) and the starter AI, perk, boost and
  quest card texts are not in any free source. Spec 18 is built from the AI and co-op handbooks, errata and a dev
  blog; campaign/settlement (spec 19) has the same gap. **Owner decision 2026-10-11: fill these gaps by open-source
  information gathering, as Dead of Winner did** (see `docs/KNOWLEDGE-BASE.md` section 4.1). Do it before M4, in
  one research stage (2-3 Sonnet agents, 3-6 fetches each, exact spec sections named). Routes, in order:
  - Vassal library and Tabletop Simulator workshop: re-check for "Fallout"; a module is a zip of clean card scans.
  - GitHub fan projects: BSData, aslanator builder, spilth/foww, kairos25, Codsworth, plus a code search for
    AI card names.
  - The official companion app (fallout.maloric.com) and its network JSON.
  - Card photos: BGG image galleries (cf.geekdo-images.com downloads fine), eBay listings of the starter set and
    AI deck (built-in browser + curl of i.ebayimg.com), Bing image search via curl, and unboxing/review/playthrough
    blogs, Reddit and YouTube thumbnails, read with the Read tool.
  - Fan wikis and forums through their APIs with curl and a browser user agent; Fandom and BGG pages once
    through a real browser into `docs/spec/sources/`.
  Cite every value in `docs/spec/sources/` and log each choice in `docs/needs-rules-check.md`. Card text is read
  for mechanics only and written up in our own words. Fall back to placeholder matrices marked Unsourced only
  after every route above has been tried. Ask the owner only when a source is blocked from here and they can
  reach it, and give them the exact URLs.
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
1. **M1 data.** Dry-run the schema in `20-data-schema.md` on every starter-set card, then freeze it. Enter units,
   weapons, armor, items, perks, chems and AI cards from `docs/sources/2p_cards.pdf` and the BSData repo
   (github.com/BSData/fallout-wasteland-warfare, archived 2020), each record with a `source`. Add `src/data/`,
   `tools/validate-data.ts` and `npm run validate:data`. One or two Sonnet agents with exact file lists.
2. **M2 engine.** Replace the `TODO(M2)` stubs, tests named by checklist ID, bot-vs-bot sim in `tools/sim.ts`.
3. **M3 playable.** Rebuild interaction, presentation and the dice tray against the new contracts (whirr-machine
   paths in `docs/KNOWLEDGE-BASE.md` section 2.1), hot-seat + random bot, odds previews. Pages deploy, then
   stop for the owner's playtest.

## Gotchas
- Volume heights and base sizes in `src/engine/geometry.ts` are placeholders for this scale.
- Terrain rule types in `types.ts` are whirr-machine's set; trim them once spec 14 is final.
- The build warns about a 1.1 MB chunk; split it in M3.
- `tools/sim.ts` is a stub; `validate-data.ts` and `ai-bench.ts` were not copied (Warmachine-coupled).
- Privacy: never commit the owner's real name or a `C:\Users\<name>` path; workflow scripts derive their root at
  runtime. Grep staged changes before every commit. Stage by exact path.
