# Status: what exists

Milestone reached: **M4 AI** (versus bot + official AI card system; owner playtest gate) (this file only lists what is real; plans live in PLAN.md).

## Repo and tooling
- Vite 8 + React 19 + R3F 9 + drei + zustand, TypeScript 7, Vitest 5, Playwright. Pages base `/fell-in/`.
- `.github/workflows/deploy.yml`: typecheck, test, build, deploy on push to `main`.
- `.claude/launch.json`: `fell-dev` on port 5191.
- `tools/`: `sim.ts` (harness shape, random decider smoke only), `gen-audio.ts` / `compose-audio.ts` /
  `measure-audio.ts` (ElevenLabs pipeline, starter `audio-manifest.json`), `models/optimize.mjs` (GLB optimizer),
  `workflows/` (empty, for Workflow scripts).

## Engine (`src/engine/`)
- Real, carried over from the base project and stripped of its rules: `geometry.ts` (circle bases, sweeps,
  placement, path validation), `los.ts` (`losReport`), `measure.ts`, `terrain.ts` (prisms by rules type),
  `rng.ts` (seeded sfc32, d20/d12 helpers, `roll`).
- Contracts: `types.ts`, `decider.ts` (random and replay deciders), `view.ts`, `pending.ts`, `index.ts`.
- `setup.ts`: `createDemoGame` (4 models, 5 terrain pieces) only.
- Stubs with TODO(M2): `dice.ts`, `attack.ts`, `damage.ts`, `turnflow.ts`, `movement.ts` (re-exports geometry).

## Rules engine (M2)
- Protocol: `registry.ts` (ModuleDef per namespace), `apply.ts` (validate + dispatch), `query.ts` (hitOdds,
  rangeBand, coverFor, expectedDamage, killOdds). `dice.ts` exact odds; `edition.ts`; `setup.ts` createGame
  (default box-1, Survivors vs Super Mutants).
- Modules: turnflow/movement (rounds, activation, AP, reactions, move/climb/fall), attack/melee (shoot, throw,
  blast, crits, luck, charge, battle cry, close combat), damage/conditions, items/scenario/forces.
- `npm run sim -- --games N --seed s`: random bots, full games, invariants; 50 games 0 errors, max step 1.4 ms.
- Not built: object/point targets (SHOT-003; GA tutorials can't be won), BC-006, DMG-005, Walked Fire, mines;
  box scenarios entered from spec summary end in draws (re-enter from box_scenarios_1-5.pdf).

## Official AI (M4b)
- Built from the Campaign Handbook section 3 and AI scenarios (CH p8-16, p40-42); spec 18 section 8. Owner rule: official
  rules only; every gap is a RULING in `docs/needs-rules-check.md`.
- `src/ai/official/` (decider, matrix, targeting, responses, objectives, util): number tokens, blue-die row, cell
  reading, responses A M O F D S, Careful/Reckless, target priorities, seeded ties, an `ai.decision` log per choice.
  Tests AI-001..031 (tests/ai/official-*.test.ts). Engine: AI turns, object targets (`objects.ts`), sides,
  data-driven scenarios (`src/engine/scenarios/`), new `battleCry.follow` decision.
- Client: Solo (1 human) and Co-op (2 hot-seat humans) vs the Wasteland AI, AI card panel, feed lines,
  `?seats=human,official&scenario=ai-rr`.
- `data/1e/ai/starter.json`: Super Mutant, Brute, Sole Survivor Day One from CH; Sole Survivor, Aviator, Goddard,
  Deathclaw from card photos; Settler, Enslaved Tech, Dogmeat, Mutant Hound still placeholders.
- `npm run sim -- --official --games N`: all 7 AI/co-op scenarios finish, 0 errors, deterministic.
- Gaps: ai-tech Presence/peek rules, AI spending AP on card effects, Luck "Tough", no-re-contact after a declined
  follow, coop-cage Stuffed Monkey card. E2E "activate, move by drag" fails on main too (pre-existing).

## AI (M4a)
- `src/ai/`: decider (dispatch by decision kind, validates, falls back to random), eval, threat, nav, moves,
  policies, world (view shim), worker. Tiers random / easy / normal; start-screen Opponent picker. Spec 30.
- `npm run bench:ai -- --games 100 --a normal --b random`: normal 95-98% over box-1..4 (box-5 excluded: no
  rescue rule), easy ~80%, ~25 ms per decision. Objective weight is low and needs the owner playtest.
- Assets: 15 terrain, 11 unit figures (bare-handed, hand sockets), 17 weapons (flat tints; textured paint
  blocked by Smart App Control on the GPU PC). Procedural Web Audio SFX and music.

## Client (M3)
- Start screen (box 1-5 + skirmish, vs bot / hot-seat / watch bots, seed, speed, Continue) -> game -> game over.
- `contract.ts` surface; `store/gameStore.ts` only apply caller, autosave; `bot/` random bot + watchdog;
  `presentation/` director, cues, presented state; `board/` + `figures/` render from presented state;
  `interaction/` select, drag move with ruler, targeting with LOS/cover; `ui/` HUD, prompts, unit card, odds,
  feed, game over; `dice/` d20 + d12 tray and log. Box scenarios 1-5 re-entered from the PDF (sim: 0 draws).
- E2E: bot-vs-bot to game over and a human click path; screenshots `screenshots/m3-playable.png`.
- Known: overlays crowd at 1280x800; figures and terrain are procedural; no audio yet.

## Client (`src/client/`)
- Start screen "Fell-in: Wasteland Warfair" and a 3D table: 36 x 36 in procedural wasteland mat, camera presets
  (overview, near seat, far seat, top down), procedural terrain (crates, wall, wreck, barrels, rubble) and four
  procedural figures on 25, 32 and 40 mm bases. Wasteland palette in `theme.ts`.
- Test hooks: `?test=1&seats=human,bot&seed=` skips the start screen and exposes `window.__game`.
- Not carried over (Warmachine-coupled, rebuild against the new engine): presentation director, interaction/drag,
  dice tray, VFX, audio manager, GLB figure loader, HUD panels.

## Data (M1)
- Schema FROZEN M1 in `docs/spec/20-data-schema.md`; `src/data/` (types, loader via import.meta.glob, pure
  validator), `tools/validate-data.ts`, `npm run validate:data`.
- `data/1e/`: dice, rulers, rules, heroic; 11 units, 6 faction/reference records, 4 leaders; 22 weapons,
  5 armor/clothing/power armor, 4 mods, 13 items (food, gear, alcohol, chems); 14 scenarios (GA tutorials,
  box, AI/co-op handbook). Every record cites its source. Costs live on records (no costs.json).
- Gap research: `docs/spec/sources/R1-archives.md`, `R2-photos.md`, `R3-campaign.md`. AI matrices for the
  starter units and campaign settlement numbers are still open (owner cards or blocked BGG/Reddit pages).

## Tests (`npm test`: 172 tests; `npm run e2e`: 2)
GEOM-001..005, LOS-001..003, RNG-001, SETUP-001, VIEW-001, DECIDER-001; Playwright boot test and the screenshot
`screenshots/m0-table.png`.

## Not yet
Dice/attack/damage/turn flow (M2), playable 3D game (M3), AI (M4).
