# R2 photo research: AI cards and Campaign Handbook (2026-10-11)

Raw images: `docs/sources/research/photos/` (gitignored). All summaries are ours; nothing copied from card text.
Search engines (Bing images, DDG) returned nothing usable after the first query; BGG image API and Modiphius Shopify product JSON worked with curl.

## Findings
| # | Value (our words) | Citation | Confidence |
|---|---|---|---|
| 1 | Campaign Handbook contents: Section 3 "Against the Wasteland" = 3.1 Solo/Co-op p8, 3.2 Activating AI Models p10, 3.3 Responses p11, 3.4 Other Rules for AI Play p15; AI scenarios are 5.6 (p40); tutorial scenarios section 6. | modi_Image9 (CH contents spread), https://modiphius.us/products/fallout-wasteland-warfare-campaign-book-pdf | High |
| 2 | CH p16: AI never spends Action Points it earns unless its card says so; APs only fund effects printed on the card, spent after normal responses; radiation damage is removed after regular damage when an AP heals; multiple APs can be spent. | modi_Image11 (CH p16) | High |
| 3 | CH p16: when a weapon offers a choice of special effects, AI picks the one that spends the most icons per use and keeps spending while it can. | modi_Image11 | High |
| 4 | CH p16: Heroic AI model rolls V.A.T.S. at activation start, gets one extra Quick Action after its two Actions, earns CP as normal and always makes a Critical Attack when CP allow, uses Luck whenever possible but only on Tough (reduce damage by 1). | modi_Image11 | High |
| 5 | CH p16: each Action is re-assessed when it starts. The same blue-die result sets the matrix response for the whole activation, but the concrete activity (shoot, move, charge) is re-evaluated per Action, e.g. a target killed by Action 1 means Action 2 re-picks target or moves. | modi_Image11 examples 1-3 | High |
| 6 | CH p16 example 2: after the first shot, target priority is re-run, so a second Action may switch targets (e.g. "Healthiest" ordering flips after damage). | modi_Image11 | High |
| 7 | CH p16 example 3: an O-response model that is engaged and whose cell is stay-engaged first Closes in on the engaged enemy; a Careful attitude means it does not follow up a Push Back; once no longer engaged, the second Action does the O move. | modi_Image11 | High |
| 8 | Reference card "AI Responses: Attack" has two ordered lists. Melee (yellow): Close Combat; charge into engagement; move into engagement; move to within Charge distance of enemy; move to within Move distance; move towards enemy; fall back to Objective. Ranged (blue): Shoot; move so an enemy could be shot next activation (stop no closer than Yellow range once a shot exists); move towards enemy; Objective instead. | bgg_4266150 (BGG img 4266150 "Cards") | High |
| 9 | Attack card: Reckless attitude lets engaged enemies be valid ranged targets; Careful forbids them. The tags sit at the foot of the ranged list. | bgg_4266150 | High |
| 10 | Reference card "Objective and Defend": the Objective response runs the matching response with the Subject as the only subject/target. Attack X = A against Subject only; Defend X = D; Go To X = M; Use X = Interact with it, else move into contact, else M. Defend text is partially cut off in the photo (assess target as if the model were at the Subject's position; if that would leave it engaged, move away; Careful variant uses melee instead of ranged). | bgg_4266150 | Medium (Defend half cropped) |
| 11 | Faction card (Super Mutants) carries faction special rules: use melee skill when firing a ranged weapon in Close Combat; cannot wear gas masks; radiation immune; food counts as cooked. Faction cards are separate from unit cards. | bgg_4266150 | High |
| 12 | A "Target Priorities" reference card exists in the starter deck with a row per descriptor (Nearest, Weakest, Largest, Wounded, Vulnerable, Importance, Ready/Prepared, etc.) giving the movement versus shooting meaning of each; too blurred to read. | bgg_5738964 | Low (illegible) |
| 13 | Starter-set AI cards read, row by row: 3 rows keyed by blue-die icons (bottles, stars, blast); columns by Health ranges (e.g. Aviator 8+ / 4-7 / 1-3; Sole Survivor 6+ / 3-5 / 1-2; Goddard 4 / 1-3); cell is a response letter, underline = stay engaged, shaded = reckless; right-hand icons = combat method per row; footer = ordered target priority (Aviator: Vulnerable, Importance, Wounded; Sole Survivor: Prepared, Capable, Best Chance; Goddard: Capable, Best Chance, Vulnerable). Cards also list standard equipment under the name. | modi_Image9 (card photos), consistent with docs/spec/18 section 2 | High on layout, Medium on exact cell letters |
| 14 | Super Mutant matrix (Wave 1): two Health columns 4-6 and 1-3, rows O O / O A M / A A O-ish, priorities Wounded, Weakest, Nearest. Deathclaw: three columns 9+, 5-8, 1-4; mostly A with F in the middle and low columns; priorities Nearest, Wounded; "add a gear to Crush" special line. | modi_Wave1Crop | Medium (small image, letters partly guessed) |
| 15 | Wave 2 Glowing Ones have a single column "1+" (always the same response per row: A,A,M), melee icons only, priorities Highest (rad) / Largest then Nearest in LoS, special line: when about to Charge, test AGI else Move instead of Charge. | modi_Wave2 | Medium |
| 16 | Wave 3 Institute (Engineer, Scientist): third column type is conditional ("Situation 1: if the O response is Use or Go To; Situation 2: otherwise"), so columns can be keyed on scenario state, not only Health. Engineer priorities: Vulnerable, Weakest, Nearest; Scientist: Weakest, Vulnerable, Ready. Scientist's Situation 1 exempts a specific Use type. | modi_Wave3 | Medium |
| 17 | Product listing: starter set needs Campaign Book for AI; AI card decks sold as print-and-play PDFs per wave (Wave 1-3 bundle includes Survivors, Super Mutants, Brotherhood; Raiders; Institute) and include a copy of the free AI Handbook. | https://modiphius.us/products/fallout-wasteland-warfare-wave-1-3-ai-card-deck-bundle | High |
| 18 | BGG shows a live AI game (Super Mutants vs Minutemen, Ambush scenario) with deck cards beside the board; no extra mechanics visible. | bgg_4927952 | Low value |

## Gaps remaining
- CH p8-12 text itself (3.1-3.3: activation order, which model activates, how the die/column are picked, F/D/M response definitions) was not found as photos; only contents and p16 were visible. Needed for docs/spec/18 gaps.
- Legible Target Priorities card, Move (M), Fallback (F) and rest of Defend response cards.
- Photos of the six starter-set AI cards at readable resolution (only Sole Survivor/Aviator/Goddard at card scale in CH spread).
- Reddit cheat sheets thread (blocked 403), BGG filepage 170006 "AI response flowcharts" (403, needs a real browser; promising).
- eBay listings: not reachable via curl search.

## Second pass: Settler, Enslaved Tech, Dogmeat, Mutant Hound AI cards (2026-10-17)
Result: none of the four matrices could be sourced; the cards stay placeholders. Routes tried, in order:
| Route | What was checked | Result |
|---|---|---|
| Local official PDFs | Campaign Handbook (all 52 pages text-searched, p12-16 and tutorial pages p46-50 rendered), `reference_cards_w9.pdf`, `2p_cards.pdf` (p4-7 are the unit cards for these four, stats only), AI Handbook, Co-op Handbook, `ai_response_flowcharts.pdf` | No AI matrices; the CH prints only the Super Mutant and Sole Survivor Day One cards as examples. The four models appear only in worked examples and force lists. |
| BGG image gallery (api.geekdo.com, objectid 226176, ~230 images, 16 candidates downloaded and read) | e.g. 4318998, 4336913, 4772042, 5738958, 5760043, 4884000 | Gameplay and box shots only; 5738958 shows the Target Priorities reference card and a unit card, no AI card. |
| BGG files list (same object) | 11 files | Only the flowcharts PDF (already held) and unrelated solo or campaign add-ons. |
| Modiphius Shopify product JSON | Wave 1-3 AI deck bundle (images Wave2, Wave3, Wave1Crop, back of deck) and Wave 1 Fundamentals deck | Card list confirms all four AI cards exist in the Wave 1 print-and-play deck (paid PDF). Wave1Crop shows only Super Mutant and Deathclaw. |
| eBay (curl, `www.ebay.com/sch`) | Search for the Wave 1 Fundamentals deck | HTTP 403, no `i.ebayimg.com` URLs reachable. |
| Fan wiki (fallout.fandom.com MediaWiki API) | "Fallout: Wasteland Warfare cards" page, Mutant Hound and Dogmeat card images | Works, but holds unit cards only (stats, no matrix); no AI card images. |
| Search (WebSearch x4, Bing images via curl, GitHub repo search, Reddit JSON) | Card names plus "AI card", "matrix", "unboxing" | Retail listings, wallpaper noise, no card photos; Kuribos unboxing blog has no readable card images. |
Still needed: a readable photo or scan of the four cards (Wave 1 Fundamentals deck, the Wave 1 print-and-play AI PDF, or the owner's own copy of either).

Note (cosmetic fix): the placeholder Settler and Enslaved Tech cards list Assault Rifle and Combat Shotgun as standard equipment, but the 2p unit cards (p4-5) print no EQUIPPED weapons for them, unlike Dogmeat and Mutant Hound (bite only); the weapons are play picks, flagged in the card notes, not sourced data. The one-value Health column is labelled "1".
