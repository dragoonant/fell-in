# Handoff

## Current state
M0 bootstrap is done: repo skeleton, stripped engine core (geometry, LOS, measure, terrain, rng, decider, view),
a start screen and a 3D 3 ft table with placeholder terrain and figures. `npm run typecheck`, `npm test` (12) and
`npm run build` pass; `screenshots/m0-table.png` is the check-in picture. Nothing is committed yet and no GitHub
repo exists; the first commit and push (`M0: bootstrap`) enable the Pages deploy.

## Next: M1 data
1. Freeze the data schema (`docs/spec/20-data-schema.md`) after a dry run that encodes every unit in the Two
   Player Starter Set (Super Mutants, Survivors, Brotherhood Aspirant, Deathclaw, starter creatures).
2. Enter units, weapons, armor, items, perks and chems from the card PDFs and BSData, each value cited in
   `docs/spec/sources/`. Prose in our own words.
3. Add `tools/validate-data.ts` and `src/data/` (schemas, bundle loader), wire `npm run validate:data`.
4. Then M2: replace the TODO(M2) stubs in `src/engine/` (dice, attack, damage, turnflow, movement, cover and
   ruler-colour range in `los.ts`), driven by the checklist IDs in `docs/spec/12-rules-test-checklist.md`.

## Gotchas
- Volume heights and base-size tables in `geometry.ts` are placeholders for the Wasteland scale.
- Terrain rules types in `types.ts` are the carried-over set; trim or extend them when the terrain rules are specced.
- The Warmachine client modules were deliberately not copied (they depend on its engine). Rebuild the interaction,
  presentation and dice-tray layers in M3 against the new contracts, using `docs/KNOWLEDGE-BASE.md` section 2.1.
