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
| `battleCry.escape` | `battleCryEscape` | Back away from a winning charger only when it probably kills the defender (section 13.2). |
| `damage.dying` | `dyingAction` | Take a free attack from an eliminated model, never a free move (section 13.2). |
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
`{games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors, fallbacks, hardStops, unfinished}`.
`fallbacks` counts null or rejected policy answers replaced by the random policy and is deterministic for a seed (and for
`--kinds`, which only adds timing). `hardStops` counts decisions stopped by the wall-clock safety limit (`ctx.work.hard`) and is the
only count that depends on machine speed; read the determinism gate from `fallbacks`, never from `hardStops`.
Gates (M4):
- normal beats random in at least 95% of 100 games across box-1..5 with alternating seats;
- easy beats random in at least 75%;
- errors (rejections that the fallback could not recover, throws, stalls) are 0;
- mean ms per decision under the default budget; max under 4 x the budget.
Win rate counts draws as non-wins.

## 13. Objective play (M4h)
`src/ai/objectives.ts` turns what a scenario rewards into numbers the eval already understands. It reads the scenario
record, the view's markers (objects are open information, `view()` keeps their faces) and the round. The bot infers its
scenario side from the record and its own models; nothing hidden is read and no rules number is computed here.

### 13.1 Goals and the eval
- `objectiveValue(model, spot)` sums `goalValue` over `goalsFor(model)` for box-1, box-2 and box-4 (other scenarios keep the
  generic marker pull). A goal is a spot with a share of the model's worth: full contact value when the engine counts base contact (`touchingMarker`, half an inch of the base edge),
  fading linearly to nothing at 24 in. `tier.wObjective` still scales it in `positionValue` and `activationValue`.
- **box-1 suits**: a Brotherhood model without power armor is pulled to every unclaimed, unbroken suit it may claim
  (`claimableSuits`); `scenario.claim` scores 1.5 x the suit's cost (`suitValue`) in the activation menu.
- **box-4 tower**: every model is pulled to the tower (the count of models touching it decides at the end of round 6). The pull
  grows with the round; the defenders start high because three held turns call their reserve. On the last round the share
  doubles and `attackFactor` scales an attack by its target: 1.6 at the tower, 0.15 away from it (1.3 and 0.5 one round earlier),
  because only shots that thin the models at the tower still matter.
- **box-2 nuke**: a hit on the carrier, or on a model within Orange of the nuke, rolls the red die and a 1 sets it off (a draw). P(1) is read from the edition's armor die faces (4 of 12 in `data/1e/dice.json`), and "near" is the `nuke-blast` rule's `near` ruler read through the engine's `inchesOf`.
  `attackValue` charges `nukeRisk` = pHit x P(1 on the armor die) x 0.9 x the bot's surviving cost x `nukeCaution`, and `positionValue` charges
  `nukeExposure` for ending within Orange of it where an enemy can hit. Caution fades for the attackers as round 9 nears (a draw
  beats the loss their timer brings). From four rounds out the attackers also pull toward a loose nuke and value picking it up
  (`nukePickupValue`); the defenders value it negatively (they win by leaving it alone).
- **Closing rounds**: `urgency` (box-1, 0 until 30 percent of the rounds are gone, 1 on the last) halves the threat weight and
  raises the approach weights by up to 2.5 times, so the bot hunts the last model standing.
- **Heroes**: an enemy that is a unique model (the Sole Survivor, Dogmeat) counts 3 x its cost as a target in `modelValue`, so fire
  is focused on it. Our own heroes are not inflated (that made them hang back: box-2 attackers dropped from 90 to 82 percent).
  Box-1 seat A, 384 games: 58.6 percent wins without, 64.8 with.

### 13.2 Late decision kinds
- `battleCry.escape` (BC-006): back away only when the charger probably kills the defender (kill odds >= 0.3), the defender is
  the worse melee fighter, and a gun beats staying; otherwise stand.
