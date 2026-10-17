# 00: Architecture

Contracts here are FROZEN after M1. A change needs an edit to this file and a note in the agent's `issues`.
Adapted from the base project's architecture, with its rules-specific parts removed.

## 1. Modules

```
src/engine/   pure TypeScript, no DOM, no Math.random. State in, state out.
  types.ts      contract types (frozen)         decider.ts  Decider interface, random + replay deciders (frozen)
  view.ts       per-seat redacted view (frozen) rng.ts      seeded sfc32 + d20/d12 helpers (frozen)
  pending.ts    raise() the one open decision   setup.ts    createGame(bundle, opts), createDemoGame (M0 table)
  geometry.ts   circle bases, sweeps, placement, path validation
  los.ts        3D line of sight with an explaining verdict
  measure.ts    base-edge distances             terrain.ts  terrain prisms, cover, rough, elevation
  -- M2 foundations (frozen for the rules owners) --
  registry.ts   action protocol: ModuleDef, Controller, StepResult, ActionDone, raiseDecision, todo
  apply.ts      apply(state, bundle, action): validate, dispatch by pending.kind namespace, afterAction, log
  query.ts      every displayed number: hitOdds, rangeBand, coverFor, expectedDamage, killOdds
  dice.ts       skill test, effect pools, armor die, luck flip, rerolls, exact odds (complete)
  edition.ts    bundle lookups: ruler inches/colour steps, rule constants, recordOf
  -- M2 rules modules (owner: namespaces they own) --
  turnflow.ts   T: turn.* react.* prepare.*  controller; rounds, readiness, activation menu, AP, reactions
  movement.ts   T: move.*                   Move, withdraw, climb/fall, charge path, Push Back
  attack.ts     A: shoot.* throw.*          shooting, range bands, cover, thrown/advanced weapons, crits, luck
  melee.ts      A: charge.* melee.* battleCry.*  charge bonus, Battle Cry, close combat, slide, free attacks
  damage.ts     D: damage.*                 hits vs armor, Power Armor, radiation, Health, removal, damage odds
  conditions.ts D: cond.*                   conditions add/remove/tick, SV and movement penalties
  items.ts      I: item.* expertise.* search.*  item use and durations, expertise tests, markers
  scenario.ts   I: scenario.* deploy.*      victory, round end, scenario actions
  forces.ts     I: (no decisions)           stat lookups (unitOf, attrOf, skillBase), force cost/validation
  hooks.ts      after-Action pass: mines, DMG-005 free Quick Action (wraps movement/attack/melee resolve)
  mines.ts      WPN-003 mine markers (runtime bag on state.scenario)
src/data/     (M1) JSON bundle + schemas
src/ai/       (M4) deciders: random, easy, normal; Web Worker host
  official/     (M4b) official AI card decider (spec 18 s8): matrix, targeting, responses, objectives
src/client/   React 19 + R3F + zustand; never mutates GameState, never computes a rules number
tools/        sim, audio pipeline, model optimizer, workflows
```

### Runtime bag and tokens (additive; no frozen file changed)
- `hooks.ts` wraps the resolve of movement, attack and melee. Whenever a step reports an Action done it runs, in order:
  the WPN-003 mine check for the finishing model, then the DMG-005 offer. When a Ready, unused model was eliminated during
  the Action and its Luck flip came up lucky, the module's `done` is held back and replaced by a `damage.dying` decision;
  the held `done` is returned once that free Action ends (`Dying.active` tells the two apart).
- `mines.ts` keeps its runtime state in the scenario bag (the ScenarioState type is not widened): `state.scenario.mines`
  (`MineState[]`: id, owner, pos, weaponId, placedAt = action-log length at the drop), read through `minesOf(state)`.
  damage.ts keeps `state.scenario.dying` (the open DMG-005 record: model, held done, Action context, active flag), read
  through `dyingOf(state)`.
- New decision and action names, all inside namespaces that already exist, so `apply.ts` dispatch is unchanged: the pending
  kinds `battleCry.escape` (melee.ts; the winning defender's break-away Reaction, spec 11 s4) and `damage.dying` (damage.ts;
  the free Quick Action, spec 15 s1), and the Action type `move.mine` (movement.ts; placing a mine, offered on the
  activation menu and answered as a Move Action, spec 14 s7).
