// Game setup. createGame builds a real game from the data bundle and a scenario record; createDemoGame keeps the M0
// demo table (no bundle) for the client until M3. Deployment and terrain are automatic and simple for now: each seat
// deploys in a row inside its zone (seat 0 at the near edge, +z), and the table gets a symmetric set of pieces.
import type { EditionBundle, ScenarioDef, ScenarioForce } from '../data/types'
import { recordOf, rulerColours, rulerInches } from './edition'
import { baseRadius } from './geometry'
import { pushEvents, raiseDecision } from './registry'
import { roll, seedRng } from './rng'
import { deployScenario } from './scenarios/deploy'
import { themedTerrain, themeFits, type TerrainTheme } from './terrainCatalog'
import type { CarriedItem, CarriedKind, GameState, MarkerState, ModelState, SeatController, SeatId, SeatState, TerrainInstance } from './types'

export const TABLE_IN = 36 // M0 demo only; real games take the table from the scenario record

/** Default scenario: Box scenario 1 (kill all enemies, 6 rounds, 3 searchables on the centre line). */
export const DEFAULT_SCENARIO_ID = 'box-1'

/** Starter-set skirmish forces (Survivors vs Super Mutants, the AI-RR line-up). Reference only: createGame no longer falls back to them, every scenario side declares its own forces. */
export const DEFAULT_FORCES: readonly (readonly ScenarioForce[])[] = [
  [
    { unit: 'sole-survivor', count: 1, items: ['hunting-rifle', 'baseball-bat'] },
    { unit: 'dogmeat', count: 1, items: [] },
    { unit: 'settler', count: 2, items: ['laser-rifle'] },
    { unit: 'enslaved-tech', count: 1, items: ['combat-shotgun'] },
  ],
  [
    { unit: 'brute', count: 1, items: ['sledgehammer'] },
    { unit: 'super-mutant', count: 2, items: ['board', 'bolt-action-pipe-rifle'] },
    { unit: 'mutant-hound', count: 2, items: [] },
  ],
]

/**
 * Campaign layer hand-off (spec 00 s11, 19 s7; additive, absent in plain games): per-model state a force list cannot carry.
 * Keys are engine model ids (`<seat lowercase>-<unit>-<n>`), which src/campaign/battle.ts computes the same way.
 */
export interface CampaignGameOpts {
  /** Damage tokens a model starts with (Explore cards, assigned after the force is picked; EXPL-004). */
  damage?: Record<string, number>
  /** Carried card ids that start degraded (Power Armor that ended the last battle degraded; CH p24). */
  degraded?: Record<string, string[]>
  /** Mods fitted to a carried card: model id -> card id -> mod ids. */
  mods?: Record<string, Record<string, string[]>>
}

export interface CreateGameOpts {
  seed: string
  /** Seat ids in order; seat i plays scenario side i. Default ['A', 'B']. */
  seats?: SeatId[]
  scenarioId?: string
  /** Per-seat forces overriding the scenario's (and the defaults). */
  forces?: Partial<Record<SeatId, ScenarioForce[]>>
  /** Who answers each seat's decisions (spec 18 s8.2). Default 'human'; the seat named 'ai' defaults to 'official'. */
  controllers?: Partial<Record<SeatId, SeatController>>
  /** A themed board (suburbs, red-rocket, junkyard). Applies only to open skirmish tables (themeFits); every other scenario keeps its own terrain. */
  theme?: TerrainTheme | null
  /** Campaign hand-off: starting damage, degraded suits and fitted mods per model. Perks ride on ScenarioForce.perks. */
  campaign?: CampaignGameOpts
}

/** Every M2 rules field of a fresh model (unready, no tokens, nothing carried). */
export function modelDefaults(): Omit<ModelState, 'id' | 'profileId' | 'owner' | 'pos' | 'elev' | 'base' | 'life' | 'conditions'> {
  return {
    readiness: 'unready', damage: 0, rad: 0, luck: 0, reaction: false, chargeBonus: [], armorBoost: 0, bonusDice: [],
    carried: [], effects: [], addictions: [], heroic: false, tokens: {},
  }
}

