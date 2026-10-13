# Needs rules check

Rules ambiguities never block work. Each line records one decision:

`RULING: <rule> | <what we did> | <why> | <Status> | <source>`

Status words: **Confirmed** (a free official source settles it), **Corrected** (errata changed the
rulebook; we follow the errata), **Unsourced** (no source; our engineering or design choice),
**Fan-source** (from a fan/third-party summary, not official text). Source keys are in
`docs/spec/10-overview.md`. Revisit Unsourced and Fan-source lines when new sources appear.

## Core rules
- RULING: Move measurement | straight moves displace the base by colour + base diameter; curved paths limit the centre path to colour + diameter | RoP only defines front-to-rear for straight moves; this keeps both cases consistent | Unsourced | RoP s2.7 p15
- RULING: Range measuring | all distances are base-edge gaps; in range if the ruler reaches any part of the base | FAQ answer | Confirmed | ERR p.9
- RULING: Long band membership | a target is in long range if its gap <= S+L and part of its base lies beyond S; straddlers let the attacker pick | RoP lets the attacker choose but does not define "within long" precisely | Unsourced | RoP s2.8 p16
- RULING: Slide distance | capped at the model's Move colour | RoP calls Slide a movement with no stated length | Unsourced | RoP s2.13 p25
- RULING: SV below 1 | only a CP face succeeds; AP faces and accuracy icons do not help | rulebook names the single icon | Confirmed | RoP s2.4 p10 (rendered)
- RULING: Accuracy icons on black/yellow dice | the ACC-1 faces on black (12) and yellow (10-11) modify the skill roll like green ones | icon table defines -1 as a skill bonus regardless of die | Confirmed | DICE; RoP p11
- RULING: Total effect-dice cap | only the per-colour cap of 4 applies | the FAQ refers to an overall maximum "described in this FAQ" that the FAQ never states | Unsourced | ERR p.9
- RULING: Special effect uses | each weapon/item effect triggers at most once per Action; "bottles" cost means 2 bottles | errata replaces the multi-use text and example | Corrected | ERR p.1
- RULING: Opposed result | "highest result" = higher modified number that still succeeds | Battle Cry example (2 beats 1) | Confirmed | RoP s4.1 p36
- RULING: Charge marker with Battle Cry | marker placed on completing charge movement, then Battle Cry; a win adds the second colour | errata order | Corrected | ERR p.1-2
- RULING: Strength bonus | uses the Str attribute total incl. items/chems, never speciality-adjusted SV | FAQ | Confirmed | ERR p.13
- RULING: Armor card choice | chosen when hit, not at activation start | errata | Corrected | ERR p.1
- RULING: Strong armor stacking | only one Strong bonus applies; boosts never add a second; a boost is spent per hit regardless | errata | Corrected | ERR p.1
- RULING: Armor boost maximum 4 | the FAQ's icon is lost in text extraction; we read it as armor boost icons | context of the armor FAQ block | Unsourced | ERR p.10
- RULING: Item sharing range | Yellow and LoS, both models unengaged | errata replaces Presence | Corrected | ERR p.1-2
- RULING: Forced edge damage | 1 regular damage ignoring armor (not just "no roll") | errata wording | Corrected | ERR p.2
- RULING: Health drop | if an attribute loss lowers Health to or below current tokens, the model is removed at once | RoP checks removal after tokens are added only | Unsourced | RoP s2.9 p20
- RULING: Leader requirement | any unit may hold the Leader card (single-model clause deleted) | errata | Corrected | ERR p.2
- RULING: Aura LoS | auras need LoS | errata | Corrected | ERR p.2
- RULING: Survivor faction card | use v2: each Unique Survivor gets 1 armor boost at force set-up; the v1 "two Sole Survivors" line is dropped | v2 replaces the card's main text | Corrected | ERR p.19; CARDS p.13
- RULING: Dog/Hound card renames | "Mutant Hound Bite" = Hound Bite; Dogmeat Agi 6 (v2) | card versions list | Corrected | ERR p.20
- RULING: Scatter direction | uniform random angle from the seeded RNG instead of flipping the marker | statistically equivalent, deterministic replay | Unsourced | RoP s5.3 p47
- RULING: LoS geometry | LoS is true if any sampled ray between the two base discs is clear | tabletop "any point to any point" needs a finite test | Unsourced | RoP s2.8 p17
- RULING: Default caps | versus default 500 caps per side, editable | the CH force-creation page is not free | Unsourced | CH p26 (missing)
- RULING: Boost tokens in versus | buying Strong armor boosts at 6 caps is AI-only unless both players agree | AIH lists it for AI forces only | Unsourced | AIH s3
- RULING: Hot-seat secrecy | a hand-over screen hides one seat's peeks from the other | tabletop relies on players not looking | Unsourced | RoP s3.2 p29

