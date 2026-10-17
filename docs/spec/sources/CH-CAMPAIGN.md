# CH-CAMPAIGN: Campaign Handbook page map and campaign card-source inventory (2026-10-17)

All PDFs live in the gitignored `docs/sources/` of the main checkout; nothing is copied here. Page numbers for
the Campaign Handbook (CH) are book pages (PDF page = book page + 2). Other PDFs are cited by PDF page. Text was
extracted with PyMuPDF; pages whose cards are pictures were rendered and read. Replaces the "no free copy"
notes in the old spec 19 and in `R3-campaign.md` section "Gaps remaining": the owner's copy of the Campaign
Handbook closes GAP-1, GAP-2, GAP-4 and GAP-5; GAP-3 is closed for perks only (see the inventory).

## 1. Campaign Handbook page map (foww-campaign-handbook-digital-final_compress.pdf, 52 PDF pages)

| Book p | Section | Content used by |
|---|---|---|
| 1 | Contents and credits | this map |
| 2 | 1.1 Introduction (what each chapter adds; Battle Mode is a separate download) | spec 19 s1 |
| 4 | 2.1 Events: deck building, draw timing, Flip icon, Consequence on top | spec 19 s2.1; EVENT-* |
| 5 | Consequences; 2.2 Perks; 2.3 Boosts (four types, hand rules, half highest attribute) | spec 19 s2.2-2.4 |
| 6 | 2.4 Quests: sides, multi-part, completion, rewards | spec 19 s2.5; QUEST-* |
| 8-16 | 3 Against the Wasteland (solo / co-op AI) | spec 18 (not this file) |
| 18 | 4.1 Settlement overview (3 steps), 4.2 starting settlement, 15 slots, land | spec 19 s3.1-3.2 |
| 19 | 4.3 After a Battle: 200/120 caps, +50 at 1,000, strip, Sheds, sell, Leader change, no eliminations | spec 19 s3.3; SETT-* |
| 20 | 4.4 Step 1 Build (scrap 50%), Power and Water, Step 2 Draw (three decks), Step 3 Select | spec 19 s4.1-4.3 |
| 21 | 4.5 Structures: infrastructure, crafting, item shops table | spec 19 s4.4 |
| 22 | Other structures (Stores, Shed, Brahmin x3, Operations Room, Leader's Office, Land); Exploration structures; Explore tests use the Leader | spec 19 s4.2, s4.4 |
| 23 | Boost racks table; 4.6 worked example | spec 19 s4.4, s6 |
| 24 | 4.7 Rules adaptions: Perks, Consequences, Boosts, Leaders, Unique, Mods, Power Armor, force creation with a settlement | spec 19 s3.3, s5.1 |
| 26 | 5.1 Creating a force (caps limits 500/750/1000, single-model cards, Boosts may cost caps); 5.2 Force set-up | spec 19 s5.1; spec 16 |
| 27 | 5.3 Battlefield set-up (11 steps) | spec 19 s5.2 |
| 28-34 | 5.4 Stand-alone scenarios: General Atomics Facility, Police Station Defense (150 caps to the winner), Demolition, Super Duper Sweep (banked caps), Suit Up (200/200/100) | spec 17; spec 19 s5.3 |
| 35-39 | 5.5 Linked scenarios 1-5 with Campaign Consequences tables | spec 19 s5.4 |
| 40-42 | 5.6 AI scenarios | spec 17 s4, spec 18 |
| 44-48 | 6.1 Tutorial scenarios 1-5 | spec 17 s5 |
| 49 | Tutorial outcomes per faction (narrative only) | spec 19 s5.5 |
| 50 | Appendix: card anatomy (unit, weapon, AI, heroic) | spec 20 s3.1 |

## 2. Errata and FAQ entries that touch the campaign (errata_faq_v10.pdf, PDF pages)

| ERR p | Entry | Effect |
|---|---|---|
| 3 | CH p8 AI set-up: ignore item minimums; CH p19 Uniques may be sold; CH p21 Cooking Station wording (max 5 draws); new Robot Workbench 100 (Robotics Expert); new Lockers 70; new Robot Market 250 (max 1, before other activity); CH p23 example has 2 Bugle racks | spec 19 s3.3, s4.4 |
| 4 | CH p24 settlement force creation ignores item minimums; CH p26 creatures by Leader faction; CH p26 Equipped not optional; CH p27 alternate deployment; p28-35 scenario fixes; p38 Attacker Major deploys up to Black not Blue | spec 19 s5.1, s5.4 |
| 5 | CH p48 siren Interact; Settlement Sheet Ranger Outpost costs 100 | spec 19 s4.4, s5.5 |
| 10 | FAQ: Explore tests use pool items committed before the draw, food cannot prevent damage; Forest Fire Event limits moves; Perks never twice per model or per settlement; a draw pays both the winner's caps; each Quest part counts 1 toward land | spec 19 s2.3, s2.5, s3.3, s4.2 |
| 13 | FAQ: Second Chance re-rolls X incl. X+AP, AP not kept | spec 19 s2.4 |
| 14 | FAQ: Hand-Written Note during Explore = Search test, 2 Items | spec 19 s4.2 |
| 15 | FAQ: Fortunate Deflection negates one damage icon; Equipped items in settlement mode are mandatory; Lockers answer | spec 19 s2.4, s4.3, s5.1 |
| 17 | FAQ: Limited Use items refresh between games; Homestead Survival Mode answers (out of scope) | spec 19 s1.2, s3.3 |
| 18-21 | Card errata: Try That Again v2 (Boost), Merchant Caravan (Explore, "Scavenging Stand"), Soft Ground / Lightning Storm / Vertibirds Overhead (Event), Mysterious Stranger I-III and Pain Train (Perk), Find the Cooler (Quest), Settlement Event cards Brewing Trouble, Infestation, Mutant Strangler Vines, Pillage Life, Storm Winds (Homestead) | CH-CAMPAIGN s3 |

## 3. Card-source inventory for the campaign card types

"Starter" = listed under 2-PLAYER STARTER SET in `wave9_full_card_list.pdf` PDF p1 (the April 2023 full card
list). Mechanics for cards whose text no local PDF shows stay GAP until a source is found; names are not a gap.

| Card type | Where the actual cards are | Count | Two Player Starter Set | Status |
|---|---|---|---|---|
| Perk | `perk_cards_w9.pdf`, 29 PDF pages: waves 1-9 as 3 x 4 card sheets (text extracts cleanly; icons are glyphs, read the render). Wave 1 sheets PDF p27-29 hold the starter Perks. Costs: `wave9_costs.pdf` PDF p6 "PERKS" column (name then cost) | about 75 Perk cards across waves 1-9 (12 per full sheet); starter 7 | Gun Nut (Rifle), Gun Nut (Pistol), Blacksmith, Armorer, Local Leader (with Local Leader II on the same card), Nerd Rage, Mysterious Stranger | Sourced: text PDF p27-28, costs COST "PERKS" (3, 3, 3, 3, 5, 6, 4) |
| Boost | No local PDF prints Boost cards. `reference_cards_w9.pdf` (23 pages: faction, sub-faction and reference cards) has none. Errata names Try That Again (ERR p.18), Second Chance (ERR p.13), Fortunate Deflection (ERR p.15); CH p5 pictures one Cunning Boost (swap a Yellow/Green/Blue bonus die for a Black one, unnamed) | starter 13; Settlement Deck 1 adds 24 (names in `wave9_full_card_list.pdf` PDF p2) | Powerful Attack, Defensive Positioning, Carefully Does It, Spurred into Action, Use Your Body, Take Two, Saw It Coming, Behind You!, Get Ready, First Team, Go, Lucky Bounce, Tougher Than It Looks, In Synch | GAP: names only (RULING: starter Boost texts) |
| Event | No local PDF prints Event cards. CH p4 describes Dust Cloud (Flip; no long-range attacks for a round) and the Flip mechanism; ERR p.10 Forest Fire (one movement Action per activation), ERR p.18 Soft Ground (falling as one height lower), Lightning Storm, Vertibirds Overhead | starter 10 | Diamond City Radio, Distant Gunfire, Vertibirds Overhead, A Hidden Observer, Lightning Storm, Downpour, Dust Cloud, A Neutral Party, Unbearable Heat, Quiet | GAP: names plus Dust Cloud (RULING: starter Event texts) |
| Quest | No local PDF prints Quest cards. CH p6 names Thief's Trail and Handy Delivery as multi-part examples; ERR p.18-21 Find the Cooler | starter 12 cards (5 Quests); Settlement Deck 1 adds 5 cards (2 Quests) | Revenge Parts 1-3, Bounty, Lost Watch, Thief's Trail Part 1 / 2a / 2b, Bet's a Bet, Recipes of the Wasteland, Handy Delivery Parts 1-2 | GAP: names and structure only (RULING: starter Quest texts) |
| Explore | No local PDF prints Explore cards. CH p5 and p23 describe Gun for Hire (pay 30 caps, mercenary Consequence next battle); ERR p.14 Hand-Written Note (Search test, 2 Items); ERR p.18 Merchant Caravan | starter 8; Settlement Deck 1 adds 27 | What's That?, Flying Ant Swarm, Gun for Hire, Unexpected Presence, Swap Mart, Easy Pickings, Recent Campfire, Recent Tracks | GAP: names plus Gun for Hire (RULING: starter Explore texts) |
| Structure | Not cards: tables in CH p21-23 plus `settlement_sheet_v4.pdf` (2 pages, July 2020) which adds Robot Workbench, Creature Pen, Lockers, Robot Market, Creature Market; ERR p.3 and p.5 | 4 starting + 60 buyable entries (tiers counted separately) | the starting four (2 Generator - Small, Stores, Maintenance Shed, Listening Post) | Sourced |
| Consequence | Printed on the back or face of Explore, Quest and Boost cards; none in a local PDF | unknown | none listed separately | GAP (covered by the card rulings above) |
| Chem (for Chemistry Station draws) | `chem_cards_w5.pdf`, 12 PDF pages: waves 1-5 as picture sheets; text extraction gives only the numbers; the starter Chems are in `2p_cards.pdf` PDF p49-50, p57-60 | starter 6 (Jet, Psycho, Mentats, Stimpak x2, RadAway, Buffout) | all six | Sourced (M1 data) |
| Heroic / Leader | `2p_cards.pdf` PDF p64-69; `heroic_cards_v4.pdf` (2 pages, 6 identical Heroic cards); `leader_cards_w6.pdf` (13 pages) | starter 4 Heroic, 4 Leaders | Brawler, Hunter, Wasteland Searcher, Warden | Sourced (M1 data) |
| Settlement Event (Homestead) | errata names five (ERR p.21); no local PDF | - | none | Out of scope |

Other local PDFs checked and found to hold no campaign cards: `2p_cards.pdf` (69 pages: units, factions,
weapons, items, mods, chems, power armor, leaders, heroic; no perk, boost, event, quest or explore card),
`reference_cards_w9.pdf` (faction and sub-faction cards, Mama Murphy, AI summaries), `heroic_cards_v4.pdf`,
`leader_cards_w6.pdf`, `box_scenarios_1-5.pdf` (box scenarios, their caps tables are spec 17's),
`machine_frequency_campaign.pdf` (RPG campaign, 16 pages, unrelated to settlement rules),
`docs/sources/w9cards/{pa,unit,weapon}.pdf` and `docs/sources/bsdata/*.cat` (BattleScribe: units and gear only).

## 4. Routes still open for the card-text gaps (per the owner's open-source gathering decision, 2026-10-11)
- Modiphius free downloads page: a "Settlement Deck 1" or starter campaign card PDF has not been found; the
  wave card PDFs so far cover units, weapons, perks, chems, leaders, heroic, reference and power armor.
- BGG image galleries and store listings for photos of the starter Boost, Event, Quest and Explore cards
  (`R2-photos.md` routes). Card text is read for mechanics only and rewritten.
- Until found, the data files hold placeholder records (`source: "placeholder"`) carrying the real names and an
  `effect` of `{ "code": "todo" }` so the campaign layer, the settlement screen and the sim run end to end.
