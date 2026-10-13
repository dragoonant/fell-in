// Prompt copy per decision kind (our words). Pure: takes the pending decision plus namers, returns text and option labels.
// Every engine kind has copy; unknown kinds fall back to a title from the kind and the engine's own labels.
import type { Action, DecisionOption, PendingDecision } from '../../engine/types'
import { kindTitle } from './format'

export type PromptForm = 'list' | 'targets' | 'activation' | 'path'
export interface PromptOption { id: string; label: string; tone: 'normal' | 'quiet'; action: Action }
export interface PromptCopy { title: string; hint: string; /** Plain-words first-timer line for turn-flow decisions. */ tip?: string; form: PromptForm; options: PromptOption[] }
export interface Namers { name: (id: string) => string; seat: (id: string) => string; humanise: (label: string) => string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const NS_WORD: Record<string, string> = { shoot: 'Ranged attack', throw: 'Throw', melee: 'Close combat attack' }

function opt(o: DecisionOption, label: string, tone: PromptOption['tone'] = 'normal'): PromptOption {
  return { id: o.id, label, tone, action: o.action }
}

/** One plain-words line per turn-flow decision a new player meets first. */
export const TURN_TIPS: Readonly<Record<string, string>> = {
  'turn.start': 'Check the Briefing button at the top if you forget the goal. Press the button to begin round 1.',
  'turn.first': 'Going first lets you grab the best ground, but the other side then gets the last word in the round.',
  'turn.ready': 'Each round, sides take turns making one unit Ready. Ready units are the ones you get to use afterwards.',
  'turn.pick': 'Pick which Ready unit moves and fights next. Each unit can be Used once per round.',
  'turn.choose': 'Use means take your actions now. Skipping keeps the unit out of the fight until next round.',
  'turn.activation': 'Spend action points to move, attack or use an item. When you are done, choose End activation.',
}

export function promptView(p: PendingDecision, n: Namers): PromptCopy {
  const copy = baseView(p, n)
  const tip = TURN_TIPS[p.kind]
  return tip ? { ...copy, tip } : copy
}

function baseView(p: PendingDecision, n: Namers): PromptCopy {
  const ctx = p.context
  const who = n.name(str(ctx.modelId))
  const list = (title: string, hint: string, label: (o: DecisionOption) => string, form: PromptForm = 'list'): PromptCopy =>
    ({ title, hint, form, options: p.options.map((o) => opt(o, label(o), o.id === 'pass' || o.id === 'keep' || o.id === 'useNone' ? 'quiet' : 'normal')) })
  const fallback = (o: DecisionOption) => n.humanise(o.label)

  if (p.kind.endsWith('.target')) {
    const ns = p.kind.slice(0, -'.target'.length)
    return list(`${NS_WORD[ns] ?? kindTitle(ns)}: choose a target`, `${who} can act on one of these. Pick a target to see the odds, then confirm.`, fallback, 'targets')
  }
  if (p.kind.endsWith('.luck')) {
    const ask = str(ctx.ask)
    const hint = ask === 'dodge' ? `${n.name(str(ctx.targetId))} can spend a luck token to dodge.`
      : ask === 'crit' ? `${n.name(str(ctx.attackerId))} can spend a luck token to build the Critical Meter.`
      : `${n.name(str(ctx.attackerId))} can spend a luck token to aim better.`
    return list('Spend a luck token?', hint, (o) => (o.action.use === true ? 'Spend the token' : 'Keep the token'))
  }
  switch (p.kind) {
    case 'turn.start': return list('Ready to begin?', 'The table is set. Press the button when you are ready to play round 1.', (o) => o.label)
    case 'turn.first': return list('Who goes first?', 'You hold the Advantage this round. Choose which side takes the first turn.', (o) => `${n.seat(str(o.action.firstSeat))} goes first`)
    case 'turn.ready': return list('Make a unit Ready', 'Choose one unit that has not been readied to become Ready this turn.', (o) => `Ready ${n.name(str(o.action.modelId))}`)
    case 'turn.pick': return list('Use a Ready unit', 'Choose which Ready unit to Use next.', (o) => `Use ${n.name(str(o.action.modelId))}`)
    case 'turn.choose': return list(`${who} is Ready`, 'Use your Ready units now, or skip them for the round (they count as Used).', (o) => (o.id === 'useNone' ? 'Skip them (Used)' : 'Use the Ready units'))
    case 'turn.activation': return list(`${who} is active`, 'Pick an action.', fallback, 'activation')
    case 'react.offer': return list(`${who} may react`, 'Something just happened in view of this unit. React now, or let it go.', (o) => (o.id === 'pass' ? 'Do not react' : fallback(o)))
    case 'melee.slide': return list('Slide after the attack?', `${who} may shift along the enemy, or stay put. Drag the figure to slide.`, () => 'Stay put', 'path')
    case 'charge.marker': return list('Charge bonus', `${who} earns a charge die against ${n.name(str(ctx.targetId))}. Choose its colour.`, (o) => `Take a ${o.id} charge die`)
    case 'battleCry.follow': return list('Follow the push?', `${who} may step after ${n.name(str(ctx.targetId))} to stay in contact.`, (o) => (o.id === 'follow' ? 'Follow them' : 'Hold position'))
    case 'battleCry.push': return list('Battle cry follow-up', `${who} won the battle cry over ${n.name(str(ctx.targetId))}.`, (o) => (o.id === 'push' ? 'Shove them back' : 'Hold position'))
    case 'move.path': {
      const inches = typeof ctx.inches === 'number' ? ctx.inches : null
      const hint = `Drag ${who} on the table${inches !== null ? ` (up to ${inches} in, ${str(ctx.colour)} ruler)` : ''}, then release to confirm.`
      const rest = p.options.filter((o) => o.action.type !== 'move.to')
      return { title: `Move ${who}`, hint, form: 'path', options: rest.map((o) => opt(o, o.action.type === 'move.cancel' ? 'Cancel the move' : fallback(o), 'quiet')) }
    }
    case 'item.choose': return list('Choose an effect', `${who} must pick how ${n.name(str(ctx.itemId))} works this time.`, fallback)
    case 'search.found': return list('Search result', `${who} found ${n.name(str(ctx.defId))}.`, (o) => (o.id === 'keep' ? 'Keep it' : 'Leave it here'))
    default: return list(kindTitle(p.kind), 'Choose one.', fallback)
  }
}
