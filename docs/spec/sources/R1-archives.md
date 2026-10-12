# R1: archives and fan projects (AI matrices, perk/boost/quest data)

Raw downloads (gitignored): `docs/sources/research/archives/`. Card text there is third-party and is never copied
into the repo; our prose is written from one-line mechanical summaries.

## Findings
| Value | Citation | Confidence |
|---|---|---|
| No AI card response matrices (A/M/O/F/D by column and blue-die row) exist in any open source checked | Searched GitHub repo list (api.github.com search "wasteland warfare"), BSData, spilth/foww, ShadowCore67/fwwsb, aslanator builder, Codsworth, kairos25, Hakim1195 frontend; none carry AI cards | High |
| No VASSAL module or Tabletop Simulator workshop item turned up | Two WebSearch queries, no hits | Medium (search engine only; the VASSAL site and Steam workshop were not queried directly) |
| Boosts: 78 cards with id, name, boost type (tactical/instinctive/cunning/practiced) and effect text | ProbablyMaybeNo/FWW-alonetogether-tracker `src/data/boosts.json` (saved `amt/boosts.json`) | High that it is a transcription; edition unverified (Alone Together campaign) |
| Perks: about 96 cards with effect text, `requires` leader, and symbol markup (die colours, aura, etc.) | same repo `src/data/perkCards.js` (`amt/perkCards.js`); also spilth/foww `src/data/perks.js` (`spilth/perks.js`) | High (transcription) |
| Quest cards: 116 deck entries and about 100 front/back text records | same repo `questCardDeck.json`, `questCardContent.json` | High (transcription; mixed with OCR "vision cache" per repo scripts) |
| Settlement event cards (85), explore deck, battle danger/creature/event/explore/stranger/scenario lists | same repo `eventCards.json`, `exploreCardDeck.json`, `battle/*.json` | Medium (battle lists carry names only) |
| Unit roster 418 entries (name, faction, type, caps) and items 907 (name, type, subtype, caps) | same repo `units.json`, `items.json` | High for names and costs; no stat lines |
| Unit Move/Charge/Awareness/cost by wave for all units | spilth/foww `src/data/units.js` | Medium (fan transcription) |
| Force-building entries (equipment slots, costs) for factions, including Brute | BSData/fallout-wasteland-warfare `Library-*.cat` (last push 2020-04-17) | Medium; wave 1-3 only |
| Official companion app fallout.maloric.com ships a 4.3 MB Angular bundle with RevenueCat and Firebase; card data is not in the bundle | `maloric/main.js` grep for reckless/matrix/json assets found nothing | High that it is gated |

## Gaps remaining
- AI matrices for all 11 starter units (Sole Survivor, Sole Survivor Day One, Settler, Enslaved Tech, Dogmeat, Mutant Hound, Super Mutant, Brute, Aviator, Deathclaw, Aspirant Goddard): physical cards only; needs the owner's cards or a photo.
- AI handbook and scenario PDFs already in `docs/sources/` remain the only source for response-letter semantics.
- Perk/boost/quest effects above are for the campaign (Alone Together) edition; confirm each against 1st-edition rules before use.
- Companion app data (fallout.maloric.com) is behind a login and subscription; not reachable without an account.
