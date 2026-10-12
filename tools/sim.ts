// Headless sim: npm run sim -- --games 50 --seed s [--scenario box-1] [--cap 4000] [--check-every 1]
// Plays createGame + apply() with a random decider on every seat until the scenario ends, and checks the engine
// invariants of docs/spec/60-testing.md s2: one open decision with a non-empty legal list, every legal option accepted,
// reject-never-throw on malformed input, determinism (seed + action log replays to the same state), step time.
// Prints one JSON line: {games, finished, avgRounds, winners, decisions, errors, ...}. Exit 1 when any error was found.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBundles, type RawFile } from '../src/data/bundle'
import type { EditionBundle } from '../src/data/types'
import { apply } from '../src/engine/apply'
import { createRandomDecider } from '../src/engine/decider'
import { legalActions } from '../src/engine/pending'
import { deriveSeed, nextFloat } from '../src/engine/rng'
import { createGame } from '../src/engine/setup'
import type { Action, GameState, SeatId, Vec2 } from '../src/engine/types'
import { view } from '../src/engine/view'

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def
}
const GAMES = Number(arg('games', '3'))
const SEED = arg('seed', 's')
const SCENARIO = arg('scenario', '')
const CAP = Number(arg('cap', '4000')) // decisions per game before calling it a stall
const CHECK_EVERY = Math.max(1, Number(arg('check-every', '1'))) // probe every option on every Nth decision
const STATS = process.argv.includes('--stats') // add action and event histograms to the summary
const STEP_MS = Number(process.env.SIM_STEP_MS ?? '250') // slow-step threshold (CI runners are slow)

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data')
function loadBundle(edition = '1e'): EditionBundle {
  const files: RawFile[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.json')) {
        const path = relative(DATA_DIR, p).split('\\').join('/')
        if (path !== 'editions.json') files.push({ path, json: JSON.parse(readFileSync(p, 'utf8')) })
      }
    }
  }
  walk(DATA_DIR)
  const b = buildBundles(files).bundles[edition]
  if (!b) throw new Error(`sim: no edition ${edition} under data/`)
  return b
}

/** Options whose template needs a parameter the decider must add (the module validates it). */
const PARAMETERISED = new Set(['move.to'])

/** A random single-leg destination inside the move allowance (context.inches + context.baseInches). */
function randomPath(state: GameState, gameSeed: string, attempt: number): Vec2[] {
  const ctx = state.pending.context as { modelId?: string; inches?: number; baseInches?: number }
  const m = ctx.modelId ? state.models[ctx.modelId] : undefined
  if (!m) return []
  let rng = deriveSeed(gameSeed, `${state.pending.id}:path:${attempt}`)
  const [a, r1] = nextFloat(rng); rng = r1
  const [f] = nextFloat(rng)
  const reach = ((ctx.inches ?? 0) + (ctx.baseInches ?? 0)) * (0.25 + 0.7 * f)
  // Lean towards the centre so games make contact.
  const toward = Math.atan2(-m.pos.z, -m.pos.x)
  const ang = toward + (a - 0.5) * Math.PI * 1.2
  return [{ x: m.pos.x + Math.cos(ang) * reach, z: m.pos.z + Math.sin(ang) * reach }]
}

const fingerprint = (s: GameState) => JSON.stringify({ ...s, log: s.log.length })

interface GameOut { finished: boolean; rounds: number; winner: string | null; decisions: number; errors: string[]; maxStepMs: number; log: Action[]; final: GameState }

