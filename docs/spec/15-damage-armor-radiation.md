# 15 Damage, armor, radiation, health, conditions, healing

## 1. Damage pipeline (RoP s2.9 p19-20; s2.10 p21; s2.11 p22; ERR p.1, p.10)
For each damage type the attack deals (physical, energy, radiation; resolve each type separately):
1. Base damage = number next to the damage-type icon on the weapon (critical value if a Critical Attack).
2. Add DMG icons from the dice and effect outcomes (area + target extras accumulate, RoP s5.3 p47).
3. Luck Dodge window (before damage) has already passed; special effects are chosen.
4. Armor: if the target has a rating for that type, compute R = rating + cover bonus (+1 if any cover)
   + flat bonuses (e.g. chem "+1 all armor", not strong) - AR icons; floor 0. Roll the red die if R > 0:
   roll <= R blocks the rolled amount, else 0. Add the Strong bonus (fixed, unaffected by AR). Only one
   Strong bonus ever applies, whatever the sources. Rating "-" = 0; "X" = immune to that type.
5. Unblocked damage = total - blocked (floor 0). Luck Tough may now reduce it by 1.
6. Apply tokens (Power Armor first, section 4). Radiation flips tokens (section 3).
7. Elimination check: tokens on the model (regular + radiation) >= Health -> removed (not "dead").
8. Post-damage: weapon effects with "if target takes damage", conditions, Push Back, then Slide.
9. Armor boost: one boost icon is spent after every hit, even if it gave nothing (one per Walked Fire hit).
- Some weapons (e.g. Plasma Rifle) are blocked by the lower of physical/energy ratings, compared
  without Strong; ties: target's owner picks (ERR p.15).
- "Gain radiation" on a weapon: one point of the attack's damage becomes radiation (ERR p.12).
- Armor cards: one card sets the values (unit card or an armor card) plus up to one card of each type
  that modifies them; chosen when hit (ERR p.1). Items raising armor cannot apply to Power Armor except
  Power Armor mods (ERR p.2).
- Armor boost tokens: each icon is a +1 Strong bonus; since only one Strong bonus applies, extra boosts
  add nothing beyond one; max 4 icons per model (ERR p.1, p.10). Survivor faction: each Unique model
  gets 1 boost at force set-up (ERR p.19 card v2).
- Food armor boosts (Yao Guai Ribs etc.) are only spent by hits of their damage type (ERR p.10).

## 2. Health (RoP s2.9 p19; s6.1 p50)
Health = value of the attribute row carrying the heart icon (often End; Agi for Sole Survivor), plus
item/ability bonuses (Heroic +1, Power Armor End bonus via the PA card while undegraded, chems on that
row). Lowering the attribute lowers Health; if tokens >= new Health the model is removed (RULING).

## 3. Radiation (RoP s2.9 p19; s3.3 p34; CARDS p.15; ERR p.13, p.19)
- Each radiation point flips one regular token to its radiation side; when none are left to flip, add
  new radiation tokens. Both sides count toward Health.
- Radiation armor works like other armor. Super Mutant faction models and Robots are immune
  (rad damage ignored, including from consumables).
- Healing regular damage removes regular tokens only; healing radiation flips radiation tokens back
  to regular; excess is ignored.

## 4. Power Armor (RoP s5.2 p45; ERR p.2, p.10; CARDS p.62)
- Single-model units only; not Robots, Creatures or Super Mutant faction (CARDS p.15). Max one per model.
- Card under the unit card: green side gives attribute bonuses (T-60: Str +3, End +4) and armor
  3+1 / 3+1 / 4+1 (phys/energy/rad); yellow (degraded) side: Str +3 and armor 3/3/4 per card.
- One armor roll per hit; before rolling, the owner may use the PA ratings instead of the model's own.
- Damage tokens go onto the PA card until they equal the green side's End bonus; then the card
  degrades (flip to yellow), its tokens are discarded, and remaining damage goes to the model.
  Degraded PA cannot be restored in battle. Poison damage always goes to the model.
- PA negates all falling damage. A model in PA uses the PA base size.

## 5. Conditions (RoP s5.4 p48; ERR p.2, p.9-10)
Max one of each condition per model. Resistant: when a condition would be added, flip its token and
keep it only if its icon shows. Immune: never gains it (and drops it on becoming immune).
| Condition | Effect | Ends |
|---|---|---|
| Frozen | -2 all SV, all movement one shorter, cannot Prepare | end of own activation; On Fire replaces it |
| Injured Arm | -2 all SV (-2 token) | Stimpak (Robot Repair Kit for robots) |
| Injured Leg | gains Slow | as Injured Arm |
| On Fire | activation start: 1 regular damage, no armor roll but Strong still blocks; then flip luck, luck face = out. Move Action (or QA) + Agi test puts it out | flip or test; Frozen replaces it |
| Poisoned | activation start: 1 regular damage ignoring armor | an item that cures poison; robots immune |
| Slow | all movements one shorter (applied first), min Orange | per source |
| Stunned | only Action allowed is a Move (or QA) that removes it, no movement; doesn't block enemy movement but nothing may end overlapping it; attackers in melee +2; no free attacks | that Action |

## 6. Healing and chems (RoP s3.3 p32-34; ERR p.9, p.13-15; CARDS p.39-60)
- Healing items remove tokens per card; never above zero tokens; the free Quick Action of an
  eliminated Ready model cannot heal it back.
- Chems/alcohol: no Action to use; one limited-use item per Action; fixed or diminishing durations;
  addiction roll on the blue die when the effect ends; addictions persist until cured, do not degrade;
  one addiction per distinct chem. Robots, Creatures and Synth-type units cannot use chems
  (Creatures/Robots per reference cards; ERR p.15).
- Starter-set consumables (names only; values in M1 data): Stimpak, RadAway, Nuka-Cola, Nuka-Cherry,
  Iguana Bits, Mutant Hound Meat, Blood Pack, Bourbon, Psycho, Jet, Mentats, Buffout (CARDS p.39-60).
- Diminishing example semantics: the card's columns are cumulative attribute modifiers; each
  activation hides one column; the effect ends when all are hidden (RoP p33-34).
