# 19 Campaign and Settlement mode (M6)

Primary source: the Campaign Handbook (CH), section 2 "Into the Wasteland" (CH p4-6), section 4 "Settling Down"
(CH p18-24), section 5.1-5.3 force creation and battle set-up (CH p26-27), the scenario reward tables (CH p28-42)
and the tutorial outcomes (CH p49). The errata/FAQ (ERR) overrides CH wherever the two differ; the official
Settlement Sheet v4.0 (SHEET, `settlement_sheet_v4.pdf`, July 2020) carries the later structures that the errata
added. Page cites are book pages (CH PDF page = book page + 2); ERR cites are PDF pages. Card-level sources
(which PDF holds which perk, boost, event, quest and explore card) are inventoried in
`docs/spec/sources/CH-CAMPAIGN.md`. Every gap is a `RULING:` line in `docs/needs-rules-check.md` under
"Campaign (M6)". All prose here is ours; the mechanics are the book's, 1:1.

Owner decisions that bind this spec: official rules only, no house roguelike (2026-10-12); the campaign is the
fourth opponent mode and ships after M5 (PLAN.md). The engine contracts stay frozen: everything below lives in
`src/campaign/` (section 7) and talks to the engine only through `createGame` and the final `GameState`.

## 1. Scope, sources and status

### 1.1 What the Campaign Handbook adds (CH p2)
- Four card types layered on the core rules: Events (drawn during a battle), Perks (bought for a model or a
  settlement), Boosts (one-shot cards in a player's hand) and Quests (a private side task for one battle).
- A Settlement: a set of Structures bought with caps between battles that limits, and then grows, which Item,
  Boost and Explore cards a player can take into the next battle (CH p18).
- Explore: a settlement player draws and resolves Explore cards between battles; some leave a Consequence card
  that is shuffled into the next battle's Event Deck (CH p5, p22).
- Scenario rewards in caps (CH p19, p28-42) and five linked scenarios whose outcomes carry forward as Campaign
  Consequences (CH p35-39). The five Tutorial scenarios have narrative outcomes only (CH p49).

### 1.2 What is deliberately out of scope
- Homestead Rules Expansion (Survival Mode, building damage, water/power upkeep, injuries that persist): a
  separate paid book; only three FAQ answers exist (ERR p.17). The campaign records keep room for it
  (`injuries`, `xp` in section 7) but no CH rule fills them (RULING: no injuries or experience).
- Battle Mode army lists (CH p2): a competitive download, not campaign play.
- The Fallout: Wasteland Warfare RPG campaign `machine_frequency_campaign.pdf`: an RPG product (Overseer and
  4-6 players), not the skirmish settlement rules; nothing in it is used here.

### 1.3 Status of the old gaps (the "no free copy" era is over)
The owner supplied the Campaign Handbook on 2026-10-12. The five gaps of the previous spec resolve as:

| Old gap | Status |
|---|---|
| GAP-1 campaign sequence, caps, land | Closed: sections 3-4 (CH p18-20, p22). |
| GAP-2 structures, costs, effects, size limits | Closed: section 4.4 (CH p21-23; SHEET; ERR p.3). |
| GAP-3 starter card texts (perk, boost, event, explore, quest) | Perks closed (`perk_cards_w9.pdf`); boosts, events, explore and quests remain card-text gaps (names known from the Wave 9 full card list; see CH-CAMPAIGN.md and the RULINGs). |
| GAP-4 injuries, experience | Closed as "none in CH" (section 3.3; RULING). |
| GAP-5 CH tutorials and settlement scenarios | Closed for rules and rewards (section 5.4-5.5); layouts belong to spec 17 section 5. |

## 2. Into the Wasteland: Events, Consequences, Perks, Boosts, Quests (CH p4-6)

### 2.1 Events (CH p4)
- Deck building at set-up: shuffle all Event cards in use, draw (rounds - 1) of them at random, add every
  Consequence card the players bring (section 2.2), Event cards face down and Consequences face up, shuffle the
  result and place it in The Wasteland as the battle's Event Deck (CH p4; RoP p31).
- The players may pick the mix of Event cards instead of drawing at random; some Events do nothing, so the
  share of blank Events tunes how much the Events matter (CH p4, hint box). Engine default: random (RULING).
- At the start of every round after the first, if no Event is in play, draw the top card and apply it at once;
  it is discarded at the end of that round unless it says otherwise. An Event that stays in play blocks the next
  draw (CH p4).
- Flip icon: whenever the top card of the deck carries the Flip icon it is turned face up where it lies and
  stays on top; everyone may read it, but it takes effect only when drawn in a later round (CH p4). A card
  without the icon is seen only when drawn.
- A Consequence on top of the deck is drawn and resolved immediately, at any time it surfaces; this is not the
  round's Event draw (CH p4-5).

### 2.2 Consequences (CH p5, p24)
- A Consequence card comes from a settlement decision, a Quest, a Boost or an earlier scenario; it carries the
  word CONSEQUENCE and belongs to one player (CH p5).
- At set-up each player shuffles all Consequences they gained since the last battle into the Event Deck without
  showing the opponent which ones. No player may add the same Consequence twice; if two players add the same
  card, the owner of the drawn copy is chosen at random (CH p5).
- A Consequence gained mid-battle goes in at the end of the round: set the top card aside, shuffle the new card
  into the rest, put the top card back (CH p5).
- Settlement players: a Consequence added to a deck but not drawn before the battle ended is carried into that
  player's next battle (CH p24).

### 2.3 Perks (CH p5, p24; ERR p.10)
- A Perk is assigned to a single-model unit that meets the card's requirements (attribute minimum, another
  Perk). No model takes the same Perk twice (CH p5; ERR p.10 FAQ).
