// "How to play" guide text (owner U). Written in our own words from the mechanics in docs/spec/11, 13, 14
// and 17 (which cite rules_of_play.pdf and the errata). No rules numbers are computed here; the ruler
// lengths are read straight from data/1e/rulers.json, the same table the engine uses.
import rulersData from '../../../data/1e/rulers.json'

export type DiagramId = 'turn' | 'activation' | 'skillDie' | 'rulers'

export interface GuideSection {
  id: string
  title: string
  intro?: string
  bullets?: readonly string[]
  diagram?: DiagramId
  /** Render the action table under this section. */
  actions?: boolean
}

export interface GuideAction { name: string; cost: string; text: string }

export interface RulerRow { colour: string; inches: number }

export const RULER_ROWS: readonly RulerRow[] = (rulersData.rulers as { colour: string; inches: number }[])
  .map((r) => ({ colour: r.colour, inches: r.inches }))

/** Swatch colours for the ruler diagram (our own palette, same values as format.ts COLOUR_HEX). */
export const RULER_HEX: Readonly<Record<string, string>> = {
  orange: '#d9822b', yellow: '#e2c744', red: '#b8412f', green: '#5f9b4a', blue: '#4a79b8', black: '#2b2825',
}

export const ACTIONS: readonly GuideAction[] = [
  { name: 'Move', cost: '1 Action', text: 'Go up to the length of your Move ruler. Rough ground slows you, climbing needs an Agility test, and dropping down always works but can hurt.' },
  { name: 'Shoot', cost: '1 Action', text: 'Fire a gun at something in range and in sight that is not touching you. At most one heavy weapon per activation.' },
  { name: 'Throw', cost: '1 Action', text: 'Lob a grenade or similar out to your Throw ruler. A miss with a scatter icon lands somewhere else.' },
  { name: 'Charge', cost: '1 Action', text: 'Start clear of enemies with sight of one, rush up to your Charge ruler into base contact, and gain a bonus die for your next melee attack on it.' },
  { name: 'Close Combat', cost: '1 Action', text: 'Hit a model you are touching, then optionally slide around it while staying in contact. Everyone has bare fists if nothing else.' },
  { name: 'Prepare', cost: '1 Action', text: 'Take a Reaction token (never more than one) so you can answer an enemy move later.' },
  { name: 'Use Expertise', cost: '1 Action', text: 'A Search, Lockpick, Computers or Presence test to open crates, crack terminals or talk someone round.' },
  { name: 'Quick Action', cost: '1 AP', text: 'A weaker copy of an Action shown by an AP icon on your cards: 2 worse on the test, or one ruler colour shorter if it moves.' },
  { name: 'Free stuff', cost: 'No Action', text: 'Peeking at a searchable marker you touch, picking up or dropping found items, and most chems and food cost nothing.' },
]

