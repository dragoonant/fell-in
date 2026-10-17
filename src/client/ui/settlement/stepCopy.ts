// Plain-words copy for the between-battle steps (our own words, written from a one-line mechanical summary of each step;
// spec 19 s3-s5). Keyed by the step ids of the campaign layer's sequence (spec 19 s7). Unknown ids fall back to the layer's text.
export interface StepCopy { title: string; blurb: string; decision: string; part: string }

export const PARTS = ['After the battle', 'Build', 'Draw', 'Select', 'Get ready'] as const

export const STEP_COPY: Record<string, StepCopy> = {
  'afterBattle.caps': { part: PARTS[0], title: 'Collect your caps', blurb: 'The battle pays out. Winners earn more than losers.', decision: 'Nothing to decide; take the money.' },
  'afterBattle.strip': { part: PARTS[0], title: 'Strip the force', blurb: 'Everything the models carried comes off, apart from their standard gear. Unused boosts are gone.', decision: 'Nothing to decide.' },
  'afterBattle.retain': { part: PARTS[0], title: 'Keep what the sheds can hold', blurb: 'Each maintenance shed saves one item or up to two boosts from the pile of gathered gear.', decision: 'Which gathered cards do the sheds keep?' },
  'afterBattle.lockers': { part: PARTS[0], title: 'Empty the lockers', blurb: 'Whatever you parked in a locker last time comes back to the pool.', decision: 'Nothing to decide.' },
  'afterBattle.sell': { part: PARTS[0], title: 'Sell the rest', blurb: 'Gathered items nobody kept are sold for caps. A unique item may be kept instead.', decision: 'Sell everything, or hold a unique item back?' },
  'afterBattle.leader': { part: PARTS[0], title: 'Move your leader', blurb: 'If the leader was knocked out, you may hand the leader card to another model before building starts.', decision: 'Who leads the next fight?' },
  'build.market': { part: PARTS[1], title: 'Visit the markets', blurb: 'Robot and creature markets show four mods; buy any of them before anything else happens.', decision: 'Which market mods do you buy?' },
  'build.structures': { part: PARTS[1], title: 'Build and scrap structures', blurb: 'Spend caps on buildings, or scrap one for half its price back. Some buildings need another first.', decision: 'What do you build or scrap?' },
  'build.perks': { part: PARTS[1], title: 'Buy perks', blurb: 'Each model can learn one new perk per visit. Perks also unlock workbenches.', decision: 'Which perks do you buy?' },
  'build.power': { part: PARTS[1], title: 'Share out power and water', blurb: 'Most buildings need one power to work this visit. If you are short, you choose which ones stay dark.', decision: 'Which buildings get power?' },
  'draw.structures': { part: PARTS[2], title: 'Use your buildings', blurb: 'Each powered building draws cards. Look at what came up, then pick the next building to use.', decision: 'Which building do you use next, and what do you keep?' },
  'draw.explore': { part: PARTS[2], title: 'Send out scouts', blurb: 'Scouting buildings turn up events in the wasteland. Some pay off, some bite back.', decision: 'Scout again, or stop?' },
  'select.stores': { part: PARTS[3], title: 'Pack the stores', blurb: 'Each stores building lets you take one item or up to two boosts into the next fight.', decision: 'What goes into battle?' },
  'select.lockers': { part: PARTS[3], title: 'Lock something away', blurb: 'A locker parks one item for a battle, then returns it to the pool.', decision: 'What goes into a locker?' },
  'select.sell': { part: PARTS[3], title: 'Sell what is left', blurb: 'Anything still in the pool is sold for caps.', decision: 'Nothing to decide unless you change your mind.' },
  'force.create': { part: PARTS[4], title: 'Pick your force', blurb: 'Choose units up to the caps limit, hand out your chosen gear and equip the perks you want to use.', decision: 'Which units fight, with what?' },
  'force.quest': { part: PARTS[4], title: 'Pick a quest', blurb: 'A quest gives the next fight a side goal and a prize.', decision: 'Which quest do you chase?' },
  toBattle: { part: PARTS[4], title: 'To battle', blurb: 'Choose the scenario and who you face, then head out.', decision: 'Where and against whom?' },
}

/** Friendly title and text for a step id; uses the layer's own text when the id is not in the table. */
export function stepCopy(id: string, fallback?: { title?: string; blurb?: string; decision?: string }): StepCopy {
  const c = STEP_COPY[id]
  if (c) return c
  const title = fallback?.title || nameFromId(id)
  return { part: 'Other', title: title.charAt(0).toUpperCase() + title.slice(1), blurb: fallback?.blurb ?? '', decision: fallback?.decision ?? '' }
}

/** "120 caps", "1 cap", "free". */
export function capsText(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  if (n === 0) return 'free'
  const a = Math.abs(n)
  return `${n < 0 ? '+' : ''}${a} ${a === 1 ? 'cap' : 'caps'}`
}

/** Group items by a key, keeping first-seen order. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): { key: string; items: T[] }[] {
  const out: { key: string; items: T[] }[] = []
  for (const it of items) {
    const k = key(it)
    let g = out.find((x) => x.key === k)
    if (!g) { g = { key: k, items: [] }; out.push(g) }
    g.items.push(it)
  }
  return out
}

/** Make an id readable: "gun_nut-rifle" -> "Gun nut rifle". */
export function nameFromId(id: string): string {
  const s = id.replace(/[._-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
