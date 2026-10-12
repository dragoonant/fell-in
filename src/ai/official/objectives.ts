// Objective settings (spec 18 s1.3, s8.6; CH p9, p13; AIH s2). Scenario data -> AiSettings -> ResolvedSubject.
import type { EditionBundle, ScenarioDef } from '../../data/types'
import { todo } from '../../engine/registry'
import type { ModelState } from '../../engine/types'
import type { AiView } from '../types'
import type { AiSettings, ResolvedSubject } from './types'

/** The scenario record the view belongs to (view.scenarioId via ViewExtras), or undefined. */
export function scenarioOf(view: AiView, bundle: EditionBundle): ScenarioDef | undefined {
  void view; void bundle
  return todo('objectives.scenarioOf')
}

/**
 * Current settings for one AI model: the side's `ai` block, then latched phase switches (`tokens.aiPhase`), then live
 * switch predicates (e.g. "an AI model holds the helmet"), then per-model `who` overrides. No `ai` block: Defeat
 * [any-enemy] is NOT assumed; returns objective 'none' (O falls back to A, CH p13).
 */
export function settingsFor(view: AiView, bundle: EditionBundle, me: ModelState): AiSettings {
  void view; void bundle; void me
  return todo('objectives.settingsFor')
}

/** Resolve a Subject string against the view (markers, model selectors, edges, routes, own deployment point). */
export function resolveSubject(view: AiView, bundle: EditionBundle, me: ModelState, settings: AiSettings): ResolvedSubject {
  void view; void bundle; void me; void settings
  return todo('objectives.resolveSubject')
}

/** True when the model can carry out O at all (skill, Subject present, item not already held) (CH p13). */
export function canDoObjective(view: AiView, bundle: EditionBundle, me: ModelState, settings: AiSettings, subject: ResolvedSubject): boolean {
  void view; void bundle; void me; void settings; void subject
  return todo('objectives.canDoObjective')
}

/** The model's initial deployment point, the Fall Back Subject (CH p13). Needs the engine hook tokens/deployment. */
export function deploymentPointOf(view: AiView, me: ModelState): ResolvedSubject {
  void view; void me
  return todo('objectives.deploymentPointOf')
}
