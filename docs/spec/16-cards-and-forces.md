# 16 Cards and forces

Card faces are our own designs; only the mechanical fields below are ported. Costs are 1st-edition
data from COST and live in `data/<edition>/costs.json`.

## 1. Card types and fields
### Unit card (RoP s2.3 p9, s2.5 p12, s4.4 p42, s6.1 p50; CARDS p.2-12; GA A1)
- name, faction (or none), unique flag, type icons (Creature, Dog, Robot, Synth), base size.
- move colour, charge colour (top-left pair).
- S.P.E.C.I.A.L. values; on each attribute row: skill icons (Melee, Pistol, Rifle, Heavy, Throw +
  colour, Search, Lockpick, Computers, Presence + colour, Battle Cry colour or white, Resist) and the
  Health icon on one row.
- awareness colour (bottom-left), AP-use icons, Prepare-AP icon, Critical icon, Luck icon,
  Battle Cry immunity, Unimpeded, Inability to climb.
- armor ratings phys/energy/rad, each `n`, `n+s`, `-` or `X`.
- abilities (name, aura flag, text), "Equipped" items (mandatory, ERR p.4), specialities.
- Starter abilities to implement: Dog Handler (aura), Senses, Leap, Barge, Unnerving (aura),
  Free/Genius/Back-up (Enslaved Tech), Equipped clauses (CARDS p.2-12).
### Weapon card (RoP s2.8 p16, s2.9 p20, s5.1-5.3 p44-47, s6.3 p53; CARDS p.17-37)
- name, skill icon (Pistol, Rifle, Heavy, Melee, Throw), restriction ("Dogs only", "Deathclaw only").
- ranges: short colour, long colour (either may be absent; thrown = Throw icon colour).
- effect dice per band (melee: one set).
- damage: list of {type, value, areaColour?}; target-only extra (Target icon).
- special effects: {cost icons, maxPerAttack?, outcome}; flags: slowFiring, unique, primed N, walkedFire
  {shots, colour}, scatter bands, grenade icon, minimum short range.
- critical meter: rating, damage override, extra dice, restriction (e.g. long range only), effects.
### Armor / clothing / power armor (RoP s3.3 p32, s5.2 p45; CARDS p.45-48, p.62)
- armor: sets ratings or modifies ("+1 energy"), "must attach to setting card" mods; clothing:
  attribute bonuses and abilities, max 1 per model; power armor: two sides (bonuses, ratings, End bonus).
### Mods (RoP s3.3 p32; ERR p.2; CARDS p.51-54)
- one mod per item of a matching type; fitted before battle only; none on Unique weapons.
### Consumables (chem, alcohol, food and drink): limited use, duration kind, effects (plus cooked
  effects), addictive icon and addiction side (RoP s3.3 p32-34).
### Gear: e.g. Stealth Boy (assigned model only, not shareable), Stimpak, RadAway.
### Leader card (RoP s6.1 p50; ERR p.2; CARDS p.64-67)
- one per side; faction icon restricts which units may hold it; abilities on holder or same-faction
  models; aura range = holder's Presence; auras need LoS (errata). The single-model requirement is
  deleted by errata. Starter leaders: Brawler, Hunter, Wasteland Searcher, Warden.
### Heroic card (RoP s6.1 p50; s4.3 p40; COST "Heroic")
- single-model units: V.A.T.S. (blue die, AP per bottle), +1 Health, Critical icon, Luck icon,
  AP-use icons Movement/Attack/Expertise. Cost 48 caps (COST "Heroic").
### Faction and reference cards (CARDS p.13-15; ERR p.19-20)
- Survivors (v2): each Unique Survivor model gets 1 armor boost token at force set-up.
- Super Mutants: ranged-in-melee uses Melee SV; no Power Armor; immune to radiation; food always cooked.
  Faction rules apply only to models whose card names that faction (ERR p.14).
- Dogs, Creatures, Robots: reference card rules (ERR p.2-3, p.19): neutral dogs/robots take the
  Leader's faction; Dogs and Creatures cannot gain Lockpick/Computers skills (icons per card v2);
  dogs use only food and drink unless an item allows; creatures use no chems/food/alcohol/PA.
- Dog Handler (errata): from the handler's activation start to its next, one Dog in its aura may
  Search with its own Per and, if the handler is Heroic, is Heroic during its own activation (not its
  reaction). Dog Luck tokens = dog unit's Luc at start, usable only while Heroic.
### Perks, Boosts, Events, Explore, Quests, Danger/Creature/Stranger: campaign and Wasteland decks
  (RoP s1.4 p6; CH). Perk costs exist in COST. Card text for starter perks/boosts is not in the free
  CARDS file (gap, `19`).

## 2. Force building (versus mode)
Free sources give costs but not the full CH p26 procedure; the rules we use:
1. Agree a caps limit (default 500, RULING Unsourced).
2. Pick units and pay unit cost per model (COST). Unique: max one model per unique name/version group.
3. Equip items per unit (all models in a unit share cards; pay per model equipped, COOP s2). "Equipped"
   items on a unit card are mandatory and free; listed weapon restrictions apply.
4. Limits: one Power Armor and one clothing per model; Power Armor, Heroic, Slow-firing and Unique
   weapons only on single-model units; one mod per item; armor = one setter + one modifier per type.
5. Assign exactly one Leader card (paid) to one unit; force faction = Leader's faction. Creatures only
   if their card faction matches the Leader's (ERR p.4).
6. Optional Heroic cards (48 caps) on single-model units; Survivors get boosts per faction card.
7. Strong armor boost tokens may be bought for AI forces at 6 caps each (AIH s3); we allow the same in
   versus only if both agree (RULING).
- Limited-use duplicates: one card plus counting tokens (RoP s3.3 p32).
- Settlement mode overrides (pool of owned cards) are in `19`.