/** Every M2 rules field of a fresh game (no bundle needed). */
export function gameDefaults(edition = 'none'): Pick<GameState, 'edition' | 'scenarioId' | 'phase' | 'round' | 'maxRounds' | 'seats' | 'seatOrder' | 'advantage' | 'turn' | 'activation' | 'action' | 'markers' | 'events' | 'result'> {
  return {
    edition, scenarioId: null, phase: 'setup', round: 0, maxRounds: null, seats: {}, seatOrder: [], advantage: null,
    turn: null, activation: null, action: null, markers: [], events: [], result: null,
  }
}

function kindOf(bundle: EditionBundle, id: string): CarriedKind | null {
  if (recordOf(bundle, 'weapons', id)) return 'weapon'
  if (recordOf(bundle, 'armor', id)) return 'armor'
  if (recordOf(bundle, 'items', id)) return 'item'
  if (recordOf(bundle, 'mods', id)) return 'mod'
  return null
}

/** Carried instances for a model: the unit card's equipped list, then the force entry's items (deduplicated). */
export function carriedFor(bundle: EditionBundle, modelId: string, ids: readonly string[]): CarriedItem[] {
  const out: CarriedItem[] = []
  for (const defId of [...new Set(ids)]) {
    const kind = kindOf(bundle, defId)
    if (!kind) continue
    const c: CarriedItem = { uid: `${modelId}/${defId}`, defId, kind, starting: true }
    if (kind === 'weapon') {
      const w = recordOf(bundle, 'weapons', defId)!
      if (w.critical) c.cp = 0
      if (w.slowFiring) c.loaded = true
      if (w.primed) c.primed = 0
    }
    out.push(c)
  }
  return out
}

/** Zone depth in inches from a deploy record ({within: '<colour>'}); defaults to the shortest-but-one ruler. */
function deployDepth(bundle: EditionBundle, deploy: unknown): number {
  const colours = rulerColours(bundle)
  const w = (deploy as { within?: unknown } | null)?.within
  const c = colours.find((x) => x === w) ?? colours[1] ?? colours[0]!
  return rulerInches(bundle, c)
}

/** Searchable/investigation markers: centre-line placement with ruler spacing, else spread along the centre line. */
function placeMarkers(bundle: EditionBundle, sc: ScenarioDef, w: number): MarkerState[] {
  const n = sc.markers.length
  return sc.markers.map((mk, i) => {
    const place = mk.place as { spacing?: string; index?: number }
    const props: Record<string, unknown> = { ...(mk.props ?? {}) }
    // Objects with Health are targets: full Health, no damage, shootable and meleeable in contact unless the data says no.
    // Tutorial investigation markers (cans, plants, mounds) are the targets of the practice shoots (SCN-005).
    const target = (mk.kind === 'object' && typeof props.health === 'number') || (sc.mode === 'tutorial' && mk.kind === 'investigation')
    if (typeof props.health === 'number') { props.maxHealth ??= props.health; props.damage ??= 0 }
    if (target) { props.shootable ??= true; props.meleeable ??= mk.kind === 'object' }
    const colours = rulerColours(bundle)
    const spacingColour = colours.find((c) => c === place.spacing)
    const step = spacingColour ? rulerInches(bundle, spacingColour) : w / (n + 1)
    const idx = typeof place.index === 'number' ? place.index - 1 : i
    const x = (idx - (n - 1) / 2) * step
    return { id: `marker-${i + 1}`, kind: mk.kind, face: mk.face, pos: { x: Math.max(-w / 2 + 1, Math.min(w / 2 - 1, x)), z: 0 }, revealed: false, seenBy: [], props }
  })
}

const rect = (id: string, rulesType: TerrainInstance['rulesType'], x: number, z: number, w: number, d: number, height: number, rot = 0): TerrainInstance =>
  ({ id, pieceId: id, rulesType, pos: { x, z }, rot, footprint: { rect: { w, d } }, height, props: {} })

/** Simple symmetric terrain between the zones: per side two buildings and a low crate stack, plus a central rubble patch. */
function simpleTerrain(w: number, d: number): TerrainInstance[] {
  const out: TerrainInstance[] = []
  const zx = w * 0.28, zz = d * 0.19
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'n' : 'f'
    out.push(rect(`building-${tag}1`, 'building', -zx * s, zz * s, 5, 4, 4, 0.1 * s))
    out.push(rect(`building-${tag}2`, 'building', zx * s, zz * s, 4, 5, 4, -0.15 * s))
    out.push(rect(`crates-${tag}`, 'obstacle', 0, zz * 1.35 * s, 3, 2, 1.5))
  }
  out.push(rect('rubble-c', 'rubble', w * 0.33, -d * 0.03, 4, 3, 0.6))
  out.push(rect('rubble-w', 'rubble', -w * 0.33, d * 0.03, 4, 3, 0.6))
  return out
}