- `damage.dying` (DMG-005): the model is lost either way, so any free attack (shoot, throw, melee, charge) it can make is taken,
  scored on the shim with the model stood back up; a free move or drop is declined.

### 13.3 Cost budget
The wall clock is only a safety stop. `src/ai/budget.ts` counts deterministic cost: each `odds.ts` cache miss costs
`1 + terrain pieces / 6` (line of sight walks every piece) and each dry run of an answer costs 15. `timeUp` also reports true
once a decision has spent `MISS_PER_MS x budget` (7 x 150 = 1050) units. This replaced 600 ms outliers in the school (box-3)
with a worst case near 120 ms in a single process.

### 13.4 Known limits
- The engine does not credit a model that walks off the table with the nuke or a book: `removeModel` marks it dead and drops
  the carried marker at its start, so `markerGone` never sees it. The bot therefore never plans to carry anything off; box-2 and
  box-3 are won by elimination, or in box-2 by outlasting the defenders' round-9 timer.
- Box-1 is won only by wiping the other side out in six rounds (the timeout-points ruling is withdrawn). Against the Sole Survivor
  (7 Health, 3 armor) the Brotherhood need about 20 attacks at a 55 percent hit rate and land about 20, so roughly a third of
  games end as draws with the Sole Survivor still standing.

### 13.5 Bench numbers (normal vs random, 2026-10-17)
- Easy vs random, 30 games seed s (2026-10-17, after the s13.7 fixes): 27 wins, 3 losses, 0 draws, 0 unfinished (90 percent), 0 fallbacks.
  Before them it was 27 / 2 / 0 with 1 unfinished (box-3 game 26 ran to the round cap, a Super Mutant stuck in a nav pocket, see 13.7).
  Normal vs random, same 30 games: 29 wins, 0 losses, 1 draw (96.7 percent), 0 fallbacks, 0 hard stops.
- Default bench (box-1 Brotherhood, box-2 attackers, box-3 defenders, box-4 attackers; see below), 288 games: 87.8 percent wins,
  3.5 percent losses, 8.7 percent draws, 0 fallbacks, mean 28 ms per decision with 12 jobs on a busy machine (about 9 ms in one
  process). 30-game runs: seed s 25 wins / 2 losses / 3 draws, seed t2 24 / 1 / 5.
- Both seats of each scenario, 192 games each: box-1 A 65 percent (draws), B 99; box-2 A 92, B 89; box-3 A 89, B 98; box-4 A 92, B 95.
- That default bench aliased seats (scenario g mod 4 with seat A on even games, so box-1 was always the Brotherhood). It now swaps seats after
  each pass over the scenario list (`--seatmix cycle`, the default), so every scenario is played from both seats; `--seatmix legacy` restores the
  old pairing and `--seat` still pins one side.

