# AI card data: sources and status (M4b, R-23)

Files: `data/1e/ai/{survivors,super-mutants,other,reference}.json`. One `AiCardDef` per starter unit, id `ai-<unitId>`,
columns in the `health:` grammar, rows keyed BOT (with BOT2, BOT+STAR) / STAR (with STAR2) / BLAST.
Five cards are read from the R2 photos (Image9 for Sole Survivor, Aviator and Aspirant Goddard; Wave1Crop for Super Mutant and Deathclaw): cells, shading, underline, row methods and standard gear. The rest are our placeholders.
Legend: Confirmed = official (R2 photos, low-to-medium resolution where noted); Fan-source; Unsourced = ours.

| Card | Columns (Health left) | Cell letters, shading, underline, methods, gear | Target priority |
|---|---|---|---|
| sole-survivor | 6+ / 3-5 / 1-2 Confirmed (R2 #13 photo, medium) | Confirmed (R2 #13): O,O*_,O / A,A,M / A,F*_,A_; all rows ranged; Hunting Rifle | prepared, capable, bestChance: Confirmed |
| sole-survivor-day-one | Unsourced | Unsourced | Unsourced (copied from Sole Survivor) |
| settler | Unsourced | Unsourced | Unsourced |
| enslaved-tech | Unsourced | Unsourced | Unsourced |
| dogmeat | Unsourced | Unsourced (Reckless, close) | Unsourced |
| super-mutant | 4-6 / 1-3 Confirmed (R2 #14 photo, medium) | Confirmed (R2 #14): O*,O [close, ranged] / A*_,M [close] / A_,A*_ [ranged]; Bolt-Action Pipe Rifle, Board | wounded, weakest, nearest: Confirmed |
| brute | Unsourced | Unsourced | Unsourced |
| aviator | 8 / 4-7 / 1-3 Confirmed (R2 #13) | Confirmed (R2 #13): O*,M*,A_ [ranged, close] / A,O*,O* [close, ranged] / O,A,O*_ [ranged]; Pipe Pistol, Aviator Cap | vulnerable, importance, wounded: Confirmed |
| mutant-hound | Unsourced | Unsourced (Reckless, close) | Unsourced |
| deathclaw | 9+ / 5-8 / 1-4 Confirmed (R2 #14 photo, medium) | Confirmed (R2 #14): A*_,A*_,A*_ / A*_,F,F*_ / F*_,A*_,A*_; all close; Swipe, Crush | nearest, wounded: Confirmed |
| aspirant-goddard | 4 / 1-3 Confirmed (R2 #13) | Confirmed (R2 #13): A*,O_ / O*,A_ / M*,M; all close; Baseball Bat, T-60 Power Armor | capable, bestChance, vulnerable: Confirmed |
| ai-generic | always | every cell A, careful, both methods | nearest (spec 18 s8.9, Unsourced) |

Notation: `*` shaded (Reckless), `_` underlined (stay in close combat). Only Settler, Enslaved Tech, Dogmeat, Mutant Hound,
Brute and Sole Survivor Day One stay Unsourced; the generic card is ours.

Other rules applied: standard equipment for the Unsourced cards is our own pick from each unit's skills. Melee units and creatures
use close-combat methods; shooters favour ranged; hounds, Dogmeat and the Deathclaw are Reckless. No flowchart-derived
(Fan-source) cell values were used; the flowcharts define response procedure, not card cells. The Deathclaw's printed
"add a gear to Crush" line is recorded in `notes` only, with no hook.

## Photograph these cards to confirm
1. Sole Survivor, Aviator, Aspirant Goddard, Super Mutant and Deathclaw: a sharper photo would upgrade 'medium' to 'high' (cell values are already read).
3. Settler, Enslaved Tech, Dogmeat, Mutant Hound, Brute and Sole Survivor Day One (nothing readable exists).
4. The Target Priorities reference card (R2 #12), to settle the factor keys in R-21.
Swap values in the JSON and change the `source` entries to Confirmed.