/**
 * Build a real game from data/<edition>/scenarios (default DEFAULT_SCENARIO_ID). Seat i plays scenario side i; forces come
 * from opts.forces, else the scenario side (a side with none is a data error and throws). Unknown unit ids are skipped. The first decision is
 * 'turn.start' for the first seat (owned by turnflow). Throws on an unknown scenario id (a setup error, not an Action).
 */
export function createGame(bundle: EditionBundle, opts: CreateGameOpts): GameState {
  const scenarioId = opts.scenarioId ?? DEFAULT_SCENARIO_ID
  const sc = recordOf(bundle, 'scenarios', scenarioId)
  if (!sc) throw new Error(`createGame: no scenario "${scenarioId}" in edition ${bundle.edition}`)
  const requested = opts.seats ?? ['A', 'B']
  const [w, d] = sc.tableIn
  const theme = opts.theme && themeFits(sc) ? opts.theme : null
  const controllerOf = (seat: SeatId): SeatController => opts.controllers?.[seat] ?? (seat === 'ai' ? 'official' : 'human')
  const aiSideIdx = sc.sides.findIndex((x) => x.ai)
  const hasAi = aiSideIdx >= 0 && requested.some((x) => controllerOf(x) === 'official')
  // Plain games seat one player per scenario side: a one-side tutorial has no opponent seat, however many were asked for.
  const seatOrder = hasAi ? requested : requested.slice(0, Math.max(1, sc.sides.length))
  // Seat -> scenario side. Plain games: seat i plays side i. AI games: the AI seat plays the side with the `ai` block and
  // the human seats take the other sides in order (several humans share the last one and split its force; spec 18 s8.2).
  const humanSides = sc.sides.map((_, i) => i).filter((i) => i !== aiSideIdx)
  const humanSeats = seatOrder.filter((x) => controllerOf(x) !== 'official')
  const sideIdx = (seat: SeatId): number => {
    if (!hasAi) return seatOrder.indexOf(seat)
    if (controllerOf(seat) === 'official') return aiSideIdx
    return humanSides[Math.min(humanSeats.indexOf(seat), humanSides.length - 1)] ?? 0
  }
  const models: Record<string, ModelState> = {}
  const seats: Record<SeatId, SeatState> = {}
  const perSeat: Record<SeatId, ModelState[]> = {}
  seatOrder.forEach((seat, i) => {
    const si = sideIdx(seat)
    const side = sc.sides[hasAi ? si : i]
    const sharing = seatOrder.filter((x) => sideIdx(x) === si && controllerOf(x) === controllerOf(seat))
    let forces = opts.forces?.[seat] ?? side?.forces ?? []
    if (!forces.length) throw new Error(`createGame: scenario "${sc.id}" side "${side?.id ?? i}" declares no forces (every side needs explicit forces with gear)`)
    if (!opts.forces?.[seat] && sharing.length > 1) forces = forces.filter((_, k) => k % sharing.length === sharing.indexOf(seat))
    const list: ModelState[] = []
    const counts: Record<string, number> = {}
    for (const f of forces) {
      const unit = recordOf(bundle, 'units', f.unit)
      if (!unit) continue
      for (let k = 0; k < Math.max(1, f.count); k++) {
        const n = (counts[f.unit] = (counts[f.unit] ?? 0) + 1)
        const id = `${seat.toLowerCase()}-${f.unit}-${n}`
        const heroic = !!f.heroic
        // AI forces also take everything their AI card lists as standard equipment (CH p8 step 2, ERR p.3).
        const std = controllerOf(seat) === 'official' ? bundle.records.ai.find((c) => c.unitId === f.unit)?.standardEquipment ?? [] : []
        const carried = carriedFor(bundle, id, [...unit.equipped, ...f.items, ...std])
        // Campaign extras: degraded suits and fitted mods (a campaign force bundle, spec 19 s7).
        const cx = opts.campaign
        for (const c of carried) {
          if (cx?.degraded?.[id]?.includes(c.defId)) c.degraded = true
          const fit = cx?.mods?.[id]?.[c.defId]
          if (fit?.length) c.mods = [...fit]
        }
        // Equipped Perks bought in the campaign are carried as `perk:<id>` tokens until the engine models their effects.
        const perks = (f as ScenarioForce & { perks?: string[] }).perks ?? []
        list.push({
          ...modelDefaults(),
          id, profileId: unit.id, owner: seat, unitId: id, pos: { x: 0, z: 0 }, elev: 0, base: unit.baseMm, life: 'active', conditions: [],
          heroic, luck: unit.luck || heroic ? unit.attrs.luc : 0,
          damage: opts.campaign?.damage?.[id] ?? 0,
          carried,
          tokens: Object.fromEntries(perks.map((k) => [`perk:${k}`, 1])),
          ...(f.leader ? { leaderId: f.leader } : {}),
        })
      }
    }
    perSeat[seat] = list
    seats[seat] = {
      id: seat, side: side?.id ?? `side-${i + 1}`,
      faction: side?.faction ?? (list[0] ? recordOf(bundle, 'units', list[0].profileId)?.faction ?? null : null),
      done: false, score: 0,
      ...(controllerOf(seat) !== 'human' ? { controller: controllerOf(seat) } : {}),
      ...(hasAi ? { team: controllerOf(seat) === 'official' ? 'ai' : 'players' } : {}),
    }
  })
  // Deploy each team in rows inside its zone: the first team at the near edge (+z), the second at the far edge, others in
  // the centre. In AI games the AI team is always last (far edge), the players near.
  const teamKey = (seat: SeatId): string => seats[seat]!.team ?? seats[seat]!.side
  const teamOrder = [...new Set(seatOrder.map(teamKey))].sort((x, y) => Number(x === 'ai' && hasAi) - Number(y === 'ai' && hasAi))
  teamOrder.forEach((key, ti) => {
    const members = seatOrder.filter((x) => teamKey(x) === key)
    const list = members.flatMap((x) => perSeat[x]!)
    const side = sc.sides[hasAi ? sideIdx(members[0]!) : seatOrder.indexOf(members[0]!)]
    const sign = ti === 0 ? 1 : ti === 1 ? -1 : 0
    const depth = deployDepth(bundle, side?.deploy)
    const perRow = Math.max(1, Math.floor((w - 4) / 3))
    list.forEach((m, j) => {
      const r = baseRadius(m.base)
      const row = Math.floor(j / perRow), col = j % perRow, inRow = Math.min(perRow, list.length - row * perRow)
      const x = (col - (inRow - 1) / 2) * 3
      const zEdge = d / 2 - r - 0.25 - row * Math.min(2, Math.max(0, depth - 2 * r - 0.5))
      models[m.id] = { ...m, pos: { x, z: sign * zEdge } }
    })
  })
  const base: GameState = {
    seed: opts.seed,
    rng: seedRng(opts.seed),
    rollSeq: 0,
    decisionSeq: 0,
    models,
    // A scenario that lists its own terrain (even an empty list, as the small tutorial tables do) gets exactly that; others get the generic set.
    terrain: theme ? themedTerrain(sc.id, theme) : sc.terrain ? [] : w === 36 && d === 36 ? themedTerrain(sc.id) : simpleTerrain(w, d),
    clouds: [],
    scenario: { table: { w, d } },
    pending: { id: 'd:0', seat: seatOrder[0]!, kind: 'turn.start', context: {}, options: [], canPass: false },
    log: [],
    ...gameDefaults(bundle.edition),
    scenarioId: sc.id,
    maxRounds: sc.rounds,
    seats,
    seatOrder,
    markers: placeMarkers(bundle, sc, w),
  }
  // Scenario layout from data (terrain, markers, zones) comes last: it overrides the generic rows and the AI marker draw's positions.
  // A themed board replaces the scenario's own terrain list (the markers and zones still come from its record).
  const deployBundle: EditionBundle = theme ? { ...bundle, records: { ...bundle.records, scenarios: bundle.records.scenarios.map((x) => (x.id === sc.id ? { ...x, terrain: [] } : x)) } } : bundle
  const game = deployScenario(hasAi ? setUpAiForces(base, seatOrder.filter((x) => controllerOf(x) === 'official')) : base, deployBundle)
  // A human seat opens the game; the AI never has to answer the start prompt.
  const opener = seatOrder.find((x) => controllerOf(x) !== 'official') ?? seatOrder[0]!
  return raiseDecision(game, {
    seat: opener, kind: 'turn.start', context: { scenarioId: sc.id }, canPass: false,
    options: [{ id: 'start', label: 'Begin the battle', action: { type: 'turn.start', decisionId: '', seat: opener } }],
  })
}