### 13.6 Balanced bench, stall breaker, what did not help (M4h round 3)
- Balanced bench (all eight scenario-and-seat pairs, normal vs random, 0 fallbacks, 0 errors): 480 games seed F 88.7 percent wins, 4.4 percent
  losses, 6.5 percent draws, 2 unfinished, mean 31 ms per decision with 12 jobs (8.5 ms in one process). Seeds Q and R: 91.0 and 88.1.
  30-game runs: seed s 29 / 0 / 1 (wins / losses / draws), seed t2 27 / 0 / 3. Non-wins by cause over 480 games: box-1 Brotherhood draws
  (a few enemies survive six rounds, 19 of 60 games as the Brotherhood), box-4 defenders losing the tower count (7 of 60), box-2 attackers
  (9 of 60: the round-9 timer, a hit setting the nuke off, wipe-outs), box-2 defenders (6 of 60 draws: a hit near the nuke, mostly the
  random attackers' fire), box-3 defenders (6 of 60 including 2 stalls).
- `stall` (box-3 only): the game has no round limit, so a lone wounded bot model used to sit out of a stalemate for ever (up to 3 unfinished games
  in 480). From round 8 the stall term ramps to 1 over six rounds and feeds `urgency` (approach weights up); on top of that the threat term loses
  up to 45 percent of its weight and the survival bonus fades out. Win rate is unchanged within noise (287 vs 285 of 300); the
  stalemates now end, some as losses (BOT-011).
- Tried and dropped (300-game seeds on box-1 seat A, 71 percent baseline, +-3 points of noise): wThreat 0.1 and 0.6, wKill 4, wSurvival 0.2, noise
  0.1, wObjective 0 and 8, wApproach 0.02 and 0.3, wCover 0.8, moveSamples 80, urgency start 0 and 0.1, threat cut 0.9, approach boost 3,
  discounting the suit claim by the rounds left. Box-2 attackers with urgency tied to the round-9 deadline: 257 of 300 either way. The
  weights sit on a flat optimum; further gains need new behaviour, not new numbers.
- Carry-off bot play was built and measured on a scratch copy of the engine with the fix below applied (pick up the nuke or a book, walk it over the
  nearest edge, 100 x worth for an exit within reach, pull toward the edge for the carrier, only unguarded markers). It never won a game:
  the defenders sit on the nuke, carriers died or set it off, box-2 attackers fell from 86 to 74 percent with 16 draws, and box-3 books were
  never taken out because elimination ends the game first. The code was removed. With the fix the attackers' own win becomes possible but
  the bot needs a plan that thins the guards first; do not simply raise the pull.
- Engine fix that unblocks carry-off wins (not applied, engine is outside the AI's files): in movement.ts moveTo, before
  `removeModel(s, bundle, id, 'left the table')`, set `props.offTable: true` on every marker whose `carriedBy` is the exiting model.
  scenario.ts `markerGone` then fires for box-2 and box-3.
- Box-1 stays capped near 65 to 70 percent against random (elimination in six rounds, no points rule). Hero fire and a wider hunt do not move it.

### 13.7 Facts, not ids; hard stops; the stall pull (review fixes)
- Nothing in `objectives.ts` is keyed on `box-1..4` any more. `sceneOf` reads the record: suit goals are markers whose props carry a
  drawn `suit` (or a `suitPool`) and a `claimBy` side; the hold goal is the object a `tower-control` or `control` rule counts contact
  with (or a victory entry `{kind: 'hold', marker}`); the blast rule is `nuke-blast` on a scenario with a `props.carry` marker; the
  side that wins by waiting is the victory entry that carries its own round (`victory[].round`) or, for a scenario with no round limit,
  names one in its text; `urgency` applies to a round-limited scenario with no hold marker (an elimination game); `stall` applies to any
  scenario with neither a round limit nor a deadline. Optional structured victory fields (`kind`: elimination | carryOff | hold,
  `marker`, `round`) are read when the record has them; the data schema does not carry them yet, so the facts above are the fallback.
- Rules numbers come from the engine: contact is `touchingMarker` and the marker radius `markerRadius` (default 40 mm) from
  `src/engine/scenarios/rules.ts`, the blast range is `inchesOf(near)`, the detonation chance is the share of 1s on `dice.armor`, and a
  suit's worth is its armor record's cost (no fallback).
- `AiStats.hardStops` (and `byKind[k].hard`) count wall-clock stops; `fallbacks` no longer includes them. The bench prints both.
- `pickBest` treats a non-finite score as -Infinity, and `spotScore` adds the walk pull only when both walks are finite. With no live
  enemy on the table (box-4 once the on-table defenders are down and the reserve is still off table) every spot score was NaN: easy
  fell back to random (36 fallbacks in 8 games) and normal could not choose `move.go`.
- Stall: past round 8 a scenario with no clock adds `W_STALL_PULL` x stall to the pull toward the nearest enemy, for every tier (easy's
  `wThreat` is 0, so fading the threat terms alone gave it no push). The stuck easy game was in fact a nav pocket: a model standing in a
  grid cell marked blocked beside a wall could not take the diagonal out, so `routeDown` returned null; the first step out of a blocked cell
  may now cut the corner.
