# 14 Range, LoS, cover, terrain, movement

World unit = 1 inch. Ruler data lives in `data/<edition>/rulers.json` (see `20`).

## 1. Rulers (DICE, verified on the rendered sheet; RoP s2.2 p9)
| Colour | Inches | Colour-blind corner marks |
|---|---|---|
| Orange | 2 | fewest |
| Yellow | 4 | |
| Red | 6 | |
| Green | 8 | |
| Blue | 10 | most (Orange->Blue: more corners = longer) |
| Black | 12 | own mark |
- Order for "one colour shorter": Black > Blue > Green > Red > Yellow > Orange; Orange stays Orange
  (ERR p.9 FAQ). Our palette and corner/pattern marks are our own designs (IP rule).
- Anyone may measure anything at any time (RoP s2.2 p9). The UI always shows the colour, not inches.
- "Black + Orange" style compound distances add lengths (COOP Dangerous Munitions).

## 2. Measuring conventions (engine)
- Distance between two models/objects = gap between base edges (centre distance minus both radii);
  "within X" means gap <= X. A ruler "overlapping any part of the base" puts the model in range
  (ERR p.9 FAQ).
- Range bands: target in short if gap <= S; in long if gap <= S + L and its far edge is beyond S; if
  both, the attacker chooses (RoP s2.8 p16). No long band = out of range beyond S.
- Area effects: a model is hit if any part of its base is inside the circle of the given colour
  diameter centred on the impact point (RoP s5.3 p46).
- Awareness lengths: one length = the Awareness colour; two lengths = twice it (RoP s4.4 p42).

## 3. Movement (RoP s2.7 p15; s4.2 p37-39; s5.4 p48; ERR p.2, p.9)
- A Move measures from the front of the base to the rear of the base at the end, so a straight move
  displaces the base centre by up to colour + base diameter. Engine: the path of the base's leading
  point may not exceed the colour; equivalently centre-path length <= colour + diameter (RULING).
- Paths may bend; total length counts. Cannot pass through opposing bases; may pass through friendly
  bases but not end overlapping; cannot end on markers or tokens (ERR p.8).
- Modifiers apply in this order: Slow (one shorter) first, then Quick Action and Difficult Terrain
  (each one shorter); never below Orange (RoP s5.4 p48).
- Difficult terrain: if the base passes over any amount, the whole movement uses one colour shorter.
  Unimpeded icon ignores this (RoP s4.2 p37).
- Impassable: no entry unless agreed per model type. Climbable: counts as difficult; at the start of
  each vertical climb take an Agi test; fail = fall from the start position and the Action ends.
  Mid-climb at Action end: remove the model, remember its spot, continue next movement with a new
  test; mid-climb models cannot attack or Use Expertise but can be shot and engaged by bases within
  Orange vertically. Inability-to-climb icon forbids climbing and ladders (RoP p38; ERR p.2).
- Jump down: counts as a Move, always completes; falling damage computed one colour lower; Orange or
  less is free (RoP p38).
- Falling damage (distance from movement start to impact, roll 1 black die; each DMG +1, each BOT
  gives -1 armor (armor reduction); others ignored): up to Orange 0, Yellow +2, Red +4, Green +6,
  Blue +8, Black +10, beyond Black = removed. Armor roll applies. Damage taken ends the movement;
  undamaged models may continue. Power Armor ignores all falling damage and removal (RoP p39, s5.2 p45).
- Table edge: any part of the base crossing the edge = left the battlefield. Voluntary exits allowed.
  Forced by a non-friendly effect: hard edge, 1 regular damage ignoring armor each time (RoP p39; ERR p.2).
- Mine placement and fire/stun removal are Move Actions with no movement (RoP p46, p48).

## 4. Line of Sight (RoP s2.8 p17; ERR p.2)
- Top-down: LoS exists if any straight segment from any point of the shooter's base to any point of
  the target base (or object/point) avoids LoS-blocking terrain.
- Normal and Large models never block LoS. Huge models (60 mm+) block LoS for smaller models and give
  them cover (not to models engaged with that Huge model).
- Per-piece properties (block LoS, cover, area, difficult, impassable, climbable, height) are set at
  battlefield set-up and may differ by model size/elevation (RoP Hint 1 p18, Hint 5 p37). Our terrain
  data stores them per piece, with optional per-size overrides.
- Attack triggers need no LoS; other triggers do (ERR p.2; CARDS p.14).
- Engine LoS: 2D polygon test on the base disc pair (sample the two discs' tangent lines and a grid of
  rays; LoS if any ray is clear). Elevation: see section 6.

## 5. Cover (RoP s2.8 p17-18; s2.13 p24; ERR p.14 FAQ)
- Line of Cover: centre to centre. Each cover object the LoC fully crosses (enters and exits) gives
  -2 SV to the attacker. Cover the shooter's base touches is ignored. A target standing on an object
  that the LoC only enters gets no cover from it.
- Any cover at all: target armor +1 for that attack, once, on every armor type.
- Area terrain (woods, smoke): the LoC only needs to enter it. Very dense areas may block LoS.
- Non-friendly Normal-sized models between give cover; the shooter's own side never does.
- Ranged weapon used in close combat: counts as one cover (-2 and +1 armor).
- Hold Breath style abilities cancel both parts (ERR p.14).

## 6. Elevation (RoP s2.8 p18)
- Elevated: shooter's base at least Orange higher than the target's base.
- Significant Edge: a terrain edge with a drop of Orange or more.
- A Significant Edge blocks LoS to/from an elevated model that is more than Orange from that edge.
- Shooting at an elevated model within Orange of a Significant Edge: the edge counts as cover.
- An elevated shooter only counts cover within Orange of its target.
- Some LoS blockers only give cover against elevated shooters (per-piece property).
- Engine: terrain pieces carry `height`; a base on a piece sits at its top; vertical gaps use the same
  colour scale.

## 7. Blast, scatter, mines (RoP s5.3 p46-47; ERR p.2, p.11)
- Area effect: coloured damage value = diameter centred on target; every model touched, friend or foe,
  resolves damage and armor separately. Cover between the centre and a model: LoS blockers block it,
  other cover gives +1 armor.
- Scatter on a failed Shoot/Throw with a Scatter weapon: distance from the card's margin bands
  (e.g. fail by 1-2 Orange, 3-4 Yellow, 5+ Red); X uses the largest band; direction random (360 deg
  from the seeded RNG; the table version flips the advantage marker). Measured from the target base
  centre. Grenade icon: obstacle check along original target -> new point; else firer -> new point;
  the effect lands where the line meets an obstacle. Target-only extra effects are lost on scatter.
- Mines: unengaged model, Move Action, place within Orange; active from the start of the owner's next
  turn; triggers on opposing models that end any Action inside the trigger radius (short-range colour)
  or whose base enters it on a path that would end outside (pause the move, resolve the blast).