- Settlement-wide Perks (Armorer, Blacksmith, Gun Nut (Rifle/Pistol/Heavy), Local Leader, Local Leader II,
  Robotics Expert, Creature Trainer) are not assigned to a model and can be bought once per settlement
  (CH p24; ERR p.10 FAQ). The Gun Nut and Blacksmith cards each grant one free Weapons Workbench; Armorer grants
  one free Armor Workbench, never a Power Armor Station (`perk_cards_w9.pdf` PDF p27-28).
- Perk caps costs come from the Wave 9 cost sheet (COST "PERKS"): starter set Gun Nut (Rifle) 3, Gun Nut (Pistol)
  3, Blacksmith 3, Armorer 3, Local Leader 5, Nerd Rage 6, Mysterious Stranger 4. Costs are paid once when bought
  (section 4.1) and count toward the force value only while the Perk is equipped for a battle (CH p24).
- Without a settlement, Perks are simply bought into the force list within the caps limit (CH p26-27).

### 2.4 Boosts (CH p5, p24; ERR p.13, p.15, p.18)
- Four types: Practiced (raise results), Cunning (change results), Tactical (movement and reactions),
  Instinctive (anything else) (CH p5).
- Boosts are a hand held by the player, not by a model. The hand is secret; its size is public. A Boost is
  revealed when used and discarded after it resolves. At most one Boost per Action (CH p5).
- Hand size without a settlement: up to half the Leader's highest attribute, rounded up (CH p5). With a
  settlement: Step 3 may select at most the Leader's highest attribute in Boosts (CH p24), and only as many as
  the Stores allow (section 4.3).
- Boosts may carry a caps cost in force building (CH p26); the Wave 9 cost sheet lists none for the starter
  Boosts, so they cost 0 (RULING).
- Known card rulings: Second Chance re-rolls an X result, including the X+AP face, and the AP is not kept
  (ERR p.13 FAQ); Try That Again v2 re-rolls any remaining effect dice of any colours (ERR p.18); Fortunate
  Deflection cancels one damage icon, from any source, not one point of damage (ERR p.15 FAQ).
- A Quest reward that only matters to a settlement player may be swapped by a non-settlement player for two
  random Boosts drawn at the start of their next battle, on top of the usual maximum (CH p6).

### 2.5 Quests (CH p6; ERR p.10)
- One Quest card is chosen at the start of a battle and cannot change during it. The opponent knows a Quest is
  in play but not which (CH p6). In co-op, two team players never run the same Quest (COOP s2).
- Cards are double-sided: the black-titled face tells the story, the blue-titled face gives the task and the
  rewards by outcome; some cards show a reward item on the back instead (CH p6).
- Multi-part Quests share a title with part numbers (Part 1, Part 2a, Part 2b). A player starts at Part 1 and
  moves only to the part the completed card names; they may take a different Quest first and return later
  (CH p6).
- Rewards are gained only when the battle ends. Completing a card ends Quest play for that battle (no second
  card). Each card is completed once per player unless it says otherwise; a failed Quest may be retried in any
  later battle unless the card forbids it (CH p6).
