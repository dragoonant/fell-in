// Public engine surface. Contract files (frozen after M1): types, decider, view, rng, pending.
// M2 foundations (frozen for the rules owners): registry, apply, query, dice, edition, setup.
export * from './types'
export * from './geometry'
export * from './measure'
export * from './los'
export * from './terrain'
export { seedRng, rollDie, rollD20, rollD12, roll, deriveSeed, type DiceRolled, type RollSpec } from './rng'
export { createRandomDecider, createReplayDecider, type Decider, type DeciderKind } from './decider'
export { view } from './view'
export { raise, legalActions } from './pending'
export { createDemoGame, createGame, modelDefaults, gameDefaults, DEFAULT_SCENARIO_ID, DEFAULT_FORCES, type CreateGameOpts } from './setup'
export { apply, matchesOption, type ApplyResult } from './apply'
export {
  modules, moduleFor, namespaceOf, allOptions, controller, raiseDecision, option, reject, isRejection, todo, TodoError,
  pushEvents, updateModel, type ModuleDef, type Controller, type ModuleId, type StepResult, type ActionDone, type Trigger,
} from './registry'
export * as query from './query'
export type { Band, RangeInfo, CoverInfo, HitOdds, DamageOdds, AttackOpts } from './query'
export * as dice from './dice'
export * as edition from './edition'
