# 11 Turns, activation and actions

Rule IDs in brackets map to `12-rules-test-checklist.md`.

## 1. Turn procedure (RoP s2.6 p13; ERR p.8 FAQ)
1. The active player must mark exactly one Unready model Ready. [TURN-002]
2. Then choose: Use none of their Ready models (turn ends), or Use all of them, one at a time, in any
   order, from any units. Forced to Use all if every model of theirs now has a readiness marker. [TURN-003..005]
3. Each Used model resolves fully before the next starts; it cannot activate again this round even
   with Actions left over. A model counts as Used once it finishes all its Actions. [TURN-006]
4. Ready models left when the player ends a turn are flipped to Used (no carry-over). [TURN-007]
5. Players alternate turns. A player with every model Used takes no more turns; the other keeps
   taking turns until all of theirs are Used. Then the round ends and all markers are cleared. [TURN-008, TURN-009]
- Fast ability: may ready extra Fast models at the same time (ERR p.8 FAQ). Not in the starter set.
- Engine: `PendingDecision` for the active seat is `readyOne(modelId)` then `useAll | pass`.

## 2. Activation (RoP s2.6 p14; s3.3 p33; s4.4 p41; s5.3 p46; ERR p.2)
On activation start, in this order:
1. Discard the model's Reaction marker. [PREP-005]
2. Start-of-activation conditions: On Fire (1 regular damage, no armor roll, then flip luck: luck face
   puts it out), Poisoned (1 regular damage ignoring armor). [COND-*]
3. Item durations tick: fixed-effect cards with no counting tokens are discarded, others lose one
   token; diminishing cards slide one step. [ITEM-006, ITEM-007]
4. Slow-firing weapons flip to Loaded. [SHOT-005]
5. V.A.T.S.: roll 1 blue die, gain 1 AP per bottle icon (a bottle+star face counts its bottle). [AP-003]
Then up to TWO Actions in any mix (same Action twice allowed), plus Quick Actions bought with AP. A new
Action cannot start until the current one ends. No facing: models see and act in all directions.
Items may be used immediately before or after any Action (incl. a Reaction). Leftover AP are lost at
activation end. Frozen ends at activation end. [ACT-001..004, AP-006]

## 3. Actions
| Action | Summary | Ref |
|---|---|---|
| Move | Up to Move colour; see `14` for measuring, terrain, climbing. Also used for: placing a mine, putting out fire (Agi test), shaking off Stun. | RoP s2.7 p15; s5.3 p46; s5.4 p48 |
| Shoot | Pistol, Rifle or Heavy weapon at a target not engaged with the shooter. Needs skill icon, range, LoS. Max one heavy weapon fired per activation. | RoP s2.8 p16; ERR p.2 |
| Charge | Move up to Charge colour into base contact with an opposing model; must start unengaged and with LoS to that model; stops on contact; gains a Charge Bonus marker. | RoP s2.12 p23; ERR p.1 |
| Close Combat | Attack an opposing model you are engaged with, then optional Slide. | RoP s2.13 p24-25 |
| Use Expertise | Search, Computers, Lockpick or Presence skill test. | RoP s3.1 p28 |
| Prepare | Gain a Reaction marker (max 1). | RoP s4.4 p41 |
| Throw | Thrown weapon using the Throw skill; range = colour of the model's Throw icon. | RoP s5.1 p44 |
A model with no icon for a skill cannot test it (RoP s2.4 p10).

### Shoot detail (RoP s2.8 p16-18)
- Range bands short/long from the weapon card; pick effect dice of the band. If the target base sits in
  both bands, attacker picks. Some weapons have no long band, or are "Short only"/"Long only" for a rule.
- Cover and armor +1 per `14`. Targets can be models, objects or a point.
- Shooting at an engaged model: +2 SV; on a hit choose special effects, then assign 1-4 around the melee
  (target is 1; then other models in base contact with the target AND in the shooter's LoS; loop from
  the target until 1-4 are filled) and roll the armor die to pick who is hit. Same for area/thrown
  weapons aimed at engaged models; a miss scatters from the intended target. A shooter whose ability
  always hits the intended model gets no +2 (RoP s2.13 p26; ERR p.11 FAQ). [SHOT-006..008]
- Walked Fire: N separate shots per Shoot; each new shot may pick a target within the listed colour of
  the previous target; at most 1 CP and 1 AP gained per Shoot; each successive hit on the same target
  adds +1 armor-reduction icon (resets on miss or change); one armor boost token lost per hit; all
  reactions wait until the whole Action ends and only one trigger may be answered (RoP s5.3 p47; ERR p.10, p.12). [WPN-008]

