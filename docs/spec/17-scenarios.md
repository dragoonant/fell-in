# 17 Scenarios

Each scenario becomes a JSON record (`20` ScenarioDef). Summaries are mechanical and in our own words;
our flavour text is written fresh. Table 3'x3' (36x36 in) unless noted. Markers: Investigation (I),
Searchable (S). "Within X of edge" = deployment depth.

## 1. Common scenario rules
- Set-up order: terrain (agree properties), scenario markers, Wasteland decks (all unused Item,
  Danger, Creature, Stranger cards shuffled per deck, plus Events in campaign), deployment alternating
  one model at a time from the Advantage holder unless stated (RoP s3.2 p31; ERR p.4).
- Extra S markers may be added for scavenging; letter markers are scenario-only (ERR p.15).
- Rounds: as the scenario says; "until a side wins" = no round limit.
- Victory: only the listed conditions; rewards in caps feed campaign mode (`19`).
- Scenario events can be triggers (RoP s4.4 p42).

## 2. Getting Acclimated tutorials (GA A1-A4) - single model, no opponent
| ID | Name | Teaches | Win |
|---|---|---|---|
| GA-1 | Navigating the Wastes | Move with Sole Survivor Day One; avoid green hazard zones; reach an S crate then an exit | reach exit untouched |
| GA-2 | Shooting Range | Shoot 10mm Pistol at 5 I "cans", move if out of range | 1 hit on each |
| GA-3 | Weird Harvest | Charge/Move into contact, melee with Baseball Bat vs 5 I "plants" | 1 hit on each |
| GA-4 | Solving the Rat Problem | Hunting Rifle vs 5 I "mounds" (3 Health, 1 phys armor) | 1 damage after armor on each |
Tutorial mode: only numbers and X on the skill die; icon faces count as 1 and succeed (GA A2).

