# 10 Overview: components, modes, round, glossary

Fell-in ports the 1st-edition tabletop rules of Fallout: Wasteland Warfare (Modiphius, 2018) for the
Two Player Starter Set. Mechanics are 1:1; all wording here is ours. Where the Errata/FAQ v10 changes
the rulebook, the errata wins and the spec states the errata version only.

## Source keys (used in every citation)
| Key | File in `docs/sources/` (gitignored) | Cite as |
|---|---|---|
| RoP | rules_of_play.pdf | section + printed page, e.g. (RoP s2.6 p13) |
| ERR | errata_faq_v10.pdf | (ERR p.N) = PDF page; "E:" errata, "FAQ:" Q&A |
| GA | getting_acclimated_v1.3.pdf | (GA A1-A4) |
| AIH | ai_handbook_v1.0.pdf | (AIH s2-s4) |
| COOP | coop_handbook_v1.0.pdf | (COOP s2-s4) |
| RR | red_rocket_ai_scenario.pdf | (RR p1-2) |
| DICE | dice_ruler_ref.pdf | (DICE) |
| CARDS | 2p_cards.pdf | (CARDS p.N) = PDF page |
| COST | wave9_costs.pdf | (COST "<name>") |
| BOX | foww_box_scenarios_1-5_download.pdf (fetched from the 1st-ed downloads page) | (BOX SCP-00N) |
| BLOG | modiphius.net/blogs/news/ai-game-play (dev blog #10) | (BLOG) |
| CH | foww-campaign-handbook-digital-final_compress.pdf (Campaign Handbook, owner copy) | (CH p<printed page>); PDF page = printed + 2 |
| AIRF | ai_response_flowcharts.pdf | (AIRF) |

## Components (logical; our own art)
- Models on round bases: Normal 32 mm, Large 40 mm, Huge 60 mm or wider (RoP s2.8 p17). A model in
  Power Armor uses the Power Armor base size (ERR p.10 FAQ).
- Dice: 1 white d20 skill die, 4 colours of d12 effect dice (black damage, green accuracy, yellow armor
  reduction, blue special), 1 red d12 armor die (RoP s2.4 p10-11; DICE). Faces in `13`.
- Range rulers: Orange 2, Yellow 4, Red 6, Green 8, Blue 10, Black 12 inches (DICE). See `14`.
- Tokens: readiness (ready/used), advantage marker (also the scatter arrow), regular/radiation damage
  (double-sided), critical point, reaction, charge bonus (black, green), bonus die (yellow), luck
  (luck face / blank face), armor boost (1 or 2 icons), counting, -2 penalty, mine, slow-firing
  (loaded/empty), conditions (fire, poison, stun, slow, frozen), lock, computer, AI number markers,
  investigation markers, searchable markers (RoP App.1 p54).
- Cards: unit, weapon, armor, clothing, power armor, mod, chem, alcohol, food and drink, gear, junk,
  perk, leader, heroic, faction reference, general reference, AI, and campaign decks (event, explore,
  quest, boost, danger, stranger, creature) (RoP s1.4 p6; s3.2 p31). Fields in `16`, schemas in `20`.

## Game modes (scope order from PLAN.md)
1. Versus: two sides, our bot or a human each (RoP s2.1 p8).
2. Hot-seat: two humans, one screen; hidden info handled by a hand-over screen (VIEW in `12`).
3. Solo / co-op vs the official AI card system (COOP s2; AIH; `18`).
4. Settlement / campaign (CH, mostly unsourced; `19`).
Team vs team uses the co-op rules with a human team in place of the AI (COOP s4).

## Game structure
- Set-up: build forces (`16`), set up the battlefield and agree terrain properties (`14`), place
  scenario markers, build The Wasteland decks, deploy (`17`). Unless the scenario says otherwise,
  players alternate placing one model at a time, the Advantage holder first (ERR p.4 E: CH p27).
- A game is a number of rounds set by the scenario. Each round every model is made Ready and Used
  exactly once (RoP s2.6 p13). Full turn rules in `11`.
- Advantage: round 1 to the side with fewer models (random on a tie) unless the scenario says
  otherwise; from round 2, to the side with fewer models; on a tie the current holder passes it to the
  opponent. The holder chooses who takes the first turn of the round (RoP s2.6 p13).
- Victory comes only from scenario conditions (`17`). Models leaving by the edge count as eliminated
  for scoring but survived for everything else (RoP s4.2 p39).

## Glossary
| Term | Meaning |
|---|---|
| Unit / model | A unit card plus 1+ models sharing its items; each model resolves alone (RoP s2.5 p12). |
| Unique | Max one model of that unit (any version, e.g. Dogmeat variants) per force (RoP s2.5 p12). |
| Unready / Ready / Used | Readiness states of a model within a round (RoP s2.6 p13). |
| Turn | One player's Ready step plus optional Use of all Ready models. |
| Activation | Using one model: up to 2 Actions plus Quick Actions bought with AP. |
| Action / Quick Action | Main activity (2 per activation) / extra activity at -2 or one ruler shorter (RoP s4.3 p40). |
| AP / CP | Action Points (spent on AP use icons) / Critical Points (charge a weapon's Critical Meter). |
| Skill Value (SV) | Attribute value on the row carrying the skill icon, plus modifiers. |
| Speciality | +2 SV with a named item or skill (RoP s2.4 p10). |
| Engaged | Base-to-base with an opposing model (RoP s2.13 p24). |
| Interact | Base contact with an object while not engaged (RoP s3.1 p28). |
| LoS / LoC | Line of Sight (any base point to any base point) / Line of Cover (centre to centre) (RoP s2.8 p17). |
| Trigger / Reaction | Opponent activity a Prepared model is aware of / its Quick Action response (RoP s4.4 p41-42). |
| Awareness | Colour on the unit card that sets trigger distances and marker viewing (RoP s3.2 p29, s4.4 p42). |
| Presence | Colour on the unit card; Presence skill range and aura range (RoP s3.1 p28, s6.1 p50). |
| Health | Attribute row with the heart icon; damage tokens >= Health removes the model (RoP s2.9 p19-20). |
| Strong Armor | Fixed "+N" part of an armor rating, always blocks N (RoP s2.10 p21). |
| Heroic | Card on a single-model unit: V.A.T.S., +1 Health, Criticals, Luck, AP use icons (RoP s6.1 p50). |
| Leader | One per side; grants abilities; sets the force's faction (RoP s6.1 p50-51). |
| The Wasteland | Off-table decks: Item, Danger, Creature, Stranger, Event (RoP s3.2 p31). |
| Searchable / Investigation marker | Face-down scenario markers, see `11` Search and `17`. |
| Caps | Points currency for forces and rewards (COST; BOX). |
| One colour shorter | Step down Black>Blue>Green>Red>Yellow>Orange; never below Orange (ERR p.9 FAQ). |