/** In-place Fisher-Yates through roll() so replays match (never Math.random). */
function shuffled<T>(state: GameState, items: readonly T[], purpose: string): { state: GameState; items: T[] } {
  const out = [...items]
  let s = state
  for (let i = out.length - 1; i > 0; i--) {
    const r = roll(s, { count: 1, sides: i + 1, purpose })
    s = pushEvents(r.state, [r.event])
    const j = r.event.dice[0]! - 1
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return { state: s, items: out }
}

/**
 * AI set-up (CH p8, AI-027): one Number Token per AI model drawn at random, the AI markers (the deployment spots) shuffled
 * face down and each model placed at its number's marker; each model's deployment point is kept in tokens for Fall Back.
 */
function setUpAiForces(state: GameState, aiSeats: readonly SeatId[]): GameState {
  let s = state
  for (const seat of aiSeats) {
    const ids = Object.values(s.models).filter((m) => m.owner === seat).map((m) => m.id).sort()
    if (!ids.length) continue
    const nums = shuffled(s, ids.map((_, i) => i + 1), `ai-setup:numbers:${seat}`)
    const spots = shuffled(nums.state, ids.map((id) => ({ ...s.models[id]!.pos })), `ai-setup:markers:${seat}`)
    s = spots.state
    const models = { ...s.models }
    ids.forEach((id, i) => {
      const pos = spots.items[i]!
      models[id] = { ...models[id]!, pos, tokens: { ...models[id]!.tokens, aiNumber: nums.items[i]!, deployX: pos.x, deployZ: pos.z } }
    })
    s = { ...s, models }
  }
  return s
}

const demoModel = (id: string, owner: SeatId, x: number, z: number, base: number): ModelState => ({
  ...modelDefaults(), id, profileId: `placeholder-${base}`, owner, pos: { x, z }, elev: 0, base, life: 'active', conditions: [],
})

/** The M0 demo table: 4 placeholder models and a few terrain pieces, no rules data. Kept for the client until M3. */
export function createDemoGame(seed = 'demo'): GameState {
  return {
    seed,
    rng: seedRng(seed),
    rollSeq: 0,
    decisionSeq: 1,
    models: Object.fromEntries([
      demoModel('p1', 'A', -9, 13, 25),
      demoModel('p2', 'A', -3, 14, 32),
      demoModel('e1', 'B', 6, -13, 40),
      demoModel('e2', 'B', 12, -11, 40),
    ].map((m) => [m.id, m])),
    terrain: [
      rect('crates', 'obstacle', -8, 2, 4, 3, 2.5, 0.3),
      rect('wall', 'obstacle', 5, 0, 10, 1.2, 4, -0.2),
      rect('wreck', 'obstruction', -2, -7, 6, 2.6, 2.4, 0.5),
      { id: 'barrels', pieceId: 'barrels', rulesType: 'obstacle', pos: { x: 11, z: 8 }, rot: 0, footprint: { circle: { r: 1.6 } }, height: 2.2, props: {} },
      rect('rubble', 'rubble', -13, -9, 6, 5, 0.8),
    ],
    clouds: [],
    scenario: { table: { w: TABLE_IN, d: TABLE_IN } },
    pending: { id: 'd:1', seat: 'A', kind: 'idle', context: {}, options: [{ id: 'pass', label: 'Pass', action: { type: 'pass', decisionId: 'd:1', seat: 'A' } }], canPass: true },
    log: [],
    ...gameDefaults(),
    seats: {
      A: { id: 'A', side: 'near', faction: null, done: false, score: 0 },
      B: { id: 'B', side: 'far', faction: null, done: false, score: 0 },
    },
    seatOrder: ['A', 'B'],
  }
}
