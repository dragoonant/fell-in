# Status: what exists

Milestone reached: **M0 bootstrap** (this file only lists what is real; plans live in PLAN.md).

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

## Client (`src/client/`)
- Start screen "Fell-in: Wasteland Warfair" and a 3D table: 36 x 36 in procedural wasteland mat, camera presets
  (overview, near seat, far seat, top down), procedural terrain (crates, wall, wreck, barrels, rubble) and four
  procedural figures on 25, 32 and 40 mm bases. Wasteland palette in `theme.ts`.
- Test hooks: `?test=1&seats=human,bot&seed=` skips the start screen and exposes `window.__game`.
- Not carried over (Warmachine-coupled, rebuild against the new engine): presentation director, interaction/drag,
  dice tray, VFX, audio manager, GLB figure loader, HUD panels.

## Tests (`npm test`: 12 tests; `npm run e2e`: 2)
GEOM-001..005, LOS-001..003, RNG-001, SETUP-001, VIEW-001, DECIDER-001; Playwright boot test and the screenshot
`screenshots/m0-table.png`.

## Not yet
Rules spec freeze, data schema and card data (M1), dice/attack/damage/turn flow (M2), playable 3D game (M3), AI (M4).
