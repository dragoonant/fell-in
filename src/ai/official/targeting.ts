// Targets and weapons (spec 18 s2.1, s3.3, s3.7; CH p11-14; ERR p.16). Numbers come from engine query.*.
import type { AiCardDef, EditionBundle } from '../../data/types'
import { todo } from '../../engine/registry'
import type { Id, ModelState, Vec2 } from '../../engine/types'
import type { AiView } from '../types'
import type { AiMethod, ResolvedCell, TargetRanking } from './types'

/** What the candidate set is being ranked for: Nearest means fewest Moves for movement, shortest shot for shooting. */
export type RankFor = 'move' | 'shoot' | 'close'

/**
 * Enemy models this model may target with the Method: on table, not removed; Careful drops engaged enemies for
 * Ranged (CH p10, p12). Objects are never returned (they are targeted only through O, spec 18 s8.5).
 */
export function validTargets(view: AiView, bundle: EditionBundle, me: ModelState, cell: ResolvedCell): ModelState[] {
  void view; void bundle; void me; void cell
  return todo('targeting.validTargets')
}

/**
 * Rank candidates by the card's priority list (CH p12): preferFirst class pass (ERR p.16), the last-AI-model Subject
 * rule, then each priority as a tie-breaker; Careful close combat prefers engaged enemies at every step (CH p11).
 * Leftover ties are broken with `pickTie`, whose seed key is recorded in the ranking.
 */
export function rankTargets(
  view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, cell: ResolvedCell,
  candidates: readonly ModelState[], rankFor: RankFor, subjectIds: readonly Id[], pickTie: (among: Id[], key: string) => Id,
): TargetRanking {
  void view; void bundle; void me; void card; void cell; void candidates; void rankFor; void subjectIds; void pickTie
  return todo('targeting.rankTargets')
}

/** The enemy this model would attack if it stood unengaged at `at` (Defend, CH p14). */
export function defendThreat(
  view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, cell: ResolvedCell, at: Vec2,
  pickTie: (among: Id[], key: string) => Id,
): TargetRanking {
  void view; void bundle; void me; void card; void cell; void at; void pickTie
  return todo('targeting.defendThreat')
}

/**
 * Weapon for the Method (CH p11; ERR p.16): the preferred one (`pref:<id>` note) if usable, else another that can
 * perform the Method, the Improvised Weapon last; null = no attack possible.
 */
export function chooseWeapon(view: AiView, bundle: EditionBundle, me: ModelState, card: AiCardDef, method: AiMethod): Id | null {
  void view; void bundle; void me; void card; void method
  return todo('targeting.chooseWeapon')
}
