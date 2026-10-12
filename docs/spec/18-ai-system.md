# 18 Official AI system (solo / co-op)

The core AI procedure lives in the Campaign Handbook (CH p8-12), which has no free copy. This spec is
assembled from AIH, COOP, ERR (AI FAQ and AI card versions), BLOG, RoP Appendix 1 and RR. Every
gap carries a RULING in `docs/needs-rules-check.md`. Our own versus bot (M4) is separate and is not
specified here; both receive only `view(state, seat)`.

## 1. Settings: Objective [Subject] (AIH s2; ERR p.16-18)
| Objective | Behaviour when the model performs its O response |
|---|---|
| Defeat [S] | Attack the Subject(s), or move to a spot from which it can attack them. Subjects can be models or objects, one or many, filtered (e.g. any Mutant Hound). |
| Go To [S] | Only moves toward S; never attacks on the way. If S is within Move, it moves onto/into contact with S. Sequences of Go To form routes/patrols (looping). |
| Use [S] | Moves toward S and uses it when able: Use Expertise test, plain Interact (pick up, flip a switch), or at range (peek an I marker within Awareness+LoS). |
| Protect [S] | Uses the Defend response (section 3). |
- Completion limits (e.g. after N kills) and switches (fixed phase changes, or "while X is true",
  per model or per force) are scenario data; switches are evaluated before each AI model's activation
  and after each Action (RULING).
- Subjects can be dynamic (nearest, least damaged, nearest to exit): re-evaluate per Action.
- Different models in one AI force may hold different settings.

## 2. AI card (BLOG; ERR p.16-18; AIH s3)
One card per unit type. Fields:
- `standardEquipment`: items the AI model always carries (ignore item minimum requirements; ERR p.3).
- `matrix`: up to 3 situation columns x 3 rows.
  - Column chosen by the model's situation, usually damage taken / Health left, sometimes other
    tests (e.g. number of nearby friendlies, being near a Dog Handler). Column labels are ranges such as
    "1-2", "3-4" (ERR p.18 card fixes).
  - Row chosen by rolling one blue special die; each row lists the blue-die icon(s) that select it
    (icons are unevenly weighted: bottles 7/12 faces with a bottle, stars 4/12, blasts 2/12).
  - Each cell: one response letter (A, M, O, F, D; later cards also S = Strike), `reckless` when shaded,
    `stayEngaged` when underlined.
  - Each row ends with combat-method icons (ranged vs close combat) choosing Shoot or Charge/Close
    Combat when both are possible.
- `targetPriority`: up to 3 ordered factors, e.g. Nearest, Vulnerable (lowest base armor, Strong
  ignored), Leader (any model with a Leader card), Importance (enemy nearest the Subject, Subject
  excluded), Prepared (has a Reaction marker; printed "Ready" on old cards), Most damaged, Highest
  max Health. Some cards prefer a class first (Raider: enemies engaged with exactly 1 friendly) then run
  the list again for all others (ERR p.16).
- Cards may carry special lines (e.g. "After F response ...").

## 3. Responses (BLOG; ERR p.16; AIH s2)
| Code | Response | Procedure |
|---|---|---|
| A | Attack | Pick target by priority list among enemies it can attack this activation; attack with the best weapon (Improvised only if nothing better or the only weapon is an empty slow-firing one). If no target is attackable, move to a position from which it can attack the top-priority target. |
| M | Move | Move toward the Objective's Subject without attacking or engaging. |
| O | Objective | Perform the current Objective (table in section 1). |
| F | Fall Back | Move toward its deployment point / entry point. Already there: Careful moves to a better-protected spot in its zone if one exists; otherwise (or Reckless) performs A without moving. |
| D | Defend | Judge which enemy it would attack if it stood where the protected Subject is (own priority list); attack that enemy if able this activation, else move to stay close to the Subject (and keep moving with it). |
| S | Strike | Perform A only if it will attack and/or engage this activation; otherwise perform M. |
Modifiers:
- Careful (unshaded): never shoots into a melee containing friendlies, never uses area weapons in
  close combat, avoids leaving engagement; a Careful Push Back that cannot follow up forbids a later
  base-contact attack on that enemy that activation (ERR p.16).
- Reckless (shaded): may shoot into melee and accept friendly hits.
- stayEngaged (underlined): an engaged model stays in combat whatever the response; otherwise it may
  leave (giving free attacks).
- Abilities and optional equipment: used when most useful to the AI / most harmful to players (ERR p.16).

