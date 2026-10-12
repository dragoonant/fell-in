// Game setup. createGame builds a real game from the data bundle and a scenario record; createDemoGame keeps the M0
// demo table (no bundle) for the client until M3. Deployment and terrain are automatic and simple for now: each seat
// deploys in a row inside its zone (seat 0 at the near edge, +z), and the table gets a symmetric set of pieces.
import type { EditionBundle, ScenarioDef, ScenarioForce } from '../data/types'
import { recordOf, rulerColours, rulerInches } from './edition'
import { baseRadius } from './geometry'
import { raiseDecision } from './registry'
import { seedRng } from './rng'
import { themedTerrain } from './terrainCatalog'
import type { CarriedItem, CarriedKind, GameState, MarkerState, ModelState, SeatId, SeatState, TerrainInstance } from './types'

export const TABLE_IN = 36 // M0 demo only; real games take the table from the scenario record

/** Default scenario: Box scenario 1 (kill all enemies, 6 rounds, 3 searchables on the centre line). */
export const DEFAULT_SCENARIO_ID = 'box-1'

/** Starter-set skirmish forces used when a scenario side lists none: Survivors vs Super Mutants (the AI-RR line-up). */
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

export interface CreateGameOpts {
  seed: string
  /** Seat ids in order; seat i plays scenario side i. Default ['A', 'B']. */
  seats?: SeatId[]
  scenarioId?: string
  /** Per-seat forces overriding the scenario's (and the defaults). */
  forces?: Partial<Record<SeatId, ScenarioForce[]>>
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
function carriedFor(bundle: EditionBundle, modelId: string, ids: readonly string[]): CarriedItem[] {
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
    const colours = rulerColours(bundle)
    const spacingColour = colours.find((c) => c === place.spacing)
    const step = spacingColour ? rulerInches(bundle, spacingColour) : w / (n + 1)
    const idx = typeof place.index === 'number' ? place.index - 1 : i
    const x = (idx - (n - 1) / 2) * step
    return { id: `marker-${i + 1}`, kind: mk.kind, face: mk.face, pos: { x: Math.max(-w / 2 + 1, Math.min(w / 2 - 1, x)), z: 0 }, revealed: false, seenBy: [], props: { ...(mk.props ?? {}) } }
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
 * from opts.forces, else the scenario side, else DEFAULT_FORCES[i]. Unknown unit ids are skipped. The first decision is
 * 'turn.start' for the first seat (owned by turnflow). Throws on an unknown scenario id (a setup error, not an Action).
 */
export function createGame(bundle: EditionBundle, opts: CreateGameOpts): GameState {
  const scenarioId = opts.scenarioId ?? DEFAULT_SCENARIO_ID
  const sc = recordOf(bundle, 'scenarios', scenarioId)
  if (!sc) throw new Error(`createGame: no scenario "${scenarioId}" in edition ${bundle.edition}`)
  const seatOrder = opts.seats ?? ['A', 'B']
  const [w, d] = sc.tableIn
  const models: Record<string, ModelState> = {}
  const seats: Record<SeatId, SeatState> = {}
  seatOrder.forEach((seat, i) => {
    const side = sc.sides[i]
    const forces = opts.forces?.[seat] ?? (side?.forces?.length ? side.forces : DEFAULT_FORCES[i] ?? [])
    const list: ModelState[] = []
    const counts: Record<string, number> = {}
    for (const f of forces) {
      const unit = recordOf(bundle, 'units', f.unit)
      if (!unit) continue
      for (let k = 0; k < Math.max(1, f.count); k++) {
        const n = (counts[f.unit] = (counts[f.unit] ?? 0) + 1)
        const id = `${seat.toLowerCase()}-${f.unit}-${n}`
        const heroic = !!f.heroic
        list.push({
          ...modelDefaults(),
          id, profileId: unit.id, owner: seat, unitId: id, pos: { x: 0, z: 0 }, elev: 0, base: unit.baseMm, life: 'active', conditions: [],
          heroic, luck: unit.luck || heroic ? unit.attrs.luc : 0,
          carried: carriedFor(bundle, id, [...unit.equipped, ...f.items]),
          ...(f.leader ? { leaderId: f.leader } : {}),
        })
      }
    }
    // Deploy in a row (two rows when crowded) inside the zone: seat 0 near edge (+z), seat 1 far edge (-z), others centre.
    const sign = i === 0 ? 1 : i === 1 ? -1 : 0
    const depth = deployDepth(bundle, side?.deploy)
    const perRow = Math.max(1, Math.floor((w - 4) / 3))
    list.forEach((m, j) => {
      const r = baseRadius(m.base)
      const row = Math.floor(j / perRow), col = j % perRow, inRow = Math.min(perRow, list.length - row * perRow)
      const x = (col - (inRow - 1) / 2) * 3
      const zEdge = d / 2 - r - 0.25 - row * Math.min(2, Math.max(0, depth - 2 * r - 0.5))
      models[m.id] = { ...m, pos: { x, z: sign * zEdge } }
    })
    seats[seat] = {
      id: seat, side: side?.id ?? `side-${i + 1}`,
      faction: side?.faction ?? (list[0] ? recordOf(bundle, 'units', list[0].profileId)?.faction ?? null : null),
      done: false, score: 0,
    }
  })
  const base: GameState = {
    seed: opts.seed,
    rng: seedRng(opts.seed),
    rollSeq: 0,
    decisionSeq: 0,
    models,
    terrain: w === 36 && d === 36 ? themedTerrain(sc.id) : simpleTerrain(w, d),
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
  return raiseDecision(base, {
    seat: seatOrder[0]!, kind: 'turn.start', context: { scenarioId: sc.id }, canPass: false,
    options: [{ id: 'start', label: 'Begin the battle', action: { type: 'turn.start', decisionId: '', seat: seatOrder[0]! } }],
  })
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
