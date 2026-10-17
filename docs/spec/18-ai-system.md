# 18 Official AI system (solo / co-op)

Primary source: the Campaign Handbook, section 3 "Against the Wasteland" (CH p8-16) and the AI scenarios
(CH p40-42). CH overrides the dev blog and every earlier fan-source ruling. Extra detail comes from the AI
Handbook (AIH), the Co-op Handbook (COOP), the errata/FAQ (ERR, which overrides older text), the response
flowcharts (AIRF) and the Red Rocket sheet (RR). Page cites are book pages (CH PDF page = book page + 2).
Every gap is a RULING in `docs/needs-rules-check.md`. Our own versus bot (M4a, spec 30) is separate; both
deciders receive only `view(state, seat)` and `legalActions`.

## 1. Set-up, turns and settings (CH p8-9; AIH s2; ERR p.16)
### 1.1 AI force set-up (CH p8)
1. Each AI unit card is laid out with its AI card beside it, face up.
2. Each AI unit takes every weapon and item its AI card lists as standard equipment (ignore item minimum
   requirements; ERR p.3).
3. One Number Token per AI model is placed at random on the unit cards (one per model in the unit; which
   number lands where does not matter).
4. The AI Markers carrying the same numbers go face down, are shuffled and are deployed as the scenario says.
5. Each marker is flipped and the model with that number is placed beside it.
6. The Number Tokens go face down into a pool; the pool decides activation order.

### 1.2 Rounds and the AI turn (CH p8)
- Turn order is the normal one: the players' side and the AI alternate turns, starting with the Advantage
  holder (Advantage allocated as usual). The Advantage belongs to the player team or the AI as a whole (COOP s2).
- On the AI's turn: draw one Number Token from the pool, make the matching model Ready, then activate every
  Ready AI model, lowest number first. The AI never chooses "use none".
- When an AI model finishes its activation its Readiness marker turns to Used.

### 1.3 Objective and Subject (CH p9; AIH s2)
The scenario gives the AI a task: an Objective plus its Subject X, written `Objective [X]`. Both may change
during the scenario (phases and switches, section 8.6).

| Objective | What the O response does (CH p13) |
|---|---|
| Defeat [X] | Perform A, with X as the only target considered. |
| Protect [X] | Perform D. |
| Go To [X] | Perform M. Already within Move of X: move onto / into contact with X (ERR p.16). |
| Use [X] | 1. Interact to use X. 2. Move into base contact with X. 3. Perform M. |
| None | No O activity exists, so the model performs A (RULING). |

- If a model cannot carry out O at all it performs A instead (CH p13): for example the Objective needs a skill
  the model lacks, the Subject model is already removed, or the AI side already holds the item.
- Subject kinds (CH p9): a specific location (a point, terminal, Searchable marker), a general location (a table
  edge, a building), specific models (friendly to protect, enemy to attack) or general models (any, nearest,
  strongest). Subjects can be dynamic and are re-resolved before every Action (AIH s2).
- Different AI models may hold different settings, and settings may change per model (AIH s2).
- Use covers Interact (pick up, flip a switch), Use Expertise tests and ranged checks such as peeking at an
  Investigation marker (AIH s2). Interact needs base contact and no engagement.
- CH p9 lets a tabletop player swap in another listed behaviour when one feels wrong. We do not: the engine always
  follows the procedure (owner rule, no house rules).

## 2. The AI card (CH p8, p10, p50; ERR p.18)
One card per unit. Fields (schema `AiCardDef`, spec 20):
- Standard equipment, printed under the unit name. An underlined weapon name is the preferred weapon (CH p11).
- A matrix of up to three Situation columns by three blue-die rows.
  - Column header = Situation type (usually Health remaining, sometimes friendly models nearby or a scenario
    condition) and value per column. Read left to right; the first column that is true is used; if none is true
    the last column is used (CH p10).
  - Rows are keyed by the icons on one blue Special Effect die: bottles, stars, blast. The bottle + star face
    counts as one star (CH p10). The blue die has 12 faces: 1 bottle x4, 2 bottles x2, bottle+star x1, 1 star x2,
    2 stars x1, blast x2 (DICE).
  - Each cell holds one Response letter (A, M, O, F, D; later cards add S, ERR p.16). Shaded = Reckless,
    unshaded = Careful, underlined = stays engaged (CH p10).
  - To the right of each row, one Method icon per icon count: a knife = Close Combat, a crosshair = Ranged
    (CH p11, p50). So 1 bottle and 2 bottles can carry different Methods.