## 4. AI turn procedure (COOP s2; RoP App.1 p54; Fan-source for steps 1-3)
1. Each AI model has a numbered AI marker; a face-down pool holds one number token per AI model alive
   and Unready.
2. On the AI's turn, draw one token, make that model Ready, then Use all Ready AI models in ascending
   number order (the AI never passes).
3. When all AI models are Used the AI takes no more turns this round.
4. For each AI activation, per Action (2 Actions): evaluate objective switches, find the column, roll
   the blue die for the row, read the cell, resolve the response; AP/Quick Actions are spent where they
   advance the same response. Scenario overrides ("do not roll, always O") skip the roll.
5. AI reactions: an AI model with a Reaction marker reacts to the first trigger it is aware of with
   its current response's attack if legal, else a move (RULING).
6. Ties anywhere (equal distance, equal priority): use the seeded RNG; log the tie.
- Advantage belongs to the player team or the AI as a whole; normal rules for who gets it.

## 5. AI force building (AIH s3; ERR p.3-4)
Equal caps to the player force unless the scenario says otherwise. Equip AI standard equipment first.
Extra value only via: one armor or clothing, Strong Armor boost tokens (6 caps each), one mod, one
chem (used as soon as useful), one food and drink (used when useful). Ignore item minimum requirements.

## 6. Co-op and team rules (COOP s2-s4)
- The player team readies ONE model per team turn; then each player independently chooses to Use all
  or none of their own Ready models; if several players activate, they interleave freely.
- Reactions only to opposing-side (AI) Actions; any model hit by an attack is a trigger for anyone.
- Marker info may be shared between team players unless the scenario forbids it.
- Team wins/loses together; caps split freely; card copies unlimited if paid; items shareable across
  players with the owner's consent; one Leader per player affecting only that player's models; each
  player is their own faction; no duplicate Unique models across the team; different Quests each.
- Team vs team: two human teams under these rules.

## 7. Engine contract
- `AiDecider` implements the deterministic procedure above from `view(state, aiSeat)`; all randomness
  (number tokens, blue die, ties) from the seeded RNG; every choice emits a log event with the column,
  row, cell and target ranking so tests can assert them (AI-* checklist).
- AI card data for the starter units (Super Mutant, Brute, Aviator, Mutant Hound, Settler, Enslaved
  Tech, Sole Survivor, Dogmeat, Aspirant Goddard, Deathclaw) must be entered from the physical starter
  AI cards (owner) or the paid AI card deck PDF; until then M4b uses our own matrices whose `source` carries
  the status `Unsourced` (see 8.8 R-23 and 8.10).