- Reward items are usable only by the player who earned them, join the force like any item, and are never
  shuffled into The Wasteland's Item Deck (CH p6).
- Cards earned for the next battle are added after the force is built: they need no Stores and are not part of
  the Step 3 pool, except Unique items, which must fit in the force's caps total (CH p6).
- Land: every completed Quest card, each part separately, counts 1 toward the five Quests that buy new land
  (CH p18, p22; ERR p.10 FAQ).

## 3. The Settlement (CH p18-19)

### 3.1 Overview (CH p18)
- A settlement is a list of Structures bought with caps won in battles. Structures decide how many Item and
  Boost cards are drawn and of what type (Step 2), how many of them enter the next battle (Step 3) and how many
  are kept after a battle (section 3.3). A settlement player may play an opponent without one; both field the
  same caps value (CH p18).
- The between-battle sequence, in order: After a Battle (section 3.3), then the Settlement Phase Step 1 Build,
  Step 2 Draw, Step 3 Select (section 4), then force creation (section 5.1). Once a card has been drawn in Step 2
  the player cannot go back to Step 1 until after the next battle (CH p20).

### 3.2 Starting settlement, caps and land (CH p18, p22)
- A new settlement starts with, for free: 2 Generator - Small (3 Power each), 1 Stores, 1 Maintenance Shed,
  1 Listening Post. Caps earned before founding it are spent on these: the caps total starts at 0 (CH p18).
- Room: 15 Structures. Each purchase of Land adds room for 10 more and costs 500 caps or five completed Quest
  cards; Land is not a Structure, needs no Power and may be bought any number of times (CH p18, p22; SHEET).
- The caps total is a running balance that persists from battle to battle (CH p20).

### 3.3 After a battle (CH p19, p24; ERR p.3, p.10, p.15, p.17)
1. Caps award: the winner gains 200 caps and the loser 120. If both forces were 1,000 caps or more, each gains
   50 more. A scenario may change these numbers (CH p19). A draw pays both players the winner's amount
   (ERR p.10 FAQ). Scenario-specific awards: see section 5.3.
2. Strip the force: every Item card that is not standard equipment for its unit comes off (section 5.1), and
   any unused Boosts leave the hand (CH p19).
3. Retain: for each Maintenance Shed the player keeps 1 Item card or up to 2 Boost cards from everything
   gathered (what the force carried in plus what it found). A Counting Token on an Item card is a separate
   card for this count. Retained cards start the pool for Step 3 (CH p19, p22).
4. Unique items always enter the pool without using a Shed, unless the player chooses to sell one instead
   (ERR p.3 overriding CH p19).
5. Lockers: after the Sheds are used, every Item stored in a Locker during the last Step 3 leaves the Locker
   and joins the pool (SHEET; ERR p.3, p.15 FAQ).
6. Sell: every gathered Item not retained is sold for its caps value, added to the total (CH p19).
7. Leader: if the Leader model was removed in the battle, the player may now move the Leader card (the same or
   a different one) to another model, before the Settlement Phase starts; once it starts the Leader is fixed
   (CH p19, p24).
8. Models: a removed model is not dead. It returns for the next battle with every Perk it owns (CH p19).
   There are no injuries, no casualties and no experience in the Campaign Handbook (RULING: no injuries or
   experience).
9. Power Armor: a suit that ended the battle degraded stays degraded until a Power Armor Station repairs it in
   Step 2; an unrepaired suit may still be fielded on its degraded side only (CH p24).
10. Limited-use items: each copy refreshes between battles and is usable once per battle; it still needs to be
    retained and selected like any item (ERR p.17 FAQ).
11. Consequences not drawn in the battle carry to the next one (CH p24).

## 4. The Settlement Phase (CH p20-23)

### 4.1 Step 1: Build (CH p20, p24)
- Spend caps on Structures from the catalogue (section 4.4) and on Perks (section 2.3). Structures may need
  another Structure or a Perk first ("Requires"); a few are capped per settlement ("Maximum") (CH p21-23).
- Scrapping: any Structure may be scrapped for 50% of its cost back, unless another built Structure requires
  it, in which case the dependants go too (CH p20).
- Perks: no Structure is needed to buy one. One new Perk per model per Settlement Phase. A Perk may be removed
  for no refund and returns to the deck; a Perk required by another Perk cannot go unless the dependant goes
  too (CH p24).