- Action Point use, at the foot of some cards (CH p16, p50).
- Target Priority list: up to three ordered tie-breakers (CH p12).

### 2.1 Target priorities (CH p12; ERR p.16)
Apply the list in order, each step keeping only the best candidates, until one remains; if several remain after
the last step, pick at random (seeded, logged).

| Priority | Keeps |
|---|---|
| Nearest | Moving: fewest Moves needed (difficult terrain counts). Shooting: shortest shot. |
| Weakest | Least Health remaining. |
| Largest | Highest maximum Health (damage ignored). |
| Wounded | Most damage taken. |
| Healthiest | Most Health remaining. |
| Vulnerable | Lowest Armor; base armor only, Strong ignored (ERR p.16). |
| Slowest | Shortest Move. |
| Fastest | Longest Charge. |
| Best Chance | Fewest penalties / biggest bonus on the Skill test. |
| Prepared | Prepared before not Prepared (RULING: holding a Reaction marker). |
| Spent | Used before Ready. |
| Importance | Nearest to the Subject, the Subject itself excluded (ERR p.16). |
| Not Engaged | Unengaged models only. |
| Engaged | Engaged models only. |
| Capable | Models able to perform their own side's Objective (e.g. has Computers for a hacking Objective). |
| Leader | Any model holding a Leader card (ERR p.16; later cards). |

- If the Objective is to defeat player model(s) and this is the last AI model left, it picks the Subject before
  using its list (CH p12).
- A card may name a preferred class first (Raider: enemies engaged with exactly one friendly). Run the list over
  that class, and only if none is possible over everyone else (ERR p.16).

## 3. Activating an AI model and the Responses (CH p10-14; AIRF)
### 3.1 Activation (CH p10, p16)
1. Roll one blue die once, at the start of the activation; find the row (icon kind) and the Method (icon count).
2. Find the column from the model's current Situation.
3. The cell gives the Response, the Attitude (Reckless / Careful) and the stay-engaged flag. These stay fixed for
   the whole activation.
4. The model takes two Actions. Before each one it walks its activity list again from the top, because targets
   may have died, moved or been pushed back.
5. When done, the Readiness marker turns to Used.

### 3.2 Attitude summary (CH p10)
| Activity | Reckless | Careful |
|---|---|---|
| Move | Straight line; cover ignored. | Go at least half the Move, then weigh going further against ending in the safest spot (cover, least chance of being attacked). |
| Close Combat | - | At every tie-break step, engaged enemies before unengaged ones. |
| Shoot | Engaged enemies are valid targets. | Engaged enemies are not valid targets. |
| Push Back | Follows up. | Does not follow up (but see 4.2). |

### 3.3 A - Attack (CH p11-12; AIRF)
1. Method: the icon to the right of the rolled row for that icon count.
2. Weapon: among weapons that can perform the Method, use the preferred (underlined) one; if it cannot be used
   (an unloaded Slow Firing weapon) use another that can. No suitable weapon: no attack. The Improvised Weapon is
   used only when nothing better is available (ERR p.16).
3. Walk the activity list for the Method; do the first activity that is possible this Action.

Close Combat list:
1. Close Combat.
2. Charge into engagement.
3. Move into engagement.
4. Move to within Charge distance of an enemy.
5. Move to within Move distance of an enemy.
6. Move towards an enemy.
7. Perform O instead.
- Charge bonus: the marker colour (black or green) is decided at random (seeded).
- Battle Cry is always used when able; its Push Back is followed up only when Reckless.

Ranged list:
1. Shoot.
2. Move so an enemy will be in range to Shoot next Action; once a Shoot is possible, stop no closer than Yellow
   to the target.
3. Move towards an enemy.
4. Perform O instead.
- Reckless: engaged and unengaged enemies are valid targets. Careful: engaged enemies are not.
- A Careful model never uses an area weapon in Close Combat, because its target counts as engaged (ERR p.16).

### 3.4 M - Move (CH p13; ERR p.16)
1. Within Move of the Subject: perform O instead (for Go To this means move onto the Subject, ERR p.16).
2. Otherwise Move towards the Subject without engaging anyone. Reckless: straight, ignoring cover. Careful: at
   least half the Move, stopping as far along as possible while ending in the safest spot.
3. Several Subjects: head for the Nearest (fewest Moves, difficult terrain counted).

