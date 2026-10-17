# Handoff

Start here in a new session opened on this folder. Read `CLAUDE.md`, then this file, `STATUS.md` and `PLAN.md`.
Cross-project lessons (stack, reusable code, pipelines, token traps) are in `docs/KNOWLEDGE-BASE.md`;
read only the section a task needs. The source map is `docs/spec/sources/WW-SOURCES.md`.

## Current state (2026-10-17, end of the M5/M4g/M6 run)
- Shipped today, all on `main` and deployed to Pages (https://dragoonant.github.io/fell-in/):
  - **M5 look and sound** from the local AI studios: 64 local audio clips (34 sfx, 5 music moods, 25 narrator lines,
    Qwen3-TTS "Ryan"), file-backed audio client with a voice bus, audition page `/fell-in/sounds.html`; 15 new terrain
    pieces and three themed skirmish boards (suburbs, red-rocket, junkyard; `?theme=`); nine hold-pose figure variants;
    original key art, scenario previews, unit portraits and faction marks. Tools: `tools/local-gen/*` (studio client,
    gen-audio-local, gen-terrain, gen-poses, gen-art), notes in `docs/spec/sources/LOCAL-STUDIOS.md`.
  - **M4g rules gaps**: BC-006, DMG-005, Walked Fire, mines, object targets in the shoot form (e2e 13/13), official AI
    no re-contact after a declined follow. **M4h bot**: objective play, normal beats random 29-1-0 (30 games).
  - **M6 campaign and settlement**: spec 19 from the Campaign Handbook, 250 campaign records, `src/campaign/` layer,
    settlement screen (start screen "Campaign" card) through To battle and back. Carry-off victories now fire.
- **Owner decisions 2026-10-17:** the M4 playtest gate is waived (the owner plays the fully developed game instead);
  the look and sound come from the local AI suite on this PC (see the studio list below).
- **Needs the owner:**
  - Photos of the four starter AI cards (Settler, Enslaved Tech, Dogmeat, Mutant Hound) and of the starter Boost,
    Event, Quest and Explore cards: none exist in any free source (routes tried in `docs/spec/sources/R2-photos.md`,
    `docs/spec/sources/CH-CAMPAIGN.md`). Until then those records are named placeholders.
  - A ruling for box-1 (Ad Victoriam): elimination-only victory draws often after six rounds; points-at-timeout or as
    printed (`docs/needs-rules-check.md`, Unsourced).
  - Listen through `/fell-in/sounds.html` and name ids to redo (`node tools/gen-audio-local.mjs --only <id>` after
    deleting the mp3); nothing was auditioned by ear.
  - The main checkout folder was fast-forwarded to `main`; if the dev server on 5191 was running there, reload it.
  - Delete the stray empty folder `C:iews` (a debug render created it; the safety check would not let an agent).
- **Open after this run (next session):** engine offers for `expertise.use` (Presence), `ap.spend` card effects and
  the Luck "Tough" ask (spec 18 s8.9); events, boosts and quests as engine modules during a battle (today they are pure
  campaign functions, `BattleExtras`); the settlement Next-battle panel sits below the fold on early steps; the
  "watch bots" e2e flaked once in a parallel run; Hunyuan textures are faceted on the big figures (super mutants,
  Brute, Goddard) and could be regenerated at a higher texture setting; M7 factions (Raiders, Institute, Robots,
  creatures) are next on PLAN.md.
- Local studios (another session may be using the GPU at the same time; announce GPU work at the start of a session):
  - Flux Studio http://localhost:7880 (`POST /api/jobs`; FLUX.2 klein text-to-image and image edit, FLUX.1 dev/schnell).
  - Audio Studio http://localhost:7890 (modes music / sfx / foley / voice). Built in a sibling worktree of the
    `3D Model Generation` project; if it is down, start it from that project's `audio-studio/` folder.
  - Hunyuan Studio http://localhost:7860 (`node server.js` in `..D Model Generation`; it does NOT queue: one job at
    a time). The raw pipeline scripts in `%USERPROFILE%\Hunyuan3D-2` still work (docs/KNOWLEDGE-BASE.md section 3.2).
  - Workflow scripts: `tools/workflows/m5-look-sound.js` (stages probe, sound, terrain, poses, ui, check, fix),
    `m4g-gaps.js`, `m4h-bot-objectives.js`, `m6-campaign.js` (design, build, check), `m6b-polish.js`.

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
