# 30: Versus bot (our AI)

This is our own opponent for versus play. It is not the official AI card system (that is `18`). The bot is a
utility AI: for each open decision it builds candidate answers, scores them with numbers the engine computes, and
picks the best. It is adapted from the WHI utility AI (KNOWLEDGE-BASE 1.4, 2.1 AI row) with the Warmachine parts
(focus, fury, damage grids, spells, feats) removed.

Interfaces in `src/ai/types.ts` and `src/ai/decider.ts` are FROZEN at M4a. Bodies in `eval`, `threat`, `moves` and
`policies` are owned by the build agents listed in section 11.

## 1. Inputs and the rules boundary
- A decider receives only `view(state, seat)`, the open `PendingDecision` and `legalActions` (spec 00 s4, s7). It
  never sees the raw state and never touches `state.rng`.
- The AI never re-derives a rule. Every number comes from `src/engine/query.ts` (`hitOdds`, `expectedDamage`,
  `killOdds`, `rangeBand`, `coverFor`) and `dice.ts` (`skillOdds`), plus the option rows the engine already put in
  `pending.context` (for example `shoot.target` lists `pHit` per target and band).
- `query.*` takes a `GameState`. `src/ai/world.ts` builds a **query shim** from the view (`queryState`): the view's
  models, terrain, clouds, scenario and pending, game defaults for the rest, a fake rng, and an `activation` naming
  `pending.context.modelId` when there is one. The shim is only ever read by `query.*` and by the dry-run check; it is
  never applied for real.
