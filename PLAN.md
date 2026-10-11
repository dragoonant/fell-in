# Fell-in: Wasteland Warfair: plan of record

An unofficial fan port of Fallout: Wasteland Warfare (Modiphius, 1st edition, 2018-) to a 3D browser
game on GitHub Pages. Repo `dragoonant/fell-in`. Process lessons from the three earlier ports are in
`docs/KNOWLEDGE-BASE.md`; the source map is `docs/spec/sources/WW-SOURCES.md`.

## Settled decisions (owner, 2026-10-11): do not re-ask
- Title "Fell-in: Wasteland Warfair", repo `fell-in`.
- IP: Mallet posture. Mechanics 1:1; unit, weapon, item, perk and faction names may match the real
  cards; all prose in our own words; no Modiphius or Bethesda art, icons, logos or trade dress.
- v1 content: the Two Player Starter Set (Super Mutants vs Survivors + Brotherhood Aspirant, Deathclaw
  and the starter creatures), its cards and box scenarios. More factions in later milestones.
- Opponents, all four, in this order: our own bot AI (versus), hot-seat 2 players, the official AI card
  system (solo/co-op vs AI-driven forces), then campaign/settlement mode.
- Figures: the real Modiphius sculpts as references, Gemini concepts then Hunyuan3D on the Windows PC,
  "mildly stylized heroic proportions, about four and a half heads tall, detailed, not cute".
  Procedural placeholders until the owner's first playtest.

## Confirmed by the owner 2026-10-11
- Edition: 1st edition now. 2nd edition releases about November 2026 and we update to it then, so keep
  edition-specific numbers (dice faces, rulers, costs) in data, not code.
- Fallout trademarks: names are fine; Vault Boy, Pip-Boy screens, Nuka-Cola and faction emblems get
  our own original markings.
- Token ceiling about 2.5M per push; Sonnet implements, Opus integrates and writes specs.
- Base code: copy `WarMForge/whirr-machine` (circle-base skirmish, LOS, terrain, figures, AI worker).
- Range: the game uses colour rulers; the engine stores inches and the UI shows the ruler colour.

## Milestones
- **M0 Bootstrap + spec.** Repo from the whirr-machine skeleton, CLAUDE.md, README disclaimer, Pages
  deploy of the empty table. Rules spec in our own words (`docs/spec/`), data schema, checklist IDs.
- **M1 Data.** Starter-set units, weapons, armor, items, perks, chems from the card PDFs and BSData,
  every value cited.
- **M2 Engine.** Ready/Use turns, actions and AP quick actions, d20 + d12 dice, rulers, LOS and cover,
  damage and radiation, charge and close combat, Prepare, Search, scenario objectives. Sim runs bot vs
  bot.
- **M3 Playable.** 3D table, procedural figures, dice tray, card panel, odds previews, hot-seat and
  random bot. Pages deploy. **Owner playtest gate.**
- **M4 AI.** Versus bot (verify loop on, benchmark vs random >= 95%), then the official AI card system
  for solo/co-op with the Red Rocket and box scenarios. **Owner playtest gate.**
- **M5 Look and sound.** Figures from real sculpts, terrain (ruined suburbs, Red Rocket, junkyard),
  audio and narrator.
- **M6 Campaign.** Settlement mode and progression between battles.
- **M7+ Factions.** Brotherhood, Raiders, Institute, Robots, creatures, in waves.
