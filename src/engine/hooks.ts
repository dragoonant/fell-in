// After-Action hooks shared by the modules that finish Actions (movement, attack, melee). `hooked(mod)` wraps a ModuleDef so that,
// whenever one of its steps reports an Action done, two rules run before the controller sees the result:
//  1. WPN-003 mines: the model that finished stands in an active enemy mine's trigger area -> the blast goes off (mines.ts).
//  2. DMG-005: a Ready, unused model eliminated during that Action and favoured by the Luck flip takes its free Quick Action
//     first (damage.ts); the original `done` is held and handed back when the free Action ends.
// Pure and cheap when no mine is on the table and nobody earned a free Action.
import { afterActionMines } from './mines'
import { dyingOf, finishDying, offerFreeAction } from './damage'
import { isRejection, type ModuleDef, type StepResult } from './registry'
import type { EditionBundle } from '../data/types'
import type { GameState } from './types'

function after(res: StepResult, bundle: EditionBundle): StepResult {
  if (isRejection(res) || !res.done) return res
  let s: GameState = res.state
  let done = res.done
  const d = dyingOf(s)
  if (d?.active && done.modelId === d.modelId) { // the free Quick Action is over: now the model really goes
    s = finishDying(s, d)
    done = d.done
  } else if (!done.type.endsWith('.cancel')) {
    s = afterActionMines(s, bundle, done.modelId)
  }
  const free = offerFreeAction(s, bundle, done)
  return free.raised ? { state: free.state } : { state: free.state, done }
}

export function hooked(mod: ModuleDef): ModuleDef {
  return { ...mod, resolve: (state, bundle, action) => after(mod.resolve(state, bundle, action), bundle) }
}