- Legality of parameterised answers (`move.to`, `melee.slide` paths) comes from `ctx.accepts(action)`. On the main
  thread and in the bench the host passes a dry-run of the real engine (`gameStore.preview`, `apply(...).ok`); in
  the worker it is `shimAccepts` (the owning module's `resolve` on the shim). The shim check is close but not exact,
  so the host re-validates every answer and falls back (section 8).
- Objective play needs markers, round and scores, which `PlayerView` does not carry yet. `ViewExtras` in
  `src/ai/types.ts` names the additive fields the AI reads when they appear (round, maxRounds, scenarioId, markers
  with hidden faces redacted, seat scores). Until the engine adds them, objective scoring returns 0.

## 2. Tiers
| Tier | What it is | Key parameters (`TIERS` in `types.ts`) |
|---|---|---|
| `random` | The placeholder bot from M3: uniform over legal answers, favours attacks and moving, never wastes a turn when it has a choice, fills move paths by bisection. | none |
| `easy` | The utility AI with noise and short sight: no threat lookahead, no cover weighting, greedy target choice, takes the first acceptable move. | noise 0.2, wThreat 0, wCover 0.3, moveSamples 16 |
| `normal` | The full utility AI: threat map, cover and LoS, objective value, kill-first focus fire, luck and reaction policy. | noise 0, wThreat 0.6, wCover 1, moveSamples 40 |

Tier parameters can be tuned from the bench without code changes: `AI_TUNE="normal.wThreat=0.8,easy.noise=0.3"`.

## 3. Decision kinds and policies
`createAiDecider(tier, opts)` dispatches on `pending.kind` to `POLICIES[kind]` in `policies.ts`. A policy returns an
`Action` or `null`; `null` means "no opinion" and the decider uses the random policy. Kinds the engine raises today:

| Kind | Policy | What it decides |
|---|---|---|
| `turn.start` | `pickOnly` | Start the round (single option). |
| `turn.first` | `firstTurn` | Who goes first: take the first turn when we have a kill or objective available now (best attack value or objective value above a threshold), else make the opponent commit first. |
| `turn.ready` | `readyModel` | Which Unready model to Ready (activation choice, section 4). |
| `turn.choose` | `useOrPass` | Use the Ready models or pass. Pass only when every Ready model's best plan is worth less than waiting (no attack, no objective, and it is out of enemy reach). |
| `turn.pick` | `pickModel` | Which Ready model to Use next (activation choice, section 4). |
| `turn.activation` | `activationMenu` | The action menu: move, shoot, throw, charge, close combat, prepare, items, search, scenario actions, end (section 5). |
| `move.path` | `movePath` | The destination for a move (`move.to` with a `path`) or cancel (section 6). |
| `shoot.target`, `throw.target` | `pickTarget` | Target and band from the engine's rows (section 7). |
| `shoot.luck`, `throw.luck`, `melee.luck` | `useLuck` | Spend a luck token on a reroll or keep it (section 7.4). |
| `charge.marker` | `chargeDie` | Black (damage) or green (accuracy) charge die: green when pHit is below 0.6, else black. |
| `battleCry.push` | `battleCryPush` | Shove and follow when the end spot scores better than staying (cover, objective, out of other threats). |
| `melee.slide` | `slide` | Slide path after close combat, or stay (an empty slide). |
| `react.offer` | `reaction` | Take a reaction or pass (section 7.3). |
| `item.choose` | `itemBranch` | Which branch of a choose-one item. Prefer healing when damaged, else the first. |
| `search.found` | `keepFound` | Keep or leave a found item: keep unless it is junk the model cannot use. |

New kinds need a policy entry or they fall back to random; the bench reports fallbacks per kind.

## 4. Activation choice (`turn.ready`, `turn.pick`)
For each candidate model compute `activationValue(model)` = the best value of its plan this activation (best attack
value reachable after at most one move, or objective value), plus urgency:
- +urgency when it is threatened now (high `threatAt` at its current spot) and could act first (shoot the threat or
  get out of reach),
- +urgency when it is engaged (close combat is cheap and free attacks punish waiting),
- -value when it is far from everything (it can wait; moving it later reveals less).
Normal Readies the model with the highest value; easy adds noise. Reading the opponent's last turn is not needed:
alternation is cheap and the threat map is recomputed every decision.

## 5. Action menu (`turn.activation`)
Score every menu option, then pick the best. Option families and their value:
- **Shoot / Throw (`shoot.begin`, `throw.begin`)**: best `attackValue` over targets for that weapon (section 7). A
  critical option is worth taking when the crit adds kill odds.
- **Charge (`charge.go`)**: kill odds and expected damage of the following close combat with the charge die, minus the
  exposure of the end spot. Charge is preferred over shooting when the target's armor makes shooting weak.
- **Close combat (`melee.attack`)**: `attackValue` with band melee.
- **Move (`move.go`)**: the value of the best destination (section 6) minus the value of standing still. Taking a Move
  first and attacking with the second Action is planned per activation: the plan (`AiMemory.plan`) records the
  intended sequence so the second menu does not re-plan from scratch.
- **Prepare (`prepare.go`)**: worth `wPrepare` x the chance an enemy triggers it (enemies within two Awareness lengths
  that have not been Used) when nothing better is on offer. Never with actions that could attack.
- **Items (`item.use`)**: healing when damage >= half Health; chems or buffs before an attack that they improve (the
  engine's odds after the item, when query exposes it; else a flat value). Drop and pick up only for scenario objects.
- **Search / Expertise / scenario actions**: objective value (section 9).
- **End (`turn.end`)**: 0. Shake off stun and put out fire are taken whenever offered and nothing kills now.

## 6. Move destination search (`moves.ts`)
- Candidates: fan out from the model at the allowance in `pending.context` (`inches + baseInches`) along bearings to
  each enemy, each objective and cover pieces, at several radii (`moveSamples` points total), plus the current spot.
  Every candidate is pulled back to its farthest accepted point by bisection on `ctx.accepts` (the M3 bot method).
- Score each end spot with `positionValue`: best attack value from there next Action (range band and LoS from
  `query.rangeBand` / `hitOdds` with the model moved there in the shim), minus `wThreat` x threat at the spot, plus
  `wCover` x cover against the nearest threats (`query.coverFor`), plus objective value, plus a survival term for
  damaged models (distance from threats).
- Never end a move off the table unless the scenario rewards leaving (objective value says so).
- Withdrawing from close combat is scored with the free attacks it provokes (`killOdds` of each engaged enemy).

## 7. Targets, weapons and reactions
### 7.1 Attack value
`attackValue(attacker, target, opts)` = `expectedDamage * pHit / healthLeft * modelValue(target)` + `wKill * killOdds *
modelValue(target)`, where `modelValue` is the target's cost (unit record) scaled by its threat to us. Kill odds
dominate: a likely kill on a cheap model beats chip damage on a big one. All three numbers come from `query`.
### 7.2 Target and weapon choice
The weapon is chosen at the menu (`shoot.begin` carries `weaponUid`); the target and band at `shoot.target` from the
engine's rows. Score each row with `attackValue` for that band. Focus fire: +bonus for targets already damaged.
### 7.3 Reactions and Prepare (`react.offer`)
Take a reaction when its value (an attack's `attackValue`, or a move out of a charge lane that lowers threat) beats
holding the marker; otherwise pass. Easy always takes an attack reaction and passes the rest.
### 7.4 Luck and rerolls
Spend a luck token when the reroll turns a miss into a hit on an attack whose kill odds after the reroll are at least
0.25, or to save a model from removal; otherwise keep it. Easy spends it on any failed attack.

## 8. Determinism, fallback and safety
- Randomness: `rng = deriveSeed(seed, pending.id, tier)`; used for tie breaks and easy's noise only. The same view,
  pending, legal list and seed always give the same answer.
- Every answer is checked before it is returned: it must match a legal option template (`matchesOption`) and, if it
  carries a path, pass `ctx.accepts`. Otherwise the decider answers with the random policy and counts a fallback.
- A policy that throws is caught; the decider falls back and records the error in `AiMemory.stats.errors`.
- `AiMemory` keeps per-seat state across decisions (activation plan, stuck models, stats). It lives in the decider
  instance; the worker keys it by `memoryKey`.

## 9. Scoring summary
`Score = {value, parts}`. Parts (all in "model-cost" units so they add): `damage`, `kill`, `threat` (negative),
`cover`, `objective`, `survival`, `tempo` (prepare, readiness). Weights come from the tier. `parts` is for debugging
and the bench; only `value` decides.
- **Threat map** (`threat.ts`): for each enemy model, its reach next turn (move + weapon long range, or charge colour
  for melee) and, for a point P and one of our models, the expected damage and kill odds the enemies could deal there
  (`query` with the enemy moved into reach in the shim). Built once per decision; cheap reach checks first, then
  `query` only for enemies in reach.
- **Objective value**: per scenario marker or zone in `ViewExtras.markers`, value x 1/(1 + distance) for models that
  can interact; holding an object counts while the holder survives.

## 10. Time budget
- Per decision: `AI_MS` (`process.env.AI_MS` in node, `import.meta.env.VITE_AI_MS` in the browser), default 150 ms.
  `ctx.deadline = now + budget`. Move search and threat queries check `timeUp(ctx)` and return the best so far.
- The client bot driver keeps its own wall-clock timeout and watchdog (botDriver.ts); the worker keeps the UI smooth.

## 11. Worker and client wiring
`src/ai/worker.ts`: a Web Worker host. Request `{type:'decide', id, view, pending, legal, tier, seed, memoryKey}` ->
`{type:'action', id, action, ms, fallback}` or `{type:'error', id, message}`. The worker loads the edition bundle once.
`handleRequest(req, bundle)` is the pure core so node tests can call it. The client wraps it as a `BotBrain` and
installs it with `setBotBrain` (botDriver.ts), with a main-thread fallback when workers are unavailable.

## 12. Benchmark (`npm run bench:ai`)
`tsx tools/ai-bench.ts --games N --seed s --a normal --b random --scenarios box-1,box-2,box-3,box-4,box-5`.
Game g plays scenario `scenarios[g % k]`, with A on seat `A` for even g and seat `B` for odd g. Prints one JSON line
`{games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors, fallbacks, unfinished}`.
Gates (M4):
- normal beats random in at least 95% of 100 games across box-1..5 with alternating seats;
- easy beats random in at least 75%;
- errors (rejections that the fallback could not recover, throws, stalls) are 0;
- mean ms per decision under the default budget; max under 4 x the budget.
Win rate counts draws as non-wins.