export const GUIDE: readonly GuideSection[] = [
  {
    id: 'overview',
    title: 'The big picture',
    intro: 'Two sides (or you and the Wasteland AI) fight over a scenario goal on a small table. Each figure is a model. Play runs in rounds.',
    bullets: [
      'The Briefing button at the top tells you the goal, the enemy goal and how many rounds there are.',
      'The tracker in the top-left corner shows progress toward each goal.',
      'Distances are measured with six coloured rulers, not inches (see Rulers below).',
    ],
  },
  {
    id: 'round',
    title: 'A round, turn by turn',
    diagram: 'turn',
    bullets: [
      'Every model starts the round with no marker ("not yet").',
      'The side with Advantage (usually the one with fewer models) picks who takes the first turn.',
      'Turns swap back and forth between the sides.',
      'On your turn: mark exactly one of your not-yet models Ready.',
      'Then use all of your Ready models, one at a time in any order, or use none of them.',
      'A Ready model you do not use counts as Used and sits out the rest of the round.',
      'Once every one of your models is Used you are done; the other side keeps taking turns until theirs are too.',
    ],
  },
  {
    id: 'activation',
    title: 'Using a model',
    diagram: 'activation',
    bullets: [
      'First some housekeeping: its old Reaction token goes, fire or poison bites, timed items count down, and V.A.T.S. models roll for bonus AP.',
      'Then it takes up to two Actions in any mix; the same Action twice is fine.',
      'AP (from the skill die or V.A.T.S.) buy Quick Actions. Unspent AP vanish when the model finishes.',
      'Models have no facing: they see and act in every direction.',
      'A model finishes completely before the next one starts, and can only be used once per round.',
    ],
  },
  { id: 'actions', title: 'Actions', actions: true, intro: 'Climbing and jumping down are part of a Move; Battle Cry is part of a Charge.' },
  {
    id: 'reactions',
    title: 'Reactions and Prepared models',
    bullets: [
      'A model holding a Reaction token is Prepared. It keeps the token until it uses it or its next activation starts.',
      'It can answer any enemy Action (except Prepare), or an attack hitting one of its friends.',
      'It has to notice: the trigger must be in sight and within one Awareness ruler, or two for moves and attacks.',
      'The answer is one Quick Action, taken once the enemy Action is finished. An attack answer must target the model that set it off.',
      'Moving out of base contact gives every enemy you leave a free quick swing at you.',
    ],
  },
  {
    id: 'dice',
    title: 'The dice',
    diagram: 'skillDie',
    intro: 'Every test rolls one white skill die: roll at or under your success value (the stat on your card plus modifiers) and you pass. Lower is better, and an X always fails.',
    bullets: [
      'AP and CP faces count as a 1. AP gives the model an extra Action point; CP charges a weapon toward a Critical Attack.',
      'Coloured effect dice roll alongside and only count if the test passes: black adds damage, yellow cuts through armor, green lowers your roll (and can push it under), blue pays for weapon specials.',
      'The defender then rolls the red armor die: if it shows a number at or under their armor value, that much damage is blocked.',
      'Cover makes you 2 worse to hit per step of cover and gives the target +1 armor.',
      'Damage that gets through becomes tokens. When the tokens reach the model\'s Health, it is removed.',
      'No more than four dice of one colour go into a single roll.',
    ],
  },
  { id: 'rulers', title: 'Rulers', diagram: 'rulers', intro: 'Every move, range and awareness distance on a card is one of these colours. A ruler that overlaps any part of a base reaches it.' },
  {
    id: 'ending',
    title: 'Ending a round and the game',
    bullets: [
      'A round ends once every model on both sides is Used. All markers come off and Advantage is checked again (on a tie it changes hands).',
      'The game ends when a side meets its scenario goal or the last round runs out. Some scenarios go on until somebody wins.',
      'Only the goals in the Briefing count; wiping out the enemy does not win unless the scenario says so.',
    ],
  },
  {
    id: 'odds',
    title: 'Where the game shows the odds',
    bullets: [
      'Pick a Shoot or Close Combat target and the odds panel shows the chance to hit, expected damage and chance to remove the target.',
      'The same panel lists your success value with every modifier, the dice in the pool, the range band with its ruler colour, and any cover.',
      'All of those numbers come from the rules engine, so they match what the dice will do.',
      'The Units rail ( [ ) shows each model\'s card; the Log rail ( ] ) shows every roll after it happens.',
    ],
  },
]

/** Skill die faces for the diagram: value shown for each face group (mechanics from spec 13 s1). */
export const SKILL_FACES: readonly { label: string; value: number | 'X'; faces: number }[] = [
  { label: 'AP', value: 1, faces: 2 }, { label: 'CP', value: 1, faces: 3 },
  { label: '2', value: 2, faces: 1 }, { label: '3', value: 3, faces: 1 }, { label: '4', value: 4, faces: 1 }, { label: '5', value: 5, faces: 1 },
  { label: '6', value: 6, faces: 2 }, { label: '7', value: 7, faces: 2 }, { label: '8', value: 8, faces: 2 },
  { label: '9', value: 9, faces: 1 }, { label: '10', value: 10, faces: 1 }, { label: 'X', value: 'X', faces: 3 },
]