- New model tokens: `freeAction` (set on an eliminated model whose flip was lucky, cleared when the offer is answered) and
  `noFollow:<id>` (the model declined a Push Back follow-up on that enemy; cleared when its next activation begins).

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
- M2 (foundations, frozen for the rules owners):
  - `types.ts`: `ModelState` gains readiness, damage, rad, luck, reaction, chargeBonus, armorBoost, bonusDice,
    carried (`CarriedItem`: uid, defId, kind, starting, spent, cp, loaded, primed, paDamage, degraded, mods), effects
    (`ActiveEffect`), addictions, heroic, leaderId, tokens. `GameState` gains edition, scenarioId, phase, round,
    maxRounds, seats (`SeatState`), seatOrder, advantage, turn (`TurnState`), activation (`ActivationState`: actionsTaken,
    ap, apIconsUsed, heavyFired, testsUsed), action (`ActionContext`: quick, reaction, free, itemUsed), markers
    (`MarkerState`), events (`GameEvent`), result (`GameResult`). New `WastelandCondition` (`WASTELAND_CONDITIONS`),
    `WastelandDamageType`, `EffectDieColour`; the legacy `ConditionId`/`DamageType` stay `string` because geometry, LoS
    and terrain still use the base project's names. `RejectionCode` gains E_WRONG_SEAT, E_GAME_OVER, E_UNKNOWN_KIND,
    E_BAD_PARAM, E_NO_ACTIONS_LEFT, E_NO_AP, E_NO_SKILL, E_OUT_OF_RANGE, E_NO_LOS, E_ENGAGED, E_NOT_ENGAGED,
    E_CONDITION, E_NO_ITEM, E_ITEM_USED, E_BAD_TARGET, E_TODO.
  - Protocol (`registry.ts`, `apply.ts`): kinds and action types are `<namespace>.<verb>`; each namespace has one owner.
    `apply` checks game over, decision id, seat and option match (an option's action is a template; extra fields are
    parameters the owner validates), then calls the owner of `pending.kind`. A step returns `{state}` with a new decision
    raised by `raiseDecision`, or `{state, done}`; `done` goes to `turnflow.afterAction`. Turnflow forwards activation
    menu picks to `moduleFor(action.type)`. Unimplemented bodies throw `TodoError`, which `apply` reports as E_TODO.
  - `createGame(bundle, {seed, seats, scenarioId, forces})`: default scenario box-1 with the starter Survivors vs Super
    Mutants forces, automatic deployment and simple terrain; first decision `turn.start`.
- M4b (official AI, spec 18 s8; additive):
  - `PlayerView` gains optional `round`, `maxRounds`, `scenarioId` and `markers`. `view()` removes `face` (and secret props)
    from Searchable and Investigation markers until they are revealed or a seat on the viewer's team has peeked; objects and
    shootable markers are open. This replaces the pass-through note in section 4 for markers.
  - `SeatState` gains optional `controller` ('human' | 'bot' | 'official') and `team`. Seats on one team take turns together
    (turnflow alternates by team; the team's first seat answers `turn.ready` and `turn.pick`, context `team`), are never
    hostile to each other, and win or lose together (`sides.ts`: teamOf, sameTeam, hostile, teamSeats, isAiSeat). The AI seat
    is never offered `turn.useNone`, and `turn.pick` offers only its lowest `tokens.aiNumber` (AI-001).
  - `createGame` gains `controllers`. A seat named `ai` defaults to 'official' and plays the scenario side with an `ai`
    block; other seats take the remaining sides (several humans split the last side's force). AI set-up rolls `tokens.aiNumber`
    (a permutation through `roll()`), shuffles the deployment spots and keeps `tokens.deployX/deployZ` (Fall Back). The AI
    takes its AI card's standard equipment. A human seat opens the game (`turn.start`).
  - Objects (`objects.ts`, SHOT-003): `shoot.target` / `throw.target` / `melee.attack` options may carry `targetMarkerId`
    instead of `targetId`. Marker props: `health` (Health left), `maxHealth`, `damage`, `armor`, `shootable`, `meleeable`,
    `baseMm`, `destroyed`, `offTable`, `hit`, `damaged`. A destroyed object stays in `state.markers` with `destroyed: true`;
    events `objectDamage`, `objectRemoved`, `objectPushed`. `query.hitOdds/rangeBand/coverFor/expectedDamage/killOdds` accept
    a marker id as the target. New scenario Action `scenario.push` (Str test, scenario-defined).
  - `apply` moves an attached `action.aiLog` into an `{type:'ai.decision', ...}` event and strips it from the action and log.
