// AI bench (docs/spec/30-ai-bot.md s12): tier A vs tier B over the box scenarios with alternating seats.
// Run: npm run bench:ai -- --games 100 --seed s --a normal --b random --scenarios box-1,box-2,box-3,box-4,box-5 [--cap 4000]
// Game g plays scenarios[g % k]; tier A sits in seat A on even games and seat B on odd games. Deciders see only
// view(state, seat); the host dry-run (apply(...).ok on the real state) is their accepts check, as in the client.
// Prints one JSON line: {games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors, fallbacks, unfinished, ...}.
// box-5 is not in the default list: its seat B (a lone Super Mutant) cannot win until the engine has a rescue Action and ViewExtras.markers
// (RULING in docs/needs-rules-check.md); name it with --scenarios to run it. --accepts shim drops the host dry run (worker-path check).
// AI_MS sets the per-decision budget; AI_TUNE tunes tier weights (src/ai/types.ts applyTuning).
// --jobs N splits the games over N child processes (default: half the cores, at most 12). --rounds R stops a game still
// going after round R (scored unfinished, never a win for A). --losses lists the games A did not win; --kinds adds per-decision-kind timing for tier A; --only 3,7
// replays just those game indexes (same seeds) in one process, with --verbose for a per-game line and --trace for every
// applied action with its events. --seat A|B pins tier A to one seat (tuning one side of an asymmetric scenario). byScenario keys are
// `<scenario>:<seat tier A sat in>`.
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAiDecider, type AiDecider } from '../src/ai/decider'
import { PARAMETERISED } from '../src/ai/random'
import { applyTuning, TIER_IDS, type Tier } from '../src/ai/types'
import { buildBundles, type RawFile } from '../src/data/bundle'
import type { EditionBundle } from '../src/data/types'
import { apply } from '../src/engine/apply'
import { legalActions } from '../src/engine/pending'
import { createGame } from '../src/engine/setup'
import type { Action, GameState, SeatId } from '../src/engine/types'
import { aiViewOf } from '../src/ai/world'

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def
}
const asTier = (t: string): Tier => {
  if (!(TIER_IDS as readonly string[]).includes(t)) { console.error(`bench:ai: unknown tier "${t}" (${TIER_IDS.join(', ')})`); process.exit(2) }
  return t as Tier
}
const GAMES = Number(arg('games', '10'))
const SEED = arg('seed', 's')
const TIER_A = asTier(arg('a', 'normal'))
const TIER_B = asTier(arg('b', 'random'))
const SCENARIOS = arg('scenarios', 'box-1,box-2,box-3,box-4').split(',').map((s) => s.trim()).filter(Boolean)
const CAP = Number(arg('cap', '4000'))
const ROUND_CAP = Number(arg('rounds', '30'))
const VERBOSE = process.argv.includes('--verbose')
const TRACE = process.argv.includes('--trace')
const FROM = Number(arg('from', '0'))
const TO = Number(arg('to', String(GAMES)))
/** --accepts shim runs deciders with the default worker-style shim check (no host dry run); every rejected answer is counted. */
const SHIM = arg('accepts', 'host') === 'shim'
const CHILD = process.argv.includes('--child')
const ONLY = arg('only', '')
/** --seat A|B pins tier A to that seat in every game (tuning one side of an asymmetric scenario). */
const SEAT = arg('seat', '')
const DEFAULT_JOBS = Math.min(12, Math.max(1, Math.floor(cpus().length / 2)))
const JOBS = CHILD ? 1 : Math.max(1, Math.min(GAMES, Number(arg('jobs', String(DEFAULT_JOBS)))))

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
  if (!b) throw new Error(`bench:ai: no edition ${edition} under data/`)
  return b
}

interface GameOut {
  g: number; seconds: number
  scenario: string; seatA: SeatId; winner: 'A' | 'B' | 'draw' | 'unfinished'; reason: string; rounds: number
  decisions: number; rejected: number; errors: string[]; ms: number[]; fallbacks: number
  byKind: Record<string, { n: number; ms: number; max: number; fallbacks: number }>
}