## 4. Charge and close combat (RoP s2.12-2.13 p23-26; s4.1 p36; ERR p.1-2, p.9, p.12)
- Charge bonus: on completing charge movement place one marker, black or green; then Battle Cry if the
  model has it. A marker adds one die of its colour to a Close Combat attack against the charged model;
  two markers add one black and one green. Any other Action or Quick Action first discards them; they
  are also discarded after that attack. A Walked Fire weapon uses a bonus marker on the first roll only. [CHG-001..006]
- Battle Cry: opposed test, charger's Battle Cry skill vs defender's Resist Battle Cry (models with a
  coloured Battle Cry icon also resist; white icon = resist only; immunity icon = cannot be targeted).
  Highest successful roll wins; tie goes to the charger; both fail = nothing. Charger wins: the charge
  is not a trigger for the defender, the charger gets the second marker (total one black + one green),
  and may Push Back the defender up to its Battle Cry colour (may follow to stay in contact). Defender
  wins: the charger discards its marker and gets no push; the charge stays a trigger; the defender may
  use its Reaction to move out without giving a free attack. That Reaction needs a Reaction marker next to the defender and
  removes it (RoP p41). The engine asks at once with the pending kind `battleCry.escape` (stay listed first; see
  00-architecture s1 "Runtime bag and tokens"). Triggers resolve after the whole Battle Cry. [BC-001..006]
- Engaged: base-to-base with an opposing model. Engaged models may only make Close Combat attacks, only
  against models they are engaged with (RoP s2.13 p24).
- Close combat test uses the weapon's skill icon. Every model has an Improvised Weapon (melee skill, 1
  green die, 1 physical damage; never lost) unless its card says otherwise (RoP s2.13 p24 Hint 3). [CC-001]
- Strength bonus: unmodified attribute Str total >= 7 (after items/chems, not specialities) adds 1
  black die to melee-weapon attacks (RoP s2.13 p24; ERR p.13 FAQ). [CC-002]
- Outnumbered: a model engaged with 2+ opposing models gives attackers +1 green die (RoP p24). [CC-003]
- Ranged or thrown weapon in close combat: treated as one cover (-2 SV, target armor +1); weapons with
  short range minimum above zero cannot. Super Mutant faction models use Melee SV for this (penalties
  still apply). A ranged-weapon reaction against the model that charged you ignores these penalties
  for that one reaction (RoP p24, p41; CARDS p.15). [CC-004..006]