- Power and water (CH p20-21): after building, allot Power. Every Structure needs 1 Power to work in Step 2
  unless its entry says "No Power required" (generators, water pump, Crop Fields, Boost racks, Land). Each
  Crop Field needs 1 Water instead. If supply is short the player chooses which Structures go unpowered; an
  unpowered Structure does nothing this phase. The Listening Post needs 1 Power however often it is used
  (CH p22).
- Markets (Robot Market, Creature Market): their draw-and-buy happens before any other settlement activity
  (SHEET; ERR p.3). The engine resolves them as the first action of Step 2 (RULING: market timing).

### 4.2 Step 2: Draw (CH p20, p22)
- Three decks are built for the phase: the Item Deck (every available Item card except Uniques), the Boost Deck
  and the Explore Deck (CH p20). "Draw a card of type T" means draw from the matching deck until a T turns up
  (CH p20).
- Each powered Structure is used once, in any order the player likes, seeing each result before choosing the
  next; unused Structures give nothing and do not carry over (CH p20). The Listening Post is the exception:
  any number of uses at 50 caps each (CH p22).
- "Draw X keep Y": draw X, keep Y, the rest go back to be sold at the end of the phase at their caps value
  (CH p18, p20). The Brahmin Structures modify a single draw-and-keep: Pen re-draws all of a Structure's cards,
  Troughs draw one more, Ranch keeps one more; Troughs and Ranch may be invoked after seeing the draw
  (CH p22).
- Operations Room: use one already-used Structure again. Leader's Office: instead of draw-and-keep, name the
  Item of the relevant type and pay its caps cost (CH p22; SHEET).
- Workbench draws respect the Perks: a Weapons Workbench keeps only the first Mod the player's Gun Nut /
  Blacksmith Perks allow (CH p21, p23 example).
- Armor Workbench may instead add one Armor Boost token to a unit (CH p21; max 4 on a model, ERR p.10 FAQ).
- Cooking Station draws one Food & Drink or Alcohol per Crop Field, at most 5, keeps 1 (ERR p.3 overriding
  CH p21).
- Medical items: anything that removes damage or conditions and is not Food & Drink or Alcohol; a medical card
  that cannot help the player's models (Robot Repair Kit without robots) may be skipped (CH p21).
- Explore (CH p22): Listening Post, Ranger Outpost and Scout Camp draw and resolve Explore cards immediately;
  they never enter the pool. Tests on an Explore card use the Leader's skills and attributes, at -2 to every
  skill and attribute if the Leader was removed in the last battle. The Leader may use Items from the pool for
  those tests, committed before the draw; food cannot prevent the damage an Explore card deals (ERR p.10 FAQ).
  Damage or other effects from an Explore card are assigned to models at set-up, after the force is picked
  (CH p22). A Consequence produced by an Explore card goes to the next battle's Event Deck and does not count
  against Stores (CH p22-23). Scout Camp may discard and re-draw an Explore card only before any test on it is
  attempted (CH p22).
- Hand-Written Note drawn during Explore: make a Search test and gain 2 Items on a success (ERR p.14 FAQ).
- Every draw is a seeded shuffle of the relevant deck (section 7), so a settlement phase replays identically.

### 4.3 Step 3: Select (CH p20, p22, p24)
- For each powered Stores the player takes 1 Item card or up to 2 Boost cards from the pool into the next
  battle. Boosts selected are capped at the Leader's highest attribute in total (CH p24).
- Lockers: 1 Item per Locker may be parked instead of sold; it sits out the next battle and rejoins the pool
  after it (SHEET; ERR p.3, p.15 FAQ).
- Everything else in the pool is sold for its caps value (CH p20).
- Mods: only Mods in the pool can be selected, and only if the settlement holds the Perk that allows that Mod
  type; Mods printed free on a unit card are extra and never selected (CH p24).
- Unique items and Quest reward items still need a Stores to enter a battle (CH p6, p24).

### 4.4 Structure catalogue (CH p21-23; SHEET; ERR p.3, p.5)
Costs in caps. "Power" is the Structure's own need in Step 2 (1 unless noted). Data: `data/1e/campaign/structures.json`.

Infrastructure (CH p21):

