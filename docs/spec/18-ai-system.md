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
  AI cards (owner) or the paid AI card deck PDF; until then M4 uses placeholder matrices marked
  `source: "placeholder"` (see RULINGs).
