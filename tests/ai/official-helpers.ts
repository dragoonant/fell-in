// Shared fixtures for the official AI tests (spec 18 s8): custom AI cards, scenario overrides, mid-activation set-ups.
import type { AiCardDef, EditionBundle } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { raiseDecision } from '../../src/engine/registry'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, ModelState, TerrainInstance } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { createOfficialAiDecider, type OfficialAiDecider } from '../../src/ai/official/decider'
import type { AiMethod, AiResponse } from '../../src/ai/official/types'
import { activationMenu } from '../../src/engine/turnflow'
import { loadBundle, rocketAtOrigin } from '../engine/helpers'

export const bundle = loadBundle()

export interface CardSpec {
  response: AiResponse
  reckless?: boolean
  stay?: boolean
  method?: AiMethod
  priorities?: string[]
  notes?: string[]
  unitId?: string
  preferFirst?: string
  columns?: AiCardDef['columns']
  cellsByColumn?: { response: AiResponse; reckless: boolean; stayEngaged: boolean }[]
}

/** A test card: every blue-die row gives the same cell, so the rolled face does not matter. */
export function testCard(spec: CardSpec): AiCardDef {
  const cell = { response: spec.response, reckless: spec.reckless ?? false, stayEngaged: spec.stay ?? false }
  const method = spec.method ?? 'close'
  const cols = spec.columns ?? [{ label: 'any', when: {} }]
  const cells = spec.cellsByColumn ?? cols.map(() => cell)
  return {
    id: 'test-card', unitId: spec.unitId ?? 'super-mutant', standardEquipment: [],
    columns: cols,
    rows: [
      { blueIcons: ['BOT', 'BOT2'], cells, method: [method, method] },
      { blueIcons: ['STAR', 'BOT+STAR', 'STAR2'], cells, method: [method, method, method] },
      { blueIcons: ['BLAST'], cells, method: [method] },
    ],
    targetPriority: spec.priorities ?? ['nearest'],
    ...(spec.notes ? { notes: spec.notes } : {}),
    ...(spec.preferFirst ? { preferFirst: spec.preferFirst } : {}),
    source: 'test',
  }
}

/** The bundle with the ai-rr AI side objective replaced. */
export function bundleWith(ai: { objective: 'defeat' | 'goTo' | 'use' | 'protect'; subject: string; switches?: { when: string; set: object }[] }): EditionBundle {
  return {
    ...bundle,
    records: {
      ...bundle.records,
      scenarios: bundle.records.scenarios.map((s) => (s.id === 'ai-rr' ? { ...s, sides: s.sides.map((sd) => (sd.ai ? { ...sd, ai } : sd)) } : s)),
    },
  }
}

export const set = (s: GameState, id: string, patch: Partial<ModelState>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })
export const place = (s: GameState, id: string, x: number, z: number): GameState => set(s, id, { pos: { x, z } })
export const stripLuck = (s: GameState): GameState => ({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, luck: 0, heroic: false }])) })

/** Park every model along the far sides so a scene starts empty; the scene then places what it needs. */
export function parkAll(s: GameState): GameState {
  let out = s
  let i = 0
  for (const m of Object.values(s.models)) out = place(out, m.id, -17 + (i++ % 12) * 3, m.owner === 'ai' ? -17 : 17)
  return out
}

/** Put a model mid-activation with the real menu raised. */
export function activate(s0: GameState, b: EditionBundle, modelId: string, actionsTaken = 0, extra: { ap?: number; terrain?: TerrainInstance[] } = {}): GameState {
  const m = s0.models[modelId]!
  const s: GameState = {
    ...s0, phase: 'play', round: 1, terrain: extra.terrain ?? [], advantage: m.owner,
    models: { ...s0.models, [modelId]: { ...m, readiness: 'ready' } },
    turn: { seat: m.owner, step: 'use', readied: modelId, firstSeat: m.owner },
    activation: { modelId, actionsTaken, ap: extra.ap ?? 0, apIconsUsed: [], heavyFired: false, testsUsed: [] },
  }
  const left = Math.max(0, 2 - actionsTaken)
  return raiseDecision(s, { seat: m.owner, kind: 'turn.activation', context: { modelId, actionsLeft: left, ap: extra.ap ?? 0 }, options: activationMenu(s, b, modelId), canPass: false })
}

export function newDecider(card: AiCardDef, b: EditionBundle = bundle, seed = 'ut'): OfficialAiDecider {
  return createOfficialAiDecider({ seed, bundle: b, cards: [card] })
}

/** One AI decision on the open pending, applied; returns the chosen action and the next state. */
export function step(s: GameState, d: OfficialAiDecider, b: EditionBundle = bundle): { action: Action; state: GameState; log: ReturnType<OfficialAiDecider['decideSync']>['log'] } {
  const seat = s.pending.seat as string
  const r = d.decideSync(view(s, seat), s.pending, legalActions(s))
  const a = apply(s, b, r.action)
  if (!a.ok) throw new Error(`rejected ${r.action.type}: ${a.rejection.code} ${a.rejection.message}`)
  return { action: r.action, state: a.state, log: r.log }
}

/** A fresh ai-rr game with all models parked and luck stripped; `place` puts models where the scene needs them. */
export function scene(opts: { b?: EditionBundle; seed?: string; place?: Record<string, [number, number]> }): { s: GameState; b: EditionBundle } {
  const b = opts.b ?? bundle
  let s = stripLuck(parkAll(rocketAtOrigin(createGame(b, { seed: opts.seed ?? 'sc', scenarioId: 'ai-rr', seats: ['p1', 'ai'] }))))
  for (const [id, [x, z]] of Object.entries(opts.place ?? {})) s = place(s, id, x, z)
  return { s, b }
}

/** Centre distance of a 40 mm base touching a 32 mm base. */
export const CONTACT_40_32 = (40 + 32) / 25.4 / 2