## Scenarios
- RULING: BOX-2 nuke die | "red Armor Reduction dice" read as the red armor die | yellow is the armor-reduction die; red is armor | Corrected | BOX SCP-002
- RULING: BOX-1 and BOX-4 with starter models | Brotherhood side uses Aspirant Goddard; the turret is skipped | starter set lacks those units | Unsourced | BOX SCP-001, SCP-004
- RULING: Red Rocket push direction | pushed Yellow directly away from the pusher | text gives distance only | Unsourced | RR p2
- RULING: Red Rocket "Tech" | Enslaved Tech | only Tech unit in the starter set | Unsourced | RR p2
- RULING: Into the Sewer Deathclaw flip | the icon is lost in extraction; we use the luck face | luck token is the only flipped token | Unsourced | COOP s4
- RULING: CH tutorials and settlement scenarios | placeholders CH-T1..T5 until a source is available | Campaign Handbook has no free copy | Unsourced | ERR p.4-5

## AI
- RULING: AI activation order | AI draws one number token per turn, readies that model, Uses all Ready AI models in ascending number | CH states the procedure | Confirmed | CH p8
- RULING: Number token pool | drawn tokens stay out until the round ends; each round the pool is the tokens of the AI models still on the table; the decider draws uniformly from the AI's Unready models with deriveSeed | CH describes the draw but not the refill | Unsourced | CH p8
- RULING: Matrix row icons | rows are bottles / stars / blast; 1 and 2 icons of a kind share a row but each count has its own Method icon; the bottle+star face reads as one star | CH card anatomy and text | Confirmed | CH p10, p11, p50
- RULING: Blue die timing | rolled once at activation start; the Response is fixed for the activation and the activity list is re-walked before each Action | CH states it (the old spec rolled per Action) | Corrected | CH p10, p16
- RULING: Column choice | first column from the left that is true, else the last column; Health columns read Health remaining (`health:<lo>-<hi>` / `health:<n>+` in data) | CH states it | Confirmed | CH p10
- RULING: Starter AI card data | Super Mutant, Brute and Sole Survivor Day One come from the CH card images; Sole Survivor, Aviator, Aspirant Goddard and Deathclaw come from the R2 card photos (medium resolution); Settler, Enslaved Tech, Dogmeat and Mutant Hound keep placeholder cells tagged `source: "placeholder"` | not printed in CH | Confirmed (photo cards), Unsourced (placeholders) | CH p8, p10, p50; R2 photos
- RULING: Placeholder matrices | melee units (Mutant Hound, Dogmeat, Deathclaw) copy the Brute pattern, ranged units (Aviator, Settler, Enslaved Tech, Sole Survivor, Goddard) copy the Sole Survivor Day One pattern, with Health bands scaled to the unit; Aviator, Sole Survivor and Goddard columns and priority lists come from product photos | engineering stand-in, no card text | Unsourced | R2-photos.md
- RULING: Placeholder standard equipment | taken from the AIH/COOP/RR suggested forces for that unit | AI cards not in hand | Unsourced | AIH s4; COOP s4; RR p2
- RULING: Preferred weapon in data | `notes` carries `pref:<weapon-id>` for the underlined weapon (Super Mutant: Board) | schema has no field and is frozen | Unsourced | CH p10, p11
- RULING: AI card AP use | the Sole Survivor Day One footer (AP icon, then a bin and a damage glyph) is read as "spend AP to remove 1 regular damage", stored as `notes: ["ap:removeDamage"]` | CH p16 mentions AP damage removal; icons are not captioned | Unsourced | CH p16, p50
- RULING: Objective None | the O response has no activity, so the model performs A | CH lists None but gives no O step; CH p13 says no way to do O means A | Unsourced | CH p9, p13
- RULING: Objective switches timing | live predicates are re-checked before every AI Action; latching switches are checked by the scenario module at activation start and after each Action, stored in `tokens.aiPhase` | CH says objectives may change, not when they are checked | Unsourced | CH p9; AIH s2
- RULING: AI reactions | AI models never Prepare (no activity list contains it), so a `react.offer` to the AI seat is declined | CH has no reaction step for AI models | Unsourced | CH p11-14; RoP s4.4
- RULING: AI ties | broken by the AI's seeded stream and logged | CH says randomize the remaining targets | Confirmed | CH p12
- RULING: Target priority vocabulary | CH list: Nearest, Weakest, Largest, Wounded, Healthiest, Vulnerable, Slowest, Fastest, Best Chance, Prepared, Spent, Importance, Not Engaged, Engaged, Capable; Leader from ERR | CH table plus FAQ | Confirmed | CH p12; ERR p.16
- RULING: Prepared priority | holding a Reaction marker before not | CH defines it as "Ready before Not Ready", ERR renames cards' "Ready" to "Prepared", and RoP calls a model with a Reaction marker Prepared | Unsourced | CH p12; ERR p.18; RoP s4.4
- RULING: Fall Back target | the model's own initial deployment point | CH states it | Confirmed | CH p13; ERR p.16
- RULING: Push Back follow-up for printed M, F or S | M and F follow the O/D rule (Reckless only); S follows the A rule | CH lists A, O and D only | Unsourced | CH p15
- RULING: Careful Move | moves at least half its Move, then stops at the point of that path with the best cover and fewest enemy attackers, preferring the farther point on a tie | CH gives the aim, not a scoring rule | Unsourced | CH p10, p13
- RULING: Charge marker colour | flipped at random from the AI's seeded stream | CH says flip the token | Confirmed | CH p11
- RULING: AI Heroic model | V.A.T.S. at activation start; any AP gives one Quick Action after the two Actions, run as the same Response; always Critical when able; Luck only for Tough | CH states it | Confirmed | CH p16; AIRF
- RULING: Health above the top band | a model whose Health exceeds every printed band (e.g. a Heroic Super Mutant at 7 vs "4-6") falls through to the last column, as CH reads literally | no source addresses Heroic +1 Health on AI cards | Unsourced | CH p10, p16
- RULING: AI matrix columns | modelled as predicates (Health remaining or a scenario condition), not Health only | CH names Health and friendly count as examples | Confirmed | CH p10
- RULING: Narrative override | the CH hint letting players swap to another listed behaviour is not implemented | owner rule: official procedure only | Unsourced | CH p9
- RULING: Co-op team decisions | team ready and pick decisions go to the team's first seat with the team listed in context; each player's use-all/none goes to that player | COOP gives the choice to the team, a local table needs one answering seat | Unsourced | COOP s2