## 8. Implementation (M4b)
Code: `src/ai/official/` (`types.ts`, `decider.ts` frozen at M4b; `procedure.ts`, `responses.ts`, `targeting.ts`).
Status tags: Confirmed = AIH, COOP, ERR, the CH p16 photo (R2 #2-7) and the reference card photo (R2 #8-10);
Fan-source = `ai_response_flowcharts.pdf` (FC p1-p5); Unsourced = our ruling. Numbered rulings R-1..R-24 (8.8)
are mirrored as `RULING:` lines in `docs/needs-rules-check.md`. Where this section and section 4 differ, this
section wins: section 4 step 4 rolled per Action, the CH p16 photo says one roll per activation.

### 8.1 Contract
- `createOfficialAiDecider(bundle, opts): OfficialAiDecider` implements the engine `Decider`. Inputs are only
  `view(state, seat)`, the open `PendingDecision` and `legalActions`; it never reads `GameState` or `state.rng`.
- All AI randomness (number token draw, blue die, charge-token flip, ties) comes from
  `deriveSeed(opts.seed, <purpose>, <key>)`. Keys are stable game facts (round, model id, decision id), so a
  replay or a worker restart reproduces the same rolls.
- Visibility: every returned Action carries `aiTrace: AiTrace` (an extra field; option matching treats extra
  fields as parameters and `state.log` keeps it). The trace lists the token draw, the blue-die face and index,
  column, row and cell, the resolved activity, the target ranking, ties and objective switches. The client shows
  AI rolls from `aiTrace`. An engine `AiDecision` event copied from it by `apply.ts` is a requested additive
  change (frozen file, see issues).
- A decision kind the procedure does not answer (or answers illegally) falls back to the M4a `normal` policy,
  then to random. Each fallback is a trace entry and a stats count.

### 8.2 Settings
- Source order: `opts.settings` (force-wide or per model) > the scenario's `sides[].ai` for `opts.scenarioId`
  and the seat's side > `Defeat [any-enemy]` (R-1).
- `resolveSubject` reads a Subject string as: `any-enemy`, `any-model`, `self`, a unit id (enemy models of that
  unit), a marker id or marker `props.name`, `nearest-<marker kind>`, else a named hook in `SUBJECT_HOOKS`
  (`next-route-marker`, `any enemy seen this or last round`). Unknown -> `any-enemy`, traced (R-2).
- Switches: scenario `when` text is prose, so switch predicates are hooks keyed by scenario id in
  `SWITCH_HOOKS`. They are checked before each AI activation and after each finished Action (existing RULING),
  may apply per model or force-wide, and revert while their predicate is false (AIH s2 example 1).
- Completion limits: once met, the setting becomes `Defeat [any-enemy]` unless a switch says otherwise (R-3).

### 8.3 Turn procedure (decision kinds)
| Step | Engine decision | AI answer | Status |
|---|---|---|---|
| 1. Numbers | none | Each AI model gets a fixed number: the seat's models sorted by id, 1-based, kept all game (removed models keep theirs). `opts.numbers` overrides. | Unsourced (R-4) |
| 2. Ready | `turn.ready` | Draw a token from the Unready AI models: a uniform pick over the options with `deriveSeed(seed,'token',pending.id)`. | Fan-source |
| 3. Use | `turn.choose` | Always `turn.useAll`; the AI never passes. | Fan-source |
| 4. Order | `turn.pick` | Lowest number among the Ready options. | Fan-source |
| 5. Activation start | first `turn.activation` of a model | Build the `ActivationPlan`: setting (after switches), column, blue die, row, cell. One roll per activation. | Confirmed (CH p16) |
| 6. Each Action | `turn.activation` | Re-run switches, resolve the cell's response into one `Activity` (8.5) from the current position and targets, map it to a menu option. | Confirmed (CH p16 examples) |
| 7. Sub-decisions | `move.path`, `shoot.target`, `throw.target`, `charge.marker`, `battleCry.push`, `melee.slide`, `*.luck`, `react.offer`, `item.choose`, `search.found` | Answered from the current `Activity` (8.6). | see 8.6 |
| 8. Activation end | `turn.end` | Both Actions spent and no Quick Action due, or no legal activity (R-5). | Unsourced |
- Activation key: `${round}:${modelId}` (a model is Used once per round). Round = `view.round` when the view
  carries it, else the M4a `roundOf(memory, view)` counter.
- Column: the first column, left to right, whose predicate holds (R-6). `columns[].when.damageTaken: [lo, hi]`
  counts damage + rad tokens; `when.other` is a small grammar: `health:N+` or `health:A-B` (Health left = max
  Health incl. Heroic +1, minus damage and rad) or `code:<hook>` for situation columns (the Institute column keyed
  on the O response being Use or Go To). Printed labels are Health-left ranges, so card data uses `health:`.
- Column and row stay fixed for the activation; damage taken mid-activation does not change the cell (R-7).
- Row: one blue die over the 12 faces of `dice.json` `effect.blue`; face key `BOT`, `BOT2`, `BOT+STAR`, `STAR`,
  `STAR2` or `BLAST`. Row = the first row whose `blueIcons` lists the key, else the row holding the face's first
  icon (`BOT2`, `BOT+STAR` -> `BOT`; `STAR2` -> `STAR`) (R-8).
- Scenario overrides that skip the roll (Break-in patrols) set `forced: 'O'`; the trace shows `face: null` (AIH s4).
- Cell: response letter, attitude (shaded = `reckless`, else `careful`), `stayEngaged` (underlined), and the
  row's combat `method` list.

### 8.4 Co-op and team seats (COOP s2)
- The AI is one seat. The player team readies ONE model per team turn; then each player's use-all-or-none choice
  is independent and activations may interleave. Until the engine has team turns, co-op runs as one human seat
  that controls every player model (R-9); multi-seat teams are an engine change (issues).
- Advantage belongs to the team as a whole or to the AI.
- Player models react only to AI Actions, plus any model being hit; the AI reacts to player Actions as usual.
- Team vs team is the same team-turn rule on both sides, with no AI.

### 8.5 Responses -> activities (per Action)
`resolveResponse(ctx, plan)` returns one `Activity {kind, as, targetId?, subjectId?, goal?, reason}`; `as` is the
letter actually performed (S becomes A or M; O becomes A, D, M or a Use step).
- Engaged first (FC p2, Fan-source): engaged and the cell is `stayEngaged` -> `closeCombat`. Not underlined: A with
  close method -> `closeCombat`; otherwise `disengage` (the engine resolves free attacks) and continue on the
  ranged branch. A Careful model that pushed back without following may not make a base-contact attack on that
  enemy again this activation (ERR p.16).
- A (reference card, R2 #8, Confirmed): method from the row's icons; if both are listed and both possible,
  ranged first (R-10).
  - Close: `closeCombat` > `charge` > `moveEngage` > `moveToCharge` (end within Charge of an enemy) >
    `moveToMove` (end within Move) > `moveToward` > O (FC p1).
  - Ranged: `shoot`/`throw` at the top-ranked valid target > `moveToRange` (a spot that can shoot it next
    Action, no closer than Yellow) > `moveToward` > O (FC p5).
  - Careful never targets an enemy engaged with a friendly; Reckless may (R2 #9). Careful never uses an area
    weapon in close combat (ERR p.16).
  - Weapon: best expected damage (`query.expectedDamage`); Improvised only when nothing else can attack, e.g. an
    empty slow-firing weapon (ERR p.16). Critical whenever the meter allows (CH p16). Weapon special effects are
    auto-applied by the engine (existing RULING).
- M (FC p3, Fan-source): toward the nearest Subject, never attacking or engaging. Subject within Move -> O instead
  (ERR p.16). Reckless: shortest path, cover ignored. Careful: at least half Move, ending at the best-covered
  candidate spot against enemies in LoS (R-11).
- O (reference card R2 #10 Confirmed; FC p4): Defeat -> A with the Subject as the only target set; Protect -> D;
  Go To -> M (onto the Subject when in reach); Use -> `interact` (Interact, Use Expertise, or peek from range)
  when able, else `moveContact`, else M. Nothing left to pursue -> A (FC p4).
- D (AIH s2 Confirmed; FC p3): put the model virtually at the Subject, rank enemies with its own list from there
  (`rankTargets(..., { from })`), attack the top one as if not engaged; Careful with the Subject engaged to that
  enemy -> close combat; cannot attack or engage it this Action -> `moveToward` the Subject (R-12).
- F (ERR p.16 Confirmed): move toward the deployment point (R-13). Already there: Careful moves to a better-covered
  spot in its zone if any; else A without moving.
- S (ERR p.16 Confirmed): A only if this activation can attack or engage (an attack/charge option now, or an enemy
  within Move + Charge); else M.
- No activity possible: Prepare if offered, else end the activation (R-5).

### 8.6 Sub-decisions
| Kind | Answer | Status |
|---|---|---|
| `move.path` | Path to the activity's goal via M4a nav (`navRoute`): contact point, range spot, cover spot, Subject or deployment point. | Unsourced (R-14) |
| `shoot.target`, `throw.target` | Top of `rankTargets` among the offered rows, with that row's band. | Confirmed |
| `charge.marker` | Seeded coin: `deriveSeed(seed,'chargeFlip',pending.id)`. | Fan-source (R-15) |
| `battleCry.push` | Push and follow only when Reckless and (A with close method, or O/D); else hold. | Fan-source (R-16) |
| `melee.slide` | Slide if it reaches base contact with the Subject or denies an enemy contact with it; else stay. | Fan-source |
| `*.luck` | Keep on `accurate` and `crit`; use on `dodge` (nearest engine stand-in for Tough). | CH p16 intent, mapping R-17 |
| `react.offer` | An attack reaction if legal, else a move toward the activity goal, else pass. | Unsourced (existing RULING) |
| `item.choose` | Healing when damaged, else the first branch. | Confirmed intent (ERR p.16) |
| `search.found` | Keep. | Unsourced (R-18) |
| Quick Actions | Only V.A.T.S. AP on a Heroic AI model (one Quick Action after its two Actions) or a card-printed AP use; it repeats the activation's response. | Confirmed (CH p16, R-24) |
| Chems, food | Healing at activation start when damaged; boosts right before an attack. | Confirmed (AIH s3), timing R-19 |

### 8.7 Target priority factors (`targeting.ts`)
The card's list is applied in order; each factor's key (lower wins) breaks the ties of the one before; a final
tie uses the seeded RNG and is traced. `preferFirst` (e.g. engaged with exactly one friendly) ranks that set first,
then everyone else (ERR p.16). Alias: `ready` = `prepared` (ERR p.18).
| Factor | Ranks first | Status |
|---|---|---|
| nearest | shortest edge-to-edge distance | Confirmed |
| vulnerable | lowest base armor for the chosen weapon's damage type, Strong ignored | Confirmed (ERR p.16); type pick R-20 |
| leader | holds a Leader card | Confirmed (ERR p.16) |
| importance | nearest to the Subject, Subject excluded | Confirmed (ERR p.16) |
| prepared | holds a Reaction marker | Confirmed |
| wounded | most damage + rad tokens | Unsourced (R-21) |
| weakest | least Health left | Unsourced (R-21) |
| healthiest | most Health left | Unsourced (R-21) |
| largest | largest base, then highest max Health | Unsourced (R-21) |
| highest | most rad tokens | Unsourced (R-21) |
| capable | highest expected damage against this AI model next turn (M4a threat) | Unsourced (R-22) |
| bestChance | highest hit chance with the chosen weapon (`query.hitOdds`) | Unsourced (R-22) |
| anything else | ignored, traced | Unsourced |

### 8.8 Rulings (mirror into `docs/needs-rules-check.md`)
- R-1 No scenario setting -> Defeat [any-enemy] (AIH "wipe out" example). Unsourced.
- R-2 Unknown Subject -> any-enemy, traced. Unsourced.
- R-3 Completion limit met -> Defeat [any-enemy] unless a switch applies. Unsourced.
- R-4 AI marker numbers: the seat's models sorted by id, 1-based, fixed for the game. Unsourced.
- R-5 No legal activity for an Action -> Prepare if offered, else end the activation. Unsourced.
- R-6 Columns are tested left to right; the first match wins. Unsourced.
- R-7 Column and row fixed at activation start; per-Action re-evaluation changes only activity and target. Confirmed for the row (CH p16), Unsourced for the column.
- R-8 A blue face with no exact row key uses the row of its first icon. Unsourced.
- R-9 Co-op before engine team turns: one human seat controls all player models. Unsourced.
- R-10 Row lists both methods and both are possible -> ranged first. Unsourced.
- R-11 Careful M: at least half Move, end at best cover; Reckless: shortest path. Fan-source.
- R-12 D move ends as close to the Subject as the path allows. Unsourced.
- R-13 Deployment point = the model's first position seen this game (scenario data has no points yet). Unsourced.
- R-14 Paths from M4a nav; equal paths broken by the seeded RNG. Unsourced.
- R-15 Charge die colour from a seeded coin. Fan-source.
- R-16 Battle Cry push-and-follow only when Reckless and the follow test passes (the engine joins push and follow). Fan-source.
- R-17 Luck: use on dodge only (the engine has no Tough option). Unsourced.
- R-18 Found items are always kept. Unsourced.
- R-19 Healing items at activation start when damaged; boosts right before an attack. Unsourced.
- R-20 Vulnerable compares the armor of the chosen weapon's damage type (physical when unknown). Unsourced.
- R-21 wounded / weakest / healthiest / largest / highest keys as in 8.7 (Target Priorities card illegible, R2 #12). Unsourced.
- R-22 capable / bestChance keys as in 8.7. Unsourced.
- R-23 Starter AI matrices: Sole Survivor, Aviator, Aspirant Goddard, Super Mutant and Deathclaw are read from the R2 photos (Confirmed, medium confidence: cells, shading, underline, methods, gear). Settler, Enslaved Tech, Dogmeat, Mutant Hound, Brute and Day One are our own, built from each unit's card and the published card structure, `Unsourced` in `source`, swapped when the owner photographs the real cards.
- R-24 The AI never spends AP except V.A.T.S. Quick Actions (Heroic) and card-printed AP uses. Confirmed (CH p16).

### 8.9 Data plan
`data/1e/ai/<faction>.json` (`survivors.json`, `super-mutants.json`, `other.json`, `reference.json`), one
`AiCardDef` per unit: `id` `ai-<unitId>`, `columns[].when.other` in the `health:` grammar, three rows keyed
`BOT` / `STAR` / `BLAST` (with `BOT2`, `BOT+STAR`, `STAR2` listed on the row the card prints), `source` naming
the status. Generic reference cards (Attack, Objective and Defend, Move, Fall Back, Target Priorities) are
procedure, not data; `reference.json` holds only a `generic` fallback card (every cell A, careful, both methods,
priorities nearest) used for units with no card.

### 8.10 Tests (AI-* checklist)
AI-001 ready / use / pick order; AI-002 column and row from a fixed seed; AI-003..008 one per response; AI-009
Careful target filter; AI-010..012 priority factors; AI-015 trace on every Action; COOP-001 team readies one
model. Determinism: same seed and decisions -> identical action log.
