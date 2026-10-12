// AI Web Worker host (spec 30 s11). The edition bundle loads inside the worker once; the main thread posts the seat's
// view, the open decision and the legal answers, and gets an action back, so a slow decision never blocks rendering.
// Messages: init -> ready; decide {id, view, pending, legal, tier, seed, memoryKey, budgetMs?} ->
// action {id, action, ms, fallback} | error {id, message}. handleRequest is the pure core (node tests call it).
// Client wiring (owner W): src/client/bot/aiWorkerClient.ts posts here and installs the result with setBotBrain.
import type { EditionBundle } from '../data/types'
import type { Action, PendingDecision, PlayerView } from '../engine/types'
import { createAiDecider, type AiDecider } from './decider'
import type { Tier } from './types'

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'decide'; id: number; view: PlayerView; pending: PendingDecision; legal: Action[]; tier: Tier; seed: string; memoryKey: string; budgetMs?: number }
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'action'; id: number; action: Action; ms: number; fallback: boolean }
  | { type: 'error'; id: number; message: string }

const MAX_DECIDERS = 8
const deciders = new Map<string, AiDecider>()

/** Answer one request with the bundle loaded by the host. Deciders (and their memory) are kept per memoryKey + tier. */
export function handleRequest(req: WorkerRequest, bundle: EditionBundle): WorkerResponse | null {
  if (req.type === 'init') return { type: 'ready' }
  if (req.type !== 'decide') return null
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    const key = `${req.memoryKey}:${req.tier}`
    let d = deciders.get(key)
    if (!d) {
      if (deciders.size >= MAX_DECIDERS) deciders.clear()
      d = createAiDecider(req.tier, { seed: req.seed, bundle, ...(req.budgetMs ? { budgetMs: req.budgetMs } : {}) })
      deciders.set(key, d)
    }
    const { action, fallback } = d.decideSync(req.view, req.pending, req.legal)
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    return { type: 'action', id: req.id, action, ms, fallback }
  } catch (e) {
    return { type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Forget every decider (new game). */
export function resetWorkerDeciders(): void { deciders.clear() }

// Worker wiring: only when this module runs as a dedicated worker (not under node or the main thread).
type WorkerScope = { onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null; postMessage(m: WorkerResponse): void }
const isWorker = typeof self !== 'undefined' && typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
if (isWorker) {
  const scope = self as unknown as WorkerScope
  let bundle: Promise<EditionBundle> | null = null
  const load = () => (bundle ??= import('../data/index').then((m) => m.edition()))
  scope.onmessage = (ev) => {
    void load().then((b) => {
      const res = handleRequest(ev.data, b)
      if (res) scope.postMessage(res)
    }).catch((e: unknown) => {
      const id = ev.data.type === 'decide' ? ev.data.id : -1
      scope.postMessage({ type: 'error', id, message: e instanceof Error ? e.message : String(e) })
    })
  }
}