## Campaign
- RULING: Settlement rules | M6 uses only facts in spec 19 plus a labelled house procedure unless the owner provides the Campaign Handbook | no free source | Unsourced | spec 19

## Data review fixes
- RULING: Plasma Rifle armor glyph | red down arrow + phys/energy icons is damage.lowerOfPhysEnergy; armor reduction stays on the crit only | ERR p.15 FAQ answers it | Confirmed | CARDS p.36; ERR p.15
- RULING: Hazmat v2 0/0 | keep unit P/E per FAQ; suit sets radiation 3 only | FAQ answers it directly | Unsourced | ERR p.16; ERR p.20
- RULING: Base sizes | Normal units 32 mm, Large (Super Mutant, Brute, Aviator, Mutant Hound, Goddard in Power Armor) 40 mm, Deathclaw 50 mm | no store or fan source found yet; RoP p17 gives only categories | Unsourced | RoP s2.8 p17 (PDF p19)
- RULING: Fragmentation Grenade limitedUse | counted copies, one use each | ERR p.4 implies counted grenades, the card does not print it | Unsourced | ERR p.4
- RULING: Getting Acclimated tutorial mapping | ga-1..4 are sections A1..A4 at PDF p.2-3, 4-5, 6, 7-8 | section start pages checked in the PDF | Confirmed | GA
- RULING: Dogmeat AGI | use ERR v2 AGI 6 over the free card's 8 | errata overrides the card | Corrected | ERR v2
- RULING: Back-up aura | applies to all skill tests of friendly models in the aura | the glyph sits mid-text, not beside the name | Unsourced | CARDS
- RULING: Mutant Hound keywords | Dog only, no Creature | card shows the paw glyph only | Confirmed | CARDS
- RULING: Injury icons | bandage cone = arm, sock = leg; Dog/Hound Bite BLAST and Shotgun crit BOT = injuredArm | icon-only cards | Unsourced | CARDS
- RULING: Chem diminishing order | columns hide right to left (dot counts 3/2/1); addiction rows read bottom-up from STR, so Bourbon gives AGI -1 | icon-only, table printed rotated | Unsourced | CARDS; RoP p33
- RULING: Weapon pictograms | Bat helmet-crack = armorDown 1 (once per Action per errata); STAR burst = extraDamage 1; grenade/missile target-burst icon omitted | icon-only | Unsourced | CARDS; ERR
- RULING: Fan perk/boost/quest/event data | used only as a name and mechanic cross-reference, all prose rewritten | campaign-edition fan transcription, edition unverified | Fan-source | R1-archives.md
- RULING: Settlement storage | not implemented; campaign GAP-1/2 stay open | secondhand forum snippet only | Unsourced | R3-campaign.md