function playOne(bundle: EditionBundle, g: number): GameOut {
  const tg = performance.now()
  const scenario = SCENARIOS[g % SCENARIOS.length]!
  const gameSeed = `${SEED}:g${g}`
  let state: GameState = createGame(bundle, { seed: gameSeed, scenarioId: scenario })
  const seatA = SEAT && state.seatOrder.includes(SEAT) ? SEAT : state.seatOrder[g % 2]!
  const tierOf = (seat: SeatId): Tier => (seat === seatA ? TIER_A : TIER_B)
  // The host dry run reads the live state: deciders still only receive the view.
  const accepts = SHIM ? undefined : (a: Action) => apply(state, bundle, a).ok
  const deciders: Record<SeatId, AiDecider> = {}
  for (const seat of state.seatOrder) deciders[seat] = createAiDecider(tierOf(seat), { seed: `${gameSeed}:${seat}`, bundle, ...(accepts ? { accepts } : {}) })
  const ms: number[] = []
  const errors: string[] = []
  let decisions = 0, rejected = 0
  while (state.phase !== 'over') {
    if (state.round > ROUND_CAP) break
    if (decisions >= CAP) { errors.push(`${gameSeed} ${scenario}: stall, ${CAP} decisions without an end`); break }
    const p = state.pending
    const legal = legalActions(state)
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const d = deciders[seat]!
    let action: Action
    const t0 = performance.now()
    try {
      action = d.decideSync(aiViewOf(state, seat), p, legal).action
    } catch (e) {
      errors.push(`${gameSeed} ${scenario} ${p.kind}: decider threw ${(e as Error).message}`)
      break
    }
    if (tierOf(seat) !== 'random') ms.push(performance.now() - t0)
    if (p.seat === 'all') action = { ...action, seat }
    let r = apply(state, bundle, action)
    if (!r.ok) {
      rejected++
      if (VERBOSE) console.error(`rejected ${p.kind} ${action.type}: ${r.rejection.code} ${r.rejection.message}`)
      const fb = legal.find((a) => !PARAMETERISED.has(a.type))
      if (fb) r = apply(state, bundle, p.seat === 'all' ? { ...fb, seat } : fb)
      if (!r.ok) { errors.push(`${gameSeed} ${scenario} ${p.kind}: ${action.type} rejected and no fallback (${r.rejection.code})`); break }
    }
    if (TRACE) {
      const evs = r.state.events.slice(state.events.length).filter((e) => e.type !== 'diceRolled').map((e) => JSON.stringify(e).slice(0, 140))
      const a = action as Record<string, unknown>
      const mid = String(a.modelId ?? (p.context as { modelId?: string } | undefined)?.modelId ?? '')
      const mm = r.state.models[mid]
      console.error(`r${state.round} ${seat}${tierOf(seat) === TIER_A ? '*' : ''} ${p.kind} ${action.type} ${mid}${mm ? `@${mm.pos.x.toFixed(1)},${mm.pos.z.toFixed(1)} dmg${mm.damage}` : ''} ${a.targetId ?? ''} ${a.weaponUid ?? ''}${p.kind === 'turn.activation' && tierOf(seat) === TIER_A ? ` [${legal.map((l) => l.type + (l.targetId ? '>' + String(l.targetId) : '')).join(' ')}]` : ''}${evs.map((e) => `\n    ${e}`).join('')}`)
    }
    state = r.state
    decisions++
  }
  const res = state.result
  const winner: GameOut['winner'] = state.phase !== 'over' || !res ? 'unfinished' : res.winner === null ? 'draw' : res.winner === seatA ? 'A' : 'B'
  const fallbacks = Object.values(deciders).reduce((n, d) => n + (d.tier === 'random' ? 0 : d.memory.stats.fallbacks), 0)
  const byKind: GameOut['byKind'] = {}
  for (const seat of state.seatOrder) {
    if (seat !== seatA) continue
    for (const [k, v] of Object.entries(deciders[seat]!.memory.stats.byKind)) byKind[k] = { ...v }
  }
  return {
    g, seconds: Number(((performance.now() - tg) / 1000).toFixed(1)),
    scenario, seatA, winner, reason: res?.reason ?? 'unfinished', rounds: state.round, decisions, rejected, errors, ms, fallbacks, byKind,
  }
}