| Structure | Cost | Effect | Needs |
|---|---|---|---|
| Generator - Small | 100 | +3 Power | no Power |
| Generator - Medium | 200 | +7 Power | no Power |
| Generator - Large | 300 | +12 Power | no Power |
| Water Pump | 50 | +3 Water | no Power |
| Water Purifier | 100 | +12 Water | 1 Power |
| Crop Field (Super Mutants: Meat Bag) | 30 | enables Cooking Station draws; max 5 | 1 Water, no Power |

Crafting (CH p21; ERR p.3; SHEET):

| Structure | Cost | Effect | Needs |
|---|---|---|---|
| Weapons Workbench | 100 | draw and keep 1 attachable weapon Mod, per bench | Blacksmith or any Gun Nut Perk |
| Armor Workbench | 100 | draw and keep 1 Armor Mod (not Power Armor), or +1 Armor Boost token on a unit | Armorer Perk |
| Power Armor Station | 100 | draw and keep 1 Power Armor Mod, per station; repairs one degraded suit each | Armorer Perk |
| Chemistry Station | 100 | draw and keep 1 Chem | |
| Cooking Station | 100 | draw 1 Food & Drink or Alcohol per Crop Field (max 5), keep 1 | Crop Fields |
| Robot Workbench | 100 | draw and keep 1 Robot Mod, per bench | Robotics Expert Perk |
| Creature Pen | 100 | draw and keep 1 Creature Mod, per pen | Creature Trainer Perk |

Item shops (CH p21): three tiers per row, draw 1 / 2 / 3 keep 1.

| Item type | Stand (draw 1) | Shop (draw 2) | Emporium (draw 3) |
|---|---|---|---|
| Any item | Scavenging Stand 50 | Scavenging Stall 100 | Scavenging Stores 150 |
| Junk / Gear | Trading Stand 100 | Trading Shop 150 | Trading Emporium 200 |
| Weapon | Weapons Stand 100 | Weapons Shop 150 | Weapons Emporium 200 |
| Armor | Armor Stand 100 | Armor Shop 150 | Armor Emporium 200 |
| Clothing | Clothing Stand 100 | Clothing Shop 150 | Clothing Emporium 200 |
| Food & Drink / Alcohol | Drink Stand 100 | Bar 150 | Restaurant 200 |
| Medical | First Aid Station 100 | Clinic 150 | Surgery Center 200 |

Boost racks (CH p23; no Power): draw 1 / 2 / 3 keep 1.

| Boost type | Small rack | Medium rack | Large rack |
|---|---|---|---|
| Any | Boston Bugle 35 | 55 | 75 |
| Practiced | Grognak the Barbarian 50 | 75 | 100 |
| Instinctive | Wasteland Survival Guide 50 | 75 | 100 |
| Tactical | U.S. Covert Ops Manual 50 | 75 | 100 |
| Cunning | Astoundingly Awesome Tales 50 | 75 | 100 |

Other (CH p22; ERR p.3; SHEET):

| Structure | Cost | Effect | Needs / max |
|---|---|---|---|
| Stores | 150 | Step 3: take 1 Item or up to 2 Boosts into battle, per Stores | |
| Maintenance Shed | 60 | after a battle retain 1 Item or up to 2 Boosts, per shed | |
| Lockers | 70 | Step 3: park 1 Item per locker; it rejoins the pool after the next battle | |
| Brahmin Pen | 300 | re-draw all cards of one draw-and-keep | Local Leader |
| Brahmin Troughs | 200 | draw 1 extra card in one draw-and-keep, decided after seeing the draw | Local Leader |
| Brahmin Ranch | 250 | keep 1 extra card in one draw-and-keep, decided after seeing the draw | Local Leader II; max 1 |
| Operations Room | 400 | use one already-used Structure again | Local Leader II; max 1 |
| Leader's Office | 500 | in place of one draw-and-keep, name 1 Item of that type and pay its caps cost | Local Leader II; max 1 |
| Robot Market | 250 | draw 4 Robot Mods, buy any number at their cost, before anything else | max 1 |
| Creature Market | 250 | draw 4 Creature Mods, buy any number at their cost, before anything else | max 1 |
| Land | 500 or 5 Quests | +10 Structure slots | not a Structure, no Power |