- Slide (part of the Close Combat Action): after the attack, a free reposition (we cap it at the
  model's Move colour, see RULING) that keeps every existing engagement and follows movement rules; may path through the base of the
  model just attacked if it ends legal; may add new engagements. Triggers resolve after the Slide.
  Order of resolution: damage, then Push Back, then Slide (RoP p25; ERR p.1, p.9, p.12). [CC-007, CC-008]
- Withdrawing: a Move out of engagement (never a Charge) gives each model it leaves a free Quick Action
  attack (-2) if that model is not engaged with anyone else, resolved after commitment and before the
  move. A free attack is not a trigger. The leaver's reaction-holders may still react after the move. [CC-009..011]
- Stunned while engaged: attackers get +2 SV; stunned models get no free attack (RoP p25). [COND-008]
- Push Back: straight line away (centre to centre), up to the colour given, per push; stops on contact
  with any model or blocking/cover terrain; no free attacks; a model forced over the table edge stays
  on and takes 1 regular damage ignoring armor (RoP s4.1 p36; s4.2 p39; ERR p.2). [CC-012, MOVE-010]

## 5. Quick Actions and AP (RoP s4.3 p40; ERR p.8, p.15)
- A Quick Action resolves as the same-named Action with: -2 SV if it tests a skill, or one ruler colour
  shorter if it moves. AP generated during a Quick Action are ignored. [AP-001, AP-002]
- AP sources: skill die AP faces (on the model's own Actions only, success or fail), V.A.T.S., cards.
  AP belong to one model, cannot transfer, vanish at activation end. [AP-003..006]
- Spending: 1 AP buys the Quick Action of one AP-use icon on the model's cards (Movement = Move or
  Charge; Attack = Shoot, Close Combat, Throw; Expertise; Prepare). Each icon once per activation.
  A chem's Shoot icon allows Shoot only, not ranged-in-close-combat. [AP-007, AP-008]

## 6. Prepare and reactions (RoP s4.4 p41-42; ERR p.2, p.8; CARDS p.14)
- Prepare (Action, or Quick Action via a Prepare AP icon) gives one Reaction marker; never more than
  one. It survives other Actions that activation; it is discarded at the model's next activation start
  or after it is used. Frozen models cannot Prepare. [PREP-001..006]
- Triggers: any opposing Action except Prepare, and any friendly model (incl. itself) being hit by an
  attack. Awareness needs LoS (attacks do not need LoS) and distance: within one Awareness length for
  any trigger; within two lengths for movements and attacks only. [PREP-007..009]
- A reaction is one Quick Action of the reacting player's choice, resolved after the triggering
  Action completes and before the next starts; anything inside the Action can be the trigger. Attack
  reactions may only target the model that caused the trigger, with LoS judged after its Action.
  An engaged model may only react to triggers from models it is engaged with, or Move after taking
  damage from any source. One reaction per trigger. When several models see one trigger, the owner
  declares all reactions first, then resolves them in any order. AP during reactions are not gained. [PREP-010..015]
- Turrets (not in starter set): see RoP s6.1 p51, out of scope for M2.

## 7. Throw (RoP s5.1 p44; s5.3 p47; ERR p.2, p.11)
Range is the thrower's Throw icon colour (single band). Targets, LoS and cover as shooting. Failed
test with a Scatter icon scatters before effects. Engaged throwers may only target engaged enemies.
Thrown weapons ignore criticals. Grenade-icon scatter collides along original target -> new point; other
scatter collides along firer -> new point. Molotov: 0 base damage; everything in Yellow catches fire and
takes the black/yellow icons; the target also takes the extra damage. [THR-001..005]

## 8. Use Expertise, Search and items on the table (RoP s3.1-3.2 p28-31; ERR p.9, p.14, p.16)
- Computers: hack terminals/safes while Interacting; an X locks that terminal for the rest of the
  current player's turn. Lockpick: lockboxes, doors. Search: find things while Interacting. Presence:
  unengaged, target within the Presence colour; effects come from unit cards. [EXP-001..004]
- "Use" on a card means an Action; "Test" means no Action but once per activation. [EXP-005]
- Investigation markers: face down. A player may peek at any marker that is at least partly within the
  Awareness colour of, and in LoS of, any of their models (activation state irrelevant), at any time
  except mid-move of their own model; no Action; keep it secret; may re-peek a marker already seen. [SRCH-001..003]
- Searchables: the activating model, unengaged and in base contact, may look before or after each of
  its Actions (no Action). Usually the player may decline and put it back; a red-backed underside forces
  interaction. Interacting reveals it; icons say which Use Expertise test (Lockpick, Search, Computers)
  is required and the success/failure outcome; trapped locks draw a Danger card on failure, then an item
  either way; danger icons force a Danger draw (with or without an item); blank = nothing; letters =
  scenario items. Resolved markers are discarded. [SRCH-004..008]
- Found items: draw from the Item deck; keep (held by that model only) or leave it face down tied to
  that marker for the next finder. Items gained in battle may be dropped/picked up before or after an
  Action (token touching base); starting items cannot be dropped or passed (ERR p.1, p.14). [ITEM-010]
- Strangers: a face-down marker; interacting draws a Stranger card, fixed for that marker (RoP p31).
- Cards requiring a test (e.g. Agi) need no Action. Re-draw = discard unresolved, draw anew (ERR p.8). [SRCH-009]
- Edge: no placing models on markers (ERR p.8 FAQ).

## 9. Using items (RoP s3.3 p32-34; ERR p.1-2, p.14)
- One limited-use item per Action or Quick Action. Limited-use items of the model's unit, or (if the
  user is unengaged) of any unengaged friendly model within Yellow and LoS, may be shared. [ITEM-001..003]
- Items needing no specific Action (chems, food, alcohol, most gear) take no Action. [ITEM-004]
- Durations: Instant; Fixed (N counting tokens; 0 = until next activation); Diminishing (single-model
  units only, one at a time, cannot end early). Addictive items roll the blue die when they end; a match
  with the card's addiction icon (bottle+star counts as star) applies the addicted side until cured. [ITEM-005..009]
- Cooked food: only if the card was equipped at battle start; Super Mutant faction always cooked. [ITEM-011]
- Robots, Creatures, Dogs: restrictions per their reference cards (ERR p.2-3, p.19). Dogs use no items
  except food and drink unless the item says so. [FORCE-012]