/** Run games [from, to) in a child process (same flags), returning its GameOut rows. */
function runChild(from: number, to: number): Promise<GameOut[]> {
  const skip = new Set(['--jobs', '--from', '--to'])
  const args = process.argv.slice(2)
  const pass = args.filter((a, i) => !skip.has(a) && !skip.has(args[i - 1] ?? ''))
  const script = fileURLToPath(import.meta.url)
  return new Promise((res, rej) => {
    const ch = spawn(process.execPath, [...process.execArgv, script, ...pass, '--from', String(from), '--to', String(to), '--child'], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env })
    let out = ''
    ch.stdout.on('data', (d) => { out += String(d) })
    ch.on('error', rej)
    ch.on('close', () => {
      try { res(JSON.parse(out.trim().split('\n').pop()!) as GameOut[]) } catch (e) { rej(new Error(`bench child ${from}-${to} failed: ${(e as Error).message}`)) }
    })
  })
}

function report(outs: GameOut[], t0: number): void {
  const allMs = outs.flatMap((o) => o.ms)
  const sorted = [...allMs].sort((a, b) => a - b)
  const winsA = outs.filter((o) => o.winner === 'A').length
  const winsB = outs.filter((o) => o.winner === 'B').length
  const byScenario: Record<string, { games: number; winsA: number; winsB: number }> = {}
  for (const o of outs) {
    const e = (byScenario[`${o.scenario}:${o.seatA}`] ??= { games: 0, winsA: 0, winsB: 0 })
    e.games++; if (o.winner === 'A') e.winsA++; if (o.winner === 'B') e.winsB++
  }
  const errors = outs.flatMap((o) => o.errors)
  const kinds: Record<string, { n: number; avgMs: number; maxMs: number; fallbacks: number }> = {}
  for (const o of outs) {
    for (const [k, v] of Object.entries(o.byKind)) {
      const e = (kinds[k] ??= { n: 0, avgMs: 0, maxMs: 0, fallbacks: 0 })
      e.avgMs = (e.avgMs * e.n + v.ms) / (e.n + v.n); e.n += v.n; e.maxMs = Math.max(e.maxMs, v.max); e.fallbacks += v.fallbacks
    }
  }
  for (const e of Object.values(kinds)) { e.avgMs = Number(e.avgMs.toFixed(1)); e.maxMs = Number(e.maxMs.toFixed(1)) }
  const summary = {
    a: TIER_A, b: TIER_B, games: outs.length, winsA, winsB,
    draws: outs.filter((o) => o.winner === 'draw').length,
    unfinished: outs.filter((o) => o.winner === 'unfinished').length,
    winRateA: Number((winsA / Math.max(1, outs.length)).toFixed(3)),
    msPerDecision: Number((allMs.reduce((a, b) => a + b, 0) / Math.max(1, allMs.length)).toFixed(2)),
    p95Ms: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)),
    errors: errors.length,
    rejected: outs.reduce((n, o) => n + o.rejected, 0),
    fallbacks: outs.reduce((n, o) => n + o.fallbacks, 0),
    byScenario,
    ...(process.argv.includes('--kinds') ? { kinds } : {}),
    seconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
  }
  console.log(JSON.stringify(summary))
  if (process.argv.includes('--losses')) {
    for (const o of outs) if (o.winner !== 'A') console.error(`not won: game ${o.g} ${o.scenario} (${TIER_A} as ${o.seatA}) ${o.winner}: ${o.reason}, round ${o.rounds}`)
  }
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(e)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  applyTuning(process.env.AI_TUNE)
  const t0 = performance.now()
  let outs: GameOut[] = []
  const only = ONLY ? ONLY.split(',').map(Number).filter(Number.isFinite) : null
  if (CHILD || JOBS === 1 || only) {
    const bundle = loadBundle()
    for (const g of only ?? Array.from({ length: Math.max(0, TO - FROM) }, (_, i) => FROM + i)) {
      const o = playOne(bundle, g)
      outs.push(o)
      if (VERBOSE) console.error(`game ${g} ${o.scenario} (${TIER_A} as ${o.seatA}): ${o.winner} by ${o.reason}, round ${o.rounds}, ${o.decisions} decisions, ${o.seconds}s`)
    }
    if (CHILD) { console.log(JSON.stringify(outs)); return }
  } else {
    const per = Math.ceil(GAMES / JOBS)
    const parts: Promise<GameOut[]>[] = []
    for (let f = 0; f < GAMES; f += per) parts.push(runChild(f, Math.min(GAMES, f + per)))
    outs = (await Promise.all(parts)).flat().sort((a, b) => a.g - b.g)
  }
  report(outs, t0)
}

void main()