### 3.5 O - Objective (CH p13)
See the table in 1.3. Defeat performs A with the Subject as the only possible target; Protect performs D; Go To
performs M; Use runs Interact, then move into contact, then M. No way to do O: perform A.

### 3.6 F - Fall Back (CH p13; ERR p.16)
Perform M with the model's own initial deployment point as the Subject. Already there: Careful moves to a better
protected spot in its deployment zone if one exists; otherwise (or Reckless) it performs A without leaving the
point, so it does not attack if attacking needs a move (ERR p.16).

### 3.7 D - Defend (CH p14; AIRF)
1. Pretend the model stands where the Subject is and is unengaged; walk the A list for its Method there and note
   the enemy it would pick (its own priority list).
2. Perform A against that enemy only, skipping the "perform O instead" step.
3. If that enemy cannot be attacked or engaged with this Action, Move towards the Subject instead.
- Careful: if the Subject is engaged with that enemy, a Ranged-method model switches to the Close Combat Method.

### 3.8 S - Strike (ERR p.16; later cards)
Perform A only if the model will attack and/or engage someone this activation; otherwise perform M.

## 4. Other rules for AI play (CH p15-16; AIRF)
### 4.1 Engaged AI models (CH p15)
- Underlined cell: the model stays engaged and performs A with the Close Combat Method instead.
- Not underlined: it breaks off if its activity needs that, even if it gives free attacks. With Response A:
  - Close Combat Method: check step 3 (Move into engagement) first. Already engaged with the target it would pick:
    Close Combat it (step 1). Not engaged with that target: Move to engage it.
  - Ranged Method: skip the list and perform the "Move so it can Shoot next Action" step to get clear. If it would
    not normally need to move, it still moves out of engagement to a spot from which it can still shoot that
    target, no harder a shot, and safer where possible.

### 4.2 Push Back follow-up (CH p15; ERR p.16)
Take the first rule that applies:
1. The model Charged this activation: always follow up.
2. The printed cell is A: follow up only with the Close Combat Method.
3. The printed cell is O or D: follow up only when Reckless.
Rules 2-3 read the printed letter even when the model is performing a different Response (an O performed as A
still uses rule 3). A Careful model that did not follow up may not make a base-contact attack on that enemy again
this activation (ERR p.16). Printed M, F or S: RULING.

### 4.3 Moving (CH p15)
- Careful models always try to end in cover.
- Slide: after an AI Close Combat attack, if the engaged enemy could Slide round the AI model into base contact with
  the Subject (or with an AI model touching the Subject), the AI model Slides as far from the Subject as it can
  instead, never off the table.

### 4.4 Weapon effects, Action Points, Heroic (CH p16; AIRF)
- Weapon effects: when icons can be spent several ways, pick the effect that uses the most icons per use, and keep
  spending until nothing more can be bought.
- Action Points: ignored unless the AI card shows an AP use; then only for the effects shown, spent after the two
  Actions, as many as held. When removing damage, regular damage goes before radiation.
- Heroic AI model: roll V.A.T.S. at activation start; any AP rolled gives one Quick Action after the two Actions,
  run as the same Response (AIRF). It earns CP as usual and always makes a Critical Attack when the weapon has
  enough CP. It uses Luck whenever it can, but only for Tough (reduce damage by 1).
- Abilities and optional equipment: used where they help the AI most or hurt the players most (ERR p.16).

### 4.5 Re-evaluation examples (CH p16)
Every Action is assessed fresh with the same die result: a Shoot that kills its target is followed by a move to a
new target; a Healthiest priority can switch targets after the first shot; an engaged Go To model with an
underlined cell attacks, and if the Careful attack pushes the enemy away it moves on with its second Action.

## 5. AI force building (AIH s3; ERR p.3)
Equal caps to the player force unless the scenario says otherwise. Equip standard equipment first (before the
player builds). Extra value only via, per model: one armor or clothing, Strong Armor boost tokens (6 caps each), one
mod, one chem (taken as soon as useful), one food and drink card (used when useful). Item minimums are ignored.

## 6. Co-op and team rules (COOP s2-s4)
- Turns alternate between the player team and the AI. The team readies ONE model between them per team turn;
  then each player decides alone to use all or none of their own Ready models; if several players activate they
  interleave models freely.
- Reactions: player models react only to Actions of the opposing (AI) side; any model being hit is a trigger for
  anyone.
- Searchable and Investigation info may be shared inside the team unless the scenario forbids it.
- The team wins or loses together; caps are split freely; card copies are unlimited if paid for; items may be lent
  across players with the owner's consent; one Leader per player affecting only that player's models; each player
  is their own faction; no duplicate Unique models in the team; each player's Quest must differ.
