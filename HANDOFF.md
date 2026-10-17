# Handoff

Start here in a new session opened on this folder. Read `CLAUDE.md`, then this file, `STATUS.md` and `PLAN.md`.
Cross-project lessons (stack, reusable code, pipelines, token traps) are in `docs/KNOWLEDGE-BASE.md`;
read only the section a task needs. The source map is `docs/spec/sources/WW-SOURCES.md`.

## Current state (2026-10-17)
- M0-M4 shipped, plus M4b (official AI from the Campaign Handbook), M4c (briefings), M4d (every scenario re-entered
  from its PDF, Brotherhood of Steel) and M4f (two-handed pose pilot). See STATUS.md.
- **Owner decision 2026-10-17: skip the M4 playtest gate; the owner will play the fully developed game instead.
  Keep moving through M5 (look and sound), the M4 gaps, M6 (campaign/settlement from the Campaign Handbook) and
  M7 (factions).** Each stage still ends in a Pages deploy and screenshots.
- **Owner decision 2026-10-17: the look and sound come from the local AI suite on this PC** (the ask-first rule for
  GPU work is satisfied for this run; a new session still announces GPU work before starting it):
  - Flux Studio, http://localhost:7880 (`POST /api/jobs`; FLUX.2 klein text-to-image and image edit, FLUX.1 dev/schnell).
  - Audio Studio, http://localhost:7890 (`POST /api/jobs`, modes music / sfx / foley / voice; ACE-Step 1.5 music,
    Stable Audio Open SFX, Qwen3-TTS and Chatterbox voice). Built in a sibling worktree of the `3D Model Generation`
    project and not yet committed there; if it is down, start it from that project's `audio-studio/` folder.
  - Hunyuan Studio, http://localhost:7860 (`node server.js` in `..D Model Generation`; image or text to 3D, Flux
    concepts, one GPU job at a time). The raw pipeline scripts in `%USERPROFILE%\Hunyuan3D-2` still work
    (docs/KNOWLEDGE-BASE.md section 3.2); `fellin_units.json`, `fellin_pose/` and `fellin_m4d/` hold the earlier runs.
  - Notes on each studio's job parameters: `docs/spec/sources/LOCAL-STUDIOS.md` (written by the M5 probe stage).
  - ElevenLabs stays as a fallback only; local generation costs no credits.
- M5 runs from `tools/workflows/m5-look-sound.js`, one stage per run (`args.stage`): probe, sound, terrain, poses,
  ui, check. Commit and push after each stage.
- Next after M5: `tools/workflows/m6-campaign.js` (spec 19 rewritten from the Campaign Handbook p4-6, p18-24, then
  engine, data, client), and the M4 gaps listed in STATUS.md (four placeholder AI cards, ai-tech Presence/peek,
  Luck "Tough", BC-006, DMG-005, Walked Fire, mines, the "activate, move by drag" e2e).

## History (2026-10-12): M4b from the Campaign Handbook
- Owner supplied the official Campaign Handbook PDF in the main checkout's gitignored `docs/sources/`
  (`foww-campaign-handbook-digital-final_compress.pdf`; book page = PDF page - 2). It closes the CH gaps:
  AI procedure (p8-16), AI scenarios (p40-42), Events/Perks/Boosts/Quests (p4-6), Settlement (p18-24).
  The "no free copy" notes in spec 10/19 are out of date.
- Owner decisions 2026-10-12: official rules only, no house roguelike; finish M4b (official AI, solo/co-op)
  then M6 campaign/settlement from CH. M4b was finished and merged (commits 4175c95, 672125d); `wip/m4b` is history.

## History (2026-10-11)
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
