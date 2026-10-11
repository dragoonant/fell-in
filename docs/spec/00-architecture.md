# 00: Architecture

Contracts here are FROZEN after M1. A change needs an edit to this file and a note in the agent's `issues`.
Adapted from the base project's architecture, with its rules-specific parts removed.

## 1. Modules

```
src/engine/   pure TypeScript, no DOM, no Math.random. State in, state out.
  types.ts      contract types (frozen)         decider.ts  Decider interface, random + replay deciders (frozen)
  view.ts       per-seat redacted view (frozen) rng.ts      seeded sfc32 + d20/d12 helpers (frozen)
  pending.ts    raise() the one open decision   setup.ts    createGame (M0: createDemoGame only)
  geometry.ts   circle bases, sweeps, placement, path validation
  los.ts        3D line of sight with an explaining verdict
  measure.ts    base-edge distances             terrain.ts  terrain prisms, cover, rough, elevation
  dice.ts attack.ts damage.ts turnflow.ts movement.ts   TODO(M2) rules modules
src/data/     (M1) JSON bundle + schemas
src/ai/       (M4) deciders: random, easy, normal; Web Worker host
src/client/   React 19 + R3F + zustand; never mutates GameState, never computes a rules number
tools/        sim, audio pipeline, model optimizer, workflows
```

## 2. Units and the table
- 1 world unit = 1 inch; x/z ground plane, y up; origin at the table centre; default table 36 x 36 in.
- Bases are round, in mm: 25, 32, 40 (50 and 80 reserved for large creatures).
- The game measures with colour rulers. The engine stores inches and owns the colour-to-inches table; the UI shows
  the colour.

## 3. Decision model
- Exactly one `PendingDecision` is open at a time: `{id, seat, kind, context, options, canPass}`. `seat` may be
  `'all'` for simultaneous choices.
- `legalActions(state)` is never empty for an open decision, and every member validates.
- An `Action` carries `decisionId` and `seat`. A stale or illegal action is rejected with a `Rejection`
  (`E_STALE_DECISION`, `E_NOT_LEGAL`, ...) and the state is returned unchanged; the engine never throws on bad input.

## 4. Hidden information
Deciders only ever receive `view(state, seat)`. A leak test (`VIEW-*`) runs inside the sim on every game once hidden
cards exist (the AI card system, M4). Until then `view` passes everything through.

## 5. The engine owns every displayed number
Hit odds, range band, cover, expected damage and kill odds come from `query.*` functions and `pending.context`. The
client formats them and never recomputes them.

## 6. Determinism
`rng.ts` is sfc32 seeded by cyrb128. Only `roll(state, spec)` advances `state.rng` and `state.rollSeq`. Bots and AI
that need randomness derive their own stream with `deriveSeed(seed, decisionId)`; they never touch `state.rng`.
A game is reproducible from `(seed, action log)`.

## 7. Decider
```ts
interface Decider { decide(view: PlayerView, pending: PendingDecision, legal: Action[]): Promise<Action> }
```
One interface for human, AI, random bot and replay.

## 8. Test hooks (client)
`?test=1&seats=human,bot&seed=<s>` skips the start screen, seats the players and seeds the game. `?gallery` shows
figures, `?fps` shows the frame rate. `window.__game` exposes `getState()` and the parsed params. E2E tests pick
text exactly and use `data-testid`.

## 9. Performance budgets
Per-decision AI time sits behind an env var (CI is slow). Engine step under 5 ms p95 on the sim; scene stays above
30 fps on the Windows PC with 12 figures and 15 terrain pieces.

## 10. Contract change log (additive only)
- M0: initial contracts, stripped of the Warmachine rules (focus, damage grids, fury, power attacks, factions).