- Team vs team: two human teams under these rules, no AI.

## 7. Engine contract
- The official AI decider implements this procedure from `view(state, aiSeat)` and `legalActions` only. All AI
  randomness (number token draws, the blue die, the charge marker flip, ties) comes from `deriveSeed`, never
  `Math.random` and never `state.rng`.
- Every decision is logged (AI-015, section 8.7).
- Starter AI cards: Super Mutant, Brute and Sole Survivor Day One are real (CH p8, p10, p50). The others are
  placeholder matrices tagged `source: "placeholder"` until the physical cards are entered (RULING).

## 8. Implementation (M4b)
### 8.1 Module layout
```
src/ai/official/
  types.ts       AiSettings, ResolvedSubject, ResolvedCell, TargetRanking, AiDecisionLog, OfficialAiOpts (frozen M4b)
  decider.ts     createOfficialAiDecider(opts): OfficialAiDecider (Decider + decideSync + log); dispatch by pending.kind
  matrix.ts      blue-die face -> row/method, column predicates, resolveCell (sections 2, 3.1)
  targeting.ts   validTargets, rankTargets (2.1), defendThreat (3.7), weapon choice (3.3)
  responses.ts   activity lists for A/M/O/F/D/S (3.3-3.8), engaged rules (4.1), push back (4.2), slide (4.3)
  objectives.ts  settingsFor(model): scenario ai block + phase + switches -> AiSettings; resolveSubject
data/1e/ai/starter.json   AiCardDef per starter unit
```
The official decider reuses the M4a helpers in `src/ai/world.ts` (queryState, shimAccepts, live, enemiesOf) and the
engine `query.*` numbers; it never computes a rules number itself.

### 8.2 Seat model
- An AI game has one AI seat (it plays the scenario side that has an `ai` block) and a player team of one or two
  human seats sharing the other side. `SeatState.side` already maps seats to sides; seats with the same side form a
  team. Seat ids: `ai`, `p1`, `p2`.
- `createGame` gains (engine TODO) `controllers?: Record<SeatId, 'human' | 'bot' | 'official'>`; the client routes
  each seat's decisions to the human UI, the M4a bot or `createOfficialAiDecider`.

### 8.3 How AI turns run
- The engine keeps the normal turn flow and raises `turn.ready`, `turn.choose` and `turn.pick` to the AI seat like
  any seat. The official decider answers them by the CH procedure, so the AI never passes:
  - `turn.ready`: draw one Number Token = pick uniformly among the AI's Unready models with
    `deriveSeed(seed, 'ai-token', pending.id)`.
  - `turn.choose`: always `turn.useAll`.
  - `turn.pick`: the Ready model with the lowest Number.
- Numbers: the engine assigns `model.tokens.aiNumber` (1..n) at set-up with a `roll()` permutation (engine TODO);
  until it does, the decider derives the same permutation from `deriveSeed(seed, 'ai-numbers')` over the sorted AI
  model ids. AI markers deploy face down and shuffled (CH p8); `deploy.*` places the model at its marker.
- The blue die: rolled once per activation by the decider with `deriveSeed(seed, 'ai-blue', round, modelId)` (a
  model activates once per round, so the pair is unique and survives a reload). The face is logged.
- During the activation the decider answers `turn.activation` (which menu action), then the follow-up decisions
  (`move.path`, `shoot.target`, `throw.target`, `charge.*`, `melee.*`, `battleCry.push`, `melee.slide`, `item.*`,
  `expertise.*`), re-walking the activity list before each Action (3.1). Activity "none possible" -> `turn.end`.
- `react.offer` to the AI seat: decline. No activity list ever chooses Prepare, so AI models only hold a Reaction
  marker from some other effect (RULING).
- Luck decisions: accept only the Tough use (reduce damage by 1) for Heroic models; decline rerolls (4.4).

### 8.4 Co-op team readying (COOP-001, COOP-002; engine TODO in turnflow)
- Turns alternate by side, not by seat: player team turn, AI turn, and so on; the Advantage is held by a side.
- Team turn: `turn.ready` is raised to the team's first seat in `seatOrder` with `context.team = [seats]` and
  options covering every Unready model of the team (either human may answer at the local table).
- Then `turn.choose` is raised once per team seat that has Ready models, in seat order (use all / use none, each
  independent).
