// Per-decision controllers (owner I). Pure-ish functions over the interaction store and the contract; the R3F layer only
// forwards pointer events here. Everything submits through contract game.submit with an action taken from the open
// decision's own options (legal answers), never an invented one.
import type { DecisionOption, ModelId, ModelState, PendingDecision, Vec2 } from '../../engine/types'
import { colourFor, game, type ClientRejection } from '../contract'
import { cancelOption, clampAlong, dist, pathModelId, pathOption, pickables, typingTarget } from './helpers'
import { ix, useInteractionStore, type Ghost } from './store'

/** Latest open decision and presented models, pushed in by the scene bridge (contract exposes these only as hooks). */
let ctx: { pending: PendingDecision | null; models: Record<ModelId, ModelState> | null } = { pending: null, models: null }
export const setCtx = (pending: PendingDecision | null, models: Record<ModelId, ModelState> | null): void => { ctx = { pending, models } }
export const currentPending = (): PendingDecision | null => ctx.pending

/** Can the table be clicked or dragged to answer the open decision? */
export const canPlaceOnTable = (): boolean => pathOption(ctx.pending) !== null

/** Dry-run a path answer to `pt`; the ghost shows where the engine would put the model, clamped to the farthest legal point. */
export function computeGhost(pt: Vec2): Ghost | null {
  const p = ctx.pending
  const opt = pathOption(p)
  const id = pathModelId(p, opt)
  const model = id !== null && ctx.models ? ctx.models[id] : undefined
  if (!p || !opt || !model) return null
  const from = model.pos
  const answer = (q: Vec2) => game.preview({ ...opt.action, path: [q] })
  const c = clampAlong(from, pt, (q) => answer(q).ok)
  if (!c.moved) {
    const r = answer(pt)
    return { pos: from, from, asked: from, ok: false, travel: 0, colourNeeded: null, detail: r.ok ? undefined : r.rejection.text }
  }
  const r = answer(c.pos)
  const end = r.ok ? r.state.models[id!]?.pos ?? c.pos : c.pos
  const travel = dist(from, end)
  return { pos: end, from, asked: c.pos, ok: r.ok, travel, colourNeeded: colourFor(travel) }
}

/** Commit the ghost as the path answer. */
export function commitGhost(g: Ghost | null): ClientRejection | null {
  const opt = pathOption(ctx.pending)
  if (!g || !g.ok || !opt) return null
  const r = game.submit({ ...opt.action, path: [g.asked] })
  if (!r) ix.resetPrompt()
  return r
}

/** A click on a model: select, aim or open the chooser, as the open decision allows. */
export function clickModel(id: ModelId): ClientRejection | null {
  const pick = pickables(ctx.pending).get(id)
  if (!pick) { ix.setSelected(id); return null }
  ix.setSelected(id)
  if (pick.immediate && pick.options.length === 1) return submitOption(pick.options[0]!)
  // Several answers for one model (short or long band, several weapons) or a menu entry that deserves a confirm.
  ix.setChoice({ targetId: id, options: pick.options })
  return null
}

export function submitOption(o: DecisionOption): ClientRejection | null {
  ix.setChoice(null)
  return game.choose(o.id)
}

/** Keys: M ruler, L line of sight, Esc cancel (local state first, then the decision's own cancel). Returns true when handled. */
export function onKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown }): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || typingTarget((e.target as { tagName?: string } | null) ?? null)) return false
  const s = useInteractionStore.getState()
  switch (e.key.toLowerCase()) {
    case 'm': ix.toggleMeasure(); return true
    case 'l': ix.toggleLos(); return true
    case 'escape': {
      if (s.drag) { ix.endDrag(); ix.setGhost(null); return true }
      if (s.choice) { ix.setChoice(null); return true }
      if (s.ghost) { ix.setGhost(null); return true }
      if (s.measure || s.los) { useInteractionStore.setState({ measure: false, los: false }); return true }
      const c = cancelOption(ctx.pending)
      if (c) { game.submit(c); return true }
      return false
    }
    default: return false
  }
}