Exploration (CH p22; ERR p.5 corrects the sheet's Ranger Outpost to 100):

| Structure | Cost | Effect | Needs / max |
|---|---|---|---|
| Listening Post | free (starting) | pay 50 caps per use: draw and resolve 1 Explore card; repeatable; 1 Power total | max 1 |
| Ranger Outpost | 100 | draw and resolve 1 Explore card, no caps | |
| Scout Camp | 200 | discard and re-draw 1 Explore card before any test on it | |

Counts are otherwise unlimited (SHEET).

## 5. Rules adaptations, force creation and campaign scenarios (CH p24-27; CH p28-49)

### 5.1 Creating a force with a settlement (CH p24, p26; ERR p.4, p.15)
- The force is built to the battle's caps limit as usual (750 regular, 500 small, 1,000 large; CH p26) but the
  cards are restricted: every unit is available; each unit may take any of its standard equipment (the black
  list under the unit name on its AI card; standard equipment is never shared between units); Item minimum
  requirements are ignored (CH p24; ERR p.4); Equipped items printed on a unit card are mandatory and free
  (ERR p.4, p.15 FAQ; FORCE-006).
- Items selected in Step 3 may go on any unit, whatever its model count, and are costed per model (CH p24).
- Heroic cards may be assigned freely; only bought Perks may be equipped, and only on the models that bought
  them; the Leader model carries its fixed Leader card (CH p24). Unequipped Perks are kept but cost nothing
  and do nothing that battle (CH p24).
- The selected Boosts are the player's hand (CH p24).
- Creatures only with a named faction matching the Leader's (ERR p.4; FORCE-007).

### 5.2 Battle set-up with campaign cards (CH p4-6, p27; ERR p.4)
Battlefield set-up follows CH p27 (scenario, force, cards, terrain by alternating placement after a Luck flip,
The Wasteland, readiness markers, dice and rulers, reference cards, random Advantage unless the scenario says,
deployment alternating one model at a time from the Advantage holder). The campaign adds: build the Event Deck
(section 2.1) including each player's Consequences (section 2.2), each player picks a Quest (section 2.5),
assigns Explore-card effects to models (section 4.2), and keeps the Boost hand secret (section 2.4).

### 5.3 Caps awards by scenario (CH p19, p28-42; BOX; RR)
- Default: 200 winner, 120 loser, +50 each at 1,000+ caps forces; a draw pays both the winner's 200 (section
  3.3). Data: `data/1e/campaign/caps-awards.json`.
- Scenario text overrides the default where it names caps: Police Station Defense 150 to the winner (CH p29);
  Super Duper Sweep banks and holds caps during play (CH p32-33); Suit Up 200 attacker win, 200 / 100 defender
  major / minor (CH p34); the box scenarios and AI scenarios carry their own tables (spec 17; BOX; RR; CH
  p40-42). Where a scenario names caps for only one outcome, the other side takes the default loser's 120
  (RULING: partial award tables).
- `GameResult.caps` already carries the scenario's number; `fromBattle` reads it, falls back to the default
  table, and applies the 1,000-caps bonus from the force values recorded in the campaign (section 7).

### 5.4 Linked scenarios and Campaign Consequences (CH p35-39; ERR p.4)
Five linked scenarios form the book's sample campaign; the final result of Hold the Fort decides it. Each result
carries a Campaign Consequence into a later scenario (the next one, or the final one). Layouts are spec 17's;
the consequences the campaign layer must apply are:

| Scenario | Defender major / minor | Attacker major / minor |
|---|---|---|
| 1 Defend the Farm (500 caps, 5 rounds) | 3 Food cards chosen and allocated for the final battle plus 1 for the next / 1 Food for the next | Defender spends 50 fewer caps in the final scenario / 1 Food for the next |
| 2 Newshound (500, 5) | deploys second in the final scenario, and 1 AP for three models plus first turn in the next / 1 AP for three models plus first turn in the next | deploys second in the final scenario and picks who starts the next / picks who starts the next |
| 3 Hurt Locker (750, or 550 on a failed Leader Cha test, 5) | 2 free turrets in the final scenario and 1 free Weapon card for the next / 1 free Weapon card for the next | 2 Missile Launcher shots at long range with Heavy Weapon 5 after deployment in the final scenario, and 1 free Mine of choice before the next / 1 free Mine before the next |
| 4 Reinforcements Have Arrived (750, or 550 on a failed Leader Per test, 5) | +50 caps of free troops in the final scenario / +25 caps | picks first turn in the final scenario and deploys up to Black instead of Blue there (ERR p.4 corrects Red/Yellow) / picks first turn in the final |
| 5 Hold the Fort (1,000, 5) | campaign result by margin | campaign result by margin |