- Then `turn.pick` is raised to the first team seat with every Ready model of the seats that chose use all, so the
  players interleave freely; each activation's own decisions go to the model's owner.
- Reaction triggers compare sides: a team model reacts only to AI Actions, or to any model being hit.

### 8.5 Object targets (SHOT-003; RR p2; AIH s4; CH p42)
- Scenario objects that can be attacked are `MarkerState` with `kind: 'object'` and `props`:
  `{ health, damage, armor: { physical, energy, radiation }, shootable, meleeable, radImmune?, cover?,
  impassable?, blocksLos?, moves? }`. Red Rocket: health 10, armor 1/1/1, rad immune, shootable, meleeable in base
  contact. Missile sled: health 5, armor 3/1/X, Cover, Impassable, does not block LoS, moves Red at the end of every
  turn. Escort the Brahmin (CH p42): the Brahmin (a model or a marker) has 10 Health and armor 1 of each type.
- Engine TODO: `shoot.target` and `melee.*` options may carry `targetMarkerId`; base contact with an object is not an
  engagement (no free attacks, no Push Back); damage applies the object's armor; the object is removed at
  damage >= health and the scenario module checks victory.
- AI: objects are only targeted through O (Defeat [object] makes it the only target). The A response ranks enemy
  models only. Protect [object] runs D from the object's position.

### 8.6 Settings, phases and switches as scenario data
- `ScenarioDef.sides[].ai = { objective, subject, switches? }` (frozen schema). Objectives in data are
  `defeat | protect | goTo | use`; the decider also accepts `none` (CH p9) through a switch `set`.
- Subject strings are resolved by `objectives.resolveSubject`: a marker id or face (`red-rocket`, `helmet`), a model
  selector (`any-enemy`, `player-leader`, `model-with-item`), an edge (`entry-edge`), or a route key
  (`next-route-marker`). Unknown subjects resolve to none, and O falls back to A (CH p13).
- `switches[].set` may hold `{ objective, subject }`, `{ phase }`, or per-model `{ who, objective, subject }`
  (Smash and Grab: carrier Go To [entry edge], the rest Protect [carrier]).
- State lives in model tokens so `types.ts` is unchanged: `tokens.aiPhase` (latched phase number, written by the
  scenario module), `tokens.aiRoute` (patrol index). Switch predicates that are plain state ("an AI model holds the
  helmet") are evaluated live by the decider before every Action; latching switches ("became aware of a trigger")
  are evaluated by the engine scenario module after each Action and at activation start, and write `aiPhase`.
- Scenario overrides such as "do not roll, perform O" (Break-in patrols, Escaped Tech hounds) are a switch that sets
  `{ forceResponse: 'O' }`.
  A later switch with `forceResponse: 'matrix'` clears it (patrol over). A model's `tokens.aiRouteId` (set at deployment from the
  side's `groups[].route`) makes `next-route-marker` walk only the markers with that `props.route.id`, in `step` order; the
  scenario module advances `tokens.aiRoute` when the model touches the marker it is heading for and sets `tokens.aiAware`
  (spec 17 s4.2). Looking at an investigation marker needs no skill for Use.

### 8.7 AI decision log (AI-015)
Each answer from the official decider produces one `AiDecisionLog` (shape in `src/ai/official/types.ts`): decision id
and kind, round, model, blue face and icons, row, column index and label, cell (response, Reckless, stay engaged),
Method, weapon, settings, the Response actually performed and the chain that led there (e.g. `O > defeat > A`), the
activity chosen (e.g. `cc.charge`), the target and its `TargetRanking` (each priority step with candidate values),
and any tie with its seed key. The decider keeps the logs in memory (tests read them) and attaches the newest one
to its answer as `action.aiLog`; engine TODO: `apply` moves `aiLog` into an `{ type: 'ai.decision', ... }` event and
strips it before the owner validates the action.

### 8.9 Additive engine contracts used by the AI (M4b follow-up)
Offered by the engine only when it is built; until then the decider's branches are dormant (RULINGs in needs-rules-check.md).
- `expertise.use` with `targetId` (a model, no `markerId`): Use [Presence] on the Tech. `ap.spend` with `effect` `removeDamage` | `removeRad`: AP on a card effect.
- Luck decisions (`shoot.luck`, `throw.luck`, `melee.luck`) with `context.ask: 'tough'` and `context.targetId`: Tough (LUCK-004).
- Live now: model token `noFollow:<enemyId>` (melee.ts) bars a Careful AI model from Close Combat on that enemy for the rest of the activation.
