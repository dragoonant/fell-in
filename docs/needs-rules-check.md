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
- RULING: AI activation order | AI draws one number token per turn, readies that model, Uses all Ready AI models in ascending number | only a search summary of the CH text; RoP App.1 confirms numbered AI markers | Fan-source | RoP p54; web search 2026-10-11
- RULING: Matrix row icons | rows keyed to blue-die icon groups (bottle / star / blast); exact grouping per card when cards are entered | dev blog confirms a blue-die row roll, not the grouping | Unsourced | BLOG
- RULING: Starter AI card data | placeholder matrices tagged `source: "placeholder"` until the owner's physical AI cards (or the paid AI deck PDF) are entered | not in any free PDF | Unsourced | CARDS; BLOG
- RULING: Objective switches timing | evaluated before each AI activation and after each Action | AIH describes switches but not timing | Unsourced | AIH s2
- RULING: AI reactions | an AI model with a Reaction marker reacts to the first trigger it is aware of with an attack if legal, else a move | CH procedure unavailable | Unsourced | RoP s4.4
- RULING: AI ties | broken by seeded RNG and logged | tabletop leaves ties to the player | Unsourced | ERR p.16
- RULING: Target priority vocabulary | Nearest, Vulnerable, Leader, Importance, Prepared confirmed; Least armor, Most damaged, Highest max Health from the dev blog | two official sources | Confirmed | ERR p.16-18; BLOG
- RULING: Fall Back target | the model's own deployment position | FAQ refers to "their deployment point" | Confirmed | ERR p.16

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
- RULING: AI Heroic model | gets V.A.T.S. at activation start and one extra Quick Action | Campaign Handbook p16 product preview photo | Confirmed | R2-photos.md
- RULING: AI matrix columns | modelled as predicates (health or scenario condition), not health only | Wave 3 Institute card photo | Confirmed | R2-photos.md
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
- RULING: Scenario ends | box-1..4, ai-rr, ai-missile and ga-2..4 are checked by id from marker props; box-5, ai-breakin, ai-tech, coop-sewer, ga-1 and the BOX-1 suit bonus are not implemented; pickup faces come from a table in scenario.ts | no structured scenario data for the rest | Unsourced | 17
- RULING: Charge menu entry | the menu offers a charge only when the straight charge (no waypoints) reaches base contact; a client may still send a path; Quick variants are offered only where the Quick ruler still reaches | every listed option must be accepted (spec 60 s2) | Unsourced | RoP p23
- RULING: Charge bonus upkeep | after any finished Action other than charge, Battle Cry or Close Combat the actor's charge markers are discarded; primed weapons gain after every finished Action | CHG-005 and WPN-009 wording | Unsourced | RoP p23; ERR p.21
