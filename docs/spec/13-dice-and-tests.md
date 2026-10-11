# 13 Dice and skill tests

Face tables are 1st-edition data and live in `data/<edition>/dice.json` (see `20`); the engine never
hard-codes them. Values below were read from the rendered dice sheet (DICE) and cross-checked with
RoP s2.4 p10-11. Our dice art is original; only face semantics are ported.

## 1. Skill die (white d20) (DICE; RoP s2.4 p11)
| Face(s) | Result | Counts as | Count |
|---|---|---|---|
| 1-2 | AP icon | value 1, +1 AP | 2 |
| 3-5 | CP icon | value 1, +1 CP if the test succeeds | 3 |
| 6,7,8,9 | 2,3,4,5 | that value | 1 each |
| 10-11 | 6 | 6 | 2 |
| 12-13 | 7 | 7 | 2 |
| 14-15 | 8 | 8 | 2 |
| 16 | 9 | 9 | 1 |
| 17 | 10 | 10 | 1 |
| 18-19 | X | automatic fail | 2 |
| 20 | X + AP | automatic fail, +1 AP | 1 |
Raw value distribution: P(v=1)=5/20, v=2..5 1/20 each, 6,7,8 2/20 each, 9,10 1/20 each, X 3/20.

## 2. Effect dice and armor die (d12) (DICE; RoP s2.4 p11)
Icons: DMG (+1 damage), AR (reduce armor 1), ACC-n (skill roll -n), BOT (bottle), STAR, BLAST, blank.
| Die | Faces (count) |
|---|---|
| Black damage | DMG x5, DMG+DMG x1, blank x3, BOT x1, AR x1, ACC-1 x1 |
| Green accuracy | ACC-1 x4, ACC-2 x2, ACC-3 x1, AR x2, DMG x2, BOT x1 |
| Yellow armor reduction | AR x5, AR+AR x1, blank x2, BOT x1, ACC-1 x2, DMG x1 |
| Blue special | BOT x4, BOT+BOT x2, BOT+STAR x1, STAR x2, STAR+STAR x1, BLAST x2 |
| Red armor | 1 x4, 2 x3, 3 x3, 4 x2 |
Per-face order (face 1..12) is in the data file for replays: black 1-5 DMG, 6 DMG2, 7-9 blank, 10 BOT,
11 AR, 12 ACC-1; green 1-4 ACC-1, 5-6 ACC-2, 7 ACC-3, 8-9 AR, 10-11 DMG, 12 BOT; yellow 1-5 AR, 6 AR2,
7-8 blank, 9 BOT, 10-11 ACC-1, 12 DMG; blue 1-4 BOT, 5-6 BOT2, 7 BOT+STAR, 8-9 STAR, 10 STAR2,
11-12 BLAST; red 1-4 "1", 5-7 "2", 8-10 "3", 11-12 "4".
The red die doubles as a d4-like randomiser (1-4) for shooting into melee and similar (RoP s2.13 p26).

## 3. Skill test (RoP s2.4 p10; ERR p.8 FAQ)
1. Pick the skill: weapon card skill icon, or the named skill/attribute. No icon on the unit card = no
   test possible (attribute tests are always allowed).
2. SV = attribute value on the icon's row + all modifiers summed (speciality +2, cover -2 each, quick
   action -2, injured arm -2, frozen -2, shooting into melee +2, stunned target in melee +2, items).
3. Build the dice pool: weapon dice for the range band (melee weapons have one set), plus charge
   markers, outnumbered (+1 green), Str >= 7 with a melee weapon (+1 black), bonus tokens (max 1 per
   colour per test), mods, perks, leaders, critical extras. Cap each colour at 4; extras are dropped
   before rolling.
4. Roll. Result = skill die value + all ACC-n icons on any effect die.
5. X = fail regardless of modifiers. If SV < 1, only a CP face succeeds. Otherwise success iff result <= SV.
6. On failure, ignore all effect icons except AP on the skill die. On success, apply effect icons.
7. AP from the skill die count only on the model's own Actions (not Quick Actions/reactions).
- Choosing to fail: declared before rolling; the skill die is set to X, effect dice still roll, no
  rerolls or changes.