Roles: Settlers / Brotherhood defend in 1, 2 and 5 and attack in 3; Super Mutants / Creatures take the other
side; 4 has the Settlers defending the column (CH p35-38). Each consequence is a declarative `effect` record on
the scenario (spec 20 "Campaign records"); the ones the engine cannot apply yet (free turrets, pre-game missile
shots, free mine) are logged as RULING: linked consequences not modelled, and the campaign shows them as text.

### 5.5 Tutorial scenarios (CH p44-49; ERR p.4-5)
The five Tutorials use fixed forces and the chapter-by-chapter rules of play; they award no caps and carry no
mechanical consequence, only a narrative outcome per side read after each (CH p49). The campaign layer offers
them as a "Tutorial trail" with the outcome text shown on game over and no settlement phase between them
(RULING: tutorial trail). Errata to fold into spec 17's layouts: Fort Davis Super Mutants are 3 Super Mutants
plus 2 Mutant Hounds, Laser Rifle in the Wasteland deck instead of the Board (ERR p.4); The Lost Journal gives the
grenades to the Sole Survivor, Super Mutants cannot interact with Searchables, Searchables at least Yellow apart
(ERR p.4); The Coming Storm siren is an Interact, no Action, once per activation (ERR p.5).

## 6. Worked example: one full between-battle round
A Survivors settlement after its third battle, lost 120 caps to 200 (both forces 750 caps). State before: 177
caps; Structures 2 Generator - Small, 1 Stores, 1 Maintenance Shed, 1 Listening Post, 1 small Boston Bugle,
plus the Gun Nut (Rifle) Perk on the settlement (free Weapons Workbench); Perks: Sole Survivor owns Mysterious
Stranger. The force carried in a Hunting Rifle (Sole Survivor standard equipment), a Stimpak with a Counting
Token (two copies) and 3 Boosts, and found a Bolt-Action Pipe Rifle. The Sole Survivor (Leader: Hunter) was
removed. Seed: the campaign's rng state advanced per draw.

1. After a battle (section 3.3): caps 177 + 120 = 297. Strip: the Hunting Rifle stays (standard equipment);
   the pool candidates are Bolt-Action Pipe Rifle, Stimpak x2 (two cards) and 1 unused Boost. One Maintenance
   Shed: keep the Bolt-Action Pipe Rifle. Sell the two Stimpaks and the Boost for their caps values (say 2 x 6
   and 0): caps 309. No Uniques, no Lockers. The Leader was removed: the player keeps Hunter on the Sole
   Survivor anyway (allowed). Every removed model returns intact.
2. Step 1 Build: buy an Armor Shop (150): caps 159. Buy the Armorer Perk (3) for the settlement: caps 156, and
   a free Armor Workbench appears (room used: 10 of 15). One new Perk for Dogmeat? Dogs cannot take Perks that
   need skills they lack; skip. Power: 6 supplied; needs are Stores 1, Shed 1, Listening Post 1, Weapons
   Workbench 1, Armor Workbench 1, Armor Shop 1 = 6 (the Bugle rack and generators need none). All powered.
3. Step 2 Draw, in the order chosen: Weapons Workbench draws from the seeded Item Deck until the first Mod a
   Gun Nut (Rifle) may attach: Stun Pack (melee, skipped), then Comfort Grip (kept, into the pool). Armor Shop:
   draw 2 Armor, Damaged Hazmat Suit and Sturdy Leather Armor, keep the Sturdy Leather Armor. Armor Workbench:
   draw and keep 1 Armor Mod: Dissipating. Boston Bugle (small): draw and keep 1 Boost: Take Two. Listening
   Post: pay 50 (caps 106), draw Gun for Hire; the Leader is tested at -2 (removed last battle) where the card
   asks; the player pays the card's 30 caps (caps 76) and gains the mercenary Consequence for the next battle.
   A second Listening Post use is affordable (50) but declined.
4. Step 3 Select: one Stores. The pool is Bolt-Action Pipe Rifle, Comfort Grip, Sturdy Leather Armor,
   Dissipating, Take Two. Take the Sturdy Leather Armor (1 Item). The Boost cap is Hunter's highest attribute
   (7), moot with one Stores. The rest sell: caps 76 + their values. The Consequence costs no Stores.