async function playOne(bundle: EditionBundle, g: number): Promise<GameOut> {
  const gameSeed = `${SEED}-${g}`
  const errors: string[] = []
  const err = (s: GameState, msg: string) => { if (errors.length < 5) errors.push(`${gameSeed} r${s.round} ${s.pending.kind} ${s.pending.id}: ${msg}`) }
  let state = createGame(bundle, { seed: gameSeed, ...(SCENARIO ? { scenarioId: SCENARIO } : {}) })
  const bots: Record<SeatId, ReturnType<typeof createRandomDecider>> = {}
  for (const seat of state.seatOrder) bots[seat] = createRandomDecider(`${gameSeed}-${seat}`)
  let decisions = 0, maxStepMs = 0

  // Reject, never throw: a malformed action leaves the same state reference.
  const bad = apply(state, bundle, { type: 'nonsense', decisionId: 'x', seat: 'nobody' } as Action)
  if (bad.ok || bad.state !== state) err(state, 'malformed action was not rejected cleanly')

  while (state.phase !== 'over') {
    if (decisions >= CAP) { err(state, `stall: ${CAP} decisions without an end`); break }
    const p = state.pending
    const legal = legalActions(state)
    if (legal.length === 0) { err(state, 'open decision with no legal actions'); break }
    try {
      // Every legal option is accepted (parameterised ones are filled in like the decider would).
      if (decisions % CHECK_EVERY === 0) {
        for (const o of legal) {
          if (PARAMETERISED.has(o.type)) continue
          const r = apply(state, bundle, o)
          if (!r.ok) err(state, `legal option ${o.type} rejected: ${r.rejection.code} ${r.rejection.message}`)
        }
      }
      const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
      let action = await bots[seat]!.decide(view(state, seat), p, legal)
      const t0 = performance.now()
      let r = PARAMETERISED.has(action.type) ? apply(state, bundle, { ...action, path: randomPath(state, gameSeed, 0) }) : apply(state, bundle, action)
      for (let k = 1; !r.ok && PARAMETERISED.has(action.type) && k < 12; k++) {
        r = apply(state, bundle, { ...action, path: randomPath(state, gameSeed, k) })
      }
      if (!r.ok && PARAMETERISED.has(action.type)) {
        // No random path worked: take any other option instead (a cancel is always offered beside move.to).
        action = legal.find((a) => !PARAMETERISED.has(a.type)) ?? action
        r = apply(state, bundle, action)
      }
      const ms = performance.now() - t0
      maxStepMs = Math.max(maxStepMs, ms)
      if (ms > STEP_MS) err(state, `slow step ${action.type}: ${ms.toFixed(0)} ms`)
      if (!r.ok) { err(state, `chosen ${action.type} rejected: ${r.rejection.code} ${r.rejection.message}`); break }
      if (r.state.log.length !== state.log.length + 1) err(state, 'accepted action was not logged')
      state = r.state
      decisions++
    } catch (e) {
      err(state, `threw: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`)
      break
    }
  }
  return { finished: state.phase === 'over', rounds: state.round, winner: state.result?.winner ?? null, decisions, errors, maxStepMs, log: state.log, final: state }
}

/** Determinism: replaying (seed, log) from a fresh game reproduces the final state. */
function replay(bundle: EditionBundle, g: number, out: GameOut): string | null {
  const gameSeed = `${SEED}-${g}`
  let s = createGame(bundle, { seed: gameSeed, ...(SCENARIO ? { scenarioId: SCENARIO } : {}) })
  for (const [i, a] of out.log.entries()) {
    const r = apply(s, bundle, a)
    if (!r.ok) return `${gameSeed}: replay rejected action ${i} (${a.type}): ${r.rejection.message}`
    s = r.state
  }
  return fingerprint(s) === fingerprint(out.final) ? null : `${gameSeed}: replay from seed + log diverged`
}

const bundle = loadBundle()
const t0 = performance.now()
let finished = 0, roundsSum = 0, decisions = 0, maxStepMs = 0
const winners: Record<string, number> = {}
const actions: Record<string, number> = {}, events: Record<string, number> = {}
const errors: string[] = []
for (let g = 0; g < GAMES; g++) {
  const out = await playOne(bundle, g)
  decisions += out.decisions
  maxStepMs = Math.max(maxStepMs, out.maxStepMs)
  errors.push(...out.errors)
  const rp = replay(bundle, g, out)
  if (rp) errors.push(rp)
  if (STATS) {
    for (const a of out.log) actions[a.type] = (actions[a.type] ?? 0) + 1
    for (const e of out.final.events) events[e.type] = (events[e.type] ?? 0) + 1
  }
  if (out.finished) {
    finished++
    roundsSum += out.rounds
    const w = out.winner ?? 'draw'
    winners[w] = (winners[w] ?? 0) + 1
  }
}
const summary = {
  games: GAMES, finished, avgRounds: finished ? Number((roundsSum / finished).toFixed(2)) : 0, winners, decisions,
  errors: errors.length, maxStepMs: Number(maxStepMs.toFixed(1)), seconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
  ...(STATS ? { actions, events } : {}),
}
console.log(JSON.stringify(summary))
if (errors.length) {
  for (const e of errors.slice(0, 20)) console.error(e)
  process.exitCode = 1
}