- Opposed test: each side tests its own SV; the higher successful result wins; a winner must succeed;
  tie goes to the higher SV (Battle Cry ties go to the charger); all fail = no winner (RoP p10, p36;
  ERR p.9).

## 4. Special effects (RoP s2.9 p20; ERR p.1)
- A weapon/item lists effects with an icon cost (white icons) and an outcome (black icons/text). Each
  rolled icon pays once. A circled N limits uses per attack. Unused icons are lost after the attack and
  never move to another model or weapon.
- Errata: each weapon/item effect can trigger once per Action (the old multi-use example is void), and
  the "bottles" row in the sample table means 2 bottles.
- "If target takes damage" = damage remains after the armor roll (incl. damage to Power Armor).
- Effects inside the Critical Meter only work on Critical Attacks.

## 5. Criticals (RoP s6.3 p53; s5.1 p44)
- Only models with a Critical icon (Heroic card, unit or ability) gain CP. Multiple icons add nothing.
- A successful attack on a non-friendly model with a weapon that has a Critical Meter adds 1 CP to that
  weapon; each CP face rolled adds 1 more. Hits on friendlies or objects add none. Thrown weapons never
  use criticals.
- At its Critical Rating the meter is full; extra CP are lost. CP stay on the weapon between activations.
- A weapon full at the start of an attack may make a Critical Attack: no skill die (auto success, Luck
  Dodge cannot change it), roll the critical's dice, apply the critical's damage/effects, gain no CP,
  then remove CP equal to the rating. Range, LoS and restrictions still apply. A meter filled during
  an attack cannot be spent in that attack. Primed weapons are not criticals (RoP s5.3 p47).

## 6. Luck (RoP s6.2 p52)
Units with a Luck icon get Luck tokens equal to Luc at set-up (never more). Declare the use, then flip
(50% luck face); the token is discarded either way. One token per result.
- Accurate: after a failed test (not X): luck face gives -2 to the result.
- Dodge: target, after a successful attack and before damage: luck face gives +2 to the attacker's
  result (can turn a hit into a miss). Not against criticals. After a successful Dodge the attacker
  cannot use Luck on that roll.
- Tough: after damage is computed post-armor, before applying: luck face reduces it by 1.
- Extra Critical: after a successful attack: luck face adds 1 CP to the weapon.
- Ready-but-unused model eliminated: flip a luck token from supply; luck face grants one free Quick
  Action before removal; healing cannot save it (RoP s2.9 p20; ERR p.9).
- Engine RNG: a luck flip is a fair coin from the seeded RNG (rng.ts), logged as an event.

## 7. Odds the UI must show (engine-computed, never by the UI)
Compute exactly, not by sampling:
1. Hit chance: enumerate the 20 skill faces x the joint distribution of the summed ACC modifier from
   the pool (DP over dice: modifier range 0..-12). Apply the X and SV<1 rules. Optionally show the
   chance after an Accurate luck flip (0.5 x P(fail but result <= SV+2, not X)).
2. Damage given hit: DP over the pool's DMG and AR sums conditioned on success (correlated through ACC
   faces, so DP on the joint state (acc, dmg, ar)). Then for armor rating R and strong S:
   effective R' = max(0, R + coverBonus - AR); blocked = (armor roll <= R' ? roll : 0) + S; damage =
   max(0, total - blocked). Armor roll P(<=1)=4/12, P(<=2)=7/12, P(<=3)=10/12, P(<=4)=1.
3. Kill chance = P(damage applied >= Health - current tokens), including Power Armor absorption.
4. Show: hit %, expected damage, kill %, effect-dice pool, SV breakdown (base, each modifier).
Reference: no-modifier hit chance by SV: 1:25%, 2:30, 3:35, 4:40, 5:45, 6:55, 7:65, 8:75, 9:80, 10+:85%.