5. Create the force (section 5.1): 750 caps from units with standard equipment, the Sturdy Leather Armor on
   the Settlers (costed per model), Mysterious Stranger equipped on the Sole Survivor (its cost counts), Hunter
   fixed on the Sole Survivor, Heroic as chosen. Hand: none. Quest: Thief's Trail Part 1. At set-up the
   Consequence is shuffled into the Event Deck.

The same seed and the same choices reproduce this round exactly (section 7, reducer).

## 7. Frozen interface: `src/campaign/` (NEW, outside the frozen engine)

Recorded verbatim from the M6 stage brief. No file in `src/engine/{types,decider,view,rng,pending}.ts`
changes; the campaign layer imports the engine's `createGame`, `seedRng`/`deriveSeed` and `GameState` only.

```
src/campaign/
  types.ts:    Campaign { id, edition, name, createdAt, players: CampaignPlayer[], round: number, log: CampaignLogEntry[], current?: { scenarioId, seats } }
               CampaignPlayer { seat, faction, caps, pool: PoolCard[], structures: StructureInst[], roster: RosterModel[], perks, quests: QuestProgress[], land: number }
               RosterModel { id, unitId, name?, injuries: Injury[], xp, perks: string[], equipped: string[] }
  reducer.ts:  pure (campaign, CampaignAction) => Campaign for every between-battle step; every random draw takes an rng seed from the campaign (src/engine/rng.ts) so it is deterministic and replayable.
  sequence.ts: the CH between-battle sequence as a list of named steps with "what the player decides" per step (the settlement screen renders it generically).
  battle.ts:   toBattle(campaign, scenarioId) -> the setup bundle the existing createGame takes (forces from rosters and pool); fromBattle(campaign, finalState) -> campaign with caps, injuries, xp, items and quest progress applied.
  store:       localStorage key "fell-in.campaign.v1", one campaign at a time (new campaign replaces after a confirm).
```

Notes that bind the implementation (all additive, none touching a frozen file):
- `sequence.ts` steps, in order: `afterBattle.caps`, `afterBattle.strip`, `afterBattle.retain`,
  `afterBattle.lockers`, `afterBattle.sell`, `afterBattle.leader`, `build.market`, `build.structures`,
  `build.perks`, `build.power`, `draw.structures` (repeat per Structure, player picks the order), `draw.explore`,
  `select.stores`, `select.lockers`, `select.sell`, `force.create`, `force.quest`, `toBattle`. Each step
  names its decision and the legal choices; a step with nothing to decide auto-advances.
- `reducer.ts` actions mirror the steps one to one (`CampaignAction.type = '<step>'`); each draw calls
  `deriveSeed(campaign.id, round, step, n)` so the n-th draw of a step is a function of the campaign seed.
- Under Campaign Handbook rules `RosterModel.injuries` is always `[]` and `xp` is always 0; the fields are
  reserved for the Homestead expansion (RULING: no injuries or experience).
- `toBattle` builds `CreateGameOpts.forces[seat]` from the roster: `{unit, count, items, heroic, leader}` per
  `ScenarioForce`, with equipped Perks passed in an additive optional `perks: string[]` on `ScenarioForce`
  (`src/data/types.ts`, not a frozen engine file; spec 20 "Campaign records").
- `fromBattle` reads `state.result.caps` and the removal and item events in `state.log`; the campaign never
  inspects hidden information it should not have (it runs after game over, when the whole state is public).
- Data: `data/1e/campaign/{structures,perks,boosts,events,quests,explore,injuries,caps-awards}.json`, each
  record `{ id, name, cost?, effect: { "code": "<hook>" } | declarative fields, source }` (spec 20).
- Client: `src/client/ui/settlement/` reached from the start screen ("Campaign": new or continue), walks the
  sequence step by step, then "To battle" launches the normal game with the campaign's forces against the chosen
  opponent (bot, hot-seat or the Wasteland AI) and returns to the settlement on game over.

## 8. Shipped versus stubbed (checked 2026-10-17)
- Shipped: the sequence, reducer, decks, linked scenarios, toBattle/fromBattle, the localStorage store, the settlement screen and
  the round trip back from a finished battle. Perks (66) and structures (63) carry full records.
- Stubbed: card texts for boosts (34 of 38), events (7 of 13), quests (18 of 18) and explore cards (35 of 36) are placeholder
  records that keep the name and the deck count; they have no effect until the cards are sourced (section 1.3, GAP-3).
- Not built: the Homestead expansion (section 1.2) and any persistent injury or experience.