## M2 engine
- RULING: Reaction triggers | a reaction's own triggers do not provoke further reactions, and reactions resolve in declaration order | keeps the queue finite | Unsourced | RoP s4.4 p41-42
- RULING: Climb and fall | a move that ends on a higher surface needs one Agi test, and a fall resolves at the move's end point (a failed climb falls the height climbed and stays put) | no per-leg climb data exists | Unsourced | RoP p38-39
- RULING: Special effects | auto-applied greedily in card order, each paid and fired once per Action, so the Bat's armorDown max 2 is ignored | avoids a per-icon decision and follows the errata | Corrected | ERR p.1
- RULING: ignoreArmor n | n points are moved off the first damage entry and dealt as direct damage | a hit has no partial-ignore field | Unsourced | CARDS
- RULING: Area attacks | every touched model gets the same DMG/AR icons; the target alone gets its target extra; scattered blasts skip LoS and cover | the spec is silent on per-victim dice | Unsourced | RoP s5.3 p46-47
- RULING: Stunned target in melee | the attacker gets the into-melee bonus (+2) | no dedicated constant | Unsourced | RoP p25
- RULING: Minimum range | a weapon whose short band has a non-zero minimum cannot be used in close combat | card data marks minimum range this way | Unsourced | CARDS
- RULING: DMG icons | each DMG icon is added to every damage type in the hit | followed spec 15 s1 step 2 literally | Unsourced | RoP s2.9 p19
- RULING: Slow and Injured Leg | together they count as one move step; Frozen adds one more | the spec lists Slow per source and Injured Leg as granting Slow | Unsourced | RoP s5.4 p48
- RULING: Diminishing items | all columns are active on use; one is hidden right to left at each activation start; gain-AP effects fire on each tick (the AP-use restriction is ignored) | card data gives no timing | Unsourced | CARDS
- RULING: Dogs and consumables | dogs may use food and alcohol; creatures use no chems, food or alcohol | FORCE-012 says food and drink | Unsourced | ERR p.3
- RULING: Scenario ends | box-1..4, ai-rr, ai-missile, ai-breakin, ai-tech, coop-sewer, coop-munitions and ga-2..4 are checked by id in scenario.ts from marker props and the exit list; coop-cage uses last side standing; box-5, ga-1 and the BOX-1 suit bonus are not implemented; pickup faces come from a table in scenario.ts | the structured layout data (spec 17 s4.1) covers the AI and co-op scenarios | Unsourced | 17
- RULING: Charge menu entry | the menu offers a charge only when the straight charge (no waypoints) reaches base contact; a client may still send a path; Quick variants are offered only where the Quick ruler still reaches | every listed option must be accepted (spec 60 s2) | Unsourced | RoP p23
- RULING: Charge bonus upkeep | after any finished Action other than charge, Battle Cry or Close Combat the actor's charge markers are discarded; primed weapons gain after every finished Action | CHG-005 and WPN-009 wording | Unsourced | RoP p23; ERR p.21
- RULING: BOX-1 timeout | at the end of round 6 the side with more surviving points wins; scenario caps are 0 | the scenario sheet lists only elimination, so random-bot games ended in draws | Unsourced (house ruling) | BOX SCP-001
- RULING: BOX-4 Defender rows | the printed Defender rows read "the enemy controls the Tower"; read as the Defender's own side: both sides score a Major win with more models at the tower and a Minor win with more points on that level | the printed text contradicts the Attacker rows | Corrected (sheet typo) | BOX SCP-004
- RULING: Placeholder bot | until the M4 AI the client bot is the seeded random decider, leaning toward the table centre and taking an offered attack 80% of the time | a pure random bot wandered off the table and never attacked | Unsourced (client only, no rules effect) | 50
- RULING: Box-5 (Flip's Revenge) rescue | the captive cannot be freed (no rescue rule in the engine), so Flip only wins by elimination; box-5 is left out of the AI benchmark | the box PDF's rescue step is not modelled yet | Unsourced | BOX p.9-10
- RULING: Object Health convention | an object's `props.health` is its Health left and `maxHealth` the start; a destroyed object stays on the table list flagged `destroyed` so scenarios can read the result | the Red Rocket check already read `health` as Health left | Unsourced (engine convention) | RR p2
- RULING: Blast weapons at objects | an area weapon aimed at an object damages only the object (no splash, no scatter) | the object rules say nothing about templates | Unsourced | RR p2; AIH s4
- RULING: Object cover and LoS | objects give no cover and do not block line of sight; a shot at one uses normal range, line of sight and cover rules to its position | RR lists only the sled's Cover and LoS lines, which are not modelled yet | Unsourced | RR p2
- RULING: Co-op Ready decisions | the team readies one model, so only that model's owner is asked use all or none; a seat that chooses none turns its Ready models Used at once | COOP s2 words the choice per player but readies one model per team turn | Unsourced | COOP s2
- RULING: Co-op hostility | seats of one team are never opposing: no engagement, no cover from teammates for the other side, reactions compare teams | COOP s2 treats the team as one side | Fan-source | COOP s2
- RULING: Missile sled timing | the sled's Red move happens once per round, at the round end before the result is read (data `movesAt: "turn"` switches to every turn) | AIH says "each turn", but a turn is one side's activation: with six AI models the 24 in of lane would be crossed in the first round, before the players' Zone B models arrive at the start of round 2; the checklist SCN-004 still says turn | Unsourced | AIH s4
- RULING: Battle Cry shove | an AI Battle Cry is always used and its Push Back is followed up only when the cell is Reckless | the Close Combat list note on CH p11 names this case, and the general rule on CH p15 (charged: always follow up) would contradict it | Confirmed (CH p11 note wins for Battle Cry) | CH p11, p15
- RULING: Stunned AI model | a Stunned AI model with an Action to spend takes the only Action the engine offers, Shake off; the Response is skipped | no AI rule covers Stunned | Unsourced | COND-007
- RULING: Capable priority | Capable keeps enemies whose unit card has a Computers, Lockpick or Search skill, whatever the Objective | CH p12 gives only the hacking example | Unsourced | CH p12
- RULING: Fall Back at the point | a Careful AI model already at its deployment point does not look for better cover (the scenario data has no deployment zone shape); it attacks without moving or does nothing | ERR p.16 mentions a zone the data cannot yet describe | Unsourced | ERR p.16
- RULING: AI Luck and AP | the engine offers Luck flips for Accurate, Dodge and Critical only, so the AI keeps every Luck token (Tough is not offered); AP-use lines on AI cards (for example removing damage) are not spent because the engine has no AP spending decision | CH p16 limits Luck to Tough and AP to the card's shown effects | Unsourced | CH p16
- RULING: Awareness switches | "aware of a trigger / sees a player model" holds when the model has tokens.aiAware, or an enemy is inside its Awareness ruler with line of sight; once on, the switch stays on for that model | the scenario text gives no distance | Unsourced | AIH s4
- RULING: First turn and item branches | when the AI holds the Advantage and is asked who goes first, or an item offers branches, it takes the first legal option | CH p8 names neither choice | Unsourced | CH p8
- RULING: Sled shove and crush | a model touched by the sled's move is moved sideways to just clear the swept lane (the nearer side first); with no legal spot on either side it is removed | AIH says Push Back to the shortest move out of the lane, and run over if that does not clear the path | Unsourced | AIH s4
- RULING: Missile hits | a Shooting test counts as hitting the missile when its skill die shows an X (no result) and the target is the sled or a model within Yellow of it, or when the blast of any attack reaches the sled; throws count only through their blast; one hit per qualifying attack | the sheet says "roll an X" without naming the die | Unsourced | AIH s4
- RULING: Lockpick on the sled | the sled carries `skill: lockpick`, so the usual Use Expertise option (an Action) applies: success = 1 damage with no armor roll | the sheet says Use [Lockpick] whilst Interacting | Unsourced | AIH s4
- RULING: Player deployment in The Missile | the players always use Zone A for Sole Survivor and Dogmeat and Zone B (at the start of round 2) for the Settlers, both along the table edges beside the sled's lane | the sheet lets the player pick the split and shows the zones only on the map | Unsourced | AIH s4
- RULING: Patrol awareness | a patrolling model becomes aware (for good) when an enemy is within its Awareness ruler in line of sight, when an enemy attack is made by or at a model within that ruler of it, or when it is attacked; route markers advance when the model's base touches the one it is heading for | the sheet says "aware of any trigger" without a distance | Unsourced | AIH s4
- RULING: Alerted subject | after the alert the Subject is any enemy (the AI nearest-enemy rules still pick targets), standing in for "any enemy seen this or last round" | the engine does not track sightings per model | Unsourced | AIH s4
- RULING: Hounds on patrol | the Yellow limit on patrolling hound moves is not enforced (the official decider has no move cap) | the frozen AI settings carry no move limit | Unsourced | AIH s4
- RULING: Break-in layout | the compound is a 20 in square of wall pieces with gaps, the valve hut inside, four patrol routes (an inner loop, two outer lanes, one through the west gap) with the pairs the sheet names at route starts | the sheet shows only an example layout | Unsourced | AIH s4
- RULING: Win by half the team | "at least half the player models" is read as models x 2 >= the number of player models, counting those that walked off the table | the sheet gives no rounding | Unsourced | AIH s4
- RULING: Sewer key boxes | the lock-box / terminal side is drawn from the seeded stream when a numbered marker is first looked at; a key goes to the model that opened the box, is spent automatically when that model touches the hatch (no sharing step) and a model leaves when its Action ends beside the open hatch | the engine has no free Action | Unsourced | COOP s4
- RULING: Sewer layout and Deathclaw | key markers sit more than Black + Yellow from the hatch and out of the AI corner; the Deathclaw enters within Orange of the opposite corner and plays for the AI seat, so it cannot attack the AI Brotherhood models (one AI team in the engine) | the sheet shows the map only | Unsourced | COOP s4
- RULING: Blood Cage chain | slack is measured centre to hole; the player who did not move is pulled towards their hole, and what they cannot give (blocked) comes out of the mover's last move; the chain is one object at hole 1 (Health 2, armor 3 both types for "2+1", no extra green die) | the sheet places no marker for it | Unsourced | COOP s4
- RULING: Blood Cage deck and uses | the fixed deck is the 11 cards that exist in the data (no Stuffed Monkey card yet); a found ranged weapon leaves the model after its third attack; the Improvised Weapon exclusion for the chain is not enforced | data gap | Unsourced | COOP s4
- RULING: Munitions end of round | "can Interact" is a non-dog AI model, on the table, not engaged and with its base touching the token; the players win when round 8 ends with the base standing | the sheet gives no distance | Unsourced | COOP s4
- RULING: Escaped Tech | phase 1 and the Tech reveal follow the sheet; the Presence attempt (phase 2 to 3), the Tech's Move-only limit, its refusal to move beside a hound, peeking at Yellow and the hounds' Red peek limit are not modelled: the AI protects the Tech instead of rolling Presence, and the Tech simply walks to the exit marker near the other side's corner | AIH page 7 is not readable from the free PDF text; spec 17 s4 summarises it | Unsourced | AIH s4
- RULING: Layout growth | a zone too crowded for its models grows by half (then again) instead of leaving a model on the generic row | corner zones of Yellow are small for five bases | Unsourced (engine convention) | 17 s4.1
- RULING: Item uid | found-card ids use the roll counter, not the event count, so a replay without ai.decision events keeps the same ids | determinism of AI games | Unsourced (engine fix) | ENGINE
- RULING: Approach steps already met | a Charge-distance or Move-distance approach step is skipped when the model already stands within that distance (it cannot make progress there), and the Charge-distance step is never used for an object marker (markers cannot be charged); the list then continues to the next step | avoids 0.3 in creeping when a charge or contact is impossible | Unsourced | CH p11 / 18 s3.3