## 3. Box scenarios 1-5 (BOX SCP-001..005) - versus, any factions by caps
| ID | Name | Set-up | Special rules | Rounds | Victory (reward) |
|---|---|---|---|---|---|
| BOX-1 | Ad Victoriam | Each side within Yellow of own edge; 3 S on the centre line, Green apart; each player places 3 buildings between the enemy zone and the centre, Yellow apart | Brotherhood side: Action in contact with an S gains and equips random Power Armor; the other side may attack and destroy any unclaimed suit (armor applies) | 6 | Kill all enemies: defender 300; Brotherhood 200 + 50 per intact equipped suit |
| BOX-2 | Big John's Salvage Showdown | Dense LoS-blocking containers (~Yellow x Orange, Orange apart), 1 S at centre; Super Mutant defenders within Red of S; attacker within Yellow of any edge | Action in contact picks up the nuke; carrier passes it by Action in contact or drops on death (engaged defenders may grab it); hits on the carrier or any model within Orange of the nuke roll the armor die: 1 = nuke explodes | until a win | Attacker: off any edge 200; defender: still held by round 9, 200; explosion = both lose |
| BOX-3 | Quest for Knowledge | Defender builds a walled school (all walls block LoS); alternate placing 5 S books inside, Yellow apart; defender inside, attacker within Yellow of an edge | Attacker +20% caps; Action in contact takes a book; drop at death point; carry off any edge | until a win | Defender: kill all 200; attacker: 3+ books off 200 |
| BOX-4 | Radio Tower Takeover | Tower at centre (<= Yellow); defenders within Yellow of it, may place a turret, may hold back up to half caps; attacker within Red of any edge | Attacker +20% caps; control = in contact with tower without enemy contact; 3 consecutive controlled turns lets the defender bring reserves worth double the held-back caps | 6 | Most units in contact at end; tie broken by points: major 250, minor 150 |
| BOX-5 | Flip's Revenge | Ring of buildings, S at centre, Yellow apart; kidnappers (double points) within Yellow of S; Flip (one non-creature Super Mutant, free Heroic) within Red of an edge | Flip's Action at the S frees Sarah (Survivor model with Laser Rifle, joins Flip's side) | 6 | Sarah off any edge: Flip 200; Sarah killed: kidnappers 150; both dead: kidnappers 200 |
Source: `docs/sources/box_scenarios_1-5.pdf` (BOX SCP-001..005): BOX-1 p1-2, BOX-2 p3-4, BOX-3 p5-6, BOX-4 p7-8, BOX-5 p9-10.
BOX-1 sides are Scavengers (defender, pays 300) against the Brotherhood (attacker, 200 + 50 per worn suit); its only printed
win is elimination, so we add RULING timeout-points (points on table at round 6, no caps). BOX-4 printed Defender rows say
"the enemy controls the Tower", a typo; both sides win Major with more models at the tower, Minor on equal models and more points.
Note: BOX-1 and BOX-4 name Brotherhood/turrets; with starter models use Aspirant Goddard and skip the
turret (RULING).

## 4. AI scenarios (AIH s4; RR; COOP s4) - solo/co-op, AI rules in `18`
| ID | Name | Forces (AI vs player) | Key rules | Rounds | Victory |
|---|---|---|---|---|---|
| AI-RR | Red Rocket Misunderstanding (2'x2') | AI SM: Heroic Brute (Sledgehammer), 2 SM (Board, Bolt-Action Pipe Rifle), 2 Hounds (Hound Bite). Player Survivors: Heroic Sole Survivor (Hunting Rifle, Baseball Bat), Dogmeat, 2 Settlers (Laser Rifle), Enslaved Tech (Combat Shotgun) | Diner Yellow from a corner; AI markers exactly Orange from the diner, Yellow apart; survivors in the opposite corner within Blue x Blue; a Yellow-long Red Rocket piece in their zone. AI objective: destroy the Rocket (10 Health, armor 1 all, rad immune; shootable, meleeable in contact, not an engagement). Model within Orange: Action + Str test pushes it Yellow | 4 | SM: rocket destroyed (150). Survivors major: rocket pushed past the diner off the opposite corner edge (150); minor: rocket has 4+ health left after round 4 (70) |
| AI-MISSILE | The Missile | AI SM: Brute, 2 SM, 2 Hounds, Enslaved Tech (Combat Shotgun). Player: Sole Survivor in T-60 (Combat Rifle, Baseball Bat), 2 Settlers (Assault Rifle), Dogmeat | Sled starts Black from an edge, exits the opposite edge; AI within Yellow; player zone A at start or zone B at round 2. AI: Protect [Missile]. Sled moves Red at end of every turn by shortest route ignoring difficult terrain, pushes or crushes models; 5 Health, armor 3/1/X; Lockpick Use in contact = 1 damage no armor; cover, impassable, not LoS-blocking. Missile hit on: X when shooting within Yellow of/at the sled, or any area damage; then armor die <= previous hits = detonation | until result | Player: sled sabotaged; AI: sled exits; detonation: nobody |
| AI-BREAKIN | The Break-in | AI SM: Brute, 2 SM, 2 Hounds, Enslaved Tech, 2 Settlers. Player: Goddard in T-60 (Plasma Rifle, Pipe Wrench), Sole Survivor (Combat Rifle, Baseball Bat), Dogmeat | Walled compound with a valve hut (both block LoS); patrol routes of numbered/lettered markers (loops); player within Orange of any edge. AI patrols with Objective response Go To [next route marker], hounds Yellow move, until it is aware of a trigger or sees a player model within one Awareness length; then matrix with Defeat [any enemy any AI saw this or last round]. Player Interact opens the valve | 6 | Player: valve fixed and half the player models exit |
| AI-TECH | The Escaped Tech | AI: 2 SM (Bolt-Action Pipe Rifle, Board), 2 Hounds. Player: Sole Survivor (Hunting Rifle, Baseball Bat), 2 Settlers (Combat Rifle), Dogmeat | Opposite corners within Yellow; 8 I (7 blank, #1 = Tech) Yellow apart, not in the two marked squares. Phase 1: hounds Use [nearest I] (Awareness Red when peeking), always O; SM Protect [own hound]. Player models peek at Yellow Awareness. Hound reveals #1 -> Tech model, phase 2; player reveals -> player controls the unarmed Tech (Move only, won't move if a hound within Yellow unless a player model is too) until it enters AI LoS (phase 2). Phase 2: hounds Protect [Tech] (always O), SM Use Presence [Tech]; success -> phase 3: hounds and SM Protect [Tech], Tech Go To [exit]. Exits: edge within Black of the opponent's starting corner | none | Player: controlled Tech exits (ph 1-2) or all AI removed (ph 2-3); loss: Tech removed; AI: AI Tech exits |
| COOP-SEWER | Into the Sewer | AI BoS: Goddard in T-60 (Baseball Bat), 2 Settlers (Assault Rifle), Dogmeat; P1: Sole Survivor (10mm), Enslaved Tech (Combat Shotgun); P2: 2 SM, Brute | Hatch at centre with 2 locks; 5 I (3 blank, #1, #2) = key boxes, revealed number becomes a lock or terminal marker; Use Expertise (matching) takes a shareable key; key-holder Interact (no Action) removes a lock; both off = exit by touching hatch. Rounds 4-6: flip luck, on luck face a Deathclaw (Defeat [any model]) enters once. AI: Defeat [Sole Survivor] | 8 | Major: SS + 2 others exit; minor: SS exits |
| COOP-CAGE | Blood Cage | P1: Heroic Sole Survivor Day One; P2: Heroic Settler (Sturdy Leather Armor, Mysterious Stranger). AI wave 1 (round 2): Aviator (Aviator Cap, Pipe Pistol), Hound; wave 2 (rounds 3-6, armor die < round-1): Brute, SM | Players chained: combined distance from their holes <= Black, pulled otherwise; chain 2 Health, armor 2+1/2+1, +1 green to hit; Improvised Weapon only at start; 12 S (all = Item) from a fixed 12-card deck; non-melee weapons 3 uses. AI: Defeat [any enemy] | unlimited | Last side standing |
| COOP-MUNITIONS | Dangerous Munitions | P1: Sole Survivor (Combat Rifle), Dogmeat; P2: Goddard in T-60 (Baseball Bat), Settler (Laser Pistol); AI: Brute, 2 SM, 2 Hounds | Munitions token diagonally Orange from a corner; AI within Green of the opposite corner; two unclimbable walls (Black+Orange long, from edge midpoints); players in the other corners within Red. AI: Go To [munitions] | 8 | AI: non-dog AI model can Interact at round end; players: all AI removed or survive round 8 |

## 5. Campaign Handbook tutorials 1-5 and settlement scenarios (CH p27-48)
Not in any free source. Known from errata only: Fort Davis (SM force 3 SM + 2 Hounds), The Lost
Journal (3 frag grenades on Sole Survivor; SM cannot interact with S; 8 S Yellow apart), The Coming
Storm (siren: Interact, no Action, once per activation), Demolition, Super Duper Sweep, Defend the
Farm (8 S crops) (ERR p.4-5). Placeholder IDs CH-T1..T5; content gap logged in needs-rules-check.
