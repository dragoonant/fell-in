// Headless sim harness (shape carried over from the base project). Runs a single random decision until the turn flow exists.
// TODO(M2): drive createGame + step() with deciders until game over; check the invariants in docs/spec/60-testing.md.
import { createRandomDecider } from '../src/engine/decider'
import { legalActions } from '../src/engine/pending'
import { createDemoGame } from '../src/engine/setup'
import { view } from '../src/engine/view'

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1]! : def
}

const games = Number(arg('games', '3'))
const seed = arg('seed', 's')
let decisions = 0
for (let g = 0; g < games; g++) {
  const state = createDemoGame(`${seed}-${g}`)
  const bot = createRandomDecider(`${seed}-${g}`)
  const legal = legalActions(state)
  if (legal.length === 0) throw new Error(`seed ${seed}-${g}: open decision without legal actions`)
  await bot.decide(view(state, 'A'), state.pending, legal)
  decisions++
}
console.log(JSON.stringify({ games, decisions, note: 'turn flow not implemented yet (M2)' }))
