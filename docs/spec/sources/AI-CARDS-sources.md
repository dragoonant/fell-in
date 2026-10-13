# AI card data: sources and status (M4b, R-23)

Files: `data/1e/ai/{starter,reference}.json`. One `AiCardDef` per starter unit, id `ai-<unitId>`. Rows are keyed
BOT/BOT2, STAR/BOT+STAR/STAR2 and BLAST, one method per icon. Columns use the `health:` grammar.
Sources: the Campaign Handbook (CH p8, p10, p50) for Super Mutant, Brute and Sole Survivor Day One; the earlier R2 card photos
(medium resolution, now folded into starter.json) for Sole Survivor, Aviator, Aspirant Goddard and Deathclaw. Everything else is a
placeholder tagged `source: "placeholder"`. Legend: Confirmed = official; Unsourced = ours.

| Card | Source of cells, columns, priority, gear |
|---|---|
| super-mutant | CH p10 (Confirmed); the R2 photo agrees |
| brute | CH p8, p10 (Confirmed) |
| sole-survivor-day-one | CH p50 (Confirmed) |
| sole-survivor | R2 photo (Confirmed): 6+/3-5/1-2, all ranged, Hunting Rifle |
| aviator | R2 photo (Confirmed): 8+/4-7/1-3, Pipe Pistol, Aviator Cap |
| aspirant-goddard | R2 photo (Confirmed): 4+/1-3, all close, Baseball Bat, T-60 Power Armor |
| deathclaw | R2 photo (Confirmed): 9+/5-8/1-4, all close, Swipe, Crush |
| settler, enslaved-tech, dogmeat, mutant-hound | placeholder (Unsourced) |
| ai-generic | ours: every cell A, careful, both methods, nearest (spec 18 s8.9) |

Notation: Reckless = shaded cell, stayEngaged = underlined cell. For the photo cards the BOT+STAR method is assumed equal to
STAR where the photo lists two star-row methods (Unsourced). The Deathclaw's printed "add a gear to Crush" line is not modelled.

## Photograph these cards to confirm
1. Sole Survivor, Aviator, Aspirant Goddard, Deathclaw: a sharper photo would raise 'medium' to 'high'.
2. Settler, Enslaved Tech, Dogmeat, Mutant Hound (nothing readable exists).
3. The Target Priorities reference card (R2 #12), to settle the factor keys in R-21.
